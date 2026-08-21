'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  MathTrigger,
  MessageBar,
  Modal,
  Button,
  Card,
  CardHeader,
  CollapsibleCard,
  Inputs,
  NumberField,
  Results,
  Select,
  SegmentedControl,
  StatCard,
  ToolLayout,
  type Severity,
  type StatTone,
} from '@/components/ui'
import {
  BlendStepsTable,
  MixReadout,
} from '@/components/blender/BlendStepsTable'
import {
  DEFAULT_SUPPLY_DRAFTS,
  SupplyGasEditor,
  isDraftValid,
  toSupplies,
  type SupplyDraft,
} from '@/components/blender/SupplyGasEditor'
import { planBlend, type BlendPlan, type EquationOfState } from '@/lib/blending'
import { blendDerivation } from '@/lib/recommendations/consumptionMath'
import { densityAtDepth, formatMix, gas, type GasFractions } from '@/lib/gas'
import { operatingDepth } from '@/lib/operatingDepth'
import { normalizeSafetyLimits } from '@/lib/limits'
import { roundDensity } from '@/lib/rounding'
import { tankSpecifications } from '@/data/tankSpecifications'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useUnitConversion } from '@/hooks/useUnitConversion'

/** Fill-station gas temperature bounds, °C. Slow fills sit near ambient; fast ones run hot. */
const MIN_TEMP_C = -10
const MAX_TEMP_C = 60

interface CylinderState {
  o2Percent: number
  hePercent: number
  pressureBar: number
}

/**
 * True when a pair of percentages describes a mixture the planner will accept.
 * Guards `gas()`, which throws rather than clamping.
 */
function validPair(o2Percent: number, hePercent: number): boolean {
  return (
    Number.isFinite(o2Percent) &&
    Number.isFinite(hePercent) &&
    o2Percent >= 0 &&
    hePercent >= 0 &&
    o2Percent + hePercent <= 100
  )
}

function mixOf(o2Percent: number, hePercent: number): GasFractions {
  return gas(o2Percent / 100, hePercent / 100)
}

/**
 * Gas blender.
 *
 * Rebuilt on the Phase 1 blend planner (`src/lib/blending.ts`), which solves the
 * fill in mole space over arbitrary supply mixtures. Three things the previous
 * UI could not express are now first-class:
 *
 * 1. **Infeasibility.** The old blender clamped negative requirements to zero
 *    and then reported the target mix as the result, so a blend that could not
 *    be made looked successful. The planner returns `feasible: false` with the
 *    reason, and this page leads with it.
 * 2. **Drains.** When the cylinder is richer than the target in any species the
 *    planner emits an explicit drain step to a computed pressure; that pressure
 *    is shown in the procedure and repeated in a banner, because it is the one
 *    irreversible action in the sequence.
 * 3. **Banked mixtures.** Supplies are full compositions rather than a scalar
 *    purity, so blending from banked nitrox or trimix works and the nitrogen
 *    that comes with it is credited to the cylinder.
 *
 * All arithmetic lives in `src/lib`; this component only chooses inputs,
 * formats output and maps warning severities onto banners.
 */
/** KaTeX loads only when a blender asks for the working. */
const MathSteps = dynamic(() => import('@/components/mix/MathSteps'), {
  ssr: false,
  loading: () => <p className="text-sm text-text-muted">Rendering the math…</p>,
})

export default function GasBlender() {
  const { preferences } = usePreferences()
  const {
    convertPressure,
    convertTemperature,
    convertVolume,
    convertDepth,
    convertDensity,
    getUnitLabels,
  } = useUnitConversion()
  const unitLabels = getUnitLabels()
  const limits = useMemo(() => normalizeSafetyLimits(preferences), [preferences])

  const [target, setTarget] = useState({ o2Percent: 32, hePercent: 0 })
  const [targetPressureBar, setTargetPressureBar] = useState(200)
  const [current, setCurrent] = useState<CylinderState>({
    o2Percent: 21,
    hePercent: 0,
    pressureBar: 0,
  })
  const [tankId, setTankId] = useState('al80-metric')
  const [temperatureC, setTemperatureC] = useState(20)
  const [mathOpen, setMathOpen] = useState(false)
  const [eos, setEos] = useState<EquationOfState>('ideal')
  const [supplies, setSupplies] = useState<SupplyDraft[]>(DEFAULT_SUPPLY_DRAFTS)
  const [showSupplies, setShowSupplies] = useState(false)

  const tanks = useMemo(
    () => [...preferences.customTanks, ...tankSpecifications],
    [preferences.customTanks]
  )
  const tank = tanks.find((t) => t.id === tankId) ?? tanks[0]
  const tankVolumeL = tank?.waterVolumeL ?? 11.1

  // --- Input validity ------------------------------------------------------
  const targetValid = validPair(target.o2Percent, target.hePercent)
  const currentValid = validPair(current.o2Percent, current.hePercent)
  const suppliesValid = supplies.some((d) => d.enabled && isDraftValid(d))
  const inputsValid = targetValid && currentValid && suppliesValid && targetPressureBar > 0

  // --- The plan ------------------------------------------------------------
  const { plan, planError } = useMemo((): {
    plan: BlendPlan | null
    planError: string | null
  } => {
    if (!inputsValid) return { plan: null, planError: null }
    try {
      return {
        plan: planBlend({
          target: mixOf(target.o2Percent, target.hePercent),
          targetPressureBar,
          current: mixOf(current.o2Percent, current.hePercent),
          currentPressureBar: current.pressureBar,
          tankVolumeL,
          temperatureC,
          eos,
          supplies: toSupplies(supplies),
        }),
        planError: null,
      }
    } catch (err) {
      return { plan: null, planError: err instanceof Error ? err.message : String(err) }
    }
  }, [
    inputsValid,
    target.o2Percent,
    target.hePercent,
    targetPressureBar,
    current.o2Percent,
    current.hePercent,
    current.pressureBar,
    tankVolumeL,
    temperatureC,
    eos,
    supplies,
  ])

  const derivation = useMemo(
    () =>
      plan
        ? blendDerivation({
            startMix: mixOf(current.o2Percent, current.hePercent),
            startPressureBar: current.pressureBar,
            targetMix: mixOf(target.o2Percent, target.hePercent),
            targetPressureBar,
            finalMix: plan.finalMix,
            finalPressureBar: plan.finalPressureBar,
            steps: plan.steps,
            eos: plan.eos,
            compressibilityFactor: plan.finalCompressibilityFactor,
            temperatureC,
          })
        : null,
    [plan, current, target, targetPressureBar, temperatureC]
  )

  const drainStep = plan?.steps.find((s) => s.addPressureBar < 0)

  // --- Formatting ----------------------------------------------------------
  const pressureUnit = unitLabels.pressure
  /** A bar figure in the diver's unit, bare. */
  const fmtPressure = (bar: number) => convertPressure(bar, 0).value.toFixed(0)
  /** A bar figure in the diver's unit, with the unit attached. */
  const fmtPressureUnit = (bar: number) => `${fmtPressure(bar)} ${pressureUnit}`

  // --- Properties of the gas the plan actually produces ---------------------
  //
  // When the target is unreachable the planner returns the target as
  // `finalMix` so callers always receive a normalised mixture, and signals the
  // truth through `feasible: false` and a zero final pressure. Showing that
  // mixture as a result would repeat exactly the lie the old blender told, so
  // there is no result to display in that case.
  const noResult = plan !== null && !plan.feasible && plan.finalPressureBar <= 0
  const finalMix = plan && !noResult ? plan.finalMix : null
  // The depth the blended gas may actually be taken to, not its oxygen MOD.
  // A blender who mixes air and reads "MOD 56 m" is being told something the
  // narcosis and density limits both contradict.
  const resultOperating =
    finalMix && finalMix.o2 > 0
      ? operatingDepth(finalMix, limits, {
          ceilingPPO2: limits.maxPPO2Work,
          temperatureC,
        })
      : null
  const resultMod = resultOperating ? resultOperating.depthMeters : null
  const resultDensityAtMod =
    finalMix && resultMod !== null
      ? roundDensity(densityAtDepth(finalMix, resultMod, temperatureC))
      : null

  const densityTone: StatTone =
    resultDensityAtMod === null
      ? 'none'
      : resultDensityAtMod > limits.maxGasDensityCritical
        ? 'danger'
        : resultDensityAtMod > limits.maxGasDensity
          ? 'warning'
          : 'none'

  // --- Banners -------------------------------------------------------------
  // Built inline rather than memoised: it is a handful of string pushes, and
  // the memo would have to depend on every formatter it calls.
  const banners = ((): {
    id: string
    severity: Severity
    title?: string
    message: string
  }[] => {
    const items: { id: string; severity: Severity; title?: string; message: string }[] = []

    if (!targetValid) {
      items.push({
        id: 'target-invalid',
        severity: 'danger',
        title: 'Target is not a gas',
        message: 'Target O₂ + He exceeds 100%. Reduce one of them before the plan can be solved.',
      })
    }
    if (!currentValid) {
      items.push({
        id: 'current-invalid',
        severity: 'danger',
        title: 'Cylinder contents are not a gas',
        message:
          'The current O₂ + He exceeds 100%. Enter what the analyser actually read.',
      })
    }
    if (!suppliesValid) {
      items.push({
        id: 'no-supplies',
        severity: 'danger',
        title: 'No supply gas',
        message:
          'At least one bank must be connected and hold a valid mixture before a fill can be planned.',
      })
    }
    if (planError) {
      items.push({
        id: 'plan-error',
        severity: 'danger',
        title: 'Cannot plan this fill',
        message: planError,
      })
    }

    for (const [i, w] of (plan?.warnings ?? []).entries()) {
      // The planner writes its messages in bar, which is the unit it computes
      // in. The drain pressure is the one figure a diver acts on directly, so
      // it is restated here in their unit rather than shown twice in two units.
      if (w.type === 'drain-required' && drainStep) {
        items.push({
          id: `w-${i}-drain`,
          severity: w.severity,
          title: 'Drain first',
          message: `Drain the cylinder to ${fmtPressureUnit(drainStep.totalPressureBar)} before adding anything. It currently holds more of at least one gas than the target allows, and gas cannot be removed by filling.`,
        })
        continue
      }
      items.push({ id: `w-${i}-${w.type}`, severity: w.severity, message: w.message })
    }

    if (plan && !plan.feasible && !plan.warnings.some((w) => w.type === 'infeasible')) {
      items.push({
        id: 'not-reached',
        severity: 'danger',
        title: 'Target not reached',
        message:
          'The steps below are the closest this bank can get. Analyse the cylinder and label it with what it actually contains, not the target.',
      })
    }

    return items
  })()

  const pressureMax = Math.round(convertPressure(400, 0).value)
  const pressureStep = pressureUnit === 'psi' ? 50 : 5

  /**
   * Pressure fields are edited in the diver's unit but held in bar, which is
   * what the planner takes. Converting on the way in and out rather than
   * storing display units keeps a unit switch from silently reinterpreting a
   * number the diver already entered.
   */
  const pressureFieldValue = (bar: number) => Math.round(convertPressure(bar, 0).value)
  const pressureFieldToBar = (display: number) =>
    pressureUnit === 'psi' ? display / 14.5037738 : display

  const tempFieldValue = Math.round(convertTemperature(temperatureC, 0).value)
  const tempFieldToC = (display: number) =>
    unitLabels.temperature === '°F' ? ((display - 32) * 5) / 9 : display
  const tempMin = Math.round(convertTemperature(MIN_TEMP_C, 0).value)
  const tempMax = Math.round(convertTemperature(MAX_TEMP_C, 0).value)

  const targetMix = targetValid ? mixOf(target.o2Percent, target.hePercent) : null

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-h3 font-semibold text-text">Gas blender</h2>
        <p className="text-sm text-text-muted">Partial-pressure fill procedure from the gases you actually have.</p>
      </header>


      {/* Results pin: the fill procedure is short while the inputs run long,
          so the diver can watch the blend update as they change a bank. */}
      <ToolLayout ratio="balanced">
        {/* ---------------------------------------------------------------- */}
        {/* Inputs                                                            */}
        {/* ---------------------------------------------------------------- */}
        <Inputs className="min-w-0">
          <Card panel="input">
            <CardHeader
              title="Target"
              description="The mix and pressure you want in the cylinder when the fill is done."
            />
            <div className="grid grid-cols-1 gap-3 min-[1180px]:grid-cols-2">
              <NumberField
                label="O₂"
                unit="%"
                value={target.o2Percent}
                onChange={(v) => setTarget((t) => ({ ...t, o2Percent: v }))}
                min={0}
                max={100}
                step={1}
                error={targetValid ? undefined : 'O₂ + He > 100%'}
              />
              <NumberField
                label="He"
                unit="%"
                value={target.hePercent}
                onChange={(v) => setTarget((t) => ({ ...t, hePercent: v }))}
                min={0}
                max={100}
                step={1}
              />
            </div>
            <div className="mt-3">
              <NumberField
                label="Fill pressure"
                unit={pressureUnit}
                value={pressureFieldValue(targetPressureBar)}
                onChange={(v) => setTargetPressureBar(pressureFieldToBar(v))}
                min={1}
                max={pressureMax}
                step={pressureStep}
                hint={
                  tank
                    ? `${tank.name} is stamped ${convertPressure(tank.workingPressureBar, 0).formatted}.`
                    : undefined
                }
              />
            </div>
            {targetMix && (
              <p className="mt-3 text-sm text-text-muted">
                Target is{' '}
                <span className="font-mono tnum font-semibold text-text">
                  {formatMix(targetMix)}
                </span>{' '}
                — <MixReadout mix={targetMix} />
              </p>
            )}
          </Card>

          <Card panel="input">
            <CardHeader
              title="Cylinder now"
              description="What the analyser reads and what the gauge shows before you start."
            />
            {/* `min-w-0` on both the shell and the control: a native select's
                intrinsic width is its widest option, which otherwise pushes the
                whole grid past the viewport on a phone. */}
            <Select
              label="Cylinder"
              value={tank?.id ?? ''}
              onChange={(e) => setTankId(e.target.value)}
              hint={`Water volume ${convertVolume(tankVolumeL, 1).formatted}.`}
              containerClassName="min-w-0"
              className="min-w-0"
            >
              {tanks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <div className="mt-3 grid grid-cols-1 gap-3 min-[1180px]:grid-cols-2">
              <NumberField
                label="O₂"
                unit="%"
                value={current.o2Percent}
                onChange={(v) => setCurrent((c) => ({ ...c, o2Percent: v }))}
                min={0}
                max={100}
                step={1}
                error={currentValid ? undefined : 'O₂ + He > 100%'}
              />
              <NumberField
                label="He"
                unit="%"
                value={current.hePercent}
                onChange={(v) => setCurrent((c) => ({ ...c, hePercent: v }))}
                min={0}
                max={100}
                step={1}
              />
            </div>
            <div className="mt-3">
              <NumberField
                label="Residual pressure"
                unit={pressureUnit}
                value={pressureFieldValue(current.pressureBar)}
                onChange={(v) => setCurrent((c) => ({ ...c, pressureBar: pressureFieldToBar(v) }))}
                min={0}
                max={pressureMax}
                step={pressureStep}
                hint="Zero for an evacuated cylinder."
              />
            </div>
          </Card>

          {/* Collapsed by default: the banks and equation of state are set up
              once for a fill station and then left alone, but expanded they
              were 420px of the input column — most of what pushed the blend
              procedure off the fold. */}
          <CollapsibleCard
            panel="input"
            title="Fill station"
            description="Which banks are connected, and how the gas behaves while you fill."
            summary={`${supplies.length} banks · ${eos === 'vdw' ? 'van der Waals' : 'ideal gas'}`}
          >
            <div className="mb-3 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSupplies((v) => !v)}
                aria-expanded={showSupplies}
              >
                {showSupplies ? 'Hide banks' : 'Edit banks'}
              </Button>
            </div>

            {!showSupplies && (
              <ul className="mb-4 space-y-1 text-sm">
                {supplies.map((d) => (
                  <li key={d.id} className="flex items-baseline justify-between gap-3">
                    <span className={d.enabled ? 'text-text' : 'text-text-subtle line-through'}>
                      {d.name || 'Unnamed gas'}
                    </span>
                    {isDraftValid(d) ? (
                      <MixReadout mix={mixOf(d.o2Percent, d.hePercent)} />
                    ) : (
                      <span className="text-xs text-danger">invalid</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {showSupplies && (
              <div className="mb-4">
                <SupplyGasEditor drafts={supplies} onChange={setSupplies} />
              </div>
            )}

            <NumberField
              label="Gas temperature"
              unit={unitLabels.temperature}
              value={tempFieldValue}
              onChange={(v) => setTemperatureC(tempFieldToC(v))}
              min={tempMin}
              max={tempMax}
              step={1}
              hint="A fast fill runs hot; the cylinder loses pressure as it cools."
            />

            <div className="mt-4">
              <SegmentedControl
                label="Equation of state"
                tone="brand"
                value={eos}
                onChange={setEos}
                options={[
                  { value: 'ideal', label: 'Ideal gas' },
                  { value: 'vdw', label: 'Van der Waals' },
                ]}
              />
              <p className="mt-1.5 text-xs text-text-subtle">
                Real-gas corrections matter above roughly 200 bar. The planner falls back to
                the ideal gas law, and says so, where van der Waals is not meaningful.
              </p>
            </div>
          </CollapsibleCard>
        </Inputs>

        {/* ---------------------------------------------------------------- */}
        {/* Results                                                           */}
        {/* ---------------------------------------------------------------- */}
        <Results sticky className="min-w-0">
          {derivation && <MathTrigger onClick={() => setMathOpen(true)} />}

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Resulting mix"
              value={finalMix ? formatMix(finalMix) : '—'}
              tone={plan === null ? 'none' : plan.feasible ? 'accent' : 'danger'}
              hint={
                finalMix ? (
                  <MixReadout mix={finalMix} />
                ) : noResult ? (
                  'No fill reaches this target'
                ) : (
                  'O₂ / He / N₂ once the steps are done'
                )
              }
            />
            <StatCard
              label="Final pressure"
              value={plan && !noResult ? fmtPressure(plan.finalPressureBar) : '—'}
              unit={plan && !noResult ? pressureUnit : undefined}
              hint={
                plan
                  ? `Target ${fmtPressureUnit(targetPressureBar)}`
                  : 'Where the fill stops'
              }
            />
            <StatCard
              label="Max depth"
              value={resultMod === null ? '—' : convertDepth(resultMod, 0).value.toFixed(0)}
              unit={unitLabels.depth}
              hint={
                resultOperating === null
                  ? `at ppO₂ ${limits.maxPPO2Work.toFixed(2)}`
                  : resultOperating.limitedBy === 'oxygen'
                    ? `at ppO₂ ${limits.maxPPO2Work.toFixed(2)}`
                    : resultOperating.limitedBy === 'narcosis'
                      ? `Set by END, not oxygen`
                      : `Set by density, not oxygen`
              }
            />
            <StatCard
              label="Density at MOD"
              value={
                resultDensityAtMod === null
                  ? '—'
                  : convertDensity(resultDensityAtMod, 2).value.toFixed(2)
              }
              unit={unitLabels.density}
              tone={densityTone}
              hint={`limit ${convertDensity(limits.maxGasDensity, 2).formatted}`}
            />
          </div>

          <Card>
            <CardHeader
              title="Blend procedure"
              description={
                drainStep
                  ? `Drain to ${fmtPressure(drainStep.totalPressureBar)} ${pressureUnit} first — the cylinder is richer than the target in at least one gas.`
                  : 'Add each gas in order, stopping at the running total.'
              }
            />
            {plan ? (
              <BlendStepsTable
                steps={plan.steps}
                formatPressure={fmtPressure}
                pressureUnit={pressureUnit}
              />
            ) : (
              <p className="rounded-md border border-border bg-surface-1 px-3 py-6 text-center text-sm text-text-subtle">
                Enter a target the banks can reach and the procedure appears here.
              </p>
            )}

            {plan && (
              <p className="mt-4 text-xs text-text-subtle">
                Solved with the{' '}
                {plan.eos === 'vdw' ? 'van der Waals' : 'ideal gas'} equation of state at{' '}
                {convertTemperature(temperatureC, 0).formatted}
                {plan.eos === 'vdw' && plan.finalCompressibilityFactor
                  ? ` — compressibility factor Z = ${plan.finalCompressibilityFactor.toFixed(3)} at the final state`
                  : ''}
                . Analyse the cylinder before diving; a plan is not an analysis.
              </p>
            )}
          </Card>
        </Results>
      </ToolLayout>

      <Modal
        isOpen={mathOpen}
        onClose={() => setMathOpen(false)}
        title={derivation?.title ?? ''}
        description="In bar and litres — the units the mass balance is written in. A blend is conserved quantity, not conserved pressure."
        size="xl"
      >
        {derivation && <MathSteps derivation={derivation} columns />}
      </Modal>

      <MessageBar
        items={[
          ...banners,
          // How the fill order and bank preference work. Standing reference
          // rather than a choice made on this screen.
          {
            id: 'fill-order',
            severity: 'info' as const,
            title: 'Fill order',
            message:
              'Helium, then oxygen, then the diluent top-off. Where more than one combination of banks reaches the target, the planner draws from the banks listed first.',
          },
        ]}
      />
    </div>
  )
}

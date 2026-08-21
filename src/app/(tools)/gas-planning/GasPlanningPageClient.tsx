'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  MessageBar,
  Card,
  CardHeader,
  CollapsibleCard,
  MathTrigger,
  Modal,
  Inputs,
  NumberField,
  Results,
  SegmentedControl,
  StatCard,
  ToolLayout,
  Table,
  type Severity,
} from '@/components/ui'
import { CylinderField, CUSTOM_CYLINDER } from '@/components/consumption/CylinderField'
import { useUnitConversion } from '@/hooks/useUnitConversion'
import { usePreferences } from '@/contexts/PreferencesContext'
import {
  barToLiters,
  litersToBar,
  minimumGasBreakdown,
  planBottomTime,
  usableFraction,
  type GasPlanningRule,
} from '@/lib/consumption'
import { minimumGasDerivation } from '@/lib/recommendations/consumptionMath'
import type { TankSpecification } from '@/data/tankSpecifications'

const EM_DASH = '—'

/**
 * The travel rates `planBottomTime` applies when none are supplied. Repeated
 * here only to label the budget rows; the calculation itself uses its own
 * defaults, which these mirror.
 */
const DESCENT_RATE_M_PER_MIN = 20
const ASCENT_RATE_M_PER_MIN = 9

/** The reserve strategies the calculation library supports. */
const RULES: {
  value: GasPlanningRule
  label: string
  description: string
}[] = [
  {
    value: 'all-usable',
    label: 'Open water',
    description: 'Two thirds usable, one third held back. Direct ascent available.',
  },
  {
    value: 'halves',
    label: 'Halves',
    description: 'Half out, half back. A required return to the entry point.',
  },
  {
    value: 'thirds',
    label: 'Thirds',
    description: 'One third out, one third back, one third untouched. Overhead standard.',
  },
]

/** KaTeX loads only when a diver asks for the working. */
const MathSteps = dynamic(() => import('@/components/mix/MathSteps'), {
  ssr: false,
  loading: () => <p className="text-sm text-text-muted">Rendering the math…</p>,
})

export default function GasPlanningPageClient() {
  const {
    convertPressure,
    convertDepth,
    convertVolume,
    parsePressureInput,
    parseDepthInput,
    parseVolumeInput,
    getUnitLabels,
    preferences: unitPrefs,
  } = useUnitConversion()
  const { preferences } = usePreferences()

  const units = getUnitLabels()
  const metric = unitPrefs.system === 'metric'
  const volumePrecision = metric ? 1 : 2

  /** Canonical units throughout — bar, metres, litres — converted for display. */
  const [mathOpen, setMathOpen] = useState(false)
  const [rmvLitersPerMin, setRmvLitersPerMin] = useState(15)
  const [maxDepthM, setMaxDepthM] = useState(30)
  const [startPressureBar, setStartPressureBar] = useState(200)
  const [waterVolumeL, setWaterVolumeL] = useState(11.1)
  const [cylinderId, setCylinderId] = useState('al80-metric')
  const [cylinderName, setCylinderName] = useState('AL80')
  const [rule, setRule] = useState<GasPlanningRule>('all-usable')

  const rmvDisplay = convertVolume(rmvLitersPerMin, volumePrecision)
  const depthDisplay = convertDepth(maxDepthM, 0)
  const startDisplay = convertPressure(startPressureBar, 0)
  const waterVolumeDisplay = convertVolume(waterVolumeL, volumePrecision)

  const descentRateLabel = `${convertDepth(DESCENT_RATE_M_PER_MIN, 0).formatted}/min`
  const ascentRateLabel = `${convertDepth(ASCENT_RATE_M_PER_MIN, 0).formatted}/min`

  const handleCylinder = (id: string, tank?: TankSpecification) => {
    setCylinderId(id)
    if (tank) {
      setWaterVolumeL(tank.waterVolumeL)
      setCylinderName(tank.name)
      setStartPressureBar(tank.workingPressureBar)
    } else {
      setCylinderName('Custom')
    }
  }

  const plan = useMemo(() => {
    try {
      return planBottomTime({
        maxDepthMeters: maxDepthM,
        rmvLitersPerMin,
        tankVolumeL: waterVolumeL,
        startPressureBar,
        rule,
      })
    } catch {
      return null
    }
  }, [maxDepthM, rmvLitersPerMin, waterVolumeL, startPressureBar, rule])

  /** Rock bottom: what two divers need to get up together from depth. */
  const minGas = useMemo(() => {
    try {
      const breakdown = minimumGasBreakdown(maxDepthM, rmvLitersPerMin)
      return {
        liters: breakdown.total,
        bar: litersToBar(breakdown.total, waterVolumeL),
        breakdown,
      }
    } catch {
      return null
    }
  }, [maxDepthM, rmvLitersPerMin, waterVolumeL])

  const derivation = useMemo(
    () =>
      minGas
        ? minimumGasDerivation({
            maxDepthMeters: maxDepthM,
            rmvLitersPerMin,
            // The library's defaults, restated so the derivation shows the
            // numbers actually used rather than assuming them.
            stressMultiplier: 2,
            problemSolvingMinutes: 1,
            ascentRateMPerMin: 9,
            atDepthLiters: minGas.breakdown.atDepth,
            ascentLiters: minGas.breakdown.duringAscent,
            totalLiters: minGas.liters,
            tankVolumeL: waterVolumeL,
            minimumGasBar: minGas.bar,
          })
        : null,
    [minGas, maxDepthM, rmvLitersPerMin, waterVolumeL]
  )

  const totalGasLiters = useMemo(() => {
    try {
      return barToLiters(startPressureBar, waterVolumeL)
    } catch {
      return null
    }
  }, [startPressureBar, waterVolumeL])

  /**
   * Minimum gas is a *floor* on what must remain, and the planning rule sets a
   * *ceiling* on what may be spent. Whichever bites first is the real turn
   * pressure, so both are shown and the binding one is called out.
   */
  const minGasBindsFirst =
    plan !== null && minGas !== null && minGas.bar > plan.turnPressureBar

  const warnings = useMemo(() => {
    const items: { id: string; severity: Severity; title: string; message: string }[] = []
    if (!plan || !minGas) return items

    if (minGas.bar >= startPressureBar) {
      items.push({
        id: 'no-dive',
        severity: 'danger',
        title: 'Not enough gas for this dive',
        message: `Minimum gas alone is ${minGas.bar.toFixed(0)} bar of a ${startPressureBar.toFixed(
          0
        )} bar fill. There is no usable gas at ${depthDisplay.formatted} on this cylinder — take a bigger one or a stage.`,
      })
    } else if (minGasBindsFirst) {
      items.push({
        id: 'min-gas-binds',
        severity: 'warning',
        title: 'Minimum gas is the binding limit',
        message: `Rock bottom is ${minGas.bar.toFixed(0)} bar, above the ${plan.turnPressureBar.toFixed(
          0
        )} bar the ${
          rule === 'thirds' ? 'thirds' : rule === 'halves' ? 'halves' : 'reserve'
        } rule gives. Turn on ${minGas.bar.toFixed(0)} bar, not the rule.`,
      })
    }

    if (plan.bottomTimeMinutes <= 0) {
      items.push({
        id: 'no-bottom-time',
        severity: 'danger',
        title: 'No bottom time',
        message:
          'The descent and ascent alone consume the usable gas. Nothing is left for time at depth.',
      })
    } else if (plan.bottomTimeMinutes < 5) {
      items.push({
        id: 'thin-bottom-time',
        severity: 'warning',
        title: 'Very little bottom time',
        message: `Under five minutes at ${depthDisplay.formatted} once travel gas is deducted. Check the cylinder is the right size for this depth.`,
      })
    }

    if (maxDepthM > preferences.maxEND) {
      items.push({
        id: 'narcosis',
        severity: 'info',
        title: 'Past your narcosis limit',
        message: `${depthDisplay.formatted} is deeper than your ${convertDepth(
          preferences.maxEND,
          0
        ).formatted} END limit. This page plans gas volume only — it says nothing about what mix belongs at this depth.`,
      })
    }

    if (startPressureBar > 232) {
      items.push({
        id: 'hp-fill',
        severity: 'info',
        title: 'High-pressure fill',
        message:
          'Contents are computed as pressure times water volume, which assumes ideal gas. A real 300 bar fill holds around 8% less than that, so this plan is slightly optimistic on available gas.',
      })
    }

    items.push({
      id: 'no-deco',
      severity: 'info',
      title: 'Gas only, no decompression',
      message:
        'This is a gas-supply limit, not a no-stop limit. Nothing here checks whether the bottom time it hands you incurs decompression.',
    })

    return items
  }, [
    plan,
    minGas,
    minGasBindsFirst,
    startPressureBar,
    maxDepthM,
    rule,
    preferences.maxEND,
    depthDisplay.formatted,
    convertDepth,
  ])

  const bindingTurnBar = plan
    ? minGasBindsFirst && minGas
      ? minGas.bar
      : plan.turnPressureBar
    : null

  const fmtVol = (liters: number | null | undefined) =>
    liters === null || liters === undefined
      ? EM_DASH
      : convertVolume(liters, metric ? 0 : 1).value.toFixed(metric ? 0 : 1)

  const fmtPressure = (bar: number | null | undefined) =>
    bar === null || bar === undefined ? EM_DASH : convertPressure(bar, 0).value.toFixed(0)

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-h3 font-semibold text-text">Gas planning</h2>
        <p className="text-sm text-text-muted">How long the gas lasts, when to turn, and what must be left in the cylinder.</p>
      </header>

      {/* Results pin: the plan is short beside a long column of controls. */}
      <ToolLayout ratio="balanced">
        <Inputs>
          <Card panel="input">
            <CardHeader title="The dive" description="Depth, cylinder and how you breathe." />
            <div className="space-y-3">
              <NumberField
                label="Your RMV"
                value={Number(rmvDisplay.value.toFixed(volumePrecision))}
                onChange={(v) => setRmvLitersPerMin(parseVolumeInput(v))}
                min={metric ? 4 : 0.15}
                max={metric ? 50 : 1.8}
                step={metric ? 0.5 : 0.02}
                unit={`${units.volume}/min`}
                hint="Surface consumption, not tied to a cylinder."
              />

              <NumberField
                label="Maximum depth"
                value={Number(depthDisplay.value.toFixed(0))}
                onChange={(v) => setMaxDepthM(parseDepthInput(v))}
                min={1}
                max={metric ? 200 : 660}
                step={1}
                unit={units.depth}
              />

              <CylinderField
                value={cylinderId}
                onChange={handleCylinder}
                hint={
                  cylinderId === CUSTOM_CYLINDER
                    ? undefined
                    : `Water volume ${waterVolumeDisplay.formatted}.`
                }
              />

              {cylinderId === CUSTOM_CYLINDER && (
                <NumberField
                  label="Water volume"
                  value={Number(waterVolumeDisplay.value.toFixed(volumePrecision))}
                  onChange={(v) => setWaterVolumeL(parseVolumeInput(v))}
                  min={metric ? 0.5 : 0.02}
                  max={metric ? 60 : 2.2}
                  step={metric ? 0.1 : 0.01}
                  unit={units.volume}
                  hint="Internal water volume of the cylinder."
                />
              )}

              <NumberField
                label="Fill pressure"
                value={Number(startDisplay.value.toFixed(0))}
                onChange={(v) => setStartPressureBar(parsePressureInput(v))}
                min={1}
                max={metric ? 350 : 5100}
                step={metric ? 5 : 50}
                unit={units.pressure}
                hint={
                  totalGasLiters !== null
                    ? `Holds about ${convertVolume(totalGasLiters, 0).formatted} at the surface.`
                    : undefined
                }
              />
            </div>
          </Card>

          <Card panel="input">
            <CardHeader
              title="Reserve strategy"
              description="How much of the fill you are willing to spend."
            />
            {/* Was `layout="stacked"`, which spent a full row per rule for
                three short labels. The note that used to sit under it explained
                why sixths are absent in terms of the calculation library — an
                implementation detail aimed at a developer, on a page a diver
                reads before a dive. */}
            <SegmentedControl
              ariaLabel="Reserve strategy"
              value={rule}
              onChange={setRule}
              options={RULES}
            />
          </Card>
        </Inputs>

        <Results sticky>
          {derivation && <MathTrigger onClick={() => setMathOpen(true)} />}

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label="Bottom time"
              value={plan ? Math.floor(plan.bottomTimeMinutes) : EM_DASH}
              unit="min"
              tone="accent"
              hint={`At ${depthDisplay.formatted}, travel deducted.`}
            />
            <StatCard
              label="Turn pressure"
              value={fmtPressure(bindingTurnBar)}
              unit={units.pressure}
              tone={minGasBindsFirst ? 'warning' : 'none'}
              hint={minGasBindsFirst ? 'Set by minimum gas.' : `Set by the ${rule === 'all-usable' ? 'reserve' : rule} rule.`}
            />
            <StatCard
              label="Minimum gas"
              value={fmtPressure(minGas?.bar)}
              unit={units.pressure}
              tone={minGas && minGas.bar >= startPressureBar ? 'danger' : 'none'}
              hint="Two divers up from depth."
            />
            <StatCard
              label="Runtime"
              value={plan ? Math.round(plan.totalRuntimeMinutes) : EM_DASH}
              unit="min"
              hint="Descent, bottom and ascent."
            />
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label="Usable gas"
              value={fmtVol(plan?.usableGasLiters)}
              unit={units.volume}
              hint={`${Math.round(usableFraction(rule) * 100)}% of the fill.`}
            />
            <StatCard
              label="Travel gas"
              value={fmtVol(plan?.transitGasLiters)}
              unit={units.volume}
              hint="Descent and ascent, at mean depth."
            />
            <StatCard
              label="Min gas volume"
              value={fmtVol(minGas?.liters)}
              unit={units.volume}
              hint="Must remain in the cylinder."
            />
            <StatCard
              label="Rate at depth"
              value={
                plan
                  ? convertVolume(plan.consumptionAtDepthLitersPerMin, metric ? 1 : 2).value.toFixed(
                      metric ? 1 : 2
                    )
                  : EM_DASH
              }
              unit={`${units.volume}/min`}
              hint={`${rmvDisplay.formatted}/min × ambient.`}
            />
          </div>

          {/* The per-phase breakdown behind the headline numbers: useful when
              a plan looks wrong, not on every visit. */}
          <CollapsibleCard
            title="Where the gas goes"
            description={`A ${startDisplay.formatted} fill in a ${cylinderName}, spent.`}
          >
            <Table
              caption="Gas budget"
              hideCaption
              rows={
                plan && minGas && totalGasLiters !== null
                  ? [
                      {
                        id: 'total',
                        phase: 'In the cylinder',
                        note: 'Full fill, surface-equivalent',
                        liters: totalGasLiters,
                        bar: startPressureBar,
                      },
                      {
                        id: 'reserve',
                        phase: 'Held in reserve',
                        note: `${Math.round((1 - usableFraction(rule)) * 100)}% by the rule`,
                        liters: totalGasLiters - plan.usableGasLiters,
                        bar: startPressureBar - litersToBar(plan.usableGasLiters, waterVolumeL),
                      },
                      {
                        id: 'descent',
                        phase: 'Descent',
                        note: `${plan.descentTimeMinutes.toFixed(1)} min at ${descentRateLabel}`,
                        liters: plan.transitGasLiters / 2,
                        bar: litersToBar(plan.transitGasLiters / 2, waterVolumeL),
                      },
                      {
                        id: 'bottom',
                        phase: 'At depth',
                        note: `${Math.floor(plan.bottomTimeMinutes)} min at ${depthDisplay.formatted}`,
                        liters: Math.max(0, plan.usableGasLiters - plan.transitGasLiters),
                        bar: litersToBar(
                          Math.max(0, plan.usableGasLiters - plan.transitGasLiters),
                          waterVolumeL
                        ),
                      },
                      {
                        id: 'ascent',
                        phase: 'Ascent',
                        note: `${plan.ascentTimeMinutes.toFixed(1)} min at ${ascentRateLabel}`,
                        liters: plan.transitGasLiters / 2,
                        bar: litersToBar(plan.transitGasLiters / 2, waterVolumeL),
                      },
                      {
                        id: 'mingas',
                        phase: 'Minimum gas',
                        note: 'Two divers, stressed, from depth',
                        liters: minGas.liters,
                        bar: minGas.bar,
                      },
                    ]
                  : []
              }
              rowKey={(r) => r.id}
              rowSeverity={(r) =>
                r.id === 'mingas' && minGasBindsFirst ? 'warning' : undefined
              }
              emptyMessage="Enter a depth, cylinder and RMV to see the budget."
              columns={[
                { key: 'phase', header: 'Phase', cell: (r) => r.phase },
                {
                  key: 'note',
                  header: 'Detail',
                  cell: (r) => <span className="text-text-muted">{r.note}</span>,
                },
                {
                  key: 'liters',
                  header: units.volume,
                  numeric: true,
                  cell: (r) => fmtVol(r.liters),
                },
                {
                  key: 'bar',
                  header: units.pressure,
                  numeric: true,
                  cell: (r) => fmtPressure(r.bar),
                },
              ]}
            />
            <p className="mt-3 text-xs text-text-subtle">
              Descent and ascent are charged at the mean transit depth, not at maximum depth.
              Charging travel gas at full depth — as the previous calculator did — overstates it
              by around two thirds on a deep dive.
            </p>
          </CollapsibleCard>
        </Results>
      </ToolLayout>

      <Modal
        isOpen={mathOpen}
        onClose={() => setMathOpen(false)}
        title={derivation?.title ?? ''}
        description="In bar, litres and metres — the units the formulas are written in."
        size="xl"
      >
        {derivation && <MathSteps derivation={derivation} columns />}
      </Modal>

      <MessageBar
        items={[
          ...warnings,
          {
            id: 'needs-real-rmv',
            severity: 'info' as const,
            title: 'This needs your real RMV',
            message: (
              <>
                The whole plan scales off one number. A figure from a table is a guess;{' '}
        <Link href="/sac/" className="text-accent underline underline-offset-2">
          measure yours from a logged dive
        </Link>{' '}
        and plan on the worst of several, not the average.
              </>
            ),
          },
        ]}
      />
    </div>
  )
}

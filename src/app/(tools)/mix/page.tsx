'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  MessageBar,
  Card,
  CardHeader,
  Inputs,
  Modal,
  NumberField,
  Results,
  Slider,
  StatCard,
  ToolLayout,
  type Severity,
} from '@/components/ui'
import MixCard from '@/components/mix/MixCard'
import { isTrimixMode } from '@/components/DiveModeToggle'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useUnitConversion } from '@/hooks/useUnitConversion'
import { formatterFor } from '@/lib/units'
import {
  DEFAULT_BOTTOM_TIME_MINUTES,
  generateRecommendations,
  type Recommendation,
  type RecommendationSet,
} from '@/lib/recommendations'

// KaTeX is ~270 kB and is only needed once a diver opens a derivation, so it is
// kept out of the initial bundle. `ssr: false` because it measures DOM nodes.
const MathSteps = dynamic(() => import('@/components/mix/MathSteps'), {
  ssr: false,
  loading: () => <p className="text-sm text-text-muted">Rendering the derivation…</p>,
})

/**
 * Best mix — the optimal gas for a target depth and ppO₂.
 *
 * All arithmetic lives in `@/lib/recommendations`; this component chooses inputs,
 * converts units for display, and lays the results out. Every safety threshold
 * comes from `PreferencesContext` and is passed into the engine as data.
 */
export default function MixPage() {
  const { preferences: prefs } = usePreferences()
  const {
    convertDepth,
    convertDensity,
    parseDepthInput,
    getUnitLabels,
    preferences: unitPrefs,
  } = useUnitConversion()
  const units = getUnitLabels()

  // C1: the engine writes its rationale and warnings in the diver's own units.
  // The formatter is a pure object passed in as data, so `src/lib` keeps no
  // reference to React context.
  const messageUnits = useMemo(() => formatterFor(unitPrefs.depth), [unitPrefs.depth])

  // Dive mode is app-wide chrome state (sidebar footer), not a page input:
  // reading it here rather than copying it into useState is what stops Best
  // mix and MOD check from silently disagreeing about how you are diving.
  const mode = prefs.diveMode

  // The rest are inputs to this page, seeded from the diver's saved defaults.
  const [targetDepth, setTargetDepth] = useState(prefs.defaultTargetMod)
  const [desiredPPO2, setDesiredPPO2] = useState(prefs.defaultDesiredPPO2)
  const [maxEnd, setMaxEnd] = useState(prefs.maxEND)
  const [bottomTime, setBottomTime] = useState(DEFAULT_BOTTOM_TIME_MINUTES)

  const [mathFor, setMathFor] = useState<Recommendation | null>(null)

  // Live recalculation — no Calculate button. The engine is pure arithmetic over
  // a handful of numbers, so there is nothing here worth debouncing.
  const result: RecommendationSet | { error: string } = useMemo(() => {
    try {
      return generateRecommendations(
        {
          mode,
          targetDepthMeters: targetDepth,
          maxEndMeters: maxEnd,
          desiredPPO2,
          bottomTimeMinutes: bottomTime,
          units: messageUnits,
        },
        prefs
      )
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Could not generate a mix.' }
    }
  }, [mode, targetDepth, maxEnd, desiredPPO2, bottomTime, prefs, messageUnits])

  const set = 'error' in result ? null : result
  const bottom = set?.recommendations.find((r) => r.id === 'optimised-bottom')

  // --- Display formatters (metric in, diver's units out) --------------------
  const fmtDepth = (m: number) => {
    const c = convertDepth(m, 0)
    return { value: c.value.toFixed(0), unit: c.unit }
  }
  // ppO₂ is a partial pressure of a gas species, not a cylinder pressure. It is
  // quoted in bar (or the numerically equivalent ata) universally, including by
  // agencies that otherwise teach imperial — a diver setting a 1.4 limit means
  // 1.4 bar whatever their depth units are. It deliberately does not go through
  // `convertPressure`, which would render it as "20 psi".
  const fmtPressure = (bar: number) => ({ value: bar.toFixed(2), unit: 'bar' })

  const fmtDensity = (gl: number) => {
    const c = convertDensity(gl, 2)
    // lb/ft³ values are ~0.06× the g/L figure, so one decimal collapses every
    // realistic density to "0.4". Imperial gets two more places.
    const decimals = c.unit === 'g/L' ? 1 : 3
    return { value: c.value.toFixed(decimals), unit: c.unit }
  }

  // Depth inputs are shown and edited in the diver's units, stored in metres.
  const depthRange = units.depth === 'ft' ? { min: 10, max: 490, step: 5 } : { min: 3, max: 150, step: 1 }
  const endRange = units.depth === 'ft' ? { min: 65, max: 200, step: 5 } : { min: 20, max: 60, step: 1 }
  const depthDisplay = Math.round(convertDepth(targetDepth, 0).value)
  const endDisplay = Math.round(convertDepth(maxEnd, 0).value)

  // Plan-level warnings, then each gas's own. A per-gas warning names its gas:
  // "END exceeds your limit" is ambiguous when four gases are listed, and the
  // card it used to sit inside is no longer there to say which one.
  const banners: { id: string; severity: Severity; message: string }[] =
    'error' in result
      ? [{ id: 'engine-error', severity: 'danger' as Severity, message: result.error }]
      : [
          ...set!.planningWarnings.map((w, i) => ({
            id: `plan-${i}`,
            severity: w.type as Severity,
            message: w.message,
          })),
          ...set!.recommendations.flatMap((rec) =>
            rec.warnings.map((w, i) => ({
              id: `${rec.id}-${i}`,
              severity: w.type as Severity,
              message: `${rec.label}: ${w.message}`,
            }))
          ),
        ]

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-h3 font-semibold text-text">Best mix</h1>
        <p className="text-sm text-text-muted">The optimal gas for a depth and ppO₂, against your own limits.</p>
      </header>


      {/* Inputs pin: this page's results run to ~1730px against a 900px fold,
          so without it the controls scroll away the moment you read past the
          first gas. */}
      <ToolLayout>
        <Inputs sticky>
          {/* The CardHeaders below render h4s, so this h2 keeps the document
              outline from jumping h1 -> h4. */}
          <h2 className="sr-only">Planning inputs</h2>
          <Card panel="input">
            <CardHeader
              title="The dive"
              description="What you are planning to breathe this gas on."
            />
            <div className="space-y-3">
              <NumberField
                label={`Target depth (${units.depth})`}
                value={depthDisplay}
                onChange={(v) => setTargetDepth(parseDepthInput(v))}
                min={depthRange.min}
                max={depthRange.max}
                step={depthRange.step}
                unit={units.depth}
                hint="The deepest point of the planned dive."
              />

              <NumberField
                label="Bottom time"
                value={bottomTime}
                onChange={setBottomTime}
                min={1}
                max={300}
                step={5}
                unit="min"
                hint="Used for the CNS oxygen exposure estimate."
              />
            </div>
          </Card>

          <Card panel="input">
            <CardHeader
              title="The mix"
              description="What the gas is optimised for."
            />
            <div className="space-y-3">
              <Slider
                label="Target ppO₂"
                value={desiredPPO2}
                onChange={setDesiredPPO2}
                min={0.8}
                max={1.6}
                step={0.05}
                unit=" bar"
                precision={2}
                ariaValueText={`${desiredPPO2.toFixed(2)} bar partial pressure of oxygen`}
                hint={`Your working limit is ${prefs.maxPPO2Work.toFixed(2)} bar; deco ${prefs.maxPPO2Deco.toFixed(2)} bar. Change these in Preferences.`}
              />

              {isTrimixMode(mode) && (
                <Slider
                  label={`Max END (${units.depth})`}
                  value={endDisplay}
                  onChange={(v) => setMaxEnd(parseDepthInput(v))}
                  min={endRange.min}
                  max={endRange.max}
                  step={endRange.step}
                  unit={` ${units.depth}`}
                  tone="he"
                  hint="Helium is added until narcosis at depth matches air at this depth."
                />
              )}
            </div>
          </Card>
        </Inputs>

        {/* --- Results ----------------------------------------------------- */}
        <Results>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Best mix"
              value={bottom?.label ?? '—'}
              tone="accent"
              hint={
                bottom
                  ? `at ppO₂ ${fmtPressure(desiredPPO2).value} ${fmtPressure(desiredPPO2).unit}`
                  : 'for the target depth'
              }
            />
            {/* The depth the gas may actually be taken to, not its oxygen MOD.
                The hint names the binding limit so a narcosis- or density-
                bound gas cannot read as though oxygen were the only ceiling. */}
            <StatCard
              label="Max depth"
              value={bottom ? fmtDepth(bottom.analysis.operatingDepthMeters).value : '—'}
              unit={units.depth}
              tone={
                bottom && bottom.analysis.operatingDepthMeters < targetDepth
                  ? 'danger'
                  : 'none'
              }
              hint={
                !bottom
                  ? 'depth limit'
                  : bottom.analysis.limitedBy === 'oxygen'
                    ? `at ppO₂ ${fmtPressure(bottom.analysis.modPPO2).value}`
                    : bottom.analysis.limitedBy === 'narcosis'
                      ? `set by END, not oxygen`
                      : `set by density, not oxygen`
              }
            />
            {/* END and density are measured at the depth you asked for, which
                may be deeper than the gas can legally go — that is precisely
                what makes them breach. Saying so stops "Max depth 31 m" beside
                "END 39 m" reading as a contradiction. */}
            <StatCard
              label="END"
              value={bottom ? fmtDepth(bottom.analysis.endMeters).value : '—'}
              unit={units.depth}
              tone={
                bottom && bottom.analysis.endMeters > prefs.maxEND ? 'warning' : 'none'
              }
              hint={
                bottom
                  ? `at ${depthDisplay} ${units.depth} · limit ${fmtDepth(prefs.maxEND).value}`
                  : `limit ${fmtDepth(prefs.maxEND).value} ${units.depth}`
              }
            />
            <StatCard
              label="Density"
              value={bottom ? fmtDensity(bottom.analysis.densityGramsPerLiter).value : '—'}
              unit={units.density}
              tone={
                !bottom
                  ? 'none'
                  : bottom.analysis.densityGramsPerLiter > prefs.maxGasDensityCritical
                    ? 'danger'
                    : bottom.analysis.densityGramsPerLiter > prefs.maxGasDensity
                      ? 'warning'
                      : 'none'
              }
              hint={
                bottom
                  ? `at ${depthDisplay} ${units.depth} · limit ${fmtDensity(prefs.maxGasDensity).value}`
                  : `limit ${fmtDensity(prefs.maxGasDensity).value} ${units.density}`
              }
            />
          </div>

          {set?.failure && (
            <Card severity="danger">
              <CardHeader title={set.failure.title} />
              <p className="text-sm text-text">{set.failure.reason}</p>
              <p className="mt-2 text-sm text-text-muted">{set.failure.suggestion}</p>
            </Card>
          )}

          {set && set.recommendations.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-h4 font-semibold text-text">
                Gases to carry
                <span className="ml-2 font-normal text-text-subtle">
                  {set.recommendations.length}
                </span>
              </h2>
              {set.recommendations.map((rec, i) => (
                <MixCard
                  key={rec.id}
                  // Only the gas you are actually planning opens by default.
                  // Five expanded cards ran to 1346px on their own, so the
                  // page opened ~800px past the fold; the deco gases are
                  // reference, and each collapses to label + MOD + warning
                  // count.
                  defaultOpen={i === 0}
                  recommendation={rec}
                  formatDepth={fmtDepth}
                  formatPressure={fmtPressure}
                  formatDensity={fmtDensity}
                  densityLimits={{
                    warning: prefs.maxGasDensity,
                    critical: prefs.maxGasDensityCritical,
                  }}
                  endLimitMeters={prefs.maxEND}
                  onShowMath={setMathFor}
                />
              ))}
            </div>
          ) : (
            !set?.failure && (
              <Card>
                <p className="text-sm text-text-muted">
                  Set a target depth and ppO₂ to see the gases to carry, each with its
                  maximum operating depth, equivalent narcotic depth, gas density and CNS
                  loading.
                </p>
              </Card>
            )
          )}
        </Results>
      </ToolLayout>

      <Modal
        isOpen={mathFor !== null}
        onClose={() => setMathFor(null)}
        title={mathFor?.math.title ?? ''}
        description="Every line below is computed from the same values shown on the card."
        size="xl"
      >
        {mathFor && <MathSteps derivation={mathFor.math} />}
      </Modal>

      <MessageBar items={banners} />
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  MathTrigger,
  MessageBar,
  Card,
  CardHeader,
  CollapsibleCard,
  Inputs,
  NumberField,
  Results,
  Slider,
  StatCard,
  Modal,
  Table,
  ToolLayout,
  type Severity,
  type StatTone,
} from '@/components/ui'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useUnitConversion } from '@/hooks/useUnitConversion'
import { NORMOXIC_MIN_O2_PERCENT } from '@/lib/limits'
import { modRaw } from '@/lib/gas'
import { modCheckDerivation } from '@/lib/recommendations/modCheckMath'
import { formatterFor } from '@/lib/units'
import type { DiveMode } from '@/lib/warnings'
import { useModCheck } from './useModCheck'


/** Em-dash placeholder so an unset result never renders as a bare blank. */
const NONE = '—'

/**
 * MOD check — "is this tank safe for this dive?"
 *
 * The diver enters a mix they already have; the page answers how deep it may
 * be taken, how shallow it stays breathable, and what it will do to their
 * narcosis, work of breathing and oxygen clock. The verdict sits above the
 * numbers because that is the question being asked.
 */
/**
 * KaTeX and the renderer load only when a diver asks for the math, exactly as
 * on Best mix. The fallback is the raw LaTeX, which is still readable.
 */
const MathSteps = dynamic(() => import('@/components/mix/MathSteps'), {
  ssr: false,
  loading: () => <p className="text-sm text-text-muted">Rendering the math…</p>,
})

export default function ModCheckTool() {
  const { preferences: diverPrefs } = usePreferences()
  const {
    convertDepth,
    convertDensity,
    convertTemperature,
    parseTemperatureInput,
    getUnitLabels,
    preferences: unitPrefs,
  } = useUnitConversion()
  const units = getUnitLabels()

  const [o2Percent, setO2Percent] = useState(21)
  const [hePercent, setHePercent] = useState(0)
  // App-wide chrome state (sidebar footer), not a page input. This was
  // `useState('oc')`, which both ignored the diver's saved mode and silently
  // disagreed with whatever Best mix was computing.
  const diveMode = diverPrefs.diveMode as DiveMode
  const [plannedMinutes, setPlannedMinutes] = useState(20)
  const [mathOpen, setMathOpen] = useState(false)
  const [waterTempC, setWaterTempC] = useState(20)

  // The narcosis model and every threshold below come from the diver's own
  // preferences; nothing on this page hardcodes a limit.
  const limits = useMemo(
    () => ({
      maxPPO2Work: diverPrefs.maxPPO2Work,
      maxPPO2Deco: diverPrefs.maxPPO2Deco,
      maxPPO2CCR: diverPrefs.maxPPO2CCR,
      maxGasDensity: diverPrefs.maxGasDensity,
      maxGasDensityCritical: diverPrefs.maxGasDensityCritical,
      maxEND: diverPrefs.maxEND,
      oxygenNarcosisModel: diverPrefs.oxygenNarcosisModel,
    }),
    [
      diverPrefs.maxPPO2Work,
      diverPrefs.maxPPO2Deco,
      diverPrefs.maxPPO2CCR,
      diverPrefs.maxGasDensity,
      diverPrefs.maxGasDensityCritical,
      diverPrefs.maxEND,
      diverPrefs.oxygenNarcosisModel,
    ]
  )

  // C1: warning text is written in the diver's own units. The formatter is
  // pure and passed in, so `src/lib` stays free of React context.
  const messageUnits = useMemo(
    () => formatterFor(unitPrefs.depth),
    [unitPrefs.depth]
  )

  const result = useModCheck(
    { o2Percent, hePercent, diveMode, plannedMinutes, waterTempC, units: messageUnits },
    limits
  )

  const {
    error,
    label,
    workingMod,
    oxygenMod,
    operating,
    workingPPO2,
    decoMod,
    hypoxicFloor,
    isHypoxic,
    endAtWorkingMod,
    densityAtWorkingMod,
    ppo2AtWorkingMod,
    cns,
    warnings,
  } = result

  const n2Percent = Math.max(0, 100 - o2Percent - hePercent)
  const valid = error === null

  const depth = (m: number) => convertDepth(m, 0).value.toFixed(0)
  // Imperial density lands around 0.3–0.5 lb/ft³, so one decimal collapses the
  // whole useful range into two distinct values. Metric g/L keeps one decimal,
  // which is the precision `roundDensity` already rounds to.
  const metricUnits = units.density === 'g/L'
  const densityDecimals = metricUnits ? 1 : 2
  const density = (gl: number) =>
    convertDensity(gl, densityDecimals).value.toFixed(densityDecimals)

  // --- Verdict -------------------------------------------------------------
  // The single most important thing on the page: the worst severity emitted by
  // the shared warnings module for this mix at its own working MOD.
  const worst: Severity | null = warnings.some((w) => w.type === 'danger')
    ? 'danger'
    : warnings.some((w) => w.type === 'warning')
      ? 'warning'
      : warnings.length > 0
        ? 'info'
        : null

  const verdictSeverity: Severity = !valid ? 'danger' : (worst ?? 'success')

  // Names the constraint that set the max depth. Without this the card reads
  // as an oxygen limit even when narcosis or density is what actually binds.
  const limitHint =
    operating.limitedBy === 'oxygen'
      ? `Set by ppO₂ ${workingPPO2.toFixed(2)} bar`
      : operating.limitedBy === 'narcosis'
        ? `Set by END ${depth(result.limits.maxEND)} ${units.depth} — not oxygen`
        : `Set by density ${density(result.limits.maxGasDensity)} ${units.density} — not oxygen`

  const verdictTitle = !valid
    ? 'Mix cannot be analysed'
    : verdictSeverity === 'danger'
      ? `${label} breaches a limit at its own MOD`
      : verdictSeverity === 'warning'
        ? `${label} is usable with caution`
        : verdictSeverity === 'info'
          ? `${label} is within your limits, with notes`
          : `${label} is within all of your limits`

  const verdictBody = !valid
    ? error
    : isHypoxic
      ? `Breathable from ${depth(hypoxicFloor)} ${units.depth} down to ${depth(workingMod)} ${units.depth} at ppO₂ ${workingPPO2.toFixed(2)} bar. This mix is hypoxic — it will not sustain you at the surface.`
      : operating.limitedBy === 'oxygen'
        ? `Breathable from the surface down to ${depth(workingMod)} ${units.depth}, where ppO₂ reaches your ${workingPPO2.toFixed(2)} bar limit.`
        : `Breathable from the surface down to ${depth(workingMod)} ${units.depth}, set by ${operating.limitedBy === 'narcosis' ? `your ${depth(result.limits.maxEND)} ${units.depth} END limit` : `your ${density(result.limits.maxGasDensity)} ${units.density} density limit`} — not by oxygen, which alone would allow ${depth(oxygenMod)} ${units.depth}.`

  // --- Result tones --------------------------------------------------------
  const endTone: StatTone = !valid
    ? 'none'
    : endAtWorkingMod > result.limits.maxEND
      ? 'warning'
      : 'none'

  const densityTone: StatTone = !valid
    ? 'none'
    : densityAtWorkingMod > result.limits.maxGasDensityCritical
      ? 'danger'
      : densityAtWorkingMod > result.limits.maxGasDensity
        ? 'warning'
        : 'none'

  const cnsPercent = cns.percent
  const cnsTone: StatTone = !valid || cnsPercent === null
    ? 'danger'
    : cnsPercent > 100
      ? 'danger'
      : cnsPercent > 80
        ? 'warning'
        : 'none'

  const bannerItems = [
    {
      id: 'verdict',
      severity: verdictSeverity,
      title: verdictTitle,
      message: verdictBody,
    },
    ...warnings.map((w, i) => ({
      id: String(i),
      severity: w.type as Severity,
      message: w.message,
    })),
    // Where the limits came from. Reference, not a decision the diver makes on
    // this page, so it belongs in the bar rather than beside the controls.
    {
      id: 'limits-provenance',
      severity: 'info' as Severity,
      title: 'Your limits',
      message: (
        <>
          From your <span className="text-text">Safety limits</span> preferences: ppO₂{' '}
          <span className="font-mono tnum">{result.limits.maxPPO2Work.toFixed(2)}</span>{' '}
          working, <span className="font-mono tnum">{result.limits.maxPPO2Deco.toFixed(2)}</span>{' '}
          deco, <span className="font-mono tnum">{result.limits.maxPPO2CCR.toFixed(2)}</span>{' '}
          CCR; END <span className="font-mono tnum">{depth(result.limits.maxEND)}</span>{' '}
          {units.depth}; density{' '}
          <span className="font-mono tnum">{density(result.limits.maxGasDensity)}</span>{' '}
          {units.density}.
        </>
      ),
    },
  ]

  // The derivation behind every number on this page. Built only when the mix is
  // valid; there is nothing to derive from an impossible one.
  const derivation = useMemo(
    () =>
      valid && result.mix
        ? modCheckDerivation({
            mix: result.mix,
            label,
            limits: result.limits,
            operating,
            workingPPO2,
            oxygenModRaw: modRaw(result.mix, workingPPO2),
            endAtWorkingMod,
            densityAtWorkingMod,
            temperatureC: waterTempC,
            hypoxicFloor,
            isHypoxic,
            cns: { percent: cnsPercent, limitMinutes: result.cns.limitMinutes },
            plannedMinutes,
            ppo2AtWorkingMod,
          })
        : null,
    [
      valid,
      result,
      label,
      operating,
      workingPPO2,
      endAtWorkingMod,
      densityAtWorkingMod,
      waterTempC,
      hypoxicFloor,
      isHypoxic,
      cnsPercent,
      plannedMinutes,
      ppo2AtWorkingMod,
    ]
  )

  // --- Depth band table ----------------------------------------------------
  // The limits this mix imposes, as a single readable list.
  const bandRows = valid
    ? [
        {
          key: 'floor',
          limit: 'Hypoxic floor',
          value: isHypoxic ? `${depth(hypoxicFloor)} ${units.depth}` : `Surface`,
          because: isHypoxic
            ? `Below ${NORMOXIC_MIN_O2_PERCENT}% O₂ — not breathable at the surface`
            : `At or above ${NORMOXIC_MIN_O2_PERCENT}% O₂`,
        },
        {
          key: 'oxygen',
          limit: diveMode.startsWith('ccr') ? 'Oxygen, CCR setpoint' : 'Oxygen, working',
          value: `${depth(oxygenMod)} ${units.depth}`,
          because: `ppO₂ reaches your ${workingPPO2.toFixed(2)} bar limit`,
        },
        {
          key: 'narcosis',
          limit: 'Narcosis',
          value: Number.isFinite(operating.narcosisDepthMeters)
            ? `${depth(operating.narcosisDepthMeters)} ${units.depth}`
            : 'No limit',
          because: Number.isFinite(operating.narcosisDepthMeters)
            ? `END reaches your ${depth(result.limits.maxEND)} ${units.depth} limit`
            : 'This mix carries no narcotic gas',
        },
        {
          key: 'density',
          limit: 'Density',
          value: Number.isFinite(operating.densityDepthMeters)
            ? `${depth(operating.densityDepthMeters)} ${units.depth}`
            : 'No limit',
          because: `Density reaches your ${density(result.limits.maxGasDensity)} ${units.density} limit`,
        },
        {
          key: 'deco',
          limit: 'Oxygen, deco',
          value: `${depth(decoMod)} ${units.depth}`,
          because: `ppO₂ reaches your ${result.limits.maxPPO2Deco.toFixed(2)} bar limit`,
        },
      ]
    : []

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-h3 font-semibold text-text">MOD check</h2>
        <p className="text-sm text-text-muted">How deep a mix you already have may be taken, and what it costs you.</p>
      </header>


      {/* Results pin here, not inputs: this page inverts Best mix — the
          controls are the long column and the answers are the short one. */}
      <ToolLayout>
        <Inputs className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          <Card panel="input">
            <CardHeader
              title="The gas you have"
              description="What the analyser read on the tank."
            />
            <div className="space-y-3">
              <Slider
                label="Oxygen"
                value={o2Percent}
                onChange={(v) => {
                  setO2Percent(v)
                  if (v + hePercent > 100) setHePercent(100 - v)
                }}
                min={5}
                max={100}
                step={1}
                unit="%"
                tone="o2"
                ariaValueText={`${o2Percent} percent oxygen`}
              />
              <Slider
                label="Helium"
                value={hePercent}
                onChange={(v) => setHePercent(Math.min(v, 100 - o2Percent))}
                min={0}
                max={95}
                step={1}
                unit="%"
                tone="he"
                ariaValueText={`${hePercent} percent helium`}
              />
              <div className="flex items-baseline justify-between rounded-sm border border-border bg-surface-2 px-3 py-2">
                <span className="text-sm font-medium text-text">Nitrogen</span>
                <span className="font-mono tnum text-sm font-semibold text-n2">
                  {n2Percent.toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-text-subtle">
                Nitrogen is the balance and is not entered directly. Analysed as{' '}
                <span className="font-mono tnum text-text-muted">{label}</span>.
              </p>
            </div>
          </Card>

          <Card panel="input">
            <CardHeader
              title="The dive you are planning"
              description="Sets which ppO₂ ceiling applies and how much oxygen clock you spend."
            />
            <div className="space-y-3">
              <NumberField
                label="Bottom time at MOD"
                value={plannedMinutes}
                onChange={setPlannedMinutes}
                min={0}
                max={600}
                step={5}
                unit="min"
                hint="Used for the CNS estimate. The worst case is the whole dive at the MOD."
              />
              <NumberField
                label="Water temperature"
                // Stored in °C, shown and entered in the diver's own unit.
                value={Math.round(convertTemperature(waterTempC, 0).value)}
                onChange={(v) => setWaterTempC(parseTemperatureInput(v))}
                min={Math.round(convertTemperature(-2, 0).value)}
                max={Math.round(convertTemperature(40, 0).value)}
                step={1}
                unit={units.temperature}
                hint="Colder gas is denser, which raises work of breathing."
              />
            </div>
          </Card>

        </Inputs>

        <Results sticky className="space-y-4">
          {derivation && <MathTrigger onClick={() => setMathOpen(true)} />}

          <div>
            <h3 className="mb-2 text-h4 font-semibold text-text">Depth limits</h3>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {/* The operating depth, not the oxygen MOD. The hint names the
                  limit that actually binds, so a gas held back by narcosis or
                  density cannot read as though oxygen were the only ceiling. */}
              <StatCard
                label="Max depth"
                value={valid ? depth(workingMod) : NONE}
                unit={units.depth}
                tone="accent"
                hint={valid ? limitHint : `At ppO₂ ${workingPPO2.toFixed(2)} bar`}
              />
              <StatCard
                label="Oxygen limit"
                value={valid ? depth(oxygenMod) : NONE}
                unit={units.depth}
                tone="none"
                hint={
                  valid && operating.limitedBy !== 'oxygen'
                    // Kept to two lines: a third wrapped line grew this card
                    // 16px and moved the whole results column as the slider
                    // crossed the depth at which narcosis takes over from
                    // oxygen. The binding limit is named either way.
                    ? `${operating.limitedBy} binds first`
                    : `At ppO₂ ${workingPPO2.toFixed(2)} bar`
                }
              />
              <StatCard
                label="Hypoxic floor"
                value={valid ? (isHypoxic ? depth(hypoxicFloor) : '0') : NONE}
                unit={units.depth}
                tone={isHypoxic ? 'danger' : 'none'}
                hint={
                  isHypoxic
                    ? 'Hypoxic — travel gas required'
                    : 'Breathable at the surface'
                }
              />
              <StatCard
                label="ppO₂ at MOD"
                value={valid ? ppo2AtWorkingMod.toFixed(2) : NONE}
                unit="bar"
                hint="What you actually breathe there"
              />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-h4 font-semibold text-text">
              What it costs you at that depth
            </h3>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              <StatCard
                label="END"
                value={valid ? depth(endAtWorkingMod) : NONE}
                unit={units.depth}
                tone={endTone}
                hint={`Limit ${depth(result.limits.maxEND)} ${units.depth} · ${
                  result.limits.oxygenNarcosisModel ? 'N₂+O₂ narcotic' : 'N₂ only'
                }`}
              />
              <StatCard
                label="Gas density"
                value={valid ? density(densityAtWorkingMod) : NONE}
                unit={units.density}
                tone={densityTone}
                hint={`Limit ${density(result.limits.maxGasDensity)} ${units.density} at ${convertTemperature(waterTempC, 0).formatted}`}
              />
              <StatCard
                label="CNS"
                value={valid && cnsPercent !== null ? cnsPercent.toFixed(1) : NONE}
                unit="%"
                tone={cnsTone}
                hint={
                  cns.overLimit
                    ? 'Beyond the NOAA table'
                    : `${plannedMinutes} min at ppO₂ ${ppo2AtWorkingMod.toFixed(2)}`
                }
              />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-h4 font-semibold text-text">Depth band</h3>
            <Table
              caption="Depth limits this mix imposes"
              hideCaption
              rows={bandRows}
              rowKey={(r) => r.key}
              emptyMessage="Enter a valid mix to see its depth band."
              columns={[
                { key: 'limit', header: 'Limit', cell: (r) => r.limit },
                { key: 'value', header: 'Depth', numeric: true, cell: (r) => r.value },
                {
                  key: 'because',
                  header: 'Because',
                  cell: (r) => (
                    <span className="text-text-muted">{r.because}</span>
                  ),
                },
              ]}
            />
          </div>

          {/* Reference, not a result: 228px of prose explaining rounding and
              method, which a diver reads once and then never again. Collapsed
              so the numbers it describes stay on the fold. */}
          <CollapsibleCard title="How to read this">
            <ul className="grid gap-2 text-sm text-text-muted">
              <li>
                MOD is floored to a whole metre, END and density are ceilinged — the
                reported figure is never less conservative than the true one.
              </li>
              <li>
                Every value is evaluated at the working MOD, the deepest point this gas
                may be breathed on the bottom phase.
              </li>
              <li>
                CNS is a single-exposure estimate from the NOAA table and assumes the
                whole bottom time at the MOD. A real profile spends less.
              </li>
              <li>
                Need a mix rather than a check?{' '}
                <Link href="/mix/" className="text-accent underline underline-offset-2">
                  Best mix
                </Link>{' '}
                works the other way round.
              </li>
            </ul>
          </CollapsibleCard>
        </Results>
      </ToolLayout>

      {/* Messages dock to the bottom of the viewport rather than sitting above
          the results. They appear and vanish as a slider crosses a threshold,
          and in the document flow that moved every input below them. */}
      <Modal
        isOpen={mathOpen}
        onClose={() => setMathOpen(false)}
        title={derivation?.title ?? ''}
        description="Every figure below is the one this page is showing, recomputed from the formula rather than restated."
        size="xl"
      >
        {derivation && <MathSteps derivation={derivation} columns />}
      </Modal>

      <MessageBar items={bannerItems} />
    </div>
  )
}

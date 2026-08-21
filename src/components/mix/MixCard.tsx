'use client'

import { useState } from 'react'
import { HiOutlineChevronRight } from 'react-icons/hi2'
import { Card, ShowMathButton, cn } from '@/components/ui'
import type { Recommendation, WarningSeverity } from '@/lib/recommendations'

/** The single most serious warning severity on a recommendation, if any. */
function worstSeverity(rec: Recommendation): WarningSeverity | undefined {
  if (rec.warnings.some((w) => w.type === 'danger')) return 'danger'
  if (rec.warnings.some((w) => w.type === 'warning')) return 'warning'
  if (rec.warnings.length > 0) return 'info'
  return undefined
}

/** One gas-fraction chip, always in that species' canonical colour. */
function Fraction({
  species,
  percent,
}: {
  species: 'o2' | 'he' | 'n2'
  percent: number
}) {
  const label = species === 'o2' ? 'O₂' : species === 'he' ? 'He' : 'N₂'
  const tone =
    species === 'o2' ? 'text-o2' : species === 'he' ? 'text-he' : 'text-n2'
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs font-medium text-text-subtle">{label}</span>
      <span className={cn('font-mono tnum text-sm font-semibold', tone)}>
        {percent.toFixed(0)}%
      </span>
    </div>
  )
}

/** One analysed figure in the card's readout row. */
function Figure({
  label,
  value,
  unit,
  tone,
}: {
  label: string
  value: string
  unit?: string
  tone?: 'danger' | 'warning' | 'accent'
}) {
  return (
    <div className="min-w-0">
      <div className="text-[0.6875rem] font-medium uppercase tracking-wide text-text-subtle">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className={cn(
            'font-mono tnum text-base font-semibold',
            tone === 'danger'
              ? 'text-danger'
              : tone === 'warning'
                ? 'text-warning'
                : tone === 'accent'
                  ? 'text-accent'
                  : 'text-text'
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-text-subtle">{unit}</span>}
      </div>
    </div>
  )
}

export interface MixCardProps {
  recommendation: Recommendation
  /** Formats a depth in metres into the diver's chosen units. */
  formatDepth: (meters: number) => { value: string; unit: string }
  /** Formats a pressure in bar into the diver's chosen units. */
  formatPressure: (bar: number) => { value: string; unit: string }
  /** Formats a density in g/L into the diver's chosen units. */
  formatDensity: (gramsPerLiter: number) => { value: string; unit: string }
  /** The diver's density limits, so the figure itself can take a semantic tone. */
  densityLimits: { warning: number; critical: number }
  /** The diver's END limit, likewise. */
  endLimitMeters: number
  onShowMath: (recommendation: Recommendation) => void
}

/**
 * One recommended gas: what to fill, what it does at depth, and why.
 *
 * The card carries the severity of its worst warning, and any figure that
 * breaches a limit takes the matching semantic tone as well — a value in red is
 * always explained by a banner directly beneath it, never by colour alone.
 */
export default function MixCard({
  recommendation: rec,
  formatDepth,
  formatPressure,
  formatDensity,
  densityLimits,
  endLimitMeters,
  onShowMath,
  defaultOpen = true,
}: MixCardProps & { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const severity = worstSeverity(rec)
  // The depth this gas may actually be taken to. For deco gases this equals
  // the oxygen MOD (they are oxygen-limited by a wide margin), so the change
  // is invisible there and only bites where it should: a bottom gas that
  // narcosis or density binds shallower than its ppO2 would allow.
  const mod = formatDepth(rec.analysis.operatingDepthMeters)
  const modLimitedBy = rec.analysis.limitedBy
  const end = formatDepth(rec.analysis.endMeters)
  const density = formatDensity(rec.analysis.densityGramsPerLiter)
  const ppo2 = formatPressure(rec.analysis.modPPO2)

  const densityTone =
    rec.analysis.densityGramsPerLiter > densityLimits.critical
      ? 'danger'
      : rec.analysis.densityGramsPerLiter > densityLimits.warning
        ? 'warning'
        : undefined
  const endTone = rec.analysis.endMeters > endLimitMeters ? 'warning' : undefined
  const cns = rec.analysis.cnsPercent

  return (
    <Card
      severity={severity === 'info' ? 'none' : severity}
      // Only mark it as an output panel when no severity tint is in play —
      // a warning/danger card already has its own surface and border, and
      // stacking the output treatment on top would mute the warning colour
      // that is the whole point of that card.
      panel={severity && severity !== 'info' ? 'none' : 'output'}
      // A collapsed card is a single summary row, so the full card padding
      // around it is wasted height once four of them stack up.
      className={cn('flex flex-col', open ? 'gap-3' : 'gap-0 py-2.5')}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <HiOutlineChevronRight
            aria-hidden="true"
            className={cn(
              'mt-1 h-4 w-4 shrink-0 text-text-muted transition-transform motion-reduce:transition-none',
              open && 'rotate-90'
            )}
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
              {rec.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono tnum text-h2 font-semibold leading-none text-accent">
                {rec.label}
              </span>
              {rec.origin === 'standard' && (
                <span className="text-xs text-text-subtle">standard fill</span>
              )}
              {/* Collapsed, the depth this gas is for is the one number worth
                  keeping on screen — it is what a diver scans the list for. */}
              {!open && (
                <span className="text-xs text-text-muted">
                  {modLimitedBy === 'oxygen' ? 'MOD' : 'Max'} {mod.value} {mod.unit}
                  {severity === 'danger' || severity === 'warning' ? (
                    <span className={severity === 'danger' ? 'text-danger' : 'text-warning'}>
                      {' '}· {rec.warnings.length}{' '}
                      {rec.warnings.length === 1 ? 'warning' : 'warnings'}
                    </span>
                  ) : null}
                </span>
              )}
            </span>
          </span>
        </button>
        {/* Per-gas, so it stays inside the card rather than at the top of the
            column — but the same control, reading the same way, as every other
            tool's. The gas is named in the accessible label, since four cards
            each offer one. */}
        {open && (
          <ShowMathButton onClick={() => onShowMath(rec)} subject={rec.label} />
        )}
      </div>

      {!open ? null : (
      <>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-y border-border py-2">
        <Fraction species="o2" percent={rec.percentages.o2} />
        {rec.percentages.he > 0 && (
          <Fraction species="he" percent={rec.percentages.he} />
        )}
        <Fraction species="n2" percent={rec.percentages.n2} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Figure
          label={modLimitedBy === 'oxygen' ? 'MOD' : 'Max depth'}
          value={mod.value}
          unit={mod.unit}
          tone="accent"
        />
        <Figure label="END" value={end.value} unit={end.unit} tone={endTone} />
        <Figure
          label="Density"
          value={density.value}
          unit={density.unit}
          tone={densityTone}
        />
        <Figure
          label="CNS"
          value={rec.analysis.cnsOverLimit ? '—' : (cns ?? 0).toFixed(0)}
          unit="%"
          tone={cns !== null && cns > 100 ? 'danger' : undefined}
        />
      </div>

      <p className="text-sm text-text-muted">
        {rec.rationale} At ppO₂ {ppo2.value} {ppo2.unit}.
      </p>

      </>
      )}
    </Card>
  )
}

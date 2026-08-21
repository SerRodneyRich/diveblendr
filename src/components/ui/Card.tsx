'use client'

import { forwardRef } from 'react'
import { HiOutlineChevronRight } from 'react-icons/hi2'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

const cardVariants = cva('rounded-md border', {
  variants: {
    /** Severity tint. `none` is the neutral card used for most content. */
    severity: {
      none: 'glass',
      info: 'bg-info-bg border-info-border',
      success: 'bg-success-bg border-success-border',
      warning: 'bg-warning-bg border-warning-border',
      danger: 'bg-danger-bg border-danger-border',
    },
    padding: {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
    /** Adds a hover lift — only for cards that are themselves links/buttons. */
    interactive: {
      true: 'transition-colors motion-reduce:transition-none hover:border-brand-muted hover:bg-surface-2/70 cursor-pointer',
      false: '',
    },
    /**
     * What the card *is*, in a tool: somewhere you type, or somewhere the app
     * answers. A diver landing on a page should not have to read the contents
     * to tell those apart.
     *
     * This rides the existing depth ramp rather than inventing a palette. The
     * surfaces get lighter as they rise toward the light, so `input` sits on
     * surface-2 ("raised/input" in the token comments) and reads as the panel
     * closest to you — the thing you touch. `output` stays down on surface-1,
     * recessed, and takes a brand-tinted left edge so a column of results
     * scans as one group. `none` is the neutral card for everything that is
     * neither.
     */
    panel: {
      none: '',
      input: 'bg-surface-2/85 border-border-strong',
      output: 'bg-surface-1/85 border-l-2 border-l-brand-muted',
    },
  },
  defaultVariants: { severity: 'none', padding: 'md', interactive: false, panel: 'none' },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

/**
 * Generic content container. The shared surface vocabulary for every results
 * panel and form group.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, severity, padding, interactive, panel, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      // A stable hook so a page can tune card density for its own layout
      // without every card in the app inheriting the change. The share card
      // uses it: a live preview and its controls compete for one fold there,
      // which no calculator page has to deal with.
      data-card=""
      className={cn(cardVariants({ severity, padding, interactive, panel }), className)}
      {...props}
    />
  )
})

/**
 * A card whose body collapses behind its own header.
 *
 * For the settings a diver configures once and then leaves alone — a fill
 * station's banks, a reserve strategy — which otherwise occupy as much vertical
 * space as the fields they will actually touch on every visit, and push the
 * results off the fold.
 *
 * Uses native `<details>`, so it is keyboard-operable and findable by in-page
 * search with no JavaScript of its own.
 */
export function CollapsibleCard({
  title,
  description,
  summary,
  defaultOpen = false,
  children,
  className,
  ...props
}: Omit<CardProps, 'title'> & {
  title: React.ReactNode
  description?: React.ReactNode
  /** One line shown next to the title while closed, e.g. the current setting. */
  summary?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <Card className={cn('p-0', className)} {...props}>
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer list-none items-start gap-2 p-4">
          <HiOutlineChevronRight
            aria-hidden="true"
            className="mt-1 h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-h4 font-semibold text-text">{title}</span>
            {description && (
              <span className="mt-0.5 block text-sm text-text-muted">{description}</span>
            )}
          </span>
          {summary && (
            <span className="shrink-0 text-xs text-text-muted group-open:hidden">
              {summary}
            </span>
          )}
        </summary>
        <div className="px-4 pb-4">{children}</div>
      </details>
    </Card>
  )
}

/** Card header row: title on the left, optional actions on the right. */
export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-card-header=""
      className={cn('mb-2 flex items-start justify-between gap-3', className)}
    >
      <div className="min-w-0">
        <h3 className="text-h4 font-semibold text-text">{title}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

const statValueColor = {
  none: 'text-text',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  accent: 'text-accent',
  o2: 'text-o2',
  he: 'text-he',
  n2: 'text-n2',
} as const

export type StatTone = keyof typeof statValueColor

export interface StatCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Short label above the value, e.g. "Runtime", "MOD", "END". */
  label: React.ReactNode
  /** The number itself. Rendered mono + tabular so columns of these align. */
  value: React.ReactNode
  /** Unit suffix, e.g. "m", "min", "%". Kept visually subordinate to the value. */
  unit?: React.ReactNode
  /** Colour role for the value. Severity tones also tint the card border. */
  tone?: StatTone
  /** Optional caption under the value, e.g. the limit that was compared against. */
  hint?: React.ReactNode
  /** Slot for a sparkline or mini-chart, rendered under the value. */
  chart?: React.ReactNode
}

/**
 * The single results tile. The shared vocabulary for AnalysisResults,
 * ModCheckResults, BottomTime, GasBlender and the Phase 4 planner outputs
 * (runtime, TTS, CNS%, OTU, gas required).
 *
 * The value is always mono + `tabular-nums` so a row or grid of stats stays
 * aligned as numbers change — a live-updating calculator that reflows on every
 * keystroke reads as unstable.
 *
 * @example
 * <StatCard label="MOD" value={42.7} unit="m" tone="warning" hint="at ppO₂ 1.4" />
 */
export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(function StatCard(
  { label, value, unit, tone = 'none', hint, chart, className, ...props },
  ref
) {
  const severity =
    tone === 'info' || tone === 'success' || tone === 'warning' || tone === 'danger'
      ? tone
      : 'none'

  return (
    <div
      ref={ref}
      className={cn(cardVariants({ severity, padding: 'md' }), 'flex flex-col', className)}
      {...props}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={cn(
            'font-mono tnum text-h2 font-semibold leading-none',
            statValueColor[tone]
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-text-muted">{unit}</span>}
      </div>
      {/* Two lines of hint reserved. A hint is written from live results, so it
          grows and shrinks as inputs change — on MOD check, crossing the oxygen
          21→33% boundary swapped a one-line hint for a two-line one and moved
          every card below it 16px. Reserving the taller case costs one line of
          space and holds the row still. */}
      {hint && (
        <div className="mt-1.5 min-h-8 text-xs leading-4 text-text-subtle">{hint}</div>
      )}
      {chart && <div className="mt-2">{chart}</div>}
    </div>
  )
})

export { cardVariants }

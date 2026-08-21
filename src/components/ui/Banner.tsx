'use client'

import { MdError, MdWarning, MdInfo, MdCheckCircle } from 'react-icons/md'
import { HiOutlineChevronRight, HiOutlineXMark } from 'react-icons/hi2'
import { cn } from './cn'

export type Severity = 'info' | 'success' | 'warning' | 'danger'

const severityStyle: Record<
  Severity,
  { card: string; icon: string; Icon: React.ComponentType<{ className?: string }>; word: string }
> = {
  info: {
    card: 'bg-info-bg border-info-border',
    icon: 'text-info',
    Icon: MdInfo,
    word: 'Note',
  },
  success: {
    card: 'bg-success-bg border-success-border',
    icon: 'text-success',
    Icon: MdCheckCircle,
    word: 'OK',
  },
  warning: {
    card: 'bg-warning-bg border-warning-border',
    icon: 'text-warning',
    Icon: MdWarning,
    word: 'Warning',
  },
  danger: {
    card: 'bg-danger-bg border-danger-border',
    icon: 'text-danger',
    Icon: MdError,
    word: 'Danger',
  },
}

/** Severity order used when sorting a stack — most serious first. */
export const severityRank: Record<Severity, number> = {
  danger: 0,
  warning: 1,
  info: 2,
  success: 3,
}

export interface BannerProps {
  severity: Severity
  /** Bold lead-in. Defaults to the severity word. */
  title?: React.ReactNode
  children?: React.ReactNode
  /** Renders a dismiss button. */
  onDismiss?: () => void
  /** Trailing action, e.g. a "Show the math" button. */
  action?: React.ReactNode
  className?: string
  /**
   * Announce this banner when it appears. Use for warnings produced by a
   * recalculation; leave off for banners that are always present.
   */
  live?: boolean
}

/**
 * Inline severity message.
 *
 * Replaces the hover-only tooltips of the floating WarningIconStack: a hover
 * tooltip is unreachable on touch, which is where most divers use this app.
 * Warnings now sit inline above the results they describe.
 *
 * @example
 * <Banner severity="danger" title="ppO₂ exceeded">
 *   1.72 bar at 45 m exceeds the 1.4 bar working limit.
 * </Banner>
 */
export function Banner({
  severity,
  title,
  children,
  onDismiss,
  action,
  className,
  live = false,
}: BannerProps) {
  const s = severityStyle[severity]
  const { Icon } = s

  return (
    <div
      role={severity === 'danger' ? 'alert' : 'status'}
      aria-live={live ? (severity === 'danger' ? 'assertive' : 'polite') : undefined}
      className={cn(
        'flex items-start gap-3 rounded-sm border p-3',
        // Severity is carried by the left rule as well as the tint, so the
        // message is still ranked without relying on colour alone.
        'border-l-4',
        s.card,
        className
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', s.icon)} />
      <div className="min-w-0 flex-1 text-sm text-text">
        {title !== null && (
          <span className={cn('font-semibold', s.icon)}>{title ?? s.word}</span>
        )}
        {title !== null && children ? <span className="text-text-muted"> — </span> : null}
        {children}
      </div>
      {action}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="-m-1.5 shrink-0 rounded-sm p-1.5 text-text-muted transition-colors motion-reduce:transition-none hover:bg-surface-2 hover:text-text"
        >
          <HiOutlineXMark className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export interface BannerStackProps {
  items: { id?: string; severity: Severity; title?: React.ReactNode; message: React.ReactNode }[]
  className?: string
  /**
   * Show this many banners in full; the rest collapse behind a disclosure that
   * counts them by severity. Omit to show everything.
   */
  maxVisible?: number
}

/**
 * A severity-ordered stack of banners, for the warnings a tool emits after a
 * recalculation. Most serious first, so the worst problem is never below the
 * fold.
 *
 * With `maxVisible`, the overflow is a real `<details>` the diver can open —
 * not a dead "+2 more messages" line. This matters because a mix that breaches
 * several limits at once emitted a wall of banners: air at its own MOD pushed
 * 208px of warnings above the fold, so the page opened on text rather than on
 * the numbers it exists to report. Nothing is hidden that is not one click
 * away, and the count names the severities so the collapse never conceals how
 * bad it is.
 */
export function BannerStack({ items, className, maxVisible }: BannerStackProps) {
  const sorted = [...items].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity]
  )
  // `maxVisible === 0` is meaningful — collapse everything — so this cannot be
  // a truthiness check.
  const visible = maxVisible === undefined ? sorted : sorted.slice(0, maxVisible)
  const rest = sorted.slice(visible.length)

  const counts = rest.reduce<Record<string, number>>((acc, w) => {
    acc[w.severity] = (acc[w.severity] ?? 0) + 1
    return acc
  }, {})
  const summary = Object.entries(counts)
    .map(([sev, n]) => `${n} ${sev}`)
    .join(', ')

  if (items.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {visible.map((w, i) => (
        <Banner key={w.id ?? i} severity={w.severity} title={w.title} live>
          {w.message}
        </Banner>
      ))}
      {rest.length > 0 && (
        <details className="group rounded-md border border-border bg-surface-1/60">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-text-muted hover:text-text">
            <HiOutlineChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
            {rest.length} more {rest.length === 1 ? 'message' : 'messages'}
            <span className="text-text-subtle">({summary})</span>
          </summary>
          <div className="flex flex-col gap-2 p-2 pt-0">
            {rest.map((w, i) => (
              <Banner key={w.id ?? `rest-${i}`} severity={w.severity} title={w.title}>
                {w.message}
              </Banner>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

'use client'

import { useRef } from 'react'
import { cn } from './cn'

export interface TabItem<T extends string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  /** Count/badge rendered after the label, e.g. a warning count. */
  badge?: React.ReactNode
  disabled?: boolean
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name for the tablist. */
  ariaLabel: string
  /** `underline` for in-page sections; `pill` inside cards and modals. */
  variant?: 'underline' | 'pill'
  className?: string
  children?: React.ReactNode
}

/**
 * Accessible tab list with roving arrow-key focus (WAI-ARIA tabs pattern).
 *
 * The panel is rendered by the caller so tab state can be lifted into a URL
 * query param — see `TabPanel` for the id wiring that links the two.
 *
 * @example
 * <Tabs items={tabs} value={tab} onChange={setTab} ariaLabel="Preferences" />
 * <TabPanel tabsId={id} value={tab}>{...}</TabPanel>
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  variant = 'underline',
  className,
  children,
}: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (from: number, dir: 1 | -1) => {
    const n = items.length
    for (let i = 1; i <= n; i++) {
      const next = (((from + dir * i) % n) + n) % n
      if (!items[next].disabled) {
        onChange(items[next].value)
        refs.current[next]?.focus()
        return
      }
    }
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      move(index, 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      move(index, -1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(items[0].value)
      refs.current[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(items[items.length - 1].value)
      refs.current[items.length - 1]?.focus()
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex gap-1 overflow-x-auto',
        variant === 'underline'
          ? 'border-b border-border'
          : 'rounded-sm border border-border bg-surface-1 p-1',
        className
      )}
    >
      {items.map((t, i) => {
        const selected = t.value === value
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="tab"
            type="button"
            id={`tab-${t.value}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${t.value}`}
            tabIndex={selected ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-4 text-sm font-medium',
              'transition-colors motion-reduce:transition-none',
              'disabled:cursor-not-allowed disabled:opacity-40',
              variant === 'underline'
                ? selected
                  ? '-mb-px border-b-2 border-accent text-accent'
                  : '-mb-px border-b-2 border-transparent text-text-muted hover:text-text'
                : selected
                  ? 'rounded-sm bg-accent text-on-accent'
                  : 'rounded-sm text-text-muted hover:bg-surface-2 hover:text-text'
            )}
          >
            {t.icon && <span aria-hidden="true">{t.icon}</span>}
            {t.label}
            {t.badge != null && (
              <span className="rounded-full bg-surface-3 px-1.5 py-0.5 font-mono tnum text-[0.6875rem] text-text">
                {t.badge}
              </span>
            )}
          </button>
        )
      })}
      {children}
    </div>
  )
}

/** Panel matching a `Tabs` item. Ids must agree with the tab's `value`. */
export function TabPanel({
  value,
  children,
  className,
}: {
  value: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      tabIndex={0}
      className={cn('outline-none', className)}
    >
      {children}
    </div>
  )
}

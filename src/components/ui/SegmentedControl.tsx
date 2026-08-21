'use client'

import { useRef } from 'react'
import { cn } from './cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  /** Optional icon rendered above (stacked) or before (inline) the label. */
  icon?: React.ReactNode
  /** Supporting line, only rendered in the `stacked` layout. */
  description?: React.ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  label?: React.ReactNode
  /** Accessible name when no visible `label` is rendered. */
  ariaLabel?: string
  /** `inline` = pill row; `stacked` = card grid with icon + description. */
  layout?: 'inline' | 'stacked'
  /**
   * Colour of the selected segment. `accent` (amber) is for choices that drive
   * a calculation; `brand` (blue) is for settings, so a preference toggle does
   * not compete visually with the page's primary action.
   */
  tone?: 'accent' | 'brand'
  /** Forces the inline layout onto one row per option on narrow screens. */
  fullWidth?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Mutually exclusive choice.
 *
 * Consolidates DiveModeSelector, GasTypeSelector and the PreferencesModal
 * inline button groups, which each reimplemented the same pattern.
 *
 * Implemented as a `radiogroup` with roving arrow-key focus — the correct
 * semantics for "pick exactly one", and what a screen-reader user expects.
 *
 * @example
 * <SegmentedControl label="Dive mode" value={mode} onChange={setMode}
 *   options={[{ value: 'oc', label: 'Open circuit' },
 *             { value: 'ccr', label: 'Rebreather' }]} />
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  layout = 'inline',
  tone = 'accent',
  fullWidth = true,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (from: number, dir: 1 | -1) => {
    const n = options.length
    for (let i = 1; i <= n; i++) {
      const next = (from + dir * i + n * i) % n
      if (!options[next].disabled) {
        onChange(options[next].value)
        refs.current[next]?.focus()
        return
      }
    }
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(index, 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(index, -1)
    }
  }

  const stacked = layout === 'stacked'

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <span className="text-sm font-medium text-text">{label}</span>}
      <div
        role="radiogroup"
        aria-label={label ? undefined : ariaLabel}
        aria-labelledby={undefined}
        className={cn(
          stacked
            ? 'grid grid-cols-1 gap-2 sm:grid-cols-2'
            : cn(
                'inline-flex rounded-sm border border-border bg-surface-1 p-1',
                fullWidth && 'w-full'
              )
        )}
      >
        {options.map((opt, i) => {
          const selected = opt.value === value
          return (
            <button
              key={opt.value}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={opt.disabled}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-sm font-medium',
                'transition-colors motion-reduce:transition-none',
                'disabled:cursor-not-allowed disabled:opacity-40',
                stacked
                  ? cn(
                      'min-h-11 flex-col items-start gap-1 border p-3 text-left',
                      selected
                        ? tone === 'brand'
                          ? 'border-brand bg-surface-2 text-text'
                          : 'border-accent bg-surface-2 text-text'
                        : 'border-border bg-surface-1 text-text-muted hover:border-border-strong hover:text-text'
                    )
                  : cn(
                      fullWidth && 'flex-1',
                      size === 'sm' ? 'min-h-9 px-3 text-xs' : 'min-h-11 px-4 text-sm',
                      selected
                        ? tone === 'brand'
                          ? 'bg-brand-muted text-brand-strong'
                          : 'bg-accent text-on-accent'
                        : 'text-text-muted hover:bg-surface-2 hover:text-text'
                    )
              )}
            >
              {opt.icon && (
                <span aria-hidden="true" className={cn('shrink-0', stacked && 'text-accent')}>
                  {opt.icon}
                </span>
              )}
              <span className={cn(stacked && 'font-semibold')}>{opt.label}</span>
              {stacked && opt.description && (
                <span
                  className={cn(
                    'text-xs font-normal',
                    selected ? 'text-text-muted' : 'text-text-subtle'
                  )}
                >
                  {opt.description}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

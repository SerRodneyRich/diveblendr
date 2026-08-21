'use client'

import { useId } from 'react'
import { cn } from './cn'

export interface SliderProps {
  label?: React.ReactNode
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  /** Unit appended to the readout and to the screen-reader value text. */
  unit?: string
  /** Decimal places in the readout. Defaults to the step's precision. */
  precision?: number
  /** Helper text under the track. */
  hint?: React.ReactNode
  /** Rendered to the right of the label, before the numeric readout. */
  labelAction?: React.ReactNode
  /** Hides the numeric readout beside the label. */
  hideValue?: boolean
  /** Colour of the filled portion. Defaults to the accent. */
  tone?: 'accent' | 'o2' | 'he' | 'n2' | 'info' | 'warning' | 'danger'
  disabled?: boolean
  className?: string
  /** Overrides the spoken value, e.g. "1.4 bar partial pressure". */
  ariaValueText?: string
}

const toneFill: Record<NonNullable<SliderProps['tone']>, string> = {
  accent: 'var(--color-accent)',
  o2: 'var(--color-o2)',
  he: 'var(--color-he)',
  n2: 'var(--color-n2)',
  info: 'var(--color-info)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
}

/**
 * Range slider with a live numeric readout.
 *
 * Replaces the four hand-rolled `type="range"` patterns, each of which styled
 * its own track and thumb. Built on the native input so keyboard interaction,
 * `aria-valuenow` and touch dragging come for free; the fill is painted with a
 * gradient driven by the current value.
 *
 * The thumb is 22px with a 44px tall hit area, meeting the touch-target
 * minimum without a visually oversized control.
 *
 * @example
 * <Slider label="Target ppO₂" value={ppo2} onChange={setPpo2}
 *         min={1.0} max={1.6} step={0.1} unit=" bar" />
 */
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
  precision,
  hint,
  labelAction,
  hideValue = false,
  tone = 'accent',
  disabled,
  className,
  ariaValueText,
}: SliderProps) {
  const id = useId()
  const hintId = useId()
  const decimals =
    precision ?? (String(step).includes('.') ? String(step).split('.')[1].length : 0)

  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  const display = `${value.toFixed(decimals)}${unit}`

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || !hideValue) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={id} className="text-sm font-medium text-text">
              {label}
            </label>
          )}
          <div className="flex items-center gap-2">
            {labelAction}
            {!hideValue && (
              <span className="font-mono tnum text-sm font-semibold text-accent">
                {display}
              </span>
            )}
          </div>
        </div>
      )}

      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-describedby={hint ? hintId : undefined}
        aria-valuetext={ariaValueText ?? display}
        style={
          {
            '--fill': toneFill[tone],
            '--pct': `${pct}%`,
          } as React.CSSProperties
        }
        className={cn(
          // 44px hit area, visually a 6px track.
          'h-11 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-50',
          // Track — WebKit
          '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full',
          '[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--fill)_var(--pct),var(--color-surface-3)_var(--pct))]',
          // Thumb — WebKit
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-2',
          '[&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-[22px]',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--fill)]',
          '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface-0',
          '[&::-webkit-slider-thumb]:shadow-md',
          // Track — Firefox
          '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-3',
          '[&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-[var(--fill)]',
          // Thumb — Firefox
          '[&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:border-2',
          '[&::-moz-range-thumb]:border-surface-0 [&::-moz-range-thumb]:bg-[var(--fill)]',
          '[&::-moz-range-thumb]:rounded-full'
        )}
      />

      {hint && (
        <p id={hintId} className="text-xs text-text-subtle">
          {hint}
        </p>
      )}
    </div>
  )
}

'use client'

import { useCallback, useId, useState } from 'react'
import { HiOutlineMinus, HiOutlinePlus } from 'react-icons/hi2'
import { FieldShell, controlBase } from './Field'
import { cn } from './cn'

export interface NumberFieldProps {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  labelAction?: React.ReactNode
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Unit shown after the value, e.g. "m", "bar", "%". */
  unit?: React.ReactNode
  /** Decimal places used when clamping/stepping. Defaults to the step's precision. */
  precision?: number
  disabled?: boolean
  className?: string
  id?: string
  name?: string
}

function round(value: number, precision: number) {
  const f = 10 ** precision
  return Math.round(value * f) / f
}

/**
 * Numeric input with stepper buttons and a unit suffix.
 *
 * TYPING IS FREE; CLAMPING HAPPENS ON BLUR
 * ----------------------------------------
 * The field previously clamped to `[min, max]` on every keystroke, which made
 * it impossible to type most numbers. With `min=10`, clearing the box and
 * typing "3" clamped instantly to 10, so the next keystroke landed on "10" and
 * you got "103" — you could only reach a value by holding the steppers.
 *
 * While focused the input is now an uncontrolled draft string: you can empty
 * it, type a leading "3" on the way to "30", or start with "." or "-". The
 * draft is parsed and pushed upstream on every keystroke *if* it is a complete
 * number in range, so results still update live. Clamping and rounding wait
 * for blur (or Enter), which is the point at which a half-typed value is
 * genuinely finished.
 *
 * Stepper buttons are 44px for touch and clamp immediately, since a click is
 * always a complete action.
 *
 * THE FIELD SIZES ITSELF TO ITS OWN WIDTH, NOT THE VIEWPORT
 * ---------------------------------------------------------
 * A viewport breakpoint cannot tell how much room *this* field actually got:
 * the same `md:` state covers a full-width field in a wide card and a field
 * sharing a two-column grid inside a narrow one. That is how the O2/He pairs
 * ended up with 94px of text area — a 44px stepper each side plus a 36px unit
 * suffix, all fixed — while a fill-pressure box beside them had 349px going
 * spare. Four digits landed underneath the unit and became unreadable.
 *
 * The row is a container, so the field responds to the space it was handed.
 * Under 15rem the steppers drop out: they are the least valuable 88px on the
 * row, and the number has to win that trade. They are `display:none` there, so
 * they leave the accessibility tree with the layout rather than lingering as
 * invisible tab stops — the input is still a native `type=number`, so arrow
 * keys, typing and the mobile spinner all reach every value without them.
 *
 * @example
 * <NumberField label="Target depth" value={depth} onChange={setDepth}
 *               min={0} max={200} step={1} unit="m" />
 */
export function NumberField({
  label,
  hint,
  error,
  labelAction,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  precision,
  disabled,
  className,
  name,
}: NumberFieldProps) {
  const decimals =
    precision ?? (String(step).includes('.') ? String(step).split('.')[1].length : 0)

  const commit = useCallback(
    (next: number) => {
      if (Number.isNaN(next)) return
      onChange(round(Math.min(max, Math.max(min, next)), decimals))
    },
    [onChange, min, max, decimals]
  )

  /**
   * What the box shows while the user is typing. `null` means "mirror `value`",
   * so an external change — a unit switch, a preset, a reset — flows straight
   * through to any field that is not being edited.
   */
  const [draft, setDraft] = useState<string | null>(null)

  const handleChange = (raw: string) => {
    setDraft(raw)
    // Push upstream only when the draft is already a usable number, so the
    // results panel tracks typing without the box fighting back. Anything
    // partial ("", "-", "3.") is held until blur.
    const n = parseFloat(raw)
    if (!Number.isNaN(n) && n >= min && n <= max && String(n) === raw.trim()) {
      onChange(round(n, decimals))
    }
  }

  const handleBlur = () => {
    if (draft === null) return
    const n = parseFloat(draft)
    // An empty or unparseable box reverts to the last good value rather than
    // writing NaN into a calculation.
    if (!Number.isNaN(n)) commit(n)
    setDraft(null)
  }

  const atMin = value <= min
  const atMax = value >= max

  // The unit is visible text, not decoration: labels say "Start pressure", not
  // "Start pressure (psi)", so hiding it would drop the unit for anyone using
  // a screen reader. It is described-by instead, and read after the value.
  const unitId = useId()

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      labelAction={labelAction}
      className={className}
    >
      {({ controlId, describedBy }) => (
        <div className="@container/field flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={() => { setDraft(null); commit(value - step) }}
            disabled={disabled || atMin}
            aria-label={`Decrease ${typeof label === 'string' ? label : 'value'}`}
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface-2 text-text transition-colors motion-reduce:transition-none hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40 @[15rem]/field:flex"
          >
            <HiOutlineMinus className="h-4 w-4" />
          </button>

          {/* A one-cell grid the input and the unit both sit in. The unit is a
              real grid item, so it contributes its own width to the column
              track and the input's padding follows it — no hardcoded 36px, no
              measuring in JS. `min-w-0` lets the whole field shrink inside a
              narrow grid cell instead of forcing the card to overflow. */}
          <div
            className={cn(
              // The border and glass live on the wrapper, painted once. Doing
              // it per-child stacked two translucent layers and left a visible
              // seam between the value and its unit.
              controlBase,
              'grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center px-0',
              'focus-within:border-brand',
              error && 'border-danger'
            )}
          >
            <input
              id={controlId}
              name={name}
              type="number"
              inputMode="decimal"
              value={draft ?? (Number.isFinite(value) ? String(value) : '')}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              min={Number.isFinite(min) ? min : undefined}
              max={Number.isFinite(max) ? max : undefined}
              step={step}
              disabled={disabled}
              aria-describedby={cn(unit && unitId, describedBy) || undefined}
              aria-invalid={error ? true : undefined}
              className={cn(
                // Transparent: the wrapper carries the chrome. The focus ring
                // is on the wrapper too, so it surrounds value and unit alike.
                'col-start-1 row-start-1 w-full min-w-0 bg-transparent py-2 ps-3 outline-none',
                // Left-aligned, not centred: with a unit to the right,
                // centring measures the padded box and drifts the value toward
                // the suffix — worst exactly where room is tightest. A fixed
                // left edge also stops digits jittering sideways as you type.
                'text-left font-mono tnum text-text',
                'disabled:cursor-not-allowed',
                unit ? 'pe-1' : 'pe-3',
                // The native spinners duplicate our stepper buttons.
                '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
              )}
            />
            {unit && (
              <span
                id={unitId}
                className="pointer-events-none col-start-2 row-start-1 select-none pe-3 text-sm whitespace-nowrap text-text-muted"
              >
                {unit}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => { setDraft(null); commit(value + step) }}
            disabled={disabled || atMax}
            aria-label={`Increase ${typeof label === 'string' ? label : 'value'}`}
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface-2 text-text transition-colors motion-reduce:transition-none hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40 @[15rem]/field:flex"
          >
            <HiOutlinePlus className="h-4 w-4" />
          </button>
        </div>
      )}
    </FieldShell>
  )
}

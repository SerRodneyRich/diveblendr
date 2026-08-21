'use client'

import { forwardRef, useId } from 'react'
import { cn } from './cn'

/** Shared control chrome so Input, Select and NumberField sit on the same grid. */
export const controlBase =
  'w-full min-h-11 rounded-sm glass-raised border-border-strong px-3 text-text ' +
  'placeholder:text-text-subtle transition-colors motion-reduce:transition-none ' +
  'hover:border-brand-muted disabled:opacity-50 disabled:cursor-not-allowed'

export interface FieldShellProps {
  label?: React.ReactNode
  /** Helper text under the control. */
  hint?: React.ReactNode
  /** Error message. Replaces `hint` and marks the control invalid. */
  error?: React.ReactNode
  /** Rendered to the right of the label — unit toggles, "Manage" links, etc. */
  labelAction?: React.ReactNode
  required?: boolean
  className?: string
  children: (ids: { controlId: string; describedBy?: string }) => React.ReactNode
}

/**
 * Label + hint/error wrapper shared by every form control, so the
 * label-for/aria-describedby wiring is written once rather than per field.
 */
export function FieldShell({
  label,
  hint,
  error,
  labelAction,
  required,
  className,
  children,
}: FieldShellProps) {
  const controlId = useId()
  const messageId = useId()
  const message = error ?? hint
  const describedBy = message ? messageId : undefined

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {(label || labelAction) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={controlId} className="text-sm font-medium text-text">
              {label}
              {required && (
                <span aria-hidden="true" className="ml-0.5 text-danger">
                  *
                </span>
              )}
            </label>
          )}
          {labelAction}
        </div>
      )}
      {children({ controlId, describedBy })}
      {message && (
        <p
          id={messageId}
          className={cn('text-xs leading-snug', error ? 'text-danger' : 'text-text-subtle')}
        >
          {message}
        </p>
      )}
    </div>
  )
}

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  labelAction?: React.ReactNode
  /** Static text pinned inside the right edge — e.g. a unit like "m" or "bar". */
  suffix?: React.ReactNode
  /** Wrapper class. Use `className` for the input element itself. */
  containerClassName?: string
}

/**
 * Single-line text input with label, hint/error and an optional unit suffix.
 *
 * THE SUFFIX IS A SIBLING, NOT AN OVERLAY (C2)
 * --------------------------------------------
 * The suffix used to be absolutely positioned inside the input's right padding,
 * held clear by a fixed `pr-10`. That padding is a guess: it is right for "m",
 * too wide for "%", and too narrow for "lb/ft³" or "cuft" — and a value long
 * enough to reach it simply scrolled underneath, which is the same defect
 * `NumberField` was rebuilt to remove.
 *
 * The suffix is now a real grid column. It contributes its own width to the
 * track, so the input's usable area follows the actual suffix rather than a
 * hardcoded reserve, and no value can ever render beneath it.
 *
 * Border and glass live on the wrapper and are painted once: applying
 * `controlBase` to both children stacks two translucent layers and leaves a
 * visible seam between the value and its unit.
 *
 * @example
 * <Input label="Dive site" placeholder="Blue Hole" />
 * <Input label="Depth" type="number" suffix="m" />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, labelAction, suffix, className, containerClassName, required, ...props },
  ref
) {
  // The suffix is visible text carrying the unit, not decoration: labels read
  // "Depth", not "Depth (m)", so hiding it would drop the unit for anyone on a
  // screen reader. It is described-by instead, and announced after the value.
  const suffixId = useId()

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      labelAction={labelAction}
      required={required}
      className={containerClassName}
    >
      {({ controlId, describedBy }) => {
        const control = (
          <input
            ref={ref}
            id={controlId}
            aria-describedby={cn(suffix && suffixId, describedBy) || undefined}
            aria-invalid={error ? true : undefined}
            required={required}
            className={cn(
              // With a suffix the chrome moves to the wrapper, so the input
              // itself goes transparent and keeps only its own typography.
              suffix
                ? 'col-start-1 row-start-1 w-full min-w-0 bg-transparent py-2 ps-3 pe-1 text-text outline-none disabled:cursor-not-allowed'
                : cn(controlBase, 'py-2'),
              // Numeric input lines up with StatCard values. The native
              // spinners are suppressed: they are a ~10px hit target, and
              // NumberField exists for when steppers are actually wanted.
              props.type === 'number' &&
                'font-mono tnum [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
              !suffix && error && 'border-danger',
              className
            )}
            {...props}
          />
        )

        if (!suffix) return control

        return (
          <div
            className={cn(
              controlBase,
              'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center px-0',
              'focus-within:border-brand',
              error && 'border-danger'
            )}
          >
            {control}
            <span
              id={suffixId}
              className="pointer-events-none col-start-2 row-start-1 select-none pe-3 text-sm whitespace-nowrap text-text-muted"
            >
              {suffix}
            </span>
          </div>
        )
      }}
    </FieldShell>
  )
})

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  labelAction?: React.ReactNode
  containerClassName?: string
}

/**
 * Native select — deliberately native, because the OS picker is the best
 * mobile experience and needs no focus management of our own.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, labelAction, className, containerClassName, required, children, ...props },
  ref
) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      labelAction={labelAction}
      required={required}
      className={containerClassName}
    >
      {({ controlId, describedBy }) => (
        <div className="relative">
          <select
            ref={ref}
            id={controlId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required={required}
            className={cn(
              controlBase,
              'cursor-pointer appearance-none py-2 pr-9',
              error && 'border-danger',
              className
            )}
            {...props}
          >
            {children}
          </select>
          {/* Real element rather than a background-image data URI, so the
              chevron takes its colour from the same token as the text. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      )}
    </FieldShell>
  )
})

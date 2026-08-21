'use client'

import { useId } from 'react'
import { cn } from './cn'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: React.ReactNode
  /** Supporting line under the label. */
  description?: React.ReactNode
  disabled?: boolean
  className?: string
  /** Accessible name when no visible `label` is rendered. */
  ariaLabel?: string
}

/**
 * On/off toggle.
 *
 * Uses `role="switch"` on a real button rather than a styled checkbox, so the
 * state is announced as on/off rather than checked/unchecked. The whole row is
 * the label target, giving a comfortably large tap area.
 *
 * @example
 * <Switch checked={hc} onChange={setHc} label="High contrast"
 *         description="Maximises contrast for low-vision use." />
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  ariaLabel,
}: SwitchProps) {
  const labelId = useId()
  const descId = useId()

  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      aria-describedby={description ? descId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full',
        'transition-colors motion-reduce:transition-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-surface-3'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-surface-0 shadow',
          'transition-transform motion-reduce:transition-none',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )

  if (!label) return <div className={className}>{control}</div>

  return (
    // The 44px min-height is the touch target: the visual switch is 24px tall,
    // but the whole row is clickable.
    <div className={cn('flex min-h-11 items-center justify-between gap-4', className)}>
      <span className="min-w-0">
        <span id={labelId} className="block text-sm font-medium text-text">
          {label}
        </span>
        {description && (
          <span id={descId} className="mt-0.5 block text-xs text-text-muted">
            {description}
          </span>
        )}
      </span>
      {control}
    </div>
  )
}

'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { HiOutlineInformationCircle } from 'react-icons/hi2'
import { cn } from './cn'

export interface TooltipProps {
  content: React.ReactNode
  /** The trigger. Defaults to an info icon button. */
  children?: React.ReactNode
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  className?: string
  /** Accessible name for the default icon trigger. */
  label?: string
}

/**
 * Supplementary detail attached to a control.
 *
 * Explicitly **tap-to-toggle as well as hover**: the previous tooltips in this
 * app opened on `:hover` only, which is unreachable on a phone — where most of
 * this app is actually used, often through a wet screen on a boat.
 *
 * The trigger is a real button, so it is keyboard reachable and the content is
 * associated via `aria-describedby`. Closes on Escape, outside click, or blur.
 *
 * Anything a diver *must* read to act safely belongs in a `Banner`, not here.
 *
 * @example
 * <Tooltip content="Fraction of oxygen, 0–1." />
 * <Tooltip content="Uses the NOAA table."><span>CNS%</span></Tooltip>
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  className,
  label = 'More information',
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('touchstart', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('touchstart', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={children ? undefined : label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          'inline-flex items-center justify-center rounded-full text-text-muted',
          'transition-colors motion-reduce:transition-none hover:text-accent',
          // 44px hit area via padding, without inflating the visual footprint.
          children ? 'gap-1' : 'h-11 w-11 -m-3.5'
        )}
      >
        {children ?? <HiOutlineInformationCircle className="h-4 w-4" />}
      </button>

      {open && (
        <div
          id={id}
          role="tooltip"
          className={cn(
            'absolute z-overlay w-max max-w-xs rounded-sm border border-border-strong',
            'bg-surface-2 px-3 py-2 text-xs leading-relaxed text-text shadow-xl',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            align === 'center' && 'left-1/2 -translate-x-1/2',
            align === 'start' && 'left-0',
            align === 'end' && 'right-0'
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}

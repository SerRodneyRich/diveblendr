'use client'

/**
 * Before/after comparison.
 *
 * The single most important control in a correction tool, and the previous
 * editor had none: you could not see what you had changed.
 *
 * Two modes, because they answer different questions:
 *  - **Split** — a draggable wipe. Good for judging a boundary in detail.
 *  - **Hold** — press and hold to see the original. Good for judging the whole
 *    frame at once, which a split view cannot show.
 *
 * The slider is a real `<input type=range>` so it is keyboard-operable and
 * screen-reader-labelled for free; it is visually replaced by the handle but
 * still receives focus and arrow keys.
 */

import { useCallback, useRef, useState } from 'react'
import { cn } from '@/components/ui'

export interface CompareViewProps {
  /** Original image URL. */
  beforeSrc: string
  /** Corrected image URL. */
  afterSrc: string
  alt: string
  className?: string
}

export function CompareView({ beforeSrc, afterSrc, alt, className }: CompareViewProps) {
  const [position, setPosition] = useState(50)
  const [holding, setHolding] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const showOriginalOnly = holding

  const handlePointer = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.max(0, Math.min(100, pct)))
  }, [])

  const draggingRef = useRef(false)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        ref={containerRef}
        className="relative select-none overflow-hidden rounded-md bg-surface-0"
        onPointerDown={(e) => {
          // Ignore the range input's own pointer events; it manages itself.
          if ((e.target as HTMLElement).tagName === 'INPUT') return
          draggingRef.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          handlePointer(e.clientX)
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) handlePointer(e.clientX)
        }}
        onPointerUp={(e) => {
          draggingRef.current = false
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
        }}
      >
        {/* Corrected image is the base layer. */}
        <img
          src={afterSrc}
          alt={alt}
          className="block max-h-[60vh] w-full object-contain"
          draggable={false}
        />

        {/* Original, clipped to the wipe position (or fully shown while held). */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: showOriginalOnly
              ? 'inset(0 0 0 0)'
              : `inset(0 ${100 - position}% 0 0)`,
          }}
        >
          <img
            src={beforeSrc}
            alt={`${alt} — before correction`}
            className="block max-h-[60vh] w-full object-contain"
            draggable={false}
          />
        </div>

        {/* Wipe handle. Hidden while holding, when there is no split to show. */}
        {!showOriginalOnly && (
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
            style={{ left: `${position}%` }}
            aria-hidden="true"
          >
            <div className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-accent bg-surface-1 shadow-md">
              <span className="text-accent text-xs">◂▸</span>
            </div>
          </div>
        )}

        {/* Corner labels so the two sides are never ambiguous. */}
        <span className="pointer-events-none absolute top-2 left-2 rounded bg-surface-0/80 px-2 py-0.5 text-xs text-text-muted">
          Before
        </span>
        {!showOriginalOnly && (
          <span className="pointer-events-none absolute top-2 right-2 rounded bg-surface-0/80 px-2 py-0.5 text-xs text-text-muted">
            After
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="compare-position" className="sr-only">
          Comparison position
        </label>
        <input
          id="compare-position"
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          className="h-11 flex-1 cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-surface-3 [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface-0 [&::-webkit-slider-thumb]:bg-accent [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-3 [&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface-0 [&::-moz-range-thumb]:bg-accent"
        />
        <button
          type="button"
          className="inline-flex h-11 shrink-0 items-center rounded-md border border-border-strong bg-surface-2 px-3 text-sm text-text hover:bg-surface-3"
          onPointerDown={() => setHolding(true)}
          onPointerUp={() => setHolding(false)}
          onPointerLeave={() => setHolding(false)}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') setHolding(true)
          }}
          onKeyUp={() => setHolding(false)}
          onBlur={() => setHolding(false)}
        >
          Hold to compare
        </button>
      </div>
    </div>
  )
}

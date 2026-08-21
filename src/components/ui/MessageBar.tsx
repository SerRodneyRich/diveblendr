'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HiOutlineChevronUp, HiOutlineXMark } from 'react-icons/hi2'
import { Banner, severityRank, type Severity } from './Banner'
import { cn } from './cn'

export interface MessageBarItem {
  id?: string
  severity: Severity
  title?: React.ReactNode
  message: React.ReactNode
}

export interface MessageBarProps {
  items: MessageBarItem[]
  /** Accessible name for the bar. Defaults to "Messages". */
  label?: string
  className?: string
}

const toneByWorst: Record<Severity, { bar: string; dot: string; word: string }> = {
  danger: { bar: 'bg-danger-bg border-danger-border', dot: 'text-danger', word: 'Danger' },
  warning: { bar: 'bg-warning-bg border-warning-border', dot: 'text-warning', word: 'Warning' },
  info: { bar: 'bg-info-bg border-info-border', dot: 'text-info', word: 'Note' },
  success: { bar: 'bg-success-bg border-success-border', dot: 'text-success', word: 'OK' },
}

/**
 * The messages a tool emits, docked to the bottom of the viewport.
 *
 * Warnings used to sit inline above the results. That put them in the document
 * flow, so every one that appeared or vanished as a slider crossed a threshold
 * moved the page underneath the diver's hands: dragging oxygen across 22→23% on
 * MOD check shifted every input below it 54px up, then back down two steps
 * later. Reserving space per page only trades a jump for dead space, and has to
 * be re-guessed for every tool.
 *
 * Docking removes the class of problem instead of one instance. The bar is
 * fixed, so nothing it does can move page content, and its own height is
 * constant — one row, always collapsed, tinted by the worst severity present
 * and counting the rest. Opening it raises a panel *over* the page rather than
 * pushing it.
 *
 * It also settles the older conflict this replaces: warnings competing with
 * results for the top of the page, which is why the inline stack collapsed
 * everything by default on the pages with the most to say.
 */
export function MessageBar({ items, label = 'Messages', className }: MessageBarProps) {
  const [open, setOpen] = useState(false)
  // A portal cannot render during SSR or the first client pass, where
  // `document` either does not exist or has not been hydrated against.
  const [mounted, setMounted] = useState(false)
  const panelId = useId()
  const barRef = useRef<HTMLDivElement>(null)

  const sorted = [...items].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity]
  )
  const worst = sorted[0]?.severity

  useEffect(() => setMounted(true), [])

  // Close when the messages go away, so the panel cannot linger over a page
  // that has nothing left to say.
  useEffect(() => {
    if (items.length === 0) setOpen(false)
  }, [items.length])

  // Escape closes the panel, matching every other dismissible surface here.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        barRef.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (items.length === 0 || !worst) return null

  const tone = toneByWorst[worst]
  const counts = sorted.reduce<Record<string, number>>((acc, m) => {
    acc[m.severity] = (acc[m.severity] ?? 0) + 1
    return acc
  }, {})
  const summary = Object.entries(counts)
    .map(([sev, n]) => `${n} ${sev}`)
    .join(', ')

  // Rendered into `document.body`, not in place. `position: fixed` resolves
  // against the nearest ancestor that establishes a containing block, and the
  // app shell's layout does establish one — measured: the identical element
  // sits at the viewport floor on <body> and 16px short of it inside the shell,
  // leaving a strip of page visible under the bar. A portal sidesteps the whole
  // question rather than hunting for which property caused it.
  if (!mounted) return null

  return createPortal(
    <>
      {/* The panel's scrim. Click-away closes; it sits under the bar so the
          bar stays operable while open. */}
      {open && (
        <div
          className="fixed inset-0 z-toast-scrim bg-abyss/50"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Fixed to the viewport, not sticky. Sticky only pins inside a scroll
          container that is actually taller than the viewport: on a short page
          like SAC there is nothing to stick to, so the bar sat wherever the
          content happened to end, mid-screen.

          `--shell-rail` is the docked sidebar's width, published by AppShell.
          It is 0 below the `lg` breakpoint, where the drawer is an overlay
          rather than part of the layout. The bottom offset clears the mobile
          tab bar and the device's safe-area inset; on desktop that bar is gone
          and the offset drops to zero. */}
      <div
        ref={barRef}
        className={cn(
          'fixed inset-x-0 z-toast lg:left-[var(--shell-rail,0px)]',
          'bottom-[calc(3.5rem+env(safe-area-inset-bottom))] lg:bottom-0',
          className
        )}
      >
        {/* The expanded messages. Absolutely positioned above the bar, so
            opening the panel cannot change the bar's own height either.

            Always rendered, only visually hidden when closed. Unmounting it
            would take every message except the worst out of the accessibility
            tree and out of reach of a screen reader's virtual cursor — the bar
            would then be the only record of what the tool said. `hidden`
            keeps it out of the tab order and off the screen while leaving the
            text in the document. */}
        <div
          id={panelId}
          hidden={!open}
          className="absolute inset-x-0 bottom-full max-h-[60vh] overflow-y-auto border-t border-border bg-surface-1 p-3"
        >
          <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-2">
            {sorted.map((m, i) => (
              <Banner key={m.id ?? i} severity={m.severity} title={m.title}>
                {m.message}
              </Banner>
            ))}
          </div>
        </div>

        {/* Opaque, not `glass`. The bar overlays scrolling content, and at 72%
            translucency the cards passing underneath read as a rendering
            fault rather than as depth. */}
        <div
          className={cn(
            'border-x-0 border-b-0 border-t bg-surface-1',
            tone.bar
          )}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto flex w-full min-w-0 max-w-[110rem] items-center gap-2 px-3 md:px-5">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={panelId}
              // `min-w-0` on both the button and the label below: a flex child
              // defaults to min-content width, so without it `truncate` never
              // engages and the message is cut mid-word with no ellipsis.
              className="flex min-h-11 w-full min-w-0 flex-1 items-center gap-2 text-left text-sm text-text"
            >
              {/* Severity is carried by the word as well as the tint, so the
                  ranking survives without colour. */}
              <span className={cn('font-semibold', tone.dot)}>{tone.word}</span>
              {/* The worst message's own text, never just a count. Collapsing
                  a danger to "1 danger" hides the one sentence the diver needs
                  — which limit, at what depth — behind a click. The text
                  truncates rather than wrapping, so the bar stays one row. */}
              <span className="min-w-0 flex-1 truncate text-text-muted">
                {sorted[0].message}
              </span>
              {sorted.length > 1 && (
                <span className="shrink-0 text-xs text-text-subtle">
                  +{sorted.length - 1}
                </span>
              )}
              {open ? (
                <HiOutlineXMark className="h-4 w-4 shrink-0 text-text-muted" />
              ) : (
                <HiOutlineChevronUp className="h-4 w-4 shrink-0 text-text-muted" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Announced separately from the bar's own label, so a recalculation
          reports its worst message without the diver opening the panel. */}
      <p aria-live="polite" className="sr-only">
        {label}: {summary}.
      </p>
    </>,
    document.body
  )
}

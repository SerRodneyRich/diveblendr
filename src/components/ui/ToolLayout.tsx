'use client'

import { cn } from './cn'

/**
 * The shared two-column frame for every calculator page.
 *
 * WHY THIS EXISTS
 * ---------------
 * Each tool had its own hand-written `lg:grid-cols-[...]`, with a different
 * ratio per page and neither column sticky. Because the two sides are never
 * the same height, whichever ran shorter left a dead zone: Best mix ran to
 * 1732px against a 900px fold with its inputs ending at ~690, and the blender
 * had the reverse — results stopping at ~630 while inputs continued to 1307.
 * Either way a diver scrolls a tall column while staring at empty space beside
 * it, and loses sight of the numbers they are changing.
 *
 * WHAT IT DOES
 * ------------
 * On desktop the shorter side pins. `<Inputs sticky>` keeps the controls in
 * view while a long results column scrolls; `<Results sticky>` does the
 * converse for a page whose inputs are the long side. Sticky is scoped to
 * `lg:` and up — below that the columns stack, where pinning would eat a
 * viewport that has no room to spare.
 *
 * Stack order is inputs first, because on a phone you must reach the controls
 * before their output means anything. The visual input/output distinction is
 * carried by `<Card panel="input">` / `panel="output"`, so it survives the
 * collapse to one column, where left/right no longer says anything.
 */

/** Height of the sticky app header (h-14) plus a little breathing room. */
const STICKY_TOP = 'md:top-[4.5rem]'

export interface ToolLayoutProps {
  children: React.ReactNode
  /**
   * Column ratio at `md:` and up. `balanced` splits evenly for pages whose two
   * sides carry similar weight; `narrow-input` gives the results the room, for
   * pages whose inputs are a handful of fields.
   */
  ratio?: 'balanced' | 'narrow-input'
  className?: string
}

export function ToolLayout({ children, ratio = 'narrow-input', className }: ToolLayoutProps) {
  return (
    <div
      className={cn(
        'grid gap-4 md:items-start',
        // Splits at md: (768px), not lg:. A portrait tablet is 820px wide and
        // has ample room for two columns; holding the split back to 1024 left
        // it rendering a phone layout with ~300px of empty gutter either side.
        ratio === 'narrow-input'
          ? 'md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]'
          : 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]',
        className
      )}
    >
      {children}
    </div>
  )
}

interface ColumnProps {
  children: React.ReactNode
  /**
   * Pins this column on desktop. Use on the *shorter* side — pinning the long
   * side does nothing, since it scrolls past the viewport anyway.
   */
  sticky?: boolean
  className?: string
}

/** The controls column. Stacks first on mobile. */
export function Inputs({ children, sticky = false, className }: ColumnProps) {
  return (
    <div
      className={cn(
        'space-y-4',
        // `max-h` + `overflow-y-auto` so a sticky column that is itself taller
        // than the viewport can still be scrolled to its end, rather than
        // having its lower fields become permanently unreachable.
        sticky && `${STICKY_TOP} md:sticky md:max-h-[calc(100dvh-5.5rem)] md:overflow-y-auto md:pr-1`,
        className
      )}
    >
      {children}
    </div>
  )
}

/** The results column. Stacks second on mobile. */
export function Results({ children, sticky = false, className }: ColumnProps) {
  return (
    <div
      className={cn(
        'space-y-4',
        sticky && `${STICKY_TOP} md:sticky md:max-h-[calc(100dvh-5.5rem)] md:overflow-y-auto md:pr-1`,
        className
      )}
    >
      {children}
    </div>
  )
}

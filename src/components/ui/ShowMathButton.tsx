'use client'

import { TbMath } from 'react-icons/tb'
import { Button } from './Button'
import { cn } from './cn'

export interface ShowMathButtonProps {
  onClick: () => void
  /**
   * Names what the working is for, when a page has more than one derivation —
   * Best mix has a button per gas. Appended to the accessible label only; the
   * visible text stays "Show the math" everywhere.
   */
  subject?: string
  className?: string
}

/**
 * The one control that opens a derivation.
 *
 * There were four of these, with three different labels ("Show the math",
 * "Show the derivation", "Math"), two different presentations (icon+text on
 * Best mix, bare text elsewhere) and a different position on every page. The
 * same affordance has to look and read the same everywhere, or a diver has to
 * learn it once per tool.
 *
 * Placement is fixed too: `MathTrigger` puts it top-right of the results
 * column, which is where a reader looks after reading a number and wanting to
 * know where it came from.
 */
export function ShowMathButton({ onClick, subject, className }: ShowMathButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      leadingIcon={<TbMath />}
      onClick={onClick}
      aria-label={subject ? `Show the math for ${subject}` : undefined}
      className={cn(
        // Light green, outlined, rounded — the one control on the site that is
        // neither an input nor a result, so it reads as its own thing rather
        // than competing with the amber primary action.
        //
        // Text is near-black, not white: measured against #a7f3d0, white lands
        // at 1.28:1 and black at 16.37:1, against a 4.5:1 minimum. On a light
        // background the dark text is the only readable choice.
        'rounded-md border border-math-border bg-math text-math-text',
        'hover:bg-math-strong hover:text-math-text',
        className
      )}
    >
      Show the math
    </Button>
  )
}

/**
 * Right-aligned row for a `ShowMathButton`, so every tool places it the same.
 *
 * Sits directly above the results it explains, aligned to their right edge.
 */
export function MathTrigger({
  onClick,
  subject,
  className,
}: ShowMathButtonProps) {
  return (
    <div className={cn('flex justify-end', className)}>
      <ShowMathButton onClick={onClick} subject={subject} />
    </div>
  )
}

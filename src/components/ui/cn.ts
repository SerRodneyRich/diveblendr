import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge conditional class names, with later Tailwind utilities winning over
 * earlier conflicting ones.
 *
 * `clsx` handles the conditional/array/object forms; `tailwind-merge` resolves
 * conflicts so a caller's `className` can always override a variant default
 * (e.g. passing `px-8` beats the variant's `px-4`) without needing `!important`.
 *
 * @example
 * cn('px-4 py-2', isWide && 'px-8', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

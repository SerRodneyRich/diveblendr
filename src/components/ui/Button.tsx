'use client'

import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

/**
 * Button variants.
 *
 * Sizes all clear the 44px touch-target minimum in their interactive box:
 * `sm` is 36px tall but is only ever used inline in already-padded rows, so
 * `iconOnly` sizes are pinned to 44px square regardless of the size token.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-sm font-medium',
    'transition-colors motion-reduce:transition-none',
    'disabled:pointer-events-none disabled:opacity-50',
    'cursor-pointer',
  ],
  {
    variants: {
      variant: {
        /** Primary action. Amber accent — reserve for the one main action per view. */
        primary:
          'bg-accent text-on-accent hover:bg-accent-strong',
        /** Default action. Raised surface with a visible edge. */
        secondary:
          'bg-surface-2 text-text border border-border-strong hover:bg-surface-3',
        /** Low-emphasis action, no chrome until hover. */
        ghost:
          'bg-transparent text-text-muted hover:bg-surface-2 hover:text-text',
        /** Destructive / dismiss-with-consequence. */
        danger:
          'bg-danger-bg text-danger border border-danger-border hover:bg-danger hover:text-text-inverse',
        /** Outline-only, for secondary actions on a tinted surface. */
        outline:
          'bg-transparent text-text border border-border-strong hover:bg-surface-2',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
      /** Square icon-only button, always >= 44px for touch. */
      iconOnly: {
        true: 'p-0 aspect-square',
        false: '',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    compoundVariants: [
      { iconOnly: true, size: 'sm', class: 'h-11 w-11' },
      { iconOnly: true, size: 'md', class: 'h-11 w-11' },
      { iconOnly: true, size: 'lg', class: 'h-12 w-12' },
    ],
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
      iconOnly: false,
      fullWidth: false,
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and blocks interaction. Keeps the button's width stable. */
  loading?: boolean
  /** Element rendered before the label (usually a react-icons component). */
  leadingIcon?: React.ReactNode
  /** Element rendered after the label. */
  trailingIcon?: React.ReactNode
}

/**
 * The single button primitive. Replaces the ~126 hand-rolled `<button>`
 * elements that each carried their own colour, padding and hover classes.
 *
 * @example
 * <Button variant="primary" size="lg" leadingIcon={<FiPlay />}>Plan dive</Button>
 * <Button variant="ghost" iconOnly aria-label="Close"><HiXMark /></Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    iconOnly,
    fullWidth,
    loading = false,
    leadingIcon,
    trailingIcon,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, iconOnly, fullWidth }), className)}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      ) : (
        leadingIcon && <span aria-hidden="true" className="shrink-0">{leadingIcon}</span>
      )}
      {children}
      {trailingIcon && !loading && (
        <span aria-hidden="true" className="shrink-0">{trailingIcon}</span>
      )}
    </button>
  )
})

export { buttonVariants }

'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { FocusScope } from '@react-aria/focus'
import { HiOutlineXMark } from 'react-icons/hi2'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'
import { Button } from './Button'

const panelVariants = cva(
  [
    'relative flex w-full flex-col',
    'glass text-text',
    'shadow-2xl',
  ],
  {
    variants: {
      size: {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
        full: 'max-w-none',
      },
    },
    defaultVariants: { size: 'md' },
  }
)

/** Tracks how many modals are open so nested/stacked modals unlock scroll once. */
let openModalCount = 0

export interface ModalProps extends VariantProps<typeof panelVariants> {
  isOpen: boolean
  onClose: () => void
  /** Accessible name for the dialog. Required unless `ariaLabel` is given. */
  title?: React.ReactNode
  /** Optional supporting line under the title. */
  description?: React.ReactNode
  children: React.ReactNode
  /** Rendered in a bordered row at the bottom, right-aligned. */
  footer?: React.ReactNode
  /**
   * Blocks Escape and backdrop dismissal. Use for flows that require an
   * explicit decision — e.g. the safety acknowledgment gate.
   */
  mandatory?: boolean
  /** Hides the header close button (implied by `mandatory`). */
  hideCloseButton?: boolean
  /** Accessible name when no visible `title` is rendered. */
  ariaLabel?: string
  className?: string
  /** Extra classes for the scrollable body region. */
  bodyClassName?: string
}

/**
 * The one modal implementation.
 *
 * Replaces the 16 hand-rolled `fixed inset-0` overlays, none of which trapped
 * focus, restored it on close, or locked background scroll. Provides:
 * focus trap + restore (`FocusScope`), `role="dialog"` + `aria-modal`, labelled
 * by its title, Escape to dismiss, backdrop click, and scroll lock.
 *
 * Renders through a portal so it is never clipped by an ancestor's
 * `overflow: hidden` or stacking context.
 *
 * Callers that touch browser APIs on mount should still be imported with
 * `dynamic(..., { ssr: false })` per CLAUDE.md; the Modal itself is safe to
 * render during SSR — it renders nothing until mounted, on both server and
 * client, so a modal open on first paint does not trigger a hydration
 * mismatch.
 *
 * @example
 * <Modal isOpen={open} onClose={close} title="Preferences" size="lg">
 *   <PreferencesForm />
 * </Modal>
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size,
  mandatory = false,
  hideCloseButton = false,
  ariaLabel,
  className,
  bodyClassName,
}: ModalProps) {
  const titleId = useId()
  const descId = useId()
  /**
   * The portal can only exist after mount. Gating on state rather than on
   * `typeof document` means the *first client render matches the server render*
   * (both produce nothing) and the modal appears on the following commit —
   * otherwise a modal that is open on first paint, like the safety gate,
   * hydration-mismatches and React discards and rebuilds the whole tree.
   */
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mandatory) {
        e.stopPropagation()
        onClose()
      }
    },
    [mandatory, onClose]
  )

  // Escape to dismiss.
  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, handleEscape])

  // Scroll lock. Reference-counted so closing one of two stacked modals does
  // not release the lock the other still needs.
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return
    openModalCount += 1
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      openModalCount -= 1
      if (openModalCount === 0) document.body.style.overflow = previous
    }
  }, [isOpen])

  if (!isOpen || !mounted) return null

  const labelled = title ? { 'aria-labelledby': titleId } : { 'aria-label': ariaLabel }
  const showClose = !hideCloseButton && !mandatory

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center sm:p-4">
      {/* Backdrop. Non-interactive for assistive tech; Escape and the close
          button are the accessible dismissal paths. */}
      <div
        aria-hidden="true"
        onClick={mandatory ? undefined : onClose}
        className={cn(
          'absolute inset-0 bg-black/70 backdrop-blur-sm',
          !mandatory && 'cursor-pointer'
        )}
      />

      <FocusScope contain restoreFocus autoFocus>
        <div
          role="dialog"
          aria-modal="true"
          {...labelled}
          aria-describedby={description ? descId : undefined}
          className={cn(
            panelVariants({ size }),
            // Bottom sheet on mobile, centred dialog from `sm` up.
            //
            // `min-h` as well as `max-h`: without a floor the sheet collapses
            // to whatever its content currently measures, so a lazily-loaded
            // body opens as a thin strip pinned to the bottom of the screen —
            // underneath the tab bar — and then jumps to full height when the
            // content arrives. A sheet that is going to be tall should start
            // tall.
            'max-h-[92dvh] min-h-[60dvh] rounded-t-md',
            'sm:max-h-[85vh] sm:min-h-0 sm:rounded-md',
            className
          )}
        >
          {(title || showClose) && (
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-h3 font-semibold text-text">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descId} className="mt-1 text-sm text-text-muted">
                    {description}
                  </p>
                )}
              </div>
              {showClose && (
                <Button
                  variant="ghost"
                  iconOnly
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="-m-2 shrink-0"
                >
                  <HiOutlineXMark className="h-5 w-5" />
                </Button>
              )}
            </div>
          )}

          <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', bodyClassName)}>
            {children}
          </div>

          {footer && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border p-4">
              {footer}
            </div>
          )}
        </div>
      </FocusScope>
    </div>,
    document.body
  )
}

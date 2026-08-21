'use client'

import { useState } from 'react'
import { HiOutlineExternalLink } from 'react-icons/hi'
import { HiOutlineSparkles } from 'react-icons/hi2'
import { Button, Modal, cn } from '@/components/ui'

const REPO = 'https://github.com/SerRodneyRich/Diveblendr'

interface WhatsNewModalProps {
  isOpen: boolean
  onClose: () => void
}

type ReleaseType = 'feature' | 'fix' | 'safety'

interface Release {
  /** ISO date. Displayed in the reader's locale. */
  date: string
  /** One line, written for a diver — what changed for them, not what was refactored. */
  summary: string
  type: ReleaseType
}

/**
 * Release timeline.
 *
 * Deliberately short. This replaces a hand-maintained array of full commit
 * records (hash, author, file lists, impact ratings) that duplicated what git
 * already holds authoritatively — and had drifted from the truth, at one point
 * claiming a build crash was fixed months before it actually was.
 *
 * The rule for adding an entry: only if a diver would notice the change.
 * Anything more detailed belongs in the GitHub changelog, linked below.
 *
 * The v2 rebuild is one entry, not the fourteen it was built in. A diver
 * opening this modal after release has never seen the app those fourteen
 * described, so they read as a changelog for software that never shipped.
 */
const releases: Release[] = [
  {
    // Set to the merge date when v2 actually ships.
    date: '2026-08-21',
    summary:
      'DiveBlendr v2. Every tool now has its own page, rebuilt on a shared design system with real keyboard and screen-reader support, and gas mixing, MOD checks, blending, SAC and gas planning have moved out of the single tabbed calculator. Two new tools: a dive share card that turns a Garmin .fit or Shearwater export into a shareable depth-profile graphic, and a photo editor rebuilt around how water actually absorbs light. Several safety corrections came with it — the app now reports the depth a gas may genuinely be taken to rather than its oxygen limit alone, warnings are written in your own units, and the CNS table, tank library, bottom-time maths and configurable safety limits were all fixed. Notes, warnings and errors now sit in one bar at the bottom of the screen, so the page no longer shifts under you while you drag a slider. Everything still runs on your own device, offline, with no account.',
    type: 'feature',
  },
  {
    date: '2026-04-13',
    summary: 'DiveBlendr is now fully open source under GPL-3.0.',
    type: 'feature',
  },
  {
    date: '2026-04-11',
    summary:
      'Added sitewide diver preferences: default dive mode, configurable safety limits, custom tanks, and favourite dive sites, all stored on your own device.',
    type: 'feature',
  },
]

const typeStyle: Record<ReleaseType, { label: string; className: string }> = {
  feature: { label: 'New', className: 'bg-info-bg text-info border-info-border' },
  fix: { label: 'Fix', className: 'bg-surface-2 text-text-muted border-border-strong' },
  safety: { label: 'Safety', className: 'bg-warning-bg text-warning border-warning-border' },
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export default function WhatsNewModal({ isOpen, onClose }: WhatsNewModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="What's new"
      description="Changes a diver would notice."
      size="lg"
      footer={
        <Button
          variant="secondary"
          onClick={() => window.open(`${REPO}/commits/main`, '_blank', 'noopener,noreferrer')}
          trailingIcon={<HiOutlineExternalLink className="h-4 w-4" />}
        >
          Full changelog on GitHub
        </Button>
      }
    >
      <ol className="relative space-y-5 border-l border-border pl-5">
        {releases.map((r, i) => (
          <li key={`${r.date}-${i}`} className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[1.6875rem] top-1.5 h-2.5 w-2.5 rounded-full bg-border-strong ring-4 ring-surface-1"
            />
            <div className="flex flex-wrap items-center gap-2">
              <time
                dateTime={r.date}
                className="font-mono tnum text-xs text-text-subtle"
              >
                {formatDate(r.date)}
              </time>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium',
                  typeStyle[r.type].className
                )}
              >
                {typeStyle[r.type].label}
              </span>
            </div>
            <p className="mt-1 text-sm text-text">{r.summary}</p>
          </li>
        ))}
      </ol>
    </Modal>
  )
}

/** Floating entry point to the timeline, used on the landing page. */
export function WhatsNewButton({ className }: { className?: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsModalOpen(true)}
        leadingIcon={<HiOutlineSparkles className="h-4 w-4" />}
        className={className}
      >
        What&apos;s new
      </Button>

      <WhatsNewModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}

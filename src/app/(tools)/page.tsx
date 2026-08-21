'use client'

import Link from 'next/link'
import { FaGithub } from 'react-icons/fa'
import { HiOutlineArrowRight } from 'react-icons/hi2'
import { Button, MessageBar } from '@/components/ui'
import { WhatsNewButton } from '@/components/WhatsNewModal'

const REPO = 'https://github.com/SerRodneyRich/Diveblendr'

/**
 * Landing page.
 *
 * Lives inside the `(tools)` route group so it renders in the same AppShell as
 * every tool: same sidebar, same header, same content well. Previously it sat
 * outside the group and drew its own `<main>`, its own MarineBackdrop and a
 * narrower container, so it read as a different site and the entire chrome
 * appeared out of nowhere on the first navigation into a tool.
 *
 * It carried a full tool catalogue until the sidebar made it redundant: every
 * tile duplicated a sidebar entry two columns to its left, and the duplication
 * pushed the page 184px past a 900px viewport. The sidebar is always visible
 * on desktop and one tap away on mobile, so this is now just a front door —
 * brand, what the app is, and the two things most divers open first.
 */
export default function Home() {
  return (
    <>
      {/* Centred lockup. This is the one place the brand mark appears at size —
          the sidebar carries the wordmark alone — so it leads, with everything
          below sharing its centre axis rather than hanging off the left edge. */}
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        {/* brand-mark.png, not an /icons/ file: those are the PWA/favicon set
            and carry a baked navy plate so a launcher or tab has a background
            to sit on. Here that plate reads as a dark box floating over the
            backdrop, so the in-page mark is the transparent cut of the same
            artwork.

            A plain <img>, not next/image: this is a static export, where the
            default loader's optimizer is unavailable. No rounded crop either —
            the mask is drawn to its own silhouette and a circle clips it. */}
        <img
          src="/brand-mark.png"
          alt=""
          aria-hidden="true"
          width={96}
          height={96}
          className="h-20 w-20 md:h-24 md:w-24"
        />

        <h1 className="mt-4 text-h1 font-semibold tracking-tight text-text md:text-display">
          Dive<span className="text-brand">Blendr</span>
        </h1>
        <p className="mt-2 text-balance text-h3 text-text-muted">
          Technical diving tools for all. Free, open source, offline.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/mix/">
            <Button
              variant="primary"
              size="lg"
              trailingIcon={<HiOutlineArrowRight className="h-4 w-4" />}
            >
              Find my mix
            </Button>
          </Link>
          <Link href="/gas-planning/">
            <Button variant="outline" size="lg">
              Plan my gas
            </Button>
          </Link>
        </div>

        {/* The planner is announced here rather than occupying a permanent
            drawer row. A "Soon" entry in the menu cost a slot that a finished
            tool needed, and pushed Share card, Photo editor and Links below
            the fold on a laptop — where a diver never learns they exist. */}
        <p className="mt-4 text-sm text-text-muted">
          <span className="rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-text-subtle">
            Soon
          </span>{' '}
          <Link href="/planner/" className="text-accent underline underline-offset-2">
            Dive planner
          </Link>{' '}
          — full decompression schedules with gradient factors.
        </p>

        <p className="mt-6 text-balance text-sm leading-relaxed text-text-muted">
          Gas blending, MOD, END and density analysis, consumption planning and — in
          development — full decompression schedules with gradient factors. Every formula
          cites a published standard and is unit-tested, and all of it runs on your device,
          with or without a signal.
        </p>

        <WhatsNewButton className="mt-6" />
      </div>

      <footer className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border pt-6 text-center text-sm text-text-muted">
        <p>
          GPL-3.0. Built by a technical diver, with AI, and open to audit — see the{' '}
          <a
            href={`${REPO}/blob/main/NOTICE.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            provenance notice
          </a>
          .
        </p>
        <a
          href={REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-accent underline underline-offset-2"
        >
          <FaGithub aria-hidden="true" className="h-4 w-4" />
          Source on GitHub
        </a>
      </footer>

      <MessageBar
        items={[
          {
            id: 'safety',
            severity: 'warning',
            title: 'Safety notice',
            message:
              'This tool is for education and planning only. Verify every calculation independently and dive within your training and certification.',
          },
        ]}
      />
    </>
  )
}

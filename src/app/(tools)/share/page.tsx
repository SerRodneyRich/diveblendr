'use client'

import ShareCardTool from '@/components/share/ShareCardTool'

/**
 * Dive share card — a Strava-style graphic built from a dive log.
 *
 * The parsing and drawing live in `@/lib/dive`, which is pure and tested; this
 * page is only the tool's frame.
 *
 * NO PAGE HEADING. The app header already reads "Share card", so an <h1>
 * repeating it, plus a paragraph explaining a tool the diver has already
 * chosen, cost ~110px at the top of the one page where controls and a live
 * preview compete for the same fold. The document still has a heading — the
 * chrome supplies it — so nothing is lost to assistive tech.
 */
export default function SharePage() {
  return <ShareCardTool />
}

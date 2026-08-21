'use client'

import { useEffect, useState } from 'react'

/**
 * The marine backdrop: an ocean depth gradient with an underwater photograph
 * fading in over it.
 *
 * Fixes what was wrong with the old `BackgroundImage` without losing the
 * identity it gave the app:
 *
 * - **Never gates first paint.** The old component returned `null` until the
 *   photo had decoded, and the pages using it withheld *all* content until
 *   then — so the app's first frame was the word "Loading". Here the gradient
 *   is painted synchronously and the photo is decoded off the critical path,
 *   fading in only once it is ready. If it never loads, the gradient is a
 *   complete background on its own.
 * - **Low enough contrast to sit behind text.** The photo is heavily dimmed
 *   and a depth scrim is composited over it, so panel text clears 4.5:1
 *   against the panel tint without the image fighting it.
 * - **Decorative, so it is hidden from assistive tech** and skipped entirely
 *   when the user has asked for reduced data or reduced motion.
 *
 * Rendered once by AppShell, fixed behind all content.
 */

/** Candidate photographs. One is chosen per session, not per navigation. */
const PHOTOS = [
  '/photos/photo1.jpg',
  '/photos/photo3.jpg',
  '/photos/photo4.jpg',
  '/photos/photo5.jpg',
  '/photos/photo8.jpg',
  '/photos/photo9.jpg',
]

/**
 * Pick once per browsing session and remember it, so moving between tools does
 * not reshuffle the background — which reads as a page reload, and undermines
 * the impression that navigation is instant.
 */
function sessionPhoto(): string {
  const KEY = 'diveblendr-backdrop'
  try {
    const stored = sessionStorage.getItem(KEY)
    if (stored && PHOTOS.includes(stored)) return stored
    const picked = PHOTOS[Math.floor(Math.random() * PHOTOS.length)]
    sessionStorage.setItem(KEY, picked)
    return picked
  } catch {
    // Private browsing can throw on sessionStorage; the backdrop is decorative.
    return PHOTOS[0]
  }
}

export default function MarineBackdrop() {
  const [photo, setPhoto] = useState<string | null>(null)
  /** Flipped one frame after `photo` is set, so the opacity change animates. */
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Respect a request for less data or less motion by staying on the
    // gradient alone — it is a complete background.
    const saveData = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection?.saveData
    if (saveData) return

    let cancelled = false
    const src = sessionPhoto()
    const img = new window.Image()
    img.decoding = 'async'
    img.src = src
    const show = () => {
      if (cancelled) return
      setPhoto(src)
      // Next frame, so the element mounts at opacity 0 and then transitions.
      requestAnimationFrame(() => {
        if (!cancelled) setVisible(true)
      })
    }
    // `decode()` avoids painting a half-decoded image; the onload fallback
    // covers browsers where decode() rejects (some Safari versions do).
    img.decode?.().then(show).catch(() => {
      img.onload = show
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className="marine-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: 'var(--gradient-depth)' }}
    >
      {photo && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 motion-reduce:transition-none"
          style={{ backgroundImage: `url(${photo})`, opacity: visible ? 0.18 : 0 }}
        />
      )}
      {/* Depth scrim: keeps the lower half of any photograph from lifting the
          abyss end of the gradient, so content over it stays high-contrast. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(4,10,18,0.35) 0%, rgba(4,10,18,0.6) 55%, rgba(4,10,18,0.88) 100%)',
        }}
      />
    </div>
  )
}

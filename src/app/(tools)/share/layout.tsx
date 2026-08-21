import type { Metadata } from 'next'

/**
 * The page is a client component (canvas, File API) and so cannot export
 * `metadata`; this layout carries the title instead.
 */
export const metadata: Metadata = {
  title: 'Dive share card — DiveBlendr',
  description:
    'Turn a Garmin .fit or Shearwater export into a shareable dive graphic — depth profile, your stats, your photo. Parsed entirely in your browser; nothing is uploaded.',
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children
}

import type { Metadata } from 'next'

/**
 * The page itself is a client component and so cannot export `metadata`;
 * this layout carries the title instead.
 */
export const metadata: Metadata = {
  title: 'Photo editor — DiveBlendr',
  description:
    'Restore the colour water removed from your underwater photos. Physically-modelled correction from depth, distance and Jerlov water type, with automatic white balance. Runs entirely on your device.',
}

export default function PhotoLayout({ children }: { children: React.ReactNode }) {
  return children
}

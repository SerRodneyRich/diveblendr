import type { Metadata } from 'next'

/**
 * The page itself is a client component and so cannot export `metadata`;
 * this layout carries the title instead.
 */
export const metadata: Metadata = {
  title: 'Best mix — DiveBlendr',
  description:
    'Optimal nitrox and trimix mixes for a target depth and ppO₂, with MOD, END, gas density and CNS analysis against your own safety limits.',
}

export default function MixLayout({ children }: { children: React.ReactNode }) {
  return children
}

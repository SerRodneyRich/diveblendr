import type { Metadata } from 'next'

/**
 * The page itself is a client component and so cannot export `metadata`;
 * this layout carries the title instead.
 */
export const metadata: Metadata = { title: 'Marine conditions — DiveBlendr' }

export default function ConditionsLayout({ children }: { children: React.ReactNode }) {
  return children
}

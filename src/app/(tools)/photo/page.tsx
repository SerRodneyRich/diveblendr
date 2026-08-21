'use client'

import dynamic from 'next/dynamic'

/**
 * Thin shell. Everything lives in `@/components/photo` and `@/lib/photo`.
 *
 * Loaded with `ssr: false` because the tool touches `File`, `Worker`, `canvas`
 * and `URL.createObjectURL` — none of which exist during the static export's
 * prerender pass.
 */
const PhotoTool = dynamic(
  () => import('@/components/photo/PhotoTool').then((m) => m.PhotoTool),
  {
    ssr: false,
    loading: () => (
      <div className="py-16 text-center text-sm text-text-subtle">Loading the editor…</div>
    ),
  }
)

export default function PhotoPage() {
  return <PhotoTool />
}

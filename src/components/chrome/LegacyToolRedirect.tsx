'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Client-side redirect shim.
 *
 * `output: export` cannot serve `redirects()` from next.config.js — there is no
 * server to issue a 3xx — so an old URL is preserved as a real exported page
 * that replaces itself in history on mount. `router.replace` keeps the stale URL
 * out of the back stack, so Back returns to where the user actually came from.
 */
export default function LegacyToolRedirect({
  to,
  label,
}: {
  to: string
  label: string
}) {
  const router = useRouter()

  useEffect(() => {
    router.replace(to)
  }, [router, to])

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-text-muted">Taking you to {label}…</p>
      <a href={to} className="text-accent underline underline-offset-2">
        Continue
      </a>
    </div>
  )
}

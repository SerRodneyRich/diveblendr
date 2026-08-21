'use client'

import { useEffect, useState } from 'react'
import { MdWifiOff } from 'react-icons/md'
import { HiOutlineXMark } from 'react-icons/hi2'

/**
 * Tells an installed PWA's user when the device has gone offline.
 *
 * Deliberately small. It used to open with a full-viewport overlay that
 * blocked the app for a fixed 2000ms while "checking network" — a check that
 * consisted of reading `navigator.onLine`, which is synchronous and had already
 * been read. Every launch of the installed app paid two seconds for nothing.
 *
 * Offline is also not an error here: every calculator works without a signal,
 * which is the point of shipping a service worker. Only the conditions tool
 * needs the network, and it says so itself. So this is a dismissible notice,
 * not an alert, and it never covers the page.
 */
export default function PWANetworkStatus() {
  const [isPWA, setIsPWA] = useState(false)
  const [offline, setOffline] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator &&
        (window.navigator as { standalone?: boolean }).standalone === true)

    setIsPWA(standalone)
    setOffline(!navigator.onLine)

    const goOnline = () => {
      setOffline(false)
      setDismissed(false)
    }
    const goOffline = () => setOffline(true)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (!isPWA || !offline || dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass fixed inset-x-0 top-0 z-toast flex items-center gap-3 border-x-0 border-t-0 border-b border-warning-border bg-warning-bg px-4 py-2"
    >
      <MdWifiOff aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-sm text-text">
        <span className="font-semibold text-warning">Offline</span> — every
        calculator still works. Conditions needs a connection.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss offline notice"
        className="-m-1.5 shrink-0 rounded-sm p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text motion-reduce:transition-none"
      >
        <HiOutlineXMark className="h-4 w-4" />
      </button>
    </div>
  )
}

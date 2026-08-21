'use client'

import { useEffect } from 'react'
import PWANetworkStatus from '@/components/PWANetworkStatus'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'
import { AccessibilityProvider } from '@/contexts/AccessibilityContext'
import { UnitsProvider } from '@/contexts/UnitsContext'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import { PreferencesProvider } from '@/contexts/PreferencesContext'

/**
 * Reports accessibility violations to the console during development only.
 *
 * axe is dynamically imported so it is never pulled into the production
 * bundle — the check is a development affordance, not a shipped feature.
 */
function useAxeInDev() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return
    let cancelled = false
    void (async () => {
      const [{ default: axe }, ReactNs, ReactDOMNs] = await Promise.all([
        import('@axe-core/react'),
        import('react'),
        import('react-dom'),
      ])
      if (cancelled) return
      // axe writes onto the React object it is handed. An ES module namespace
      // object is frozen, so passing it directly throws "Attempted to assign to
      // readonly property"; hand it mutable copies instead.
      axe({ ...ReactNs }, { ...ReactDOMNs }, 1000)
    })()
    return () => {
      cancelled = true
    }
  }, [])
}

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  useAxeInDev()

  return (
    <>
      {/* The skip-nav CSS existed for months with no link to trigger it, so
          keyboard users had no way past the chrome. This is that link. */}
      <a href="#main-content" className="skip-nav">
        Skip to main content
      </a>

      <ServiceWorkerRegistrar />
      <PWANetworkStatus />
      <AccessibilityProvider>
        <UnitsProvider>
          <PreferencesProvider>
            {/* The floating FAB stack that used to live here is gone: its
                entries are now in the sidebar footer and the mobile More sheet
                (Phase 3 §4, "three crowded corners"). */}
            <FavoritesProvider>{children}</FavoritesProvider>
          </PreferencesProvider>
        </UnitsProvider>
      </AccessibilityProvider>
    </>
  )
}

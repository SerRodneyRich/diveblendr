'use client'

import PWANetworkStatus from '@/components/PWANetworkStatus'
import VerticalMenu from '@/components/VerticalMenu'
import { AccessibilityProvider } from '@/contexts/AccessibilityContext'
import { UnitsProvider } from '@/contexts/UnitsContext'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import { PreferencesProvider } from '@/contexts/PreferencesContext'

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PWANetworkStatus />
      <AccessibilityProvider>
      <UnitsProvider>
      <PreferencesProvider>
      <FavoritesProvider>
      {children}
      <div className="fixed bottom-4 right-4 z-50">
        <VerticalMenu dockLabel="Tools Menu" />
      </div>
      </FavoritesProvider>
      </PreferencesProvider>
      </UnitsProvider>
      </AccessibilityProvider>
    </>
  )
}

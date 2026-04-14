'use client'

import { useState, useEffect } from 'react'
import NavigationMenu from '@/components/NavigationMenu'

interface GlobalUIComponentsProps {
  activeTab?: string
  onTabChange?: (tab: string) => void
  initialMenuOpen?: boolean
}

export default function GlobalUIComponents({ activeTab, onTabChange, initialMenuOpen }: GlobalUIComponentsProps) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return null
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-40 flex gap-3 items-center">
        {activeTab && onTabChange && (
          <NavigationMenu activeTab={activeTab} onTabChange={onTabChange} initialOpen={initialMenuOpen} />
        )}
      </div>
    </>
  )
}
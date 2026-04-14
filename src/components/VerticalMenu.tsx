'use client'

import React, { useState, useRef, useEffect } from 'react'
import { MdOutlineApps } from 'react-icons/md'
import { FaHammer } from 'react-icons/fa'
import OpenSourceButton from '@/components/OpenSourceButton'
import { AccessibilityButton } from '@/components/AccessibilityButton'
import { AuditsButton } from '@/components/AuditsButton'
import { PWAButton } from '@/components/PWAButton'

// Hook to check PWA availability
function usePWAAvailability() {
  const [isAvailable, setIsAvailable] = useState(false)

  useEffect(() => {
    // Check if PWA is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone) || 
                        document.referrer.includes('android-app://')
    
    if (isStandalone) {
      setIsAvailable(false)
      return
    }

    // Check for browser support
    const userAgent = navigator.userAgent
    const isSafariBrowser = /Safari/.test(userAgent) && !/Chrome/.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent)
    
    // For Safari, always show as available
    if (isSafariBrowser) {
      setIsAvailable(true)
      return
    }

    // For Chrome/Edge, check for beforeinstallprompt support
    const handleBeforeInstallPrompt = () => {
      setIsAvailable(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    
    // Also set available if we detect Chrome/Edge even without prompt yet
    if (/Chrome|Edge/.test(userAgent)) {
      setIsAvailable(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  return isAvailable
}

interface VerticalMenuItem {
  id: string
  icon?: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  component?: React.ReactNode
  className?: string
}

interface VerticalMenuProps {
  className?: string
  iconSize?: string    // Tailwind class for icon size
  dockIcon?: React.ComponentType<{ className?: string }>
  dockLabel?: string
}

export default function VerticalMenu({
  className = '',
  iconSize = 'w-6 h-6',
  dockIcon: DockIcon = MdOutlineApps,
  dockLabel = 'Menu'
}: VerticalMenuProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isPWAAvailable = usePWAAvailability()

  // Hardcoded menu items inside the component
  const items: VerticalMenuItem[] = [
    {
      id: 'download',
      label: 'Download App',
      component: (
        <PWAButton className="w-12 h-12 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700" />
      )
    },
    {
      id: 'audits',
      label: 'Audits',
      component: (
        <AuditsButton className="w-12 h-12 flex items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700" />
      )
    },
    {
      id: 'accessibility',
      label: 'Accessibility',
      component: (
        <AccessibilityButton className="w-12 h-12 flex items-center justify-center rounded-full bg-purple-600 text-white hover:bg-purple-700" />
      )
    },
    {
      id: 'opensource',
      label: 'Open Source',
      component: (
        <OpenSourceButton className="w-12 h-12 flex items-center justify-center rounded-full bg-yellow-600 text-white hover:bg-yellow-700" />
      )
    }
  ]

  // Handle clicks outside the component
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsExpanded(false)
      }
    }

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isExpanded])

  const toggleMenu = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <div 
      ref={menuRef}
      className={`relative flex flex-col items-end ${className}`}
    >
      {/* Menu Items - Vertical Stack */}
      <div className="flex flex-col-reverse items-end space-y-reverse space-y-3 mb-3">
        {items.filter(item => item.id !== 'download' || isPWAAvailable).map((item, index) => (
          <div
            key={item.id}
            className={`
              relative flex items-center space-x-0 transition-all duration-300 ease-out group
              ${isExpanded 
                ? 'opacity-100 pointer-events-auto translate-x-0' 
                : 'opacity-0 pointer-events-none translate-x-4'
              }
            `}
            style={{
              transitionDelay: isExpanded ? `${index * 50}ms` : '0ms'
            }}
          >
            {/* Label Chip */}
            <div className="absolute right-2 bg-gray-800 text-gray-200 text-sm pl-6 pr-8 h-12 flex items-center rounded-l-full rounded-r-3xl shadow-lg whitespace-nowrap transition-all duration-200 group-hover:bg-gray-700 group-hover:text-white text-left -translate-x-[20px]">
              {item.label}
            </div>

            {/* If custom component exists → render it */}
            {item.component ? (
              <div className="relative z-10">{item.component}</div>
            ) : (
              <button
                onClick={() => item.onClick?.()}
                className={`
                  relative z-10 w-12 h-12 flex items-center justify-center rounded-full shadow-lg transition-all duration-200 group-hover:scale-110
                  ${item.className || 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700'}
                `}
                aria-label={item.label}
                title={item.label}
              >
                {item.icon && <item.icon className={`${iconSize}`} />}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Dock/Main Button */}
      <button
        onClick={toggleMenu}
        className={`
          relative w-14 h-14 flex items-center justify-center rounded-full shadow-lg transition-all duration-300 ease-out
          ${isExpanded 
            ? 'bg-blue-600 text-white scale-110' 
            : 'bg-blue-600 text-white hover:bg-blue-700'
          }
        `}
        aria-label={isExpanded ? 'Close menu' : 'Open menu'}
        title={dockLabel}
      >
        <DockIcon className={`${iconSize}`} />
        {/* Hammer overlay in bottom-right corner */}
        <FaHammer className="absolute bottom-3 right-3 w-3 h-3 text-white" />
      </button>
    </div>
  )
}

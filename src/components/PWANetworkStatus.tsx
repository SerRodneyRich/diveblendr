'use client'

import { useState, useEffect } from 'react'

export default function PWANetworkStatus() {
  const [isChecking, setIsChecking] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [showOfflineBanner, setShowOfflineBanner] = useState(false)
  const [isPWA, setIsPWA] = useState(false)

  useEffect(() => {
    // Check if running as installed PWA
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      const isIOSStandalone = 'standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true
      return isStandalone || isIOSStandalone
    }

    const pwaInstalled = checkPWA()
    setIsPWA(pwaInstalled)

    // Only show checking overlay for installed PWA
    if (pwaInstalled) {
      setIsChecking(true)
    }

    // Initial online status check
    setIsOnline(navigator.onLine)

    // Quick check with timeout (only for PWA)
    const checkTimeout = setTimeout(() => {
      if (pwaInstalled) {
        setIsChecking(false)
        if (!navigator.onLine) {
          setShowOfflineBanner(true)
        }
      }
    }, 2000) // 2 second check

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true)
      setShowOfflineBanner(false)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setShowOfflineBanner(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearTimeout(checkTimeout)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Don't render anything if not a PWA
  if (!isPWA) {
    return null
  }

  // Loading overlay during initial check
  if (isChecking) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <div className="bg-gray-900 border border-blue-500 rounded-lg p-6 shadow-2xl max-w-sm mx-4">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                  />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-white font-medium text-lg">Checking network...</p>
              <p className="text-gray-400 text-sm mt-1">Preparing DiveBlendr</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Offline banner (stays visible when offline)
  if (showOfflineBanner) {
    return (
      <div
        className="fixed top-0 left-0 right-0 bg-orange-600 text-white py-2 px-4 z-[9998] shadow-lg"
        role="alert"
        aria-live="assertive"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">
              Offline Mode - Using cached data
            </span>
          </div>
          <button
            onClick={() => setShowOfflineBanner(false)}
            className="text-white hover:text-gray-200 transition-colors"
            aria-label="Dismiss offline notice"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return null
}

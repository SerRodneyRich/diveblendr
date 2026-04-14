'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MdCloudDownload } from 'react-icons/md'

// PWA install prompt typing
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface PWAButtonProps {
  className?: string;
}

export const PWAButton: React.FC<PWAButtonProps> = ({ className }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showSafariInstall, setShowSafariInstall] = useState(false)
  const [isPWAInstalled, setIsPWAInstalled] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)

  useEffect(() => {
    // Check if user has minimized the prompt this session
    const sessionMinimized = sessionStorage.getItem('pwa-prompt-minimized')
    if (sessionMinimized === 'true') {
      setIsMinimized(true)
    }

    // Detect browser type
    const userAgent = navigator.userAgent
    const isSafariBrowser = /Safari/.test(userAgent) && !/Chrome/.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent)
    
    // Check if PWA is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone) || 
                        document.referrer.includes('android-app://')
    
    setIsPWAInstalled(isStandalone)
    
    // Don't show install options if already installed
    if (isStandalone) {
      return
    }

    // PWA install prompt handler for Chrome/Edge
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    // Set up install prompts based on browser
    if (isSafariBrowser) {
      // Show Safari install instructions after a delay (only if not minimized)
      if (sessionMinimized !== 'true') {
        setTimeout(() => setShowSafariInstall(true), 3000)
      }
    } else {
      // Listen for Chrome/Edge install prompt
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener)
      return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener)
    }
  }, [])

  const handleInstallClick = () => {
    // Always restore the white box when clicking the vertical menu download button
    handleRestore()
  }

  const handleMinimize = () => {
    setIsMinimized(true)
    sessionStorage.setItem('pwa-prompt-minimized', 'true')
  }

  const handleRestore = () => {
    setIsMinimized(false)
    sessionStorage.removeItem('pwa-prompt-minimized')
  }

  const handleActualInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      deferredPrompt.userChoice.then((choiceResult: { outcome: 'accepted' | 'dismissed'; platform: string }) => {
        console.log('User choice:', choiceResult.outcome)
        setDeferredPrompt(null)
      })
    } else if (showSafariInstall) {
      // Show instructions for Safari users
      alert('To install: Tap the Share button ⬆ then "Add to Home Screen (or Dock)"')
    }
  }

  // Don't show button in vertical menu if PWA is already installed
  if (isPWAInstalled) {
    return null
  }

  // Don't show button in vertical menu if no install method is available
  if (!deferredPrompt && !showSafariInstall) {
    return null
  }

  return (
    <>
      {/* PWA Button for VerticalMenu */}
      <button
        onClick={handleInstallClick}
        className={`${className}`}
        aria-label="Install PWA"
        title="Download App"
      >
        <MdCloudDownload className="w-6 h-6" />
      </button>

      {/* PWA White Box Prompts - Rendered as Portals */}
      {typeof window !== 'undefined' && (
        <>
          {/* PWA Install prompt - Chrome/Edge */}
          {deferredPrompt && !isMinimized && createPortal(
            <div
              style={{
                position: 'fixed',
                top: '1rem',
                left: '1rem',
                zIndex: 1000,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(10px)',
                padding: '1rem',
                borderRadius: '0.75rem',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                maxWidth: '280px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                  Install App
                </div>
                <button
                  onClick={handleMinimize}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    fontSize: '1.25rem', 
                    color: '#6b7280', 
                    cursor: 'pointer',
                    padding: '0',
                    lineHeight: '1'
                  }}
                >
                  −
                </button>
              </div>
              <button
                onClick={handleActualInstallClick}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#1e40af',
                  color: '#fff',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  marginBottom: '0.5rem',
                }}
              >
                Install App
              </button>
              <div style={{ fontSize: '0.75rem', color: '#374151', marginBottom: '0.5rem' }}>
                <strong>Progressive Web App</strong>
              </div>
              <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.3' }}>
                PWAs work like native apps but run in your browser. They&apos;re faster, work offline, and don&apos;t require app store downloads.
              </div>
            </div>,
            document.body
          )}

          {/* PWA Install prompt - Safari */}
          {showSafariInstall && !isMinimized && createPortal(
            <div
              style={{
                position: 'fixed',
                top: '1rem',
                left: '1rem',
                zIndex: 1000,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(10px)',
                padding: '1rem',
                borderRadius: '0.75rem',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                maxWidth: '300px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                  Install App
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleMinimize}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      fontSize: '1.25rem', 
                      color: '#6b7280', 
                      cursor: 'pointer',
                      padding: '0',
                      lineHeight: '1'
                    }}
                  >
                    −
                  </button>
                  <button
                    onClick={() => setShowSafariInstall(false)}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      fontSize: '1.25rem', 
                      color: '#6b7280', 
                      cursor: 'pointer',
                      padding: '0',
                      lineHeight: '1'
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#374151', marginBottom: '0.5rem' }}>
                <strong>Progressive Web App</strong>
              </div>
              <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.4', marginBottom: '0.75rem' }}>
                To install: Tap the <strong>Share</strong> button <span style={{ fontSize: '1rem' }}>⬆</span> then <strong>&quot;Add to Home Screen (or Dock)&quot;</strong>
              </div>
              <div style={{ fontSize: '0.6rem', color: '#f59e0b', lineHeight: '1.3', marginBottom: '0.5rem', backgroundColor: '#fef3c7', padding: '0.25rem', borderRadius: '0.25rem' }}>
                <strong>iOS:</strong> Must open in Safari browser. Won&apos;t work from home screen search.
              </div>
              <div style={{ fontSize: '0.6rem', color: '#9ca3af', lineHeight: '1.3' }}>
                PWAs work like native apps but run in your browser. They&apos;re faster, work offline, and don&apos;t require app store downloads.
              </div>
            </div>,
            document.body
          )}

        </>
      )}
    </>
  )
}
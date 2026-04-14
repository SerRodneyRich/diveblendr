'use client'

import { useEffect, useRef, useState } from 'react'

interface MathJaxProps {
  content: string
}

export default function MathJax({ content }: MathJaxProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [mathJaxLoaded, setMathJaxLoaded] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [loadTimeout, setLoadTimeout] = useState(false)

  useEffect(() => {
    // Check if MathJax is already loaded and ready
    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
      setMathJaxLoaded(true)
      return
    }

    // Load MathJax if not already loaded - but defer it to not block PWA
    if (!window.MathJax && !loadError && !loadTimeout) {
      // Use setTimeout to defer loading after PWA initialization
      const deferLoad = setTimeout(() => {
        // Set a timeout to handle slow/failed loads
        const timeoutId = setTimeout(() => {
          if (!mathJaxLoaded) {
            console.warn('MathJax loading timed out after 10 seconds')
            setLoadTimeout(true)
          }
        }, 10000)

        window.MathJax = {
          tex: {
            inlineMath: [['$', '$'], ['\\(', '\\)']],
            displayMath: [['$$', '$$'], ['\\[', '\\]']]
          },
          options: {
            menuOptions: {
              settings: {
                texHints: true
              }
            }
          },
          startup: {
            ready: () => {
              clearTimeout(timeoutId)
              window.MathJax.startup?.defaultReady?.()
              setMathJaxLoaded(true)
            },
            defaultReady: () => {}
          }
        }

        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'
        script.async = true
        
        script.onload = () => {
          clearTimeout(timeoutId)
          console.log('MathJax script loaded successfully')
        }
        
        script.onerror = () => {
          clearTimeout(timeoutId)
          console.error('Failed to load MathJax script')
          setLoadError(true)
        }
        
        document.head.appendChild(script)
      }, 1000) // Defer by 1 second to not interfere with PWA loading

      // Cleanup both timeouts on unmount
      return () => {
        clearTimeout(deferLoad)
      }
    }
  }, [])

  useEffect(() => {
    if (mathJaxLoaded && contentRef.current && window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
      setIsRendering(true)
      // Add a timeout for the rendering process as well
      const renderTimeout = setTimeout(() => {
        console.warn('MathJax rendering timed out')
        setIsRendering(false)
      }, 10000)

      window.MathJax.typesetPromise([contentRef.current])
        .then(() => {
          clearTimeout(renderTimeout)
          setIsRendering(false)
          console.log('MathJax rendered successfully')
        })
        .catch((err) => {
          clearTimeout(renderTimeout)
          setIsRendering(false)
          console.error('MathJax render error:', err)
        })

      return () => clearTimeout(renderTimeout)
    }
  }, [content, mathJaxLoaded])

  // Show error message if MathJax failed to load
  if (loadError || loadTimeout) {
    return (
      <div className="border border-red-400 bg-red-900/20 rounded-lg p-4">
        <div className="flex items-center space-x-2 text-red-400 mb-3">
          <div className="w-5 h-5 rounded-full border-2 border-red-400 flex items-center justify-center">
            <span className="text-xs">!</span>
          </div>
          <span className="font-semibold">Mathematical equations unavailable</span>
        </div>
        <div className="text-gray-300 text-sm mb-3">
          {loadTimeout ? 
            'The math rendering library took too long to load. This may be due to a slow network connection.' :
            'Failed to load the math rendering library. This may be due to network restrictions or content blockers.'
          }
        </div>
        <div className="bg-gray-800 p-3 rounded border-l-4 border-gray-600">
          <div className="text-gray-400 text-sm font-mono whitespace-pre-line">{content}</div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Raw mathematical content is shown above. For proper rendering, try refreshing the page or check your network connection.
        </div>
      </div>
    )
  }

  // Show loading indicator while MathJax is loading or rendering
  if (!mathJaxLoaded || isRendering) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center space-x-2 text-yellow-400">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-400"></div>
          <span className="text-sm">Loading mathematical equations...</span>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={contentRef}
      className="text-gray-200 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}

// Extend window interface
declare global {
  interface Window {
    MathJax: {
      tex?: {
        inlineMath: string[][]
        displayMath: string[][]
      }
      options?: {
        menuOptions: {
          settings: {
            texHints: boolean
          }
        }
      }
      startup?: {
        ready: () => void
        defaultReady: () => void
      }
      typesetPromise?: (elements?: Element[]) => Promise<void>
    }
  }
}
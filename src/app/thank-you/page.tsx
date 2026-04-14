'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { DiCoffeescript } from 'react-icons/di'

function ThankYouContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [sessionValid, setSessionValid] = useState(false)

  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    
    if (sessionId) {
      // Mark user as having donated in localStorage
      localStorage.setItem('diveblendr_donated', 'true')
      setSessionValid(true)
    }
    
    setIsLoading(false)
  }, [searchParams])

  const handleReturnToApp = () => {
    router.push('/')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-teal-700 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!sessionValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-teal-700 flex items-center justify-center px-4">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 max-w-md w-full text-center border border-white/20">
          <h1 className="text-2xl font-bold text-white mb-4">Invalid Session</h1>
          <p className="text-white/80 mb-6">
            This page is only accessible after a successful donation.
          </p>
          <button
            onClick={handleReturnToApp}
            className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg transition-colors duration-200"
          >
            Return to DiveBlendr
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-teal-700 flex items-center justify-center px-4">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 max-w-md w-full text-center border border-white/20">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-teal-600 rounded-full flex items-center justify-center">
            <DiCoffeescript className="w-10 h-10 text-white" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-4">Thank You! 🎉</h1>
        
        <p className="text-white/90 mb-6 leading-relaxed">
          Your support means the world! Your donation helps fuel the development of DiveBlendr - 
          whether it&apos;s coffee for late-night coding sessions or Sofnolime for CCR diving adventures.
        </p>
        
        <p className="text-white/80 mb-8 text-sm">
          DiveBlendr is entirely a passion project, and thankfully doesn&apos;t cost much to host or run. 
          But your generosity helps keep the developer caffeinated and motivated!
        </p>
        
        <button
          onClick={handleReturnToApp}
          className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors duration-200 shadow-lg"
        >
          Return to DiveBlendr
        </button>
        
        <p className="text-white/60 mt-6 text-xs">
          The donate button will now show a thank you message instead. 
          Safe diving! 🤿
        </p>
      </div>
    </div>
  )
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-teal-700 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    }>
      <ThankYouContent />
    </Suspense>
  )
}
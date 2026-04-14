'use client'

import { useState } from 'react'
import SafetyBanner from '@/components/SafetyBanner'
import LogoTitle from '@/components/LogoTitle'
import AppDescription from '@/components/AppDescription'
import LaunchButton from '@/components/LaunchButton'
import BackgroundImage from '@/components/BackgroundImage'
import { WhatsNewButton } from '@/components/WhatsNewModal'

export default function Home() {
  const [imageLoaded, setImageLoaded] = useState(false)

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-blue-900 via-blue-800 to-black flex flex-col items-center justify-center p-4 cursor-default">
      <BackgroundImage onImageLoaded={() => setImageLoaded(true)} />

      {!imageLoaded && (
        <div className="fixed inset-0 bg-gradient-to-b from-blue-900 via-blue-800 to-black flex items-center justify-center z-50">
          <div className="text-white text-lg">Loading...</div>
        </div>
      )}

      {imageLoaded && (
        <div className="relative z-10 w-full">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="bg-black/0 rounded-2xl p-8 inline-block">
              <LogoTitle />
              <AppDescription />
            </div>
            <LaunchButton />
          </div>
          <SafetyBanner isHidden={false} />
        </div>
      )}

      {imageLoaded && (
        <WhatsNewButton />
      )}
    </main>
  )
}

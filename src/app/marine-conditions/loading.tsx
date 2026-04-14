'use client'

import { GiWaterSplash } from 'react-icons/gi'

export default function MarineConditionsLoading() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin mb-4">
          <GiWaterSplash className="text-6xl text-blue-400 mx-auto" />
        </div>
        <h2 className="text-2xl font-semibold text-white mb-2">Loading Marine Conditions</h2>
        <p className="text-gray-400">Preparing your diving weather dashboard...</p>
        <div className="mt-4 w-48 h-2 bg-gray-700 rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>
  )
}
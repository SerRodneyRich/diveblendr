'use client'

import { useState } from 'react'
import { HiOutlineBars3, HiOutlineXMark } from 'react-icons/hi2'
import { BsJournalArrowDown } from 'react-icons/bs'
import { IoIosOptions } from 'react-icons/io'
import { GiScubaTanks } from 'react-icons/gi'
import { MdOutlineVerticalAlignBottom, MdOutlineTimer } from 'react-icons/md'
import { ImHourGlass } from 'react-icons/im'
import { FaLink, FaMagic } from 'react-icons/fa'
import { GiWaterSplash } from 'react-icons/gi'
import { TbMathFunction } from 'react-icons/tb'
import { FiSettings } from 'react-icons/fi'
import { UnitsToggle } from './UnitsToggle'
import { PreferencesModal } from './PreferencesModal'

interface NavigationMenuProps {
  activeTab: string
  onTabChange: (tab: string) => void
  initialOpen?: boolean
}

export default function NavigationMenu({ activeTab, onTabChange, initialOpen = false }: NavigationMenuProps) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  const tabs = [
    { id: 'recommendations', label: 'Gas Recommendations', description: 'Find optimal gas mixes for your dive', icon: BsJournalArrowDown },
    { id: 'mixer', label: 'Gas Playground', description: 'Explore gas calculations interactively', icon: IoIosOptions },
    { id: 'blender', label: 'Gas Blender', description: 'Various gas cylinder blending methods', icon: GiScubaTanks },
    { id: 'modcheck', label: 'MOD Check', description: 'Verify maximum operating depths', icon: MdOutlineVerticalAlignBottom },
    { id: 'sac', label: 'SAC/RMV Calculator', description: 'Calculate air consumption rates', icon: MdOutlineTimer },
    { id: 'bottomtime', label: 'Bottom Time Calculator', description: 'Plan dive duration and gas usage', icon: ImHourGlass },
    // { id: 'deco-central', label: '🧪 Deco Central', description: 'Advanced decompression planning and algorithm testing', icon: TbMathFunction },
    { id: 'marine-conditions', label: 'Marine Conditions', description: 'Tides, weather, and diving conditions', icon: GiWaterSplash },
    { id: 'photo-editor', label: 'Underwater Photo Editor', description: 'Enhance underwater photography', icon: FaMagic },
    { id: 'links', label: 'Links', description: 'Useful diving resources and references', icon: FaLink }
  ]

  const handleTabSelect = (tabId: string) => {
    if (tabId === 'photo-editor') {
      // Navigate to photo correction page
      window.location.href = '/photo-correction'
    } else if (tabId === 'marine-conditions') {
      // Navigate to marine conditions page
      window.location.href = '/marine-conditions'
    // } else if (tabId === 'deco-central') {
    //   // Navigate to decompression central page
    //   window.location.href = '/deco-central'
    } else {
      onTabChange(tabId)
    }
    setIsOpen(false)
  }

  return (
    <>
      {/* Hamburger Menu Button - Now visible on all devices */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors w-10 h-10 flex items-center justify-center group relative"
        aria-label="Open navigation menu"
      >
        <HiOutlineBars3 className="h-6 w-6" />
        {/* Menu indicator for desktop */}
        <div className="hidden md:block absolute -bottom-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full flex items-center justify-center">
          <svg className="w-2 h-2 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </div>
      </button>

      {/* Full Screen Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[1100]">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal Content - Responsive design */}
          <div className="relative h-full md:h-auto bg-gray-800 flex flex-col md:max-w-md md:mx-auto md:mt-12 md:rounded-lg md:border md:border-gray-600">
            {/* Header */}
            <div className="flex items-center justify-between p-3 md:p-2 border-b border-gray-700">
              <h2 className="text-lg md:text-base font-semibold text-white">Navigation</h2>
              <div className="flex items-center gap-3">
                <UnitsToggle showLabel={false} />
                <button
                  onClick={() => { setIsOpen(false); setPreferencesOpen(true) }}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                  aria-label="Open preferences"
                  title="Preferences"
                >
                  <FiSettings className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                  aria-label="Close navigation menu"
                >
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 md:flex-none overflow-y-auto">
              <nav className="p-2 md:p-2">
                {tabs.map((tab) => {
                  const IconComponent = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabSelect(tab.id)}
                      className={`w-full text-left p-2.5 md:p-2 rounded-md mb-1.5 md:mb-1 transition-colors ${
                        activeTab === tab.id
                          ? 'bg-yellow-600 text-white'
                          : 'text-gray-300 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <IconComponent className="w-5 h-5 text-white flex-shrink-0" />
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-base md:text-sm font-medium">{tab.label}</span>
                          <span className={`text-xs md:text-xs mt-0.5 leading-tight ${
                            activeTab === tab.id
                              ? 'text-yellow-200'
                              : 'text-blue-300'
                          }`}>{tab.description}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </nav>
            </div>
          </div>
        </div>
      )}

      <PreferencesModal isOpen={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
    </>
  )
}
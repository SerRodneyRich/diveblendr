'use client'

import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FiSettings } from 'react-icons/fi'
import { tankSpecifications, getCommonTanks, TankSpecification } from '../data/tankSpecifications'
import { useUnitConversion } from '../hooks/useUnitConversion'
import { usePreferences } from '../contexts/PreferencesContext'
import { PreferencesModal } from './PreferencesModal'

interface TankSelectorProps {
  selectedTankId?: string
  onTankSelect: (tank: TankSpecification) => void
  units?: 'metric' | 'imperial'
  showCommonOnly?: boolean
  allowTwinsets?: boolean
  className?: string
  label?: string
  showPressure?: boolean
  showMaterial?: boolean
  compactView?: boolean
}

// Tooltip Component using Portal
interface TooltipProps {
  content: string
  children: React.ReactNode
}

const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPosition({
        x: rect.right + 8, // 8px to the right of the trigger
        y: rect.top - 8   // 8px above the trigger
      })
    }
  }

  useEffect(() => {
    if (isVisible) {
      updatePosition()
      // Update position on scroll/resize
      const handleUpdate = () => updatePosition()
      window.addEventListener('scroll', handleUpdate)
      window.addEventListener('resize', handleUpdate)
      return () => {
        window.removeEventListener('scroll', handleUpdate)
        window.removeEventListener('resize', handleUpdate)
      }
    }
  }, [isVisible])

  const tooltipContent = isVisible && (
    <div 
      className="fixed z-[9999] px-3 py-2 text-xs text-white bg-gray-900 border border-gray-600 rounded-lg shadow-xl whitespace-pre-line max-w-80"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translateY(-100%)'
      }}
    >
      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 -translate-x-2"></div>
      {content}
    </div>
  )

  return (
    <>
      <div 
        ref={triggerRef}
        className="relative inline-block"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {typeof window !== 'undefined' && createPortal(tooltipContent, document.body)}
    </>
  )
}

const TankSelector: React.FC<TankSelectorProps> = ({
  selectedTankId,
  onTankSelect,
  units = 'metric',
  showCommonOnly = false,
  allowTwinsets = true,
  className = '',
  label = 'Tank Configuration',
  showPressure = true,
  showMaterial = true,
  compactView = false
}) => {
  const { convertPressure, convertVolume, preferences } = useUnitConversion();
  const { preferences: diverPreferences } = usePreferences();
  const [materialFilter, setMaterialFilter] = React.useState<'aluminum' | 'steel' | 'twinset' | 'all'>('all')
  const [prefsOpen, setPrefsOpen] = useState(false)

  // Use global units preference instead of prop
  const currentUnits = preferences.system === 'metric' ? 'metric' : 'imperial';

  // Get available tanks based on filters
  const getAvailableTanks = (): TankSpecification[] => {
    let systemTanks = showCommonOnly ? getCommonTanks() : tankSpecifications

    // Filter by region preference
    if (units === 'metric') {
      systemTanks = systemTanks.filter(tank => tank.region === 'metric' || tank.region === 'universal')
    } else {
      systemTanks = systemTanks.filter(tank => tank.region === 'imperial' || tank.region === 'universal')
    }

    // Filter twinsets if not allowed
    if (!allowTwinsets) {
      systemTanks = systemTanks.filter(tank => tank.type === 'single')
    }

    // Apply material filter (only to system tanks)
    if (materialFilter !== 'all') {
      if (materialFilter === 'twinset') {
        systemTanks = systemTanks.filter(tank => tank.type === 'twinset')
      } else {
        systemTanks = systemTanks.filter(tank => tank.material === materialFilter)
      }
    }

    // Sort system tanks by volume for better organization
    systemTanks = systemTanks.sort((a, b) => a.waterVolumeL - b.waterVolumeL)

    // Prepend custom tanks (always shown, never filtered by region)
    const customTanks: TankSpecification[] = diverPreferences.customTanks

    return [...customTanks, ...systemTanks]
  }

  const availableTanks = getAvailableTanks()

  const formatTankOption = (tank: TankSpecification): string => {
    const volume = convertVolume(tank.waterVolumeL).formatted
    const pressure = convertPressure(tank.workingPressureBar, 1).formatted
    
    if (compactView) {
      return `${tank.name} (${volume})`
    }
    
    const pressureStr = showPressure ? ` @ ${pressure}` : ''
    const materialStr = showMaterial ? ` ${tank.material.charAt(0).toUpperCase()}` : ''
    
    return `${tank.name} (${volume}${pressureStr})${materialStr}`
  }

  const getMaterialIcon = (material: string): string => {
    switch (material) {
      case 'aluminum': return '🔵'
      case 'steel': return '⚪'
      default: return '⚪'
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray-300 font-medium">{label}</label>
          <button
            type="button"
            onClick={() => setPrefsOpen(true)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-yellow-400 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-700"
            title="Manage custom tanks"
            aria-label="Manage custom tanks in preferences"
          >
            <FiSettings className="w-3.5 h-3.5" />
            <span>Manage</span>
          </button>
        </div>
        <PreferencesModal isOpen={prefsOpen} onClose={() => setPrefsOpen(false)} initialTab="tanks" />
        
{compactView ? (
          /* Compact View - Simple Dropdown */
          <select
            value={selectedTankId || ''}
            onChange={(e) => {
              const tank = availableTanks.find(t => t.id === e.target.value)
              if (tank) {
                onTankSelect(tank)
              }
            }}
            className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
          >
            <option value="">Select a tank...</option>
            {availableTanks.map(tank => (
              <option key={tank.id} value={tank.id}>
                {formatTankOption(tank)}
              </option>
            ))}
          </select>
        ) : (
          /* Full View - Chips and Grid */
          <>
            {/* Material Filter Chips */}
            <div className="flex gap-2 mb-2 flex-wrap">
              <button
                onClick={() => setMaterialFilter('all')}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs transition-colors font-medium ${
                  materialFilter === 'all' 
                    ? 'bg-yellow-600 text-white shadow-md' 
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setMaterialFilter('aluminum')}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs transition-colors font-medium ${
                  materialFilter === 'aluminum' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'bg-gray-700 hover:bg-blue-600 text-gray-300'
                }`}
              >
                🔵 Aluminum
              </button>
              <button
                onClick={() => setMaterialFilter('steel')}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs transition-colors font-medium ${
                  materialFilter === 'steel' 
                    ? 'bg-gray-500 text-white shadow-md' 
                    : 'bg-gray-700 hover:bg-gray-500 text-gray-300'
                }`}
              >
                ⚪ Steel
              </button>
              {allowTwinsets && (
                <button
                  onClick={() => setMaterialFilter('twinset')}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs transition-colors font-medium ${
                    materialFilter === 'twinset' 
                      ? 'bg-purple-600 text-white shadow-md' 
                      : 'bg-gray-700 hover:bg-purple-600 text-gray-300'
                  }`}
                >
                  ⚫⚫ Twinset / Sidemount
                </button>
              )}
            </div>

            {/* Tank Grid Selection */}
            <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto border border-gray-600 rounded-lg p-1 bg-gray-800">
              {availableTanks.map((tank, index) => {
                const isSelected = selectedTankId === tank.id
                const volume = convertVolume(tank.waterVolumeL).formatted
                const pressure = convertPressure(tank.workingPressureBar, 1).formatted
                
                const isCustomTank = diverPreferences.customTanks.some(ct => ct.id === tank.id)
                const isDefaultTank = diverPreferences.defaultTankId === tank.id

                return (
                  <button
                    key={tank.id}
                    onClick={() => onTankSelect(tank)}
                    className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : index % 2 === 0
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                        : 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Material chip */}
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        tank.material === 'aluminum' ? 'bg-blue-500 text-blue-100' :
                        'bg-gray-500 text-gray-100'
                      }`}>
                        {getMaterialIcon(tank.material)}
                      </span>

                      {/* Default tank star */}
                      {isDefaultTank && (
                        <span className="text-yellow-400">★</span>
                      )}

                      {/* Tank name */}
                      <span className="font-semibold">{tank.name}</span>

                      {/* Custom tank badge */}
                      {isCustomTank && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-700 text-green-100 font-medium">Custom</span>
                      )}

                      {/* Twinset badge */}
                      {tank.type === 'twinset' && (
                        <span className="inline-flex items-center px-1 py-0.5 rounded text-xs bg-purple-500 text-purple-100 font-medium">
                          Twin/SM
                        </span>
                      )}
                      
                      {/* Description/notes inline */}
                      {tank.notes && (
                        <span className="text-xs text-yellow-300 italic truncate">
                          {tank.notes}
                        </span>
                      )}
                      
                      {/* Spacer to push specs to right */}
                      <div className="flex-1"></div>
                      
                      {/* Info icon with tooltip */}
                      <Tooltip
                        content={`${getMaterialIcon(tank.material)} ${tank.commonName}
Water Volume: ${volume}
Working Pressure: ${pressure}
Material: ${tank.material}${tank.type === 'twinset' ? '\nConfiguration: Twinset' : ''}
Volume @ STP: ${convertVolume(tank.waterVolumeL * tank.workingPressureBar).formatted}${currentUnits === 'metric' ? `\nImperial Equiv: ${tank.waterVolumeCuFt}ft³` : `\nMetric Equiv: ${tank.waterVolumeL}L`}${tank.notes ? `\n💡 ${tank.notes}` : ''}`}
                      >
                        <span className="text-gray-400 hover:text-blue-400 cursor-help text-sm">
                          ℹ️
                        </span>
                      </Tooltip>
                      
                      {/* Volume and pressure specs */}
                      <div className="flex items-center gap-2 text-xs font-mono ml-2">
                        <span className="font-semibold">{volume}</span>
                        <span className="text-gray-400">@</span>
                        <span className="text-gray-400">{pressure}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>


    </div>
  )
}

export default TankSelector
'use client'

import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { safeRound, RoundingType } from '../utils/safeRounding'
import { calculateMOD, calculateEND } from '../utils/endModCalculations'
import { useUnitConversion } from '../hooks/useUnitConversion'

// Gas composition and tank details interface
interface GasDetails {
  o2Percent: number
  n2Percent: number
  hePercent: number
  totalPressure: number
  tankSizeL: number
  volumeAtSTP: number
  mod: number
  end: number
  // Partial pressures
  o2PartialPressure: number
  n2PartialPressure: number
  hePartialPressure: number
  // Gas volumes in liters
  o2VolumeL: number
  n2VolumeL: number
  heVolumeL: number
  totalVolumeL: number
}

// Main component props
interface TankVisualizationProps {
  o2Percent: number
  n2Percent: number  
  hePercent: number
  totalPressure: number
  tankSizeL: number
  maxPPO2?: number  // For MOD calculation
  iconMode?: boolean
  disableTooltip?: boolean  // Disable tooltip to prevent nesting
  className?: string
  onHover?: (details: GasDetails | null) => void
}

// Tooltip component using portal pattern
interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  isVisible: boolean
  onVisibilityChange: (visible: boolean) => void
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, isVisible, onVisibilityChange }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPosition({
        x: rect.right + 8,
        y: rect.top - 8
      })
    }
  }

  useEffect(() => {
    if (isVisible) {
      updatePosition()
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
    className="fixed z-[9999] px-4 py-3 text-sm text-white bg-gray-900 border border-gray-600 rounded-lg shadow-xl whitespace-pre-line w-96 max-w-[calc(100vw-2rem)] sm:w-[28rem]"
    style={{
      left: `${position.x}px`,
      top: `${position.y}px`,
      transform: 'translate(-100%, -100%)' // 👈 shift left instead of right
    }}
  >
    {/* Arrow now points right instead of left */}
    <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-full 
                    w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-gray-900"></div>
    {content}
  </div>
)


  return (
    <>
      <div 
        ref={triggerRef}
        className="relative inline-block"
        onMouseEnter={() => onVisibilityChange(true)}
        onMouseLeave={() => onVisibilityChange(false)}
      >
        {children}
      </div>
      {typeof window !== 'undefined' && createPortal(tooltipContent, document.body)}
    </>
  )
}

// --- Helper functions ---

// MOD calculation using centralized function
const calculateMODForTank = (o2Percent: number, ppo2Limit: number = 1.4): number => {
  if (o2Percent <= 0) return 0
  try {
    const mixture = { oxygen: o2Percent, helium: 0, nitrogen: 100 - o2Percent }
    return calculateMOD(mixture, ppo2Limit)
  } catch {
    return 0
  }
}

// END calculation using centralized function  
const calculateENDForTank = (o2Percent: number, n2Percent: number, hePercent: number, modDepth: number): number => {
  if (modDepth <= 0) return 0
  try {
    const mixture = { oxygen: o2Percent, helium: hePercent, nitrogen: n2Percent }
    return calculateEND(mixture, modDepth)
  } catch {
    return 0
  }
}

const calculatePartialPressures = (o2Percent: number, n2Percent: number, hePercent: number, totalPressure: number) => {
  const safeO2Percent = safeRound(o2Percent, RoundingType.O2, 1)
  const safeN2Percent = safeRound(n2Percent, RoundingType.N2, 1)
  const safeHePercent = safeRound(hePercent, RoundingType.HE, 1)
  const safeTotalPressure = safeRound(totalPressure, RoundingType.PRESSURE, 1)
  
  return {
    o2PartialPressure: safeRound((safeO2Percent / 100) * safeTotalPressure, RoundingType.PPO2, 2),
    n2PartialPressure: safeRound((safeN2Percent / 100) * safeTotalPressure, RoundingType.PRESSURE, 1),
    hePartialPressure: safeRound((safeHePercent / 100) * safeTotalPressure, RoundingType.PRESSURE, 1)
  }
}

const calculateGasVolumes = (o2Percent: number, n2Percent: number, hePercent: number, totalPressure: number, tankSizeL: number) => {
  const safeO2Percent = safeRound(o2Percent, RoundingType.O2, 1)
  const safeN2Percent = safeRound(n2Percent, RoundingType.N2, 1)
  const safeHePercent = safeRound(hePercent, RoundingType.HE, 1)
  const safeTotalPressure = safeRound(totalPressure, RoundingType.PRESSURE, 1)
  const safeTankSizeL = safeRound(tankSizeL, RoundingType.OTHER, 1)
  
  const totalVolumeL = safeTotalPressure * safeTankSizeL
  
  return {
    o2VolumeL: safeRound((safeO2Percent / 100) * totalVolumeL, RoundingType.OTHER, 0),
    n2VolumeL: safeRound((safeN2Percent / 100) * totalVolumeL, RoundingType.OTHER, 0),
    heVolumeL: safeRound((safeHePercent / 100) * totalVolumeL, RoundingType.OTHER, 0),
    totalVolumeL: safeRound(totalVolumeL, RoundingType.OTHER, 0)
  }
}

// --- Main component ---
const TankVisualization: React.FC<TankVisualizationProps> = ({
  o2Percent,
  n2Percent,
  hePercent,
  totalPressure,
  tankSizeL,
  maxPPO2 = 1.4,
  iconMode = false,
  disableTooltip = false,
  className = '',
  onHover
}) => {
  const { convertPressure, convertDepth, convertVolume } = useUnitConversion();
  const [showTooltip, setShowTooltip] = useState(false)

  // Derived values
  const volumeAtSTP = totalPressure * tankSizeL
  const mod = calculateMODForTank(o2Percent, maxPPO2)
  const end = calculateENDForTank(o2Percent, n2Percent, hePercent, mod) // now END is tied to MOD
  const partialPressures = calculatePartialPressures(o2Percent, n2Percent, hePercent, totalPressure)
  const gasVolumes = calculateGasVolumes(o2Percent, n2Percent, hePercent, totalPressure, tankSizeL)

  const gasDetails: GasDetails = {
    o2Percent,
    n2Percent,
    hePercent,
    totalPressure,
    tankSizeL,
    volumeAtSTP,
    mod,
    end,
    ...partialPressures,
    ...gasVolumes
  }

  // Handle hover
  const handleHover = (isHovering: boolean) => {
    setShowTooltip(isHovering)
    if (onHover) {
      onHover(isHovering ? gasDetails : null)
    }
  }

  // Enhanced tooltip content with 2-column layout
  const tooltipContent = (
    <div className="grid grid-cols-2 gap-6 min-w-0">
      {/* Left Column: Tank Visualization */}
      <div className="flex items-center justify-center">
        <TankVisualization
          o2Percent={o2Percent}
          n2Percent={n2Percent}
          hePercent={hePercent}
          totalPressure={totalPressure}
          tankSizeL={tankSizeL}
          maxPPO2={maxPPO2}
          iconMode={false}
          disableTooltip={true}
        />
      </div>
      
      {/* Right Column: Stats */}
      <div className="space-y-3">
        {/* Gas Composition */}
        <div>
          <div className="font-semibold text-blue-300 mb-1 text-xs">Gas Composition</div>
          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between">
              <span className="text-blue-300">O₂:</span>
              <span>{o2Percent.toFixed(1)}% ({convertPressure(partialPressures.o2PartialPressure).formatted})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-300">He:</span>
              <span>{hePercent.toFixed(1)}% ({convertPressure(partialPressures.hePartialPressure).formatted})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">N₂:</span>
              <span>{n2Percent.toFixed(1)}% ({convertPressure(partialPressures.n2PartialPressure).formatted})</span>
            </div>
          </div>
        </div>

        {/* Gas Volumes */}
        <div>
          <div className="font-semibold text-green-300 mb-1 text-xs">Gas Volumes @ STP</div>
          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between">
              <span className="text-blue-300">O₂:</span>
              <span>{convertVolume(gasVolumes.o2VolumeL).formatted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-300">He:</span>
              <span>{convertVolume(gasVolumes.heVolumeL).formatted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">N₂:</span>
              <span>{convertVolume(gasVolumes.n2VolumeL).formatted}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-gray-600 pt-1 mt-1">
              <span>Total:</span>
              <span>{convertVolume(gasVolumes.totalVolumeL).formatted}</span>
            </div>
          </div>
        </div>

        {/* Tank Details */}
        <div>
          <div className="font-semibold text-yellow-300 mb-1 text-xs">Tank Details</div>
          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between">
              <span>Pressure:</span>
              <span>{convertPressure(totalPressure).formatted}</span>
            </div>
            <div className="flex justify-between">
              <span>Volume:</span>
              <span>{convertVolume(tankSizeL).formatted}</span>
            </div>
            <div className="flex justify-between">
              <span>MOD @ {maxPPO2}:</span>
              <span>{convertDepth(mod).formatted}</span>
            </div>
            <div className="flex justify-between">
              <span>END @ MOD:</span>
              <span>{convertDepth(end).formatted}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // Calculate gas layer heights (as percentages of total height)
  const totalPercent = o2Percent + hePercent + n2Percent
  const o2Height = totalPercent > 0 ? (o2Percent / totalPercent) * 100 : 0
  const heHeight = totalPercent > 0 ? (hePercent / totalPercent) * 100 : 0
  const n2Height = totalPercent > 0 ? (n2Percent / totalPercent) * 100 : 0

  // CSS Tank Shape Component
  const TankShape = ({ width, height, showLabels = false }: { width: number, height: number, showLabels?: boolean }) => {
    const valveHeight = Math.max(4, height * 0.1)
    const valveWidth = Math.max(6, width * 0.4)
    const tankBodyHeight = height - valveHeight
    const tankBodyWidth = width

    return (
      <div className="relative" style={{ width: `${width}px`, height: `${height}px` }}>
        {/* Tank valve/neck */}
        <div 
          className="absolute top-0 left-1/2 transform -translate-x-1/2 bg-gray-600 border border-gray-500"
          style={{ 
            width: `${valveWidth}px`, 
            height: `${valveHeight}px`,
            borderRadius: '2px 2px 0 0'
          }}
        />
        
        {/* Tank body */}
        <div 
          className="absolute bg-gray-800 border-2 border-gray-500 overflow-hidden"
          style={{ 
            top: `${valveHeight}px`,
            width: `${tankBodyWidth}px`, 
            height: `${tankBodyHeight}px`,
            borderRadius: '0 0 6px 6px'
          }}
        >
          {/* Gas layers container */}
          <div className="absolute bottom-0 left-0 right-0 flex flex-col-reverse" style={{ height: '100%' }}>
            {/* Oxygen layer (bottom) */}
            {o2Height > 0 && (
              <div 
                className="bg-blue-500 relative transition-all duration-300"
                style={{ 
                  height: `${o2Height}%`,
                  opacity: totalPressure > 0 ? 0.8 : 0.3
                }}
              >
                {showLabels && o2Height > 20 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white text-xs font-bold drop-shadow-lg">
                      O₂ {o2Percent.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* Helium layer (middle) */}
            {heHeight > 0 && (
              <div 
                className="bg-purple-500 relative transition-all duration-300"
                style={{ 
                  height: `${heHeight}%`,
                  opacity: totalPressure > 0 ? 0.8 : 0.3
                }}
              >
                {showLabels && heHeight > 20 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white text-xs font-bold drop-shadow-lg">
                      He {hePercent.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* Nitrogen layer (top) */}
            {n2Height > 0 && (
              <div 
                className="bg-gray-500 relative transition-all duration-300"
                style={{ 
                  height: `${n2Height}%`,
                  opacity: totalPressure > 0 ? 0.8 : 0.3
                }}
              >
                {showLabels && n2Height > 20 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white text-xs font-bold drop-shadow-lg">
                      N₂ {n2Percent.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Empty tank indicator */}
          {totalPressure === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-gray-400 text-xs">Empty</span>
            </div>
          )}
        </div>

      </div>
    )
  }

  // Icon mode rendering
  if (iconMode) {
    if (disableTooltip) {
      // No tooltip version for embedding inside other tooltips
      return (
        <div className={`relative inline-block ${className}`}>
          <TankShape width={12} height={32} />
        </div>
      )
    }
    
    // Standard tooltip version
    return (
      <Tooltip 
        content={tooltipContent}
        isVisible={showTooltip}
        onVisibilityChange={handleHover}
      >
        <div className={`relative inline-block cursor-help ${className}`}>
          <TankShape width={12} height={32} />
        </div>
      </Tooltip>
    )
  }

  // Full mode rendering
  return (
    <div 
      className={`relative inline-block ${className}`}
      onMouseEnter={() => !disableTooltip && handleHover(true)}
      onMouseLeave={() => !disableTooltip && handleHover(false)}
    >
      <TankShape width={80} height={160} showLabels={true} />

      {/* Hover details */}
      {!disableTooltip && showTooltip && (
        <div className="absolute top-0 right-full mr-4 bg-gray-900 border border-gray-600 rounded-lg p-4 text-sm text-white z-50 shadow-xl w-96 max-w-[calc(100vw-2rem)] sm:w-[28rem]">
          <div className="font-semibold text-yellow-400 mb-3">Gas Details</div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-gray-400 mb-1">Composition & Partial Pressures</div>
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-blue-300">O₂:</span>
                  <span>{o2Percent.toFixed(1)}% ({convertPressure(partialPressures.o2PartialPressure).formatted})</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-purple-300">He:</span>
                  <span>{hePercent.toFixed(1)}% ({convertPressure(partialPressures.hePartialPressure).formatted})</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-300">N₂:</span>
                  <span>{n2Percent.toFixed(1)}% ({convertPressure(partialPressures.n2PartialPressure).formatted})</span>
                </div>
              </div>
            </div>
            
            <div className="border-t border-gray-600 pt-2">
              <div className="text-xs text-gray-400 mb-1">Gas Volumes @ STP</div>
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-blue-300">O₂:</span>
                  <span>{convertVolume(gasVolumes.o2VolumeL).formatted}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-purple-300">He:</span>
                  <span>{convertVolume(gasVolumes.heVolumeL).formatted}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-300">N₂:</span>
                  <span>{convertVolume(gasVolumes.n2VolumeL).formatted}</span>
                </div>
                <div className="flex justify-between gap-4 font-semibold border-t border-gray-700 pt-1">
                  <span>Total:</span>
                  <span>{convertVolume(gasVolumes.totalVolumeL).formatted}</span>
                </div>
              </div>
            </div>
            
            <div className="border-t border-gray-600 pt-2 space-y-1">
              <div className="flex justify-between gap-4">
                <span>Pressure:</span>
                <span>{convertPressure(totalPressure).formatted}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Tank Size:</span>
                <span>{convertVolume(tankSizeL).formatted}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>MOD @ {maxPPO2}:</span>
                <span>{convertDepth(mod).formatted}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>END:</span>
                <span>{convertDepth(end).formatted}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TankVisualization
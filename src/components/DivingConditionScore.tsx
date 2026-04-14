'use client'

import React, { memo } from 'react'
import { FaQuestionCircle } from 'react-icons/fa'
import { useUnitConversion } from '@/hooks/useUnitConversion'

interface DivingConditionScoreProps {
  divingCondition: {
    score: number
    rating: string
    color: string
    explanation: {
      waveHeight?: number
      swellHeight?: number
      windWaveHeight?: number
      currentVelocity?: number
    }
  }
  showTooltip: boolean
  onToggleTooltip: () => void
}

const DivingConditionScore = memo(({ divingCondition, showTooltip, onToggleTooltip }: DivingConditionScoreProps) => {
  const { convertDepth, preferences } = useUnitConversion()
  
  return (
    <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-blue-300">Diving Conditions</h3>
        <div className="relative">
          <button
            onMouseEnter={() => onToggleTooltip()}
            onMouseLeave={() => onToggleTooltip()}
            onClick={() => onToggleTooltip()}
            className="text-gray-400 hover:text-blue-300 transition-colors"
          >
            <FaQuestionCircle />
          </button>
          
          {/* Tooltip */}
          {showTooltip && (
            <div className="absolute right-0 top-6 w-80 bg-black/90 backdrop-blur-sm border border-white/30 rounded-lg p-4 z-1500 shadow-xl">
              <h4 className="text-sm font-semibold text-blue-300 mb-2">How Diving Score is Calculated:</h4>
              <div className="text-xs text-gray-300 space-y-1">
                <p><strong>Starting Score:</strong> 100 points</p>
                <p><strong>Wave Height and Wave Swell Penalties subtracted</strong></p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-4xl font-bold" style={{ color: divingCondition.color }}>
            {divingCondition.score}
          </div>
          <div className="text-sm text-gray-400">Score</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold" style={{ color: divingCondition.color }}>
            {divingCondition.rating}
          </div>
          <div className="text-sm text-gray-400">Rating</div>
        </div>
        <div className="flex-1">
          <div className="text-sm text-gray-400 mb-1">Condition Breakdown:</div>
          <div className="text-xs text-gray-300 space-y-0.5">
            <div>Wave: {divingCondition.explanation.waveHeight ? convertDepth(divingCondition.explanation.waveHeight, 1).formatted : 'N/A'}</div>
            <div>Swell: {divingCondition.explanation.swellHeight ? convertDepth(divingCondition.explanation.swellHeight, 1).formatted : 'N/A'}</div>
            <div>Current: {divingCondition.explanation.currentVelocity ? `${preferences.depth === 'meters' ? divingCondition.explanation.currentVelocity.toFixed(1) : (divingCondition.explanation.currentVelocity * 3.28084).toFixed(1)} ${preferences.depth === 'meters' ? 'm/s' : 'ft/s'}` : 'N/A'}</div>
          </div>
        </div>
      </div>
    </div>
  )
})

DivingConditionScore.displayName = 'DivingConditionScore'

export default DivingConditionScore
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import TankSelector from './TankSelector'
import { TankSpecification } from '../data/tankSpecifications'
import { safeRound, RoundingType } from '../utils/safeRounding'
import WarningIconStack, { Warning } from './WarningIconStack'
import { useUnitConversion } from '../hooks/useUnitConversion'

interface BottomTimeParams {
  sacRate: number
  mod: number
  tankSize: number
  startPressure: number
  selectedTankId?: string
  planningMode: 'open-water' | 'cave'
}

interface CalculationResults {
  ataAtMod: number
  sacAtDepth: number
  descentTime: number
  ascentTime: number
  turnPressure: number
  availableGas: number
  descentAscentGas: number
  bottomTime: number
  totalDiveTime: number
  gasRemaining: number
}

interface BottomTimeCalculatorProps {
  initialMod?: number
  initialTankSize?: number
  initialSelectedTankId?: string
  onModChange?: (mod: number) => void
  standalone?: boolean
}

export default function BottomTimeCalculator({
  initialMod = 30,
  initialTankSize = 12,
  initialSelectedTankId,
  onModChange,
  standalone = false
}: BottomTimeCalculatorProps) {
  const { preferences } = useUnitConversion()
  const units = preferences.system === 'metric' ? 'metric' : 'imperial'
  
  // NOTE: sacRate is now RMV/surface volume (L/min or ft³/min)
  const defaultRmv = units === 'metric' ? 15 /* L/min */ : 0.53 /* ft³/min (~15 L/min) */

  const [params, setParams] = useState<BottomTimeParams>({
    sacRate: defaultRmv, // RMV (L/min or ft³/min)
    mod: initialMod,
    tankSize: initialTankSize,
    startPressure: units === 'metric' ? 200 : 3000,
    selectedTankId: initialSelectedTankId,
    planningMode: 'open-water'
  })

  const [warnings, setWarnings] = useState<Warning[]>([])

  // Update units when global preference changes
  useEffect(() => {
    setParams(prev => ({
      ...prev,
      sacRate: units === 'metric' ? 15 : 0.53, // convert defaults to RMV units
      startPressure: units === 'metric' ? 200 : 3000
    }))
  }, [units])

  // Update MOD when prop changes
  useEffect(() => {
    if (initialMod && initialMod !== params.mod) {
      setParams(prev => ({ ...prev, mod: initialMod }))
    }
  }, [initialMod]) // Remove params.mod from dependencies to avoid loops

  // Update tank size when prop changes
  useEffect(() => {
    if (initialTankSize && initialTankSize !== params.tankSize) {
      setParams(prev => ({ ...prev, tankSize: initialTankSize }))
    }
  }, [initialTankSize]) // Remove params.tankSize from dependencies to avoid loops

  const updateParam = useCallback((key: keyof BottomTimeParams, value: number | string) => {
    setParams(prev => ({ ...prev, [key]: value }))
    
    // Notify parent of MOD changes
    if (key === 'mod' && onModChange && typeof value === 'number') {
      onModChange(value)
    }
  }, [onModChange])

  const handleTankSelect = useCallback((tank: TankSpecification) => {
    const newTankSize = units === 'metric' ? tank.waterVolumeL : tank.waterVolumeCuFt
    setParams(prev => ({
      ...prev,
      tankSize: newTankSize,
      selectedTankId: tank.id
    }))
  }, [units])

  // Memoize calculation results to prevent unnecessary recalculations
  const results = useMemo((): CalculationResults => {
    const { sacRate, mod, tankSize, startPressure, planningMode } = params

    // Validate all inputs - return zero results if any are invalid
    if (!sacRate || sacRate <= 0 || 
        !mod || mod <= 0 || 
        !tankSize || tankSize <= 0 || 
        !startPressure || startPressure <= 0 ||
        !isFinite(sacRate) || !isFinite(mod) || !isFinite(tankSize) || !isFinite(startPressure)) {
      return {
        ataAtMod: 0,
        sacAtDepth: 0,
        descentTime: 0,
        ascentTime: 0,
        turnPressure: 0,
        availableGas: 0,
        descentAscentGas: 0,
        bottomTime: 0,
        totalDiveTime: 0,
        gasRemaining: 0
      }
    }

    // Calculate ATA at MOD
    const ataAtMod = units === 'metric' 
      ? (mod / 10) + 1 
      : (mod / 33) + 1

    // sacRate is RMV (surface volume/min), e.g. L/min or ft³/min.
    // Consumption at depth (volume/min) = RMV * ATA_at_depth
    const consumptionRateAtDepth = sacRate * ataAtMod

    // Standard ascent/descent rates
    const descentRate = units === 'metric' ? 20 : 66 // m/min or ft/min
    const ascentRate = units === 'metric' ? 9 : 30   // m/min or ft/min

    // Time for descent and ascent (minutes)
    const descentTime = mod / descentRate
    const ascentTime = mod / ascentRate

    // Total gas available (convert pressure to volume)
    // startPressure (bar or psi) * tankSize (L or ft³) -> total volume at surface units
    const totalGasAvailable = startPressure * tankSize

    // Usable gas fraction based on planning mode
    // Cave: Use 1/3 (usable), Reserve 2/3 for return/emergency  
    // Open Water: Use 2/3 (usable), Reserve 1/3 for safety/emergency
    const usableGasFraction = planningMode === 'cave' ? 1/3 : 2/3
    
    // Available gas for the dive (usable portion in volume units)
    const availableGas = totalGasAvailable * usableGasFraction

    // Gas consumed during descent and ascent (volume units)
    const descentAscentGas = (descentTime + ascentTime) * consumptionRateAtDepth

    // Available gas for bottom time
    const gasForBottomTime = Math.max(0, availableGas - descentAscentGas)

    // Bottom time = available gas / consumption rate (prevent division by zero)
    const bottomTime = consumptionRateAtDepth > 0 ? gasForBottomTime / consumptionRateAtDepth : 0

    // Total dive time
    const totalDiveTime = descentTime + bottomTime + ascentTime

    // Turn pressure (when to start ascent)
    const turnPressure = startPressure * (1 - usableGasFraction)

    // Gas remaining at end (should be the reserved portion)
    const totalGasUsed = totalDiveTime * consumptionRateAtDepth
    const gasRemaining = totalGasAvailable - totalGasUsed

    return {
      ataAtMod: safeRound(ataAtMod, RoundingType.PRESSURE, 2),
      // sacAtDepth now represents RMV at depth (volume/min)
      sacAtDepth: safeRound(consumptionRateAtDepth, RoundingType.OTHER, 2),
      descentTime: safeRound(descentTime, RoundingType.OTHER, 1),
      ascentTime: safeRound(ascentTime, RoundingType.OTHER, 1),
      turnPressure: safeRound(turnPressure, RoundingType.PRESSURE, 0),
      availableGas: safeRound(availableGas, RoundingType.OTHER, 0),
      descentAscentGas: safeRound(descentAscentGas, RoundingType.OTHER, 0),
      bottomTime: safeRound(bottomTime, RoundingType.OTHER, 1),
      totalDiveTime: safeRound(totalDiveTime, RoundingType.OTHER, 1),
      gasRemaining: safeRound(gasRemaining, RoundingType.OTHER, 0)
    }
  }, [params, units])

  // Generate warnings based on calculations - use useMemo to avoid infinite re-renders
  const generatedWarnings = useMemo(() => {
    const newWarnings: Warning[] = []

    // Input validation warnings
    if (!params.sacRate || params.sacRate <= 0 || !isFinite(params.sacRate)) {
      newWarnings.push({
        id: 'missing-sac-rate',
        type: 'danger',
        title: 'Missing SAC/RMV',
        message: 'Please enter a valid RMV (surface volume consumption in L/min or ft³/min).'
      })
    }

    if (!params.mod || params.mod <= 0 || !isFinite(params.mod)) {
      newWarnings.push({
        id: 'missing-depth',
        type: 'danger',
        title: 'Missing Depth',
        message: 'Please enter a valid target depth to calculate bottom time.'
      })
    }

    if (!params.tankSize || params.tankSize <= 0 || !isFinite(params.tankSize)) {
      newWarnings.push({
        id: 'missing-tank-size',
        type: 'danger',
        title: 'Missing Tank Size',
        message: 'Please enter a valid tank size to calculate bottom time.'
      })
    }

    if (!params.startPressure || params.startPressure <= 0 || !isFinite(params.startPressure)) {
      newWarnings.push({
        id: 'missing-start-pressure',
        type: 'danger',
        title: 'Missing Start Pressure',
        message: 'Please enter a valid starting pressure to calculate bottom time.'
      })
    }

    // Only show calculation-based warnings if all inputs are valid
    const allInputsValid = params.sacRate > 0 && params.mod > 0 && params.tankSize > 0 && params.startPressure > 0

    if (allInputsValid) {
      // Short bottom time warning
      if (results.bottomTime < 10 && results.bottomTime > 0) {
        newWarnings.push({
          id: 'short-bottom-time',
          type: 'warning',
          title: 'Short Bottom Time',
          message: `Bottom time of ${results.bottomTime.toFixed(1)} minutes may not justify descent/ascent overhead. Consider shallower depth or larger tank.`
        })
      }

      // High RMV warning (thresholds tuned for volume units)
      const highRmvThreshold = units === 'metric' ? 25 /* L/min */ : 1.0 /* ft³/min (~28 L/min) */
      if (params.sacRate > highRmvThreshold) {
        newWarnings.push({
          id: 'high-sac-rate',
          type: 'warning', 
          title: 'High RMV',
          message: `RMV of ${params.sacRate} ${units === 'metric' ? 'L/min' : 'ft³/min'} is quite high. Consider using a more conservative estimate.`
        })
      }

      // Shallow MOD warning
      const minDepth = units === 'metric' ? 15 : 50
      if (params.mod < minDepth) {
        newWarnings.push({
          id: 'shallow-mod',
          type: 'info',
          title: 'Shallow Depth',
          message: `MOD of ${params.mod}${units === 'metric' ? 'm' : 'ft'} is quite shallow. Descent/ascent may consume significant portion of dive time.`
        })
      }

      // Insufficient gas warning
      if (results.gasRemaining < 0) {
        newWarnings.push({
          id: 'insufficient-gas',
          type: 'danger',
          title: 'Insufficient Gas',
          message: 'Calculated dive plan exceeds available gas supply. Reduce depth, increase tank size, or improve RMV.'
        })
      }

      // Very short bottom time (essentially no bottom time)
      if (results.bottomTime <= 2 && results.bottomTime > 0) {
        newWarnings.push({
          id: 'minimal-bottom-time',
          type: 'danger',
          title: 'Minimal Bottom Time',
          message: 'Almost no bottom time available. This dive profile is not practical.'
        })
      }
    }

    return newWarnings
  }, [results.bottomTime, results.gasRemaining, params.sacRate, params.mod, params.startPressure, params.tankSize, units])

  // Update warnings only when generated warnings change
  useEffect(() => {
    setWarnings(generatedWarnings)
  }, [generatedWarnings])

  const pressureUnit = units === 'metric' ? 'bar' : 'psi'
  const depthUnit = units === 'metric' ? 'm' : 'ft'
  const volumeUnit = units === 'metric' ? 'L' : 'ft³'
  const sacUnit = units === 'metric' ? 'L/min' : 'ft³/min' // RMV units

  return (
    <div className="bg-gray-700 p-4 rounded-lg space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-cyan-400">Bottom Time Calculator</h3>
        <WarningIconStack warnings={warnings} />
      </div>

      {/* Planning Mode Selector */}
      <div className="bg-gray-600 p-3 rounded">
        <h4 className="text-sm font-semibold text-yellow-400 mb-2">Planning Mode</h4>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="planningMode"
              checked={params.planningMode === 'open-water'}
              onChange={() => updateParam('planningMode', 'open-water')}
              className="text-cyan-400"
            />
            <span className="text-sm">Open Water (use 2/3)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="planningMode"
              checked={params.planningMode === 'cave'}
              onChange={() => updateParam('planningMode', 'cave')}
              className="text-cyan-400"
            />
            <span className="text-sm">Cave (use 1/3)</span>
          </label>
        </div>
      </div>

      {/* Input Parameters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column - Basic Parameters */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-green-400 mb-2">
              Estimated SAC (RMV @ surface) ({sacUnit})
            </label>
            <input
              type="number"
              step="0.1"
              value={params.sacRate}
              onChange={(e) => updateParam('sacRate', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white"
              placeholder={`Enter your RMV in ${sacUnit}`}
            />
            <p className="text-xs text-gray-400 mt-1">
              Surface volume consumption (RMV). This value should be independent of tank size.
            </p>
            {params.sacRate > 0 && (
              <p className="text-xs text-cyan-400 mt-1 font-mono">
                ≈ {params.sacRate.toFixed(1)} {volumeUnit}/min (surface)
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-blue-400 mb-2">
              {standalone ? 'Target Depth' : 'MOD'} ({depthUnit})
            </label>
            <input
              type="number"
              step="1"
              value={params.mod}
              onChange={(e) => updateParam('mod', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white"
              placeholder={standalone ? `Target dive depth in ${depthUnit}` : `Maximum operating depth in ${depthUnit}`}
            />
            {standalone && (
              <p className="text-xs text-gray-400 mt-1">
                Maximum depth you plan to reach on this dive
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-purple-400 mb-2">
              Starting Pressure ({pressureUnit})
            </label>
            <input
              type="number"
              step={units === 'metric' ? 5 : 50}
              value={params.startPressure}
              onChange={(e) => updateParam('startPressure', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white"
              placeholder={`Tank pressure at start in ${pressureUnit}`}
            />
          </div>
        </div>

        {/* Right Column - Tank Configuration */}
        <div>
          <TankSelector
            selectedTankId={params.selectedTankId}
            onTankSelect={handleTankSelect}
            allowTwinsets={true}
            showCommonOnly={false}
            compactView={false}
            label="Tank Configuration"
            showPressure={true}
            showMaterial={false}
          />
          <div className="mt-3">
            <label className="block text-sm text-gray-300 mb-1">
              Manual Tank Size ({volumeUnit})
            </label>
            <input
              type="number"
              step="0.1"
              value={params.tankSize}
              onChange={(e) => updateParam('tankSize', parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
              placeholder="Override tank size"
            />
          </div>
        </div>
      </div>

      {/* Results Display */}
      <div className="bg-gray-600 p-4 rounded">
        <h4 className="text-lg font-semibold text-yellow-400 mb-4">Dive Plan Results:</h4> <h4 className="text-red-400 font-bold p-2 text-center">DOES NOT INCLUDE DECOMPRESSION,BAILOUT, OR SAFETY STOPS</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Main Result - Bottom Time or Penetration Time */}
          <div className="col-span-full md:col-span-2 bg-gray-800 p-4 rounded text-center">
            <div className="text-sm text-gray-300">
              {params.planningMode === 'cave' ? 'Conservative Penetration Time' : 'Conservative Bottom Time'}
            </div>
            <div className="text-3xl font-bold text-cyan-400">
              {results.bottomTime.toFixed(1)} min
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {params.planningMode === 'cave' 
                ? `One-way travel time at ${params.mod}${depthUnit}` 
                : `At ${params.mod}${depthUnit} depth`
              }
            </div>
          </div>

          {/* Turn Pressure */}
          <div className="bg-gray-800 p-4 rounded text-center">
            <div className="text-sm text-gray-300">Turn Pressure</div>
            <div className="text-3xl font-bold text-red-400">
              {results.turnPressure} {pressureUnit}
            </div>
          </div>

          {/* Total Dive Time */}
          <div className="bg-gray-800 p-4 rounded text-center">
            <div className="text-sm text-gray-300">Total Dive Time</div>
            <div className="text-3xl font-bold text-green-400">
              {params.planningMode === 'cave' 
                ? (results.descentTime + results.bottomTime * 2 + results.ascentTime).toFixed(1)
                : results.totalDiveTime.toFixed(1)
              } min
            </div>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-700 p-3 rounded">
            <h5 className="font-semibold text-orange-400 mb-2">Time Breakdown</h5>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Descent:</span>
                <span>{results.descentTime.toFixed(1)} min</span>
              </div>
              <div className="flex justify-between">
                <span>Bottom:</span>
                <span className="font-semibold text-cyan-400">{results.bottomTime.toFixed(1)} min</span>
              </div>
              {params.planningMode === 'cave' && (
                <div className="flex justify-between">
                  <span>Return trip:</span>
                  <span className="text-yellow-400">{results.bottomTime.toFixed(1)} min</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Ascent:</span>
                <span>{results.ascentTime.toFixed(1)} min</span>
              </div>
              <div className="flex justify-between border-t border-gray-600 pt-1">
                <span className="font-semibold">Total:</span>
                <span className="font-semibold">
                  {params.planningMode === 'cave' 
                    ? (results.descentTime + results.bottomTime * 2 + results.ascentTime).toFixed(1)
                    : results.totalDiveTime.toFixed(1)
                  } min
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gray-700 p-3 rounded">
            <h5 className="font-semibold text-orange-400 mb-2">Gas Consumption</h5>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>RMV at depth:</span>
                <span>{results.sacAtDepth.toFixed(2)} {sacUnit}</span>
              </div>
              <div className="flex justify-between">
                <span>RMV (surface):</span>
                <span>
                  {params.sacRate.toFixed(1)} {volumeUnit}/min
                </span>
              </div>
              <div className="flex justify-between">
                <span>Consumption rate at depth:</span>
                <span>
                  {(params.sacRate * results.ataAtMod).toFixed(1)} {volumeUnit}/min
                </span>
              </div>
              <div className="flex justify-between">
                <span>ATA at {params.mod}{depthUnit}:</span>
                <span>{results.ataAtMod.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Available gas:</span>
                <span>{results.availableGas} {volumeUnit}</span>
              </div>
              <div className="flex justify-between">
                <span>Gas remaining:</span>
                <span className={results.gasRemaining < 0 ? 'text-red-400 font-semibold' : ''}>
                  {results.gasRemaining} {volumeUnit}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Planning Notes */}
        <div className="mt-4 bg-blue-900 border border-blue-600 p-3 rounded">
          <h5 className="font-semibold text-blue-300 mb-2">💡 Planning Notes</h5>
          <div className="text-sm text-blue-200 space-y-1">
            <p>• Turn pressure assumes {params.planningMode === 'cave' ? '2/3' : '1/3'} gas reserve for {params.planningMode === 'cave' ? 'overhead environment' : 'open water safety'}</p>
            <p>• Descent rate: {units === 'metric' ? '20 m/min' : '66 ft/min'}, Ascent rate: {units === 'metric' ? '9 m/min' : '30 ft/min'}</p>
            <p>• RMV (surface) is entered as a volume flow (L/min or ft³/min) and should be independent of tank size.</p>
            <p>• Add safety margin for stress, cold water, or equipment issues</p>
            <p>• Consider actual dive profile if significantly multilevel</p>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import TankSelector from './TankSelector'
import { TankSpecification } from '../data/tankSpecifications'
import { useUnitConversion } from '../hooks/useUnitConversion'

interface DiveEntry {
  id: number
  startPressure: number
  endPressure: number
  avgDepth: number
  diveTime: number
  tankSize: number
  sac: number
  rmv: number
  notes: string
}

interface SacParams {
  startPressure: number
  endPressure: number
  avgDepth: number
  diveTime: number
  tankSize: number
  workingPressure: number
  selectedTankId?: string
}


interface ContinuousReading {
  time: number
  pressure: number
  sac: number
  rmv: number
  phase: 'working' | 'deco' | 'safety'
}

interface ContinuousParams {
  currentDepth: number
  baselinePressure: number
  baselineTime: number
}

export default function SacCalculator() {
  const { 
    convertPressure, 
    convertDepth, 
    convertVolume,
    parsePressureInput,
    parseDepthInput,
    parseVolumeInput,
    getUnitLabels,
    preferences 
  } = useUnitConversion()
  
  const unitLabels = getUnitLabels()
  const units = preferences.system === 'metric' ? 'metric' : 'imperial'
  
  const [sacParams, setSacParams] = useState<SacParams>({
    startPressure: preferences.system === 'metric' ? 200 : 2900, // bar vs psi
    endPressure: preferences.system === 'metric' ? 50 : 500,     // bar vs psi
    avgDepth: preferences.system === 'metric' ? 18 : 60,         // meters vs feet
    diveTime: 45,
    tankSize: preferences.system === 'metric' ? 12 : 80,         // liters vs cubic feet
    workingPressure: preferences.system === 'metric' ? 232 : 3000, // bar vs psi
    selectedTankId: undefined
  })


  const [diveHistory, setDiveHistory] = useState<DiveEntry[]>([])
  const [showMath, setShowMath] = useState(false)
  const [activeCalculation, setActiveCalculation] = useState<'single' | 'continuous'>('single')
  const [notes, setNotes] = useState('')
  
  const [continuousParams, setContinuousParams] = useState<ContinuousParams>({
    currentDepth: 30,
    baselinePressure: 200,
    baselineTime: 0
  })
  const [continuousReadings, setContinuousReadings] = useState<ContinuousReading[]>([])
  const [currentPhase, setCurrentPhase] = useState<'working' | 'deco' | 'safety'>('working')
  const [baselineSet, setBaselineSet] = useState(false)


  // Experience level benchmarks
  const experienceBenchmarks = {
    beginner: { sacRange: [1.2, 2.0], rmvRange: [18, 30], color: 'text-red-400', isLessThan: false },
    intermediate: { sacRange: [0.8, 1.4], rmvRange: [12, 20], color: 'text-yellow-400', isLessThan: false },
    advanced: { sacRange: [0.6, 1.0], rmvRange: [10, 15], color: 'text-green-400', isLessThan: false },
    instructor: { sacThreshold: 0.6, rmvThreshold: 10, color: 'text-blue-400', isLessThan: true }
  }

  // Calculate SAC and RMV
  const calculateSAC = () => {
    const { startPressure, endPressure, avgDepth, diveTime, tankSize, workingPressure } = sacParams
    
    // Convert display values to metric for calculation
    const startPressureBar = parsePressureInput(startPressure)
    const endPressureBar = parsePressureInput(endPressure)
    const avgDepthMeters = parseDepthInput(avgDepth)
    const tankSizeL = parseVolumeInput(tankSize)
    const workingPressureBar = parsePressureInput(workingPressure)
    
    const pressureUsed = startPressureBar - endPressureBar
    
    if (pressureUsed <= 0 || diveTime <= 0 || avgDepthMeters < 0) {
      return { sac: 0, rmv: 0, ata: 1, tankVolume: 0, gasUsed: 0 }
    }

    // Calculate absolute pressure (ATA) - always in metric internally
    const ata = (avgDepthMeters / 10) + 1

    // Calculate tank volume at working pressure (always in liters internally)
    const tankVolume = tankSizeL

    // Calculate gas used in volume (liters)
    const gasUsed = pressureUsed * tankSizeL

    // Calculate SAC (pressure per minute in bar/min)
    const sac = pressureUsed / (ata * diveTime)

    // Calculate RMV (volume per minute at surface in L/min)
    const rmv = (gasUsed / diveTime) / ata

    return { sac, rmv, ata, tankVolume, gasUsed }
  }

  const { sac, rmv, ata, tankVolume, gasUsed } = calculateSAC()


  // Add dive to history
  const addDiveToHistory = () => {
    if (sac > 0 && rmv > 0) {
      const newEntry: DiveEntry = {
        id: Date.now(),
        startPressure: sacParams.startPressure,
        endPressure: sacParams.endPressure,
        avgDepth: sacParams.avgDepth,
        diveTime: sacParams.diveTime,
        tankSize: sacParams.tankSize,
        sac: parseFloat(sac.toFixed(2)),
        rmv: parseFloat(rmv.toFixed(1)),
        notes: notes
      }
      setDiveHistory(prev => [...prev, newEntry])
      setNotes('')
    }
  }


  // Check which benchmarks match current SAC/RMV rates
  const getBenchmarkMatches = () => {
    if (sac <= 0 || rmv <= 0) return { matches: {}, hasFullMatch: false }
    
    const allMatches: Record<string, { sacMatch: boolean; rmvMatch: boolean }> = {}
    let hasFullMatch = false
    
    Object.entries(experienceBenchmarks).forEach(([level, bench]) => {
      let sacInRange, rmvInRange
      
      if (level === 'instructor') {
        const instructorBench = bench as { sacThreshold: number; rmvThreshold: number; color: string; isLessThan: boolean }
        sacInRange = sac < instructorBench.sacThreshold  // <0.6 for instructor
        rmvInRange = rmv < instructorBench.rmvThreshold  // <10 for instructor
      } else {
        const rangeBench = bench as { sacRange: number[]; rmvRange: number[]; color: string; isLessThan: boolean }
        sacInRange = sac >= rangeBench.sacRange[0] && sac <= rangeBench.sacRange[1]
        rmvInRange = rmv >= rangeBench.rmvRange[0] && rmv <= rangeBench.rmvRange[1]
      }
      
      if (sacInRange && rmvInRange) {
        hasFullMatch = true
      }
      
      allMatches[level] = { sacMatch: sacInRange, rmvMatch: rmvInRange }
    })
    
    // If we have full matches, only return those. Otherwise return partial matches.
    const finalMatches: Record<string, { sacMatch: boolean; rmvMatch: boolean }> = {}
    
    Object.entries(allMatches).forEach(([level, match]) => {
      if (hasFullMatch) {
        // Only include levels where both SAC and RMV match
        if (match.sacMatch && match.rmvMatch) {
          finalMatches[level] = match
        }
      } else {
        // Include levels where either SAC or RMV match
        if (match.sacMatch || match.rmvMatch) {
          finalMatches[level] = match
        }
      }
    })
    
    return { matches: finalMatches, hasFullMatch }
  }

  const benchmarkMatches = getBenchmarkMatches()

  const updateParam = (key: keyof SacParams, value: number | string) => {
    setSacParams(prev => ({ ...prev, [key]: value }))
  }

  const handleTankSelect = (tank: TankSpecification) => {
    const newTankSize = preferences.system === 'metric' ? tank.waterVolumeL : tank.waterVolumeCuFt
    const newWorkingPressure = preferences.system === 'metric' ? tank.workingPressureBar : tank.workingPressurePSI
    
    setSacParams(prev => ({
      ...prev,
      tankSize: newTankSize,
      workingPressure: newWorkingPressure,
      selectedTankId: tank.id
    }))
  }


  const clearHistory = () => {
    setDiveHistory([])
  }

  // Continuous SAC calculation for single level
  const addContinuousReading = () => {
    const { currentDepth, baselinePressure, baselineTime } = continuousParams
    const currentPressure = sacParams.endPressure
    const currentTime = sacParams.diveTime
    
    // For first reading, just update the baseline
    if (!baselineSet) {
      setContinuousParams(prev => ({
        ...prev,
        baselinePressure: currentPressure,
        baselineTime: currentTime
      }))
      setBaselineSet(true)
      console.log(`Baseline set: ${currentTime} min, ${convertPressure(parsePressureInput(currentPressure)).formatted}`)
      return
    }
    
    // For subsequent readings, need time > baseline and pressure < baseline
    if (currentTime <= baselineTime || currentPressure >= baselinePressure) {
      console.log(`Invalid reading: time ${currentTime} vs baseline ${baselineTime}, pressure ${currentPressure} vs baseline ${baselinePressure}`)
      return
    }
    
    const pressureUsedBar = parsePressureInput(baselinePressure - currentPressure)
    const timeElapsed = currentTime - baselineTime
    const currentDepthMeters = parseDepthInput(currentDepth)
    const ata = (currentDepthMeters / 10) + 1
    
    const sac = pressureUsedBar / (ata * timeElapsed)
    const tankSizeL = parseVolumeInput(sacParams.tankSize)
    const gasUsed = pressureUsedBar * tankSizeL
    const rmv = gasUsed / (ata * timeElapsed)
    
    console.log(`Calculation debug:
      - Pressure used: ${convertPressure(pressureUsedBar).formatted}
      - Time elapsed: ${timeElapsed} min
      - ATA: ${ata}
      - Tank size: ${convertVolume(tankSizeL).formatted}
      - Working pressure: ${convertPressure(parsePressureInput(sacParams.workingPressure)).formatted}
      - Gas used: ${convertVolume(gasUsed).formatted}
      - SAC: ${sac}
      - RMV: ${rmv}
    `)
    
    const newReading: ContinuousReading = {
      time: currentTime,
      pressure: currentPressure,
      sac: parseFloat(sac.toFixed(2)),
      rmv: parseFloat(rmv.toFixed(2)), // Changed to 2 decimal places for better precision
      phase: currentPhase
    }
    
    setContinuousReadings(prev => [...prev, newReading])
    
    // Update baseline for next reading
    setContinuousParams(prev => ({
      ...prev,
      baselinePressure: currentPressure,
      baselineTime: currentTime
    }))
  }

  const resetContinuous = () => {
    setContinuousReadings([])
    setBaselineSet(false)
    setContinuousParams(prev => ({
      ...prev,
      baselinePressure: sacParams.startPressure,
      baselineTime: 0
    }))
  }

  const updateContinuousParam = (key: keyof ContinuousParams, value: number) => {
    setContinuousParams(prev => ({ ...prev, [key]: value }))
  }

  // Calculate phase-specific averages
  const getPhaseAverages = () => {
    const phases = {
      working: continuousReadings.filter(r => r.phase === 'working'),
      deco: continuousReadings.filter(r => r.phase === 'deco'),
      safety: continuousReadings.filter(r => r.phase === 'safety')
    }
    
    return Object.entries(phases).reduce((acc, [phase, readings]) => {
      if (readings.length > 0) {
        acc[phase as keyof typeof phases] = {
          avgSAC: readings.reduce((sum, r) => sum + r.sac, 0) / readings.length,
          avgRMV: readings.reduce((sum, r) => sum + r.rmv, 0) / readings.length,
          count: readings.length
        }
      }
      return acc
    }, {} as Record<string, { avgSAC: number; avgRMV: number; count: number }>)
  }

  const phaseAverages = getPhaseAverages()

  return (
    <div className="space-y-6">
      {/* Calculation Mode and Tank Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-400 mb-3">Calculation Mode</h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="calcMode"
                  checked={activeCalculation === 'single'}
                  onChange={() => setActiveCalculation('single')}
                  className="text-yellow-400"
                />
                <span className="text-sm">Single Dive Analysis</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="calcMode"
                  checked={activeCalculation === 'continuous'}
                  onChange={() => setActiveCalculation('continuous')}
                  className="text-yellow-400"
                />
                <span className="text-sm">Continuous Monitoring</span>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-gray-700 p-4 rounded-lg">
          <TankSelector
            selectedTankId={sacParams.selectedTankId}
            onTankSelect={handleTankSelect}
            allowTwinsets={true}
            showCommonOnly={false}
            compactView={false}
            label="Tank Configuration"
            showPressure={true}
            showMaterial={true}
          />
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                {units === 'metric' ? 'Manual Size (L)' : 'Manual Size (ft³)'}
              </label>
              <input
                type="number"
                value={sacParams.tankSize}
                onChange={(e) => updateParam('tankSize', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                placeholder="Override tank size"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                {units === 'metric' ? 'Manual WP (bar)' : 'Manual WP (psi)'}
              </label>
              <input
                type="number"
                value={sacParams.workingPressure}
                onChange={(e) => updateParam('workingPressure', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                placeholder="Override working pressure"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Single Dive Calculator */}
      {activeCalculation === 'single' && (
        <div className="bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-green-400 mb-3">Dive Data Entry</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Start Pressure ({units === 'metric' ? 'bar' : 'psi'})
              </label>
              <input
                type="number"
                value={sacParams.startPressure}
                onChange={(e) => updateParam('startPressure', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-2 bg-gray-600 border border-gray-500 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                End Pressure ({units === 'metric' ? 'bar' : 'psi'})
              </label>
              <input
                type="number"
                value={sacParams.endPressure}
                onChange={(e) => updateParam('endPressure', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-2 bg-gray-600 border border-gray-500 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Avg Depth ({units === 'metric' ? 'm' : 'ft'})
              </label>
              <input
                type="number"
                value={sacParams.avgDepth}
                onChange={(e) => updateParam('avgDepth', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-2 bg-gray-600 border border-gray-500 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Dive Time (min)</label>
              <input
                type="number"
                value={sacParams.diveTime}
                onChange={(e) => updateParam('diveTime', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-2 bg-gray-600 border border-gray-500 rounded text-white"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-sm text-gray-300 mb-1">Notes (optional)</label>
            <input
              type="text"
              placeholder="e.g., strong current, cold water, stressed..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
            />
          </div>
        </div>
      )}

      {/* Continuous Monitoring */}
      {activeCalculation === 'continuous' && (
        <div className="space-y-4">
          <div className="bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-cyan-400 mb-3">Single-Level Continuous SAC</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-yellow-400 mb-2">Dive Setup</h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      Current Depth ({units === 'metric' ? 'm' : 'ft'})
                    </label>
                    <input
                      type="number"
                      value={continuousParams.currentDepth}
                      onChange={(e) => updateContinuousParam('currentDepth', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">Dive Phase</label>
                    <select
                      value={currentPhase}
                      onChange={(e) => setCurrentPhase(e.target.value as 'working' | 'deco' | 'safety')}
                      className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                    >
                      <option value="working">Working (Bottom)</option>
                      <option value="deco">Decompression</option>
                      <option value="safety">Safety Stop</option>
                    </select>
                  </div>
                  <div className="text-xs text-gray-400 bg-gray-800 p-2 rounded">
                    ATA: {(units === 'metric' ? (continuousParams.currentDepth / 10) + 1 : (continuousParams.currentDepth / 33) + 1).toFixed(1)}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-2">Current Reading</h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">Time (min)</label>
                    <input
                      type="number"
                      value={sacParams.diveTime}
                      onChange={(e) => updateParam('diveTime', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      Pressure ({units === 'metric' ? 'bar' : 'psi'})
                    </label>
                    <input
                      type="number"
                      value={sacParams.endPressure}
                      onChange={(e) => updateParam('endPressure', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                    />
                  </div>
                  <button
                    onClick={addContinuousReading}
                    disabled={baselineSet && (sacParams.diveTime <= continuousParams.baselineTime || sacParams.endPressure >= continuousParams.baselinePressure)}
                    className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-1 rounded text-sm transition-colors"
                  >
                    {!baselineSet ? 'Set Baseline' : 'Add Reading'}
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-blue-400 mb-2">Baseline</h4>
                <div className="space-y-2">
                  <div className="text-xs text-gray-400">
                    <div>Time: {continuousParams.baselineTime} min</div>
                    <div>Pressure: {continuousParams.baselinePressure} {units === 'metric' ? 'bar' : 'psi'}</div>
                  </div>
                  <button
                    onClick={resetContinuous}
                    className="w-full bg-red-600 hover:bg-red-500 text-white py-1 rounded text-sm transition-colors"
                  >
                    Reset Session
                  </button>
                  <div className="text-xs text-gray-500 text-center">
                    Readings: {continuousReadings.length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Phase Averages */}
          {Object.keys(phaseAverages).length > 0 && (
            <div className="bg-gray-700 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-purple-400 mb-3">Phase-Specific SAC Rates</h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {Object.entries(phaseAverages).map(([phase, stats]) => (
                  <div key={phase} className="bg-gray-600 p-3 rounded">
                    <h4 className="font-semibold text-yellow-400 capitalize mb-2">{phase} Phase</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Avg SAC:</span>
                        <span className="font-mono">{stats.avgSAC.toFixed(2)} {units === 'metric' ? 'bar/min' : 'psi/min'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg RMV:</span>
                        <span className="font-mono">{stats.avgRMV.toFixed(2)} {units === 'metric' ? 'L/min' : 'ft³/min'}</span>
                      </div>
                      <div className="text-xs text-gray-400 text-center">
                        {stats.count} reading{stats.count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Continuous Readings Table */}
          {continuousReadings.length > 0 && (
            <div className="bg-gray-700 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-green-400 mb-3">Reading History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="text-left py-2 text-gray-300">Time</th>
                      <th className="text-left py-2 text-gray-300">Pressure</th>
                      <th className="text-left py-2 text-gray-300">SAC</th>
                      <th className="text-left py-2 text-gray-300">RMV</th>
                      <th className="text-left py-2 text-gray-300">Phase</th>
                      <th className="text-left py-2 text-gray-300">Interval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {continuousReadings.map((reading, index) => {
                      let prevTime
                      if (index === 0) {
                        // First reading - use baseline time
                        prevTime = continuousParams.baselineTime
                      } else {
                        // Subsequent readings - use previous reading time
                        prevTime = continuousReadings[index - 1].time
                      }
                      const interval = reading.time - prevTime
                      return (
                        <tr key={index} className="border-b border-gray-600">
                          <td className="py-2">{reading.time}min</td>
                          <td className="py-2">{reading.pressure}{units === 'metric' ? 'bar' : 'psi'}</td>
                          <td className="py-2 font-mono">{reading.sac.toFixed(2)}</td>
                          <td className="py-2 font-mono">{reading.rmv.toFixed(2)}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              reading.phase === 'working' ? 'bg-blue-600 text-blue-100' :
                              reading.phase === 'deco' ? 'bg-yellow-600 text-yellow-100' :
                              'bg-green-600 text-green-100'
                            }`}>
                              {reading.phase}
                            </span>
                          </td>
                          <td className="py-2 text-gray-400">{interval.toFixed(1)}min</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results Display */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Current SAC/RMV */}
        <div className="bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-green-400 mb-3">Current Results</h3>
          <div className="space-y-3">
            <div className="bg-gray-600 p-3 rounded text-center">
              <div className="text-sm text-gray-300">SAC Rate</div>
              <div className="text-xl font-bold text-yellow-400">
                {sac.toFixed(2)} {units === 'metric' ? 'bar/min' : 'psi/min'}
              </div>
            </div>
            <div className="bg-gray-600 p-3 rounded text-center">
              <div className="text-sm text-gray-300">RMV Rate</div>
              <div className="text-xl font-bold text-blue-400">
                {rmv.toFixed(1)} {units === 'metric' ? 'L/min' : 'ft³/min'}
              </div>
            </div>
            <div className="bg-gray-600 p-3 rounded text-center">
              <div className="text-sm text-gray-300">Gas Used</div>
              <div className="text-lg font-bold text-purple-400">
                {gasUsed.toFixed(1)} {units === 'metric' ? 'L' : 'ft³'}
              </div>
            </div>
          </div>

          {sac > 0 && (
            <button
              onClick={addDiveToHistory}
              className="w-full mt-3 bg-green-600 hover:bg-green-500 text-white py-2 rounded font-semibold transition-colors"
            >
              Add to History
            </button>
          )}
        </div>

        {/* Experience Benchmarks */}
        <div className="bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-orange-400 mb-3">Experience Benchmarks</h3>
          <div className="space-y-2">
            {Object.entries(experienceBenchmarks).map(([level, bench]) => {
              const match = benchmarkMatches.matches[level]
              const isMatch = !!match
              return (
                <div key={level} className={`p-2 rounded text-sm ${isMatch ? 'bg-gray-600 border border-yellow-400' : 'bg-gray-800'}`}>
                  <div className={`font-semibold capitalize ${bench.color}`}>
                    {level} {isMatch && `← ${match.sacMatch && match.rmvMatch ? 'SAC & RMV' : match.sacMatch ? 'SAC' : 'RMV'}`}
                  </div>
                  <div className="text-xs text-gray-400">
                    SAC: {level === 'instructor' ? `<${(bench as { sacThreshold: number }).sacThreshold}` : `${(bench as { sacRange: number[] }).sacRange[0]}-${(bench as { sacRange: number[] }).sacRange[1]}`} {units === 'metric' ? 'bar/min' : 'psi/min'}
                  </div>
                  <div className="text-xs text-gray-400">
                    RMV: {level === 'instructor' ? `<${(bench as { rmvThreshold: number }).rmvThreshold}` : `${(bench as { rmvRange: number[] }).rmvRange[0]}-${(bench as { rmvRange: number[] }).rmvRange[1]}`} {units === 'metric' ? 'L/min' : 'ft³/min'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>


      {/* Dive History */}
      {diveHistory.length > 0 && (
        <div className="bg-gray-700 p-4 rounded-lg">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-purple-400">Dive History</h3>
            <button
              onClick={clearHistory}
              className="text-sm px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
            >
              Clear History
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="text-left py-2 text-gray-300">Depth</th>
                  <th className="text-left py-2 text-gray-300">Time</th>
                  <th className="text-left py-2 text-gray-300">Gas Used</th>
                  <th className="text-left py-2 text-gray-300">SAC</th>
                  <th className="text-left py-2 text-gray-300">RMV</th>
                  <th className="text-left py-2 text-gray-300">Notes</th>
                </tr>
              </thead>
              <tbody>
                {diveHistory.slice(-10).map((dive) => (
                  <tr key={dive.id} className="border-b border-gray-600">
                    <td className="py-2">{dive.avgDepth}{units === 'metric' ? 'm' : 'ft'}</td>
                    <td className="py-2">{dive.diveTime}min</td>
                    <td className="py-2">{(dive.startPressure - dive.endPressure).toFixed(0)}{units === 'metric' ? 'bar' : 'psi'}</td>
                    <td className="py-2 font-mono">{dive.sac.toFixed(2)}</td>
                    <td className="py-2 font-mono">{dive.rmv.toFixed(1)}</td>
                    <td className="py-2 text-gray-400 truncate max-w-24">{dive.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mathematical Details */}
      <div className="bg-gray-700 p-4 rounded-lg">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-blue-400">Mathematical Details</h3>
          <button
            onClick={() => setShowMath(!showMath)}
            className="text-sm px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded transition-colors"
          >
            {showMath ? 'Hide' : 'Show'} Math
          </button>
        </div>

        {showMath && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-semibold text-green-400 mb-2">SAC Calculation</h4>
              <div className="font-mono text-xs bg-gray-800 p-3 rounded space-y-1">
                <div>Pressure Used: {(sacParams.startPressure - sacParams.endPressure).toFixed(0)} {units === 'metric' ? 'bar' : 'psi'}</div>
                <div>ATA: {ata.toFixed(2)} ({sacParams.avgDepth}{units === 'metric' ? 'm' : 'ft'} ÷ {units === 'metric' ? '10' : '33'} + 1)</div>
                <div>Time: {sacParams.diveTime} minutes</div>
                <div className="border-t border-gray-600 pt-1 mt-2">
                  SAC = Pressure Used ÷ (ATA × Time)
                </div>
                <div>SAC = {(sacParams.startPressure - sacParams.endPressure).toFixed(0)} ÷ ({ata.toFixed(2)} × {sacParams.diveTime})</div>
                <div className="text-yellow-400">SAC = {sac.toFixed(2)} {units === 'metric' ? 'bar/min' : 'psi/min'}</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-blue-400 mb-2">RMV Calculation</h4>
              <div className="font-mono text-xs bg-gray-800 p-3 rounded space-y-1">
                <div>Tank Volume: {tankVolume.toFixed(1)} {units === 'metric' ? 'L' : 'ft³'}</div>
                <div>Gas Used: {gasUsed.toFixed(1)} {units === 'metric' ? 'L' : 'ft³'}</div>
                <div>ATA: {ata.toFixed(2)}</div>
                <div>Time: {sacParams.diveTime} minutes</div>
                <div className="border-t border-gray-600 pt-1 mt-2">
                  RMV = Gas Used ÷ (ATA × Time)
                </div>
                <div>RMV = {gasUsed.toFixed(1)} ÷ ({ata.toFixed(2)} × {sacParams.diveTime})</div>
                <div className="text-blue-400">RMV = {rmv.toFixed(1)} {units === 'metric' ? 'L/min' : 'ft³/min'}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Tips */}
      <div className="bg-gradient-to-r from-blue-900 to-purple-900 border border-blue-600 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-300 mb-2">💡 SAC Calculator Tips</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm text-blue-200">
          <div>
            <h4 className="font-semibold text-cyan-300 mb-1">Accuracy Tips:</h4>
            <ul className="space-y-1 text-xs">
              <li>• Use average depth for multilevel dives</li>
              <li>• Exclude safety stops from bottom time</li>
              <li>• Record multiple dives for better average</li>
              <li>• Note conditions affecting consumption</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-cyan-300 mb-1">Planning Usage:</h4>
            <ul className="space-y-1 text-xs">
              <li>• Apply 1.2-1.5x stress factor for planning</li>
              <li>• Account for cold water (+20% consumption)</li>
              <li>• Add safety margin for technical dives</li>
              <li>• RMV transfers between tank types</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
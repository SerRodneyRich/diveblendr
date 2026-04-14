'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { Warning } from './WarningIconStack'
import { safeRound, RoundingType } from '../utils/safeRounding'
import { performRealGasBlending, type RealGasBlendingParams } from '../utils/realGasBlending_v3'
import { shouldUseRealGas, isVanDerWaalsSuitable } from '../utils/vanDeWaalsPhysics'
import { calculateMOD } from '../utils/endModCalculations'
import VanDerWaalsModal from './VanDerWaalsModal'
import TankSelector from './TankSelector'
import TankVisualization from './TankVisualization'
import { TankSpecification } from '../data/tankSpecifications'
import { useUnitConversion } from '../hooks/useUnitConversion'

interface BlendingParams {
  targetO2: number
  targetHe: number
  targetPressure: number
  currentO2: number
  currentHe: number
  currentPressure: number
  availableO2: number
  availableHe: number
  availableAir: number
  tankSize: number
  selectedTankId?: string
  topOffO2: number
  topOffHe: number
  // Real gas parameters
  useRealGas: boolean
  temperatureCelsius: number
}

interface BlendingResult {
  method: 'partial-pressure' | 'continuous' | 'top-off'
  steps: BlendingStep[]
  finalMix: { o2: number, he: number, n2: number }
  warnings: Warning[]
  // Real gas properties
  useRealGas?: boolean
  temperature?: number
  finalRealGasProperties?: {
    compressibilityFactor: number
    deviation: number
    isSignificant: boolean
  }
  realGasRecommendation?: boolean
}

interface BlendingStep {
  step: number
  action: string
  gasType: 'O2' | 'He' | 'Air' | 'Nitrox'
  addPressure: number
  totalPressure: number
  resultingO2: number
  resultingHe: number
  description: string
  // Real gas properties
  compressibilityFactor?: number
  realGasDeviation?: number
  realGasProperties?: {
    compressibilityFactor: number
    deviation: number
    isSignificant: boolean
  }
}

// Conservative rounding functions for safety - now using centralized utility

// Helper function to create warnings with proper types
const createWarning = (message: string): Warning => {
  if (message.includes('DANGER') || message.includes('Hypoxic') || message.includes('below 8%')) {
    return { type: 'danger', message: message.replace('⚠️ DANGER: ', '') }
  } else if (message.includes('WARNING') || message.includes('High pressure') || message.includes('High O₂') || message.includes('accuracy')) {
    return { type: 'warning', message: message.replace('⚠️ WARNING: ', '').replace('⚠️ ', '') }
  } else if (message.includes('ERROR')) {
    return { type: 'danger', message: message.replace('⚠️ ERROR: ', '') }
  } else {
    return { type: 'info', message: message.replace('⚠️ ', '') }
  }
}

interface GasBlenderProps {
  onWarningsChange?: (warnings: Warning[]) => void
}

const GasBlender = memo(function GasBlender({ onWarningsChange }: GasBlenderProps) {
  const { convertPressure, convertTemperature, convertDepth, convertVolume, parsePressureInput, parseTemperatureInput, getUnitLabels, getConversionRanges } = useUnitConversion();
  const unitLabels = getUnitLabels();
  const ranges = getConversionRanges();

  const [blendingParams, setBlendingParams] = useState<BlendingParams>({
    targetO2: 32,
    targetHe: 0,
    targetPressure: 200,
    currentO2: 21,
    currentHe: 0,
    currentPressure: 0,
    availableO2: 100,
    availableHe: 100,
    availableAir: 21,
    tankSize: 12,
    selectedTankId: undefined,
    topOffO2: 21,
    topOffHe: 0,
    useRealGas: false,
    temperatureCelsius: 20
  })

  const [blendingMethod, setBlendingMethod] = useState<'partial-pressure' | 'continuous' | 'top-off'>('partial-pressure')
  const [result, setResult] = useState<BlendingResult | null>(null)
  const [showMath, setShowMath] = useState(false)
  const [showRealGasModal, setShowRealGasModal] = useState(false)
  const procedureRef = useRef<HTMLDivElement>(null)
  const [copyStatus, setCopyStatus] = useState<'text' | 'image' | null>(null)



  const calculatePartialPressure = useCallback((params: BlendingParams): BlendingResult => {
    const steps: BlendingStep[] = []
    const warnings: Warning[] = []
    let stepCounter = 1

    if (params.targetO2 + params.targetHe > 100) {
      warnings.push(createWarning('⚠️ ERROR: Target O₂ + He cannot exceed 100%'))
      return { method: 'partial-pressure', steps: [], finalMix: { o2: 0, he: 0, n2: 0 }, warnings }
    }

    // Calculate what we need in the final tank
    const targetO2Volume = (params.targetO2 / 100) * params.targetPressure * params.tankSize
    const targetHeVolume = (params.targetHe / 100) * params.targetPressure * params.tankSize
    const targetTotalVolume = params.targetPressure * params.tankSize
    
    // Calculate what we currently have
    let currentO2Volume = (params.currentO2 / 100) * params.currentPressure * params.tankSize
    let currentHeVolume = (params.currentHe / 100) * params.currentPressure * params.tankSize
    let currentTotalVolume = params.currentPressure * params.tankSize

    if (params.currentPressure === 0) {
      currentO2Volume = 0
      currentHeVolume = 0
      currentTotalVolume = 0
    }

    let workingO2Volume = currentO2Volume
    let workingHeVolume = currentHeVolume
    let workingTotalVolume = currentTotalVolume

    // Check if we need to bleed gas (current % too high)
    if (currentTotalVolume > 0) {
      const currentO2Percent = (currentO2Volume / currentTotalVolume) * 100
      const currentHePercent = (currentHeVolume / currentTotalVolume) * 100
      
      // If current percentages are higher than target, we need to bleed
      if (currentO2Percent > params.targetO2 || currentHePercent > params.targetHe) {
        // Calculate how much of current gas we can keep
        let keepFraction = 1.0
        
        if (currentO2Percent > params.targetO2) {
          keepFraction = Math.min(keepFraction, targetO2Volume / currentO2Volume)
        }
        
        if (currentHePercent > params.targetHe) {
          keepFraction = Math.min(keepFraction, targetHeVolume / currentHeVolume)
        }
        
        // Only bleed if keepFraction < 1.0
        if (keepFraction < 1.0) {
          const newTotalVolume = currentTotalVolume * keepFraction
          const bleedVolume = currentTotalVolume - newTotalVolume
          const bleedPressure = bleedVolume / params.tankSize
          
          if (bleedPressure > 0.1) {
            steps.push({
              step: stepCounter++,
              action: 'Bleed Gas',
              gasType: 'Air',
              addPressure: -bleedPressure,
              totalPressure: newTotalVolume / params.tankSize,
              resultingO2: currentO2Percent,
              resultingHe: currentHePercent,
              description: `Bleed ${convertPressure(bleedPressure).formatted} to reduce concentration`
            })
            
            workingTotalVolume = newTotalVolume
            workingO2Volume = currentO2Volume * keepFraction
            workingHeVolume = currentHeVolume * keepFraction
          }
        }
      }
    }

    // Add Helium if needed
    if (targetHeVolume > workingHeVolume) {
      const heVolumeToAdd = targetHeVolume - workingHeVolume
      // Account for helium purity - need more impure gas to get same amount of pure helium
      const actualHeVolumeToAdd = heVolumeToAdd / (params.availableHe / 100)
      const hePressureToAdd = actualHeVolumeToAdd / params.tankSize
      
      steps.push({
        step: stepCounter++,
        action: 'Add Helium',
        gasType: 'He',
        addPressure: hePressureToAdd,
        totalPressure: (workingTotalVolume + actualHeVolumeToAdd) / params.tankSize,
        resultingO2: (workingO2Volume / (workingTotalVolume + actualHeVolumeToAdd)) * 100,
        resultingHe: (targetHeVolume / (workingTotalVolume + actualHeVolumeToAdd)) * 100,
        description: `Add ${convertPressure(hePressureToAdd).formatted} helium (${params.availableHe}% purity)`
      })
      
      workingTotalVolume += actualHeVolumeToAdd
      workingHeVolume = targetHeVolume
    }

    // Calculate how much pure O2 and air we need using system of equations
    // Let x = pure O2 volume, y = air volume
    // x + y = remainingVolumeNeeded
    // x + (airO2% × y) = totalO2VolumeNeeded
    // Solving: y = (remainingVolumeNeeded - totalO2VolumeNeeded) / (1 - airO2%)
    const remainingVolumeNeeded = targetTotalVolume - workingTotalVolume
    const totalO2VolumeNeeded = targetO2Volume - workingO2Volume
    const airO2Fraction = params.availableAir / 100
    
    let airVolumeNeeded: number
    let pureO2VolumeNeeded: number
    
    if (Math.abs(1 - airO2Fraction) < 0.001) {
      // Handle 100% O2 source case
      pureO2VolumeNeeded = remainingVolumeNeeded
      airVolumeNeeded = 0
    } else {
      airVolumeNeeded = (remainingVolumeNeeded - totalO2VolumeNeeded) / (1 - airO2Fraction)
      pureO2VolumeNeeded = remainingVolumeNeeded - airVolumeNeeded
    }
    
    // Add Oxygen if needed (air O2 contribution calculated after this step)
    if (pureO2VolumeNeeded > 0) {
      // Account for oxygen purity - need more impure gas to get same amount of pure oxygen
      const actualO2VolumeToAdd = pureO2VolumeNeeded / (params.availableO2 / 100)
      const o2PressureToAdd = actualO2VolumeToAdd / params.tankSize
      
      steps.push({
        step: stepCounter++,
        action: 'Add Oxygen',
        gasType: 'O2',
        addPressure: o2PressureToAdd,
        totalPressure: (workingTotalVolume + actualO2VolumeToAdd) / params.tankSize,
        resultingO2: (workingO2Volume + pureO2VolumeNeeded) / (workingTotalVolume + actualO2VolumeToAdd) * 100,
        resultingHe: (workingHeVolume / (workingTotalVolume + actualO2VolumeToAdd)) * 100,
        description: `Add ${convertPressure(o2PressureToAdd).formatted} oxygen (${params.availableO2}% purity)`
      })
      
      workingTotalVolume += actualO2VolumeToAdd
      workingO2Volume += pureO2VolumeNeeded
    }

    // Top up with air
    if (airVolumeNeeded > 0 && workingTotalVolume < targetTotalVolume) {
      const airPressureToAdd = airVolumeNeeded / params.tankSize
      const airO2VolumeToAdd = (params.availableAir / 100) * airVolumeNeeded
      
      steps.push({
        step: stepCounter++,
        action: 'Top up with Air',
        gasType: 'Air',
        addPressure: airPressureToAdd,
        totalPressure: params.targetPressure,
        resultingO2: (workingO2Volume + airO2VolumeToAdd) / targetTotalVolume * 100,
        resultingHe: (workingHeVolume / targetTotalVolume) * 100,
        description: `Add ${convertPressure(airPressureToAdd).formatted} air`
      })
      
      workingO2Volume += airO2VolumeToAdd
    }

    const finalO2 = (workingO2Volume / targetTotalVolume) * 100
    const finalHe = (workingHeVolume / targetTotalVolume) * 100
    const finalN2 = Math.max(0, 100 - finalO2 - finalHe)

    // Accuracy warnings
    const o2Error = Math.abs(finalO2 - params.targetO2)
    const heError = Math.abs(finalHe - params.targetHe)
    
    if (o2Error > 1.0) warnings.push(createWarning(`⚠️ O₂ accuracy: ${o2Error.toFixed(1)}% off target`))
    if (heError > 1.0) warnings.push(createWarning(`⚠️ He accuracy: ${heError.toFixed(1)}% off target`))

    // Safety checks
    if (finalO2 < 16) {
      const safeBreathingCeiling = ((0.16 / (finalO2 / 100)) - 1) * 10
      warnings.push(createWarning(`⚠️ DANGER: Hypoxic mix - Not breathable above ${safeRound(safeBreathingCeiling, RoundingType.DEPTH)}m`))
    }
    if (finalO2 > 100) warnings.push(createWarning('⚠️ ERROR: Impossible O₂ percentage'))
    if (params.targetPressure > 300) warnings.push(createWarning('⚠️ WARNING: High pressure'))
    if (finalO2 > 40) warnings.push(createWarning('⚠️ WARNING: High O₂ - Use O₂ clean equipment'))
    

    return {
      method: 'partial-pressure',
      steps,
      finalMix: { o2: finalO2, he: finalHe, n2: finalN2 },
      warnings
    }
  }, [])

  const calculateContinuous = (params: BlendingParams): BlendingResult => {
    const warnings: Warning[] = []
    const steps: BlendingStep[] = []

    if (params.targetO2 + params.targetHe > 100) {
      warnings.push(createWarning('⚠️ ERROR: Target O₂ + He cannot exceed 100%'))
      return { method: 'continuous', steps: [], finalMix: { o2: 0, he: 0, n2: 0 }, warnings }
    }

    const targetO2Fraction = params.targetO2 / 100
    const airO2Fraction = params.availableAir / 100

    if (params.targetHe === 0) {
      // Nitrox continuous blending - account for O2 purity
      const availableO2Fraction = params.availableO2 / 100
      const oxygenFlowRate = Math.max(0, (targetO2Fraction - airO2Fraction) / (availableO2Fraction - airO2Fraction))
      const airFlowRate = 1 - oxygenFlowRate
      
      steps.push({
        step: 1,
        action: 'Continuous Nitrox Blend',
        gasType: 'Nitrox',
        addPressure: params.targetPressure,
        totalPressure: params.targetPressure,
        resultingO2: params.targetO2,
        resultingHe: 0,
        description: `${(oxygenFlowRate * 100).toFixed(1)}% O₂ (${params.availableO2}% purity) + ${(airFlowRate * 100).toFixed(1)}% air flow`
      })
    } else {
      // Trimix continuous blending - account for He and O2 purity
      const availableHeFraction = params.availableHe / 100
      const availableO2Fraction = params.availableO2 / 100
      const heliumFlowRate = (params.targetHe / 100) / availableHeFraction
      const remainingFraction = 1 - heliumFlowRate
      const intermediateO2 = targetO2Fraction / remainingFraction
      const adjustedO2FlowRate = (intermediateO2 - airO2Fraction) / (availableO2Fraction - airO2Fraction)

      if (intermediateO2 > availableO2Fraction || heliumFlowRate > 1) {
        warnings.push(createWarning('⚠️ ERROR: Cannot achieve target mix with continuous blending using available gas purities'))
      } else {
        steps.push({
          step: 1,
          action: 'Trimix Continuous Setup',
          gasType: 'He',
          addPressure: params.targetPressure,
          totalPressure: params.targetPressure,
          resultingO2: params.targetO2,
          resultingHe: params.targetHe,
          description: `${(heliumFlowRate * 100).toFixed(1)}% He (${params.availableHe}% purity) + ${(adjustedO2FlowRate * 100).toFixed(1)}% O₂ (${params.availableO2}% purity) + Air`
        })
      }
    }

    if (params.targetO2 > 40) warnings.push(createWarning('⚠️ WARNING: High O₂ - O₂ clean equipment required'))
    if (params.targetO2 < 16) {
      const safeBreathingCeiling = ((0.16 / (params.targetO2 / 100)) - 1) * 10
      warnings.push(createWarning(`⚠️ DANGER: Hypoxic mix - Not breathable above ${safeRound(safeBreathingCeiling, RoundingType.DEPTH)}m`))
    }

    return {
      method: 'continuous',
      steps,
      finalMix: { o2: params.targetO2, he: params.targetHe, n2: Math.max(0, 100 - params.targetO2 - params.targetHe) },
      warnings
    }
  }

  const calculateTopOff = useCallback((params: BlendingParams): BlendingResult => {
    const steps: BlendingStep[] = []
    const warnings: Warning[] = []

    if (params.currentPressure === 0) {
      warnings.push(createWarning('⚠️ ERROR: Cannot top off empty tank'))
      return { method: 'top-off', steps: [], finalMix: { o2: 0, he: 0, n2: 0 }, warnings }
    }

    if (params.currentPressure >= params.targetPressure) {
      warnings.push(createWarning('⚠️ Current pressure already at or above target'))
      return { 
        method: 'top-off', 
        steps: [], 
        finalMix: { 
          o2: params.currentO2, 
          he: params.currentHe, 
          n2: 100 - params.currentO2 - params.currentHe 
        }, 
        warnings 
      }
    }

    // Calculate current volumes
    const currentO2Volume = (params.currentO2 / 100) * params.currentPressure * params.tankSize
    const currentHeVolume = (params.currentHe / 100) * params.currentPressure * params.tankSize
    const currentTotalVolume = params.currentPressure * params.tankSize

    // Calculate top-off gas to add
    const targetTotalVolume = params.targetPressure * params.tankSize
    const topOffVolumeToAdd = targetTotalVolume - currentTotalVolume
    const topOffPressureToAdd = topOffVolumeToAdd / params.tankSize
    const topOffO2VolumeAdded = (params.topOffO2 / 100) * topOffVolumeToAdd
    const topOffHeVolumeAdded = (params.topOffHe / 100) * topOffVolumeToAdd

    // Calculate final mix
    const finalO2Volume = currentO2Volume + topOffO2VolumeAdded
    const finalHeVolume = currentHeVolume + topOffHeVolumeAdded
    const finalTotalVolume = targetTotalVolume

    const finalO2 = (finalO2Volume / finalTotalVolume) * 100
    const finalHe = (finalHeVolume / finalTotalVolume) * 100
    const finalN2 = Math.max(0, 100 - finalO2 - finalHe)

    const topOffGasName = params.topOffO2 === 21 && params.topOffHe === 0 ? 'Air' : 
                         params.topOffHe === 0 ? `EAN${params.topOffO2}` :
                         `${params.topOffO2}/${params.topOffHe}`

    steps.push({
      step: 1,
      action: `Top off with ${topOffGasName}`,
      gasType: 'Air',
      addPressure: topOffPressureToAdd,
      totalPressure: params.targetPressure,
      resultingO2: finalO2,
      resultingHe: finalHe,
      description: `Add ${convertPressure(topOffPressureToAdd).formatted} ${topOffGasName} to existing mix`
    })

    // Safety checks
    if (finalO2 < 16) {
      const safeBreathingCeiling = ((0.16 / (finalO2 / 100)) - 1) * 10
      warnings.push(createWarning(`⚠️ DANGER: Hypoxic mix - Not breathable above ${safeRound(safeBreathingCeiling, RoundingType.DEPTH)}m`))
    }
    if (finalO2 > 40) warnings.push(createWarning('⚠️ WARNING: High O₂ - Use O₂ clean equipment'))
    if (params.targetPressure > 300) warnings.push(createWarning('⚠️ WARNING: High pressure'))
    

    return {
      method: 'top-off',
      steps,
      finalMix: { o2: finalO2, he: finalHe, n2: finalN2 },
      warnings
    }
  }, [])

  // Effect to disable real gas when switching away from partial pressure
  useEffect(() => {
    if (blendingMethod !== 'partial-pressure' && blendingParams.useRealGas) {
      setBlendingParams(prev => ({
        ...prev,
        useRealGas: false
      }));
    }
  }, [blendingMethod, blendingParams.useRealGas]);

  useEffect(() => {
    let newResult: BlendingResult;
    
    // Use real gas calculations if enabled and for partial pressure method
    if (blendingParams.useRealGas && blendingMethod === 'partial-pressure') {
      const realGasParams: RealGasBlendingParams = {
        ...blendingParams,
        useRealGas: true
      };
      const realGasResult = performRealGasBlending(realGasParams);
      
      // Convert real gas result to BlendingResult format
      newResult = {
        method: realGasResult.method,
        steps: realGasResult.steps.map(step => ({
          step: step.step,
          action: step.action,
          gasType: step.gasType,
          addPressure: step.addPressure,
          totalPressure: step.totalPressure,
          resultingO2: step.resultingO2,
          resultingHe: step.resultingHe,
          description: step.description,
          compressibilityFactor: step.compressibilityFactor,
          realGasDeviation: step.realGasDeviation
        })),
        finalMix: realGasResult.finalMix,
        warnings: realGasResult.warnings.map(w => createWarning(w.message)),
        useRealGas: true,
        temperature: realGasResult.temperature,
        finalRealGasProperties: realGasResult.finalCompressibilityFactor ? {
          compressibilityFactor: realGasResult.finalCompressibilityFactor,
          deviation: realGasResult.finalRealGasDeviation || 0,
          isSignificant: Math.abs(realGasResult.finalRealGasDeviation || 0) > 1
        } : undefined,
        realGasRecommendation: realGasResult.realGasRecommendation
      };
    } else {
      // Use original ideal gas calculations
      newResult = blendingMethod === 'partial-pressure' 
        ? calculatePartialPressure(blendingParams)
        : blendingMethod === 'continuous'
        ? calculateContinuous(blendingParams)
        : calculateTopOff(blendingParams);
      
      // Add real gas recommendation for ideal gas calculations
      if (!blendingParams.useRealGas) {
        const targetMixture = {
          O2: blendingParams.targetO2,
          He: blendingParams.targetHe,
          N2: 100 - blendingParams.targetO2 - blendingParams.targetHe
        };
        
        if (isVanDerWaalsSuitable(blendingParams.tankSize, blendingParams.targetPressure, blendingParams.temperatureCelsius, targetMixture)) {
          newResult.warnings.push(createWarning(`⚠️ Real gas effects may be significant at ${convertPressure(blendingParams.targetPressure).formatted}. Consider enabling Van der Waals calculations.`));
          newResult.realGasRecommendation = true;
        } else if (shouldUseRealGas(blendingParams.targetPressure, blendingParams.temperatureCelsius, targetMixture)) {
          // Real gas effects exist but VdW not suitable for this tank size
          newResult.warnings.push(createWarning(`⚠️ Real gas effects may be present, but Van der Waals calculations are not suitable for very small tanks (${blendingParams.tankSize}L).`));
          newResult.realGasRecommendation = false;
        }
      }
    }
    
    setResult(newResult);
    
    // Send warnings to parent component for shared warning stack
    if (onWarningsChange) {
      onWarningsChange(newResult.warnings);
    }
  }, [blendingParams, blendingMethod, calculatePartialPressure, calculateTopOff, onWarningsChange])

  const handleParamChange = (param: keyof BlendingParams, value: number | boolean | string) => {
    if (typeof value === 'boolean' || typeof value === 'string') {
      // Handle boolean parameters (useRealGas) and string parameters (selectedTankId)
      setBlendingParams(prev => ({
        ...prev,
        [param]: value
      }));
      return;
    }
    
    // Handle numeric parameters with validation - values come pre-converted to metric
    let validatedValue = value;
    if (param.includes('Pressure')) {
      validatedValue = Math.max(0, Math.min(400, value)); // Allow up to 400 bar for high pressure applications
    } else if (param === 'tankSize') {
      validatedValue = Math.max(0, Math.min(50, value));
    } else if (param === 'temperatureCelsius') {
      validatedValue = Math.max(-10, Math.min(50, value)); // Already in Celsius from conversion
    } else {
      validatedValue = Math.max(0, Math.min(100, value));
    }
    
    setBlendingParams(prev => ({
      ...prev,
      [param]: validatedValue
    }));
  }

  const handleTankSelect = (tank: TankSpecification) => {
    setBlendingParams(prev => ({
      ...prev,
      tankSize: tank.waterVolumeL,
      selectedTankId: tank.id,
      targetPressure: tank.workingPressureBar // Set to tank's working pressure
    }));
  }

  const copyProcedureAsText = async () => {
    if (!result) return
    
    try {
      let text = `Gas Blending Procedure\n`
      text += `Method: ${result.method}\n`
      text += `Target: ${blendingParams.targetO2}/${blendingParams.targetHe} @ ${convertPressure(blendingParams.targetPressure).formatted}\n`
      text += `Starting: ${blendingParams.currentO2}/${blendingParams.currentHe} @ ${convertPressure(blendingParams.currentPressure).formatted}\n\n`
      
      text += `Steps:\n`
      result.steps.forEach((step) => {
        text += `${step.step}. ${step.action}\n`
        text += `   ${step.description}\n`
        text += `   Result: ${step.resultingO2.toFixed(1)}% O₂, ${step.resultingHe.toFixed(1)}% He @ ${convertPressure(step.totalPressure).formatted}\n\n`
      })
      
      text += `Final Mix: ${result.finalMix.o2.toFixed(1)}% O₂, ${result.finalMix.he.toFixed(1)}% He, ${result.finalMix.n2.toFixed(1)}% N₂\n`
      
      if (result.warnings.length > 0) {
        text += `\nWarnings:\n`
        result.warnings.forEach(warning => {
          text += `- ${warning.message}\n`
        })
      }
      
      await navigator.clipboard.writeText(text)
      setCopyStatus('text')
      setTimeout(() => setCopyStatus(null), 2000)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  const copyProcedureAsImage = async () => {
    if (!result) return
    
    try {
      // Create a canvas and draw the procedure text
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      // Set canvas size
      canvas.width = 600
      canvas.height = 400 + (result.steps.length * 60)
      
      // Set background
      ctx.fillStyle = '#374151'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // Set text properties
      ctx.fillStyle = '#F59E0B'
      ctx.font = 'bold 20px Arial'
      ctx.fillText('Gas Blending Procedure', 20, 30)
      
      ctx.fillStyle = '#FFFFFF'
      ctx.font = '14px Arial'
      let y = 60
      
      // Add method and mix info
      ctx.fillText(`Method: ${result.method}`, 20, y)
      y += 25
      ctx.fillText(`Target: ${blendingParams.targetO2}/${blendingParams.targetHe} @ ${convertPressure(blendingParams.targetPressure).formatted}`, 20, y)
      y += 25
      ctx.fillText(`Starting: ${blendingParams.currentO2}/${blendingParams.currentHe} @ ${convertPressure(blendingParams.currentPressure).formatted}`, 20, y)
      y += 40
      
      // Add steps
      ctx.fillStyle = '#F59E0B'
      ctx.font = 'bold 16px Arial'
      ctx.fillText('Steps:', 20, y)
      y += 30
      
      ctx.fillStyle = '#FFFFFF'
      ctx.font = '14px Arial'
      result.steps.forEach((step) => {
        ctx.fillText(`${step.step}. ${step.action}`, 20, y)
        y += 20
        ctx.fillStyle = '#D1D5DB'
        ctx.font = '12px Arial'
        ctx.fillText(`   ${step.description}`, 20, y)
        y += 15
        ctx.fillText(`   Result: ${step.resultingO2.toFixed(1)}% O₂, ${step.resultingHe.toFixed(1)}% He @ ${convertPressure(step.totalPressure).formatted}`, 20, y)
        y += 30
        ctx.fillStyle = '#FFFFFF'
        ctx.font = '14px Arial'
      })
      
      // Add final mix
      y += 10
      ctx.fillStyle = '#10B981'
      ctx.font = 'bold 16px Arial'
      ctx.fillText(`Final Mix: ${result.finalMix.o2.toFixed(1)}% O₂, ${result.finalMix.he.toFixed(1)}% He, ${result.finalMix.n2.toFixed(1)}% N₂`, 20, y)
      
      // Convert to blob and copy
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ])
            setCopyStatus('image')
            setTimeout(() => setCopyStatus(null), 2000)
          } catch {
            // Fallback: download the image
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'gas-blending-procedure.png'
            a.click()
            URL.revokeObjectURL(url)
            setCopyStatus('image')
            setTimeout(() => setCopyStatus(null), 2000)
          }
        }
      }, 'image/png', 0.95)
    } catch (error) {
      console.error('Failed to copy as image:', error)
    }
  }

  return (
    <div className="space-y-4">      
      {/* Method & Tank Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-700 p-3 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-400 mb-2">Blending Method</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="method"
                checked={blendingMethod === 'partial-pressure'}
                onChange={() => setBlendingMethod('partial-pressure')}
              />
              <span className="text-sm">Partial Pressure (Standard)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="method"
                checked={blendingMethod === 'continuous'}
                onChange={() => setBlendingMethod('continuous')}
              />
              <span className="text-sm">Continuous Flow</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="method"
                checked={blendingMethod === 'top-off'}
                onChange={() => setBlendingMethod('top-off')}
              />
              <span className="text-sm">Top Off with Gas</span>
            </label>
          </div>
          
          {/* Van der Waals Real Gas Toggle - Only show for partial pressure blending */}
          {blendingMethod === 'partial-pressure' && (() => {
            const targetMixture = {
              O2: blendingParams.targetO2,
              He: blendingParams.targetHe,
              N2: 100 - blendingParams.targetO2 - blendingParams.targetHe
            };
            const isVdWSuitable = isVanDerWaalsSuitable(blendingParams.tankSize, blendingParams.targetPressure, blendingParams.temperatureCelsius, targetMixture);
            
            return (
              <div className="mt-3 p-3 bg-gray-600 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={blendingParams.useRealGas}
                        onChange={(e) => handleParamChange('useRealGas', e.target.checked)}
                        disabled={!isVdWSuitable}
                        className={`w-4 h-4 bg-gray-700 border-gray-500 rounded focus:ring-orange-400 ${
                          !isVdWSuitable ? 'opacity-50 cursor-not-allowed' : 'text-orange-400'
                        }`}
                      />
                      <span className={`text-sm font-semibold ${
                        !isVdWSuitable ? 'text-gray-400' : 'text-orange-400'
                      }`}>
                        Real Gas (Van der Waals)
                      </span>
                      {!isVdWSuitable && (
                        <span className="text-xs text-red-400">
                          (Not suitable for {blendingParams.tankSize}L tank)
                        </span>
                      )}
                    </label>
                  <button
                    onClick={() => setShowRealGasModal(true)}
                    className="text-xs text-blue-300 hover:text-blue-200 underline"
                    type="button"
                  >
                    What is this?
                  </button>
                </div>
                {result?.realGasRecommendation && !blendingParams.useRealGas && (
                  <span className="text-xs text-yellow-400">Recommended</span>
                )}
              </div>
              
              {/* Temperature Input */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-300 mb-1">Temperature ({unitLabels.temperature})</label>
                  <input
                    type="number"
                    min={ranges.temperature.min}
                    max={ranges.temperature.max}
                    step="1"
                    value={convertTemperature(blendingParams.temperatureCelsius).value}
                    onChange={(e) => handleParamChange('temperatureCelsius', parseTemperatureInput(parseFloat(e.target.value) || 20))}
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-500 rounded text-white text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <div className="text-xs text-gray-400">
                    {blendingParams.useRealGas ? 'Real gas effects enabled' : 'Ideal gas model'}
                  </div>
                </div>
              </div>
              </div>
            );
          })()}
          
          {/* Custom Top-Off Gas Inputs - Only show when top-off is selected */}
          {blendingMethod === 'top-off' && (
            <div className="mt-3 p-3 bg-gray-600 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-semibold text-yellow-400">Top-Off Gas Composition</h4>
                
                {/* Quick Preset Chips */}
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      handleParamChange('topOffO2', 21)
                      handleParamChange('topOffHe', 0)
                    }}
                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded-full text-xs text-white transition-colors"
                  >
                    Air
                  </button>
                  <button
                    onClick={() => {
                      handleParamChange('topOffO2', 50)
                      handleParamChange('topOffHe', 0)
                    }}
                    className="px-2 py-0.5 bg-green-600 hover:bg-green-500 rounded-full text-xs text-white transition-colors"
                  >
                    50%
                  </button>
                  <button
                    onClick={() => {
                      handleParamChange('topOffO2', 80)
                      handleParamChange('topOffHe', 0)
                    }}
                    className="px-2 py-0.5 bg-yellow-600 hover:bg-yellow-500 rounded-full text-xs text-white transition-colors"
                  >
                    80%
                  </button>
                  <button
                    onClick={() => {
                      handleParamChange('topOffO2', 100)
                      handleParamChange('topOffHe', 0)
                    }}
                    className="px-2 py-0.5 bg-red-600 hover:bg-red-500 rounded-full text-xs text-white transition-colors"
                  >
                    100%
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-300 mb-1">O₂ (%)</label>
                  <input
                    type="number"
                    min="8"
                    max="100"
                    step="0.1"
                    value={blendingParams.topOffO2}
                    onChange={(e) => handleParamChange('topOffO2', parseFloat(e.target.value) || 21)}
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-500 rounded text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">He (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="95"
                    step="0.1"
                    value={blendingParams.topOffHe}
                    onChange={(e) => handleParamChange('topOffHe', parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-500 rounded text-white text-sm"
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-400">
                N₂: {(100 - blendingParams.topOffO2 - blendingParams.topOffHe).toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-700 p-3 rounded-lg">
          <TankSelector
            selectedTankId={blendingParams.selectedTankId}
            onTankSelect={handleTankSelect}
            units="metric"
            allowTwinsets={true}
            showCommonOnly={false}
            compactView={false}
            label="Tank Configuration"
            className="mb-3"
          />
          <div>
            <label className="block text-sm text-gray-300 mb-1">Target Pressure ({unitLabels.pressure})</label>
            <input
              type="number"
              min={ranges.pressure.min}
              max={ranges.pressure.max}
              value={convertPressure(blendingParams.targetPressure).value}
              onChange={(e) => handleParamChange('targetPressure', parsePressureInput(parseFloat(e.target.value) || 0))}
              className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
            />
          </div>
        </div>
      </div>

      {/* Main Input Section - 2 Column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Starting Mix */}
        <div className="bg-gray-700 p-3 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-orange-400">Starting Mix</h3>
            {blendingParams.currentPressure > 0 && (
              <TankVisualization
                o2Percent={blendingParams.currentO2}
                n2Percent={100 - blendingParams.currentO2 - blendingParams.currentHe}
                hePercent={blendingParams.currentHe}
                totalPressure={blendingParams.currentPressure}
                tankSizeL={blendingParams.tankSize}
                iconMode={true}
              />
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">O₂ (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={blendingParams.currentO2}
                onChange={(e) => handleParamChange('currentO2', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">He (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={blendingParams.currentHe}
                onChange={(e) => handleParamChange('currentHe', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Pressure</label>
              <input
                type="number"
                min="0"
                max="300"
                value={blendingParams.currentPressure}
                onChange={(e) => handleParamChange('currentPressure', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
              />
            </div>
          </div>
          {blendingParams.currentPressure > 0 && (
            <div className="text-xs text-gray-400 bg-gray-800 p-2 rounded">
              N₂: {(100 - blendingParams.currentO2 - blendingParams.currentHe).toFixed(1)}%
              <br />Volume: {convertVolume(blendingParams.currentPressure * blendingParams.tankSize).formatted} @ STP
            </div>
          )}

          {/* Source Gas Purity */}
          <div className="mt-3">
            <h4 className="text-sm font-semibold text-purple-400 mb-2">Source Gas Purity</h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-300 mb-1">O₂</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  value={blendingParams.availableO2}
                  onChange={(e) => handleParamChange('availableO2', parseFloat(e.target.value) || 100)}
                  className="w-full min-h-[44px] px-2 py-2 bg-gray-600 rounded text-white text-xs focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">He</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  value={blendingParams.availableHe}
                  onChange={(e) => handleParamChange('availableHe', parseFloat(e.target.value) || 100)}
                  className="w-full min-h-[44px] px-2 py-2 bg-gray-600 rounded text-white text-xs focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">Air</label>
                <input
                  type="number"
                  min="20"
                  max="22"
                  step="0.1"
                  value={blendingParams.availableAir}
                  onChange={(e) => handleParamChange('availableAir', parseFloat(e.target.value) || 21)}
                  className="w-full min-h-[44px] px-2 py-2 bg-gray-600 rounded text-white text-xs focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Target Mix - Dimmed for top-off mode */}
        <div className={`bg-gray-700 p-3 rounded-lg transition-opacity ${blendingMethod === 'top-off' ? 'opacity-10 pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-green-400">Target Mix</h3>
            {blendingMethod !== 'top-off' && (
              <TankVisualization
                o2Percent={blendingParams.targetO2}
                n2Percent={100 - blendingParams.targetO2 - blendingParams.targetHe}
                hePercent={blendingParams.targetHe}
                totalPressure={blendingParams.targetPressure}
                tankSizeL={blendingParams.tankSize}
                iconMode={true}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Target O₂ (%)</label>
              <input
                type="number"
                min="8"
                max="100"
                step="0.1"
                value={blendingParams.targetO2}
                onChange={(e) => handleParamChange('targetO2', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                disabled={blendingMethod === 'top-off'}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Target He (%)</label>
              <input
                type="number"
                min="0"
                max="95"
                step="0.1"
                value={blendingParams.targetHe}
                onChange={(e) => handleParamChange('targetHe', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                disabled={blendingMethod === 'top-off'}
              />
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <h4 className="text-sm font-semibold text-cyan-400 mb-2">Quick Presets</h4>
            <div className="grid grid-cols-4 gap-1">
              {[
                { name: '32', o2: 32, he: 0 },
                { name: '36', o2: 36, he: 0 },
                { name: '18/45', o2: 18, he: 45 },
                { name: '15/55', o2: 15, he: 55 },
                { name: '21/35', o2: 21, he: 35 },
                { name: '10/70', o2: 10, he: 70 },
                { name: '50', o2: 50, he: 0 },
                { name: '100', o2: 100, he: 0 }
              ].map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => setBlendingParams(prev => ({ ...prev, targetO2: preset.o2, targetHe: preset.he }))}
                  className="min-w-[44px] min-h-[44px] bg-gray-600 hover:bg-gray-500 px-2 py-2 rounded text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                  disabled={blendingMethod === 'top-off'}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Target Properties */}
          <div className="mt-3 text-xs text-gray-400 bg-gray-800 p-2 rounded">
            Target N₂: {(100 - blendingParams.targetO2 - blendingParams.targetHe).toFixed(1)}%
            <br />Volume: {convertVolume(blendingParams.targetPressure * blendingParams.tankSize).formatted} @ STP
            <br />MOD @ 1.4: {blendingParams.targetO2 > 0 ? (() => {
              try {
                const mixture = { oxygen: blendingParams.targetO2, helium: blendingParams.targetHe, nitrogen: 100 - blendingParams.targetO2 - blendingParams.targetHe }
                return convertDepth(calculateMOD(mixture, 1.4)).formatted
              } catch {
                return '0 ' + getUnitLabels().depth
              }
            })() : '0 ' + getUnitLabels().depth}
          </div>
        </div>
      </div>

      {/* Results - 2 Column Layout */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Final Mix */}
          <div className="space-y-3">

            <div className="bg-gray-700 p-3 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-green-400">Final Mix</h3>
                <TankVisualization
                  o2Percent={safeRound(result.finalMix.o2, RoundingType.O2, 1)}
                  n2Percent={safeRound(result.finalMix.n2, RoundingType.N2, 1)}
                  hePercent={safeRound(result.finalMix.he, RoundingType.HE, 1)}
                  totalPressure={blendingParams.targetPressure}
                  tankSizeL={blendingParams.tankSize}
                  maxPPO2={1.4}
                  iconMode={true}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="bg-gray-600 p-2 rounded text-center">
                  <div className="text-lg font-bold text-blue-400">{safeRound(result.finalMix.o2, RoundingType.O2).toFixed(1)}%</div>
                  <div className="text-xs text-gray-300">O₂</div>
                </div>
                <div className="bg-gray-600 p-2 rounded text-center">
                  <div className="text-lg font-bold text-purple-400">{safeRound(result.finalMix.he, RoundingType.HE).toFixed(1)}%</div>
                  <div className="text-xs text-gray-300">He</div>
                </div>
                <div className="bg-gray-600 p-2 rounded text-center">
                  <div className="text-lg font-bold text-gray-400">{safeRound(result.finalMix.n2, RoundingType.N2).toFixed(1)}%</div>
                  <div className="text-xs text-gray-300">N₂</div>
                </div>
              </div>

              {/* Gas Properties */}
              <div className="grid grid-cols-1 gap-2">
                <div className="bg-gray-600 p-2 rounded text-center">
                  <div className="text-sm font-bold text-blue-400">
                    {result.finalMix.o2 > 0 ? (() => {
                      try {
                        const mixture = { oxygen: result.finalMix.o2, helium: result.finalMix.he, nitrogen: result.finalMix.n2 }
                        return convertDepth(calculateMOD(mixture, 1.4)).value.toFixed(1)
                      } catch {
                        return 0
                      }
                    })() : 0} {unitLabels.depth}
                  </div>
                  <div className="text-xs text-gray-300">MOD @ 1.4</div>
                </div>
                {/* Real Gas Properties */}
                {result.finalRealGasProperties && (
                  <div className="bg-gray-600 p-2 rounded text-center">
                    <div className="text-sm font-bold text-orange-400">
                      Z = {result.finalRealGasProperties.compressibilityFactor.toFixed(3)}
                    </div>
                    <div className="text-xs text-gray-300">
                      Compressibility @ {convertTemperature(result.temperature || 20).formatted}
                    </div>
                    <div className="text-xs text-orange-300 mt-1">
                      {result.finalRealGasProperties.deviation > 0 ? '+' : ''}{result.finalRealGasProperties.deviation.toFixed(1)}% vs ideal
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Blending Steps */}
          <div className="space-y-3">
            <div className="bg-gray-700 p-3 rounded-lg" ref={procedureRef}>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-yellow-400">Procedure</h3>
                <div className="flex gap-2">
                  <button
                    onClick={copyProcedureAsText}
                    className={`text-xs px-2 py-1 bg-gray-600 rounded transition-colors ${
                      copyStatus === 'text' 
                        ? 'text-green-200 bg-green-600' 
                        : 'text-green-400 hover:text-green-300'
                    }`}
                    title="Copy as text"
                  >
                    {copyStatus === 'text' ? '✓ Copied!' : '📋 Text'}
                  </button>
                  <button
                    onClick={copyProcedureAsImage}
                    className={`text-xs px-2 py-1 bg-gray-600 rounded transition-colors ${
                      copyStatus === 'image' 
                        ? 'text-purple-200 bg-purple-600' 
                        : 'text-purple-400 hover:text-purple-300'
                    }`}
                    title="Copy as image"
                  >
                    {copyStatus === 'image' ? '✓ Copied!' : '📸 Image'}
                  </button>
                  <button
                    onClick={() => setShowMath(!showMath)}
                    className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-gray-600 rounded"
                  >
                    {showMath ? 'Hide' : 'Math'}
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                {result.steps.map((step, index) => (
                  <div key={index} className="border border-gray-600 rounded p-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-yellow-300 text-sm">
                        {step.step}. {step.action}
                      </span>
                      <span className={`px-1 py-0.5 rounded text-xs ${
                        step.gasType === 'O2' ? 'bg-blue-600 text-blue-100' :
                        step.gasType === 'He' ? 'bg-purple-600 text-purple-100' :
                        'bg-gray-600 text-gray-100'
                      }`}>
                        {step.gasType}
                      </span>
                    </div>
                    <div className="text-xs text-gray-300">{step.description}</div>
                    <div className="grid grid-cols-4 gap-1 text-xs text-gray-400 mt-1">
                      <div>+{convertPressure(step.addPressure).value.toFixed(0)}{unitLabels.pressure}</div>
                      <div>={convertPressure(step.totalPressure).value.toFixed(0)}{unitLabels.pressure}</div>
                      <div>O₂:{safeRound(step.resultingO2, RoundingType.O2).toFixed(1)}%</div>
                      <div>He:{safeRound(step.resultingHe, RoundingType.HE).toFixed(1)}%</div>
                    </div>
                    {/* Real Gas Information */}
                    {step.compressibilityFactor && (
                      <div className="mt-1 text-xs text-orange-300">
                        Z={step.compressibilityFactor.toFixed(3)}
                        {step.realGasDeviation && (
                          <span className="ml-2">
                            ({step.realGasDeviation > 0 ? '+' : ''}{step.realGasDeviation.toFixed(1)}% vs ideal)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Gas Usage */}
            <div className="bg-gray-700 p-3 rounded-lg">
              <h3 className="text-lg font-semibold text-cyan-400 mb-2">Gas Usage</h3>
              <div className="text-sm space-y-1">
                {result.steps.map((step, index) => (
                  <div key={index} className="flex justify-between">
                    <span className={step.addPressure < 0 ? 'text-red-400' : ''}>
                      {step.gasType}: {step.addPressure < 0 ? 'Bleed ' : ''}{convertVolume(Math.abs(step.addPressure * blendingParams.tankSize)).formatted}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {step.addPressure < 0 ? '-' : '+'}{convertPressure(safeRound(Math.abs(step.addPressure), RoundingType.PRESSURE)).formatted}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Math Details - Collapsible */}
      {showMath && result && (
        <div className="bg-gray-700 p-3 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-400 mb-2">Mathematical Details</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-semibold text-green-400 mb-1">
                {blendingMethod === 'partial-pressure' ? 'Partial Pressure' : 'Continuous Flow'}
              </h4>
              <div className="font-mono text-xs bg-gray-800 p-2 rounded space-y-1">
                {blendingMethod === 'partial-pressure' ? (
                  <>
                    <div>Target O₂ PP: {convertPressure((blendingParams.targetO2/100) * blendingParams.targetPressure).formatted}</div>
                    <div>Target He PP: {convertPressure((blendingParams.targetHe/100) * blendingParams.targetPressure).formatted}</div>
                    <div>Current O₂ PP: {convertPressure((blendingParams.currentO2/100) * blendingParams.currentPressure).formatted}</div>
                  </>
                ) : (
                  <>
                    <div>O₂ Flow: {blendingParams.targetHe === 0 ? 
                      (((blendingParams.targetO2 - blendingParams.availableAir) / (100 - blendingParams.availableAir)) * 100).toFixed(1) + '%' :
                      'Two-stage process'
                    }</div>
                    <div>He Flow: {blendingParams.targetHe}%</div>
                  </>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-green-400 mb-1">Safety Notes</h4>
              <div className="text-xs space-y-1 text-gray-300">
                <div>• Always analyze final mix</div>
                <div>• Use O₂ clean equipment for &gt;40% O₂</div>
                <div>• Follow proper gas order (He→O₂→Air)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real Gas Explanation Modal */}
      <VanDerWaalsModal 
        isOpen={showRealGasModal} 
        onClose={() => setShowRealGasModal(false)} 
      />

      
    </div>
  )
})

export default GasBlender
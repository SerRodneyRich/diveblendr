'use client'

import { useEffect, useRef, useCallback, useReducer, useState } from 'react'
import BackgroundImage from '@/components/BackgroundImage'
import GlobalUIComponents from '@/components/GlobalUIComponents'
import SafetyWarningModal from '@/components/SafetyWarningModal'
import AppHeader from '@/components/AppHeader'
import DiveModeSelector from '@/components/DiveModeSelector'
import RecommendationControls from '@/components/RecommendationControls'
import GasTypeSelector from '@/components/GasTypeSelector'
import RecommendationsGrid from '@/components/RecommendationsGrid'
import ParameterControls from '@/components/ParameterControls'
import AnalysisResults from '@/components/AnalysisResults'
import ModCheckForm from '@/components/ModCheckForm'
import RoundingWarning from '@/components/RoundingWarning'
import ModCheckResults from '@/components/ModCheckResults'
import ModCheckTankConfig from '@/components/ModCheckTankConfig'
import TankSelector from '@/components/TankSelector'
import { TankSpecification } from '@/data/tankSpecifications'
import MathModal from '@/components/MathModal'
import LinksPage from '@/components/LinksPage'
import GasBlender from '@/components/GasBlender'
import SacCalculator from '@/components/SacCalculator'
import BottomTimeCalculator from '@/components/BottomTimeCalculator'
import PhotoCorrectionTab from '@/components/PhotoCorrectionTab'
import WarningIconStack, { Warning } from '@/components/WarningIconStack'
import { safeRound, RoundingType } from '@/utils/safeRounding'
import { calculateEND, calculateGasDensity, calculateAbsolutePressure } from '@/utils/endModCalculations'
import { useUnitConversion } from '@/hooks/useUnitConversion'
import { usePreferences } from '@/contexts/PreferencesContext'

// Types
interface GasParams {
  oxygen: number
  helium: number
  nitrogen: number
  mod: number
  ppo2: number
  end: number
  tankSizeL: number
  selectedTankId?: string
}

interface Recommendation {
  type: string
  mix: string
  details: string
  o2: number
  he: number
  n2: number
  error: boolean
  math?: string
}

type GasType = 'nitrox' | 'trimix'
type DiveMode = 'oc' | 'oc-trimix' | 'ccr' | 'ccr-trimix'

// Consolidated state interface for useReducer
interface CalculatorState {
  gasType: GasType
  diveMode: DiveMode
  lockedParameters: Set<string>
  gasParams: GasParams
  recommendations: Recommendation[]
  recParams: {
    targetMod: number
    maxEnd: number
    desiredPPO2: number
  }
  showSafety: boolean
  activeTab: 'recommendations' | 'mixer' | 'blender' | 'modcheck' | 'sac' | 'bottomtime' | 'photo-editor' | 'links'
  showMathModal: boolean
  mathContent: { title: string; content: string }
  imageLoaded: boolean
  modCheckParams: {
    o2: number
    he: number
    ppo2: number
    tankSizeL: number
    selectedTankId?: string
  }
  warnings: Warning[]
  recommendationWarnings: Warning[]
  blenderWarnings: Warning[]
  isCalculating: boolean
  isGeneratingRecommendations: boolean
}

// Action types for state updates
type CalculatorAction =
  | { type: 'SET_GAS_TYPE'; payload: GasType }
  | { type: 'SET_DIVE_MODE'; payload: DiveMode }
  | { type: 'SET_LOCKED_PARAMETERS'; payload: Set<string> }
  | { type: 'UPDATE_GAS_PARAMS'; payload: Partial<GasParams> }
  | { type: 'SET_RECOMMENDATIONS'; payload: Recommendation[] }
  | { type: 'UPDATE_REC_PARAMS'; payload: Partial<CalculatorState['recParams']> }
  | { type: 'SET_SHOW_SAFETY'; payload: boolean }
  | { type: 'SET_ACTIVE_TAB'; payload: CalculatorState['activeTab'] }
  | { type: 'SET_SHOW_MATH_MODAL'; payload: boolean }
  | { type: 'SET_MATH_CONTENT'; payload: { title: string; content: string } }
  | { type: 'SET_IMAGE_LOADED'; payload: boolean }
  | { type: 'UPDATE_MOD_CHECK_PARAMS'; payload: Partial<CalculatorState['modCheckParams']> }
  | { type: 'SET_WARNINGS'; payload: Warning[] }
  | { type: 'SET_RECOMMENDATION_WARNINGS'; payload: Warning[] }
  | { type: 'SET_BLENDER_WARNINGS'; payload: Warning[] }
  | { type: 'SET_IS_CALCULATING'; payload: boolean }
  | { type: 'SET_IS_GENERATING_RECOMMENDATIONS'; payload: boolean }

// Initial state for useReducer
const initialCalculatorState: CalculatorState = {
  gasType: 'nitrox',
  diveMode: 'oc',
  lockedParameters: new Set<string>(),
  gasParams: {
    oxygen: 21,
    helium: 0,
    nitrogen: 79,
    mod: 57,
    ppo2: 1.4,
    end: 30,
    tankSizeL: 11.1,
    selectedTankId: 'al80-metric'
  },
  recommendations: [],
  recParams: {
    targetMod: 40,
    maxEnd: 30,
    desiredPPO2: 1.2
  },
  showSafety: true,
  activeTab: 'recommendations',
  showMathModal: false,
  mathContent: { title: '', content: '' },
  imageLoaded: false,
  modCheckParams: {
    o2: 21,
    he: 0,
    ppo2: 1.4,
    tankSizeL: 11.1,
    selectedTankId: 'al80-metric'
  },
  warnings: [],
  recommendationWarnings: [],
  blenderWarnings: [],
  isCalculating: false,
  isGeneratingRecommendations: false
}

// Reducer function for state management
function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'SET_GAS_TYPE':
      return { ...state, gasType: action.payload }
    case 'SET_DIVE_MODE':
      return { ...state, diveMode: action.payload }
    case 'SET_LOCKED_PARAMETERS':
      return { ...state, lockedParameters: action.payload }
    case 'UPDATE_GAS_PARAMS':
      return { ...state, gasParams: { ...state.gasParams, ...action.payload } }
    case 'SET_RECOMMENDATIONS':
      return { ...state, recommendations: action.payload }
    case 'UPDATE_REC_PARAMS':
      return { ...state, recParams: { ...state.recParams, ...action.payload } }
    case 'SET_SHOW_SAFETY':
      return { ...state, showSafety: action.payload }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload }
    case 'SET_SHOW_MATH_MODAL':
      return { ...state, showMathModal: action.payload }
    case 'SET_MATH_CONTENT':
      return { ...state, mathContent: action.payload }
    case 'SET_IMAGE_LOADED':
      return { ...state, imageLoaded: action.payload }
    case 'UPDATE_MOD_CHECK_PARAMS':
      return { ...state, modCheckParams: { ...state.modCheckParams, ...action.payload } }
    case 'SET_WARNINGS':
      return { ...state, warnings: action.payload }
    case 'SET_RECOMMENDATION_WARNINGS':
      return { ...state, recommendationWarnings: action.payload }
    case 'SET_BLENDER_WARNINGS':
      return { ...state, blenderWarnings: action.payload }
    case 'SET_IS_CALCULATING':
      return { ...state, isCalculating: action.payload }
    case 'SET_IS_GENERATING_RECOMMENDATIONS':
      return { ...state, isGeneratingRecommendations: action.payload }
    default:
      return state
  }
}

export default function Calculator() {
  // Helper function to fix floating-point precision in percentage calculations
  const precisePercentage = (value: number): number => {
    return Math.round(value * 100 * 1000) / 1000
  }

  // State management with useReducer
  const [state, dispatch] = useReducer(calculatorReducer, initialCalculatorState)
  
  // Extract individual state values for easier access
  const {
    gasType, diveMode, lockedParameters, gasParams, recommendations, recParams,
    showSafety, activeTab, showMathModal, mathContent, imageLoaded, modCheckParams,
    warnings, recommendationWarnings, blenderWarnings, isCalculating, isGeneratingRecommendations
  } = state

  // Diver preferences hook
  const { preferences: diverPrefs } = usePreferences()

  // Load diver preferences into calculator state on first mount
  useEffect(() => {
    dispatch({ type: 'SET_DIVE_MODE', payload: diverPrefs.diveMode })
    dispatch({ type: 'SET_GAS_TYPE', payload: diverPrefs.gasType })
    dispatch({
      type: 'UPDATE_REC_PARAMS',
      payload: {
        targetMod: diverPrefs.defaultTargetMod,
        desiredPPO2: diverPrefs.defaultDesiredPPO2,
      }
    })
  }, []) // intentionally runs once on mount only

  // Unit conversion hook
  const { convertDepth, convertPressure, preferences } = useUnitConversion()

  // Helper functions for consistent unit display
  const formatDepth = (depth: number, precision: number = 0): string => {
    try {
      const result = convertDepth(depth, precision)
      return result?.formatted || `${depth.toFixed(precision)}m`
    } catch (error) {
      return `${depth.toFixed(precision)}m`
    }
  }

  const formatPressure = (pressure: number, precision: number = 1): string => {
    try {
      const result = convertPressure(pressure, precision)
      return result?.formatted || `${pressure.toFixed(precision)} bar`
    } catch (error) {
      return `${pressure.toFixed(precision)} bar`
    }
  }

  // Background image selection

  const isUpdatingRef = useRef(false)

  // Calculate gas properties with graceful error handling for user inputs
  const calculateResults = (params: GasParams) => {
    // Ensure all parameters have safe default values
    const safeParams = {
      oxygen: Math.max(0, Math.min(100, params.oxygen || 0)),
      helium: Math.max(0, Math.min(100, params.helium || 0)),
      nitrogen: Math.max(0, Math.min(100, params.nitrogen || 0)),
      mod: Math.max(0, Math.min(500, params.mod || 0))
    }
    
    const mixture = {
      oxygen: safeParams.oxygen,
      helium: safeParams.helium,
      nitrogen: safeParams.nitrogen
    }
    
    try {
      const absPressure = safeParams.mod > 0 ? calculateAbsolutePressure(safeParams.mod) : 1.0
      const actualPPO2 = (safeParams.oxygen / 100) * absPressure
      const calculatedEND = safeParams.mod > 0 ? calculateEND(mixture, safeParams.mod) : 0
      const density = safeParams.mod > 0 ? calculateGasDensity(mixture, safeParams.mod) : 0
      
      return { absPressure, actualPPO2, calculatedEND, density }
    } catch (error) {
      // Fallback to safe default values if calculation fails
      console.warn('Gas calculation failed, using default values:', error)
      return { 
        absPressure: 1.0, 
        actualPPO2: 0, 
        calculatedEND: 0, 
        density: 0 
      }
    }
  }

  // Generate warnings based on calculated values with context
  const generateWarnings = useCallback((params: GasParams, results: { actualPPO2: number; calculatedEND: number; density: number }): Warning[] => {
    const warnings: Warning[] = []
    const { actualPPO2, calculatedEND, density } = results
    
    // Enhanced gas context detection for better warning specificity
    const isDecoGas = params.oxygen >= 50 || (params.oxygen >= 40 && params.mod <= 20)
    const isTravelGas = params.oxygen > 21 && params.oxygen < 50 && params.mod > 30 && params.oxygen < 40
    const isWorkingGas = !isDecoGas && !isTravelGas
    
    // Determine gas context string for more descriptive warnings
    const gasContext = isDecoGas ? 'deco gas' : isTravelGas ? 'travel gas' : 'working gas'
    
    // PPO2 warnings - context-specific limits with enhanced messaging
    if (diveMode === 'ccr' || diveMode === 'ccr-trimix') {
      // CCR specific warnings with context
      if (actualPPO2 > 1.4) {
        warnings.push({ type: 'danger', message: `PPO₂ exceeds CCR decompression limit (1.4 bar) - Risk of oxygen toxicity for ${gasContext}!` })
      } else if (actualPPO2 > 1.3) {
        if (isDecoGas) {
          warnings.push({ type: 'info', message: 'PPO₂ above 1.3 bar - Appropriate for shallow decompression stops' })
        } else if (isTravelGas) {
          warnings.push({ type: 'warning', message: 'PPO₂ exceeds CCR working limit (1.3 bar) - Suitable as travel gas to descent depth only' })
        } else {
          warnings.push({ type: 'warning', message: 'PPO₂ exceeds CCR working limit (1.3 bar) - Not suitable for bottom phase working gas' })
        }
      } else if (actualPPO2 > 1.2 && isWorkingGas) {
        warnings.push({ type: 'info', message: 'Working gas PPO₂ above 1.2 bar - Monitor setpoint and CNS exposure during work phases' })
      }
    } else {
      // Open Circuit specific warnings with enhanced context
      if (actualPPO2 > 1.6) {
        warnings.push({ type: 'danger', message: `PPO₂ exceeds absolute limit (1.6 bar) - Risk of oxygen toxicity for ${gasContext}!` })
      } else if (actualPPO2 > 1.4) {
        if (isDecoGas) {
          warnings.push({ type: 'info', message: 'Deco gas PPO₂ above 1.4 bar - Suitable for accelerated decompression at shallow depths only' })
        } else if (isTravelGas) {
          warnings.push({ type: 'warning', message: 'Travel gas PPO₂ exceeds working limit (1.4 bar) - Use only during ascent to switch depth' })
        } else {
          warnings.push({ type: 'warning', message: 'Working gas PPO₂ exceeds safe limit (1.4 bar) - Consider reducing O₂ or switching to trimix' })
        }
      } else if (actualPPO2 > 1.2 && isWorkingGas) {
        warnings.push({ type: 'info', message: 'Working gas PPO₂ above 1.2 bar - Monitor CNS exposure on extended bottom times' })
      }
    }
    
    // Hypoxia warnings with context
    if (actualPPO2 < 0.16) {
      warnings.push({ type: 'danger', message: `PPO₂ below 0.16 bar - Risk of hypoxia for ${gasContext}!` })
    } else if (actualPPO2 < 0.18 && isWorkingGas) {
      warnings.push({ type: 'warning', message: 'Working gas PPO₂ below 0.18 bar - Minimal safety margin for hypoxia' })
    }
    
    // Gas density warnings with context-specific messaging
    if (density > 7.0) {
      if (isWorkingGas) {
        warnings.push({ type: 'danger', message: 'Critical working gas density - Potentially unbreathable under physical stress' })
      } else {
        warnings.push({ type: 'warning', message: `High ${gasContext} density - May impair breathing during gas switches` })
      }
    } else if (density > 6.2) {
      if (isWorkingGas) {
        warnings.push({ type: 'warning', message: 'High working gas density - Severe work of breathing at depth' })
      } else {
        warnings.push({ type: 'info', message: `Elevated ${gasContext} density - Consider helium addition for comfort` })
      }
    } else if (density > 5.2) {
      if (isWorkingGas) {
        warnings.push({ type: 'warning', message: 'Elevated working gas density - Significant breathing resistance during work' })
      } else {
        warnings.push({ type: 'info', message: `${gasContext.charAt(0).toUpperCase() + gasContext.slice(1)} density above optimal - Noticeable breathing effort` })
      }
    } else if (density > 4.0 && isWorkingGas) {
      warnings.push({ type: 'info', message: 'Working gas density approaching limit - Monitor breathing effort during high-workload phases' })
    }
    
    // END warnings with enhanced context
    if (calculatedEND > 30) {
      if (isWorkingGas) {
        warnings.push({ type: 'warning', message: 'Working gas END exceeds 30m - High nitrogen narcosis risk during critical tasks!' })
      } else if (isTravelGas) {
        warnings.push({ type: 'warning', message: 'Travel gas END exceeds 30m - Switch to trimix before reaching maximum travel depth' })
      } else {
        warnings.push({ type: 'info', message: 'Deco gas END above 30m - Acceptable for shallow decompression use only' })
      }
    } else if (calculatedEND > 20 && isWorkingGas) {
      warnings.push({ type: 'info', message: 'Working gas END above 20m - Consider trimix for enhanced mental clarity at depth' })
    }
    
    return warnings
  }, [diveMode])

  // Generate planning warnings for recommendations
  const generatePlanningWarnings = (targetMod: number, maxEnd: number, desiredPPO2: number, diveMode: DiveMode): Warning[] => {
    const warnings: Warning[] = []
    
    // These are PLANNING warnings for the recommendation parameters only
    // They help users set appropriate targets before getting recommendations
    
    // PPO2 planning warnings based on mode best practices
    if (diveMode === 'ccr' || diveMode === 'ccr-trimix') {
      if (desiredPPO2 > 1.4) {
        warnings.push({ type: 'danger', message: 'PLANNING: PPO₂ target exceeds CCR decompression limit (1.4 bar)' })
      } else if (desiredPPO2 > 1.3) {
        warnings.push({ type: 'warning', message: 'PLANNING: PPO₂ target exceeds CCR working limit (1.3 bar)' })
      }
    } else {
      if (desiredPPO2 > 1.6) {
        warnings.push({ type: 'danger', message: 'PLANNING: PPO₂ target exceeds absolute limit (1.6 bar)' })
      } else if (desiredPPO2 > 1.4) {
        warnings.push({ type: 'warning', message: 'PLANNING: PPO₂ target exceeds working limit (1.4 bar)' })
      }
    }
    
    // END planning warnings (only for trimix modes that use END parameter)
    if ((diveMode === 'oc-trimix' || diveMode === 'ccr-trimix') && maxEnd > 30) {
      warnings.push({ type: 'warning', message: 'PLANNING: Max END target exceeds 30m - High narcosis risk' })
    }
    
    // Depth and mode-specific planning warnings
    if (diveMode === 'oc') {
      if (targetMod > 100) {
        warnings.push({ type: 'warning', message: 'PLANNING: Exceeds practical open circuit limit (100m)' })
      } else if (targetMod > 50) {
        warnings.push({ type: 'warning', message: 'PLANNING: Consider OC Trimix mode for depths >50m' })
      } else if (targetMod > 40) {
        warnings.push({ type: 'warning', message: 'PLANNING: Beyond recreational air limit (40m)' })
      }
    }
    
    if (diveMode === 'ccr') {
      if (targetMod > 40) {
        warnings.push({ type: 'danger', message: 'CCR beyond 40m requires Trimix - Unsafe END violates safety standards!' })
      } else if (targetMod > 30) {
        warnings.push({ type: 'warning', message: 'PLANNING: Beyond CCR entry-level depth (30m)' })
      }
    }
    
    if (diveMode === 'oc-trimix' && targetMod > 100) {
      warnings.push({ type: 'warning', message: 'PLANNING: Exceeds practical open circuit trimix limit (100m)' })
    }
    
    if (diveMode === 'ccr-trimix') {
      if (targetMod > 100) {
        warnings.push({ type: 'warning', message: 'PLANNING: Exceeds recreational CCR trimix limit (100m)' })
      } else if (targetMod > 60) {
        warnings.push({ type: 'warning', message: 'PLANNING: Advanced CCR trimix depth range (>60m)' })
      }
    }
    
    return warnings
  }

  // Update calculations when parameters change
  const updateCalculations = useCallback(async (newParams: GasParams) => {
    if (isUpdatingRef.current) return
    isUpdatingRef.current = true

    // Show loading state for calculations that might take time
    dispatch({ type: 'SET_IS_CALCULATING', payload: true })

    // Use requestAnimationFrame to ensure UI updates before heavy calculations
    await new Promise(resolve => requestAnimationFrame(resolve))

    const { oxygen } = newParams
    let { helium, nitrogen, mod, ppo2, end } = newParams

    // Handle the key relationship: MOD = ((PPO2 / (O2% / 100)) - 1) * 10
    if (!lockedParameters.has('mod') && !lockedParameters.has('ppo2')) {
      mod = safeRound(((ppo2 / (oxygen / 100)) - 1) * 10, RoundingType.MOD)
      mod = Math.max(6, Math.min(150, mod))
    } else if (lockedParameters.has('mod') && !lockedParameters.has('ppo2')) {
      const absPressure = (mod / 10) + 1
      ppo2 = (oxygen / 100) * absPressure
      ppo2 = Math.max(0.16, Math.min(1.6, ppo2))
    } else if (!lockedParameters.has('mod') && lockedParameters.has('ppo2')) {
      mod = safeRound(((ppo2 / (oxygen / 100)) - 1) * 10, RoundingType.MOD)
      mod = Math.max(6, Math.min(150, mod))
    }

    // Auto-adjust gas percentages
    if (gasType === 'trimix') {
      // Always calculate nitrogen as residual - it cannot be locked/adjusted
      nitrogen = 100 - oxygen - helium
      nitrogen = Math.max(0, Math.min(90, nitrogen))
      
      // If helium adjustment would result in negative nitrogen, limit helium
      if (nitrogen < 0) {
        helium = 100 - oxygen
        helium = Math.max(0, Math.min(95, helium))
        nitrogen = 100 - oxygen - helium
      }
    } else {
      // For nitrox, nitrogen is always calculated as residual
      nitrogen = 100 - oxygen
      nitrogen = Math.max(0, Math.min(90, nitrogen))
      helium = 0
    }

    // Calculate END
    if (!lockedParameters.has('end')) {
      const absPressure = (mod / 10) + 1
      const nitrogenPP = (nitrogen / 100) * absPressure
      end = Math.max(6, Math.min(40, safeRound(((nitrogenPP / 0.79) - 1) * 10, RoundingType.END, 1)))
    }

    const updatedParams = { 
      oxygen, 
      helium, 
      nitrogen, 
      mod, 
      ppo2, 
      end, 
      tankSizeL: gasParams.tankSizeL,
      selectedTankId: gasParams.selectedTankId
    }
    dispatch({ type: 'UPDATE_GAS_PARAMS', payload: updatedParams })
    
    const results = calculateResults(updatedParams)
    dispatch({ type: 'SET_WARNINGS', payload: generateWarnings(updatedParams, results) })
    
    // Hide loading state
    dispatch({ type: 'SET_IS_CALCULATING', payload: false })
    isUpdatingRef.current = false
  }, [gasType, lockedParameters, generateWarnings])

  // Generate recommendations
  const generateRecommendations = useCallback(async () => {
    // Show loading state for recommendation generation
    dispatch({ type: 'SET_IS_GENERATING_RECOMMENDATIONS', payload: true })
    
    // Use requestAnimationFrame to ensure UI updates before heavy calculations
    await new Promise(resolve => requestAnimationFrame(resolve))

    const recommendations: Recommendation[] = []
    const { targetMod, maxEnd, desiredPPO2 } = recParams
    const absPressure = (targetMod / 10) + 1
    
    // Calculate optimal values
    const optimalO2Raw = Math.max(8, Math.min(100, Math.round((desiredPPO2 / absPressure) * 100 * 1000) / 1000))
    const optimalO2 = safeRound(optimalO2Raw, RoundingType.O2, 0)
    
    
    const endAbsPressure = (maxEnd / 10) + 1
    const maxN2Raw = Math.max(0, Math.min(100 - optimalO2Raw, Math.round(((0.79 * endAbsPressure) / absPressure) * 100 * 1000) / 1000))
    
    const optimalHeRaw = 100 - optimalO2Raw - maxN2Raw
    const optimalHe = optimalHeRaw > 0 ? safeRound(optimalHeRaw, RoundingType.HE, 0) : 0

    if (diveMode === 'oc') {
      // Air recommendation
      if (targetMod <= 56) {
        recommendations.push({
          type: 'Bottom Gas',
          mix: 'EANx21',
          details: `MOD: ${formatDepth(56)} @ ${formatPressure(desiredPPO2)}\nDensity: ${(absPressure * 4.69).toFixed(1)} g/L`,
          o2: 21, he: 0, n2: 79,
          error: false,
          math: `<strong>EANx21 (Air) MOD Calculation:</strong><br/>
<strong>🔧 Rounding Rules:</strong> MOD rounds <strong>DOWN</strong>, O₂% rounds <strong>DOWN</strong>, N₂% rounds <strong>DOWN</strong><br/>
$$\\text{MOD} = \\left(\\frac{\\text{Max PPO}_2}{\\text{O}_2\\%} - 1\\right) \\times 10$$
$$\\text{MOD} = \\left(\\frac{1.4}{0.21} - 1\\right) \\times 10$$
$$\\text{MOD} = (6.67 - 1) \\times 10 = 56.7\\text{m}$$
$$\\text{Safe MOD} = \\lfloor 56.7 \\rfloor = \\mathbf{56\\text{m}}$$
<br/>
<strong>Gas Density:</strong><br/>
$$\\text{Density} = \\text{Abs Pressure} \\times 4.69\\text{ (air factor)}$$
$$\\text{Density} = ${absPressure.toFixed(1)} \\times 4.69 = ${(absPressure * 4.69).toFixed(1)}\\text{ g/L}$$`
        })
      }
      
      // Optimized nitrox
      if (optimalO2 > 21 && optimalO2 <= 100 && desiredPPO2 <= 1.6) {
        const actualMOD = safeRound(((desiredPPO2 / (optimalO2 / 100)) - 1) * 10, RoundingType.MOD)
        const modAt14 = safeRound(((1.4 / (optimalO2 / 100)) - 1) * 10, RoundingType.MOD)
        const exceedsRecommended = desiredPPO2 > 1.4
        const warningText = exceedsRecommended ? `\n⚠️ WARNING: PPO₂ ${formatPressure(desiredPPO2)} exceeds recommended ${formatPressure(1.4)} limit for bottom gas` : ''
        
        
        recommendations.push({
          type: 'Optimized Bottom Gas',
          mix: `EANx${optimalO2}`,
          details: `MOD: ${formatDepth(actualMOD)} @ ${formatPressure(desiredPPO2)}${exceedsRecommended ? `\nRecommended MOD: ${formatDepth(modAt14)} @ ${formatPressure(1.4)}` : ''}\nO₂: ${optimalO2}% N₂: ${100 - optimalO2}%${warningText}`,
          o2: optimalO2, he: 0, n2: 100 - optimalO2,
          error: false,
          math: `<strong>Optimized Nitrox Calculation:</strong><br/>
<strong>Step 1: Calculate Absolute Pressure</strong><br/>
$$\\text{Absolute Pressure} = \\frac{\\text{Depth}}{10} + 1$$
$$\\text{Absolute Pressure} = \\frac{${targetMod}}{10} + 1 = ${absPressure.toFixed(2)}\\text{ bar}$$
<br/>
<strong>Step 2: Calculate Optimal O₂%</strong><br/>
$$\\text{FO}_2 = \\frac{\\text{PPO}_2}{\\text{Absolute Pressure}}$$
$$\\text{FO}_2 = \\frac{${desiredPPO2}}{${absPressure.toFixed(2)}} = ${(desiredPPO2/absPressure).toFixed(3)}$$
$$\\text{O}_2\\% = ${precisePercentage(desiredPPO2/absPressure).toFixed(1)}\\% \\rightarrow ${optimalO2}\\% \\text{ (rounded DOWN)}$$
<br/>
<strong>🔧 Rounding Rules for Safety:</strong><br/>
• O₂%: Always round <strong>DOWN</strong> (conservative PPO₂)<br/>
• N₂%: Always round <strong>DOWN</strong> (conservative narcosis)<br/>
• He%: Always round <strong>UP</strong> (ensures balance)<br/>
• MOD: Always round <strong>DOWN</strong> (conservative depth)
<br/>
<strong>Step 3: MOD Verification</strong><br/>
$$\\text{MOD} = \\left(\\frac{\\text{PPO}_2}{\\text{FO}_2} - 1\\right) \\times 10$$
$$\\text{MOD} = \\left(\\frac{${desiredPPO2}}{${(optimalO2/100).toFixed(2)}} - 1\\right) \\times 10$$
$$\\text{MOD} = (${(desiredPPO2 / (optimalO2/100)).toFixed(2)} - 1) \\times 10 = ${(((desiredPPO2 / (optimalO2/100)) - 1) * 10).toFixed(1)}\\text{m}$$
${exceedsRecommended ? '<br/><strong>⚠️ PPO₂ Warning:</strong><br/>$$\\\\text{Recommended MOD @ 1.4 bar} = \\\\left(\\\\frac{1.4}{' + (optimalO2/100).toFixed(2) + '} - 1\\\\right) \\\\times 10 = ' + modAt14 + '\\\\text{m}$$<br/>Bottom gas should not exceed 1.4 bar PPO₂ for working depths' : ''}`
        })
      }
      
      // Deco gases
      if (targetMod > 20) {
        if (targetMod < 50) {
          // EANx80 for shallower dives
          recommendations.push({
            type: 'Deco Gas',
            mix: 'EANx80',
            details: 'MOD: 10m @ 1.6 bar\nSwitch depth: 10m\nDeep deco start',
            o2: 80, he: 0, n2: 20,
            error: false,
            math: `<strong>EANx80 Deco Gas MOD:</strong><br/>
<strong>🔧 Rounding Rules:</strong> MOD rounds <strong>DOWN</strong>, O₂% rounds <strong>DOWN</strong>, N₂% rounds <strong>DOWN</strong><br/>
$$\\text{MOD} = \\left(\\frac{\\text{Max PPO}_2}{\\text{O}_2\\%} - 1\\right) \\times 10$$
$$\\text{MOD} = \\left(\\frac{1.6}{0.80} - 1\\right) \\times 10$$
$$\\text{MOD} = (2.0 - 1) \\times 10 = 10.0\\text{m}$$
$$\\text{Safe MOD} = \\lfloor 10.0 \\rfloor = \\mathbf{10\\text{m}}$$
<br/>
<strong>Deco Usage:</strong> Allows earlier decompression start compared to 100% O₂`
          })
        }
        
        recommendations.push({
          type: 'Deco Gas',
          mix: targetMod < 50 ? 'EANx50' : 'EANx50',
          details: 'MOD: 22m @ 1.6 bar\nSwitch depth: 22m',
          o2: 50, he: 0, n2: 50,
          error: false,
          math: `<strong>EANx50 Deco Gas MOD:</strong><br/>
<strong>🔧 Rounding Rules:</strong> MOD rounds <strong>DOWN</strong>, O₂% rounds <strong>DOWN</strong>, N₂% rounds <strong>DOWN</strong><br/>
$$\\text{MOD} = \\left(\\frac{\\text{Max PPO}_2}{\\text{O}_2\\%} - 1\\right) \\times 10$$
$$\\text{MOD} = \\left(\\frac{1.6}{0.50} - 1\\right) \\times 10$$
$$\\text{MOD} = (3.2 - 1) \\times 10 = 22.0\\text{m}$$
$$\\text{Safe MOD} = \\lfloor 22.0 \\rfloor = \\mathbf{22\\text{m}}$$
<br/>
<strong>Deco Usage:</strong> Switch to this gas at 22m for accelerated decompression`
        })
      }
    } else if (diveMode === 'oc-trimix') {
      // Open Circuit Trimix recommendations
      const trimixO2 = safeRound(optimalO2, RoundingType.O2, 0)  // O2 rounds DOWN
      const trimixHe = safeRound(optimalHe, RoundingType.HE, 0)   // He rounds UP
      const trimixN2 = safeRound(100 - trimixO2 - trimixHe, RoundingType.N2, 0)  // N2 rounds DOWN
      
      // Check if trimix is viable (allow hypoxic mixes)
      const trimixViable = trimixO2 >= 8 && trimixO2 <= 100 && 
                         trimixHe >= 0 && trimixHe <= 95 && 
                         trimixN2 >= 0 && trimixN2 <= 90 &&
                         Math.abs((trimixO2 + trimixHe + trimixN2) - 100) < 1 &&
                         desiredPPO2 <= 1.6 && 
                         maxEnd <= targetMod
      
      // Calculate safe breathing ceiling for hypoxic mixes
      const isHypoxic = trimixO2 < 16
      const safeBreathingCeiling = isHypoxic ? ((0.16 / (trimixO2 / 100)) - 1) * 10 : 0
      
      if (trimixViable) {
        const actualMOD = safeRound(((desiredPPO2 / (trimixO2 / 100)) - 1) * 10, RoundingType.MOD)
        const mixDetails = isHypoxic ? 
          `MOD: ${actualMOD}m @ ${desiredPPO2} bar\nEND: ${maxEnd}m\nSafe Ceiling: ${safeRound(safeBreathingCeiling, RoundingType.DEPTH)}m (PPO₂ 0.16)\nO₂: ${safeRound(trimixO2, RoundingType.O2, 0)}% He: ${safeRound(trimixHe, RoundingType.HE, 0)}% N₂: ${safeRound(trimixN2, RoundingType.N2, 0)}%\n⚠️ HYPOXIC - Not breathable above ${safeRound(safeBreathingCeiling, RoundingType.DEPTH)}m` :
          `MOD: ${actualMOD}m @ ${desiredPPO2} bar\nEND: ${maxEnd}m\nO₂: ${safeRound(trimixO2, RoundingType.O2, 0)}% He: ${safeRound(trimixHe, RoundingType.HE, 0)}% N₂: ${safeRound(trimixN2, RoundingType.N2, 0)}%`
        
        recommendations.push({
          type: isHypoxic ? 'Optimized Bottom Gas (Hypoxic)' : 'Optimized Bottom Gas',
          mix: `${safeRound(trimixO2, RoundingType.O2, 0)}/${safeRound(trimixHe, RoundingType.HE, 0)}`,
          details: `${mixDetails}\nGas Density: ${((absPressure * ((trimixO2 * 1.429 + trimixHe * 0.179 + trimixN2 * 1.251) / 100))).toFixed(1)} g/L`,
          o2: trimixO2, he: trimixHe, n2: trimixN2,
          error: false,
          math: `<strong>Trimix Calculation:</strong><br/>
<strong>🔧 Rounding Rules Applied:</strong><br/>
• O₂%: round <strong>DOWN</strong> • N₂%: round <strong>DOWN</strong> • He%: round <strong>UP</strong> • MOD: round <strong>DOWN</strong><br/><br/>
<strong>Step 1: Calculate Optimal O₂%</strong><br/>
$$\\text{Absolute Pressure} = \\frac{${targetMod}}{10} + 1 = ${absPressure.toFixed(1)}\\text{ bar}$$
$$\\text{O}_2\\% = \\frac{\\text{PPO}_2}{\\text{Abs Pressure}} \\times 100$$
$$\\text{O}_2\\% = \\frac{${desiredPPO2}}{${absPressure.toFixed(1)}} \\times 100 = ${precisePercentage(desiredPPO2/absPressure).toFixed(1)}\\%$$
$$\\text{O}_2\\% = ${safeRound(trimixO2, RoundingType.O2, 0)}\\% \\text{ (rounded DOWN for safety)}$$
<br/>
<strong>Step 2: Calculate N₂% from END Limit</strong><br/>
$$\\text{END Abs Pressure} = \\frac{${maxEnd}}{10} + 1 = ${((maxEnd/10)+1).toFixed(1)}\\text{ bar}$$
$$\\text{Max N}_2\\% = \\frac{0.79 \\times ${((maxEnd/10)+1).toFixed(1)}}{${absPressure.toFixed(1)}} \\times 100 = ${precisePercentage(0.79 * ((maxEnd/10)+1) / absPressure).toFixed(1)}\\%$$
$$\\text{N}_2\\% = ${safeRound(trimixN2, RoundingType.N2, 0)}\\% \\text{ (rounded DOWN for safety)}$$
<br/>
<strong>Step 3: Calculate Required He%</strong><br/>
$$\\text{He}\\% = 100 - \\text{O}_2\\% - \\text{N}_2\\%$$
$$\\text{He}\\% = 100 - ${safeRound(trimixO2, RoundingType.O2, 0)} - ${safeRound(trimixN2, RoundingType.N2, 0)} = ${safeRound(trimixHe, RoundingType.HE, 0)}\\%$$
<br/>
<strong>Verification:</strong><br/>
$$\\text{END} = (${targetMod} + 10) \\times \\frac{${safeRound(trimixN2, RoundingType.N2, 0)}}{79} - 10 = ${safeRound(((targetMod + 10) * (trimixN2/100) / 0.79) - 10, RoundingType.END)}\\text{m}$$
<br/>
<strong>Gas Density Calculation:</strong><br/>
$$\\text{Mix Density} = \\frac{O_2\\% \\times 1.429 + He\\% \\times 0.179 + N_2\\% \\times 1.251}{100}$$
$$\\text{Mix Density} = \\frac{${safeRound(trimixO2, RoundingType.O2, 0)} \\times 1.429 + ${safeRound(trimixHe, RoundingType.HE, 0)} \\times 0.179 + ${safeRound(trimixN2, RoundingType.N2, 0)} \\times 1.251}{100}$$
$$\\text{Mix Density} = ${((trimixO2 * 1.429 + trimixHe * 0.179 + trimixN2 * 1.251) / 100).toFixed(3)}\\text{ g/L @ 1 bar}$$
$$\\text{Gas Density @ ${targetMod}m} = ${absPressure.toFixed(1)} \\times ${((trimixO2 * 1.429 + trimixHe * 0.179 + trimixN2 * 1.251) / 100).toFixed(3)} = ${((absPressure * ((trimixO2 * 1.429 + trimixHe * 0.179 + trimixN2 * 1.251) / 100))).toFixed(1)}\\text{ g/L}$$
${isHypoxic ? '<br/><strong>Hypoxic Mix Safety:</strong><br/>Safe Ceiling: $' + safeRound(safeBreathingCeiling, RoundingType.DEPTH) + '\\\\text{m}$ (PPO₂ = 0.16 bar)' : ''}`
        })
      } else {
        // Show specific error for impossible trimix
        let errorMsg = ''
        if (desiredPPO2 > 1.6) errorMsg = 'PPO₂ exceeds 1.6 bar limit'
        else if (maxEnd > targetMod) errorMsg = 'END exceeds target depth'
        else if (trimixO2 < 8) errorMsg = 'O₂% too low for safe breathing'
        else if ((trimixO2 / 100) * absPressure < 0.16) errorMsg = 'PPO₂ below hypoxic threshold'
        else if (trimixHe < 0 || trimixN2 < 0) errorMsg = 'Impossible gas percentages'
        else errorMsg = 'Constraints too restrictive'
        
        recommendations.push({
          type: 'Optimized Bottom Gas',
          mix: 'IMPOSSIBLE',
          details: `Error: ${errorMsg}\nTarget: ${targetMod}m, END: ${maxEnd}m\nPPO₂: ${desiredPPO2} bar\n\nAdjust constraints`,
          o2: 0, he: 0, n2: 0,
          error: true,
          math: `<strong>Trimix Constraints:</strong><br/>
Target: ${targetMod}m, MAX END: ${maxEnd}m, PPO₂: ${desiredPPO2} bar<br/>
$$\\text{Required O}_2\\% = ${safeRound(optimalO2, RoundingType.O2, 0)}\\%$$
$$\\text{Required He}\\% = ${safeRound(optimalHe, RoundingType.HE, 0)}\\%$$
$$\\text{Required N}_2\\% = ${safeRound(100 - optimalO2 - optimalHe, RoundingType.N2, 0)}\\%$$
<br/>
<strong>Problem:</strong> ${errorMsg}`
        })
      }

      // Standard trimix mixes (only if optimized trimix is viable)
      if (trimixViable) {
        if (targetMod >= 45 && targetMod <= 60) {
          recommendations.push({
            type: 'Standard Mix',
            mix: '18/45',
            details: 'MOD: 56m @ 1.2 bar\nEND: 20m\nGas Density: 5.3 g/L\nPopular tech mix',
            o2: 18, he: 45, n2: 37,
            error: false,
            math: `<strong>Standard Trimix 18/45 Analysis:</strong><br/>
<strong>🔧 Rounding Rules:</strong> MOD rounds <strong>DOWN</strong>, O₂% rounds <strong>DOWN</strong>, N₂% rounds <strong>DOWN</strong>, He% rounds <strong>UP</strong><br/>
$$\\text{MOD @ 1.2 bar} = \\left(\\frac{1.2}{0.18} - 1\\right) \\times 10 = (6.67 - 1) \\times 10 = 56.7\\text{m}$$
$$\\text{Safe MOD} = \\lfloor 56.7 \\rfloor = \\mathbf{56\\text{m}}$$
$$\\text{Working MOD @ 1.2} = \\mathbf{56\\text{m}}$$ 
$$\\text{END} = (56 + 10) \\times \\frac{\\lfloor 37 \\rfloor}{79} - 10 = 66 \\times 0.468 - 10 = \\lfloor 20.9 \\rfloor = \\mathbf{20\\text{m}}$$
<br/>
<strong>Gas Density Calculation:</strong><br/>
$$\\text{Mix Density} = \\frac{18 \\times 1.429 + 45 \\times 0.179 + 37 \\times 1.251}{100}$$
$$\\text{Mix Density} = \\frac{25.7 + 8.1 + 46.3}{100} = 0.801\\text{ g/L @ 1 bar}$$
$$\\text{Gas Density @ 56m} = 6.6 \\times 0.801 = 5.3\\text{ g/L}$$
<br/>
<strong>Standard Mix Benefits:</strong><br/>
• Popular depth range 45-56m<br/>
• Good helium content for narcosis reduction<br/>
• Widely available from gas suppliers`
          })
        }
        
        if (targetMod >= 60 && targetMod <= 80) {
          recommendations.push({
            type: 'Standard Mix',
            mix: '15/55',
            details: 'MOD: 70m @ 1.2 bar\nEND: 20m\nGas Density: 5.5 g/L\nDeep tech mix',
            o2: 15, he: 55, n2: 30,
            error: false,
            math: `<strong>Standard Trimix 15/55 Analysis:</strong><br/>
<strong>🔧 Rounding Rules:</strong> MOD rounds <strong>DOWN</strong>, O₂% rounds <strong>DOWN</strong>, N₂% rounds <strong>DOWN</strong>, He% rounds <strong>UP</strong><br/>
$$\\text{MOD @ 1.2 bar} = \\left(\\frac{1.2}{0.15} - 1\\right) \\times 10 = (8.0 - 1) \\times 10 = 70\\text{m}$$
$$\\text{Safe MOD} = \\lfloor 70.0 \\rfloor = \\mathbf{70\\text{m}}$$
$$\\text{Working MOD @ 1.2} = \\mathbf{70\\text{m}}$$
$$\\text{END} = (70 + 10) \\times \\frac{\\lfloor 30 \\rfloor}{79} - 10 = 80 \\times 0.38 - 10 = \\lfloor 20.4 \\rfloor = \\mathbf{20\\text{m}}$$
<br/>
<strong>Gas Density Calculation:</strong><br/>
$$\\text{Mix Density} = \\frac{15 \\times 1.429 + 55 \\times 0.179 + 30 \\times 1.251}{100}$$
$$\\text{Mix Density} = \\frac{21.4 + 9.8 + 37.5}{100} = 0.687\\text{ g/L @ 1 bar}$$
$$\\text{Gas Density @ 70m} = 8.0 \\times 0.687 = 5.5\\text{ g/L}$$
<br/>
<strong>Deep Tech Mix Benefits:</strong><br/>
• Excellent for 60-70m range<br/>
• High helium reduces narcosis significantly<br/>
• Industry standard for deep technical diving`
          })
        }

        // Travel gas
        if (targetMod > 30) {
          recommendations.push({
            type: 'Travel Gas',
            mix: 'EANx32',
            details: 'MOD: 33m @ 1.4 bar\nSurface to 33m\nReduce bottom gas consumption',
            o2: 32, he: 0, n2: 68,
            error: false,
            math: `<strong>EANx32 Travel Gas MOD:</strong><br/>
<strong>🔧 Rounding Rules:</strong> MOD rounds <strong>DOWN</strong>, O₂% rounds <strong>DOWN</strong>, N₂% rounds <strong>DOWN</strong><br/>
$$\\text{MOD} = \\left(\\frac{\\text{Max PPO}_2}{\\text{O}_2\\%} - 1\\right) \\times 10$$
$$\\text{MOD} = \\left(\\frac{1.4}{0.32} - 1\\right) \\times 10$$
$$\\text{MOD} = (4.375 - 1) \\times 10 = 33.75\\text{m}$$
$$\\text{Safe MOD} = \\lfloor 33.75 \\rfloor = \\mathbf{33\\text{m}}$$
<br/>
<strong>Travel Gas Benefits:</strong> Reduces nitrogen loading during descent and conserves bottom gas`
          })
        }

        // Deco gases
        recommendations.push({
          type: 'Deco Gas',
          mix: 'EANx50',
          details: 'MOD: 22m @ 1.6 bar\nFirst deco gas\nAccelerated deco',
          o2: 50, he: 0, n2: 50,
          error: false,
          math: `<strong>EANx50 Deco Gas MOD:</strong><br/>
$$\\text{MOD} = \\left(\\frac{\\text{Max PPO}_2}{\\text{O}_2\\%} - 1\\right) \\times 10$$
$$\\text{MOD} = \\left(\\frac{1.6}{0.50} - 1\\right) \\times 10$$
$$\\text{MOD} = (3.2 - 1) \\times 10 = 22\\text{m}$$
<br/>
<strong>Trimix Deco Usage:</strong> Accelerated decompression from 22m`
        })
      }
    } else if (diveMode === 'ccr') {
      // CCR Nitrox recommendations
      if (targetMod <= 40) {
        recommendations.push({
          type: 'Diluent',
          mix: 'EANx21',
          details: `MOD: 56m @ ${desiredPPO2} bar\nDensity: ${(absPressure * 4.69).toFixed(1)} g/L`,
          o2: 21, he: 0, n2: 79,
          error: false,
          math: `<strong>EANx21 Diluent MOD Calculation:</strong><br/>
$$\\text{Bailout MOD} = \\left(\\frac{\\text{Max PPO}_2}{\\text{O}_2\\%} - 1\\right) \\times 10$$
$$\\text{Bailout MOD} = \\left(\\frac{1.4}{0.21} - 1\\right) \\times 10$$
$$\\text{Bailout MOD} = (6.67 - 1) \\times 10 = 56.7\\text{m}$$
<br/>
<strong>CCR Usage:</strong> Air diluent is safe for bailout scenarios up to 57m<br/>
<strong>Gas Density:</strong> ${(absPressure * 4.69).toFixed(1)} g/L at ${targetMod}m`
        })
      }
      

      // Deco gas recommendations
      if (targetMod > 20) {
        if (targetMod < 50) {
          // EANx80 for shallower dives
          recommendations.push({
            type: 'Deco Gas',
            mix: 'EANx80',
            details: 'MOD: 10m @ 1.6 bar\nSwitch depth: 10m\nDeep deco start',
            o2: 80, he: 0, n2: 20,
            error: false,
            math: `<strong>EANx80 CCR Deco Gas:</strong><br/>
$$\\text{MOD} = \\left(\\frac{1.6}{0.80} - 1\\right) \\times 10 = 10\\text{m}$$
<br/>
<strong>CCR Usage:</strong><br/>
Can be used as diluent in CCR at shallow depths<br/>
or as bailout/open circuit deco gas for earlier decompression start`
          })
        }
        
        recommendations.push({
          type: 'Deco Gas',
          mix: 'EANx50',
          details: 'MOD: 22m @ 1.6 bar\nSwitch depth: 22m\nAccelerated deco',
          o2: 50, he: 0, n2: 50,
          error: false,
          math: `<strong>CCR Deco Gas:</strong><br/>
$$\\text{MOD} = \\left(\\frac{1.6}{0.50} - 1\\right) \\times 10 = 22\\text{m}$$
<br/>
<strong>CCR Usage:</strong><br/>
Can be used as diluent in CCR at shallow depths<br/>
or as bailout/open circuit deco gas`
        })
      }
      
      if (targetMod > 30) {
        recommendations.push({
          type: 'Oxygen Deco',
          mix: '100% O₂',
          details: 'MOD: 6m @ 1.6 bar\nSwitch depth: 6m\nFinal deco stop',
          o2: 100, he: 0, n2: 0,
          error: false,
          math: `<strong>Pure Oxygen for CCR:</strong><br/>
$$\\text{MOD} = \\left(\\frac{1.6}{1.0} - 1\\right) \\times 10 = 6\\text{m}$$
<br/>
<strong>CCR Application:</strong><br/>
Used for shallow deco stops in CCR<br/>
Maximum decompression efficiency<br/>
Standard 6m safety/deco stop`
        })
      }


      // Bailout gas with PPO2 1.4
      const bailoutPPO2 = 1.4
      const bailoutO2Raw = Math.max(16, Math.min(100, Math.round((bailoutPPO2 / absPressure) * 100 * 1000) / 1000))
      const bailoutO2 = safeRound(bailoutO2Raw, RoundingType.O2, 0)  // O2 rounds DOWN for safety
      const bailoutN2 = safeRound(100 - bailoutO2, RoundingType.N2, 0)  // N2 rounds DOWN
      const bailoutError = bailoutO2Raw < 16 || bailoutO2Raw > 100 || (bailoutO2Raw / 100) * absPressure > 1.6
      
      const bailoutMOD = bailoutError ? 0 : safeRound(((1.4 / (bailoutO2 / 100)) - 1) * 10, RoundingType.MOD)
      
      recommendations.push({
        type: 'Bailout Gas',
        mix: bailoutError ? 'NOT POSSIBLE' : `EANx${bailoutO2}`,
        details: bailoutError ?
          'Error: Safe bailout not possible at this depth' :
          `Emergency bailout\nMOD: ${bailoutMOD}m @ 1.4 bar\nO₂: ${bailoutO2}% N₂: ${bailoutN2}%`,
        o2: bailoutError ? 0 : bailoutO2, 
        he: 0, 
        n2: bailoutError ? 0 : bailoutN2,
        error: bailoutError,
        math: bailoutError ? 
          `<strong>Bailout Gas Error Analysis:</strong><br/>
Target depth: ${targetMod}m requires safe bailout gas<br/>
$$\\text{Required O}_2\\% = \\frac{1.4}{${((targetMod/10) + 1).toFixed(1)}} \\times 100 = ${bailoutO2.toFixed(1)}\\%$$
<br/>
<strong>Problem:</strong> Cannot create safe bailout mix for this depth` :
          `<strong>CCR Bailout Gas Calculation:</strong><br/>
$$\\text{Bailout MOD} = \\left(\\frac{1.4}{${(bailoutO2/100).toFixed(2)}} - 1\\right) \\times 10$$
$$\\text{Bailout MOD} = \\left(\\frac{1.4}{${(safeRound(bailoutO2, RoundingType.O2, 0)/100).toFixed(2)}} - 1\\right) \\times 10 = ${bailoutMOD}\\text{m}$$
<br/>
<strong>CCR Bailout Strategy:</strong><br/>
Must be breathable at target depth during CCR failure<br/>
Conservative PPO₂ 1.4 bar ensures safety margin`
      })

    } else if (diveMode === 'ccr-trimix') {
      // CCR Trimix recommendations
      const trimixO2 = safeRound(optimalO2, RoundingType.O2, 0)  // O2 rounds DOWN
      const trimixHe = safeRound(optimalHe, RoundingType.HE, 0)   // He rounds UP
      const trimixN2 = 100 - trimixO2 - trimixHe
      
      // Check if trimix is viable (allow hypoxic mixes)
      const trimixError = trimixO2 < 8 || trimixHe < 0 || trimixN2 < 0 || 
                         (trimixO2 + trimixHe + trimixN2) !== 100 ||
                         trimixHe > 95
      
      if (!trimixError) {
        const actualMOD = safeRound(((desiredPPO2 / (trimixO2 / 100)) - 1) * 10, RoundingType.MOD)
        recommendations.push({
          type: 'Optimized Diluent',
          mix: `${trimixO2}/${trimixHe}`,
          details: `MOD: ${actualMOD}m @ ${desiredPPO2} bar\nEND: ${maxEnd}m\nGas Density: ${((absPressure * ((trimixO2 * 1.429 + trimixHe * 0.179 + trimixN2 * 1.251) / 100))).toFixed(1)} g/L\nO₂: ${trimixO2}% He: ${trimixHe}% N₂: ${trimixN2}%`,
          o2: trimixO2, he: trimixHe, n2: trimixN2,
          error: false,
          math: `<strong>CCR Trimix Diluent Calculation:</strong><br/>
<strong>Step 1: Calculate Bailout-Safe O₂%</strong><br/>
$$\\text{Absolute Pressure} = \\frac{${targetMod}}{10} + 1 = ${absPressure.toFixed(1)}\\text{ bar}$$
$$\\text{O}_2\\% = \\frac{\\text{PPO}_2}{\\text{Abs Pressure}} \\times 100$$
$$\\text{O}_2\\% = \\frac{${desiredPPO2}}{${absPressure.toFixed(1)}} \\times 100 = ${precisePercentage(desiredPPO2/absPressure).toFixed(1)}\\%$$
$$\\text{O}_2\\% = ${trimixO2}\\% \\text{ (safe for bailout)}$$
<br/>
<strong>Step 2: Calculate N₂% from END Limit</strong><br/>
$$\\text{END Abs Pressure} = \\frac{${maxEnd}}{10} + 1 = ${((maxEnd/10)+1).toFixed(1)}\\text{ bar}$$
$$\\text{Max N}_2\\% = \\frac{0.79 \\times ${((maxEnd/10)+1).toFixed(1)}}{${absPressure.toFixed(1)}} \\times 100 = ${precisePercentage(0.79 * ((maxEnd/10)+1) / absPressure).toFixed(1)}\\%$$
$$\\text{N}_2\\% = ${trimixN2}\\%$$
<br/>
<strong>Step 3: Calculate Required He%</strong><br/>
$$\\text{He}\\% = 100 - ${trimixO2} - ${trimixN2} = ${trimixHe}\\%$$
<br/>
<strong>CCR Operation:</strong> Diluent dilutes O₂ addition; must be safe to breathe throughout dive during bailout/O₂ failure<br/>
<strong>Step 4: END Verification</strong><br/>
$$\\text{END} = (\\text{Depth} + 10) \\times \\frac{\\text{N}_2\\%}{79} - 10$$
$$\\text{END} = (${targetMod} + 10) \\times \\frac{${trimixN2}}{79} - 10$$
$$\\text{END} = ${targetMod + 10} \\times ${(trimixN2/79).toFixed(3)} - 10 = ${safeRound(((targetMod + 10) * (trimixN2/100) / 0.79) - 10, RoundingType.END)}\\text{m}$$
<br/>
<strong>Gas Density Calculation:</strong><br/>
$$\\text{Mix Density} = \\frac{${safeRound(trimixO2, RoundingType.O2, 0)} \\times 1.429 + ${safeRound(trimixHe, RoundingType.HE, 0)} \\times 0.179 + ${safeRound(trimixN2, RoundingType.N2, 0)} \\times 1.251}{100}$$
$$\\text{Gas Density @ ${targetMod}m} = ${absPressure.toFixed(1)} \\times ${((trimixO2 * 1.429 + trimixHe * 0.179 + trimixN2 * 1.251) / 100).toFixed(3)} = ${((absPressure * ((trimixO2 * 1.429 + trimixHe * 0.179 + trimixN2 * 1.251) / 100))).toFixed(1)}\\text{ g/L}$$`
        })
      } else {
        recommendations.push({
          type: 'Diluent',
          mix: 'IMPOSSIBLE MIX',
          details: `Cannot create safe trimix diluent for:\nMOD: ${targetMod}m\nEND: ${maxEnd}m\nPPO₂: ${desiredPPO2} bar\n\nAdjust constraints`,
          o2: 0, he: 0, n2: 0,
          error: true,
          math: `<strong>CCR Trimix Constraints:</strong><br/>
Target: ${targetMod}m, MAX END: ${maxEnd}m, PPO₂: ${desiredPPO2} bar<br/>
$$\\text{Required O}_2\\% = ${safeRound(optimalO2, RoundingType.O2, 0)}\\%$$
$$\\text{Required He}\\% = ${safeRound(optimalHe, RoundingType.HE, 0)}\\%$$
<br/>
<strong>Problem:</strong> Cannot balance gas percentages<br/>
for these depth and END constraints`
        })
      }

      // Standard trimix mixes (only if not in error state)
      if (!trimixError) {
        if (targetMod >= 45 && targetMod <= 60) {
          recommendations.push({
            type: 'Standard Diluent',
            mix: '18/45',
            details: 'MOD: 56m @ 1.2 bar\nEND: 20m\nGas Density: 5.3 g/L\nPopular tech mix',
            o2: 18, he: 45, n2: 37,
            error: false,
            math: `<strong>CCR Standard Diluent 18/45:</strong><br/>
$$\\text{Bailout MOD} = \\left(\\frac{1.4}{0.18} - 1\\right) \\times 10 = 67.8\\text{m}$$
$$\\text{END} = (67 + 10) \\times \\frac{37}{79} - 10 = 26.0\\text{m}$$
$$\\text{Gas Density @ 67m} = 7.7 \\times 3.5 = 26.95\\text{ g/L}$$
<br/>
<strong>CCR Diluent Benefits:</strong><br/>
• Safe to breathe at all depths during bailout<br/>
• Minimal diluent consumption<br/>
• Standard trimix mix availability`
          })
        }
        
        if (targetMod >= 60 && targetMod <= 80) {
          recommendations.push({
            type: 'Standard Diluent',
            mix: '15/55',
            details: 'MOD: 70m @ 1.2 bar\nEND: 20m\nGas Density: 5.5 g/L\nDeep tech mix',
            o2: 15, he: 55, n2: 30,
            error: false,
            math: `<strong>CCR Standard Diluent 15/55:</strong><br/>
$$\\text{Bailout MOD} = \\left(\\frac{1.4}{0.15} - 1\\right) \\times 10 = 83.3\\text{m}$$
$$\\text{END} = (80 + 10) \\times \\frac{30}{79} - 10 = 24.1\\text{m}$$
$$\\text{Gas Density @ 80m} = 9.0 \\times 3.2 = 28.8\\text{ g/L}$$
<br/>
<strong>Deep CCR Diluent:</strong><br/>
• Excellent narcosis management<br/>
• Safe to breathe during deep CCR bailout scenarios<br/>
• Industry standard deep trimix`
          })
        }

        // Travel gas
        if (targetMod > 30) {
          recommendations.push({
            type: 'Travel Gas',
            mix: 'EANx32',
            details: 'MOD: 33m @ 1.4 bar\nSurface to 33m\nReduce bottom gas consumption',
            o2: 32, he: 0, n2: 68,
            error: false,
            math: `<strong>EANx32 Travel Gas MOD:</strong><br/>
<strong>🔧 Rounding Rules:</strong> MOD rounds <strong>DOWN</strong>, O₂% rounds <strong>DOWN</strong>, N₂% rounds <strong>DOWN</strong><br/>
$$\\text{MOD} = \\left(\\frac{\\text{Max PPO}_2}{\\text{O}_2\\%} - 1\\right) \\times 10$$
$$\\text{MOD} = \\left(\\frac{1.4}{0.32} - 1\\right) \\times 10$$
$$\\text{MOD} = (4.375 - 1) \\times 10 = 33.75\\text{m}$$
$$\\text{Safe MOD} = \\lfloor 33.75 \\rfloor = \\mathbf{33\\text{m}}$$
<br/>
<strong>Travel Gas Benefits:</strong> Reduces nitrogen loading during descent and conserves bottom gas`
          })
        }

        // Deco gases
        
        
        recommendations.push({
          type: 'Deco Gas',
          mix: 'EANx50',
          details: 'MOD: 22m @ 1.6 bar\nFirst deco gas\nAccelerated deco',
          o2: 50, he: 0, n2: 50,
          error: false,
          math: `<strong>EANx50 Deco Gas MOD:</strong><br/>
$$\\text{MOD} = \\left(\\frac{\\text{Max PPO}_2}{\\text{O}_2\\%} - 1\\right) \\times 10$$
$$\\text{MOD} = \\left(\\frac{1.6}{0.50} - 1\\right) \\times 10$$
$$\\text{MOD} = (3.2 - 1) \\times 10 = 22\\text{m}$$
<br/>
<strong>Trimix Deco Usage:</strong> Accelerated decompression from 22m`
        })

      }

      // Bailout trimix with PPO2 1.4 (allow hypoxic bailout)
      const bailoutPPO2 = 1.4
      const bailoutO2calc = safeRound(Math.max(8, Math.min(100, Math.round((bailoutPPO2 / absPressure) * 100 * 1000) / 1000)), RoundingType.O2, 0)  // O2 rounds DOWN
      const bailoutEndAbsPressure = (maxEnd / 10) + 1
      const bailoutN2Raw = Math.max(0, Math.min(100 - bailoutO2calc, Math.round(((0.79 * bailoutEndAbsPressure) / absPressure) * 100 * 1000) / 1000))
      const bailoutN2 = safeRound(bailoutN2Raw, RoundingType.N2, 0)  // N2 rounds DOWN
      const bailoutHeRaw = 100 - bailoutO2calc - bailoutN2
      const bailoutHe = bailoutHeRaw > 0 ? safeRound(bailoutHeRaw, RoundingType.HE, 0) : 0  // He rounds UP
      
      const bailoutError = bailoutO2calc < 8 || bailoutO2calc > 100 || 
                         bailoutHe < 0 || bailoutN2 < 0 || 
                         (bailoutO2calc / 100) * absPressure > 1.6 ||
                         bailoutHe > 95 ||
                         (bailoutO2calc + bailoutHe + bailoutN2) > 101
      
      // Check if bailout is hypoxic
      const bailoutIsHypoxic = bailoutO2calc < 16
      const bailoutSafeCeiling = bailoutIsHypoxic ? safeRound(((0.16 / (bailoutO2calc / 100)) - 1) * 10, RoundingType.DEPTH) : 0
      const bailoutTrimixMOD = bailoutError ? 0 : safeRound(((1.4 / (bailoutO2calc / 100)) - 1) * 10, RoundingType.MOD)
      
      recommendations.push({
        type: bailoutIsHypoxic ? 'Bailout Gas (Hypoxic)' : 'Bailout Gas',
        mix: bailoutError ? 'NOT POSSIBLE' : `${safeRound(bailoutO2calc, RoundingType.O2, 0)}/${safeRound(bailoutHe, RoundingType.HE, 0)}`,
        details: bailoutError ?
          'Error: Safe bailout trimix not possible\nfor these depth/END constraints' :
          bailoutIsHypoxic ?
            `Emergency bailout\nMOD: ${bailoutTrimixMOD}m @ 1.4 bar\nEND: ${maxEnd}m\nGas Density: ${safeRound(absPressure * ((bailoutO2calc * 1.429 + bailoutHe * 0.179 + bailoutN2 * 1.251) / 100), RoundingType.DENSITY)} g/L\nSafe Ceiling: ${bailoutSafeCeiling}m\nO₂: ${safeRound(bailoutO2calc, RoundingType.O2, 0)}% He: ${safeRound(bailoutHe, RoundingType.HE, 0)}%\n⚠️ HYPOXIC - Not breathable above ${bailoutSafeCeiling}m` :
            `Emergency bailout\nMOD: ${bailoutTrimixMOD}m @ 1.4 bar\nEND: ${maxEnd}m\nGas Density: ${safeRound(absPressure * ((bailoutO2calc * 1.429 + bailoutHe * 0.179 + bailoutN2 * 1.251) / 100), RoundingType.DENSITY)} g/L\nO₂: ${safeRound(bailoutO2calc, RoundingType.O2, 0)}% He: ${safeRound(bailoutHe, RoundingType.HE, 0)}%`,
        o2: bailoutError ? 0 : bailoutO2calc, 
        he: bailoutError ? 0 : bailoutHe, 
        n2: bailoutError ? 0 : bailoutN2,
        error: bailoutError,
        math: bailoutError ? 
          `<strong>CCR Bailout Trimix Error:</strong><br/>
Target: ${targetMod}m, END: ${maxEnd}m<br/>
Cannot create safe bailout trimix for these constraints<br/>
<strong>Requirements:</strong><br/>
• PPO₂ ≤ 1.4 bar for bailout safety<br/>
• O₂% ≥ 8% (minimum for life support)<br/>
• END ≤ ${maxEnd}m (nitrogen narcosis limit)<br/>
• He% must be positive and ≤ 95%` :
          `<strong>CCR Bailout Trimix Calculation:</strong><br/>
<strong>🔧 Rounding Rules:</strong> MOD/END round <strong>DOWN</strong>, O₂% rounds <strong>DOWN</strong>, N₂% rounds <strong>DOWN</strong>, He% rounds <strong>UP</strong><br/>
<strong>Step 1: Calculate O₂% for 1.4 bar PPO₂</strong><br/>
$$\\text{Bailout O}_2\\% = \\frac{1.4}{${absPressure.toFixed(1)}} \\times 100 = ${precisePercentage(1.4/absPressure).toFixed(1)}\\%$$
$$\\text{Safe O}_2\\% = \\lfloor ${precisePercentage(1.4/absPressure).toFixed(1)} \\rfloor = ${safeRound(bailoutO2calc, RoundingType.O2, 0)}\\%$$
<br/>
<strong>Step 2: Calculate N₂% from END Limit</strong><br/>
$$\\text{Max N}_2\\% = \\frac{0.79 \\times ${((maxEnd/10)+1).toFixed(1)}}{${absPressure.toFixed(1)}} \\times 100 = ${precisePercentage(0.79 * ((maxEnd/10)+1) / absPressure).toFixed(1)}\\%$$
$$\\text{Safe N}_2\\% = \\lfloor ${precisePercentage(0.79 * ((maxEnd/10)+1) / absPressure).toFixed(1)} \\rfloor = ${safeRound(bailoutN2, RoundingType.N2, 0)}\\%$$
<br/>
<strong>Step 3: Calculate He%</strong><br/>
$$\\text{He}\\% = 100 - ${safeRound(bailoutO2calc, RoundingType.O2, 0)} - ${safeRound(bailoutN2, RoundingType.N2, 0)} = ${safeRound(bailoutHe, RoundingType.HE, 0)}\\%$$
<br/>
<strong>Gas Density:</strong><br/>
$$\\text{Density @ ${targetMod}m} = ${absPressure.toFixed(1)} \\times ${((bailoutO2calc * 1.429 + bailoutHe * 0.179 + bailoutN2 * 1.251) / 100).toFixed(3)} = ${((absPressure * ((bailoutO2calc * 1.429 + bailoutHe * 0.179 + bailoutN2 * 1.251) / 100))).toFixed(1)}\\text{ g/L}$$
${bailoutIsHypoxic ? '<br/><strong>⚠️ Hypoxic Warning:</strong><br/>Safe Ceiling: $' + safeRound(bailoutSafeCeiling, RoundingType.DEPTH) + '\\\\text{m}$ (PPO₂ = 0.16 bar)<br/>Not breathable above this depth!' : ''}`
      })

      // Deco gas recommendations
      if (targetMod > 20) {
        if (targetMod < 50) {
          // EANx80 for shallower dives
          recommendations.push({
            type: 'Deco Gas',
            mix: 'EANx80',
            details: 'MOD: 10m @ 1.6 bar\nSwitch depth: 10m\nDeep deco start',
            o2: 80, he: 0, n2: 20,
            error: false,
            math: `<strong>EANx80 CCR Trimix Deco Gas:</strong><br/>
$$\\text{MOD} = \\left(\\frac{1.6}{0.80} - 1\\right) \\times 10 = 10\\text{m}$$
<br/>
<strong>CCR Trimix Deco Usage:</strong><br/>
Can be used as diluent in CCR at shallow depths<br/>
or as bailout/open circuit deco gas for earlier decompression start`
          })
        }
        
        if (targetMod >= 50) {
          recommendations.push({
            type: 'Deco Gas',
            mix: 'EANx50',
            details: 'MOD: 22m @ 1.6 bar\nSwitch depth: 22m\nAccelerated deco',
            o2: 50, he: 0, n2: 50,
            error: false,
            math: `<strong>EANx50 CCR Trimix Deco Gas:</strong><br/>
$$\\text{MOD} = \\left(\\frac{1.6}{0.50} - 1\\right) \\times 10 = 22\\text{m}$$
<br/>
<strong>CCR Trimix Deco Usage:</strong><br/>
Can be used as diluent in CCR at shallow depths<br/>
or as bailout/open circuit deco gas for accelerated decompression`
          })
        }
      }

      // Shallow bailout (only if main recommendations aren't in error)
      if (!trimixError && targetMod > 40) {
        recommendations.push({
          type: 'Shallow Bailout',
          mix: 'EANx50',
          details: 'MOD: 22m @ 1.6 bar\nDeco bailout\nReduce deco time',
          o2: 50, he: 0, n2: 50,
          error: false,
          math: `<strong>Shallow Bailout EANx50 MOD:</strong><br/>
$$\\text{MOD} = \\left(\\frac{\\text{Max PPO}_2}{\\text{O}_2\\%} - 1\\right) \\times 10$$
$$\\text{MOD} = \\left(\\frac{1.6}{0.50} - 1\\right) \\times 10$$
$$\\text{MOD} = (3.2 - 1) \\times 10 = 22\\text{m}$$
<br/>
<strong>CCR Bailout Strategy:</strong> High O₂ content reduces decompression time during bailout scenarios`
        })
      }
    }
    
    dispatch({ type: 'SET_RECOMMENDATIONS', payload: recommendations })
    
    // Hide loading state
    dispatch({ type: 'SET_IS_GENERATING_RECOMMENDATIONS', payload: false })
  }, [recParams, diveMode])

  // Apply recommendation
  const applyRecommendation = (o2: number, he: number, n2: number) => {
    dispatch({ type: 'SET_LOCKED_PARAMETERS', payload: new Set() })
    if (he > 0 && gasType !== 'trimix') {
      dispatch({ type: 'SET_GAS_TYPE', payload: 'trimix' })
    } else if (he === 0 && gasType !== 'nitrox') {
      dispatch({ type: 'SET_GAS_TYPE', payload: 'nitrox' })
    }
    
    const newParams = { ...gasParams, oxygen: o2, helium: he, nitrogen: n2, depth: recParams.targetMod }
    // Note: Not awaiting here since this is a user action that should feel immediate
    updateCalculations(newParams)
    
    // Note: Do not overwrite recommendationWarnings here - they should only reflect planning parameters
    // The mixer warnings will be updated through updateCalculations -> setWarnings
  }

  // Handle parameter updates
  const updateParameter = (param: string, value: number) => {
    if (lockedParameters.has(param)) return
    
    // Nitrogen cannot be updated directly - it's always calculated as residual
    if (param === 'nitrogen') return
    
    let adjustedValue = value
    
    // Enforce O2 + He ≤ 100 constraint for gas percentage parameters
    if (gasType === 'trimix') {
      if (param === 'oxygen') {
        // When updating oxygen, ensure it doesn't exceed 100 - current helium
        adjustedValue = Math.min(value, 100 - gasParams.helium)
      } else if (param === 'helium') {
        // When updating helium, ensure it doesn't exceed 100 - current oxygen
        adjustedValue = Math.min(value, 100 - gasParams.oxygen)
      }
    }
    
    const newParams = { ...gasParams, [param]: adjustedValue }
    // Note: Not awaiting here since parameter updates should feel immediate
    updateCalculations(newParams)
  }

  // Toggle parameter lock
  const toggleLock = (param: string) => {
    // Nitrogen cannot be locked - it's always calculated as residual
    if (param === 'nitrogen') return
    
    const newLocked = new Set(lockedParameters)
    if (newLocked.has(param)) {
      newLocked.delete(param)
    } else {
      newLocked.add(param)
    }
    dispatch({ type: 'SET_LOCKED_PARAMETERS', payload: newLocked })
  }

  // Effects
  useEffect(() => {
    const handleCalculationsUpdate = async () => {
      await updateCalculations(gasParams)
    }
    handleCalculationsUpdate()
     
  }, [gasType, lockedParameters, updateCalculations])

  useEffect(() => {
    const handleRecommendationsGeneration = async () => {
      await generateRecommendations()
      
      // Generate PLANNING warnings for recommendations (not gas mixer warnings)
      if (activeTab === 'recommendations') {
        dispatch({ type: 'SET_RECOMMENDATION_WARNINGS', payload: generatePlanningWarnings(recParams.targetMod, recParams.maxEnd, recParams.desiredPPO2, diveMode) })
      } else {
        // Clear recommendation warnings when not on recommendations tab
        dispatch({ type: 'SET_RECOMMENDATION_WARNINGS', payload: [] })
      }
    }
    
    handleRecommendationsGeneration()
  }, [recParams, diveMode, activeTab, generateRecommendations])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when not typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Dive mode shortcuts with Ctrl key
      if (e.ctrlKey) {
        switch (e.key) {
          case '1':
            e.preventDefault()
            dispatch({ type: 'SET_DIVE_MODE', payload: 'oc' })
            break
          case '2':
            e.preventDefault()
            dispatch({ type: 'SET_DIVE_MODE', payload: 'ccr' })
            break
          case '3':
            e.preventDefault()
            dispatch({ type: 'SET_DIVE_MODE', payload: 'oc-trimix' })
            break
          case '4':
            e.preventDefault()
            dispatch({ type: 'SET_DIVE_MODE', payload: 'ccr-trimix' })
            break
          case 'n':
          case 'N':
            e.preventDefault()
            dispatch({ type: 'SET_GAS_TYPE', payload: 'nitrox' })
            break
          case 't':
          case 'T':
            e.preventDefault()
            dispatch({ type: 'SET_GAS_TYPE', payload: 'trimix' })
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Clear irrelevant warnings when switching tabs
  useEffect(() => {
    if (activeTab !== 'recommendations') {
      dispatch({ type: 'SET_RECOMMENDATION_WARNINGS', payload: [] })
    }
    if (activeTab !== 'mixer') {
      dispatch({ type: 'SET_WARNINGS', payload: [] })
    }
    if (activeTab !== 'blender') {
      dispatch({ type: 'SET_BLENDER_WARNINGS', payload: [] })
    }
  }, [activeTab])

  // Check session storage for safety warning acknowledgment and menu state on mount
  const [shouldOpenMenuInitially, setShouldOpenMenuInitially] = useState(false)
  
  useEffect(() => {
    const acknowledged = sessionStorage.getItem('safety-warning-acknowledged')
    if (acknowledged === 'true') {
      dispatch({ type: 'SET_SHOW_SAFETY', payload: false })
    }
    
    // Check if this is the first visit to calculator in this session
    const hasSeenMenu = sessionStorage.getItem('calculator-menu-seen')
    if (!hasSeenMenu) {
      setShouldOpenMenuInitially(true)
      sessionStorage.setItem('calculator-menu-seen', 'true')
    }
    
    // Handle hash-based navigation from photo-correction page
    const hash = window.location.hash.substring(1)
    if (hash && ['recommendations', 'mixer', 'blender', 'modcheck', 'sac', 'bottomtime', 'links'].includes(hash)) {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: hash as CalculatorState['activeTab'] })
      // Clear the hash after handling it
      history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  // Handle escape key for safety banner
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showSafety) {
        sessionStorage.setItem('safety-warning-acknowledged', 'true')
        dispatch({ type: 'SET_SHOW_SAFETY', payload: false })
        console.log('Safety banner closed via Escape key and acknowledged for session')
      }
    }
    
    if (showSafety) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [showSafety])


  // Stable callback for background image loading
  const handleImageLoaded = useCallback(() => {
    dispatch({ type: 'SET_IMAGE_LOADED', payload: true })
  }, [])

  // Stable callback for blender warnings
  const handleBlenderWarningsChange = useCallback((warnings: Warning[]) => {
    dispatch({ type: 'SET_BLENDER_WARNINGS', payload: warnings })
  }, [])

  // Stable callback for MOD check params
  const handleModCheckParamsChange = useCallback((params: Partial<CalculatorState['modCheckParams']>) => {
    dispatch({ type: 'UPDATE_MOD_CHECK_PARAMS', payload: params })
  }, [])

  // Stable callback for tank selection in mixer
  const handleTankSelect = useCallback((tank: TankSpecification) => {
    dispatch({ type: 'UPDATE_GAS_PARAMS', payload: { 
      tankSizeL: tank.waterVolumeL, 
      selectedTankId: tank.id 
    }})
  }, [gasParams.selectedTankId, gasParams.tankSizeL])

  const results = calculateResults(gasParams)
  const { absPressure, actualPPO2, calculatedEND, density } = results

  return (
      <div className="relative min-h-screen bg-gray-900 text-gray-100">
        <BackgroundImage onImageLoaded={handleImageLoaded} />
      
      {/* Loading state */}
      {!imageLoaded && (
        <div className="fixed inset-0 bg-gray-900 flex items-center justify-center z-50">
          <div className="text-white text-lg">Loading...</div>
        </div>
      )}
      
      {/* Main content - only show when image is loaded */}
      {imageLoaded && (
        <div className="relative z-10">
      <SafetyWarningModal showSafety={showSafety} onClose={() => dispatch({ type: 'SET_SHOW_SAFETY', payload: false })} />

      <AppHeader activeTab={activeTab} />

      <div className="max-w-7xl mx-auto p-2 sm:p-4">
        {/* Tab Content */}
        <div className="bg-gray-800 rounded-lg p-3 sm:p-6">
          
          {/* Gas Recommendations Tab */}
          {activeTab === 'recommendations' && (
            <div>
            
            <DiveModeSelector diveMode={diveMode} onDiveModeChange={(mode) => dispatch({ type: 'SET_DIVE_MODE', payload: mode })} />


            <RecommendationControls 
              diveMode={diveMode} 
              recParams={recParams} 
              onRecParamsChange={(params) => dispatch({ type: 'UPDATE_REC_PARAMS', payload: params })} 
            />

            {/* Recommendation warnings now handled by WarningIconStack */}

            <RecommendationsGrid 
              recommendations={recommendations}
              recParams={recParams}
              onApplyRecommendation={applyRecommendation}
              onShowMath={(title, content) => {
                dispatch({ type: 'SET_MATH_CONTENT', payload: { title, content } })
                dispatch({ type: 'SET_SHOW_MATH_MODAL', payload: true })
              }}
              isLoading={isGeneratingRecommendations}
            />
            </div>
          )}

          {/* Gas Mixer Tab */}
          {activeTab === 'mixer' && (
            <div className="space-y-6">
              
              <GasTypeSelector gasType={gasType} onGasTypeChange={(type) => dispatch({ type: 'SET_GAS_TYPE', payload: type })} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
                <div className="space-y-6">
                  <ParameterControls
                    gasType={gasType}
                    gasParams={gasParams}
                    lockedParameters={lockedParameters}
                    onParameterUpdate={updateParameter}
                    onToggleLock={toggleLock}
                  />
                  
                  <div className="bg-gray-700 p-3 sm:p-4 rounded">
                    <TankSelector
                      selectedTankId={gasParams.selectedTankId}
                      onTankSelect={handleTankSelect}
                      units="metric"
                      allowTwinsets={true}
                      showCommonOnly={false}
                      compactView={false}
                      label="Tank Configuration"
                      showPressure={true}
                      showMaterial={true}
                    />
                    <div className="mt-3">
                      <label className="block text-yellow-400 text-xs sm:text-sm mb-2">Manual Tank Size (L)</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        step="0.1"
                        value={gasParams.tankSizeL}
                        onChange={(e) => updateParameter('tankSizeL', Number(e.target.value) || 0)}
                        className="w-full bg-gray-600 border border-gray-500 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-center text-sm sm:text-base"
                        placeholder="Override tank size"
                      />
                    </div>
                  </div>
                </div>

                <AnalysisResults
                  gasType={gasType}
                  gasParams={gasParams}
                  actualPPO2={actualPPO2}
                  absPressure={absPressure}
                  calculatedEND={calculatedEND}
                  density={density}
                  isLoading={isCalculating}
                />
              </div>
            </div>
          )}

          {/* MOD Check Tab */}
          {activeTab === 'modcheck' && (
            <div className="max-w-5xl mx-auto">
              {/* Top row - Gas params and tank config */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Left Column */}
                <ModCheckForm 
                  modCheckParams={modCheckParams}
                  onModCheckParamsChange={handleModCheckParamsChange}
                />

                {/* Right Column */}
                <ModCheckTankConfig
                  modCheckParams={modCheckParams}
                  onModCheckParamsChange={handleModCheckParamsChange}
                />
              </div>
              
              {/* Results section */}
              <div className="mb-6">
                <ModCheckResults modCheckParams={modCheckParams} />
              </div>
              
              {/* Rounding warning - full width */}
              <RoundingWarning />
            </div>
          )}

          {/* Gas Blender Tab */}
          {activeTab === 'blender' && (
            <GasBlender onWarningsChange={handleBlenderWarningsChange} />
          )}

          {/* SAC/RMV Calculator Tab */}
          {activeTab === 'sac' && (
            <SacCalculator />
          )}

          {/* Bottom Time Calculator Tab */}
          {activeTab === 'bottomtime' && (
            <BottomTimeCalculator />
          )}

          {/* Photo Editor Tab */}
          {activeTab === 'photo-editor' && (
            <PhotoCorrectionTab />
          )}

          {/* Links Tab */}
          {activeTab === 'links' && (
            <LinksPage />
          )}
        </div>

        {/* Math Modal */}
        <MathModal 
          showMathModal={showMathModal}
          mathContent={mathContent}
          onClose={() => dispatch({ type: 'SET_SHOW_MATH_MODAL', payload: false })}
        />

        <div className="fixed top-4 right-4 z-40 flex gap-2">
          <GlobalUIComponents 
            activeTab={activeTab} 
            onTabChange={(tab) => {
              if (tab === 'photo-editor') {
                window.location.href = '/photo-correction'
              } else {
                dispatch({ type: 'SET_ACTIVE_TAB', payload: tab as CalculatorState['activeTab'] })
              }
            }}
            initialMenuOpen={shouldOpenMenuInitially}
          />
        </div>

        {/* Warning Icon Stack - Bottom Left */}
        <WarningIconStack 
          warnings={[
            ...(activeTab === 'recommendations' ? recommendationWarnings : []),
            ...(activeTab === 'mixer' ? warnings : []),
            ...(activeTab === 'blender' ? blenderWarnings : [])
          ]} 
        />
      </div>
      </div>
      )}

      {/* Comprehensive tool descriptions for screen readers */}
      <div className="sr-only">
        <section>
          <h2>DiveBlendr Technical Diving Tools</h2>
          <p>Comprehensive technical diving tool suite for gas mixing, dive planning, and safety analysis. Professional-grade calculations with real-time safety warnings and conservative rounding algorithms.</p>
          
          <article>
            <h3>Gas Recommendations Tool</h3>
            <p>Optimal nitrox and trimix gas mixture recommendations based on target depth. Calculates best oxygen and helium percentages with MOD verification, END analysis, and gas density safety checks. Supports recreational nitrox from 21-40% oxygen and technical trimix with customizable helium fractions.</p>
          </article>
          
          <article>
            <h3>Interactive Gas Mixer</h3>
            <p>Real-time gas mixing calculations with live feedback. Adjust oxygen and helium percentages to see instant MOD, END, and gas density results. Visual safety warnings for ppO2 limits, narcotic depth, and breathing gas density. Supports both open circuit and closed circuit rebreather configurations.</p>
          </article>
          
          <article>
            <h3>Professional Gas Blending</h3>
            <p>Cylinder blending calculations for partial pressure fills and continuous mixing. Determine exact fill pressures needed for target gas mixtures. Includes top-off calculations, mixing validation, and safety margin analysis for professional gas blending operations.</p>
          </article>
          
          <article>
            <h3>MOD Verification Calculator</h3>
            <p>Maximum Operating Depth calculations with configurable ppO2 limits. Verify safe diving depths for any gas mixture with working limits (1.2-1.4 ATA) and emergency limits (1.6 ATA). Essential safety tool for technical dive planning and gas switching procedures.</p>
          </article>
          
          <article>
            <h3>SAC Rate Calculator</h3>
            <p>Surface Air Consumption and Respiratory Minute Volume calculations for dive planning. Input dive profile data to determine personal air consumption rates. Critical for gas management, emergency planning, and determining adequate air supply for technical diving operations.</p>
          </article>
          
          <article>
            <h3>Bottom Time Planner</h3>
            <p>Calculate available bottom time based on gas supply, consumption rates, and safety margins. Factors in ascent time, safety stops, and emergency reserves. Essential for technical diving operations requiring precise gas management and dive duration planning.</p>
          </article>
          
          <div>
            <h3>Safety Features</h3>
            <ul>
              <li>Conservative rounding algorithms - oxygen rounds down, helium rounds up</li>
              <li>Real-time ppO2 monitoring with visual warnings</li>
              <li>Gas density analysis with 6.2g/L safety threshold</li>
              <li>Equivalent Narcotic Depth calculations</li>
              <li>Mode-specific ppO2 limits for OC vs CCR diving</li>
              <li>Color-coded warning system for safety violations</li>
            </ul>
          </div>
        </section>
        
        <section>
          <h3>Technical Diving Calculations</h3>
          
          <div>
            <h4>Nitrox Mixing for 30 Meters</h4>
            <p>For 30-meter dives, optimal nitrox mixtures range from 28-32% oxygen. MOD calculations ensure safe ppO2 limits: EANx28 has MOD of 40m, EANx30 has MOD of 37m, EANx32 has MOD of 34m at 1.4 ATA working limit.</p>
          </div>
          
          <div>
            <h4>Trimix for Deep Technical Diving</h4>
            <p>Deep dives beyond 40 meters require trimix to reduce nitrogen narcosis. Standard mixes include 18/45 for 60m, 15/55 for 70m, and 12/65 for 80m+. Helium percentage calculated to keep END below 30 meters for optimal safety.</p>
          </div>
          
          <div>
            <h4>Gas Density Safety Limits</h4>
            <p>Breathing gas density must remain below 6.2 g/L for safe work of breathing. DiveBlendr calculates gas density at depth using partial pressure corrections and warns when density exceeds recommended limits for technical diving safety.</p>
          </div>
          
          <div>
            <h4>Partial Pressure Calculations</h4>
            <p>ppO2 calculations critical for technical diving safety. Working limits: 1.2 ATA for bottom phases, 1.4 ATA for ascent, 1.6 ATA for decompression stops. CCR divers use lower 1.3 ATA limit for setpoint management.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
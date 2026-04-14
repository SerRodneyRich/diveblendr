/**
 * Centralized END (Equivalent Narcotic Depth) and MOD (Maximum Operating Depth) calculations
 * 
 * This module provides consistent, safety-first calculations for dive planning parameters
 * used throughout the DiveBlendr application. All calculations follow conservative 
 * rounding principles as defined in safeRounding.ts.
 * 
 * SAFETY PRINCIPLES:
 * - MOD calculations round DOWN for conservative depth limits
 * - END calculations round UP for conservative narcosis estimation
 * - All inputs are validated for safety and realistic diving parameters
 * 
 * FORMULAS:
 * - MOD = ((PPO₂ / (O₂% / 100)) - 1) × 10
 * - END = ((N₂% / 79%) × Absolute_Pressure - 1) × 10
 * - Absolute Pressure = (Depth / 10) + 1
 * - Gas Density = Abs_Pressure × ((O₂% × 1.429 + He% × 0.179 + N₂% × 1.251) / 100)
 */

import { safeRound, RoundingType } from './safeRounding'

/**
 * Standard gas densities at STP (g/L)
 */
const GAS_DENSITIES = {
  O2: 1.429,   // Oxygen
  HE: 0.179,   // Helium  
  N2: 1.251    // Nitrogen
} as const

/**
 * Standard atmospheric nitrogen percentage for END calculations
 */
const ATMOSPHERIC_N2_PERCENT = 79

/**
 * Interface for gas mixture parameters
 */
export interface GasMixture {
  /** Oxygen percentage (0-100) */
  oxygen: number
  /** Helium percentage (0-100) */
  helium: number
  /** Nitrogen percentage (0-100) - calculated if not provided */
  nitrogen?: number
}

/**
 * Interface for depth and pressure calculations
 */
export interface DepthPressure {
  /** Depth in meters */
  depth: number
  /** Absolute pressure in bar */
  absolutePressure: number
}

/**
 * Validates gas mixture percentages
 * @param mixture - Gas mixture to validate
 * @returns boolean - true if valid
 */
function validateGasMixture(mixture: GasMixture): boolean {
  const { oxygen, helium, nitrogen } = mixture
  
  // Handle NaN or undefined values gracefully
  const safeO2 = isFinite(oxygen) ? oxygen : 0
  const safeHe = isFinite(helium) ? helium : 0
  const safeN2 = nitrogen !== undefined ? (isFinite(nitrogen) ? nitrogen : 0) : (100 - safeO2 - safeHe)
  
  // Check individual gas percentages are within valid ranges
  if (safeO2 < 0 || safeO2 > 100) return false
  if (safeHe < 0 || safeHe > 100) return false
  if (safeN2 < 0 || safeN2 > 100) return false
  
  // Check total doesn't exceed 100% (allow reasonable rounding tolerance)
  const total = safeO2 + safeHe + safeN2
  if (total < 98 || total > 102) return false
  
  // Allow zero oxygen for some edge cases but warn
  if (safeO2 === 0 && safeHe === 0 && safeN2 === 0) {
    return false // All zeros is not valid
  }
  
  return true
}

/**
 * Validates PPO₂ values for safety
 * @param ppo2 - Partial pressure of oxygen in bar
 * @param mode - Dive mode for context-specific limits
 * @returns boolean - true if within safe limits
 */
function validatePPO2(ppo2: number, mode: 'OC' | 'CCR' = 'OC'): boolean {
  // Handle NaN or undefined gracefully
  const safePPO2 = isFinite(ppo2) ? ppo2 : 0
  
  if (safePPO2 <= 0) return false
  
  // Conservative upper limits based on dive mode
  const maxPPO2 = mode === 'CCR' ? 1.6 : 1.6  // Allow up to 1.6 for validation
  return safePPO2 <= maxPPO2
}

/**
 * Calculates Maximum Operating Depth (MOD) for a given gas mixture and PPO₂
 * 
 * @param mixture - Gas mixture containing oxygen percentage
 * @param targetPPO2 - Target partial pressure of oxygen (bar)
 * @param mode - Dive mode for validation context
 * @returns MOD in meters (rounded down for safety)
 * @throws Error if parameters are invalid
 */
export function calculateMOD(
  mixture: GasMixture, 
  targetPPO2: number,
  mode: 'OC' | 'CCR' = 'OC'
): number {
  // Validate inputs
  if (!validateGasMixture(mixture)) {
    throw new Error(`Invalid gas mixture: O₂=${mixture.oxygen}%, He=${mixture.helium}%, N₂=${mixture.nitrogen}%`)
  }
  
  if (!validatePPO2(targetPPO2, mode)) {
    throw new Error(`Invalid PPO₂ value: ${targetPPO2} bar (must be > 0 and ≤ 1.6)`)
  }
  
  if (mixture.oxygen <= 0) {
    throw new Error(`Oxygen percentage must be greater than 0 (got ${mixture.oxygen}%)`)
  }
  
  // MOD = ((PPO₂ / (O₂% / 100)) - 1) × 10
  const oxygenFraction = mixture.oxygen / 100
  const absolutePressure = targetPPO2 / oxygenFraction
  
  // Use high precision calculation and round to avoid floating point issues
  // e.g., 1.4/0.28 = 5.0 exactly, but JavaScript might give 4.999999999
  const preciseDepth = Math.round(((absolutePressure - 1) * 10) * 1000) / 1000
  const depth = preciseDepth
  
  // Validate calculated depth is reasonable
  if (depth < 0) {
    throw new Error('Calculated MOD is negative - check oxygen percentage and PPO₂')
  }
  
  if (depth > 330) { // Theoretical limit for technical diving
    console.warn(`Calculated MOD (${depth.toFixed(1)}m) exceeds typical technical diving limits`)
  }
  
  // Round down for conservative safety limit
  return safeRound(depth, RoundingType.MOD)
}

/**
 * Calculates Equivalent Narcotic Depth (END) for a gas mixture at given depth
 *
 * @param mixture - Gas mixture containing nitrogen and helium percentages
 * @param depth - Depth in meters
 * @param includeOxygenNarcosis - If true, uses NOAA/DCIEM model (N2+O2 narcotic);
 *                                if false (default), uses IANTD/GUE standard (N2 only)
 * @returns END in meters (rounded up for conservative narcosis estimation)
 * @throws Error if parameters are invalid
 */
export function calculateEND(
  mixture: GasMixture,
  depth: number,
  includeOxygenNarcosis: boolean = false  // default: IANTD/GUE standard (N2 only)
): number {
  // Validate inputs
  if (!validateGasMixture(mixture)) {
    throw new Error('Invalid gas mixture percentages')
  }

  if (depth < 0) {
    throw new Error('Depth cannot be negative')
  }

  if (depth > 500) {
    console.warn(`Depth (${depth}m) exceeds typical diving limits`)
  }

  // Calculate nitrogen percentage if not provided
  const nitrogenPercent = mixture.nitrogen ?? (100 - mixture.oxygen - mixture.helium)

  // Calculate absolute pressure at depth
  const absolutePressure = (depth / 10) + 1

  // END = ((N₂% / 79%) × Absolute_Pressure - 1) × 10
  // This compares the narcotic effect to breathing air at surface
  const nitrogenFraction = nitrogenPercent / 100
  const airNitrogenFraction = ATMOSPHERIC_N2_PERCENT / 100

  // Standard model: only N2 is narcotic (IANTD/GUE)
  // NOAA/DCIEM model: O2 + N2 are narcotic (treat He as non-narcotic)
  const narcoticFraction = includeOxygenNarcosis
    ? (nitrogenPercent + mixture.oxygen) / 100  // N2 + O2 narcotic
    : nitrogenFraction;                          // N2 only

  const airNarcoticFraction = includeOxygenNarcosis
    ? 0.99  // Air: 79% N2 + 20% O2 = 99% narcotic gases
    : airNitrogenFraction;  // Air: 79% N2

  const equivalentPressure = (narcoticFraction / airNarcoticFraction) * absolutePressure
  const end = Math.max(0, (equivalentPressure - 1) * 10)

  // Round up for conservative narcosis estimation
  return safeRound(end, RoundingType.END)
}

/**
 * Calculates gas density at a given depth for breathing gas safety analysis
 *
 * @param mixture - Gas mixture with oxygen, helium, and nitrogen percentages
 * @param depth - Depth in meters
 * @param waterTempC - Water temperature in °C (default 20°C); used for ideal-gas
 *                     temperature correction relative to STP (0°C, 1 atm)
 * @returns Gas density in g/L (rounded to 0.1 g/L precision)
 * @throws Error if parameters are invalid
 */
export function calculateGasDensity(
  mixture: GasMixture,
  depth: number,
  waterTempC: number = 20  // default 20°C if not provided
): number {
  // Validate inputs
  if (!validateGasMixture(mixture)) {
    throw new Error('Invalid gas mixture percentages')
  }

  if (depth < 0) {
    throw new Error('Depth cannot be negative')
  }

  // Calculate nitrogen percentage if not provided
  const nitrogenPercent = mixture.nitrogen ?? (100 - mixture.oxygen - mixture.helium)

  // Calculate absolute pressure at depth
  const absolutePressure = (depth / 10) + 1

  // Gas Density = Abs_Pressure × ((O₂% × 1.429 + He% × 0.179 + N₂% × 1.251) / 100)
  const weightedDensity = (
    mixture.oxygen * GAS_DENSITIES.O2 +
    mixture.helium * GAS_DENSITIES.HE +
    nitrogenPercent * GAS_DENSITIES.N2
  ) / 100

  const density = absolutePressure * weightedDensity

  // Apply temperature correction using ideal gas law
  // STP densities are at 0°C (273.15 K); correct for actual water temperature
  const STP_TEMP_K = 273.15
  const actualTempK = STP_TEMP_K + Math.max(-5, Math.min(40, waterTempC)) // clamp to realistic range
  const densityAtTemp = density * (STP_TEMP_K / actualTempK)

  return safeRound(densityAtTemp, RoundingType.DENSITY)
}

/**
 * Calculates absolute pressure from depth
 * 
 * @param depth - Depth in meters
 * @returns Absolute pressure in bar
 * @throws Error if depth is invalid
 */
export function calculateAbsolutePressure(depth: number): number {
  if (depth < 0) {
    throw new Error('Depth cannot be negative')
  }
  
  const pressure = (depth / 10) + 1
  return safeRound(pressure, RoundingType.PRESSURE)
}

/**
 * Calculates depth from absolute pressure
 * 
 * @param absolutePressure - Absolute pressure in bar
 * @returns Depth in meters
 * @throws Error if pressure is invalid
 */
export function calculateDepthFromPressure(absolutePressure: number): number {
  if (absolutePressure < 1) {
    throw new Error('Absolute pressure must be at least 1 bar')
  }
  
  const depth = (absolutePressure - 1) * 10
  return safeRound(depth, RoundingType.DEPTH)
}

/**
 * Comprehensive gas analysis combining MOD, END, and density calculations
 *
 * @param mixture - Gas mixture parameters
 * @param targetPPO2 - Target partial pressure of oxygen
 * @param mode - Dive mode for context-specific calculations
 * @param waterTempC - Water temperature in °C for density correction (default 20°C)
 * @returns Complete analysis with MOD, END at MOD, gas density, and water temperature
 */
export function analyzeGasMixture(
  mixture: GasMixture,
  targetPPO2: number,
  mode: 'OC' | 'CCR' = 'OC',
  waterTempC: number = 20
) {
  const mod = calculateMOD(mixture, targetPPO2, mode)
  const endAtMOD = calculateEND(mixture, mod)
  const densityAtMOD = calculateGasDensity(mixture, mod, waterTempC)
  const absolutePressureAtMOD = calculateAbsolutePressure(mod)

  // Calculate nitrogen percentage for completeness
  const nitrogen = mixture.nitrogen ?? (100 - mixture.oxygen - mixture.helium)

  return {
    mixture: {
      oxygen: mixture.oxygen,
      helium: mixture.helium,
      nitrogen
    },
    mod,
    endAtMOD,
    densityAtMOD,
    absolutePressureAtMOD,
    targetPPO2,
    actualPPO2AtMOD: safeRound(targetPPO2, RoundingType.PPO2),
    mode,
    waterTempC
  }
}

/**
 * NOAA CNS oxygen toxicity exposure table (PPO2 → max minutes per dive)
 * Source: NOAA Diving Manual, 4th Edition
 */
const NOAA_CNS_TABLE: Array<{ minPPO2: number; maxPPO2: number; maxMinutes: number }> = [
  { minPPO2: 0.6,  maxPPO2: 0.64, maxMinutes: 720 },
  { minPPO2: 0.65, maxPPO2: 0.74, maxMinutes: 570 },
  { minPPO2: 0.75, maxPPO2: 0.84, maxMinutes: 450 },
  { minPPO2: 0.85, maxPPO2: 0.94, maxMinutes: 360 },
  { minPPO2: 0.95, maxPPO2: 1.04, maxMinutes: 240 },
  { minPPO2: 1.05, maxPPO2: 1.14, maxMinutes: 150 },
  { minPPO2: 1.15, maxPPO2: 1.24, maxMinutes: 120 },
  { minPPO2: 1.25, maxPPO2: 1.34, maxMinutes: 45 },
  { minPPO2: 1.35, maxPPO2: 1.44, maxMinutes: 45 },
  { minPPO2: 1.45, maxPPO2: 1.54, maxMinutes: 45 },
  { minPPO2: 1.55, maxPPO2: 1.60, maxMinutes: 45 },
]

/**
 * Estimates single-dive CNS oxygen toxicity percentage using NOAA table.
 *
 * @param ppo2 - Partial pressure of oxygen at depth (bar)
 * @param diveTimeMinutes - Planned dive time in minutes
 * @returns CNS% as a number (0-100+), or null if PPO2 is outside the table range
 */
export function calculateCNSPercent(ppo2: number, diveTimeMinutes: number): number | null {
  if (ppo2 < 0.6 || ppo2 > 1.6 || diveTimeMinutes <= 0) return null

  const entry = NOAA_CNS_TABLE.find(e => ppo2 >= e.minPPO2 && ppo2 <= e.maxPPO2)
  if (!entry) return null

  return Math.round((diveTimeMinutes / entry.maxMinutes) * 100)
}

/**
 * Legacy compatibility functions - maintain backward compatibility
 * with existing code while using the new centralized calculations
 */

/**
 * @deprecated Use calculateMOD instead
 */
export function modCalculation(o2Percent: number, ppo2: number): number {
  return calculateMOD({ oxygen: o2Percent, helium: 0 }, ppo2)
}

/**
 * @deprecated Use calculateEND instead
 */
export function endCalculation(n2Percent: number, depth: number): number {
  return calculateEND({ oxygen: 21, helium: 0, nitrogen: n2Percent }, depth)
}
/**
 * Site-wide safe rounding utility for dive gas calculations
 * 
 * This utility provides consistent, safety-first rounding for all numerical values
 * in the application. Different types of values require different rounding strategies
 * to ensure conservative calculations that prioritize diver safety.
 * 
 * SAFETY PRINCIPLES:
 * - O2 percentages round DOWN (conservative for oxygen toxicity)
 * - Nitrogen percentages round DOWN (conservative for narcosis)
 * - Helium percentages round UP (conservative for narcosis calculations)
 * - MOD/depths round DOWN (conservative safety limits)
 * - END rounds UP (conservative narcosis estimation)
 * - PPO2 rounds to appropriate precision for safety
 */

export enum RoundingType {
  /** Oxygen percentage - Round DOWN for conservative toxicity calculations */
  O2 = 'O2',
  /** Nitrogen percentage - Round DOWN for conservative narcosis calculations */
  N2 = 'N2',
  /** Helium percentage - Round UP for conservative narcosis calculations */
  HE = 'HE',
  /** Maximum Operating Depth - Round DOWN for safety limits */
  MOD = 'MOD',
  /** Equivalent Narcotic Depth - Round UP for conservative narcosis */
  END = 'END',
  /** General depths and ceilings - Round DOWN for safety limits */
  DEPTH = 'DEPTH',
  /** Pressure values - Round to nearest 0.1 bar */
  PRESSURE = 'PRESSURE',
  /** Gas density - Round to nearest 0.1 g/L */
  DENSITY = 'DENSITY',
  /** Partial pressure O2 - Round to nearest 0.01 bar */
  PPO2 = 'PPO2',
  /** Standard mathematical rounding */
  OTHER = 'OTHER'
}

/**
 * Performs safe rounding based on the type of value and safety requirements
 * 
 * @param value - The numerical value to round
 * @param type - The type of value (determines rounding strategy)
 * @param decimalPlaces - Number of decimal places (default: 1)
 * @returns Safely rounded value according to dive safety principles
 */
export function safeRound(
  value: number, 
  type: RoundingType, 
  decimalPlaces: number = 1
): number {
  // Handle edge cases
  if (!isFinite(value) || isNaN(value)) {
    return 0
  }

  const multiplier = Math.pow(10, decimalPlaces)

  switch (type) {
    case RoundingType.O2:
      // Oxygen: Round DOWN for conservative toxicity calculations
      // Example: 32.67% becomes 32.6% (safer for MOD calculations)
      return Math.floor(value * multiplier) / multiplier

    case RoundingType.N2:
      // Nitrogen: Round DOWN for conservative narcosis calculations
      // Example: 47.34% becomes 47.3% (safer for END calculations)
      return Math.floor(value * multiplier) / multiplier

    case RoundingType.HE:
      // Helium: Round UP for conservative narcosis calculations
      // Example: 35.23% becomes 35.3% (ensures adequate helium for narcosis reduction)
      return Math.ceil(value * multiplier) / multiplier

    case RoundingType.MOD:
      // Maximum Operating Depth: Always round DOWN (whole meters)
      // Example: 33.7m becomes 33m (safer operating limit)
      return Math.floor(value)

    case RoundingType.END:
      // Equivalent Narcotic Depth: Round UP for conservative narcosis estimation
      // Example: 29.2m becomes 30m (assumes worst-case narcosis)
      return Math.ceil(value)

    case RoundingType.DEPTH:
      // General depths/ceilings: Round DOWN for safety limits
      // Example: 38.9m ceiling becomes 38m (safer limit)
      return Math.floor(value)

    case RoundingType.PRESSURE:
      // Pressure: Round to nearest 0.1 bar (standard precision)
      // Example: 4.67 bar becomes 4.7 bar
      return Math.round(value * multiplier) / multiplier

    case RoundingType.DENSITY:
      // Gas density: Round to nearest 0.1 g/L (standard precision)
      // Example: 5.34 g/L becomes 5.3 g/L
      return Math.round(value * multiplier) / multiplier

    case RoundingType.PPO2:
      // Partial pressure O2: Round to 0.01 bar precision
      // Example: 1.387 bar becomes 1.39 bar
      return Math.round(value * 100) / 100

    case RoundingType.OTHER:
    default:
      // Standard mathematical rounding
      return Math.round(value * multiplier) / multiplier
  }
}

/**
 * Convenience function for gas percentage rounding with automatic type detection
 * Ensures gas percentages sum to approximately 100% while maintaining safety principles
 * 
 * @param o2 - Oxygen percentage
 * @param he - Helium percentage  
 * @param n2 - Nitrogen percentage (will be calculated if not provided)
 * @returns Object with safely rounded gas percentages
 */
export function safeRoundGasMix(
  o2: number, 
  he: number, 
  n2?: number
): { o2: number; he: number; n2: number } {
  const roundedO2 = safeRound(o2, RoundingType.O2)
  const roundedHe = safeRound(he, RoundingType.HE)
  
  // Calculate N2 to ensure total is ~100%, or use provided value
  const calculatedN2 = n2 ?? (100 - roundedO2 - roundedHe)
  const roundedN2 = safeRound(Math.max(0, calculatedN2), RoundingType.N2)
  
  return {
    o2: roundedO2,
    he: roundedHe,
    n2: roundedN2
  }
}

/**
 * Legacy support: Direct replacement for existing conservative functions
 * These functions maintain backward compatibility while using the new system
 */
export const conservativeO2Round = (value: number): number => 
  safeRound(value, RoundingType.O2, 1)

export const conservativeHeRound = (value: number): number => 
  safeRound(value, RoundingType.HE, 1)

export const conservativeN2Round = (value: number): number => 
  safeRound(value, RoundingType.N2, 1)

export const conservativeMODRound = (value: number): number => 
  safeRound(value, RoundingType.MOD, 0)
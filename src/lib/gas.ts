/**
 * Breathing-gas composition types and the core physical properties derived from
 * them: molar mass, density, MOD, END, hypoxic ceiling.
 *
 * Unit conventions for this module (per the Phase 1 architectural rule):
 * - Fractions are 0–1. Percent-based helpers are provided at the boundary only.
 * - Pressure in bar, depth in metres, temperature in °C at the API boundary,
 *   converted to K internally where the physics needs it.
 */

import { GAS_CONSTANTS } from '@/utils/vanDeWaalsPhysics'
import { ambientPressure, type PressureModelOptions } from './pressure'

/** Universal gas constant in L·bar/(mol·K). CODATA 2018: 8.314462618 J/(mol·K). */
export const R_L_BAR = 0.083144626

/** 0 °C in kelvin. */
export const ZERO_CELSIUS_K = 273.15

/**
 * Nitrogen fraction of dry air used as the narcosis reference.
 * The diving convention is 79% N2 (i.e. all non-oxygen treated as nitrogen);
 * true dry air is 78.08% N2 + 0.93% Ar, and argon is more narcotic than
 * nitrogen, so the 79% convention is the standard and slightly conservative one.
 */
export const AIR_N2_FRACTION = 0.79

/** Oxygen fraction of air used when oxygen is counted as narcotic. */
export const AIR_O2_FRACTION = 0.21

/** A breathing gas as species fractions. Must sum to 1. */
export interface GasFractions {
  /** Oxygen fraction, 0–1. */
  o2: number
  /** Helium fraction, 0–1. */
  he: number
  /** Nitrogen fraction, 0–1. */
  n2: number
}

/** Percent-based mixture as used by the legacy `src/utils` APIs. */
export interface GasPercentages {
  oxygen: number
  helium: number
  nitrogen?: number
}

/** Air, as fractions. */
export const AIR: GasFractions = { o2: AIR_O2_FRACTION, he: 0, n2: AIR_N2_FRACTION }

/** Pure oxygen, as fractions. */
export const PURE_O2: GasFractions = { o2: 1, he: 0, n2: 0 }

/** Pure helium, as fractions. */
export const PURE_HE: GasFractions = { o2: 0, he: 1, n2: 0 }

const FRACTION_SUM_TOLERANCE = 1e-6

/**
 * Builds a validated {@link GasFractions} from oxygen and helium fractions,
 * with nitrogen as the balance.
 *
 * @throws if either input is not a finite number in [0, 1], or if o2 + he > 1.
 */
export function gas(o2: number, he: number = 0): GasFractions {
  if (!Number.isFinite(o2) || !Number.isFinite(he)) {
    throw new Error(`Gas fractions must be finite numbers (got o2=${o2}, he=${he})`)
  }
  if (o2 < 0 || o2 > 1) throw new Error(`Oxygen fraction must be in [0, 1] (got ${o2})`)
  if (he < 0 || he > 1) throw new Error(`Helium fraction must be in [0, 1] (got ${he})`)
  const n2 = 1 - o2 - he
  if (n2 < -FRACTION_SUM_TOLERANCE) {
    throw new Error(`Oxygen + helium exceeds 100% (o2=${o2}, he=${he})`)
  }
  return { o2, he, n2: Math.max(0, n2) }
}

/**
 * Converts a percent-based mixture (the legacy `src/utils` shape) to fractions.
 *
 * Tightened per F10: the total must be within 0.5 percentage points of 100,
 * and NaN throws rather than silently coercing to zero.
 */
export function fromPercentages(mixture: GasPercentages): GasFractions {
  const { oxygen, helium } = mixture
  if (!Number.isFinite(oxygen) || !Number.isFinite(helium)) {
    throw new Error(
      `Gas percentages must be finite numbers (got O2=${oxygen}, He=${helium})`
    )
  }
  const nitrogen = mixture.nitrogen ?? 100 - oxygen - helium
  if (!Number.isFinite(nitrogen)) {
    throw new Error(`Nitrogen percentage must be a finite number (got ${nitrogen})`)
  }
  if (oxygen < 0 || oxygen > 100) throw new Error(`O2 percentage out of range: ${oxygen}`)
  if (helium < 0 || helium > 100) throw new Error(`He percentage out of range: ${helium}`)
  if (nitrogen < 0 || nitrogen > 100) throw new Error(`N2 percentage out of range: ${nitrogen}`)

  const total = oxygen + helium + nitrogen
  if (total < 99.5 || total > 100.5) {
    throw new Error(`Gas percentages must total 100% (got ${total.toFixed(2)}%)`)
  }

  // Renormalise so the returned fractions sum to exactly 1.
  return { o2: oxygen / total, he: helium / total, n2: nitrogen / total }
}

/** Converts fractions back to the legacy percent shape. */
export function toPercentages(mix: GasFractions): Required<GasPercentages> {
  return { oxygen: mix.o2 * 100, helium: mix.he * 100, nitrogen: mix.n2 * 100 }
}

/** True if the fractions are finite, non-negative and sum to 1 within tolerance. */
export function isValidGas(mix: GasFractions): boolean {
  const { o2, he, n2 } = mix
  if (![o2, he, n2].every(Number.isFinite)) return false
  if (o2 < 0 || he < 0 || n2 < 0) return false
  return Math.abs(o2 + he + n2 - 1) <= 1e-6
}

function assertValidGas(mix: GasFractions): void {
  if (!isValidGas(mix)) {
    throw new Error(
      `Invalid gas mixture: O2=${mix.o2}, He=${mix.he}, N2=${mix.n2} (fractions must be ≥ 0 and sum to 1)`
    )
  }
}

/**
 * Molar mass of a mixture in g/mol, as the mole-fraction-weighted average of
 * the component molar masses in `GAS_CONSTANTS`.
 */
export function molarMass(mix: GasFractions): number {
  assertValidGas(mix)
  return (
    mix.o2 * GAS_CONSTANTS.O2.molarMass +
    mix.he * GAS_CONSTANTS.He.molarMass +
    mix.n2 * GAS_CONSTANTS.N2.molarMass
  )
}

/**
 * Gas density in g/L at an arbitrary pressure and temperature, from first
 * principles via the ideal gas law: ρ = P·M / (R·T).
 *
 * F7 fix: the previous implementation multiplied per-species STP densities
 * (defined at 1 atm = 1.01325 bar) by an absolute pressure expressed in bar,
 * which overstated density by ~1.3%. Deriving from P·M/(R·T) removes that bias.
 *
 * @param mix - Gas composition as fractions.
 * @param pressureBar - Absolute pressure in bar.
 * @param temperatureC - Temperature in °C.
 * @returns Density in g/L (unrounded).
 */
export function densityAtPressure(
  mix: GasFractions,
  pressureBar: number,
  temperatureC: number = 20
): number {
  assertValidGas(mix)
  if (!Number.isFinite(pressureBar) || pressureBar < 0) {
    throw new Error(`Pressure must be a finite non-negative number (got ${pressureBar})`)
  }
  if (!Number.isFinite(temperatureC)) {
    throw new Error(`Temperature must be a finite number (got ${temperatureC})`)
  }
  const tempK = ZERO_CELSIUS_K + temperatureC
  if (tempK <= 0) {
    throw new Error(`Temperature must be above absolute zero (got ${temperatureC} °C)`)
  }
  return (pressureBar * molarMass(mix)) / (R_L_BAR * tempK)
}

/**
 * Gas density in g/L at a depth.
 *
 * @param mix - Gas composition as fractions.
 * @param depthMeters - Depth in metres.
 * @param temperatureC - Water temperature in °C (default 20 °C).
 * @param pressureOptions - Pressure model; defaults to the simple 10 msw/bar convention.
 */
export function densityAtDepth(
  mix: GasFractions,
  depthMeters: number,
  temperatureC: number = 20,
  pressureOptions?: PressureModelOptions
): number {
  return densityAtPressure(mix, ambientPressure(depthMeters, pressureOptions), temperatureC)
}

/**
 * Partial pressure of oxygen at a depth, in bar.
 */
export function ppo2AtDepth(
  mix: GasFractions,
  depthMeters: number,
  pressureOptions?: PressureModelOptions
): number {
  assertValidGas(mix)
  return mix.o2 * ambientPressure(depthMeters, pressureOptions)
}

/**
 * Maximum Operating Depth in metres for a target PPO2 — unrounded.
 *
 * MOD = depth at which FO2 · P_ambient = target PPO2.
 *
 * @throws if the mix contains no oxygen (MOD is undefined) or the target PPO2
 *   is not a positive finite number.
 */
export function modRaw(
  mix: GasFractions,
  targetPPO2: number,
  pressureOptions?: PressureModelOptions
): number {
  assertValidGas(mix)
  if (!Number.isFinite(targetPPO2) || targetPPO2 <= 0) {
    throw new Error(`Target PPO2 must be a positive finite number (got ${targetPPO2})`)
  }
  if (mix.o2 <= 0) {
    throw new Error('Cannot compute MOD for a mixture containing no oxygen')
  }
  const targetPressure = targetPPO2 / mix.o2
  // Round to 1e-6 bar before converting so exact cases (1.4 / 0.28 = 5 bar) do
  // not land a hair below the true value and lose a metre to the later floor.
  const cleaned = Math.round(targetPressure * 1e6) / 1e6
  const simple = pressureOptions?.simple ?? true
  if (simple) {
    return Math.max(0, (cleaned - 1) * 10)
  }
  const surface = pressureOptions?.surfacePressureBar ?? 1.01325
  if (cleaned <= surface) return 0
  const density = pressureOptions?.waterDensityKgL ?? 1.03
  return ((cleaned - surface) * 100000) / (density * 1000 * 9.80665)
}

/**
 * Hypoxic ceiling: the shallowest depth (m) at which a mix still delivers a
 * breathable PPO2. Returns 0 for any normoxic mix.
 *
 * @param floorPPO2 - Minimum acceptable PPO2 in bar (default 0.16).
 */
export function hypoxicCeilingRaw(
  mix: GasFractions,
  floorPPO2: number = 0.16,
  pressureOptions?: PressureModelOptions
): number {
  assertValidGas(mix)
  if (mix.o2 <= 0) return Infinity
  return modRaw(mix, floorPPO2, pressureOptions)
}

/**
 * Equivalent Narcotic Depth in metres — unrounded.
 *
 * The narcotic partial pressure of the mix at depth is compared to the narcotic
 * partial pressure of air, and the depth at which air would produce the same
 * narcotic load is reported.
 *
 * @param mix - Gas composition as fractions.
 * @param depthMeters - Actual depth in metres.
 * @param includeOxygenNarcosis - When true, oxygen is treated as narcotic
 *   alongside nitrogen (NOAA/DCIEM model). When false (default), only nitrogen
 *   is narcotic (IANTD/GUE standard).
 */
export function endRaw(
  mix: GasFractions,
  depthMeters: number,
  includeOxygenNarcosis: boolean = false,
  pressureOptions?: PressureModelOptions
): number {
  assertValidGas(mix)
  const absolute = ambientPressure(depthMeters, pressureOptions)

  const narcoticFraction = includeOxygenNarcosis ? mix.n2 + mix.o2 : mix.n2
  const airNarcoticFraction = includeOxygenNarcosis
    ? AIR_N2_FRACTION + AIR_O2_FRACTION // 1.0 — all of air is narcotic under this model
    : AIR_N2_FRACTION

  const equivalentPressure = (narcoticFraction / airNarcoticFraction) * absolute

  const simple = pressureOptions?.simple ?? true
  if (simple) {
    return Math.max(0, (equivalentPressure - 1) * 10)
  }
  const surface = pressureOptions?.surfacePressureBar ?? 1.01325
  if (equivalentPressure <= surface) return 0
  const density = pressureOptions?.waterDensityKgL ?? 1.03
  return ((equivalentPressure - surface) * 100000) / (density * 1000 * 9.80665)
}

/** Formats a mix as the conventional technical-diving label ("18/45", "EAN32", "Air"). */
export function formatMix(mix: GasFractions): string {
  const o2 = Math.round(mix.o2 * 100)
  const he = Math.round(mix.he * 100)
  if (he > 0) return `${o2}/${he}`
  if (o2 === 21) return 'Air'
  if (o2 === 100) return 'O₂'
  return `EAN${o2}`
}

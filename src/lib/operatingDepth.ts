/**
 * The depth a gas may actually be dived to.
 *
 * WHY THIS MODULE EXISTS
 * ---------------------
 * "MOD" in common usage means the oxygen limit alone: the depth at which
 * FO2 · P_ambient reaches the target PPO2. Every page in this app reported
 * that number as *the* operating depth and relegated narcosis and density to
 * advisory cards computed *at* that depth.
 *
 * That inverts the safety logic. Air on a 1.30 bar CCR setpoint gives an
 * oxygen MOD of 51.9 m; the same air at 51 m carries an END of 51 m against a
 * 30 m limit and a density of 7.2 g/L against a 5.7 g/L limit. The tool
 * displayed "MOD 51 m", flagged two breaches in side cards, and left the
 * headline number contradicting them. No agency would call 51 m the operating
 * depth of air — narcosis binds it to 30 m, and density binds it shallower
 * still.
 *
 * `operatingDepth` resolves all three constraints and reports which one binds,
 * so a caller cannot accidentally show the oxygen limit alone.
 *
 * SOURCES
 * -------
 * - Oxygen: NOAA Diving Manual (6th ed.) Ch. 3 — PPO2 exposure limits; 1.6 bar
 *   is the absolute ceiling, 1.4 bar the conventional working limit.
 * - Narcosis: IANTD / GUE standard END of 30 m for a working gas. Nitrogen is
 *   treated as the sole narcotic agent by default; the NOAA/DCIEM variant that
 *   counts oxygen as equally narcotic is selectable via `oxygenNarcosisModel`.
 * - Density: Anthony & Mitchell (2016), "Respiratory physiology of rebreather
 *   diving", adopted by GUE/UTD — 5.7 g/L recommended working maximum, 6.2 g/L
 *   the hard ceiling above which CO2 retention risk climbs steeply.
 */

import {
  AIR_N2_FRACTION,
  AIR_O2_FRACTION,
  densityAtDepth,
  hypoxicCeilingRaw,
  modRaw,
  type GasFractions,
} from './gas'
import { ambientPressure, type PressureModelOptions } from './pressure'
import { NORMOXIC_MIN_O2_PERCENT, type SafetyLimits } from './limits'
import { roundDensity, roundEND, roundMOD } from './rounding'

/** Which constraint sets the operating depth. */
export type LimitingFactor = 'oxygen' | 'narcosis' | 'density'

export interface OperatingDepthResult {
  /**
   * The depth the gas may be dived to (m) — the shallowest of the three
   * limits. This is the number a diver should be shown.
   */
  depthMeters: number
  /** Which constraint produced `depthMeters`. */
  limitedBy: LimitingFactor
  /** Depth (m) at which the oxygen limit alone would be reached. */
  oxygenDepthMeters: number
  /** Depth (m) at which END reaches `maxEND`. Infinity if never (e.g. heliox). */
  narcosisDepthMeters: number
  /** Depth (m) at which density reaches `maxGasDensity`. */
  densityDepthMeters: number
  /**
   * Shallowest breathable depth (m) — the hypoxic ceiling. Greater than zero
   * only for hypoxic mixes, which cannot be breathed at the surface.
   */
  ceilingMeters: number
  /**
   * True when the gas has no usable window at all: its ceiling is deeper than
   * the depth its own limits permit. A hypoxic bottom mix too dense to reach
   * the depth that makes it breathable.
   */
  unusable: boolean
}

/**
 * Depth (m) at which this mix's END reaches `maxEND`.
 *
 * Derived algebraically rather than by sampling `endRaw`. An earlier version
 * probed END at 10 m and scaled the result, which silently failed for exactly
 * the mixes that matter: `endRaw` floors at zero, and a helium-rich mix like
 * 18/45 is *less* narcotic than surface air at 10 m. The probe read 0, the
 * ratio collapsed, and the function reported "never narcosis-limited" for a
 * standard 60 m trimix.
 *
 * The relation is exact, so no sampling is needed:
 *
 *   END_absolute = (narcotic_fraction / air_narcotic_fraction) · P_ambient
 *
 * Setting END_absolute to the pressure at `maxEND` and solving for P_ambient
 * gives the depth directly. A mix with no narcotic fraction (heliox, pure O2
 * under the N2-only model) is never narcosis-limited and returns Infinity.
 */
export function narcosisDepthFor(
  mix: GasFractions,
  maxEND: number,
  oxygenNarcosisModel: boolean = false,
  pressureOptions?: PressureModelOptions
): number {
  const narcoticFraction = oxygenNarcosisModel ? mix.n2 + mix.o2 : mix.n2
  if (narcoticFraction <= 0) return Infinity

  const airNarcoticFraction = oxygenNarcosisModel
    ? AIR_N2_FRACTION + AIR_O2_FRACTION
    : AIR_N2_FRACTION

  const targetAbsolute =
    (pressureAt(maxEND, pressureOptions) * airNarcoticFraction) / narcoticFraction
  return depthAt(targetAbsolute, pressureOptions)
}

/**
 * Depth (m) at which this mix reaches `maxDensity` g/L.
 *
 * Density is proportional to absolute pressure at fixed temperature, so this
 * also inverts by ratio rather than searching.
 */
export function densityDepthFor(
  mix: GasFractions,
  maxDensity: number,
  temperatureC: number,
  pressureOptions?: PressureModelOptions
): number {
  // Density is strictly proportional to absolute pressure at fixed
  // temperature, and unlike END it is never floored at zero, so a single
  // probe scales exactly. 10 m keeps the divisor comfortably non-zero.
  const probeDepth = 10
  const rhoAtProbe = densityAtDepth(mix, probeDepth, temperatureC, pressureOptions)
  if (rhoAtProbe <= 0) return Infinity

  const probeAbsolute = pressureAt(probeDepth, pressureOptions)
  const targetAbsolute = (maxDensity / rhoAtProbe) * probeAbsolute
  return depthAt(targetAbsolute, pressureOptions)
}

/**
 * Absolute pressure (bar) at a depth. Delegates to the shared model so this
 * module cannot drift from the rest of the library.
 */
function pressureAt(depthMeters: number, options?: PressureModelOptions): number {
  return ambientPressure(depthMeters, options)
}

/** Inverse of `pressureAt`, mirroring the same two models. */
function depthAt(absoluteBar: number, options?: PressureModelOptions): number {
  const simple = options?.simple ?? true
  if (simple) return Math.max(0, (absoluteBar - 1) * 10)
  const surface = options?.surfacePressureBar ?? 1.01325
  if (absoluteBar <= surface) return 0
  const density = options?.waterDensityKgL ?? 1.03
  return ((absoluteBar - surface) * 100000) / (density * 1000 * 9.80665)
}

export interface OperatingDepthOptions {
  /** PPO2 ceiling (bar) to apply — the caller picks work/deco/CCR. */
  ceilingPPO2: number
  /** Water temperature for the density calculation. Defaults to 20 °C. */
  temperatureC?: number
  /**
   * Use the critical density ceiling (6.2 g/L) rather than the recommended
   * working one (5.7 g/L). Off by default: the working limit is the one a plan
   * should be built against.
   */
  useCriticalDensity?: boolean
  pressureOptions?: PressureModelOptions
}

/**
 * Resolves the oxygen, narcosis and density limits into the single depth a gas
 * may be dived to, and reports which one binds.
 *
 * Every returned depth is rounded DOWN to the metre (`roundMOD`), because a
 * rounding error toward deeper is a rounding error toward harm.
 *
 * @example
 * // Air on a 1.30 bar CCR setpoint: oxygen says 51 m, narcosis says 30 m.
 * operatingDepth(AIR, limits, { ceilingPPO2: 1.30 })
 * // => { depthMeters: 30, limitedBy: 'narcosis', oxygenDepthMeters: 51, ... }
 */
export function operatingDepth(
  mix: GasFractions,
  limits: SafetyLimits,
  options: OperatingDepthOptions
): OperatingDepthResult {
  const { ceilingPPO2, temperatureC = 20, useCriticalDensity = false, pressureOptions } = options

  const oxygenRaw = mix.o2 > 0 ? modRaw(mix, ceilingPPO2, pressureOptions) : Infinity
  const narcosisRaw = narcosisDepthFor(
    mix,
    limits.maxEND,
    limits.oxygenNarcosisModel,
    pressureOptions
  )
  const maxDensity = useCriticalDensity ? limits.maxGasDensityCritical : limits.maxGasDensity
  const densityRaw = densityDepthFor(mix, maxDensity, temperatureC, pressureOptions)

  const oxygenDepthMeters = Number.isFinite(oxygenRaw) ? Math.max(0, roundMOD(oxygenRaw)) : Infinity
  const narcosisDepthMeters = Number.isFinite(narcosisRaw)
    ? Math.max(0, roundMOD(narcosisRaw))
    : Infinity
  const densityDepthMeters = Number.isFinite(densityRaw)
    ? Math.max(0, roundMOD(densityRaw))
    : Infinity

  // Ties go to the more conservative-sounding cause in this order, so a gas
  // that is simultaneously at its oxygen and narcosis limit is reported as
  // narcosis-limited — the one a diver is more likely to have overlooked.
  let depthMeters = oxygenDepthMeters
  let limitedBy: LimitingFactor = 'oxygen'
  if (narcosisDepthMeters <= depthMeters) {
    depthMeters = narcosisDepthMeters
    limitedBy = 'narcosis'
  }
  if (densityDepthMeters <= depthMeters) {
    depthMeters = densityDepthMeters
    limitedBy = 'density'
  }

  // The shallowest depth this gas may be breathed, against the *normoxic*
  // floor rather than the loss-of-consciousness one. 0.16 bar answers "would
  // this knock a diver out"; the question here is "may this be breathed from
  // the surface", and the agencies draw that line at 18% O2 — which at sea
  // level is 0.18 bar. Using the LOC figure reported 16% oxygen as breathable
  // at the surface with no ceiling at all.
  const ceilingRaw =
    mix.o2 > 0
      ? hypoxicCeilingRaw(mix, NORMOXIC_MIN_O2_PERCENT / 100, pressureOptions)
      : Infinity
  const ceilingMeters = Number.isFinite(ceilingRaw) ? Math.max(0, roundEND(ceilingRaw)) : Infinity

  return {
    depthMeters: Number.isFinite(depthMeters) ? depthMeters : 0,
    limitedBy,
    oxygenDepthMeters,
    narcosisDepthMeters,
    densityDepthMeters,
    ceilingMeters,
    unusable: ceilingMeters > depthMeters,
  }
}

/**
 * Density (g/L) a mix reaches at a given depth, rounded for display.
 * Thin wrapper so callers checking a limit do not each re-derive the rounding.
 */
export function densityAt(
  mix: GasFractions,
  depthMeters: number,
  temperatureC: number = 20,
  pressureOptions?: PressureModelOptions
): number {
  return roundDensity(densityAtDepth(mix, depthMeters, temperatureC, pressureOptions))
}

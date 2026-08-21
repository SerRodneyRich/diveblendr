/**
 * Gas consumption: SAC, RMV, turn pressure and bottom-time planning.
 *
 * F13 — this math lived inside `SacCalculator.tsx` and `BottomTimeCalculator.tsx`.
 * It is extracted here unchanged in intent (the audit confirmed the core
 * formulae are sound) so it is testable and so Phase 2's gas logistics can
 * consume it.
 *
 * Two rates are distinguished throughout, because conflating them is the most
 * common error in gas planning:
 *
 * - **SAC** (Surface Air Consumption), here in **bar/min**: how fast tank
 *   *pressure* falls, normalised to the surface. It is tank-specific — the same
 *   diver empties a 15 L cylinder more slowly in bar/min than an 11 L one.
 * - **RMV** (Respiratory Minute Volume), in **L/min**: how much gas *volume*
 *   the diver actually breathes per minute at the surface. It is a property of
 *   the diver, independent of the cylinder, and is what should be carried
 *   between dives and between tanks.
 *
 * Units are metric throughout: pressure bar, volume litres, depth metres.
 *
 * Accuracy note carried from the audit: treating tank contents as
 * pressure × water volume is an ideal-gas approximation. At the 232–300 bar
 * fills common on steel cylinders, air is *less* compressible than ideal
 * (Z > 1), so the true stored volume is several percent below this figure —
 * about 1% at 232 bar and 8% at 300 bar. The computed figure therefore
 * overstates available gas, which is the non-conservative direction, and plans
 * built on it are slightly optimistic. Surface this in UI copy for
 * high-pressure steel fills, and prefer the real-gas path for gas logistics.
 */

import { ambientPressure, type PressureModelOptions } from './pressure'

/** Inputs for a SAC/RMV calculation from a logged dive. */
export interface SACInput {
  /** Tank pressure at the start of the dive, bar. */
  startPressureBar: number
  /** Tank pressure at the end of the dive, bar. */
  endPressureBar: number
  /** Average depth over the dive, metres. */
  averageDepthMeters: number
  /** Dive duration, minutes. */
  durationMinutes: number
  /** Cylinder water volume, litres. */
  tankVolumeL: number
}

export interface SACResult {
  /** Surface Air Consumption in bar/min — tank-specific. */
  sacBarPerMin: number
  /** Respiratory Minute Volume in L/min — diver-specific, tank-independent. */
  rmvLitersPerMin: number
  /** Ambient pressure at the average depth, bar. */
  ataAtAverageDepth: number
  /** Total gas breathed, in surface-equivalent litres. */
  gasUsedLiters: number
}

/**
 * Computes SAC and RMV from a logged dive.
 *
 *   SAC [bar/min] = ΔP / (ATA × t)
 *   RMV [L/min]   = ΔP × V / (t × ATA)
 *
 * @throws if the dive did not consume gas, had no duration, or the tank volume
 *   is not positive — all of which would otherwise divide by zero.
 */
export function calculateSAC(input: SACInput, pressureOptions?: PressureModelOptions): SACResult {
  const { startPressureBar, endPressureBar, averageDepthMeters, durationMinutes, tankVolumeL } = input

  for (const [name, value] of Object.entries(input)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number (got ${value})`)
    }
  }
  if (durationMinutes <= 0) {
    throw new Error(`Dive duration must be positive (got ${durationMinutes} min)`)
  }
  if (tankVolumeL <= 0) {
    throw new Error(`Tank volume must be positive (got ${tankVolumeL} L)`)
  }
  if (averageDepthMeters < 0) {
    throw new Error(`Average depth cannot be negative (got ${averageDepthMeters} m)`)
  }

  const pressureUsed = startPressureBar - endPressureBar
  if (pressureUsed <= 0) {
    throw new Error(
      `Start pressure must exceed end pressure (got ${startPressureBar} → ${endPressureBar} bar)`
    )
  }

  const ata = ambientPressure(averageDepthMeters, pressureOptions)
  const gasUsedLiters = pressureUsed * tankVolumeL

  return {
    sacBarPerMin: pressureUsed / (ata * durationMinutes),
    rmvLitersPerMin: gasUsedLiters / (durationMinutes * ata),
    ataAtAverageDepth: ata,
    gasUsedLiters,
  }
}

/** Converts a diver's RMV to the SAC they would show on a given cylinder. */
export function rmvToSac(rmvLitersPerMin: number, tankVolumeL: number): number {
  if (tankVolumeL <= 0) throw new Error(`Tank volume must be positive (got ${tankVolumeL} L)`)
  return rmvLitersPerMin / tankVolumeL
}

/** Converts a SAC measured on a given cylinder to the diver's tank-independent RMV. */
export function sacToRmv(sacBarPerMin: number, tankVolumeL: number): number {
  if (tankVolumeL <= 0) throw new Error(`Tank volume must be positive (got ${tankVolumeL} L)`)
  return sacBarPerMin * tankVolumeL
}

/**
 * Gas consumed, in surface-equivalent litres, breathing at `rmv` for `minutes`
 * at a constant depth.
 */
export function gasConsumedAtDepth(
  rmvLitersPerMin: number,
  depthMeters: number,
  minutes: number,
  pressureOptions?: PressureModelOptions
): number {
  if (rmvLitersPerMin < 0) throw new Error('RMV cannot be negative')
  if (minutes < 0) throw new Error('Duration cannot be negative')
  return rmvLitersPerMin * ambientPressure(depthMeters, pressureOptions) * minutes
}

/**
 * Gas consumed traversing between two depths at a constant rate.
 *
 * Because ambient pressure is linear in depth under both pressure models, the
 * mean pressure over the traverse is the pressure at the mean depth, so the
 * integral reduces to breathing at the midpoint depth for the whole traverse.
 *
 * This is the fix for a defect found during extraction: `BottomTimeCalculator`
 * charged the entire descent and ascent at the consumption rate for the
 * *maximum* depth, which roughly doubles the true travel gas. That error is
 * conservative in direction but large enough to distort a plan.
 */
export function gasConsumedInTransit(
  rmvLitersPerMin: number,
  startDepthMeters: number,
  endDepthMeters: number,
  minutes: number,
  pressureOptions?: PressureModelOptions
): number {
  const meanDepth = (startDepthMeters + endDepthMeters) / 2
  return gasConsumedAtDepth(rmvLitersPerMin, meanDepth, minutes, pressureOptions)
}

/** How much of a cylinder may be used before turning the dive. */
export type GasPlanningRule = 'thirds' | 'halves' | 'all-usable'

/**
 * The usable fraction of a fill for a given planning rule.
 *
 * - `thirds` — overhead/cave standard: one third out, one third back, one third
 *   in reserve. Usable fraction is 1/3.
 * - `halves` — open water with a required return to the entry point: half out,
 *   half back. Usable 1/2.
 * - `all-usable` — open water with a direct ascent available; two thirds usable,
 *   one third held as reserve.
 */
export function usableFraction(rule: GasPlanningRule): number {
  switch (rule) {
    case 'thirds':
      return 1 / 3
    case 'halves':
      return 1 / 2
    case 'all-usable':
    default:
      return 2 / 3
  }
}

/**
 * The pressure at which the dive must be turned.
 *
 *   turnPressure = start − start × usableFraction = start × (1 − usableFraction)
 *
 * @param startPressureBar - Pressure at the start of the dive, bar.
 * @param rule - The gas planning rule in force.
 */
export function turnPressure(startPressureBar: number, rule: GasPlanningRule): number {
  if (!Number.isFinite(startPressureBar) || startPressureBar < 0) {
    throw new Error(`Start pressure must be a finite non-negative number (got ${startPressureBar})`)
  }
  return startPressureBar * (1 - usableFraction(rule))
}

export interface BottomTimeInput {
  /** Maximum planned depth, metres. */
  maxDepthMeters: number
  /** Diver's surface consumption, L/min. */
  rmvLitersPerMin: number
  /** Cylinder water volume, litres. */
  tankVolumeL: number
  /** Starting fill pressure, bar. */
  startPressureBar: number
  /** Gas planning rule. */
  rule: GasPlanningRule
  /** Descent rate, m/min. Defaults to 20 m/min. */
  descentRateMPerMin?: number
  /** Ascent rate, m/min. Defaults to 9 m/min (conservative modern practice). */
  ascentRateMPerMin?: number
}

export interface BottomTimeResult {
  /** Minutes available at the maximum depth after travel gas is deducted. */
  bottomTimeMinutes: number
  descentTimeMinutes: number
  ascentTimeMinutes: number
  totalRuntimeMinutes: number
  /** Surface-equivalent litres available under the planning rule. */
  usableGasLiters: number
  /** Surface-equivalent litres spent on descent and ascent. */
  transitGasLiters: number
  /** Pressure at which to turn the dive, bar. */
  turnPressureBar: number
  /** Consumption rate at the maximum depth, L/min. */
  consumptionAtDepthLitersPerMin: number
}

/**
 * Plans available bottom time from a gas supply.
 *
 * Transit gas is charged at the mean transit depth rather than at maximum
 * depth — see {@link gasConsumedInTransit}.
 */
export function planBottomTime(
  input: BottomTimeInput,
  pressureOptions?: PressureModelOptions
): BottomTimeResult {
  const {
    maxDepthMeters,
    rmvLitersPerMin,
    tankVolumeL,
    startPressureBar,
    rule,
    descentRateMPerMin = 20,
    ascentRateMPerMin = 9,
  } = input

  if (!Number.isFinite(maxDepthMeters) || maxDepthMeters < 0) {
    throw new Error(`Max depth must be a finite non-negative number (got ${maxDepthMeters})`)
  }
  if (!Number.isFinite(rmvLitersPerMin) || rmvLitersPerMin <= 0) {
    throw new Error(`RMV must be positive (got ${rmvLitersPerMin} L/min)`)
  }
  if (!Number.isFinite(tankVolumeL) || tankVolumeL <= 0) {
    throw new Error(`Tank volume must be positive (got ${tankVolumeL} L)`)
  }
  if (!Number.isFinite(startPressureBar) || startPressureBar <= 0) {
    throw new Error(`Start pressure must be positive (got ${startPressureBar} bar)`)
  }
  if (descentRateMPerMin <= 0 || ascentRateMPerMin <= 0) {
    throw new Error('Descent and ascent rates must be positive')
  }

  const descentTimeMinutes = maxDepthMeters / descentRateMPerMin
  const ascentTimeMinutes = maxDepthMeters / ascentRateMPerMin

  const totalGasLiters = startPressureBar * tankVolumeL
  const usableGasLiters = totalGasLiters * usableFraction(rule)

  const descentGas = gasConsumedInTransit(rmvLitersPerMin, 0, maxDepthMeters, descentTimeMinutes, pressureOptions)
  const ascentGas = gasConsumedInTransit(rmvLitersPerMin, maxDepthMeters, 0, ascentTimeMinutes, pressureOptions)
  const transitGasLiters = descentGas + ascentGas

  const consumptionAtDepthLitersPerMin =
    rmvLitersPerMin * ambientPressure(maxDepthMeters, pressureOptions)

  const gasForBottom = Math.max(0, usableGasLiters - transitGasLiters)
  const bottomTimeMinutes =
    consumptionAtDepthLitersPerMin > 0 ? gasForBottom / consumptionAtDepthLitersPerMin : 0

  return {
    bottomTimeMinutes,
    descentTimeMinutes,
    ascentTimeMinutes,
    totalRuntimeMinutes: descentTimeMinutes + bottomTimeMinutes + ascentTimeMinutes,
    usableGasLiters,
    transitGasLiters,
    turnPressureBar: turnPressure(startPressureBar, rule),
    consumptionAtDepthLitersPerMin,
  }
}

/**
 * Minimum gas ("rock bottom"): the volume two divers need to ascend together
 * from depth on a shared supply, including a stop to sort the problem out.
 *
 * This is the standard formulation taught by GUE/UTD and is what Phase 2's gas
 * logistics will consume.
 *
 * @param maxDepthMeters - Depth the emergency starts at.
 * @param rmvLitersPerMin - Single diver's surface consumption.
 * @param stressMultiplier - Factor applied to RMV for both divers under stress.
 *   Defaults to 2, the conventional value.
 * @param problemSolvingMinutes - Time spent at depth resolving the problem
 *   before ascending. Defaults to 1 minute.
 * @param ascentRateMPerMin - Ascent rate during the emergency. Defaults to 9.
 */
export function minimumGasLiters(
  maxDepthMeters: number,
  rmvLitersPerMin: number,
  stressMultiplier: number = 2,
  problemSolvingMinutes: number = 1,
  ascentRateMPerMin: number = 9,
  pressureOptions?: PressureModelOptions
): number {
  if (maxDepthMeters < 0) throw new Error('Depth cannot be negative')
  if (rmvLitersPerMin <= 0) throw new Error('RMV must be positive')
  if (stressMultiplier <= 0) throw new Error('Stress multiplier must be positive')
  if (ascentRateMPerMin <= 0) throw new Error('Ascent rate must be positive')

  const { total } = minimumGasBreakdown(
    maxDepthMeters,
    rmvLitersPerMin,
    stressMultiplier,
    problemSolvingMinutes,
    ascentRateMPerMin,
    pressureOptions
  )
  return total
}

/** The two phases minimum gas is built from, for a derivation to show. */
export interface MinimumGasBreakdown {
  /** Gas breathed solving the problem at depth, surface-equivalent litres. */
  atDepth: number
  /** Gas breathed during the ascent itself, surface-equivalent litres. */
  duringAscent: number
  total: number
  /** Combined stressed rate for both divers, L/min at the surface. */
  sharedRmv: number
  ascentMinutes: number
}

/**
 * Minimum gas, split into the phases it is computed from.
 *
 * Exposed so a derivation can show the two charges separately rather than
 * re-deriving them beside the function — which is how a shown working and the
 * number it claims to explain come to disagree.
 */
export function minimumGasBreakdown(
  maxDepthMeters: number,
  rmvLitersPerMin: number,
  stressMultiplier: number = 2,
  problemSolvingMinutes: number = 1,
  ascentRateMPerMin: number = 9,
  pressureOptions?: PressureModelOptions
): MinimumGasBreakdown {
  // Two divers, both breathing at the stressed rate.
  const sharedRmv = rmvLitersPerMin * stressMultiplier * 2

  const atDepth = gasConsumedAtDepth(sharedRmv, maxDepthMeters, problemSolvingMinutes, pressureOptions)
  const ascentMinutes = maxDepthMeters / ascentRateMPerMin
  const duringAscent = gasConsumedInTransit(sharedRmv, maxDepthMeters, 0, ascentMinutes, pressureOptions)

  return { atDepth, duringAscent, total: atDepth + duringAscent, sharedRmv, ascentMinutes }
}

/** Converts a surface-equivalent gas volume to the pressure it occupies in a cylinder. */
export function litersToBar(liters: number, tankVolumeL: number): number {
  if (tankVolumeL <= 0) throw new Error(`Tank volume must be positive (got ${tankVolumeL} L)`)
  return liters / tankVolumeL
}

/** Converts a cylinder pressure to the surface-equivalent gas volume it holds. */
export function barToLiters(bar: number, tankVolumeL: number): number {
  if (tankVolumeL <= 0) throw new Error(`Tank volume must be positive (got ${tankVolumeL} L)`)
  return bar * tankVolumeL
}

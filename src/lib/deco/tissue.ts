/**
 * Tissue compartment loading — the Schreiner equation.
 *
 * Ported from DecoTengu (GPL-3.0) — decotengu/model.py
 * (`ZH_L16_GF.init`, `_tissue_loader`, `_tissue_loaders`, `load`).
 * Copyright original authors (Artur Wroblewski); TypeScript port for DiveBlendr.
 *
 * THE EQUATION
 * ------------
 * Every segment of a dive is either a constant depth or a constant-rate ramp,
 * so one analytic expression covers all of them — the Schreiner equation:
 *
 *     P(t) = P_alv + R·(t − 1/k) − (P_alv − P_i − R/k)·e^(−k·t)
 *
 *   P_i    initial tension in the compartment, bar
 *   P_alv  inspired inert gas pressure at the START of the segment,
 *          P_alv = F_gas · (P_abs − P_H2O)
 *   R      rate of change of inspired inert pressure, bar/min
 *          (F_gas · depth-rate-in-bar/min; zero at constant depth,
 *          positive descending, negative ascending)
 *   k      ln(2) / half-time, 1/min
 *   t      exposure time, minutes
 *
 * With R = 0 the ramp terms vanish and it reduces to the Haldane
 * (instantaneous-exposure) equation, so constant-depth segments need no
 * special case — they are the R = 0 instance of the same code path.
 *
 * Why analytic rather than stepwise: numerically integrating a descent in
 * one-second slices accumulates error and makes results depend on the step
 * size. The analytic form is exact for the linear ramp and independent of how
 * the profile happens to be chopped into segments. `tissue.test.ts` asserts
 * agreement with a 1-second Euler integration to well under 0.1% over a
 * 30-minute descent-and-hold, which guards this implementation against a sign
 * or algebra slip.
 */

import type { GasFractions } from '../gas'
import type { TissueState } from './types'
import {
  COMPARTMENT_COUNT,
  SCHEMA_VERSION,
} from './types'
import {
  HE_K,
  N2_K,
  START_HE_PRESSURE,
  START_N2_FRACTION,
  WATER_VAPOUR_PRESSURE_BAR,
} from './constants'

/**
 * The inert gas tensions a diver is saturated to after living at a given
 * surface pressure — the starting state of any first dive.
 *
 * DecoTengu `ZH_L16_GF.init`: p_n2 = START_P_N2 · (P_surface − P_H2O).
 * Altitude enters here: a lower surface pressure means lower starting
 * saturation, which is why an unacclimatised altitude dive is *not* simply a
 * sea-level dive with shifted pressures.
 */
export function initialTissueState(surfacePressureBar: number): TissueState {
  if (!Number.isFinite(surfacePressureBar) || surfacePressureBar <= 0) {
    throw new Error(`Surface pressure must be positive (got ${surfacePressureBar} bar)`)
  }
  if (surfacePressureBar <= WATER_VAPOUR_PRESSURE_BAR) {
    throw new Error(
      `Surface pressure ${surfacePressureBar} bar is at or below the alveolar water ` +
        `vapour pressure (${WATER_VAPOUR_PRESSURE_BAR} bar); no inert gas would be inspired`
    )
  }
  const pN2 = START_N2_FRACTION * (surfacePressureBar - WATER_VAPOUR_PRESSURE_BAR)
  return {
    schemaVersion: SCHEMA_VERSION,
    n2: new Array<number>(COMPARTMENT_COUNT).fill(pN2),
    he: new Array<number>(COMPARTMENT_COUNT).fill(START_HE_PRESSURE),
  }
}

/**
 * Inspired partial pressure of one inert gas at an ambient pressure.
 *
 *     P_alv = F_gas · (P_abs − P_H2O)
 *
 * The water vapour subtraction is what makes the lungs' inert pressure lower
 * than a naive `fraction × ambient`, and omitting it is a classic error that
 * makes every schedule slightly too aggressive.
 */
export function inspiredPressure(fraction: number, ambientPressureBar: number): number {
  return fraction * Math.max(0, ambientPressureBar - WATER_VAPOUR_PRESSURE_BAR)
}

/**
 * The Schreiner equation for a single compartment.
 *
 * Exported so the tests can exercise it directly against both the DecoTengu
 * worked example and a numeric integration.
 *
 * @param pAlv - Inspired inert pressure at the start of the segment, bar.
 * @param rate - Rate of change of inspired inert pressure, bar/min.
 * @param k - Compartment decay constant, 1/min.
 * @param pInitial - Tension at the start of the segment, bar.
 * @param minutes - Segment duration, minutes.
 */
export function schreiner(
  pAlv: number,
  rate: number,
  k: number,
  pInitial: number,
  minutes: number
): number {
  return (
    pAlv + rate * (minutes - 1 / k) - (pAlv - pInitial - rate / k) * Math.exp(-k * minutes)
  )
}

/** How a segment changes the inspired inert pressures. */
export interface LoadingSegment {
  /** Ambient pressure at the START of the segment, bar. */
  readonly startPressureBar: number
  /** Duration, minutes. Must be ≥ 0. */
  readonly minutes: number
  /**
   * Rate of change of AMBIENT pressure, bar/min. Zero at constant depth,
   * positive descending, negative ascending.
   */
  readonly pressureRate: number
  /** Inspired nitrogen fraction. */
  readonly fN2: number
  /** Inspired helium fraction. */
  readonly fHe: number
}

/**
 * Advances every compartment through one segment.
 *
 * Pure: returns a new state, never mutates the input.
 *
 * Fractions are passed rather than a `GasFractions` because CCR needs to
 * supply *effective* inert fractions derived from the setpoint, which do not
 * correspond to any real gas in the diver's cylinders.
 */
export function loadTissues(state: TissueState, segment: LoadingSegment): TissueState {
  const { startPressureBar, minutes, pressureRate, fN2, fHe } = segment

  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error(`Segment duration must be finite and non-negative (got ${minutes} min)`)
  }
  if (minutes === 0) return state
  if (!Number.isFinite(startPressureBar) || startPressureBar <= 0) {
    throw new Error(`Segment pressure must be positive (got ${startPressureBar} bar)`)
  }

  // P_alv is evaluated at the segment start; the ramp term R carries it forward.
  const pAlvN2 = inspiredPressure(fN2, startPressureBar)
  const pAlvHe = inspiredPressure(fHe, startPressureBar)
  const rN2 = fN2 * pressureRate
  const rHe = fHe * pressureRate

  const n2 = new Array<number>(COMPARTMENT_COUNT)
  const he = new Array<number>(COMPARTMENT_COUNT)

  for (let i = 0; i < COMPARTMENT_COUNT; i++) {
    // Tensions cannot go negative; clamping guards against a pathological
    // ramp (e.g. an ascent so fast it would drive inspired pressure below
    // zero) producing a nonsensical state rather than an error downstream.
    n2[i] = Math.max(0, schreiner(pAlvN2, rN2, N2_K[i], state.n2[i], minutes))
    he[i] = Math.max(0, schreiner(pAlvHe, rHe, HE_K[i], state.he[i], minutes))
  }

  return { schemaVersion: SCHEMA_VERSION, n2, he }
}

/**
 * Convenience wrapper loading tissues on a real breathing gas.
 * CCR callers use {@link loadTissues} directly with setpoint-derived fractions.
 */
export function loadTissuesOnGas(
  state: TissueState,
  mix: GasFractions,
  startPressureBar: number,
  minutes: number,
  pressureRate: number
): TissueState {
  return loadTissues(state, {
    startPressureBar,
    minutes,
    pressureRate,
    fN2: mix.n2,
    fHe: mix.he,
  })
}

/** Total inert gas tension in a compartment, bar. */
export function totalTension(state: TissueState, compartment: number): number {
  return state.n2[compartment] + state.he[compartment]
}

/** Deep-copies a tissue state into a plain, freshly-allocated object. */
export function cloneTissueState(state: TissueState): TissueState {
  return {
    schemaVersion: SCHEMA_VERSION,
    n2: [...state.n2],
    he: [...state.he],
  }
}

/**
 * Validates a tissue state that came from persistence or an untrusted caller.
 * @throws with a specific reason when the state is unusable.
 */
export function assertValidTissueState(state: TissueState): void {
  if (!state || typeof state !== 'object') {
    throw new Error('Tissue state must be an object')
  }
  if (state.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported tissue state schemaVersion ${state.schemaVersion} (engine expects ${SCHEMA_VERSION})`
    )
  }
  if (!Array.isArray(state.n2) || state.n2.length !== COMPARTMENT_COUNT) {
    throw new Error(`Tissue state must carry ${COMPARTMENT_COUNT} nitrogen tensions`)
  }
  if (!Array.isArray(state.he) || state.he.length !== COMPARTMENT_COUNT) {
    throw new Error(`Tissue state must carry ${COMPARTMENT_COUNT} helium tensions`)
  }
  for (let i = 0; i < COMPARTMENT_COUNT; i++) {
    if (!Number.isFinite(state.n2[i]) || state.n2[i] < 0) {
      throw new Error(`Nitrogen tension in compartment ${i + 1} is invalid (${state.n2[i]})`)
    }
    if (!Number.isFinite(state.he[i]) || state.he[i] < 0) {
      throw new Error(`Helium tension in compartment ${i + 1} is invalid (${state.he[i]})`)
    }
  }
}

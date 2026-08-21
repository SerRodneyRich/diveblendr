/**
 * Bühlmann M-values, gradient factors, and ascent ceilings.
 *
 * Ported from DecoTengu (GPL-3.0) — decotengu/model.py
 * (`eq_gf_limit`, `ZH_L16_GF.gf_limit`, `ZH_L16_GF.ceiling_limit`).
 * Copyright original authors (Artur Wroblewski); TypeScript port for DiveBlendr.
 *
 * WHAT A CEILING IS
 * -----------------
 * A compartment holding inert gas at tension P can tolerate being brought up
 * to — but not above — some ambient pressure before it is supersaturated
 * enough to risk bubble formation. Bühlmann expresses that tolerated ambient
 * pressure with two per-compartment coefficients:
 *
 *     P_tolerated = (P − a) · b
 *
 * Equivalently, the M-value (the maximum tension tolerated *at* a given
 * ambient pressure) is
 *
 *     M(P_amb) = P_amb / b + a
 *
 * The ceiling for the diver as a whole is the DEEPEST of the 16 compartment
 * ceilings — the diver may only ascend as far as the most limiting tissue
 * allows.
 *
 * GRADIENT FACTORS (Erik Baker)
 * -----------------------------
 * A gradient factor scales how much of the permitted supersaturation gradient
 * the diver actually uses. GF 1.0 ascends to the raw Bühlmann limit; GF 0.3
 * uses 30% of the gradient between ambient pressure and that limit, stopping
 * deeper. Baker's form, as DecoTengu implements it:
 *
 *     P_limit = (P − a·gf) / (gf/b + 1 − gf)
 *
 * Setting gf = 1 collapses this to (P − a)·b, the raw Bühlmann ceiling — a
 * property the tests assert, since it is the cleanest check that the GF
 * algebra is right.
 *
 * GF_low applies at the first (deepest) stop and GF_high at the surface, with
 * linear interpolation in between. That interpolation is what makes the last
 * stops longer and the deep stops shorter as GF_high rises.
 *
 * A NOTE ON BAKER vs DECOTENGU
 * ----------------------------
 * Baker's papers present the gradient factor as applied to the M-value line:
 *
 *     P_limit_baker = P_amb + gf · (M(P_amb) − P_amb)
 *
 * which is an implicit equation in P_amb (the ceiling appears on both sides)
 * and is solved iteratively or rearranged. DecoTengu's `eq_gf_limit` is that
 * rearrangement solved in closed form. The two are algebraically identical —
 * `buhlmann.test.ts` asserts this by taking DecoTengu's ceiling, evaluating
 * Baker's M-value relation at exactly that pressure, and confirming the
 * gradient used is `gf` to 10 decimal places. Per the spec, the
 * implementation follows DecoTengu (the tested artifact); the equivalence is
 * demonstrated rather than assumed.
 */

import type { TissueState, GradientFactors } from './types'
import { COMPARTMENT_COUNT } from './types'
import { N2_A, N2_B, HE_A, HE_B } from './constants'

/**
 * Combined a/b coefficients for a compartment holding both inert gases.
 *
 * The coefficients are weighted by each gas's share of the total tension
 * (DecoTengu `eq_gf_limit`, Baker's trimix extension):
 *
 *     a = (a_N2·P_N2 + a_He·P_He) / (P_N2 + P_He)
 *
 * When a compartment holds no inert gas at all the weighting is undefined; we
 * fall back to the nitrogen coefficients, which is the correct limit for a
 * diver who has never breathed helium and is harmless otherwise (a zero-
 * tension compartment imposes no ceiling regardless).
 */
export function combinedCoefficients(
  compartment: number,
  pN2: number,
  pHe: number
): { a: number; b: number; total: number } {
  const total = pN2 + pHe
  if (total <= 0) {
    return { a: N2_A[compartment], b: N2_B[compartment], total: 0 }
  }
  return {
    a: (N2_A[compartment] * pN2 + HE_A[compartment] * pHe) / total,
    b: (N2_B[compartment] * pN2 + HE_B[compartment] * pHe) / total,
    total,
  }
}

/**
 * The M-value: maximum inert tension (bar) tolerated at an ambient pressure.
 *
 *     M = P_amb / b + a
 *
 * Used for display ("show the math") and for the supersaturation percentages
 * dive computers report; the ceiling logic itself uses {@link gfLimit}.
 */
export function mValue(compartment: number, ambientPressureBar: number, pN2: number, pHe: number): number {
  const { a, b } = combinedCoefficients(compartment, pN2, pHe)
  return ambientPressureBar / b + a
}

/**
 * Tolerated ambient pressure (bar) for one compartment under a gradient factor.
 *
 * Direct port of DecoTengu `eq_gf_limit`:
 *
 *     P_limit = (P − a·gf) / (gf/b + 1 − gf)
 *
 * @param gf - Gradient factor as a fraction in (0, 1.5].
 * @returns Absolute pressure; may be below surface pressure, meaning the
 *   compartment imposes no constraint on surfacing.
 */
export function gfLimit(
  gf: number,
  compartment: number,
  pN2: number,
  pHe: number
): number {
  if (!Number.isFinite(gf) || gf <= 0 || gf > 1.5) {
    throw new Error(`Gradient factor must be in (0, 1.5] (got ${gf})`)
  }
  const { a, b, total } = combinedCoefficients(compartment, pN2, pHe)
  if (total <= 0) return 0
  return (total - a * gf) / (gf / b + 1 - gf)
}

/** Per-compartment tolerated ambient pressures under a gradient factor. */
export function gfLimits(state: TissueState, gf: number): number[] {
  const limits = new Array<number>(COMPARTMENT_COUNT)
  for (let i = 0; i < COMPARTMENT_COUNT; i++) {
    limits[i] = gfLimit(gf, i, state.n2[i], state.he[i])
  }
  return limits
}

/** A ceiling, with the compartment that produced it. */
export interface Ceiling {
  /** Tolerated ambient pressure, bar. The diver may not go shallower. */
  readonly pressureBar: number
  /** Zero-based index of the limiting (deepest-ceiling) compartment. */
  readonly compartment: number
}

/**
 * The diver's ascent ceiling: the deepest of the 16 compartment ceilings.
 *
 * DecoTengu `ceiling_limit` returns `max(gf_limit(...))` — maximum *pressure*
 * is the deepest ceiling, hence the most limiting compartment.
 */
export function ceiling(state: TissueState, gf: number): Ceiling {
  let best = -Infinity
  let compartment = 0
  for (let i = 0; i < COMPARTMENT_COUNT; i++) {
    const limit = gfLimit(gf, i, state.n2[i], state.he[i])
    if (limit > best) {
      best = limit
      compartment = i
    }
  }
  return { pressureBar: best, compartment }
}

/**
 * True when a diver at `ambientPressureBar` is not violating the ceiling.
 * DecoTengu `_inv_limit`: ambient must be at least the ceiling pressure.
 */
export function withinCeiling(state: TissueState, ambientPressureBar: number, gf: number): boolean {
  return ambientPressureBar >= ceiling(state, gf).pressureBar
}

/**
 * Supersaturation as a percentage of the permitted gradient at an ambient
 * pressure — the "GF99" or "surfacing GF" a dive computer displays.
 *
 * 0% means the compartment is at ambient (no gradient used); 100% means it
 * sits exactly on the raw Bühlmann M-value.
 */
export function supersaturationPercent(
  state: TissueState,
  ambientPressureBar: number,
  compartment: number
): number {
  const pN2 = state.n2[compartment]
  const pHe = state.he[compartment]
  const total = pN2 + pHe
  if (total <= 0) return 0
  const m = mValue(compartment, ambientPressureBar, pN2, pHe)
  const gradient = m - ambientPressureBar
  if (gradient <= 0) return total > ambientPressureBar ? Infinity : 0
  return ((total - ambientPressureBar) / gradient) * 100
}

/** The highest supersaturation across all compartments, and where it is. */
export function leadingSupersaturation(
  state: TissueState,
  ambientPressureBar: number
): { percent: number; compartment: number } {
  let percent = -Infinity
  let compartment = 0
  for (let i = 0; i < COMPARTMENT_COUNT; i++) {
    const value = supersaturationPercent(state, ambientPressureBar, i)
    if (value > percent) {
      percent = value
      compartment = i
    }
  }
  return { percent, compartment }
}

/**
 * Gradient factor interpolation between the first stop and the surface.
 *
 * GF_low applies at `firstStopPressureBar` and GF_high at the surface, linear
 * in pressure. Above the first stop (i.e. deeper) GF_low is held; at or above
 * the surface GF_high is held.
 *
 * DecoTengu performs this interpolation as an incremental `gf_step` added once
 * per 3 m stop (`_deco_stops`). Interpolating on pressure directly is the same
 * schedule when stops are evenly spaced, and additionally gives a continuous
 * `gfNow` at any depth — which the UI needs for its charts and which an
 * accumulating step cannot provide. The equivalence at stop depths is asserted
 * in the tests.
 */
export function interpolateGF(
  gf: GradientFactors,
  currentPressureBar: number,
  firstStopPressureBar: number,
  surfacePressureBar: number
): number {
  const { low, high } = gf

  // No decompression obligation, or already at/above the surface.
  if (firstStopPressureBar <= surfacePressureBar) return high
  if (currentPressureBar <= surfacePressureBar) return high
  // Deeper than the first stop: GF_low governs.
  if (currentPressureBar >= firstStopPressureBar) return low

  const span = firstStopPressureBar - surfacePressureBar
  const fromSurface = currentPressureBar - surfacePressureBar
  // fromSurface/span is 1 at the first stop and 0 at the surface.
  return high + (low - high) * (fromSurface / span)
}

/** Validates a gradient factor pair. */
export function assertValidGF(gf: GradientFactors): void {
  for (const [name, value] of [
    ['low', gf.low],
    ['high', gf.high],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0 || value > 1.5) {
      throw new Error(`Gradient factor ${name} must be in (0, 1.5] (got ${value})`)
    }
  }
  if (gf.low > gf.high) {
    throw new Error(
      `Gradient factor low (${gf.low}) cannot exceed high (${gf.high}); ` +
        'GF low governs the first stop and GF high the surface'
    )
  }
}

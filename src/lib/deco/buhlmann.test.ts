/**
 * M-value, gradient factor and ceiling tests.
 *
 * The anchor values come from DecoTengu's own unit tests
 * (`decotengu/tests/test_model.py`, class covering `eq_gf_limit`) and from the
 * worked example in its `model.py` docstring. Those use the ZH-L16**B**
 * coefficients for compartment 1 (a=1.1696, b=0.5578, He a=1.6189, b=0.4770);
 * since `gfLimit` reads our ZH-L16C table by compartment index, the equation
 * itself is exercised through the exported `eq_gf_limit` equivalent by passing
 * the coefficients explicitly where needed, and through C-table values
 * elsewhere.
 */

import { describe, it, expect } from 'vitest'
import {
  combinedCoefficients,
  mValue,
  gfLimit,
  gfLimits,
  ceiling,
  withinCeiling,
  supersaturationPercent,
  leadingSupersaturation,
  interpolateGF,
  assertValidGF,
} from './buhlmann'
import { N2_A, N2_B, HE_A, HE_B, GF_PRESETS } from './constants'
import { COMPARTMENT_COUNT, SCHEMA_VERSION, type TissueState } from './types'
import { initialTissueState, loadTissues } from './tissue'

/** Builds a tissue state with uniform tensions, for targeted algebra tests. */
function stateWith(n2: number, he = 0): TissueState {
  return {
    schemaVersion: SCHEMA_VERSION,
    n2: new Array(COMPARTMENT_COUNT).fill(n2),
    he: new Array(COMPARTMENT_COUNT).fill(he),
  }
}

/**
 * DecoTengu's `eq_gf_limit` with coefficients supplied explicitly, so the
 * origin project's pinned test values (which use ZH-L16B) can be reproduced
 * exactly. This mirrors the formula in `gfLimit`.
 */
function eqGfLimit(
  gf: number,
  pN2: number,
  pHe: number,
  aN2: number,
  bN2: number,
  aHe: number,
  bHe: number
): number {
  const p = pN2 + pHe
  const a = (aN2 * pN2 + aHe * pHe) / p
  const b = (bN2 * pN2 + bHe * pHe) / p
  return (p - a * gf) / (gf / b + 1 - gf)
}

describe('eq_gf_limit — DecoTengu pinned values', () => {
  // Values from decotengu/tests/test_model.py. ZH-L16B compartment 1.
  const A_N2 = 1.1696
  const B_N2 = 0.5578
  const A_HE = 1.6189
  const B_HE = 0.477

  // The four expected values below are transcribed verbatim from
  // decotengu/tests/test_model.py (test_gf_limit_n2_30, _n2_100,
  // _tx1845_30, _tx1845_100), asserted there to 6 decimal places.

  it('reproduces the nitrox case at GF 0.3', () => {
    expect(eqGfLimit(0.3, 3.0, 0, A_N2, B_N2, A_HE, B_HE)).toBeCloseTo(2.140137, 6)
  })

  it('reproduces the nitrox case at GF 1.0', () => {
    expect(eqGfLimit(1.0, 3.0, 0, A_N2, B_N2, A_HE, B_HE)).toBeCloseTo(1.020997, 6)
    // ...which must also equal the raw Bühlmann (P - a)*b.
    expect(eqGfLimit(1.0, 3.0, 0, A_N2, B_N2, A_HE, B_HE)).toBeCloseTo((3.0 - A_N2) * B_N2, 10)
  })

  it('reproduces the trimix 18/45 case at GF 0.3', () => {
    expect(eqGfLimit(0.3, 2.2, 0.8, A_N2, B_N2, A_HE, B_HE)).toBeCloseTo(2.074876, 6)
  })

  it('reproduces the trimix 18/45 case at GF 1.0', () => {
    const at100 = eqGfLimit(1.0, 2.2, 0.8, A_N2, B_N2, A_HE, B_HE)
    expect(at100).toBeCloseTo(0.917308, 6)

    // Lower GF must stop deeper than higher GF.
    expect(eqGfLimit(0.3, 2.2, 0.8, A_N2, B_N2, A_HE, B_HE)).toBeGreaterThan(at100)

    // And gf=1 equals raw Bühlmann with tension-weighted coefficients.
    const p = 3.0
    const a = (A_N2 * 2.2 + A_HE * 0.8) / p
    const b = (B_N2 * 2.2 + B_HE * 0.8) / p
    expect(at100).toBeCloseTo((p - a) * b, 10)
  })

  it('reproduces the docstring ceiling values for the ZH-L16B example', () => {
    // From model.py: eq_gf_limit(0.3, <P>, 0, 1.1696, 0.5578, 0, 0)
    expect(eqGfLimit(0.3, 0.74065446, 0, A_N2, B_N2, 0, 0)).toBeCloseTo(0.31488600902, 9)
    expect(eqGfLimit(0.3, 0.919397, 0, A_N2, B_N2, 0, 0)).toBeCloseTo(0.459286247719, 9)
    expect(eqGfLimit(0.3, 2.56749, 0, A_N2, B_N2, 0, 0)).toBeCloseTo(1.790726556209, 9)
    expect(eqGfLimit(0.3, 2.42184, 0, A_N2, B_N2, 0, 0)).toBeCloseTo(1.673060695768, 9)
  })
})

describe('gfLimit — equivalence with Erik Baker\'s exposition', () => {
  /**
   * Baker writes the gradient factor as applied along the M-value line:
   *
   *     P_limit = P_amb + gf·(M(P_amb) − P_amb)   evaluated at P_amb = P_limit
   *
   * i.e. at the ceiling, the tissue tension sits exactly `gf` of the way from
   * ambient pressure to the M-value. DecoTengu solves this in closed form.
   * Taking DecoTengu's answer and checking Baker's relation holds at that
   * pressure demonstrates the two formulations agree, rather than assuming it.
   */
  it('places the tension exactly gf of the way to the M-value at the ceiling', () => {
    for (const gf of [0.2, 0.3, 0.5, 0.7, 0.85, 1.0]) {
      for (const compartment of [0, 5, 10, 15]) {
        const pN2 = 2.4
        const pHe = 0.6
        const limit = gfLimit(gf, compartment, pN2, pHe)
        const m = mValue(compartment, limit, pN2, pHe)

        // Baker: gradient actually used / gradient permitted === gf
        const used = pN2 + pHe - limit
        const permitted = m - limit
        expect(used / permitted).toBeCloseTo(gf, 10)
      }
    }
  })

  it('collapses to the raw Bühlmann ceiling (P − a)·b at gf = 1', () => {
    for (let i = 0; i < COMPARTMENT_COUNT; i++) {
      const pN2 = 2.0
      expect(gfLimit(1.0, i, pN2, 0)).toBeCloseTo((pN2 - N2_A[i]) * N2_B[i], 12)
    }
  })
})

describe('combinedCoefficients', () => {
  it('returns the pure nitrogen coefficients when no helium is present', () => {
    const { a, b } = combinedCoefficients(3, 2.0, 0)
    expect(a).toBeCloseTo(N2_A[3], 12)
    expect(b).toBeCloseTo(N2_B[3], 12)
  })

  it('returns the pure helium coefficients when no nitrogen is present', () => {
    const { a, b } = combinedCoefficients(3, 0, 1.5)
    expect(a).toBeCloseTo(HE_A[3], 12)
    expect(b).toBeCloseTo(HE_B[3], 12)
  })

  it('weights by each gas share of the total tension', () => {
    const pN2 = 1.5
    const pHe = 0.5
    const { a, b, total } = combinedCoefficients(2, pN2, pHe)
    expect(total).toBeCloseTo(2.0, 12)
    expect(a).toBeCloseTo((N2_A[2] * pN2 + HE_A[2] * pHe) / 2.0, 12)
    expect(b).toBeCloseTo((N2_B[2] * pN2 + HE_B[2] * pHe) / 2.0, 12)
  })

  it('falls back to nitrogen coefficients for an empty compartment', () => {
    const { a, b, total } = combinedCoefficients(0, 0, 0)
    expect(total).toBe(0)
    expect(a).toBe(N2_A[0])
    expect(b).toBe(N2_B[0])
  })
})

describe('mValue', () => {
  it('is P_amb/b + a', () => {
    expect(mValue(0, 4.0, 2.0, 0)).toBeCloseTo(4.0 / N2_B[0] + N2_A[0], 12)
  })

  it('rises with ambient pressure', () => {
    expect(mValue(5, 5.0, 2.0, 0)).toBeGreaterThan(mValue(5, 2.0, 2.0, 0))
  })

  it('is more permissive for fast compartments than slow ones at the surface', () => {
    // Fast tissues tolerate more supersaturation, which is why they lead early
    // in an ascent and the slow ones lead late.
    expect(mValue(0, 1.0, 1.0, 0)).toBeGreaterThan(mValue(15, 1.0, 1.0, 0))
  })
})

describe('gfLimit — behaviour', () => {
  it('stops deeper for a lower gradient factor', () => {
    const deep = gfLimit(0.3, 4, 2.5, 0)
    const shallow = gfLimit(0.85, 4, 2.5, 0)
    expect(deep).toBeGreaterThan(shallow)
  })

  it('rises with tissue tension', () => {
    expect(gfLimit(0.5, 4, 3.0, 0)).toBeGreaterThan(gfLimit(0.5, 4, 2.0, 0))
  })

  it('returns zero for an empty compartment', () => {
    expect(gfLimit(0.3, 0, 0, 0)).toBe(0)
  })

  it('rejects out-of-range gradient factors', () => {
    expect(() => gfLimit(0, 0, 1, 0)).toThrow(/Gradient factor/)
    expect(() => gfLimit(-0.1, 0, 1, 0)).toThrow(/Gradient factor/)
    expect(() => gfLimit(1.6, 0, 1, 0)).toThrow(/Gradient factor/)
    expect(() => gfLimit(Number.NaN, 0, 1, 0)).toThrow(/Gradient factor/)
  })

  it('produces one limit per compartment via gfLimits', () => {
    expect(gfLimits(stateWith(2.0), 0.3)).toHaveLength(COMPARTMENT_COUNT)
  })
})

describe('ceiling', () => {
  it('is the deepest (highest-pressure) compartment limit', () => {
    const state = stateWith(2.5, 0.3)
    const all = gfLimits(state, 0.3)
    const result = ceiling(state, 0.3)
    expect(result.pressureBar).toBeCloseTo(Math.max(...all), 12)
    expect(all[result.compartment]).toBeCloseTo(result.pressureBar, 12)
  })

  it('identifies a fast compartment as leading right after a short deep exposure', () => {
    // 5 minutes at 50 m on air: only the fast tissues have loaded meaningfully.
    const state = loadTissues(initialTissueState(1.01325), {
      startPressureBar: 6.0,
      minutes: 5,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    expect(ceiling(state, 0.3).compartment).toBeLessThan(4)
  })

  it('shifts to a slower compartment after a long exposure', () => {
    const short = loadTissues(initialTissueState(1.01325), {
      startPressureBar: 4.0,
      minutes: 5,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    const long = loadTissues(initialTissueState(1.01325), {
      startPressureBar: 4.0,
      minutes: 180,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    expect(ceiling(long, 0.3).compartment).toBeGreaterThan(ceiling(short, 0.3).compartment)
  })

  it('imposes no obligation on a diver saturated at the surface', () => {
    const state = initialTissueState(1.01325)
    expect(ceiling(state, 0.85).pressureBar).toBeLessThan(1.01325)
    expect(withinCeiling(state, 1.01325, 0.85)).toBe(true)
  })

  it('deepens as a dive continues', () => {
    const base = initialTissueState(1.01325)
    const after10 = loadTissues(base, {
      startPressureBar: 5.0,
      minutes: 10,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    const after40 = loadTissues(base, {
      startPressureBar: 5.0,
      minutes: 40,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    expect(ceiling(after40, 0.3).pressureBar).toBeGreaterThan(ceiling(after10, 0.3).pressureBar)
  })

  it('reports a violation when the diver is shallower than the ceiling', () => {
    const state = loadTissues(initialTissueState(1.01325), {
      startPressureBar: 6.0,
      minutes: 40,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    const c = ceiling(state, 0.3)
    expect(withinCeiling(state, c.pressureBar + 0.1, 0.3)).toBe(true)
    expect(withinCeiling(state, c.pressureBar - 0.1, 0.3)).toBe(false)
  })
})

describe('supersaturation', () => {
  it('is zero when the compartment sits at ambient pressure', () => {
    expect(supersaturationPercent(stateWith(2.0), 2.0, 0)).toBeCloseTo(0, 10)
  })

  it('is 100% when the compartment sits exactly on the M-value', () => {
    const compartment = 4
    const ambient = 1.5
    const m = mValue(compartment, ambient, 1, 0)
    // Build a state whose N2 tension equals the M-value at this ambient.
    const state = stateWith(m)
    expect(supersaturationPercent(state, ambient, compartment)).toBeCloseTo(100, 8)
  })

  it('identifies the leading compartment consistently with the ceiling', () => {
    const state = loadTissues(initialTissueState(1.01325), {
      startPressureBar: 5.0,
      minutes: 30,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    // Evaluated at the ceiling itself, the leading compartment by
    // supersaturation is the one that sets the ceiling.
    const c = ceiling(state, 1.0)
    const leader = leadingSupersaturation(state, c.pressureBar)
    expect(leader.compartment).toBe(c.compartment)
    expect(leader.percent).toBeCloseTo(100, 6)
  })

  it('returns zero for an empty compartment', () => {
    expect(supersaturationPercent(stateWith(0), 1.0, 0)).toBe(0)
  })
})

describe('interpolateGF', () => {
  const gf = GF_PRESETS.moderate // 40/85
  const surface = 1.01325
  const firstStop = 2.5 // ~15 m

  it('returns GF low at the first stop', () => {
    expect(interpolateGF(gf, firstStop, firstStop, surface)).toBeCloseTo(gf.low, 12)
  })

  it('returns GF high at the surface', () => {
    expect(interpolateGF(gf, surface, firstStop, surface)).toBeCloseTo(gf.high, 12)
  })

  it('interpolates linearly at the midpoint', () => {
    const mid = (firstStop + surface) / 2
    expect(interpolateGF(gf, mid, firstStop, surface)).toBeCloseTo((gf.low + gf.high) / 2, 12)
  })

  it('holds GF low deeper than the first stop', () => {
    expect(interpolateGF(gf, 6.0, firstStop, surface)).toBeCloseTo(gf.low, 12)
  })

  it('holds GF high at and above the surface', () => {
    expect(interpolateGF(gf, 0.5, firstStop, surface)).toBeCloseTo(gf.high, 12)
  })

  it('returns GF high when there is no decompression obligation', () => {
    expect(interpolateGF(gf, 2.0, surface, surface)).toBeCloseTo(gf.high, 12)
    expect(interpolateGF(gf, 2.0, 0.5, surface)).toBeCloseTo(gf.high, 12)
  })

  it('increases monotonically on the way up', () => {
    let previous = -Infinity
    for (let p = firstStop; p >= surface; p -= 0.05) {
      const value = interpolateGF(gf, p, firstStop, surface)
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12)
      previous = value
    }
  })

  it('agrees with DecoTengu incremental gf_step at evenly spaced stops', () => {
    // DecoTengu adds (gf_high - gf_low)/n once per 3 m stop. With stops evenly
    // spaced in pressure, pressure-linear interpolation must give the same
    // values at those stops.
    const p3m = 0.3 // ~3 m in bar under the simple model
    const stops = 5
    const first = surface + stops * p3m
    const step = (gf.high - gf.low) / stops

    for (let k = 0; k <= stops; k++) {
      const pressure = first - k * p3m
      const incremental = gf.low + k * step
      expect(interpolateGF(gf, pressure, first, surface)).toBeCloseTo(incremental, 10)
    }
  })

  it('is flat when GF low equals GF high', () => {
    const flat = { low: 0.7, high: 0.7 }
    expect(interpolateGF(flat, 2.0, firstStop, surface)).toBeCloseTo(0.7, 12)
    expect(interpolateGF(flat, 1.2, firstStop, surface)).toBeCloseTo(0.7, 12)
  })
})

describe('assertValidGF', () => {
  it('accepts the shipped presets', () => {
    for (const preset of Object.values(GF_PRESETS)) {
      expect(() => assertValidGF(preset)).not.toThrow()
    }
  })

  it('accepts GF 100/100', () => {
    expect(() => assertValidGF({ low: 1, high: 1 })).not.toThrow()
  })

  it('rejects low above high', () => {
    expect(() => assertValidGF({ low: 0.9, high: 0.5 })).toThrow(/cannot exceed/)
  })

  it('rejects out-of-range values', () => {
    expect(() => assertValidGF({ low: 0, high: 0.85 })).toThrow(/must be in/)
    expect(() => assertValidGF({ low: 0.3, high: 2 })).toThrow(/must be in/)
    expect(() => assertValidGF({ low: Number.NaN, high: 0.85 })).toThrow(/must be in/)
  })
})

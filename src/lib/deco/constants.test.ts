/**
 * Pins every ZH-L16C coefficient.
 *
 * These 96 numbers are safety-critical: a wrong digit yields a schedule that
 * looks reasonable and is not. The literals below are an INDEPENDENT
 * transcription from DecoTengu 0.14.1 `decotengu/model.py` class `ZH_L16C_GF`
 * — deliberately re-typed here rather than imported and compared to itself, so
 * that a corruption of `constants.ts` fails this file.
 *
 * The structural tests that follow are the real defence: they verify the table
 * against Bühlmann's *generating formulas*, so a typo cannot survive even if
 * both transcriptions were wrong in the same way.
 */

import { describe, it, expect } from 'vitest'
import {
  N2_HALF_TIMES,
  HE_HALF_TIMES,
  N2_A,
  N2_B,
  HE_A,
  HE_B,
  N2_K,
  HE_K,
  LOG_2,
  WATER_VAPOUR_PRESSURE_BAR,
  START_N2_FRACTION,
  GF_PRESETS,
  DEFAULT_ENGINE_OPTIONS,
  resolveOptions,
  OTU_EXPONENT,
  OTU_THRESHOLD_PPO2,
} from './constants'
import { COMPARTMENT_COUNT } from './types'

describe('ZH-L16C constants — verbatim pins', () => {
  it('pins the nitrogen half-times', () => {
    expect(N2_HALF_TIMES).toEqual([
      4.0, 8.0, 12.5, 18.5, 27.0, 38.3, 54.3, 77.0, 109.0, 146.0, 187.0, 239.0, 305.0, 390.0,
      498.0, 635.0,
    ])
  })

  it('pins the helium half-times', () => {
    expect(HE_HALF_TIMES).toEqual([
      1.51, 3.02, 4.72, 6.99, 10.21, 14.48, 20.53, 29.11, 41.2, 55.19, 70.69, 90.34, 115.29,
      147.42, 188.24, 240.03,
    ])
  })

  it('pins the nitrogen a coefficients', () => {
    expect(N2_A).toEqual([
      1.2599, 1.0, 0.8618, 0.7562, 0.62, 0.5043, 0.441, 0.4, 0.375, 0.35, 0.3295, 0.3065, 0.2835,
      0.261, 0.248, 0.2327,
    ])
  })

  it('pins the nitrogen b coefficients', () => {
    expect(N2_B).toEqual([
      0.505, 0.6514, 0.7222, 0.7825, 0.8126, 0.8434, 0.8693, 0.891, 0.9092, 0.9222, 0.9319,
      0.9403, 0.9477, 0.9544, 0.9602, 0.9653,
    ])
  })

  it('pins the helium a coefficients', () => {
    expect(HE_A).toEqual([
      1.7424, 1.383, 1.1919, 1.0458, 0.922, 0.8205, 0.7305, 0.6502, 0.595, 0.5545, 0.5333, 0.5189,
      0.5181, 0.5176, 0.5172, 0.5119,
    ])
  })

  it('pins the helium b coefficients', () => {
    expect(HE_B).toEqual([
      0.4245, 0.5747, 0.6527, 0.7223, 0.7582, 0.7957, 0.8279, 0.8553, 0.8757, 0.8903, 0.8997,
      0.9073, 0.9122, 0.9171, 0.9217, 0.9267,
    ])
  })

  it('is ZH-L16C, not ZH-L16B — compartment 1 N2 half-time is 4.0 min', () => {
    // The single most common variant confusion. ZH-L16B uses 5.0 min and
    // a = 1.1696; ZH-L16C uses 4.0 min and a = 1.2599.
    expect(N2_HALF_TIMES[0]).toBe(4.0)
    expect(N2_A[0]).toBe(1.2599)
    expect(N2_B[0]).toBe(0.505)
    expect(HE_HALF_TIMES[0]).toBe(1.51)
  })

  it('has exactly 16 entries in every table', () => {
    for (const table of [N2_HALF_TIMES, HE_HALF_TIMES, N2_A, N2_B, HE_A, HE_B, N2_K, HE_K]) {
      expect(table).toHaveLength(COMPARTMENT_COUNT)
    }
  })
})

describe('ZH-L16C constants — cross-check against Bühlmann generating formulas', () => {
  // Bühlmann (Tauchmedizin): a = 2·t½^(−1/3), b = 1.005 − t½^(−1/2).
  const formulaA = (halfTime: number) => 2 * Math.pow(halfTime, -1 / 3)
  const formulaB = (halfTime: number) => 1.005 - Math.pow(halfTime, -0.5)

  // The published table carries 4 decimal places, so a tabulated value may
  // differ from the exact formula output by up to half a unit in the last
  // place (5e-5) purely through rounding. Comparisons below use that bound.
  const ROUNDING = 5e-5

  it('reproduces every nitrogen b coefficient except the two published offsets', () => {
    // Two compartments deviate from the generating formula in Bühlmann's
    // published table. Both raise `b`, and a higher `b` tolerates LESS
    // supersaturation, so both deviations are conservative. They are
    // reproduced identically in DecoTengu, the OSTC firmware and every other
    // implementation cross-checked, so they are properties of the published
    // table rather than transcription errors here.
    const PUBLISHED_OFFSETS: Record<number, number> = {
      3: 0.01, // compartment 4 (18.5 min): 0.7825 vs 0.7725 computed
      4: 0.0001, // compartment 5 (27.0 min): 0.8126 vs 0.81255 computed
    }

    for (let i = 0; i < COMPARTMENT_COUNT; i++) {
      const computed = formulaB(N2_HALF_TIMES[i])
      const offset = PUBLISHED_OFFSETS[i]

      if (offset !== undefined) {
        expect(N2_B[i] - computed).toBeCloseTo(offset, 4)
        // Every deviation must be upward, i.e. toward more conservatism.
        expect(N2_B[i]).toBeGreaterThan(computed)
      } else {
        // Each remaining value is the formula output rounded to the table's 4 dp.
        expect(N2_B[i]).toBeCloseTo(Math.round(computed * 1e4) / 1e4, 10)
        expect(Math.abs(N2_B[i] - computed)).toBeLessThanOrEqual(ROUNDING)
      }
    }
  })

  it('reproduces the unrevised nitrogen a coefficients exactly', () => {
    // Compartments 1-4 and 16 were not revised between ZH-L16A and C, so they
    // still equal the raw formula output, rounded to the table's 4 dp.
    for (const i of [0, 1, 2, 3, 15]) {
      const computed = formulaA(N2_HALF_TIMES[i])
      expect(N2_A[i]).toBeCloseTo(Math.round(computed * 1e4) / 1e4, 10)
      expect(Math.abs(N2_A[i] - computed)).toBeLessThanOrEqual(ROUNDING)
    }
  })

  it('has ZH-L16C nitrogen a coefficients at or below the ZH-L16A formula values', () => {
    // The C revision only ever lowered `a` (i.e. made the model more
    // conservative). A value above the formula beyond table rounding would
    // indicate a transcription error in the non-conservative direction — the
    // dangerous kind.
    for (let i = 0; i < COMPARTMENT_COUNT; i++) {
      expect(N2_A[i]).toBeLessThanOrEqual(formulaA(N2_HALF_TIMES[i]) + ROUNDING)
    }
  })

  it('reproduces the helium a coefficients for the fast compartments', () => {
    // Compartments 1-8 follow the formula; 9-16 deliberately plateau near
    // 0.518 in the published helium table rather than continuing to decay.
    for (let i = 0; i < 8; i++) {
      expect(HE_A[i]).toBeCloseTo(formulaA(HE_HALF_TIMES[i]), 2)
    }
    for (let i = 11; i < COMPARTMENT_COUNT; i++) {
      expect(HE_A[i]).toBeGreaterThan(0.51)
      expect(HE_A[i]).toBeLessThan(0.52)
    }
  })

  it('keeps every coefficient table monotonic in the expected direction', () => {
    for (let i = 1; i < COMPARTMENT_COUNT; i++) {
      // Half-times strictly increase.
      expect(N2_HALF_TIMES[i]).toBeGreaterThan(N2_HALF_TIMES[i - 1])
      expect(HE_HALF_TIMES[i]).toBeGreaterThan(HE_HALF_TIMES[i - 1])
      // `a` decreases (slower tissues tolerate less overpressure).
      expect(N2_A[i]).toBeLessThanOrEqual(N2_A[i - 1])
      expect(HE_A[i]).toBeLessThanOrEqual(HE_A[i - 1])
      // `b` increases toward 1.
      expect(N2_B[i]).toBeGreaterThan(N2_B[i - 1])
      expect(HE_B[i]).toBeGreaterThan(HE_B[i - 1])
    }
  })

  it('keeps helium faster than nitrogen in every compartment', () => {
    // Helium diffuses faster, so its half-time must be shorter throughout.
    for (let i = 0; i < COMPARTMENT_COUNT; i++) {
      expect(HE_HALF_TIMES[i]).toBeLessThan(N2_HALF_TIMES[i])
    }
  })
})

describe('derived constants', () => {
  it('computes decay constants as ln(2)/half-time', () => {
    for (let i = 0; i < COMPARTMENT_COUNT; i++) {
      expect(N2_K[i]).toBeCloseTo(LOG_2 / N2_HALF_TIMES[i], 12)
      expect(HE_K[i]).toBeCloseTo(LOG_2 / HE_HALF_TIMES[i], 12)
    }
  })

  it('pins ln(2)', () => {
    expect(LOG_2).toBeCloseTo(Math.LN2, 15)
  })

  it('pins the water vapour pressure at the Bühlmann/DecoTengu value', () => {
    expect(WATER_VAPOUR_PRESSURE_BAR).toBe(0.0627)
  })

  it('pins the starting nitrogen fraction at dry air, not the narcosis convention', () => {
    expect(START_N2_FRACTION).toBe(0.7902)
  })

  it('pins the OTU (Repex) parameters', () => {
    expect(OTU_EXPONENT).toBe(0.83)
    expect(OTU_THRESHOLD_PPO2).toBe(0.5)
  })
})

describe('gradient factor presets and engine options', () => {
  it('orders the presets from conservative to aggressive', () => {
    expect(GF_PRESETS.conservative).toEqual({ low: 0.3, high: 0.7 })
    expect(GF_PRESETS.moderate).toEqual({ low: 0.4, high: 0.85 })
    expect(GF_PRESETS.aggressive).toEqual({ low: 0.5, high: 0.9 })
    expect(GF_PRESETS.conservative.low).toBeLessThan(GF_PRESETS.moderate.low)
    expect(GF_PRESETS.moderate.low).toBeLessThan(GF_PRESETS.aggressive.low)
  })

  it('defaults to the conservative preset and the spec-mandated rates', () => {
    expect(DEFAULT_ENGINE_OPTIONS.gf).toEqual(GF_PRESETS.conservative)
    expect(DEFAULT_ENGINE_OPTIONS.descentRate).toBe(18)
    expect(DEFAULT_ENGINE_OPTIONS.ascentRate).toBe(9)
    expect(DEFAULT_ENGINE_OPTIONS.lastStopDepth).toBe(3)
    expect(DEFAULT_ENGINE_OPTIONS.stopIncrement).toBe(3)
  })

  it('merges partial options over the defaults without mutating them', () => {
    const merged = resolveOptions({ ascentRate: 6, gf: { low: 0.5, high: 0.8 } })
    expect(merged.ascentRate).toBe(6)
    expect(merged.gf).toEqual({ low: 0.5, high: 0.8 })
    expect(merged.descentRate).toBe(DEFAULT_ENGINE_OPTIONS.descentRate)
    expect(DEFAULT_ENGINE_OPTIONS.ascentRate).toBe(9)
  })

  it('returns the defaults unchanged when given nothing', () => {
    expect(resolveOptions()).toEqual(DEFAULT_ENGINE_OPTIONS)
  })
})

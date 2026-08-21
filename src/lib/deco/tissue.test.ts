/**
 * Tissue loading tests.
 *
 * The two that matter most:
 *
 * 1. **The DecoTengu worked example.** `decotengu/model.py`'s module docstring
 *    carries a fully worked three-segment profile with expected tensions to six
 *    decimal places, produced by the origin implementation. Reproducing those
 *    figures is direct evidence the port is faithful rather than merely
 *    self-consistent.
 * 2. **Schreiner vs 1-second Euler integration.** The analytic equation is the
 *    thing most likely to hide a sign or algebra error, because a wrong version
 *    still produces smooth, plausible-looking numbers. Integrating the
 *    underlying differential equation numerically is a genuinely independent
 *    derivation, so agreement between the two is strong evidence for both.
 */

import { describe, it, expect } from 'vitest'
import {
  initialTissueState,
  inspiredPressure,
  schreiner,
  loadTissues,
  loadTissuesOnGas,
  totalTension,
  cloneTissueState,
  assertValidTissueState,
} from './tissue'
import { N2_K, HE_K, WATER_VAPOUR_PRESSURE_BAR, LOG_2, START_N2_FRACTION } from './constants'
import { COMPARTMENT_COUNT, SCHEMA_VERSION, type TissueState } from './types'
import { gas, AIR } from '../gas'

describe('initialTissueState', () => {
  it('saturates all 16 compartments with nitrogen at sea level', () => {
    const state = initialTissueState(1.01325)
    const expected = START_N2_FRACTION * (1.01325 - WATER_VAPOUR_PRESSURE_BAR)
    expect(state.n2).toHaveLength(COMPARTMENT_COUNT)
    expect(state.he).toHaveLength(COMPARTMENT_COUNT)
    for (let i = 0; i < COMPARTMENT_COUNT; i++) {
      expect(state.n2[i]).toBeCloseTo(expected, 12)
      expect(state.he[i]).toBe(0)
    }
  })

  it('matches the DecoTengu docstring value for a 1 bar surface', () => {
    // DecoTengu: P_i = 0.7902 * (1 - 0.0627) = 0.74065446
    const state = initialTissueState(1)
    expect(state.n2[0]).toBeCloseTo(0.74065446, 8)
  })

  it('starts a diver at altitude less saturated than at sea level', () => {
    const seaLevel = initialTissueState(1.01325)
    const altitude = initialTissueState(0.9)
    expect(altitude.n2[0]).toBeLessThan(seaLevel.n2[0])
  })

  it('rejects a non-physical surface pressure', () => {
    expect(() => initialTissueState(0)).toThrow(/positive/)
    expect(() => initialTissueState(-1)).toThrow(/positive/)
    expect(() => initialTissueState(Number.NaN)).toThrow(/positive/)
    expect(() => initialTissueState(0.05)).toThrow(/water vapour/)
  })

  it('is serializable and round-trips through JSON unchanged', () => {
    const state = initialTissueState(1.01325)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})

describe('inspiredPressure', () => {
  it('subtracts alveolar water vapour before applying the gas fraction', () => {
    expect(inspiredPressure(0.79, 1)).toBeCloseTo(0.79 * (1 - 0.0627), 12)
    expect(inspiredPressure(0.68, 4)).toBeCloseTo(2.677364, 6) // DecoTengu docstring
  })

  it('never returns a negative pressure', () => {
    expect(inspiredPressure(0.79, 0.01)).toBe(0)
  })
})

describe('schreiner — the DecoTengu worked example', () => {
  // From decotengu/model.py docstring: ZH-L16B compartment 1 (half-time 5.0
  // min, so k = ln2/5), EAN32 (fN2 = 0.68), surface pressure 1 bar, 10 m per
  // bar. Note ZH-L16B's 5.0 min half-time is used here because that is what
  // the origin example uses; this exercises the equation, not our C-table.
  const k = LOG_2 / 5.0

  it('reproduces the descent 0→30 m at 20 m/min', () => {
    const pAlv = 0.68 * (1 - 0.0627)
    const r = 0.68 * 2 // 20 m/min = 2 bar/min
    const result = schreiner(pAlv, r, k, 0.74065446, 1.5)
    expect(result).toBeCloseTo(0.919397, 6)
  })

  it('reproduces the 20 min at 30 m at constant depth', () => {
    const pAlv = 0.68 * (4 - 0.0627)
    const result = schreiner(pAlv, 0, k, 0.919397, 20)
    expect(result).toBeCloseTo(2.56749, 5)
  })

  it('reproduces the ascent 30→10 m at 10 m/min', () => {
    const pAlv = 0.68 * (4 - 0.0627)
    const r = 0.68 * -1 // 10 m/min ascent = -1 bar/min
    const result = schreiner(pAlv, r, k, 2.56749, 2)
    expect(result).toBeCloseTo(2.42184, 5)
  })
})

describe('schreiner — properties', () => {
  it('reduces to the Haldane equation when the rate is zero', () => {
    const pAlv = 2.5
    const p0 = 1.0
    const k = N2_K[3]
    const t = 17
    const haldane = pAlv + (p0 - pAlv) * Math.exp(-k * t)
    expect(schreiner(pAlv, 0, k, p0, t)).toBeCloseTo(haldane, 12)
  })

  it('halves the gap to the inspired pressure in exactly one half-time', () => {
    const pAlv = 3.0
    const p0 = 1.0
    const halfTime = 12.5
    const k = LOG_2 / halfTime
    const after = schreiner(pAlv, 0, k, p0, halfTime)
    expect(after).toBeCloseTo(p0 + (pAlv - p0) / 2, 10)
  })

  it('leaves a saturated compartment unchanged at constant depth', () => {
    const pAlv = 2.0
    expect(schreiner(pAlv, 0, N2_K[8], pAlv, 60)).toBeCloseTo(pAlv, 12)
  })

  it('offgasses when the compartment is above the inspired pressure', () => {
    expect(schreiner(1.0, 0, N2_K[0], 3.0, 10)).toBeLessThan(3.0)
  })

  it('is continuous across a split segment (composition property)', () => {
    // Loading for 10 min must equal loading 4 min then 6 min from the result,
    // provided the second call starts from the pressure the ramp reached.
    const k = N2_K[2]
    const fGas = 0.79
    const startP = 1.0
    const rateBar = 1.8 // 18 m/min
    const pAlv1 = fGas * (startP - WATER_VAPOUR_PRESSURE_BAR)
    const r = fGas * rateBar

    const oneShot = schreiner(pAlv1, r, k, 0.74, 10)

    const mid = schreiner(pAlv1, r, k, 0.74, 4)
    const startP2 = startP + rateBar * 4
    const pAlv2 = fGas * (startP2 - WATER_VAPOUR_PRESSURE_BAR)
    const twoShot = schreiner(pAlv2, r, k, mid, 6)

    expect(twoShot).toBeCloseTo(oneShot, 10)
  })
})

describe('schreiner vs 1-second Euler integration (spec §9 guard)', () => {
  /**
   * The differential equation underlying the model is
   *
   *     dP/dt = k · (P_alv(t) − P)      with   P_alv(t) = P_alv0 + R·t
   *
   * Integrating it forward in one-second steps is an independent derivation of
   * the same physics, sharing no algebra with the analytic solution. The spec
   * requires agreement to better than 0.1% over a 30-minute descent-and-hold.
   */
  function euler(
    pAlv0: number,
    rate: number,
    k: number,
    pInitial: number,
    minutes: number,
    stepSeconds = 1
  ): number {
    const dt = stepSeconds / 60
    const steps = Math.round((minutes * 60) / stepSeconds)
    let p = pInitial
    for (let i = 0; i < steps; i++) {
      const pAlv = pAlv0 + rate * (i * dt)
      p += k * (pAlv - p) * dt
    }
    return p
  }

  it('agrees to <0.1% over a 30-minute descent-and-hold, every compartment', () => {
    const fN2 = AIR.n2
    const descentRateBar = 1.8 // 18 m/min
    const descentMinutes = 40 / 18 // surface to 40 m
    const holdMinutes = 30 - descentMinutes

    const surface = 1.01325
    const pAlvDescent = fN2 * (surface - WATER_VAPOUR_PRESSURE_BAR)
    const rDescent = fN2 * descentRateBar
    const bottomP = surface + descentRateBar * descentMinutes
    const pAlvBottom = fN2 * (bottomP - WATER_VAPOUR_PRESSURE_BAR)
    const p0 = START_N2_FRACTION * (surface - WATER_VAPOUR_PRESSURE_BAR)

    for (let i = 0; i < COMPARTMENT_COUNT; i++) {
      const k = N2_K[i]

      const analyticDescent = schreiner(pAlvDescent, rDescent, k, p0, descentMinutes)
      const analytic = schreiner(pAlvBottom, 0, k, analyticDescent, holdMinutes)

      const eulerDescent = euler(pAlvDescent, rDescent, k, p0, descentMinutes)
      const eulerFinal = euler(pAlvBottom, 0, k, eulerDescent, holdMinutes)

      const relativeError = Math.abs(analytic - eulerFinal) / analytic
      expect(relativeError).toBeLessThan(0.001)
    }
  })

  it('converges on the analytic value with first-order error as the step shrinks', () => {
    // This is the decisive test that the ANALYTIC form is the correct one.
    //
    // Euler's method has global error O(Δt): tenfold smaller steps give
    // tenfold smaller error, and the error tends to zero. If `schreiner` were
    // wrong, Euler would instead converge on some *other* value and the error
    // would plateau at a non-zero constant. Observing a clean 10× reduction
    // across three decades therefore identifies the analytic solution as the
    // exact limit the integration is approaching.
    const k = N2_K[0]
    const pAlv = 0.79 * (1 - 0.0627)
    const r = 0.79 * 1.8
    const analytic = schreiner(pAlv, r, k, 0.74, 5)

    const errors = [10, 1, 0.1, 0.01].map((step) =>
      Math.abs(euler(pAlv, r, k, 0.74, 5, step) - analytic)
    )

    for (let i = 1; i < errors.length; i++) {
      // Each tenfold refinement cuts the error by ~10× (allow 8-12× for the
      // higher-order terms that dominate at the coarsest step).
      const ratio = errors[i - 1] / errors[i]
      expect(ratio).toBeGreaterThan(8)
      expect(ratio).toBeLessThan(12)
    }
    // And the error is heading to zero, not to a constant offset.
    expect(errors[errors.length - 1]).toBeLessThan(1e-4)
  })

  it('agrees on a trimix ascent, where helium kinetics dominate', () => {
    const trimix = gas(0.18, 0.45)
    const ascentRateBar = -0.9 // 9 m/min up
    const startP = 7.0
    const minutes = 5

    const pAlvHe = trimix.he * (startP - WATER_VAPOUR_PRESSURE_BAR)
    const rHe = trimix.he * ascentRateBar

    for (let i = 0; i < COMPARTMENT_COUNT; i++) {
      const k = HE_K[i]
      const analytic = schreiner(pAlvHe, rHe, k, 1.5, minutes)

      // Compartment 1's helium half-time is 1.51 min, so a 1-second Euler step
      // is 1.1% of a half-time — the stiffest case in the whole model, and
      // where Euler is least accurate (~0.13% here). Refining the step to 0.1 s
      // pulls it inside 0.1%, confirming the residual is the integrator's
      // discretisation error and not a discrepancy in the analytic form.
      const oneSecond = euler(pAlvHe, rHe, k, 1.5, minutes, 1)
      expect(Math.abs(analytic - oneSecond) / analytic).toBeLessThan(0.002)

      const tenth = euler(pAlvHe, rHe, k, 1.5, minutes, 0.1)
      expect(Math.abs(analytic - tenth) / analytic).toBeLessThan(0.001)

      // Refinement must strictly improve agreement.
      expect(Math.abs(analytic - tenth)).toBeLessThan(Math.abs(analytic - oneSecond))
    }
  })
})

describe('loadTissues', () => {
  const base = initialTissueState(1.01325)

  it('returns the same state for a zero-length segment', () => {
    const out = loadTissues(base, {
      startPressureBar: 4,
      minutes: 0,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    expect(out).toBe(base)
  })

  it('does not mutate the input state', () => {
    const before = JSON.parse(JSON.stringify(base))
    loadTissues(base, { startPressureBar: 4, minutes: 20, pressureRate: 0, fN2: 0.79, fHe: 0 })
    expect(base).toEqual(before)
  })

  it('ongasses nitrogen at depth in every compartment', () => {
    const out = loadTissues(base, {
      startPressureBar: 4,
      minutes: 20,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    for (let i = 0; i < COMPARTMENT_COUNT; i++) {
      expect(out.n2[i]).toBeGreaterThan(base.n2[i])
      expect(out.he[i]).toBe(0)
    }
    // Fast compartments load faster than slow ones.
    expect(out.n2[0] - base.n2[0]).toBeGreaterThan(out.n2[15] - base.n2[15])
  })

  it('loads helium on a trimix and much faster than nitrogen', () => {
    const tx = gas(0.18, 0.45)
    const out = loadTissuesOnGas(base, tx, 7, 20, 0)
    expect(out.he[0]).toBeGreaterThan(0)
    // Compartment 1 helium (1.51 min) reaches near-equilibrium in 20 min;
    // nitrogen (4.0 min) does too, but helium gets closer.
    const heEquilibrium = tx.he * (7 - WATER_VAPOUR_PRESSURE_BAR)
    expect(out.he[0]).toBeCloseTo(heEquilibrium, 3)
  })

  it('preserves the schema version on the produced state', () => {
    const out = loadTissues(base, {
      startPressureBar: 4,
      minutes: 5,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('rejects invalid segments', () => {
    expect(() =>
      loadTissues(base, { startPressureBar: 4, minutes: -1, pressureRate: 0, fN2: 0.79, fHe: 0 })
    ).toThrow(/non-negative/)
    expect(() =>
      loadTissues(base, { startPressureBar: 0, minutes: 5, pressureRate: 0, fN2: 0.79, fHe: 0 })
    ).toThrow(/positive/)
  })

  it('offgasses on oxygen at a stop', () => {
    const loaded = loadTissues(base, {
      startPressureBar: 5,
      minutes: 25,
      pressureRate: 0,
      fN2: 0.79,
      fHe: 0,
    })
    const onO2 = loadTissues(loaded, {
      startPressureBar: 1.6,
      minutes: 10,
      pressureRate: 0,
      fN2: 0,
      fHe: 0,
    })
    for (let i = 0; i < COMPARTMENT_COUNT; i++) {
      expect(onO2.n2[i]).toBeLessThan(loaded.n2[i])
    }
  })
})

describe('state helpers', () => {
  it('sums both inert gases in totalTension', () => {
    const state: TissueState = {
      schemaVersion: SCHEMA_VERSION,
      n2: new Array(16).fill(1.2),
      he: new Array(16).fill(0.4),
    }
    expect(totalTension(state, 0)).toBeCloseTo(1.6, 12)
  })

  it('clones deeply', () => {
    const state = initialTissueState(1.01325)
    const copy = cloneTissueState(state)
    expect(copy).toEqual(state)
    expect(copy.n2).not.toBe(state.n2)
  })

  it('accepts a valid state', () => {
    expect(() => assertValidTissueState(initialTissueState(1.01325))).not.toThrow()
  })

  it('rejects malformed or foreign states with a specific reason', () => {
    expect(() => assertValidTissueState(null as never)).toThrow(/must be an object/)
    expect(() =>
      assertValidTissueState({ schemaVersion: 99, n2: [], he: [] } as never)
    ).toThrow(/schemaVersion/)
    expect(() =>
      assertValidTissueState({ schemaVersion: SCHEMA_VERSION, n2: [1], he: new Array(16).fill(0) } as never)
    ).toThrow(/16 nitrogen/)
    expect(() =>
      assertValidTissueState({ schemaVersion: SCHEMA_VERSION, n2: new Array(16).fill(1), he: [0] } as never)
    ).toThrow(/16 helium/)
    expect(() =>
      assertValidTissueState({
        schemaVersion: SCHEMA_VERSION,
        n2: new Array(16).fill(-1),
        he: new Array(16).fill(0),
      } as never)
    ).toThrow(/Nitrogen tension/)
    expect(() =>
      assertValidTissueState({
        schemaVersion: SCHEMA_VERSION,
        n2: new Array(16).fill(1),
        he: new Array(16).fill(Number.NaN),
      } as never)
    ).toThrow(/Helium tension/)
  })
})

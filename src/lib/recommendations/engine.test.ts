import { describe, it, expect } from 'vitest'
import {
  analyseMix,
  ceilingFor,
  generateRecommendations,
  MAX_HELIUM_PERCENT,
  MAX_PLANNING_DEPTH_METERS,
} from './engine'
import { FORMULAS } from './math'
import { gas } from '../gas'
import { ambientPressure } from '../pressure'
import { DEFAULT_SAFETY_LIMITS, type SafetyLimits } from '../limits'
import { severityOrder } from './warningsBridge'
import type { RecommendationRequest } from './types'

/** A request with every field set, so a test only overrides what it is about. */
function req(overrides: Partial<RecommendationRequest> = {}): RecommendationRequest {
  return {
    mode: 'oc',
    targetDepthMeters: 30,
    maxEndMeters: 30,
    desiredPPO2: 1.4,
    bottomTimeMinutes: 20,
    waterTemperatureC: 20,
    ...overrides,
  }
}

const LIMITS: SafetyLimits = DEFAULT_SAFETY_LIMITS

describe('ceilingFor', () => {
  it('uses the deco ceiling for a decompression gas', () => {
    expect(ceilingFor('deco', 'oc', LIMITS)).toBe(LIMITS.maxPPO2Deco)
  })

  it('uses the CCR setpoint ceiling for a rebreather diluent', () => {
    expect(ceilingFor('diluent', 'ccr', LIMITS)).toBe(LIMITS.maxPPO2CCR)
  })

  it('uses the working ceiling for an open-circuit bottom gas', () => {
    expect(ceilingFor('bottom', 'oc', LIMITS)).toBe(LIMITS.maxPPO2Work)
  })

  it('uses the open-circuit working ceiling for bailout even on a rebreather', () => {
    // A bailout gas is breathed off the loop, so the CCR setpoint does not apply.
    expect(ceilingFor('bailout', 'ccr-trimix', LIMITS)).toBe(LIMITS.maxPPO2Work)
  })

  it('tracks a diver-configured ceiling rather than a hardcoded 1.6', () => {
    const strict = { ...LIMITS, maxPPO2Deco: 1.5 }
    expect(ceilingFor('deco', 'oc', strict)).toBe(1.5)
  })
})

describe('analyseMix', () => {
  it('computes MOD from the supplied ceiling, floored to a whole metre', () => {
    // EAN32 at 1.4 bar: 1.4/0.32 = 4.375 bar -> 33.75 m -> 33 m.
    const a = analyseMix(gas(0.32, 0), req({ targetDepthMeters: 33 }), 1.4, LIMITS)
    expect(a.modMeters).toBe(33)
    expect(a.modPPO2).toBe(1.4)
  })

  it('reports PPO2 at the planned target depth', () => {
    const a = analyseMix(gas(0.32, 0), req({ targetDepthMeters: 30 }), 1.4, LIMITS)
    expect(a.ppo2AtTarget).toBeCloseTo(0.32 * 4, 6)
  })

  it('analyses a deco gas at its own MOD, not at the planned bottom depth', () => {
    // R3: EAN50 breathed on a 60 m dive is used at 22 m, not 60 m. Density at
    // 22 m must be far below density at 60 m.
    const deep = req({ targetDepthMeters: 60 })
    const a = analyseMix(gas(0.5, 0), deep, 1.6, LIMITS)
    expect(a.modMeters).toBe(22)
    const densityAt60 = analyseMix(gas(0.5, 0), deep, 6.1, LIMITS).densityGramsPerLiter
    expect(a.densityGramsPerLiter).toBeLessThan(densityAt60)
    expect(a.densityGramsPerLiter).toBeLessThan(5)
  })

  it('derives density from the ideal gas law, not from scaled surface densities', () => {
    // R2: the legacy model gave air ~4.69 g/L per bar; P·M/(R·T) at 20 °C gives
    // about 1.20 g/L at the surface and ~4.8 g/L at 4 bar.
    const a = analyseMix(gas(0.21, 0), req({ targetDepthMeters: 30 }), 1.4, LIMITS)
    expect(a.densityGramsPerLiter).toBeGreaterThan(4.5)
    expect(a.densityGramsPerLiter).toBeLessThan(5.2)
  })

  it('reports a hypoxic ceiling for a lean bottom mix', () => {
    const a = analyseMix(gas(0.1, 0.7), req({ targetDepthMeters: 90 }), 1.3, LIMITS)
    expect(a.hypoxic).toBe(true)
    // 0.16/0.10 = 1.6 bar, i.e. 6.0 m exactly. `modRaw` computes (1.6 - 1) * 10
    // in floating point, which yields 6.000000000000001, and the conservative
    // ceil in `roundHypoxicCeiling` promotes that to 7 m. The error is one metre
    // in the safe direction (the diver is told to descend sooner), and both
    // functions live in read-only Phase 1 modules, so this asserts the behaviour
    // as it is. See FINDINGS note R8 in engine.ts.
    expect(a.hypoxicCeilingMeters).toBe(7)
  })

  it('reports no hypoxic ceiling for a normoxic mix', () => {
    const a = analyseMix(gas(0.21, 0.35), req({ targetDepthMeters: 45 }), 1.4, LIMITS)
    expect(a.hypoxic).toBe(false)
    expect(a.hypoxicCeilingMeters).toBe(0)
  })

  it('computes a CNS percentage for the planned bottom time', () => {
    const a = analyseMix(
      gas(0.32, 0),
      req({ targetDepthMeters: 30, bottomTimeMinutes: 30 }),
      1.4,
      LIMITS
    )
    expect(a.cnsOverLimit).toBe(false)
    expect(a.cnsPercent).toBeGreaterThan(0)
    expect(a.cnsPercent).toBeLessThan(50)
  })

  it('honours the oxygen-narcosis preference when computing END', () => {
    const mix = gas(0.18, 0.45)
    const r = req({ targetDepthMeters: 50, mode: 'oc-trimix' })
    const n2Only = analyseMix(mix, r, 1.4, { ...LIMITS, oxygenNarcosisModel: false })
    const n2AndO2 = analyseMix(mix, r, 1.4, { ...LIMITS, oxygenNarcosisModel: true })
    expect(n2AndO2.endMeters).toBeGreaterThan(n2Only.endMeters)
  })

  it('honours a colder water temperature by reporting a denser gas', () => {
    const warm = analyseMix(gas(0.21, 0), req({ waterTemperatureC: 28 }), 1.4, LIMITS)
    const cold = analyseMix(gas(0.21, 0), req({ waterTemperatureC: 4 }), 1.4, LIMITS)
    expect(cold.densityGramsPerLiter).toBeGreaterThan(warm.densityGramsPerLiter)
  })
})

describe('generateRecommendations — input validation', () => {
  it('rejects a non-positive depth', () => {
    expect(() => generateRecommendations(req({ targetDepthMeters: 0 }), LIMITS)).toThrow(
      /positive finite/
    )
  })

  it('rejects a depth beyond the planning ceiling', () => {
    expect(() =>
      generateRecommendations(
        req({ targetDepthMeters: MAX_PLANNING_DEPTH_METERS + 1 }),
        LIMITS
      )
    ).toThrow(/planning ceiling/)
  })

  it('falls back to default limits when none are supplied', () => {
    const set = generateRecommendations(req())
    expect(set.recommendations.length).toBeGreaterThan(0)
  })
})

describe('generateRecommendations — open-circuit nitrox', () => {
  it('produces an optimised bottom gas at or below the target PPO2', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 30, desiredPPO2: 1.4 }), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')
    expect(bottom).toBeDefined()
    // The whole point of rounding oxygen down: the fillable mix must never
    // exceed the planned PPO2 at depth.
    expect(bottom!.analysis.ppo2AtTarget).toBeLessThanOrEqual(1.4 + 1e-9)
  })

  it('gives EAN35 for 30 m at 1.4 bar', () => {
    // 1.4 / 4.0 bar = 0.35 exactly.
    const set = generateRecommendations(req({ targetDepthMeters: 30, desiredPPO2: 1.4 }), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.percentages.o2).toBe(35)
    expect(bottom.percentages.he).toBe(0)
    expect(bottom.label).toBe('EAN35')
  })

  it('never assigns helium in a nitrox mode even when the END field is set low', () => {
    // R6: the END control is not shown in nitrox modes, so it must not silently
    // constrain the mix.
    const set = generateRecommendations(
      req({ targetDepthMeters: 40, maxEndMeters: 20, desiredPPO2: 1.3 }),
      LIMITS
    )
    for (const rec of set.recommendations) {
      expect(rec.percentages.he).toBe(0)
    }
  })

  it('offers air when air is within the working ceiling', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 30 }), LIMITS)
    expect(set.recommendations.some((r) => r.id === 'air')).toBe(true)
  })

  it('withholds air once the dive is beyond the air MOD', () => {
    // Air at 1.4 bar reaches 56 m.
    const set = generateRecommendations(req({ targetDepthMeters: 60, desiredPPO2: 1.3 }), LIMITS)
    expect(set.recommendations.some((r) => r.id === 'air')).toBe(false)
  })

  it('withholds air when the diver has set a stricter working limit', () => {
    // At 1.2 bar air reaches 47 m, so a 50 m dive should not list it.
    const strict = { ...LIMITS, maxPPO2Work: 1.2 }
    const set = generateRecommendations(req({ targetDepthMeters: 50, desiredPPO2: 1.2 }), strict)
    expect(set.recommendations.some((r) => r.id === 'air')).toBe(false)
  })

  it('offers no decompression gas on a shallow dive', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 18 }), LIMITS)
    expect(set.recommendations.some((r) => r.role === 'deco')).toBe(false)
  })

  it('offers EAN50 once the dive is deeper than its switch depth', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 40, desiredPPO2: 1.3 }), LIMITS)
    const deco = set.recommendations.find((r) => r.id === 'deco-50')
    expect(deco).toBeDefined()
    expect(deco!.analysis.modMeters).toBe(22)
  })

  it('moves the deco switch depth when the diver lowers the deco ceiling', () => {
    // R1: the switch depth used to be hardcoded at 1.6 bar.
    const strict = { ...LIMITS, maxPPO2Deco: 1.4 }
    const set = generateRecommendations(req({ targetDepthMeters: 40, desiredPPO2: 1.3 }), strict)
    const deco = set.recommendations.find((r) => r.id === 'deco-50')!
    // 1.4/0.5 = 2.8 bar -> 18 m, not 22 m.
    expect(deco.analysis.modMeters).toBe(18)
  })

  it('does not list a deco gas whose switch depth is deeper than the dive', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 22, desiredPPO2: 1.4 }), LIMITS)
    // EAN50's MOD at 1.6 bar is 22 m, which is not shallower than the dive.
    expect(set.recommendations.some((r) => r.id === 'deco-50')).toBe(false)
  })

  it('gives every recommendation a unique id', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 45, desiredPPO2: 1.3 }), LIMITS)
    const ids = set.recommendations.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('reports fractions that sum to one on every recommendation', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 40, desiredPPO2: 1.3 }), LIMITS)
    for (const rec of set.recommendations) {
      expect(rec.mix.o2 + rec.mix.he + rec.mix.n2).toBeCloseTo(1, 9)
    }
  })
})

describe('generateRecommendations — open-circuit trimix', () => {
  const trimix = (o: Partial<RecommendationRequest> = {}) =>
    req({ mode: 'oc-trimix', targetDepthMeters: 60, maxEndMeters: 30, desiredPPO2: 1.3, ...o })

  it('adds helium once the END limit binds', () => {
    const set = generateRecommendations(trimix(), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.percentages.he).toBeGreaterThan(0)
  })

  it('holds the resulting END at or below the diver’s limit', () => {
    const set = generateRecommendations(trimix({ maxEndMeters: 30 }), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.analysis.endMeters).toBeLessThanOrEqual(30)
  })

  it('holds END at a stricter diver-set limit', () => {
    const set = generateRecommendations(trimix({ maxEndMeters: 21 }), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.analysis.endMeters).toBeLessThanOrEqual(21)
    expect(bottom.percentages.he).toBeGreaterThan(0)
  })

  it('adds more helium for a shallower END target at the same depth', () => {
    const loose = generateRecommendations(trimix({ maxEndMeters: 40 }), LIMITS)
    const tight = generateRecommendations(trimix({ maxEndMeters: 20 }), LIMITS)
    const heLoose = loose.recommendations.find((r) => r.id === 'optimised-bottom')!.percentages.he
    const heTight = tight.recommendations.find((r) => r.id === 'optimised-bottom')!.percentages.he
    expect(heTight).toBeGreaterThan(heLoose)
  })

  it('assigns no helium when the END limit is deeper than the dive', () => {
    const set = generateRecommendations(
      trimix({ targetDepthMeters: 40, maxEndMeters: 50 }),
      LIMITS
    )
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.percentages.he).toBe(0)
  })

  it('lists a travel gas when the bottom mix is hypoxic', () => {
    const set = generateRecommendations(
      trimix({ targetDepthMeters: 90, desiredPPO2: 1.2, maxEndMeters: 30 }),
      LIMITS
    )
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.analysis.hypoxic).toBe(true)
    expect(set.recommendations.some((r) => r.role === 'travel')).toBe(true)
  })

  it('lists a standard shop fill inside its depth band', () => {
    const set = generateRecommendations(trimix({ targetDepthMeters: 50 }), LIMITS)
    expect(set.recommendations.some((r) => r.id === 'standard-18-45')).toBe(true)
  })

  it('computes a standard fill’s numbers rather than quoting them', () => {
    // R4: the legacy 18/45 card asserted "MOD 56 m, END 20 m, density 5.3 g/L"
    // as literal text regardless of the diver's limits.
    const strict = { ...LIMITS, maxPPO2Work: 1.2 }
    const set = generateRecommendations(trimix({ targetDepthMeters: 50 }), strict)
    const std = set.recommendations.find((r) => r.id === 'standard-18-45')!
    // 1.2/0.18 = 6.667 bar -> 56 m at 1.2, versus 67 m at 1.4.
    expect(std.analysis.modMeters).toBe(56)
    expect(std.analysis.modPPO2).toBe(1.2)
  })

  it('does not list a standard fill outside its depth band', () => {
    const set = generateRecommendations(trimix({ targetDepthMeters: 30 }), LIMITS)
    expect(set.recommendations.some((r) => r.origin === 'standard' && r.percentages.he > 0)).toBe(
      false
    )
  })

  it('reports a failure rather than a mix when the constraints cannot be met', () => {
    // A very deep dive with a very shallow END demands more helium than exists.
    const set = generateRecommendations(
      trimix({ targetDepthMeters: 150, maxEndMeters: 20, desiredPPO2: 1.2 }),
      LIMITS
    )
    if (set.failure) {
      expect(set.failure.reason).toMatch(/helium|oxygen/i)
      expect(set.failure.suggestion.length).toBeGreaterThan(0)
    } else {
      const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
      expect(bottom.percentages.he).toBeLessThanOrEqual(MAX_HELIUM_PERCENT)
    }
  })

  it('omits the optimised bottom gas when a failure is reported', () => {
    const set = generateRecommendations(
      trimix({ targetDepthMeters: 150, maxEndMeters: 20, desiredPPO2: 1.2 }),
      LIMITS
    )
    if (set.failure) {
      expect(set.recommendations.some((r) => r.id === 'optimised-bottom')).toBe(false)
    }
  })
})

describe('generateRecommendations — rebreather', () => {
  it('labels the bottom slot as a diluent on CCR', () => {
    const set = generateRecommendations(
      req({ mode: 'ccr', targetDepthMeters: 30, desiredPPO2: 1.2 }),
      LIMITS
    )
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.role).toBe('diluent')
  })

  it('adds a bailout gas on CCR', () => {
    const set = generateRecommendations(
      req({ mode: 'ccr', targetDepthMeters: 35, desiredPPO2: 1.2 }),
      LIMITS
    )
    const bailout = set.recommendations.find((r) => r.id === 'bailout')
    expect(bailout).toBeDefined()
    expect(bailout!.role).toBe('bailout')
  })

  it('keeps the bailout PPO2 within the open-circuit working limit at depth', () => {
    const set = generateRecommendations(
      req({ mode: 'ccr', targetDepthMeters: 40, desiredPPO2: 1.2 }),
      LIMITS
    )
    const bailout = set.recommendations.find((r) => r.id === 'bailout')!
    expect(bailout.analysis.ppo2AtTarget).toBeLessThanOrEqual(LIMITS.maxPPO2Work + 1e-9)
  })

  it('gives a CCR trimix bailout helium when the END limit binds', () => {
    const set = generateRecommendations(
      req({
        mode: 'ccr-trimix',
        targetDepthMeters: 70,
        maxEndMeters: 30,
        desiredPPO2: 1.2,
      }),
      LIMITS
    )
    const bailout = set.recommendations.find((r) => r.id === 'bailout')!
    expect(bailout.percentages.he).toBeGreaterThan(0)
  })

  it('computes the CCR diluent MOD against the CCR setpoint ceiling', () => {
    const set = generateRecommendations(
      req({ mode: 'ccr', targetDepthMeters: 30, desiredPPO2: 1.2 }),
      LIMITS
    )
    const dil = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(dil.analysis.modPPO2).toBe(LIMITS.maxPPO2CCR)
  })

  it('adds no bailout gas on open circuit', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 40 }), LIMITS)
    expect(set.recommendations.some((r) => r.role === 'bailout')).toBe(false)
  })
})

describe('generateRecommendations — warnings', () => {
  it('surfaces planning warnings about the targets themselves', () => {
    const set = generateRecommendations(
      req({ targetDepthMeters: 60, desiredPPO2: 1.55 }),
      LIMITS
    )
    expect(set.planningWarnings.length).toBeGreaterThan(0)
  })

  it('orders planning warnings most serious first', () => {
    const set = generateRecommendations(
      req({ mode: 'ccr', targetDepthMeters: 45, desiredPPO2: 1.65 }),
      LIMITS
    )
    const ranks = set.planningWarnings.map((w) =>
      w.type === 'danger' ? 0 : w.type === 'warning' ? 1 : 2
    )
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  it('orders a recommendation’s own warnings most serious first', () => {
    const set = generateRecommendations(
      req({ mode: 'oc-trimix', targetDepthMeters: 90, maxEndMeters: 30, desiredPPO2: 1.3 }),
      LIMITS
    )
    for (const rec of set.recommendations) {
      const ranks = rec.warnings.map((w) =>
        w.type === 'danger' ? 0 : w.type === 'warning' ? 1 : 2
      )
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    }
  })

  it('warns about a hypoxic bottom mix', () => {
    const set = generateRecommendations(
      req({ mode: 'oc-trimix', targetDepthMeters: 90, maxEndMeters: 30, desiredPPO2: 1.2 }),
      LIMITS
    )
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.warnings.some((w) => /hypoxic/i.test(w.message))).toBe(true)
  })

  it('warns when a diver-set density limit is breached', () => {
    const strict = { ...LIMITS, maxGasDensity: 4.2, maxGasDensityCritical: 4.5 }
    const set = generateRecommendations(req({ targetDepthMeters: 40, desiredPPO2: 1.4 }), strict)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.warnings.some((w) => /density/i.test(w.message))).toBe(true)
  })

  it('produces no density warning at a depth where the default limit holds', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 20, desiredPPO2: 1.4 }), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.analysis.densityGramsPerLiter).toBeLessThan(LIMITS.maxGasDensity)
    expect(bottom.warnings.some((w) => /density/i.test(w.message))).toBe(false)
  })

  it('raises the density warning severity when the critical limit is breached', () => {
    const loose = { ...LIMITS, maxGasDensity: 3, maxGasDensityCritical: 20 }
    const strict = { ...LIMITS, maxGasDensity: 3, maxGasDensityCritical: 3.5 }
    const at = (limits: SafetyLimits) =>
      generateRecommendations(req({ targetDepthMeters: 40, desiredPPO2: 1.4 }), limits)
        .recommendations.find((r) => r.id === 'optimised-bottom')!
        .warnings.find((w) => /density/i.test(w.message))!
    // Severity comes from `generateGasWarnings`, which keys it off its own role
    // classifier (R8) — so the absolute level is not this engine's to assert.
    // What must hold is that breaching the critical limit is never *less*
    // serious than breaching the working one.
    expect(severityOrder(at(strict).type)).toBeLessThanOrEqual(
      severityOrder(at(loose).type)
    )
    expect(at(strict).message).toMatch(/critical/i)
  })

  it('names a computed bottom mix a bottom gas, not a travel gas', () => {
    // R8: `classifyGasRole` calls a 28% mix at 40 m a "travel gas" from oxygen
    // and depth alone. The diver asked for it as a bottom mix.
    const set = generateRecommendations(req({ targetDepthMeters: 40, desiredPPO2: 1.4 }), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.percentages.o2).toBe(28)
    for (const w of bottom.warnings) {
      expect(w.message).not.toMatch(/travel gas/i)
    }
    expect(bottom.warnings.some((w) => /bottom gas/i.test(w.message))).toBe(true)
  })

  it('names a rebreather bottom mix a diluent', () => {
    const set = generateRecommendations(
      req({ mode: 'ccr', targetDepthMeters: 40, desiredPPO2: 1.3 }),
      { ...LIMITS, maxEND: 20 }
    )
    const dil = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(dil.warnings.some((w) => /diluent/i.test(w.message))).toBe(true)
  })

  it('does not claim a mix exceeds the very limit it was computed for', () => {
    // R9: PPO2 at a floored MOD lands a hair above the ceiling in floating
    // point, which used to produce "1.4 bar exceeds your limit of 1.4 bar".
    const set = generateRecommendations(req({ targetDepthMeters: 40, desiredPPO2: 1.4 }), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    for (const w of bottom.warnings) {
      expect(w.message).not.toMatch(/1\.4 bar exceeds your .*limit of 1\.4 bar/)
    }
  })

  it('warns when CNS exceeds the single-exposure limit for the planned time', () => {
    const set = generateRecommendations(
      req({ targetDepthMeters: 30, desiredPPO2: 1.4, bottomTimeMinutes: 200 }),
      LIMITS
    )
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(bottom.warnings.some((w) => /CNS/.test(w.message))).toBe(true)
  })
})

describe('math derivations', () => {
  it('attaches a titled derivation with steps to every recommendation', () => {
    const set = generateRecommendations(
      req({ mode: 'oc-trimix', targetDepthMeters: 55, maxEndMeters: 30, desiredPPO2: 1.3 }),
      LIMITS
    )
    for (const rec of set.recommendations) {
      expect(rec.math.title.length).toBeGreaterThan(0)
      expect(rec.math.steps.length).toBeGreaterThan(0)
    }
  })

  it('opens every derivation with the ambient-pressure step', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 30 }), LIMITS)
    for (const rec of set.recommendations) {
      expect(rec.math.steps[0].formula).toBe(FORMULAS.ambientPressure)
    }
  })

  it('substitutes the same ambient pressure the analysis used', () => {
    const depth = 37
    const set = generateRecommendations(req({ targetDepthMeters: depth }), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    const expected = ambientPressure(depth)
    expect(bottom.analysis.ambientPressureBar).toBeCloseTo(expected, 9)
    expect(bottom.math.steps[0].result).toContain(expected.toFixed(1))
  })

  it('shows the MOD it actually reports', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 30, desiredPPO2: 1.4 }), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    const modStepLine = bottom.math.steps.find((s) => s.formula === FORMULAS.mod)!
    expect(modStepLine.result).toContain(String(bottom.analysis.modMeters))
  })

  it('shows the density it actually reports', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 30 }), LIMITS)
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    const densityLine = bottom.math.steps.find((s) => s.formula === FORMULAS.density)!
    expect(densityLine.result).toContain(bottom.analysis.densityGramsPerLiter.toFixed(1))
  })

  it('shows the END it actually reports', () => {
    const set = generateRecommendations(
      req({ mode: 'oc-trimix', targetDepthMeters: 60, maxEndMeters: 30, desiredPPO2: 1.3 }),
      LIMITS
    )
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    const endLine = bottom.math.steps.find(
      (s) => s.formula === FORMULAS.endN2 || s.formula === FORMULAS.endN2O2
    )!
    expect(endLine.result).toContain(String(bottom.analysis.endMeters))
  })

  it('switches the shown END formula with the narcosis preference', () => {
    const r = req({ mode: 'oc-trimix', targetDepthMeters: 60, maxEndMeters: 30, desiredPPO2: 1.3 })
    const n2Only = generateRecommendations(r, { ...LIMITS, oxygenNarcosisModel: false })
    const n2AndO2 = generateRecommendations(r, { ...LIMITS, oxygenNarcosisModel: true })
    const pick = (s: ReturnType<typeof generateRecommendations>) =>
      s.recommendations
        .find((x) => x.id === 'optimised-bottom')!
        .math.steps.find((x) => x.label === 'Equivalent narcotic depth')!.formula
    expect(pick(n2Only)).toBe(FORMULAS.endN2)
    expect(pick(n2AndO2)).toBe(FORMULAS.endN2O2)
  })

  it('includes a hypoxic-ceiling step only when the mix is hypoxic', () => {
    const hypoxicSet = generateRecommendations(
      req({ mode: 'oc-trimix', targetDepthMeters: 90, maxEndMeters: 30, desiredPPO2: 1.2 }),
      LIMITS
    )
    const hypoxicBottom = hypoxicSet.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(
      hypoxicBottom.math.steps.some((s) => s.formula === FORMULAS.hypoxicCeiling)
    ).toBe(true)

    const normoxicSet = generateRecommendations(req({ targetDepthMeters: 30 }), LIMITS)
    const normoxicBottom = normoxicSet.recommendations.find((r) => r.id === 'optimised-bottom')!
    expect(
      normoxicBottom.math.steps.some((s) => s.formula === FORMULAS.hypoxicCeiling)
    ).toBe(false)
  })

  it('emits LaTeX without delimiters, so the renderer owns them', () => {
    const set = generateRecommendations(req({ targetDepthMeters: 30 }), LIMITS)
    for (const rec of set.recommendations) {
      for (const step of rec.math.steps) {
        for (const piece of [step.formula, step.substitution, step.result]) {
          if (piece) expect(piece).not.toContain('$')
        }
      }
    }
  })

  it('carries no HTML markup in a derivation', () => {
    // The legacy strings were HTML blobs with <strong> and <br/> inside them.
    const set = generateRecommendations(req({ targetDepthMeters: 30 }), LIMITS)
    for (const rec of set.recommendations) {
      for (const step of rec.math.steps) {
        for (const piece of [step.label, step.formula, step.substitution, step.result, step.note]) {
          if (piece) expect(piece).not.toMatch(/<[a-z/]/i)
        }
      }
    }
  })

  it('attaches a derivation to a failure explaining why no mix exists', () => {
    const set = generateRecommendations(
      req({ mode: 'oc-trimix', targetDepthMeters: 150, maxEndMeters: 20, desiredPPO2: 1.2 }),
      LIMITS
    )
    if (set.failure) {
      expect(set.failure.math.steps.length).toBeGreaterThan(0)
    }
  })
})

describe('a bailout must be breathable at the depth it is carried to', () => {
  const deepCCR = (depthMeters: number) =>
    generateRecommendations(
      {
        mode: 'ccr-trimix',
        targetDepthMeters: depthMeters,
        maxEndMeters: 30,
        desiredPPO2: 1.3,
        bottomTimeMinutes: 20,
      },
      { ...DEFAULT_SAFETY_LIMITS, maxPPO2Work: 1.2 }
    )

  const bailoutOf = (set: ReturnType<typeof generateRecommendations>) =>
    set.recommendations.find((r) => r.role === 'bailout')

  it('does not claim a mix is within the limit when it is not', () => {
    // Oxygen is floored at MIN_VIABLE_O2_PERCENT so the gas stays breathable,
    // and past roughly 140 m that floor puts ppO2 above the working limit the
    // mix was solved for. Re-derived here rather than read back from the
    // engine: 8% of 16 bar absolute at 150 m is 1.28 bar against a 1.20 limit.
    const set = deepCCR(150)
    const bailout = bailoutOf(set)
    expect(bailout).toBeDefined()

    const ppo2 = bailout!.mix.o2 * (150 / 10 + 1)
    expect(ppo2).toBeGreaterThan(1.2)

    expect(bailout!.rationale).not.toMatch(/within your .* working limit/)
    expect(bailout!.rationale).toContain('above your')
  })

  it('states the true ppO₂ and the reason for it', () => {
    const bailout = bailoutOf(deepCCR(150))!
    expect(bailout.rationale).toContain('1.28 bar')
    expect(bailout.rationale).toMatch(/floor for a breathable gas/)
  })

  it('raises a planning warning when the bailout cannot reach the dive', () => {
    const set = deepCCR(150)
    const reach = set.planningWarnings.find((w) => /Bailout gas reaches only/.test(w.message))
    expect(reach, 'expected a bailout reach warning').toBeDefined()
    expect(reach!.type).toBe('danger')
    expect(reach!.message).toContain('150 m')
    expect(reach!.message).toContain('breathable at the deepest point')
  })

  it('still says "within your limit" where the mix genuinely is', () => {
    // 100 m: 10% of 11 bar is 1.10 bar, comfortably inside 1.20. The honest
    // claim must survive the fix, or every bailout would read as a breach.
    const bailout = bailoutOf(deepCCR(100))!
    expect(bailout.mix.o2 * 11).toBeLessThan(1.2)
    expect(bailout.rationale).toMatch(/within your 1\.20 bar working limit/)
  })
})

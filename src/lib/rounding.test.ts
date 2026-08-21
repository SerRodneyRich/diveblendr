import { describe, it, expect } from 'vitest'
import {
  ceilTo,
  floorTo,
  roundTo,
  roundO2,
  roundNarcoticFraction,
  roundHe,
  roundMOD,
  roundEND,
  roundHypoxicCeiling,
  roundDensity,
  roundPressure,
} from './rounding'

/**
 * Rounding direction is a safety property here, not a formatting one: which way
 * a fraction is rounded decides whether the limit it produces is conservative
 * or optimistic. These tests pin the direction of every context, so a change
 * that quietly makes a limit *less* conservative fails rather than shipping.
 *
 * The module exists because the version it replaced chose direction by species
 * — oxygen always down — on the reasoning that a lower FO2 was "safer for MOD".
 * That is backwards: MOD = (PPO2/FO2 − 1) × 10 varies inversely with FO2, so
 * understating FO2 deepens the computed MOD.
 */
describe('primitives', () => {
  it('ceilTo rounds up at the requested precision', () => {
    expect(ceilTo(1.201, 2)).toBe(1.21)
    expect(ceilTo(1.2, 2)).toBe(1.2)
  })

  it('floorTo rounds down at the requested precision', () => {
    expect(floorTo(1.209, 2)).toBe(1.2)
    expect(floorTo(1.2, 2)).toBe(1.2)
  })

  it('roundTo rounds to nearest', () => {
    expect(roundTo(1.25, 1)).toBe(1.3)
    expect(roundTo(1.24, 1)).toBe(1.2)
  })

  // Without an epsilon nudge, 0.33 * 100 evaluates to 33.000000000000004 and
  // ceilTo(0.33, 2) returns 0.34 — a fraction the diver never entered.
  it('does not inflate a value through float representation error', () => {
    expect(ceilTo(0.33, 2)).toBe(0.33)
    expect(ceilTo(0.07, 2)).toBe(0.07)
    expect(floorTo(0.29, 2)).toBe(0.29)
  })

  it('refuses a non-finite value rather than returning NaN', () => {
    expect(() => ceilTo(NaN)).toThrow()
    expect(() => floorTo(Infinity)).toThrow()
    expect(() => roundTo(-Infinity)).toThrow()
  })
})

describe('roundO2 — direction depends on what the fraction is for', () => {
  // Higher FO2 -> shallower MOD -> more conservative.
  it('rounds UP for a MOD or oxygen-toxicity calculation', () => {
    expect(roundO2(0.321, 'mod', 2)).toBe(0.33)
  })

  // Lower FO2 -> a deeper hypoxic ceiling is assumed -> more conservative.
  it('rounds DOWN for a hypoxia check', () => {
    expect(roundO2(0.329, 'hypoxia', 2)).toBe(0.32)
  })

  it('rounds the two contexts in opposite directions from the same input', () => {
    const raw = 0.325
    expect(roundO2(raw, 'mod', 2)).toBeGreaterThanOrEqual(raw)
    expect(roundO2(raw, 'hypoxia', 2)).toBeLessThanOrEqual(raw)
  })
})

describe('roundNarcoticFraction / roundHe', () => {
  // More narcotic gas assumed -> deeper END -> more conservative.
  it('rounds the narcotic fraction UP', () => {
    expect(roundNarcoticFraction(0.681, 2)).toBe(0.69)
  })

  /**
   * Helium rounds DOWN, which is the opposite of the narcotic fraction and of
   * the rule this module replaced. Helium is neither narcotic nor toxic in the
   * ranges of interest and is the lightest species, so assuming *less* of it
   * overstates both the narcosis and the density the diver will actually meet.
   * Rounding it up would flatter both numbers.
   */
  it('rounds helium DOWN', () => {
    expect(roundHe(0.259, 2)).toBe(0.25)
  })
})

describe('depth and figure results', () => {
  // A shallower limit is the conservative one.
  it('floors MOD to a whole metre', () => {
    expect(roundMOD(56.9)).toBe(56)
    expect(roundMOD(56.0)).toBe(56)
  })

  // A deeper narcosis estimate is the conservative one.
  it('ceils END to a whole metre', () => {
    expect(roundEND(39.1)).toBe(40)
    expect(roundEND(39.0)).toBe(39)
  })

  // A deeper hypoxic ceiling is the conservative one.
  it('ceils the hypoxic ceiling', () => {
    expect(roundHypoxicCeiling(5.1)).toBe(6)
  })

  // A heavier gas assumed -> higher work of breathing flagged sooner.
  it('ceils density', () => {
    expect(roundDensity(5.71)).toBe(5.8)
  })

  // Display precision (0.1 bar), not a safety direction — a cylinder pressure
  // is read off a gauge, not used as a limit.
  it('rounds pressure to nearest 0.1 bar', () => {
    expect(roundPressure(200.44)).toBe(200.4)
    expect(roundPressure(200.46)).toBe(200.5)
  })
})

describe('the F6 regression', () => {
  /**
   * The specific bug: rounding O2 down before a MOD calculation produces a MOD
   * *deeper* than the true one, which is the unsafe direction. Assert the
   * relationship rather than a magic number.
   */
  it('never reports a MOD deeper than the unrounded value', () => {
    const ppo2 = 1.4
    const rawFo2 = 0.3207
    const modFrom = (fo2: number) => (ppo2 / fo2 - 1) * 10

    const trueMod = modFrom(rawFo2)
    const roundedMod = modFrom(roundO2(rawFo2, 'mod', 2))

    expect(roundedMod).toBeLessThanOrEqual(trueMod)
  })

  it('never reports a hypoxic ceiling shallower than the unrounded value', () => {
    const floorPpo2 = 0.16
    const rawFo2 = 0.1803
    const ceilFrom = (fo2: number) => (floorPpo2 / fo2 - 1) * 10

    expect(ceilFrom(roundO2(rawFo2, 'hypoxia', 2))).toBeGreaterThanOrEqual(
      ceilFrom(rawFo2)
    )
  })
})

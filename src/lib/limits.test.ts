import { describe, it, expect } from 'vitest'
import {
  ABSOLUTE_MAX_PPO2,
  DEFAULT_SAFETY_LIMITS,
  HYPOXIA_PPO2_FLOOR,
  MIN_VIABLE_O2_PERCENT,
  SAFETY_LIMIT_RANGES,
  maxPPO2For,
  normalizeSafetyLimits,
} from './limits'

/**
 * Every warning in the app is evaluated against the limits this module returns,
 * and the values reaching it come from localStorage — a preferences blob a user
 * can hand-edit, and an older release can have written in a different shape.
 * `normalizeSafetyLimits` is the only thing standing between that and the
 * calculations, so its clamping and its two ordering invariants are pinned
 * here.
 */
describe('published constants', () => {
  it('pins the physiological anchors', () => {
    // NOAA: below ~0.16 bar inspired PPO2 a diver loses useful consciousness.
    expect(HYPOXIA_PPO2_FLOOR).toBe(0.16)
    // 1.6 bar is the universally taught deco ceiling; nothing may exceed it.
    expect(ABSOLUTE_MAX_PPO2).toBe(1.6)
    expect(MIN_VIABLE_O2_PERCENT).toBe(8)
  })

  it('ships defaults that sit inside their own ranges', () => {
    for (const [key, range] of Object.entries(SAFETY_LIMIT_RANGES)) {
      const value = DEFAULT_SAFETY_LIMITS[key as keyof typeof SAFETY_LIMIT_RANGES]
      expect(value).toBeGreaterThanOrEqual(range.min)
      expect(value).toBeLessThanOrEqual(range.max)
    }
  })

  it('ships defaults that satisfy the ordering invariants', () => {
    expect(DEFAULT_SAFETY_LIMITS.maxPPO2Deco).toBeGreaterThanOrEqual(
      DEFAULT_SAFETY_LIMITS.maxPPO2Work
    )
    expect(DEFAULT_SAFETY_LIMITS.maxGasDensityCritical).toBeGreaterThanOrEqual(
      DEFAULT_SAFETY_LIMITS.maxGasDensity
    )
  })
})

describe('normalizeSafetyLimits', () => {
  it('returns the defaults for no input', () => {
    expect(normalizeSafetyLimits()).toEqual(DEFAULT_SAFETY_LIMITS)
  })

  it('keeps a valid partial and fills the rest from defaults', () => {
    const result = normalizeSafetyLimits({ maxPPO2Work: 1.3 })
    expect(result.maxPPO2Work).toBe(1.3)
    expect(result.maxEND).toBe(DEFAULT_SAFETY_LIMITS.maxEND)
  })

  it('clamps a value above its range down to the maximum', () => {
    const result = normalizeSafetyLimits({ maxPPO2Work: 99 })
    expect(result.maxPPO2Work).toBe(SAFETY_LIMIT_RANGES.maxPPO2Work.max)
  })

  it('clamps a value below its range up to the minimum', () => {
    const result = normalizeSafetyLimits({ maxEND: -50 })
    expect(result.maxEND).toBe(SAFETY_LIMIT_RANGES.maxEND.min)
  })

  // A hand-edited or corrupted preferences blob is the realistic source here.
  it('falls back to the default for a non-finite value rather than emitting NaN', () => {
    const result = normalizeSafetyLimits({
      maxPPO2Work: NaN,
      maxGasDensity: Infinity,
    })
    expect(result.maxPPO2Work).toBe(DEFAULT_SAFETY_LIMITS.maxPPO2Work)
    expect(result.maxGasDensity).toBe(DEFAULT_SAFETY_LIMITS.maxGasDensity)
  })

  // A deco gas is breathed at rest on ascent, so its ceiling may be higher than
  // a working gas's — never lower. A preferences file saying otherwise would
  // otherwise let the deco check pass a gas the working check rejects.
  it('raises a deco ceiling that was set below the working ceiling', () => {
    const result = normalizeSafetyLimits({ maxPPO2Work: 1.4, maxPPO2Deco: 1.2 })
    expect(result.maxPPO2Deco).toBe(1.4)
  })

  it('leaves a deco ceiling already above the working ceiling alone', () => {
    const result = normalizeSafetyLimits({ maxPPO2Work: 1.2, maxPPO2Deco: 1.6 })
    expect(result.maxPPO2Deco).toBe(1.6)
  })

  it('raises a critical density that was set below the working threshold', () => {
    const result = normalizeSafetyLimits({
      maxGasDensity: 6.0,
      maxGasDensityCritical: 5.0,
    })
    expect(result.maxGasDensityCritical).toBe(6.0)
  })

  it('coerces a non-boolean narcosis model flag to false', () => {
    const result = normalizeSafetyLimits({
      oxygenNarcosisModel: 'yes' as unknown as boolean,
    })
    expect(result.oxygenNarcosisModel).toBe(false)
  })

  it('is idempotent — normalizing twice changes nothing', () => {
    const once = normalizeSafetyLimits({ maxPPO2Work: 99, maxPPO2Deco: 0.1 })
    expect(normalizeSafetyLimits(once)).toEqual(once)
  })

  it('never returns a PPO2 above the absolute ceiling', () => {
    const result = normalizeSafetyLimits({
      maxPPO2Work: 99,
      maxPPO2Deco: 99,
      maxPPO2CCR: 99,
    })
    expect(result.maxPPO2Work).toBeLessThanOrEqual(ABSOLUTE_MAX_PPO2)
    expect(result.maxPPO2Deco).toBeLessThanOrEqual(ABSOLUTE_MAX_PPO2)
    expect(result.maxPPO2CCR).toBeLessThanOrEqual(ABSOLUTE_MAX_PPO2)
  })
})

describe('maxPPO2For', () => {
  const limits = normalizeSafetyLimits({
    maxPPO2Work: 1.4,
    maxPPO2Deco: 1.6,
    maxPPO2CCR: 1.3,
  })

  it('returns the ceiling matching each gas role', () => {
    expect(maxPPO2For(limits, 'work')).toBe(1.4)
    expect(maxPPO2For(limits, 'deco')).toBe(1.6)
    expect(maxPPO2For(limits, 'ccr')).toBe(1.3)
  })
})

describe('the preferences UI cannot offer a value the library rejects', () => {
  it('every configurable limit has a published range', () => {
    // The modal spreads SAFETY_LIMIT_RANGES into its sliders. Hand-copied
    // bounds had drifted from these — density reached 7.0 against a 6.2 cap —
    // so the UI offered a setting normalizeSafetyLimits would silently clamp.
    const configurable = Object.keys(DEFAULT_SAFETY_LIMITS).filter(
      (k) => k !== 'oxygenNarcosisModel'
    )
    for (const key of configurable) {
      expect(SAFETY_LIMIT_RANGES[key as keyof typeof SAFETY_LIMIT_RANGES]).toBeDefined()
    }
  })

  it('every default sits inside its own range', () => {
    for (const [key, range] of Object.entries(SAFETY_LIMIT_RANGES)) {
      const value = DEFAULT_SAFETY_LIMITS[key as keyof typeof SAFETY_LIMIT_RANGES]
      expect(value, `${key} default out of range`).toBeGreaterThanOrEqual(range.min)
      expect(value, `${key} default out of range`).toBeLessThanOrEqual(range.max)
    }
  })

  it('keeps the critical density at or above the target, however it is set', () => {
    // The modal now exposes both, so a diver can raise the target past the
    // ceiling. The library resolves that rather than inverting the pair.
    const limits = normalizeSafetyLimits({ maxGasDensity: 6.0, maxGasDensityCritical: 5.2 })
    expect(limits.maxGasDensityCritical).toBeGreaterThanOrEqual(limits.maxGasDensity)
  })
})

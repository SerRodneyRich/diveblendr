import { describe, it, expect } from 'vitest'
import {
  ambientPressure,
  depthFromPressure,
  waterDensity,
  STANDARD_SURFACE_PRESSURE_BAR,
  SEAWATER_DENSITY_KG_L,
  FRESHWATER_DENSITY_KG_L,
} from './pressure'

describe('ambientPressure — simple model (default)', () => {
  it('is 1 bar at the surface', () => {
    expect(ambientPressure(0)).toBe(1)
  })

  it('adds exactly 1 bar per 10 m', () => {
    expect(ambientPressure(10)).toBe(2)
    expect(ambientPressure(30)).toBe(4)
    expect(ambientPressure(40)).toBe(5)
    expect(ambientPressure(100)).toBe(11)
  })

  it('handles fractional depths linearly', () => {
    expect(ambientPressure(4.5)).toBeCloseTo(1.45, 10)
    expect(ambientPressure(33.75)).toBeCloseTo(4.375, 10)
  })

  it('rejects negative depth', () => {
    expect(() => ambientPressure(-1)).toThrow(/negative/i)
  })

  it('rejects non-finite depth', () => {
    expect(() => ambientPressure(NaN)).toThrow(/finite/i)
    expect(() => ambientPressure(Infinity)).toThrow(/finite/i)
  })
})

describe('ambientPressure — physical model', () => {
  // Seawater at 1.03 kg/L: 10 m gives 1.03 * 1000 * 9.80665 * 10 / 100000
  // = 1.010085 bar of hydrostatic pressure, so 10 m -> 1.01325 + 1.010085
  // = 2.023335 bar. That the physical model exceeds the 2 bar of the simple
  // model is expected: 10 msw is defined as 1 bar of *gauge* pressure at a
  // slightly lower reference density than 1.03 kg/L.
  it('gives ~2.023 bar at 10 m of seawater', () => {
    const p = ambientPressure(10, { simple: false })
    expect(p).toBeCloseTo(2.0233, 3)
  })

  it('is within 2% of the simple model at recreational depths in seawater', () => {
    for (const depth of [10, 20, 30, 40]) {
      const simple = ambientPressure(depth)
      const physical = ambientPressure(depth, { simple: false })
      expect(Math.abs(physical - simple) / simple).toBeLessThan(0.02)
    }
  })

  it('gives lower pressure in fresh water than salt at the same depth', () => {
    const salt = ambientPressure(40, { simple: false, waterDensityKgL: SEAWATER_DENSITY_KG_L })
    const fresh = ambientPressure(40, { simple: false, waterDensityKgL: FRESHWATER_DENSITY_KG_L })
    expect(fresh).toBeLessThan(salt)
  })

  it('returns exactly the surface pressure at zero depth', () => {
    expect(ambientPressure(0, { simple: false })).toBe(STANDARD_SURFACE_PRESSURE_BAR)
    expect(ambientPressure(0, { simple: false, surfacePressureBar: 0.79 })).toBe(0.79)
  })

  it('models altitude by lowering surface pressure', () => {
    // ~2000 m altitude is roughly 0.79 bar.
    const atAltitude = ambientPressure(20, { simple: false, surfacePressureBar: 0.79 })
    const atSeaLevel = ambientPressure(20, { simple: false })
    expect(atAltitude).toBeLessThan(atSeaLevel)
    expect(atSeaLevel - atAltitude).toBeCloseTo(STANDARD_SURFACE_PRESSURE_BAR - 0.79, 6)
  })

  it('rejects a non-positive surface pressure or water density', () => {
    expect(() => ambientPressure(10, { simple: false, surfacePressureBar: 0 })).toThrow()
    expect(() => ambientPressure(10, { simple: false, waterDensityKgL: 0 })).toThrow()
  })
})

describe('depthFromPressure', () => {
  it('inverts ambientPressure in the simple model', () => {
    for (const depth of [0, 6, 12, 33.75, 56, 100, 150]) {
      expect(depthFromPressure(ambientPressure(depth))).toBeCloseTo(depth, 9)
    }
  })

  it('inverts ambientPressure in the physical model', () => {
    const opts = { simple: false as const }
    for (const depth of [0, 6, 12, 40, 90, 150]) {
      expect(depthFromPressure(ambientPressure(depth, opts), opts)).toBeCloseTo(depth, 6)
    }
  })

  it('inverts ambientPressure at altitude in fresh water', () => {
    const opts = { simple: false as const, surfacePressureBar: 0.79, waterDensityKgL: 1.0 }
    for (const depth of [0, 15, 30, 45]) {
      expect(depthFromPressure(ambientPressure(depth, opts), opts)).toBeCloseTo(depth, 6)
    }
  })

  it('rejects a pressure below the surface pressure', () => {
    expect(() => depthFromPressure(0.5)).toThrow()
    expect(() => depthFromPressure(0.9, { simple: false })).toThrow()
  })
})

describe('waterDensity', () => {
  it('returns the salt and fresh constants', () => {
    expect(waterDensity('salt')).toBe(SEAWATER_DENSITY_KG_L)
    expect(waterDensity('fresh')).toBe(FRESHWATER_DENSITY_KG_L)
  })
})

describe('monotonicity property', () => {
  it('pressure increases strictly with depth in both models', () => {
    let prevSimple = -Infinity
    let prevPhysical = -Infinity
    for (let d = 0; d <= 200; d += 2.5) {
      const s = ambientPressure(d)
      const p = ambientPressure(d, { simple: false })
      expect(s).toBeGreaterThan(prevSimple)
      expect(p).toBeGreaterThan(prevPhysical)
      prevSimple = s
      prevPhysical = p
    }
  })
})

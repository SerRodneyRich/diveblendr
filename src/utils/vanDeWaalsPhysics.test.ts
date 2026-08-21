import { describe, it, expect } from 'vitest'
import {
  solveMolarVolumeChecked,
  solveMolarVolume,
  calculateMixtureConstants,
  stateFromPressure,
  pressureFromMoles,
  shouldUseRealGas,
  isVanDerWaalsSuitable,
  temperatureUtils,
  GAS_CONSTANTS,
  R_GAS_CONSTANT,
  type GasMixture,
} from './vanDeWaalsPhysics'

const AIR: GasMixture = { O2: 21, He: 0, N2: 79 }
const PURE_HE: GasMixture = { O2: 0, He: 100, N2: 0 }
const TRIMIX_50_25_25: GasMixture = { O2: 25, He: 50, N2: 25 }
const TRIMIX_18_45: GasMixture = { O2: 18, He: 45, N2: 37 }

describe('calculateMixtureConstants', () => {
  it('returns the pure-species constants for a pure gas', () => {
    const he = calculateMixtureConstants(PURE_HE)
    expect(he.a).toBeCloseTo(GAS_CONSTANTS.He.a, 9)
    expect(he.b).toBeCloseTo(GAS_CONSTANTS.He.b, 9)
    expect(he.molarMass).toBeCloseTo(GAS_CONSTANTS.He.molarMass, 9)
  })

  it('gives air a molar mass of ~28.85 g/mol', () => {
    expect(calculateMixtureConstants(AIR).molarMass).toBeCloseTo(28.85, 2)
  })

  it('lowers `a` as helium replaces nitrogen', () => {
    let prev = Infinity
    for (let he = 0; he <= 80; he += 10) {
      const mix: GasMixture = { O2: 20, He: he, N2: 80 - he }
      const a = calculateMixtureConstants(mix).a
      expect(a).toBeLessThan(prev)
      prev = a
    }
  })

  it('produces finite constants for every mixture on a grid', () => {
    for (let o2 = 0; o2 <= 100; o2 += 10) {
      for (let he = 0; he + o2 <= 100; he += 10) {
        const c = calculateMixtureConstants({ O2: o2, He: he, N2: 100 - o2 - he })
        expect(Number.isFinite(c.a)).toBe(true)
        expect(Number.isFinite(c.b)).toBe(true)
        expect(Number.isFinite(c.molarMass)).toBe(true)
        expect(c.b).toBeGreaterThan(0)
      }
    }
  })
})

/**
 * F9 — the solver reported no convergence signal, so callers could not tell a
 * settled root from an iterate it had given up on.
 */
describe('solveMolarVolumeChecked — convergence reporting', () => {
  const T = temperatureUtils.celsiusToKelvin(20)

  it('converges for 300 bar of pure helium', () => {
    const r = solveMolarVolumeChecked(300, T, calculateMixtureConstants(PURE_HE))
    expect(r.converged).toBe(true)
    expect(r.value).toBeGreaterThan(0)
    expect(Number.isFinite(r.value)).toBe(true)
  })

  it('converges for 300 bar of 25/50/25 trimix', () => {
    const r = solveMolarVolumeChecked(300, T, calculateMixtureConstants(TRIMIX_50_25_25))
    expect(r.converged).toBe(true)
    expect(r.value).toBeGreaterThan(0)
  })

  it('converges for 1 bar of air', () => {
    const r = solveMolarVolumeChecked(1, T, calculateMixtureConstants(AIR))
    expect(r.converged).toBe(true)
    // At 1 bar the gas is essentially ideal: Vm ~ RT/P ~ 24.4 L/mol.
    expect(r.value).toBeCloseTo((R_GAS_CONSTANT * T) / 1, 1)
  })

  it('converges across the full practical pressure range for air', () => {
    for (const p of [1, 50, 100, 150, 200, 232, 300]) {
      const r = solveMolarVolumeChecked(p, T, calculateMixtureConstants(AIR))
      expect(r.converged, `${p} bar`).toBe(true)
      expect(r.value, `${p} bar`).toBeGreaterThan(calculateMixtureConstants(AIR).b)
    }
  })

  it('reports non-convergence rather than a bad value for a non-physical pressure', () => {
    const r = solveMolarVolumeChecked(0, T, calculateMixtureConstants(AIR))
    expect(r.converged).toBe(false)
  })

  it('reports non-convergence when starved of iterations', () => {
    const r = solveMolarVolumeChecked(300, T, calculateMixtureConstants(AIR), 1)
    expect(r.converged).toBe(false)
    expect(r.iterations).toBe(1)
  })

  it('always leaves the molar volume above the excluded volume when converged', () => {
    for (const mix of [AIR, PURE_HE, TRIMIX_18_45, TRIMIX_50_25_25]) {
      const c = calculateMixtureConstants(mix)
      for (const p of [50, 150, 300]) {
        const r = solveMolarVolumeChecked(p, T, c)
        if (r.converged) expect(r.value).toBeGreaterThan(c.b)
      }
    }
  })

  it('satisfies the Van der Waals equation at the returned root', () => {
    const c = calculateMixtureConstants(AIR)
    for (const p of [50, 150, 232]) {
      const r = solveMolarVolumeChecked(p, T, c)
      expect(r.converged).toBe(true)
      const V = r.value
      const residual = (p + c.a / (V * V)) * (V - c.b) - R_GAS_CONSTANT * T
      expect(Math.abs(residual)).toBeLessThan(1e-6)
    }
  })

  it('agrees with the bare solveMolarVolume wrapper', () => {
    const c = calculateMixtureConstants(AIR)
    expect(solveMolarVolume(200, T, c)).toBe(solveMolarVolumeChecked(200, T, c).value)
  })
})

describe('stateFromPressure', () => {
  it('reports a compressibility factor below 1 at moderate pressure for air', () => {
    // Air is more compressible than ideal below ~200 bar.
    const s = stateFromPressure(165, 15, AIR, 12)
    expect(s.compressibilityFactor).toBeLessThan(1)
    expect(s.converged).toBe(true)
  })

  it('reports a compressibility factor above 1 at high pressure for air', () => {
    // Above ~230 bar the repulsive term dominates and Z exceeds 1.
    const s = stateFromPressure(300, 15, AIR, 12)
    expect(s.compressibilityFactor).toBeGreaterThan(1)
  })

  it('reports Z above 1 for helium at all practical pressures', () => {
    // Helium's tiny attractive term means it is less compressible than ideal
    // essentially everywhere in the diving range.
    for (const p of [100, 200, 300]) {
      expect(stateFromPressure(p, 20, PURE_HE, 12).compressibilityFactor).toBeGreaterThan(1)
    }
  })

  it('is near-ideal at 1 bar', () => {
    expect(stateFromPressure(1, 20, AIR, 12).compressibilityFactor).toBeCloseTo(1, 2)
  })

  it('scales moles linearly with tank size', () => {
    const small = stateFromPressure(200, 20, AIR, 6)
    const large = stateFromPressure(200, 20, AIR, 12)
    expect(large.molesInTank).toBeCloseTo(small.molesInTank * 2, 6)
  })

  it('returns an empty state for a non-positive pressure', () => {
    const s = stateFromPressure(0, 20, AIR, 12)
    expect(s.molesInTank).toBe(0)
    expect(s.converged).toBe(true)
  })

  it('rejects a temperature outside the valid range', () => {
    expect(() => stateFromPressure(200, 80, AIR, 12)).toThrow(/Temperature/)
    expect(() => stateFromPressure(200, -50, AIR, 12)).toThrow(/Temperature/)
  })
})

describe('pressureFromMoles', () => {
  it('inverts stateFromPressure', () => {
    for (const p of [50, 150, 232, 300]) {
      for (const mix of [AIR, TRIMIX_18_45, PURE_HE]) {
        const moles = stateFromPressure(p, 20, mix, 12).molesInTank
        const back = pressureFromMoles(moles, 20, mix, 12)
        expect(back.pressureBar, `${p} bar`).toBeCloseTo(p, 4)
        expect(back.converged).toBe(true)
      }
    }
  })

  it('rises monotonically with moles', () => {
    let prev = -1
    for (let moles = 1; moles <= 200; moles += 10) {
      const p = pressureFromMoles(moles, 20, AIR, 12).pressureBar
      expect(p).toBeGreaterThan(prev)
      prev = p
    }
  })

  /**
   * F9 — the pathological case. A tiny tank at very high mole count drives the
   * molar volume down toward the excluded volume, where Van der Waals has no
   * useful root. That used to emit a console.warn and switch models silently.
   */
  it('reports converged: false instead of warning when the state is unphysical', () => {
    const constants = calculateMixtureConstants(AIR)
    // Choose moles so that Vm = tankSize / moles falls below b * 1.1.
    const tankSize = 0.1
    const moles = tankSize / (constants.b * 1.05)
    const result = pressureFromMoles(moles, 20, AIR, tankSize)
    expect(result.converged).toBe(false)
    // The fallback is the ideal gas law, so Z is reported as exactly 1.
    expect(result.compressibilityFactor).toBe(1)
    expect(Number.isFinite(result.pressureBar)).toBe(true)
  })

  it('reports converged: true for ordinary cylinder states', () => {
    for (const tankSize of [3, 11.1, 12, 24]) {
      const moles = stateFromPressure(200, 20, AIR, tankSize).molesInTank
      expect(pressureFromMoles(moles, 20, AIR, tankSize).converged, `${tankSize} L`).toBe(true)
    }
  })

  it('rejects negative moles and invalid temperatures', () => {
    expect(() => pressureFromMoles(-1, 20, AIR, 12)).toThrow()
    expect(() => pressureFromMoles(10, 100, AIR, 12)).toThrow()
  })
})

describe('shouldUseRealGas / isVanDerWaalsSuitable', () => {
  it('recommends real gas above 150 bar', () => {
    expect(shouldUseRealGas(200, 20, AIR)).toBe(true)
    expect(shouldUseRealGas(100, 20, AIR)).toBe(false)
  })

  it('recommends real gas for cold high-pressure fills', () => {
    expect(shouldUseRealGas(120, 5, AIR)).toBe(true)
  })

  it('recommends real gas for helium-rich high-pressure mixes', () => {
    expect(shouldUseRealGas(220, 20, { O2: 10, He: 70, N2: 20 })).toBe(true)
  })

  it('rules Van der Waals unsuitable for very small cylinders', () => {
    expect(isVanDerWaalsSuitable(0.5, 300, 20, AIR)).toBe(false)
  })

  it('rules Van der Waals suitable for a normal high-pressure cylinder', () => {
    expect(isVanDerWaalsSuitable(12, 300, 20, AIR)).toBe(true)
  })

  it('rules it unsuitable where real-gas effects do not matter', () => {
    expect(isVanDerWaalsSuitable(12, 50, 20, AIR)).toBe(false)
  })
})

describe('temperatureUtils', () => {
  it('converts between Celsius and Kelvin', () => {
    expect(temperatureUtils.celsiusToKelvin(0)).toBeCloseTo(273.15, 9)
    expect(temperatureUtils.kelvinToCelsius(273.15)).toBeCloseTo(0, 9)
  })

  it('round-trips', () => {
    for (const c of [-10, 0, 15, 20, 40]) {
      expect(temperatureUtils.kelvinToCelsius(temperatureUtils.celsiusToKelvin(c))).toBeCloseTo(c, 9)
    }
  })

  it('validates the diving temperature range', () => {
    expect(temperatureUtils.isValidTemperature(20)).toBe(true)
    expect(temperatureUtils.isValidTemperature(-20)).toBe(false)
    expect(temperatureUtils.isValidTemperature(60)).toBe(false)
  })
})

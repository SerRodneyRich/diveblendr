import { describe, it, expect } from 'vitest'
import {
  gas,
  fromPercentages,
  toPercentages,
  isValidGas,
  molarMass,
  densityAtPressure,
  densityAtDepth,
  ppo2AtDepth,
  modRaw,
  endRaw,
  hypoxicCeilingRaw,
  formatMix,
  AIR,
  PURE_O2,
  PURE_HE,
} from './gas'

describe('gas() constructor', () => {
  it('computes nitrogen as the balance', () => {
    const g = gas(0.18, 0.45)
    expect(g.o2).toBeCloseTo(0.18, 12)
    expect(g.he).toBeCloseTo(0.45, 12)
    expect(g.n2).toBeCloseTo(0.37, 12)
  })

  it('defaults helium to zero', () => {
    expect(gas(0.32).he).toBe(0)
    expect(gas(0.32).n2).toBeCloseTo(0.68, 12)
  })

  it('rejects fractions outside [0, 1]', () => {
    expect(() => gas(1.5)).toThrow()
    expect(() => gas(-0.1)).toThrow()
    expect(() => gas(0.2, 1.2)).toThrow()
  })

  it('rejects an oxygen + helium total above 100%', () => {
    expect(() => gas(0.6, 0.6)).toThrow(/exceeds 100/i)
  })

  it('rejects non-finite input', () => {
    expect(() => gas(NaN)).toThrow(/finite/i)
  })
})

describe('fromPercentages / toPercentages', () => {
  it('round-trips air', () => {
    const p = toPercentages(fromPercentages({ oxygen: 21, helium: 0 }))
    expect(p.oxygen).toBeCloseTo(21, 9)
    expect(p.nitrogen).toBeCloseTo(79, 9)
  })

  it('round-trips a trimix', () => {
    const p = toPercentages(fromPercentages({ oxygen: 18, helium: 45 }))
    expect(p.oxygen).toBeCloseTo(18, 9)
    expect(p.helium).toBeCloseTo(45, 9)
    expect(p.nitrogen).toBeCloseTo(37, 9)
  })

  // F10: the old validator accepted totals from 98 to 102.
  it('rejects a total more than 0.5 points from 100', () => {
    expect(() => fromPercentages({ oxygen: 20, helium: 0, nitrogen: 79 })).toThrow(/total 100/i)
    expect(() => fromPercentages({ oxygen: 22, helium: 0, nitrogen: 79 })).toThrow(/total 100/i)
  })

  it('accepts a total within 0.5 points of 100 and renormalises', () => {
    const g = fromPercentages({ oxygen: 21, helium: 0, nitrogen: 79.3 })
    expect(isValidGas(g)).toBe(true)
    expect(g.o2 + g.he + g.n2).toBeCloseTo(1, 12)
  })

  // F10: the old validator coerced NaN to 0, masking caller bugs.
  it('throws on NaN rather than coercing to zero', () => {
    expect(() => fromPercentages({ oxygen: NaN, helium: 0 })).toThrow(/finite/i)
    expect(() => fromPercentages({ oxygen: 21, helium: NaN })).toThrow(/finite/i)
  })

  it('rejects out-of-range percentages', () => {
    expect(() => fromPercentages({ oxygen: 120, helium: 0 })).toThrow()
    expect(() => fromPercentages({ oxygen: -5, helium: 0 })).toThrow()
  })
})

describe('isValidGas', () => {
  it('accepts fractions summing to 1', () => {
    expect(isValidGas({ o2: 0.21, he: 0, n2: 0.79 })).toBe(true)
    expect(isValidGas(PURE_O2)).toBe(true)
    expect(isValidGas(PURE_HE)).toBe(true)
  })

  it('rejects fractions that do not sum to 1', () => {
    expect(isValidGas({ o2: 0.5, he: 0.5, n2: 0.5 })).toBe(false)
    expect(isValidGas({ o2: 0.2, he: 0, n2: 0.2 })).toBe(false)
  })

  it('rejects negative and non-finite fractions', () => {
    expect(isValidGas({ o2: -0.1, he: 0.1, n2: 1 })).toBe(false)
    expect(isValidGas({ o2: NaN, he: 0, n2: 1 })).toBe(false)
  })
})

describe('molarMass', () => {
  // Air: 0.21 * 31.998 + 0.79 * 28.014 = 6.71958 + 22.13106 = 28.85064 g/mol.
  // Accepted value for dry air is 28.96 g/mol; the diving 21/79 O2/N2
  // convention omits argon, which accounts for the small difference.
  it('gives ~28.85 g/mol for air under the 21/79 convention', () => {
    expect(molarMass(AIR)).toBeCloseTo(28.85, 2)
  })

  it('gives the pure-species molar masses', () => {
    expect(molarMass(PURE_O2)).toBeCloseTo(31.998, 3)
    expect(molarMass(PURE_HE)).toBeCloseTo(4.003, 3)
  })

  // 18/45: 0.18*31.998 + 0.45*4.003 + 0.37*28.014
  //      = 5.75964 + 1.80135 + 10.36518 = 17.92617 g/mol
  it('gives ~17.93 g/mol for trimix 18/45', () => {
    expect(molarMass(gas(0.18, 0.45))).toBeCloseTo(17.926, 3)
  })

  it('is monotonically reduced by adding helium', () => {
    let prev = Infinity
    for (let he = 0; he <= 0.7; he += 0.05) {
      const m = molarMass(gas(0.18, he))
      expect(m).toBeLessThan(prev)
      prev = m
    }
  })
})

describe('densityAtPressure — F7 first-principles derivation', () => {
  // Golden value: dry air at 1 atm (1.01325 bar), 0 C has a density of
  // 1.293 g/L (standard reference value). rho = P*M/(R*T)
  //   = 1.01325 * 28.85064 / (0.083144626 * 273.15) = 1.2874 g/L
  // The 21/79 convention omits argon, which is why this lands ~0.4% under the
  // 1.293 g/L figure for true dry air — inside the +/-0.5% tolerance.
  it('gives ~1.293 g/L for air at 1 atm and 0 C (within 0.5%)', () => {
    const rho = densityAtPressure(AIR, 1.01325, 0)
    expect(Math.abs(rho - 1.293) / 1.293).toBeLessThan(0.005)
  })

  // Air at 5 bar absolute, 20 C:
  //   rho = 5 * 28.85064 / (0.083144626 * 293.15) = 144.2532 / 24.374 = 5.919 g/L
  it('gives ~5.92 g/L for air at 5 bar and 20 C', () => {
    expect(densityAtPressure(AIR, 5, 20)).toBeCloseTo(5.919, 2)
  })

  // Trimix 18/45 at 70 m: P = 8 bar (simple model), 20 C.
  //   rho = 8 * 17.92617 / (0.083144626 * 293.15) = 143.409 / 24.374 = 5.884 g/L
  it('gives ~5.88 g/L for trimix 18/45 at 70 m and 20 C', () => {
    expect(densityAtDepth(gas(0.18, 0.45), 70, 20)).toBeCloseTo(5.884, 2)
  })

  // F7 regression: the old implementation scaled 1 atm STP densities by a bar
  // pressure, overstating density by 1.01325x (~1.3%).
  it('is ~1.3% below the old STP-scaling result', () => {
    const oldStyle = 5 * ((21 * 1.429 + 79 * 1.251) / 100) * (273.15 / 293.15)
    const corrected = densityAtPressure(AIR, 5, 20)
    const ratio = oldStyle / corrected
    expect(ratio).toBeGreaterThan(1.005)
    expect(ratio).toBeLessThan(1.025)
  })

  it('scales linearly with pressure', () => {
    const one = densityAtPressure(AIR, 1, 20)
    expect(densityAtPressure(AIR, 4, 20)).toBeCloseTo(one * 4, 9)
    expect(densityAtPressure(AIR, 10, 20)).toBeCloseTo(one * 10, 9)
  })

  it('falls as temperature rises', () => {
    expect(densityAtPressure(AIR, 5, 4)).toBeGreaterThan(densityAtPressure(AIR, 5, 28))
  })

  it('is zero at zero pressure', () => {
    expect(densityAtPressure(AIR, 0, 20)).toBe(0)
  })

  it('rejects invalid pressure and temperature', () => {
    expect(() => densityAtPressure(AIR, -1, 20)).toThrow()
    expect(() => densityAtPressure(AIR, 5, NaN)).toThrow()
    expect(() => densityAtPressure(AIR, 5, -300)).toThrow(/absolute zero/i)
  })

  it('shows helium substantially reduces density at the same depth', () => {
    const air = densityAtDepth(AIR, 60, 20)
    const trimix = densityAtDepth(gas(0.18, 0.45), 60, 20)
    expect(trimix).toBeLessThan(air * 0.7)
  })
})

describe('ppo2AtDepth', () => {
  it('is the surface fraction at the surface', () => {
    expect(ppo2AtDepth(AIR, 0)).toBeCloseTo(0.21, 12)
  })

  it('gives 1.4 bar for EAN32 at 33.75 m', () => {
    expect(ppo2AtDepth(gas(0.32), 33.75)).toBeCloseTo(1.4, 9)
  })

  it('gives 1.4 bar for air at 56.667 m', () => {
    expect(ppo2AtDepth(AIR, 56.66666667)).toBeCloseTo(1.4, 6)
  })
})

describe('modRaw', () => {
  // EAN32 @ 1.4 bar: 1.4 / 0.32 = 4.375 bar abs -> (4.375 - 1) * 10 = 33.75 m
  it('gives 33.75 m for EAN32 at 1.4 bar', () => {
    expect(modRaw(gas(0.32), 1.4)).toBeCloseTo(33.75, 9)
  })

  // Air @ 1.4 bar: 1.4 / 0.21 = 6.6667 bar -> 56.67 m
  it('gives ~56.67 m for air at 1.4 bar', () => {
    expect(modRaw(AIR, 1.4)).toBeCloseTo(56.667, 3)
  })

  // 1.4 / 0.28 is exactly 5 bar -> exactly 40 m. Naive float arithmetic can
  // land at 39.99999..., which would floor to 39.
  it('gives exactly 40 m for EAN28 at 1.4 bar without float loss', () => {
    expect(modRaw(gas(0.28), 1.4)).toBe(40)
  })

  it('gives 6 m for pure oxygen at 1.6 bar', () => {
    expect(modRaw(PURE_O2, 1.6)).toBeCloseTo(6, 9)
  })

  it('gives 22 m for EAN50 at 1.6 bar', () => {
    expect(modRaw(gas(0.5), 1.6)).toBeCloseTo(22, 9)
  })

  it('gives 10 m for EAN80 at 1.6 bar', () => {
    expect(modRaw(gas(0.8), 1.6)).toBeCloseTo(10, 9)
  })

  it('deepens as oxygen falls', () => {
    let prev = -Infinity
    for (let o2 = 1.0; o2 >= 0.1; o2 -= 0.05) {
      const mod = modRaw(gas(o2), 1.4)
      expect(mod).toBeGreaterThan(prev)
      prev = mod
    }
  })

  it('rejects a mixture with no oxygen', () => {
    expect(() => modRaw(PURE_HE, 1.4)).toThrow(/no oxygen/i)
  })

  it('rejects a non-positive target PPO2', () => {
    expect(() => modRaw(AIR, 0)).toThrow()
    expect(() => modRaw(AIR, -1)).toThrow()
    expect(() => modRaw(AIR, NaN)).toThrow()
  })

  it('is shallower in the physical model than the simple one', () => {
    // Physical seawater pressure rises slightly faster than 1 bar per 10 m,
    // so the same PPO2 is reached slightly shallower.
    const simple = modRaw(gas(0.32), 1.4)
    const physical = modRaw(gas(0.32), 1.4, { simple: false })
    expect(physical).toBeLessThan(simple)
    expect(physical).toBeGreaterThan(simple - 2)
  })
})

describe('hypoxicCeilingRaw', () => {
  // Trimix 10/70 at PPO2 0.16: 0.16 / 0.10 = 1.6 bar -> 6 m.
  it('gives 6 m for a 10% oxygen mix', () => {
    expect(hypoxicCeilingRaw(gas(0.1, 0.7))).toBeCloseTo(6, 9)
  })

  it('is zero-or-negative-clamped for normoxic mixes', () => {
    expect(hypoxicCeilingRaw(AIR)).toBe(0)
    expect(hypoxicCeilingRaw(gas(0.32))).toBe(0)
  })

  it('is infinite for a mix with no oxygen', () => {
    expect(hypoxicCeilingRaw(PURE_HE)).toBe(Infinity)
  })
})

describe('endRaw', () => {
  // 18/45 at 60 m: N2 = 37%, P = 7 bar.
  // (0.37 / 0.79) * 7 = 3.2785 bar -> (3.2785 - 1) * 10 = 22.78 m
  it('gives ~22.8 m for 18/45 at 60 m on the N2-only model', () => {
    expect(endRaw(gas(0.18, 0.45), 60)).toBeCloseTo(22.785, 2)
  })

  // 21/35 at 60 m: N2 = 44%, P = 7 bar.
  // (0.44 / 0.79) * 7 = 3.8987 -> 28.99 m
  it('gives ~29.0 m for 21/35 at 60 m on the N2-only model', () => {
    expect(endRaw(gas(0.21, 0.35), 60)).toBeCloseTo(28.987, 2)
  })

  it('reports air as narcotically equal to its own depth', () => {
    for (const depth of [10, 30, 40, 56]) {
      expect(endRaw(AIR, depth)).toBeCloseTo(depth, 9)
    }
  })

  it('reports a deeper END when oxygen counts as narcotic', () => {
    const n2Only = endRaw(gas(0.18, 0.45), 60, false)
    const withO2 = endRaw(gas(0.18, 0.45), 60, true)
    expect(withO2).toBeGreaterThan(n2Only)
  })

  // Under the O2-narcotic model, air is 100% narcotic and its reference is
  // also 100%, so air still maps to its own depth.
  it('still reports air at its own depth under the O2-narcotic model', () => {
    expect(endRaw(AIR, 40, true)).toBeCloseTo(40, 9)
  })

  it('gives zero END for pure helium at any depth', () => {
    expect(endRaw(PURE_HE, 100)).toBe(0)
  })

  it('never returns a negative END', () => {
    for (let he = 0; he <= 0.79; he += 0.05) {
      for (const depth of [0, 5, 10, 50]) {
        expect(endRaw(gas(0.21, he), depth)).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('falls monotonically as helium replaces nitrogen', () => {
    let prev = Infinity
    for (let he = 0; he <= 0.7; he += 0.05) {
      const end = endRaw(gas(0.18, he), 60)
      expect(end).toBeLessThan(prev)
      prev = end
    }
  })

  it('rises monotonically with depth', () => {
    // 18/45 has an END of 0 until the narcotic partial pressure reaches the
    // surface equivalent, so the sequence is flat at 0 before rising.
    let prev = -1
    let hasRisen = false
    for (let d = 0; d <= 120; d += 5) {
      const end = endRaw(gas(0.18, 0.45), d)
      expect(end).toBeGreaterThanOrEqual(prev)
      if (end > prev) hasRisen = true
      prev = end
    }
    expect(hasRisen).toBe(true)
  })
})

describe('formatMix', () => {
  it('labels air, nitrox, oxygen and trimix conventionally', () => {
    expect(formatMix(AIR)).toBe('Air')
    expect(formatMix(gas(0.32))).toBe('EAN32')
    expect(formatMix(PURE_O2)).toBe('O₂')
    expect(formatMix(gas(0.18, 0.45))).toBe('18/45')
  })
})

describe('totality property — no NaN or Infinity escapes', () => {
  it('returns finite results over a seeded grid of valid mixes and depths', () => {
    for (let o2 = 0.08; o2 <= 1.0; o2 += 0.04) {
      const maxHe = 1 - o2
      for (let he = 0; he <= maxHe; he += 0.1) {
        const mix = gas(o2, Math.min(he, maxHe))
        for (const depth of [0, 1, 7, 30, 60, 120, 200]) {
          expect(Number.isFinite(endRaw(mix, depth))).toBe(true)
          expect(Number.isFinite(densityAtDepth(mix, depth))).toBe(true)
          expect(Number.isFinite(ppo2AtDepth(mix, depth))).toBe(true)
          expect(Number.isFinite(molarMass(mix))).toBe(true)
        }
        expect(Number.isFinite(modRaw(mix, 1.4))).toBe(true)
      }
    }
  })
})

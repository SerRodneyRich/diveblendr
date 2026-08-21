import { describe, it, expect } from 'vitest'
import {
  calculateSAC,
  rmvToSac,
  sacToRmv,
  gasConsumedAtDepth,
  gasConsumedInTransit,
  usableFraction,
  turnPressure,
  planBottomTime,
  minimumGasLiters,
  litersToBar,
  barToLiters,
} from './consumption'

describe('calculateSAC', () => {
  /**
   * Golden value, hand-derived.
   * A diver uses 200 -> 100 bar (100 bar) from an 11.1 L cylinder over
   * 40 minutes at an average depth of 20 m (3 ATA).
   *   SAC = 100 / (3 x 40) = 0.833 bar/min
   *   RMV = 100 x 11.1 / (40 x 3) = 1110 / 120 = 9.25 L/min
   */
  it('gives 0.833 bar/min and 9.25 L/min for the reference dive', () => {
    const r = calculateSAC({
      startPressureBar: 200,
      endPressureBar: 100,
      averageDepthMeters: 20,
      durationMinutes: 40,
      tankVolumeL: 11.1,
    })
    expect(r.sacBarPerMin).toBeCloseTo(0.8333, 3)
    expect(r.rmvLitersPerMin).toBeCloseTo(9.25, 3)
    expect(r.ataAtAverageDepth).toBe(3)
    expect(r.gasUsedLiters).toBeCloseTo(1110, 6)
  })

  it('gives an RMV equal to the SAC at the surface on a 1 L cylinder', () => {
    const r = calculateSAC({
      startPressureBar: 100,
      endPressureBar: 50,
      averageDepthMeters: 0,
      durationMinutes: 50,
      tankVolumeL: 1,
    })
    expect(r.rmvLitersPerMin).toBeCloseTo(r.sacBarPerMin, 9)
  })

  /**
   * The property that makes RMV the right thing to carry between dives: the
   * same diver breathing the same volume shows a different SAC on a different
   * cylinder, but the same RMV.
   */
  it('reports the same RMV but a different SAC across cylinder sizes', () => {
    const small = calculateSAC({
      startPressureBar: 200,
      endPressureBar: 100,
      averageDepthMeters: 20,
      durationMinutes: 40,
      tankVolumeL: 10,
    })
    const large = calculateSAC({
      startPressureBar: 200,
      endPressureBar: 150,
      averageDepthMeters: 20,
      durationMinutes: 40,
      tankVolumeL: 20,
    })
    expect(large.rmvLitersPerMin).toBeCloseTo(small.rmvLitersPerMin, 6)
    expect(large.sacBarPerMin).toBeLessThan(small.sacBarPerMin)
  })

  it('halves the SAC when the same gas is used over twice the time', () => {
    const base = { startPressureBar: 200, endPressureBar: 100, averageDepthMeters: 20, tankVolumeL: 12 }
    const short = calculateSAC({ ...base, durationMinutes: 30 })
    const long = calculateSAC({ ...base, durationMinutes: 60 })
    expect(long.sacBarPerMin).toBeCloseTo(short.sacBarPerMin / 2, 9)
  })

  it('halves the SAC when the same gas is used at twice the ambient pressure', () => {
    const base = { startPressureBar: 200, endPressureBar: 100, durationMinutes: 40, tankVolumeL: 12 }
    const shallow = calculateSAC({ ...base, averageDepthMeters: 10 }) // 2 ATA
    const deep = calculateSAC({ ...base, averageDepthMeters: 30 }) // 4 ATA
    expect(deep.sacBarPerMin).toBeCloseTo(shallow.sacBarPerMin / 2, 9)
  })

  it('rejects a dive that consumed no gas', () => {
    expect(() =>
      calculateSAC({
        startPressureBar: 200,
        endPressureBar: 200,
        averageDepthMeters: 20,
        durationMinutes: 40,
        tankVolumeL: 12,
      })
    ).toThrow(/must exceed/i)
  })

  it('rejects zero duration, zero tank volume and negative depth', () => {
    const base = { startPressureBar: 200, endPressureBar: 100, averageDepthMeters: 20, durationMinutes: 40, tankVolumeL: 12 }
    expect(() => calculateSAC({ ...base, durationMinutes: 0 })).toThrow()
    expect(() => calculateSAC({ ...base, tankVolumeL: 0 })).toThrow()
    expect(() => calculateSAC({ ...base, averageDepthMeters: -5 })).toThrow()
  })

  it('rejects non-finite inputs', () => {
    const base = { startPressureBar: 200, endPressureBar: 100, averageDepthMeters: 20, durationMinutes: 40, tankVolumeL: 12 }
    expect(() => calculateSAC({ ...base, startPressureBar: NaN })).toThrow(/finite/i)
  })
})

describe('rmvToSac / sacToRmv', () => {
  it('round-trip to the original value', () => {
    for (const rmv of [8, 12, 15, 22]) {
      for (const tank of [7, 11.1, 15, 24]) {
        expect(sacToRmv(rmvToSac(rmv, tank), tank)).toBeCloseTo(rmv, 9)
      }
    }
  })

  it('gives a 20 L/min diver a 2 bar/min SAC on a 10 L cylinder', () => {
    expect(rmvToSac(20, 10)).toBeCloseTo(2, 9)
  })

  it('rejects a non-positive tank volume', () => {
    expect(() => rmvToSac(20, 0)).toThrow()
    expect(() => sacToRmv(2, -1)).toThrow()
  })
})

describe('gasConsumedAtDepth', () => {
  it('is RMV x minutes at the surface', () => {
    expect(gasConsumedAtDepth(20, 0, 10)).toBeCloseTo(200, 9)
  })

  it('doubles at 10 m and quadruples at 30 m', () => {
    const surface = gasConsumedAtDepth(20, 0, 10)
    expect(gasConsumedAtDepth(20, 10, 10)).toBeCloseTo(surface * 2, 9)
    expect(gasConsumedAtDepth(20, 30, 10)).toBeCloseTo(surface * 4, 9)
  })

  it('is zero for zero time', () => {
    expect(gasConsumedAtDepth(20, 40, 0)).toBe(0)
  })

  it('rejects negative rates and durations', () => {
    expect(() => gasConsumedAtDepth(-1, 10, 10)).toThrow()
    expect(() => gasConsumedAtDepth(20, 10, -1)).toThrow()
  })
})

describe('gasConsumedInTransit — the descent/ascent defect found during extraction', () => {
  /**
   * BottomTimeCalculator charged the whole descent and ascent at the
   * consumption rate for the MAXIMUM depth. Ambient pressure is linear in
   * depth, so the correct charge is at the mean depth of the traverse.
   *
   * Descending 0 -> 40 m at 20 m/min takes 2 minutes. Mean depth 20 m = 3 ATA.
   *   correct  = 20 L/min x 3 x 2 = 120 L
   *   old way  = 20 L/min x 5 x 2 = 200 L   (charged at 40 m = 5 ATA)
   * The old figure is 67% high.
   */
  it('charges a descent at the mean depth, not the maximum', () => {
    expect(gasConsumedInTransit(20, 0, 40, 2)).toBeCloseTo(120, 9)
    expect(gasConsumedAtDepth(20, 40, 2)).toBeCloseTo(200, 9)
  })

  it('is symmetric between descent and ascent', () => {
    expect(gasConsumedInTransit(20, 0, 40, 2)).toBeCloseTo(gasConsumedInTransit(20, 40, 0, 2), 9)
  })

  it('equals the constant-depth figure when start and end are equal', () => {
    expect(gasConsumedInTransit(18, 30, 30, 5)).toBeCloseTo(gasConsumedAtDepth(18, 30, 5), 9)
  })

  it('always charges less than the maximum-depth rate for a real traverse', () => {
    for (const depth of [10, 30, 60, 90]) {
      expect(gasConsumedInTransit(20, 0, depth, 3)).toBeLessThan(gasConsumedAtDepth(20, depth, 3))
    }
  })
})

describe('usableFraction and turnPressure', () => {
  it('gives the standard fractions for each rule', () => {
    expect(usableFraction('thirds')).toBeCloseTo(1 / 3, 12)
    expect(usableFraction('halves')).toBe(0.5)
    expect(usableFraction('all-usable')).toBeCloseTo(2 / 3, 12)
  })

  /**
   * turnPressure = start x (1 - usableFraction).
   * Rule of thirds from 200 bar: use 1/3 (66.7 bar) outbound, so turn at
   * 200 x 2/3 = 133.3 bar.
   */
  it('turns a thirds dive from 200 bar at 133.3 bar', () => {
    expect(turnPressure(200, 'thirds')).toBeCloseTo(133.33, 2)
  })

  it('turns a halves dive from 200 bar at 100 bar', () => {
    expect(turnPressure(200, 'halves')).toBeCloseTo(100, 9)
  })

  it('turns an all-usable dive from 210 bar at 70 bar', () => {
    expect(turnPressure(210, 'all-usable')).toBeCloseTo(70, 9)
  })

  it('is always below the starting pressure and above zero', () => {
    for (const rule of ['thirds', 'halves', 'all-usable'] as const) {
      for (const start of [100, 200, 232, 300]) {
        const tp = turnPressure(start, rule)
        expect(tp).toBeGreaterThan(0)
        expect(tp).toBeLessThan(start)
      }
    }
  })

  it('reserves the most gas under the rule of thirds', () => {
    expect(turnPressure(200, 'thirds')).toBeGreaterThan(turnPressure(200, 'halves'))
    expect(turnPressure(200, 'halves')).toBeGreaterThan(turnPressure(200, 'all-usable'))
  })

  it('rejects a negative starting pressure', () => {
    expect(() => turnPressure(-1, 'thirds')).toThrow()
  })
})

describe('planBottomTime', () => {
  const base = {
    maxDepthMeters: 30,
    rmvLitersPerMin: 20,
    tankVolumeL: 11.1,
    startPressureBar: 200,
    rule: 'all-usable' as const,
  }

  it('computes descent and ascent times from the rates', () => {
    const r = planBottomTime(base)
    // 30 m at 20 m/min down, 9 m/min up.
    expect(r.descentTimeMinutes).toBeCloseTo(1.5, 9)
    expect(r.ascentTimeMinutes).toBeCloseTo(30 / 9, 9)
  })

  it('makes the usable gas the planned fraction of the fill', () => {
    const r = planBottomTime(base)
    // 200 bar x 11.1 L = 2220 L total; two thirds usable = 1480 L.
    expect(r.usableGasLiters).toBeCloseTo(1480, 6)
  })

  it('leaves less bottom time under the rule of thirds than all-usable', () => {
    const thirds = planBottomTime({ ...base, rule: 'thirds' })
    const all = planBottomTime({ ...base, rule: 'all-usable' })
    expect(thirds.bottomTimeMinutes).toBeLessThan(all.bottomTimeMinutes)
  })

  it('leaves less bottom time as depth increases', () => {
    let prev = Infinity
    for (const depth of [10, 20, 30, 40, 50]) {
      const r = planBottomTime({ ...base, maxDepthMeters: depth })
      expect(r.bottomTimeMinutes).toBeLessThan(prev)
      prev = r.bottomTimeMinutes
    }
  })

  it('leaves less bottom time as RMV increases', () => {
    let prev = Infinity
    for (const rmv of [10, 15, 20, 30]) {
      const r = planBottomTime({ ...base, rmvLitersPerMin: rmv })
      expect(r.bottomTimeMinutes).toBeLessThan(prev)
      prev = r.bottomTimeMinutes
    }
  })

  it('gives more bottom time with a larger cylinder', () => {
    const small = planBottomTime({ ...base, tankVolumeL: 11.1 })
    const large = planBottomTime({ ...base, tankVolumeL: 24 })
    expect(large.bottomTimeMinutes).toBeGreaterThan(small.bottomTimeMinutes)
  })

  it('never returns a negative bottom time when gas is insufficient', () => {
    const r = planBottomTime({ ...base, maxDepthMeters: 90, startPressureBar: 30 })
    expect(r.bottomTimeMinutes).toBeGreaterThanOrEqual(0)
  })

  it('makes the runtime the sum of its parts', () => {
    const r = planBottomTime(base)
    expect(r.totalRuntimeMinutes).toBeCloseTo(
      r.descentTimeMinutes + r.bottomTimeMinutes + r.ascentTimeMinutes,
      9
    )
  })

  it('reports the turn pressure consistently with turnPressure()', () => {
    for (const rule of ['thirds', 'halves', 'all-usable'] as const) {
      const r = planBottomTime({ ...base, rule })
      expect(r.turnPressureBar).toBeCloseTo(turnPressure(base.startPressureBar, rule), 9)
    }
  })

  it('gives more bottom time than the old max-depth transit charge would', () => {
    // Regression guard for the defect fixed in gasConsumedInTransit: charging
    // transit at max depth wastes gas that is actually available.
    const r = planBottomTime(base)
    const oldTransit =
      r.consumptionAtDepthLitersPerMin * (r.descentTimeMinutes + r.ascentTimeMinutes)
    expect(r.transitGasLiters).toBeLessThan(oldTransit)
  })

  it('rejects invalid inputs', () => {
    expect(() => planBottomTime({ ...base, rmvLitersPerMin: 0 })).toThrow()
    expect(() => planBottomTime({ ...base, tankVolumeL: 0 })).toThrow()
    expect(() => planBottomTime({ ...base, startPressureBar: 0 })).toThrow()
    expect(() => planBottomTime({ ...base, maxDepthMeters: -1 })).toThrow()
    expect(() => planBottomTime({ ...base, descentRateMPerMin: 0 })).toThrow()
  })

  it('returns finite values across a seeded grid', () => {
    for (const depth of [6, 18, 30, 45, 60]) {
      for (const rmv of [12, 20, 28]) {
        for (const rule of ['thirds', 'halves', 'all-usable'] as const) {
          const r = planBottomTime({ ...base, maxDepthMeters: depth, rmvLitersPerMin: rmv, rule })
          for (const value of Object.values(r)) {
            expect(Number.isFinite(value)).toBe(true)
          }
          expect(r.bottomTimeMinutes).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})

describe('minimumGasLiters', () => {
  /**
   * Two divers at 30 m (4 ATA), each with an RMV of 20 L/min, stressed by 2x,
   * so 80 L/min combined at the surface.
   *   1 minute solving at 30 m:  80 x 4 x 1        = 320 L
   *   ascent 30 m at 9 m/min = 3.33 min, mean 15 m (2.5 ATA):
   *                              80 x 2.5 x 3.333  = 666.7 L
   *   total                                        = 986.7 L
   */
  it('gives ~987 L for two divers at 30 m with a 20 L/min RMV', () => {
    expect(minimumGasLiters(30, 20)).toBeCloseTo(986.7, 0)
  })

  it('rises with depth', () => {
    let prev = -1
    for (const depth of [10, 20, 30, 45, 60]) {
      const g = minimumGasLiters(depth, 20)
      expect(g).toBeGreaterThan(prev)
      prev = g
    }
  })

  it('scales linearly with RMV and with the stress multiplier', () => {
    expect(minimumGasLiters(30, 40)).toBeCloseTo(minimumGasLiters(30, 20) * 2, 6)
    expect(minimumGasLiters(30, 20, 4)).toBeCloseTo(minimumGasLiters(30, 20, 2) * 2, 6)
  })

  it('is zero at the surface with no problem-solving time', () => {
    expect(minimumGasLiters(0, 20, 2, 0)).toBe(0)
  })

  it('rejects invalid inputs', () => {
    expect(() => minimumGasLiters(-1, 20)).toThrow()
    expect(() => minimumGasLiters(30, 0)).toThrow()
    expect(() => minimumGasLiters(30, 20, 0)).toThrow()
    expect(() => minimumGasLiters(30, 20, 2, 1, 0)).toThrow()
  })
})

describe('litersToBar / barToLiters', () => {
  it('round-trip to the original value', () => {
    for (const bar of [50, 200, 232]) {
      for (const tank of [11.1, 24]) {
        expect(litersToBar(barToLiters(bar, tank), tank)).toBeCloseTo(bar, 9)
      }
    }
  })

  it('gives 2220 L for a 200 bar fill in an 11.1 L cylinder', () => {
    expect(barToLiters(200, 11.1)).toBeCloseTo(2220, 9)
  })

  it('rejects a non-positive tank volume', () => {
    expect(() => litersToBar(100, 0)).toThrow()
    expect(() => barToLiters(100, 0)).toThrow()
  })
})

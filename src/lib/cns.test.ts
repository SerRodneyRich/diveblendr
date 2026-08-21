import { describe, it, expect } from 'vitest'
import {
  calculateCNS,
  calculateCNSTotal,
  cnsLimitMinutes,
  NOAA_CNS_LIMITS,
  CNS_TABLE_MAX_PPO2,
  CNS_TRACKING_FLOOR_PPO2,
} from './cns'

/**
 * Golden values are the NOAA Diving Manual 1991 oxygen exposure table
 * (reprinted unchanged through the 6th edition, 2017), verified against Table 1
 * of Hoyt et al., Diving and Hyperbaric Medicine 2025;55(3):262-270.
 */

describe('NOAA_CNS_LIMITS table integrity', () => {
  it('has all eleven tabulated PPO2 points from 0.6 to 1.6', () => {
    expect(NOAA_CNS_LIMITS).toHaveLength(11)
    expect(NOAA_CNS_LIMITS.map(r => r.ppo2)).toEqual([
      0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6,
    ])
  })

  it('matches the published single-exposure limits exactly', () => {
    expect(NOAA_CNS_LIMITS.map(r => r.singleExposureMinutes)).toEqual([
      720, 570, 450, 360, 300, 240, 210, 180, 150, 120, 45,
    ])
  })

  it('matches the published 24-hour limits exactly', () => {
    expect(NOAA_CNS_LIMITS.map(r => r.perDayMinutes)).toEqual([
      720, 570, 450, 360, 300, 270, 240, 210, 180, 180, 150,
    ])
  })

  it('is sorted ascending by PPO2', () => {
    for (let i = 1; i < NOAA_CNS_LIMITS.length; i++) {
      expect(NOAA_CNS_LIMITS[i].ppo2).toBeGreaterThan(NOAA_CNS_LIMITS[i - 1].ppo2)
    }
  })

  it('has single-exposure limits that never exceed the 24-hour limit', () => {
    for (const row of NOAA_CNS_LIMITS) {
      expect(row.singleExposureMinutes).toBeLessThanOrEqual(row.perDayMinutes)
    }
  })

  it('has monotonically decreasing single-exposure limits', () => {
    for (let i = 1; i < NOAA_CNS_LIMITS.length; i++) {
      expect(NOAA_CNS_LIMITS[i].singleExposureMinutes).toBeLessThan(
        NOAA_CNS_LIMITS[i - 1].singleExposureMinutes
      )
    }
  })
})

describe('cnsLimitMinutes at breakpoints', () => {
  it.each(NOAA_CNS_LIMITS.map(r => [r.ppo2, r.singleExposureMinutes]))(
    'returns the tabulated limit at PPO2 %s',
    (ppo2, expected) => {
      expect(cnsLimitMinutes(ppo2 as number)).toBeCloseTo(expected as number, 9)
    }
  )
})

describe('cnsLimitMinutes between breakpoints', () => {
  // Halfway from 1.2 (210 min) to 1.3 (180 min) -> 195 min.
  it('interpolates linearly at 1.25 bar', () => {
    expect(cnsLimitMinutes(1.25)).toBeCloseTo(195, 6)
  })

  // Halfway from 1.4 (150) to 1.5 (120) -> 135 min.
  it('interpolates linearly at 1.45 bar', () => {
    expect(cnsLimitMinutes(1.45)).toBeCloseTo(135, 6)
  })

  // Quarter of the way from 1.0 (300) to 1.1 (240) -> 300 - 0.25*60 = 285.
  it('interpolates linearly at 1.025 bar', () => {
    expect(cnsLimitMinutes(1.025)).toBeCloseTo(285, 6)
  })

  // F2 regression: the old banded table left this value matching no band and
  // returned null. It must now yield a limit.
  it('returns a finite limit at PPO2 0.645, which the old bands missed', () => {
    const limit = cnsLimitMinutes(0.645)
    expect(limit).not.toBeNull()
    expect(Number.isFinite(limit as number)).toBe(true)
    // Between 720 (0.6) and 570 (0.7): 720 - 0.45*150 = 652.5
    expect(limit).toBeCloseTo(652.5, 6)
  })

  it('is continuous — no jump greater than the local slope anywhere in range', () => {
    let prev = cnsLimitMinutes(0.6) as number
    // Integer stepping: float accumulation would skip values and manufacture
    // an apparent discontinuity that the function does not have.
    for (let milli = 601; milli <= CNS_TABLE_MAX_PPO2 * 1000; milli++) {
      const current = cnsLimitMinutes(milli / 1000) as number
      // The steepest segment is 0.6 -> 0.7: 150 minutes over 0.1 bar, i.e. at
      // most 1.5 minutes per 0.001 bar step. A banded (step) table would show
      // jumps of tens of minutes here.
      expect(Math.abs(current - prev)).toBeLessThanOrEqual(1.5000001)
      prev = current
    }
  })

  it('decreases monotonically across the tabulated range', () => {
    let prev = Infinity
    for (let ppo2 = 0.6; ppo2 <= CNS_TABLE_MAX_PPO2 + 1e-9; ppo2 += 0.01) {
      const current = cnsLimitMinutes(Math.round(ppo2 * 100) / 100) as number
      expect(current).toBeLessThanOrEqual(prev + 1e-9)
      prev = current
    }
  })
})

describe('cnsLimitMinutes outside the table', () => {
  it('reports no limit at or below the tracking floor', () => {
    expect(cnsLimitMinutes(0.5)).toBe(Infinity)
    expect(cnsLimitMinutes(0.21)).toBe(Infinity)
    expect(cnsLimitMinutes(0)).toBe(Infinity)
  })

  it('holds the 0.6 bar limit between the floor and the first tabulated point', () => {
    expect(cnsLimitMinutes(0.55)).toBe(720)
  })

  it('returns null above the highest tabulated PPO2', () => {
    expect(cnsLimitMinutes(1.61)).toBeNull()
    expect(cnsLimitMinutes(2.0)).toBeNull()
  })

  it('rejects a non-finite PPO2', () => {
    expect(() => cnsLimitMinutes(NaN)).toThrow(/finite/i)
  })
})

describe('calculateCNS — the defect this finding was raised for', () => {
  // F2: the old table assigned 45 min to everything from 1.25 bar upward, so
  // this reported 67%. The correct limit at 1.3 bar is 180 min.
  it('reports ~16.7% for 30 minutes at PPO2 1.3, not 67%', () => {
    const result = calculateCNS(1.3, 30)
    expect(result.percent).toBeCloseTo(16.7, 1)
    expect(result.overLimit).toBe(false)
    expect(result.limitMinutes).toBe(180)
  })

  it('reports 100% at exactly the single-exposure limit for each breakpoint', () => {
    for (const row of NOAA_CNS_LIMITS) {
      const result = calculateCNS(row.ppo2, row.singleExposureMinutes)
      expect(result.percent).toBeCloseTo(100, 6)
    }
  })

  it('reports 50% at half the limit for each breakpoint', () => {
    for (const row of NOAA_CNS_LIMITS) {
      const result = calculateCNS(row.ppo2, row.singleExposureMinutes / 2)
      expect(result.percent).toBeCloseTo(50, 6)
    }
  })
})

describe('calculateCNS — golden values', () => {
  it('gives 20% for 20 min at PPO2 1.6 (limit 45 min → 44.4%)', () => {
    expect(calculateCNS(1.6, 20).percent).toBeCloseTo(44.4, 1)
  })

  it('gives 40% for 60 min at PPO2 1.4 (limit 150 min)', () => {
    expect(calculateCNS(1.4, 60).percent).toBeCloseTo(40, 6)
  })

  it('gives 20% for 60 min at PPO2 1.0 (limit 300 min)', () => {
    expect(calculateCNS(1.0, 60).percent).toBeCloseTo(20, 6)
  })

  it('gives ~8.3% for 60 min at PPO2 0.6 (limit 720 min)', () => {
    expect(calculateCNS(0.6, 60).percent).toBeCloseTo(8.3, 1)
  })

  it('permits results above 100% for over-long exposures', () => {
    expect(calculateCNS(1.6, 90).percent).toBeCloseTo(200, 6)
  })

  it('reports zero for a zero-length exposure', () => {
    expect(calculateCNS(1.4, 0).percent).toBe(0)
  })

  it('reports zero below the tracking floor regardless of duration', () => {
    expect(calculateCNS(0.21, 600).percent).toBe(0)
    expect(calculateCNS(0.4, 600).percent).toBe(0)
  })
})

describe('calculateCNS — precision and out-of-range shape', () => {
  // F2: the old function returned Math.round(...), losing sub-percent detail.
  it('returns one decimal place, not a rounded integer', () => {
    const result = calculateCNS(1.3, 25)
    // 25 / 180 * 100 = 13.888... -> 13.9
    expect(result.percent).toBe(13.9)
  })

  it('flags exposures above 1.6 bar as over the NOAA limit rather than silent', () => {
    const result = calculateCNS(1.7, 10)
    expect(result.overLimit).toBe(true)
    expect(result.percent).toBeNull()
    expect(result.limitMinutes).toBeNull()
  })

  it('does not flag exactly 1.6 bar as over limit', () => {
    expect(calculateCNS(1.6, 10).overLimit).toBe(false)
  })

  it('rejects a negative or non-finite duration', () => {
    expect(() => calculateCNS(1.4, -5)).toThrow()
    expect(() => calculateCNS(1.4, NaN)).toThrow()
    expect(() => calculateCNS(NaN, 5)).toThrow()
  })

  it('never returns a NaN percent over a seeded grid', () => {
    for (let ppo2 = 0.1; ppo2 <= 1.6; ppo2 += 0.05) {
      for (const minutes of [0, 1, 30, 120, 400]) {
        const r = calculateCNS(Math.round(ppo2 * 100) / 100, minutes)
        if (r.percent !== null) expect(Number.isNaN(r.percent)).toBe(false)
      }
    }
  })

  it('rises monotonically with duration at a fixed PPO2', () => {
    let prev = -1
    for (let m = 0; m <= 300; m += 10) {
      const p = calculateCNS(1.2, m).percent as number
      expect(p).toBeGreaterThanOrEqual(prev)
      prev = p
    }
  })

  it('rises monotonically with PPO2 at a fixed duration', () => {
    let prev = -1
    for (let ppo2 = 0.6; ppo2 <= 1.6 + 1e-9; ppo2 += 0.05) {
      const p = calculateCNS(Math.round(ppo2 * 100) / 100, 30).percent as number
      expect(p).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = p
    }
  })
})

describe('calculateCNSTotal', () => {
  it('sums segments additively', () => {
    // 30 min @ 1.3 = 16.7%, 20 min @ 1.6 = 44.4% -> 61.1%
    const total = calculateCNSTotal([
      { ppo2: 1.3, minutes: 30 },
      { ppo2: 1.6, minutes: 20 },
    ])
    expect(total.percent).toBeCloseTo(61.1, 1)
    expect(total.overLimit).toBe(false)
  })

  it('is zero for an empty schedule', () => {
    expect(calculateCNSTotal([]).percent).toBe(0)
  })

  it('ignores segments below the tracking floor', () => {
    const withFloor = calculateCNSTotal([
      { ppo2: 1.2, minutes: 60 },
      { ppo2: 0.3, minutes: 120 },
    ])
    const without = calculateCNSTotal([{ ppo2: 1.2, minutes: 60 }])
    expect(withFloor.percent).toBeCloseTo(without.percent as number, 6)
  })

  it('flags the total when any segment exceeds the table', () => {
    const total = calculateCNSTotal([
      { ppo2: 1.2, minutes: 60 },
      { ppo2: 1.9, minutes: 5 },
    ])
    expect(total.overLimit).toBe(true)
    // Still reports the evaluable portion: 60 / 210 * 100 = 28.6%
    expect(total.percent).toBeCloseTo(28.6, 1)
  })
})

describe('CNS constants', () => {
  it('exposes the tracking floor and table ceiling', () => {
    expect(CNS_TRACKING_FLOOR_PPO2).toBe(0.5)
    expect(CNS_TABLE_MAX_PPO2).toBe(1.6)
  })
})

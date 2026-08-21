import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  toLocalDateKey,
  isWithinForecastWindow,
  buildTideDay,
  type MarineHourly,
  type SunDaily
} from './tides'

/**
 * A 7-day hourly window exactly as Open-Meteo returns it with `timezone=auto`:
 * local wall-clock strings, no offset suffix, starting at local midnight of
 * the first day.
 */
function makeHourly(startKey: string, days: number, hoursOnLastDay = 24): MarineHourly {
  const time: string[] = []
  const heights: number[] = []
  const start = new Date(`${startKey}T00:00:00Z`)

  for (let d = 0; d < days; d++) {
    const day = new Date(start.getTime() + d * 86400000)
    const key = day.toISOString().slice(0, 10)
    const count = d === days - 1 ? hoursOnLastDay : 24
    for (let h = 0; h < count; h++) {
      time.push(`${key}T${String(h).padStart(2, '0')}:00`)
      // Semi-diurnal: two highs and two lows per day, offset per day so the
      // days are not identical.
      heights.push(1.5 + 1.2 * Math.sin(((h + d) / 24) * 2 * Math.PI * 2))
    }
  }
  return { time, sea_level_height_msl: heights }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('toLocalDateKey', () => {
  it('returns the LOCAL calendar date, not the UTC one', () => {
    // 21 Aug 2026, 07:00 in Vanuatu (UTC+11) is 20 Aug 20:00 UTC. The date the
    // diver is looking at is the 21st; toISOString() would say the 20th.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T20:00:00Z'))
    process.env.TZ = 'Pacific/Efate'

    const now = new Date()
    expect(toLocalDateKey(now)).toBe('2026-08-21')
    // The defect, stated explicitly: these two disagree.
    expect(now.toISOString().slice(0, 10)).toBe('2026-08-20')
  })
})

describe('buildTideDay', () => {
  const hourly = makeHourly('2026-08-21', 7)

  it('finds today at a UTC+11 morning hour, where the UTC key misses', () => {
    // The exact failure: local morning east of Greenwich. The old code built
    // a UTC key ('2026-08-20') which does not appear anywhere in a window that
    // begins at local midnight today, so findIndex returned -1 and the page
    // drew an invented sinusoid.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T20:00:00Z')) // 07:00 local, 21 Aug
    process.env.TZ = 'Pacific/Efate'

    const day = buildTideDay(hourly, new Date())

    expect(day).not.toBeNull()
    expect(day!.heights).toHaveLength(24)
    expect(day!.hours[0]).toBe(0)
    expect(day!.hours[23]).toBe(23)
    // Re-derived from the fixture, not from another rendered field: a
    // semi-diurnal signal turns four times a day.
    expect(day!.extremes.length).toBeGreaterThanOrEqual(3)
  })

  it('still finds the day when UTC and local agree', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T04:00:00Z')) // 15:00 local, 21 Aug
    process.env.TZ = 'Pacific/Efate'

    expect(buildTideDay(hourly, new Date())).not.toBeNull()
  })

  it('works west of Greenwich, where the offset runs the other way', () => {
    // At UTC-8, local evening is already tomorrow in UTC.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T04:00:00Z')) // 20:00 local, 21 Aug
    process.env.TZ = 'America/Los_Angeles'

    const day = buildTideDay(hourly, new Date())
    expect(day).not.toBeNull()
    expect(new Date('2026-08-22T04:00:00Z').toISOString().slice(0, 10)).toBe('2026-08-22')
  })

  it('uses a partial final day instead of discarding it', () => {
    // The last day of the window is short by however many hours have elapsed.
    // Requiring a full 24 threw it away and fell back to invented data.
    const short = makeHourly('2026-08-21', 7, 9)
    const lastDay = new Date(2026, 7, 27, 12, 0, 0) // 27 Aug, local

    const day = buildTideDay(short, lastDay)
    expect(day).not.toBeNull()
    expect(day!.heights).toHaveLength(9)
    expect(day!.hours).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('returns null — never a curve — when the day is outside the window', () => {
    const day = buildTideDay(hourly, new Date(2026, 8, 15, 12, 0, 0)) // 15 Sep
    expect(day).toBeNull()
  })

  it('returns null when the model has no series for the location', () => {
    expect(buildTideDay(undefined, new Date(2026, 7, 21))).toBeNull()
    expect(
      buildTideDay({ time: [], sea_level_height_msl: [] }, new Date(2026, 7, 21))
    ).toBeNull()
  })

  it('returns null rather than inventing an extreme across a gap', () => {
    const gapped = makeHourly('2026-08-21', 7)
    gapped.sea_level_height_msl[5] = null
    expect(buildTideDay(gapped, new Date(2026, 7, 21, 12))).toBeNull()
  })

  it('reports extreme times as local hours of the day', () => {
    const day = buildTideDay(hourly, new Date(2026, 7, 23, 12))
    expect(day).not.toBeNull()
    for (const e of day!.extremes) {
      expect(e.time).toBeGreaterThanOrEqual(0)
      expect(e.time).toBeLessThanOrEqual(23)
      // The height reported must be the sample at that hour, not a neighbour.
      expect(day!.heights[day!.hours.indexOf(e.time)]).toBe(e.height)
    }
  })

  it('matches sunrise/sunset on the local date key', () => {
    const sun: SunDaily = {
      time: ['2026-08-21', '2026-08-22'],
      sunrise: ['2026-08-21T06:12', '2026-08-22T06:11'],
      sunset: ['2026-08-21T17:44', '2026-08-22T17:44']
    }
    const day = buildTideDay(hourly, new Date(2026, 7, 22, 12), sun)
    expect(day!.sunData).toBeDefined()
    expect(day!.sunData!.sunrise.getHours()).toBe(6)
  })
})

describe('isWithinForecastWindow', () => {
  const hourly = makeHourly('2026-08-21', 7)

  it('accepts the first day of the window at a local morning hour', () => {
    // Date-object comparison failed here: new Date('2026-08-21') is UTC
    // midnight, which is later than 21 Aug 07:00 local at UTC+11, so the
    // window's own first day read as out of bounds and locked navigation.
    process.env.TZ = 'Pacific/Efate'
    expect(isWithinForecastWindow(new Date(2026, 7, 21, 7, 0), hourly.time)).toBe(true)
  })

  it('accepts the last day of the window', () => {
    expect(isWithinForecastWindow(new Date(2026, 7, 27, 23, 0), hourly.time)).toBe(true)
  })

  it('rejects days on either side', () => {
    expect(isWithinForecastWindow(new Date(2026, 7, 20, 12), hourly.time)).toBe(false)
    expect(isWithinForecastWindow(new Date(2026, 7, 28, 0, 1), hourly.time)).toBe(false)
  })
})

describe('extreme detection against a real series', () => {
  // Open-Meteo, Port Vila (-17.736, 168.314), 21 Aug 2026, metres above MSL.
  // Captured live; the tied 06:00/07:00 pair is why plateau handling exists.
  const portVila = [
    0.96, 0.88, 0.77, 0.65, 0.52, 0.42, 0.36, 0.36, 0.41, 0.5, 0.6, 0.7,
    0.77, 0.8, 0.81, 0.79, 0.74, 0.7, 0.68, 0.69, 0.75, 0.82, 0.9, 0.96
  ]
  const hourly: MarineHourly = {
    time: portVila.map((_, h) => `2026-08-21T${String(h).padStart(2, '0')}:00`),
    sea_level_height_msl: portVila
  }

  it('finds the tied low at 06:00, the largest of the day', () => {
    const day = buildTideDay(hourly, new Date(2026, 7, 21, 12))
    const lows = day!.extremes.filter(e => e.type === 'low')

    // A strict prev<curr<next test skips 0.36,0.36 entirely and reports only
    // the shallow 18:00 low, hiding the day's real slack window.
    expect(lows.map(l => l.time)).toContain(6)
    expect(lows.find(l => l.time === 6)!.height).toBeCloseTo(0.36, 2)
  })

  it('reports the plateau once, not once per tied sample', () => {
    const day = buildTideDay(hourly, new Date(2026, 7, 21, 12))
    expect(day!.extremes.filter(e => e.time === 6 || e.time === 7)).toHaveLength(1)
  })

  it('still finds the interior turning points either side', () => {
    const day = buildTideDay(hourly, new Date(2026, 7, 21, 12))
    const byHour = Object.fromEntries(day!.extremes.map(e => [e.time, e.type]))
    expect(byHour[14]).toBe('high')
    expect(byHour[18]).toBe('low')
  })
})

import { describe, expect, it } from 'vitest'

import {
  CARD_SIZES,
  coverRect,
  hasDecoData,
  profilePath,
  resampleProfile,
  statsHeight,
} from './card'
import {
  availableStats,
  buildStat,
  buildStats,
  defaultStats,
  formatDuration,
  formatInterval,
  gasLabel,
} from './stats'
import type { Dive, DiveSample } from './types'

function dive(overrides: Partial<Dive> = {}): Dive {
  const samples: DiveSample[] = [
    { t: 0, depth: 0 },
    { t: 60, depth: 20 },
    { t: 120, depth: 32 },
    { t: 180, depth: 18 },
    { t: 240, depth: 0 },
  ]
  return {
    samples,
    maxDepth: 32,
    duration: 240,
    avgDepth: 18,
    source: 'garmin-fit',
    ...overrides,
  }
}

describe('profilePath', () => {
  const box = { x: 0, y: 100, w: 1000, h: 500 }

  it('puts the surface at the top and depth increasing downward', () => {
    const points = profilePath(dive().samples, 32, 240, box)
    // Surface sample sits on the box's top edge.
    expect(points[0].y).toBeCloseTo(box.y, 5)
    // The deepest sample is the lowest on screen (largest y).
    const deepest = points.reduce((a, b) => (b.y > a.y ? b : a))
    expect(deepest.y).toBeGreaterThan(points[0].y)
    // Mutation guard: an inverted axis would put the deepest point at the top.
    expect(points[2].y).toBeGreaterThan(points[1].y)
  })

  it('keeps the deepest point inside the box, with headroom', () => {
    const points = profilePath(dive().samples, 32, 240, box)
    const deepest = points.reduce((a, b) => (b.y > a.y ? b : a))
    expect(deepest.y).toBeLessThan(box.y + box.h)
    expect(deepest.y).toBeGreaterThan(box.y + box.h * 0.85)
  })

  it('spans the box horizontally over the dive duration', () => {
    const points = profilePath(dive().samples, 32, 240, box)
    expect(points[0].x).toBeCloseTo(box.x, 5)
    expect(points[points.length - 1].x).toBeCloseTo(box.x + box.w, 5)
  })

  it('does not divide by zero on a zero-duration or zero-depth dive', () => {
    const points = profilePath([{ t: 0, depth: 0 }], 0, 0, box)
    expect(Number.isFinite(points[0].x)).toBe(true)
    expect(Number.isFinite(points[0].y)).toBe(true)
  })
})

describe('resampleProfile', () => {
  it('leaves a short profile untouched', () => {
    const samples = dive().samples
    expect(resampleProfile(samples, 1000)).toBe(samples)
  })

  it('reduces a long profile to roughly the requested budget', () => {
    const samples = Array.from({ length: 5400 }, (_, i) => ({ t: i, depth: 20 }))
    const out = resampleProfile(samples, 600)
    expect(out.length).toBeLessThanOrEqual(601)
    expect(out.length).toBeGreaterThan(500)
  })

  it('preserves the deepest sample rather than smoothing the peak away', () => {
    const samples = Array.from({ length: 3000 }, (_, i) => ({ t: i, depth: 10 }))
    samples[1234] = { t: 1234, depth: 47.3 }
    const out = resampleProfile(samples, 200)
    expect(Math.max(...out.map((s) => s.depth))).toBeCloseTo(47.3, 3)
  })

  it('keeps the final sample so the curve returns to the surface', () => {
    const samples = Array.from({ length: 3000 }, (_, i) => ({ t: i, depth: 30 }))
    samples[2999] = { t: 2999, depth: 0 }
    const out = resampleProfile(samples, 200)
    expect(out[out.length - 1].depth).toBe(0)
  })
})

describe('coverRect', () => {
  it('fills the box without distorting a wide photo', () => {
    const rect = coverRect(4000, 2000, 1080, 1920)
    expect(rect.w / rect.h).toBeCloseTo(2, 5) // aspect preserved
    expect(rect.w).toBeGreaterThanOrEqual(1080)
    expect(rect.h).toBeGreaterThanOrEqual(1920)
  })

  it('centres the overflow', () => {
    const rect = coverRect(4000, 2000, 1080, 1920)
    expect(rect.x + rect.w / 2).toBeCloseTo(540, 5)
    expect(rect.y + rect.h / 2).toBeCloseTo(960, 5)
  })
})

describe('hasDecoData', () => {
  it('is false for a no-stop dive, so the toggle is not offered', () => {
    expect(hasDecoData(dive({ samples: [
      { t: 0, depth: 0 },
      { t: 60, depth: 18 },
      { t: 120, depth: 0 },
    ] }))).toBe(false)
  })

  it('is true as soon as one sample carries an obligation', () => {
    expect(hasDecoData(dive({ samples: [
      { t: 0, depth: 0 },
      { t: 60, depth: 40, inDeco: true, stopDepth: 6 },
      { t: 120, depth: 0 },
    ] }))).toBe(true)
  })
})

describe('card sizes', () => {
  it('offers the social targets', () => {
    expect(CARD_SIZES.portrait).toMatchObject({ w: 1080, h: 1920 })
    expect(CARD_SIZES.square).toMatchObject({ w: 1080, h: 1080 })
  })

  it('offers only the two sizes that have a destination', () => {
    // The 1200x630 link-preview size was dropped: nothing here produces a
    // page for an unfurler to read, so it was a shape with nowhere to go.
    expect(Object.keys(CARD_SIZES).sort()).toEqual(['portrait', 'square'])
  })
})

describe('formatDuration', () => {
  it('uses m:ss under an hour', () => {
    expect(formatDuration(2745)).toEqual({ value: '45:45', unit: 'min' })
  })

  it('uses h:mm over an hour', () => {
    expect(formatDuration(5400)).toEqual({ value: '1:30', unit: 'h' })
  })

  it('pads seconds', () => {
    expect(formatDuration(305)).toEqual({ value: '5:05', unit: 'min' })
  })
})

describe('formatInterval', () => {
  it('reports minutes under an hour', () => {
    expect(formatInterval(2700)).toEqual({ value: '45', unit: 'min' })
  })

  it('reports h:mm over an hour', () => {
    expect(formatInterval(7200)).toEqual({ value: '2:00', unit: 'h' })
  })
})

describe('gasLabel', () => {
  it('names gases the way a diver does', () => {
    expect(gasLabel({ o2: 21, he: 0 })).toBe('Air')
    expect(gasLabel({ o2: 32, he: 0 })).toBe('EAN32')
    expect(gasLabel({ o2: 21, he: 35 })).toBe('21/35')
    expect(gasLabel({ o2: 18, he: 45 })).toBe('18/45')
  })
})

describe('stat building', () => {
  const metric = { depth: 'meters', temperature: 'celsius' } as const
  const imperial = { depth: 'feet', temperature: 'fahrenheit' } as const

  it('respects metric units', () => {
    const stat = buildStat(dive(), 'maxDepth', metric)
    expect(stat).toMatchObject({ value: '32.0', unit: 'm' })
  })

  it('respects imperial units', () => {
    const stat = buildStat(dive(), 'maxDepth', imperial)
    // 32 m = 104.99 ft. Reading metres as feet would print 32.
    expect(stat).toMatchObject({ value: '105', unit: 'ft' })
  })

  it('converts temperature to Fahrenheit', () => {
    const stat = buildStat(dive({ waterTemp: 10 }), 'waterTemp', imperial)
    expect(stat).toMatchObject({ value: '50', unit: '°F' })
  })

  it('offers only the stats this dive can supply', () => {
    const bare = availableStats(dive())
    // Average depth is deliberately absent: on a card read in a feed it is
    // the one number nobody quotes, and it competed for a slot with max depth
    // and run time.
    expect(bare).toEqual(['maxDepth', 'duration'])

    const rich = availableStats(
      dive({
        waterTemp: 12,
        startTime: new Date(2026, 2, 14),
        gases: [{ o2: 32, he: 0 }],
        surfaceInterval: 3600,
        diveNumber: 7,
      })
    )
    expect(rich).toContain('waterTemp')
    expect(rich).toContain('gas')
    expect(rich).toContain('diveNumber')
  })

  it('drops a selected stat the dive has no value for', () => {
    // A diver switches file; the previously chosen "water temp" must vanish
    // rather than render an empty tile.
    const stats = buildStats(dive(), ['maxDepth', 'waterTemp', 'duration'], metric)
    expect(stats.map((s) => s.id)).toEqual(['maxDepth', 'duration'])
  })

  it('defaults to at most four stats', () => {
    const selection = defaultStats(
      dive({ waterTemp: 12, startTime: new Date(), gases: [{ o2: 32, he: 0 }], diveNumber: 4 })
    )
    expect(selection.length).toBeLessThanOrEqual(4)
    expect(selection[0]).toBe('maxDepth')
  })
})


describe('statsHeight', () => {
  const stat = (over: Partial<{ value: string; extraLines: string[] }> = {}) => ({
    id: 'maxDepth' as const,
    label: 'Max depth',
    value: '40',
    ...over,
  })

  it('reserves more height when a value stacks', () => {
    // The gas list is the reason this exists: three mixes need three lines,
    // and a fixed slab clipped the second and third.
    const plain = statsHeight([stat(), stat(), stat()], 1080)
    const stacked = statsHeight([stat(), stat({ extraLines: ['EAN51', 'Air'] }), stat()], 1080)
    expect(stacked).toBeGreaterThan(plain)
  })

  it('follows the tallest stat, not the total', () => {
    // Two stacked stats side by side occupy the same rows, so the row is no
    // taller than one of them.
    const one = statsHeight([stat({ extraLines: ['EAN51'] }), stat()], 1080)
    const two = statsHeight(
      [stat({ extraLines: ['EAN51'] }), stat({ extraLines: ['Air'] })],
      1080
    )
    expect(two).toBe(one)
  })

  it('is zero with nothing to draw', () => {
    expect(statsHeight([], 1080)).toBe(0)
  })
})

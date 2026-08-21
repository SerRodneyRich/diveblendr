/**
 * REAL-FILE CONFORMANCE
 * =====================
 * Parses actual dive-computer exports rather than fixtures we wrote ourselves.
 *
 * A synthesised fixture only proves the parser agrees with our own reading of
 * the format. Real exports carry what the vendor actually emits, and the first
 * pass over these files exposed three defects the synthetic suite missed: a
 * two-row metadata block above the Shearwater samples, bare `Depth` column
 * names with the unit declared only by a separate `Imperial Units` flag, and a
 * `Time To Surface (min)` column competing with `Time (sec)` to be read as the
 * timebase.
 *
 * WHY THIS SUITE SKIPS BY DEFAULT
 * -------------------------------
 * The files are the owner's personal dive logs, are hundreds of kilobytes, and
 * are not in the repository — CI has no access to them and committing them is
 * neither desirable nor necessary. So the suite locates them and skips cleanly
 * when they are absent, rather than failing a checkout that legitimately does
 * not have them.
 *
 * To run it, point the env var at a directory holding the exports:
 *
 *   DIVE_FIXTURES=~/Desktop pnpm test src/lib/dive/real.test.ts
 *
 * The assertions below are deliberately about PHYSICS AND SHAPE, not exact
 * values transcribed from a previous run. Pinning "maxDepth === 47.13" would
 * only re-assert whatever the parser last happened to produce; a wrong scale
 * factor would pass forever. Instead each check states something that must be
 * true of any real dive — it descends, it spends time deep, it comes back up,
 * the deepest point is not the first sample — so a mis-scaled or mis-offset
 * field fails regardless of what number it lands on.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { parseDiveFile, detectFormat } from './parse'
import type { Dive } from './types'

/** Where to look for the owner's exports. Never the whole filesystem. */
function fixtureDir(): string | null {
  const fromEnv = process.env.DIVE_FIXTURES
  const candidates = [
    fromEnv && fromEnv.startsWith('~') ? join(homedir(), fromEnv.slice(1)) : fromEnv,
    join(homedir(), 'Desktop'),
  ].filter((d): d is string => typeof d === 'string' && d.length > 0)

  return candidates.find((d) => existsSync(d)) ?? null
}

/** Finds one file in the fixture directory by extension. */
function findFixture(ext: string): string | null {
  const dir = fixtureDir()
  if (!dir) return null
  try {
    const hit = readdirSync(dir).find((f) => f.toLowerCase().endsWith(ext))
    return hit ? join(dir, hit) : null
  } catch {
    // An unreadable directory is the same as an absent one for this suite.
    return null
  }
}

function load(path: string): ArrayBuffer {
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/**
 * Everything that must hold for ANY real recreational or technical dive.
 *
 * These are the checks that catch a wrong scale factor or a wrong field
 * offset, because such a bug produces a profile that is not dive-shaped —
 * flat, monotonic, inverted, or deepest at t=0.
 */
function assertLooksLikeARealDive(dive: Dive) {
  // --- Profile integrity ---------------------------------------------------
  expect(dive.samples.length, 'a real dive records many samples').toBeGreaterThan(20)

  const times = dive.samples.map((s) => s.t)
  expect(times[0], 'the profile starts at t=0').toBe(0)
  const monotonic = times.every((t, i) => i === 0 || t >= times[i - 1])
  expect(monotonic, 'samples are ordered in time').toBe(true)

  const depths = dive.samples.map((s) => s.depth)
  expect(Math.min(...depths), 'no negative depths').toBeGreaterThanOrEqual(0)

  // --- Physical plausibility ----------------------------------------------
  // 332 m is the deepest open-circuit scuba dive ever recorded (Gabr, 2014),
  // so anything past it means the depth scale is wrong, not that the diver
  // set a world record.
  expect(dive.maxDepth).toBeGreaterThan(1)
  expect(dive.maxDepth, 'depth scale looks wrong').toBeLessThan(332)
  expect(dive.maxDepth).toBeCloseTo(Math.max(...depths), 0)

  // Average depth must sit strictly inside the profile: a dive that descends
  // and ascends cannot average its own maximum.
  expect(dive.avgDepth).toBeGreaterThan(0)
  expect(dive.avgDepth).toBeLessThan(dive.maxDepth)

  // --- Duration ------------------------------------------------------------
  expect(dive.duration, 'a dive lasts minutes, not seconds').toBeGreaterThan(60)
  expect(dive.duration, 'over 12 h is a parse error, not a dive').toBeLessThan(12 * 3600)

  // --- Dive SHAPE: descend, stay, ascend -----------------------------------
  // This is the assertion a wrong offset cannot satisfy by accident.
  const deepestAt = depths.indexOf(Math.max(...depths))
  expect(deepestAt, 'the deepest point is not the first sample').toBeGreaterThan(0)
  expect(deepestAt, 'the deepest point is not the last sample').toBeLessThan(depths.length - 1)

  // The diver starts and ends at or near the surface.
  expect(depths[0], 'the dive starts near the surface').toBeLessThan(dive.maxDepth * 0.5)
  expect(
    depths[depths.length - 1],
    'the dive ends near the surface'
  ).toBeLessThan(dive.maxDepth * 0.5)

  // Not flat: a constant profile means the depth field was never really read.
  const spread = Math.max(...depths) - Math.min(...depths)
  expect(spread, 'the profile is not flat').toBeGreaterThan(1)

  // --- Temperature ---------------------------------------------------------
  if (dive.waterTemp !== undefined) {
    // Liquid water, and not a Kelvin or Fahrenheit value read as Celsius.
    expect(dive.waterTemp).toBeGreaterThan(-2)
    expect(dive.waterTemp).toBeLessThan(40)
  }

  // --- Gases ---------------------------------------------------------------
  for (const g of dive.gases ?? []) {
    expect(g.o2).toBeGreaterThan(0)
    expect(g.o2 + g.he, 'a mix cannot exceed 100%').toBeLessThanOrEqual(100)
  }
}

const fitPath = findFixture('.fit')
const csvPath = findFixture('.csv')
const dir = fixtureDir()

describe.skipIf(!fitPath)('real Garmin FIT export', () => {
  it('parses as FIT and yields a dive-shaped profile', () => {
    const buf = load(fitPath!)
    expect(detectFormat(buf)).toBe('fit')

    const dive = parseDiveFile(buf)
    expect(dive.source).toBe('garmin-fit')
    assertLooksLikeARealDive(dive)
  })

  it('records a real start instant, not the FIT epoch itself', () => {
    const dive = parseDiveFile(load(fitPath!))
    if (!dive.startTime) return
    // FIT counts seconds from 1989-12-31 UTC. Failing to add that offset
    // yields a date in 1989/1990 — the classic symptom.
    expect(dive.startTime.getUTCFullYear()).toBeGreaterThan(2000)
    expect(dive.startTime.getTime()).toBeLessThan(Date.now())
  })
})

describe.skipIf(!fitPath || !csvPath)('decompression detection', () => {
  /**
   * Both formats record the obligation twice — a stop depth and a no-stop
   * countdown — and the parsers prefer the stop depth because it also names
   * the ceiling. Checked here against real dives rather than fixtures,
   * because the agreement between the two fields is the evidence that the
   * right field was read: a wrong field number would not correlate.
   */
  // Asserted per file, not inside a loop over both. A loop lets one format
  // satisfy the expectation while the other silently fails — verified: with a
  // deliberately wrong FIT field number the CSV still passed and hid it.
  it.each([
    ['FIT', () => fitPath!],
    ['Shearwater CSV', () => csvPath!],
  ])('%s records a deco obligation with named stop depths', (_label, getPath) => {
    const dive = parseDiveFile(load(getPath()))
    const deco = dive.samples.filter((s) => s.inDeco)

    expect(deco.length, 'recorded no deco at all').toBeGreaterThan(0)
    expect(deco.length, 'a whole dive in deco means the flag is inverted').toBeLessThan(
      dive.samples.length
    )

    // Deco is incurred at depth and cleared shallow — never the reverse.
    expect(deco[0].depth).toBeGreaterThan(deco[deco.length - 1].depth)

    // A diver cannot be in deco from the first instant of a dive.
    expect(dive.samples[0].inDeco ?? false).toBe(false)

    // The load-bearing assertion. Both formats record the obligation twice —
    // a stop depth and a no-stop countdown — so detecting deco proves little
    // on its own: a wrong stop-depth field still yields the right sample
    // count via the NDL fallback. Named stops are what confirm the correct
    // field was read.
    const stops = [...new Set(deco.map((s) => s.stopDepth).filter((d): d is number => !!d))]
    expect(stops.length, 'deco found but no stop depth named').toBeGreaterThan(0)

    for (const stop of stops) {
      expect(stop, 'a mandatory stop deeper than 60 m is a scale error').toBeLessThan(60)
      expect(stop).toBeLessThan(dive.maxDepth)

      // Every computer calls stops on a 3 m ladder — 3, 6, 9, 12… That is
      // what separates a real stop-depth field from a neighbouring one that
      // merely happens to be non-zero. Reading FIT field 94 instead of 93
      // yields "stops" of 0.99 m, which is not a depth any planner calls;
      // asserting only `> 0` accepted it.
      expect(
        Math.abs(stop / 3 - Math.round(stop / 3)),
        `${stop.toFixed(2)} m is not on the 3 m stop ladder`
      ).toBeLessThan(0.05)
      expect(stop, 'a stop shallower than 3 m is not a stop').toBeGreaterThanOrEqual(2.9)
    }
  })

  it('never marks a stop deeper than the diver went', () => {
    for (const path of [fitPath!, csvPath!]) {
      const dive = parseDiveFile(load(path))
      for (const s of dive.samples) {
        if (s.stopDepth !== undefined) expect(s.stopDepth).toBeLessThanOrEqual(dive.maxDepth)
      }
    }
  })
})

describe.skipIf(!csvPath)('real Shearwater CSV export', () => {
  it('parses as Shearwater CSV and yields a dive-shaped profile', () => {
    const buf = load(csvPath!)
    expect(detectFormat(buf)).toBe('shearwater-csv')

    const dive = parseDiveFile(buf)
    expect(dive.source).toBe('shearwater-csv')
    assertLooksLikeARealDive(dive)
  })

  it('reads depth in metres even when the export is flagged imperial', () => {
    const dive = parseDiveFile(load(csvPath!))
    // A Petrel logging feet that we store unconverted would put a normal
    // technical dive past 100 "metres". The model is canonical metres.
    expect(dive.maxDepth).toBeLessThan(150)
  })

  it('agrees with its own summary on duration', () => {
    const dive = parseDiveFile(load(csvPath!))
    const lastSample = dive.samples[dive.samples.length - 1].t
    // Duration comes from the summary where present; it must not contradict
    // the profile it summarises by more than a sample interval.
    expect(Math.abs(dive.duration - lastSample)).toBeLessThan(120)
  })
})

// One always-visible test, so a skipped suite is legible rather than silent.
describe('real-file fixtures', () => {
  it('reports whether the owner-supplied exports were available', () => {
    const found = [fitPath && 'fit', csvPath && 'csv'].filter(Boolean)
    if (found.length === 0) {
      expect(
        `no dive fixtures in ${dir ?? 'any candidate directory'} — ` +
          'set DIVE_FIXTURES to run the real-file suite'
      ).toBeTruthy()
    }
    expect(Array.isArray(found)).toBe(true)
  })
})

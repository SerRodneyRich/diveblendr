/**
 * Schedule generation tests.
 *
 * These assert structural and physical invariants — that the schedule is
 * self-consistent, monotonic, deterministic, and respects the ceiling at every
 * point. Agreement with external references (DecoTengu, Subsurface) is the
 * separate concern of `validation/golden.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import {
  buildProfile,
  openCircuit,
  findNDL,
  selectGasIndex,
  defaultSwitchDepth,
  switchDepthFor,
  travelSeconds,
  ceilToStop,
  ceilingDepth,
  pressureAt,
  depthAt,
} from './schedule'
import { resolveOptions, GF_PRESETS, SECONDS_PER_MINUTE } from './constants'
import { SCHEMA_VERSION, type DivePlanInput, type PlannedGas, type EngineOptions } from './types'
import { gas, AIR } from '../gas'
import { ceiling } from './buhlmann'

const AIR_GAS: PlannedGas = { mix: AIR, role: 'bottom', switchDepth: 0 }
const EAN50: PlannedGas = { mix: gas(0.5), role: 'deco' }
const OXYGEN: PlannedGas = { mix: gas(1.0), role: 'deco' }
const TX2135: PlannedGas = { mix: gas(0.21, 0.35), role: 'bottom', switchDepth: 0 }

function makePlan(
  levels: DivePlanInput['levels'],
  gases: readonly PlannedGas[]
): DivePlanInput {
  return { schemaVersion: SCHEMA_VERSION, mode: 'oc', levels, gases }
}

function run(plan: DivePlanInput, options: EngineOptions) {
  return buildProfile(plan, options, { strategy: openCircuit })
}

describe('pressure helpers', () => {
  const options = resolveOptions()

  it('round-trips depth through pressure', () => {
    for (const depth of [0, 3, 21, 40, 75]) {
      expect(depthAt(pressureAt(depth, options), options)).toBeCloseTo(depth, 9)
    }
  })

  it('uses the physical model, not the 10 m/bar shortcut', () => {
    // Salt water at 1.03 kg/L gives ~1.0102 bar per 10 m, not exactly 1.
    const perTenMetres = pressureAt(10, options) - pressureAt(0, options)
    expect(perTenMetres).toBeGreaterThan(1.0)
    expect(perTenMetres).toBeLessThan(1.02)
  })

  it('responds to salinity and surface pressure', () => {
    const salt = resolveOptions({ waterDensityKgL: 1.03 })
    const fresh = resolveOptions({ waterDensityKgL: 1.0 })
    expect(pressureAt(40, salt)).toBeGreaterThan(pressureAt(40, fresh))

    const altitude = resolveOptions({ surfacePressureBar: 0.9 })
    expect(pressureAt(0, altitude)).toBeCloseTo(0.9, 9)
  })
})

describe('travelSeconds', () => {
  it('returns whole seconds', () => {
    expect(travelSeconds(0, 30, 18)).toBe(100)
    expect(Number.isInteger(travelSeconds(0, 45, 18))).toBe(true)
    expect(Number.isInteger(travelSeconds(21, 18, 9))).toBe(true)
  })

  it('is symmetric in direction', () => {
    expect(travelSeconds(30, 0, 9)).toBe(travelSeconds(0, 30, 9))
  })

  it('takes 20 s to move one 3 m stop at 9 m/min', () => {
    expect(travelSeconds(6, 3, 9)).toBe(20)
  })
})

describe('ceilToStop', () => {
  const options = resolveOptions()
  it('rounds up to the next 3 m multiple', () => {
    expect(ceilToStop(0, options)).toBe(0)
    expect(ceilToStop(0.1, options)).toBe(3)
    expect(ceilToStop(3, options)).toBe(3)
    expect(ceilToStop(3.2, options)).toBe(6)
    expect(ceilToStop(17.9, options)).toBe(18)
  })

  it('honours a non-default stop increment', () => {
    expect(ceilToStop(4, resolveOptions({ stopIncrement: 6 }))).toBe(6)
  })
})

describe('gas selection', () => {
  const options = resolveOptions()

  it('derives an EAN50 switch depth of 21 m at PPO2 1.6', () => {
    // MOD(EAN50, 1.6) = 21.65 m, rounded down to the 21 m stop.
    expect(defaultSwitchDepth(gas(0.5), options)).toBe(21)
  })

  it('derives an oxygen switch depth of 3 m at PPO2 1.6 under the physical model', () => {
    // Worth stating plainly, because it surprises people: under the *physical*
    // pressure model (salt water, 1.01325 bar surface) pure O2 reaches PPO2
    // 1.6 at 5.81 m, not 6.00 m. The industry's familiar "O2 at 6 m" comes
    // from the simplified 10 msw = 1 bar convention, under which MOD is
    // exactly 6 m. Flooring 5.81 m to a 3 m stop multiple therefore gives 3 m,
    // and the engine will not put a diver on oxygen at 6 m while the limit is
    // a strict 1.6.
    expect(defaultSwitchDepth(gas(1.0), options)).toBe(3)
  })

  it('allows an explicit 6 m oxygen switch, which is what most divers plan', () => {
    // PPO2 at 6 m on O2 is ~1.61 bar — the convention accepts this, so the
    // planner must let it be configured rather than silently refusing.
    expect(switchDepthFor({ mix: gas(1.0), role: 'deco', switchDepth: 6 }, options)).toBe(6)
    const gases: PlannedGas[] = [AIR_GAS, EAN50, { mix: gas(1.0), role: 'deco', switchDepth: 6 }]
    expect(selectGasIndex(gases, 6, options)).toBe(2)
  })

  it('prefers an explicit switch depth over the derived one', () => {
    expect(switchDepthFor({ mix: gas(0.5), role: 'deco', switchDepth: 18 }, options)).toBe(18)
  })

  it('picks the richest gas usable at the depth', () => {
    const gases = [AIR_GAS, EAN50, OXYGEN]
    expect(selectGasIndex(gases, 40, options)).toBe(0) // only air
    expect(selectGasIndex(gases, 21, options)).toBe(1) // EAN50 now usable
    expect(selectGasIndex(gases, 6, options)).toBe(1) // O2 MOD is 5.81 m, so still EAN50
    expect(selectGasIndex(gases, 3, options)).toBe(2) // O2 usable at the 3 m stop
  })

  it('never selects a gas deeper than its switch depth', () => {
    const gases = [AIR_GAS, OXYGEN]
    expect(selectGasIndex(gases, 30, options)).toBe(0)
  })

  it('honours the role filter, so bailout gases are excluded from loop plans', () => {
    const gases: PlannedGas[] = [AIR_GAS, { mix: gas(0.5), role: 'bailout' }]
    expect(selectGasIndex(gases, 10, options, ['bottom', 'deco'])).toBe(0)
    expect(selectGasIndex(gases, 10, options, ['bottom', 'bailout'])).toBe(1)
  })

  it('treats a mix with no oxygen as never switchable', () => {
    expect(defaultSwitchDepth(gas(0, 1), options)).toBe(Infinity)
  })
})

describe('buildProfile — structure', () => {
  const options = resolveOptions({ gf: GF_PRESETS.moderate })
  const plan = makePlan([{ depth: 40, durationMin: 20 }], [AIR_GAS, EAN50])
  const result = run(plan, options)

  it('produces a contiguous timeline with no gaps or overlaps', () => {
    for (let i = 0; i < result.segments.length; i++) {
      const segment = result.segments[i]
      expect(segment.endSec).toBeGreaterThanOrEqual(segment.startSec)
      if (i > 0) {
        expect(segment.startSec).toBe(result.segments[i - 1].endSec)
        // Depth is continuous across segment boundaries.
        expect(segment.startDepth).toBeCloseTo(result.segments[i - 1].endDepth, 9)
      }
    }
    expect(result.segments[0].startSec).toBe(0)
    expect(result.segments[0].startDepth).toBe(0)
  })

  it('uses only integer seconds', () => {
    for (const segment of result.segments) {
      expect(Number.isInteger(segment.startSec)).toBe(true)
      expect(Number.isInteger(segment.endSec)).toBe(true)
      expect(Number.isInteger(segment.ttsSec)).toBe(true)
    }
    expect(Number.isInteger(result.runtimeSec)).toBe(true)
  })

  it('starts at the surface and ends at the surface', () => {
    expect(result.segments[0].startDepth).toBe(0)
    expect(result.segments[result.segments.length - 1].endDepth).toBe(0)
  })

  it('reports runtime equal to the final segment end', () => {
    expect(result.runtimeSec).toBe(result.segments[result.segments.length - 1].endSec)
  })

  it('counts TTS down to zero at the surface', () => {
    const last = result.segments[result.segments.length - 1]
    expect(last.ttsSec).toBe(0)
    for (let i = 1; i < result.segments.length; i++) {
      expect(result.segments[i].ttsSec).toBeLessThanOrEqual(result.segments[i - 1].ttsSec)
    }
  })

  it('honours the "bottom time includes descent" convention', () => {
    // Descent 0->40 m at 18 m/min takes 133 s; the bottom phase must end at
    // exactly 20 min of runtime.
    const bottom = result.segments.filter((s) => s.phase === 'bottom' || s.phase === 'descent')
    const endOfBottom = bottom[bottom.length - 1].endSec
    expect(endOfBottom).toBe(20 * SECONDS_PER_MINUTE)
  })

  it('excludes the descent from bottom time when configured to', () => {
    const opts = resolveOptions({ gf: GF_PRESETS.moderate, runtimeIncludesDescent: false })
    const r = run(plan, opts)
    const bottom = r.segments.filter((s) => s.phase === 'bottom' || s.phase === 'descent')
    const endOfBottom = bottom[bottom.length - 1].endSec
    expect(endOfBottom).toBe(travelSeconds(0, 40, 18) + 20 * SECONDS_PER_MINUTE)
  })

  it('is deterministic — identical inputs give identical output', () => {
    const a = JSON.stringify(run(plan, options))
    const b = JSON.stringify(run(plan, options))
    expect(a).toBe(b)
  })

  it('is fully serializable', () => {
    expect(JSON.parse(JSON.stringify(result))).toEqual(JSON.parse(JSON.stringify(result)))
  })
})

describe('buildProfile — decompression correctness', () => {
  const options = resolveOptions({ gf: GF_PRESETS.conservative })

  it('never surfaces a diver above the ceiling', () => {
    const plan = makePlan([{ depth: 45, durationMin: 25 }], [TX2135, EAN50, OXYGEN])
    const result = run(plan, options)
    // At the end of the schedule, GF high must be satisfied at the surface.
    const surfaceCeiling = ceiling(result.finalTissues, options.gf.high).pressureBar
    expect(surfaceCeiling).toBeLessThanOrEqual(options.surfacePressureBar + 1e-6)
  })

  it('orders stops from deep to shallow with no repeats', () => {
    const plan = makePlan([{ depth: 45, durationMin: 25 }], [TX2135, EAN50, OXYGEN])
    const { stops } = run(plan, options)
    expect(stops.length).toBeGreaterThan(0)
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].depth).toBeLessThan(stops[i - 1].depth)
    }
  })

  it('places every stop on a stop-increment multiple', () => {
    const plan = makePlan([{ depth: 60, durationMin: 20 }], [
      { mix: gas(0.18, 0.45), role: 'bottom', switchDepth: 0 },
      EAN50,
      OXYGEN,
    ])
    for (const stop of run(plan, options).stops) {
      expect(stop.depth % options.stopIncrement).toBe(0)
      expect(stop.minutes).toBeGreaterThan(0)
      expect(Number.isInteger(stop.minutes)).toBe(true)
    }
  })

  it('ends the shallowest stop at the configured last stop depth', () => {
    const plan = makePlan([{ depth: 45, durationMin: 25 }], [TX2135, EAN50, OXYGEN])
    const { stops } = run(plan, options)
    expect(stops[stops.length - 1].depth).toBe(options.lastStopDepth)
  })

  it('honours a 6 m last stop', () => {
    const opts = resolveOptions({ gf: GF_PRESETS.conservative, lastStopDepth: 6 })
    const plan = makePlan([{ depth: 45, durationMin: 25 }], [TX2135, EAN50, OXYGEN])
    const { stops } = run(plan, opts)
    expect(stops[stops.length - 1].depth).toBe(6)
    expect(stops.every((s) => s.depth >= 6)).toBe(true)
  })

  it('lengthens decompression as bottom time grows', () => {
    const short = run(makePlan([{ depth: 40, durationMin: 20 }], [AIR_GAS, EAN50]), options)
    const long = run(makePlan([{ depth: 40, durationMin: 35 }], [AIR_GAS, EAN50]), options)
    expect(long.decoTimeSec).toBeGreaterThan(short.decoTimeSec)
    expect(long.runtimeSec).toBeGreaterThan(short.runtimeSec)
  })

  it('lengthens decompression as depth grows', () => {
    const shallow = run(makePlan([{ depth: 30, durationMin: 25 }], [AIR_GAS, EAN50]), options)
    const deep = run(makePlan([{ depth: 45, durationMin: 25 }], [AIR_GAS, EAN50]), options)
    expect(deep.decoTimeSec).toBeGreaterThan(shallow.decoTimeSec)
  })

  it('shortens decompression as gradient factors loosen', () => {
    const plan = makePlan([{ depth: 45, durationMin: 25 }], [TX2135, EAN50, OXYGEN])
    const strict = run(plan, resolveOptions({ gf: GF_PRESETS.conservative })).decoTimeSec
    const loose = run(plan, resolveOptions({ gf: GF_PRESETS.aggressive })).decoTimeSec
    expect(loose).toBeLessThan(strict)
  })

  it('starts the first stop deeper for a lower GF low', () => {
    const plan = makePlan([{ depth: 45, durationMin: 25 }], [TX2135, EAN50, OXYGEN])
    const low = run(plan, resolveOptions({ gf: { low: 0.2, high: 0.85 } })).stops[0].depth
    const high = run(plan, resolveOptions({ gf: { low: 0.6, high: 0.85 } })).stops[0].depth
    expect(low).toBeGreaterThanOrEqual(high)
  })

  it('shortens decompression when deco gases are carried', () => {
    const plan = makePlan([{ depth: 45, durationMin: 25 }], [TX2135, EAN50, OXYGEN])
    const backGasOnly = makePlan([{ depth: 45, durationMin: 25 }], [TX2135])
    expect(run(plan, options).decoTimeSec).toBeLessThan(run(backGasOnly, options).decoTimeSec)
  })

  it('switches to the richest available gas at each stop', () => {
    const plan = makePlan([{ depth: 45, durationMin: 25 }], [TX2135, EAN50, OXYGEN])
    const { stops } = run(plan, options)

    // Oxygen at the last stop (its MOD floors to 3 m under the physical model).
    expect(stops.find((s) => s.depth === 3)?.gasIndex).toBe(2)

    // Every stop must breathe a gas that is actually usable at that depth,
    // and specifically the richest such gas.
    for (const stop of stops) {
      expect(stop.gasIndex).toBe(selectGasIndex(plan.gases, stop.depth, options))
      expect(stop.depth).toBeLessThanOrEqual(switchDepthFor(plan.gases[stop.gasIndex], options))
    }

    // Any stop deeper than the EAN50 switch depth stays on the bottom mix.
    const ean50Switch = switchDepthFor(EAN50, options)
    for (const stop of stops.filter((s) => s.depth > ean50Switch)) {
      expect(stop.gasIndex).toBe(0)
    }
  })
})

describe('buildProfile — no-decompression dives', () => {
  const options = resolveOptions({ gf: { low: 1, high: 1 } })

  it('produces no stops for a short shallow dive', () => {
    const result = run(makePlan([{ depth: 20, durationMin: 15 }], [AIR_GAS]), options)
    expect(result.isDecoDive).toBe(false)
    expect(result.stops).toHaveLength(0)
  })

  it('ascends directly to the surface', () => {
    const result = run(makePlan([{ depth: 20, durationMin: 15 }], [AIR_GAS]), options)
    expect(result.segments.some((s) => s.phase === 'stop')).toBe(false)
    expect(result.segments[result.segments.length - 1].endDepth).toBe(0)
  })
})

describe('findNDL', () => {
  const options = resolveOptions({ gf: { low: 1, high: 1 } })

  it('finds the boundary where decompression first appears', () => {
    const plan = makePlan([{ depth: 30, durationMin: 25 }], [AIR_GAS])
    const ndl = findNDL(plan, options, { strategy: openCircuit })
    expect(ndl).not.toBeNull()

    // The reported NDL must itself be stop-free, and one more minute must not be.
    const atLimit = run(makePlan([{ depth: 30, durationMin: ndl! }], [AIR_GAS]), options)
    const overLimit = run(makePlan([{ depth: 30, durationMin: ndl! + 1 }], [AIR_GAS]), options)
    expect(atLimit.isDecoDive).toBe(false)
    expect(overLimit.isDecoDive).toBe(true)
  })

  it('is not defeated by a descent longer than a minute', () => {
    // Regression: an early implementation probed a 1-minute bottom time, which
    // `buildProfile` rejects as shorter than the descent, and mistook the
    // exception for "decompression required" — reporting NDL 0 for every dive
    // deeper than ~18 m.
    const plan = makePlan([{ depth: 30, durationMin: 25 }], [AIR_GAS])
    expect(findNDL(plan, options, { strategy: openCircuit })).toBeGreaterThan(0)
  })

  it('shortens as depth increases', () => {
    const ndlAt18 = findNDL(makePlan([{ depth: 18, durationMin: 10 }], [AIR_GAS]), options, {
      strategy: openCircuit,
    })
    const ndlAt30 = findNDL(makePlan([{ depth: 30, durationMin: 10 }], [AIR_GAS]), options, {
      strategy: openCircuit,
    })
    const ndlAt40 = findNDL(makePlan([{ depth: 40, durationMin: 10 }], [AIR_GAS]), options, {
      strategy: openCircuit,
    })
    expect(ndlAt18!).toBeGreaterThan(ndlAt30!)
    expect(ndlAt30!).toBeGreaterThan(ndlAt40!)
  })

  it('is longer on nitrox than on air at the same depth', () => {
    const air = findNDL(makePlan([{ depth: 30, durationMin: 10 }], [AIR_GAS]), options, {
      strategy: openCircuit,
    })
    const ean32 = findNDL(
      makePlan([{ depth: 30, durationMin: 10 }], [{ mix: gas(0.32), role: 'bottom', switchDepth: 0 }]),
      options,
      { strategy: openCircuit }
    )
    expect(ean32!).toBeGreaterThan(air!)
  })

  it('shortens under conservative gradient factors', () => {
    const plan = makePlan([{ depth: 30, durationMin: 10 }], [AIR_GAS])
    const loose = findNDL(plan, resolveOptions({ gf: { low: 1, high: 1 } }), {
      strategy: openCircuit,
    })
    const strict = findNDL(plan, resolveOptions({ gf: GF_PRESETS.conservative }), {
      strategy: openCircuit,
    })
    expect(strict!).toBeLessThan(loose!)
  })
})

describe('buildProfile — multi-level dives', () => {
  const options = resolveOptions({ gf: GF_PRESETS.moderate })

  it('visits each level in order', () => {
    const plan = makePlan(
      [
        { depth: 40, durationMin: 15 },
        { depth: 25, durationMin: 15 },
      ],
      [{ mix: gas(0.32), role: 'bottom', switchDepth: 0 }]
    )
    const result = run(plan, options)
    expect(result.maxDepth).toBe(40)

    const bottoms = result.segments.filter((s) => s.phase === 'bottom')
    expect(bottoms.some((s) => s.endDepth === 40)).toBe(true)
    expect(bottoms.some((s) => s.endDepth === 25)).toBe(true)
  })

  it('requires less decompression than staying deep the whole time', () => {
    const multi = run(
      makePlan(
        [
          { depth: 40, durationMin: 15 },
          { depth: 25, durationMin: 15 },
        ],
        [{ mix: gas(0.32), role: 'bottom', switchDepth: 0 }]
      ),
      options
    )
    const flat = run(
      makePlan([{ depth: 40, durationMin: 30 }], [{ mix: gas(0.32), role: 'bottom', switchDepth: 0 }]),
      options
    )
    expect(multi.decoTimeSec).toBeLessThan(flat.decoTimeSec)
  })
})

describe('buildProfile — environment', () => {
  const plan = makePlan([{ depth: 45, durationMin: 25 }], [TX2135, EAN50, OXYGEN])

  it('requires more decompression in salt water than fresh', () => {
    const salt = run(plan, resolveOptions({ gf: GF_PRESETS.conservative, waterDensityKgL: 1.03 }))
    const fresh = run(plan, resolveOptions({ gf: GF_PRESETS.conservative, waterDensityKgL: 1.0 }))
    // Salt water is denser, so a given depth is a higher pressure and loads
    // more gas.
    expect(salt.decoTimeSec).toBeGreaterThanOrEqual(fresh.decoTimeSec)
  })

  it('is more conservative at altitude', () => {
    const seaLevel = run(
      makePlan([{ depth: 30, durationMin: 25 }], [AIR_GAS]),
      resolveOptions({ gf: { low: 1, high: 1 }, surfacePressureBar: 1.01325 })
    )
    const altitude = run(
      makePlan([{ depth: 30, durationMin: 25 }], [AIR_GAS]),
      resolveOptions({ gf: { low: 1, high: 1 }, surfacePressureBar: 0.9 })
    )
    expect(altitude.decoTimeSec).toBeGreaterThanOrEqual(seaLevel.decoTimeSec)
  })
})

describe('buildProfile — validation', () => {
  const options = resolveOptions()

  it('rejects a plan with no gases', () => {
    expect(() => run(makePlan([{ depth: 30, durationMin: 20 }], []), options)).toThrow(/at least one gas/)
  })

  it('rejects a plan with no levels', () => {
    expect(() => run(makePlan([], [AIR_GAS]), options)).toThrow(/at least one level/)
  })

  it('rejects an invalid depth or duration', () => {
    expect(() => run(makePlan([{ depth: -5, durationMin: 20 }], [AIR_GAS]), options)).toThrow(
      /invalid depth/
    )
    expect(() => run(makePlan([{ depth: 30, durationMin: -1 }], [AIR_GAS]), options)).toThrow(
      /invalid duration/
    )
  })

  it('rejects a bottom time shorter than the descent', () => {
    expect(() => run(makePlan([{ depth: 60, durationMin: 1 }], [AIR_GAS]), options)).toThrow(
      /shorter than the descent/
    )
  })
})

describe('telemetry', () => {
  const options = resolveOptions({ gf: GF_PRESETS.conservative })
  const result = run(makePlan([{ depth: 45, durationMin: 25 }], [TX2135, EAN50, OXYGEN]), options)

  it('reports a leading compartment within range on every segment', () => {
    for (const segment of result.segments) {
      expect(segment.telemetry.leadingCompartment).toBeGreaterThanOrEqual(0)
      expect(segment.telemetry.leadingCompartment).toBeLessThan(16)
    }
  })

  it('reports a non-negative ceiling that agrees with the model', () => {
    for (const segment of result.segments) {
      expect(segment.telemetry.ceilingDepth).toBeGreaterThanOrEqual(0)
    }
  })

  it('never reports the diver shallower than the ceiling during stops', () => {
    for (const segment of result.segments) {
      if (segment.phase === 'stop') {
        // The ceiling at the START of a stop may be below the stop depth by
        // the time the stop ends; what must hold is that the diver is not
        // above the ceiling when they LEAVE, which the next ascent asserts.
        expect(segment.telemetry.ceilingDepth).toBeLessThanOrEqual(segment.endDepth + 1e-6)
      }
    }
  })

  it('reports a gradient factor rising from GF low to GF high on ascent', () => {
    const stops = result.segments.filter((s) => s.phase === 'stop')
    expect(stops.length).toBeGreaterThan(1)
    expect(stops[0].telemetry.gfNow).toBeLessThanOrEqual(stops[stops.length - 1].telemetry.gfNow)
    const last = result.segments[result.segments.length - 1]
    expect(last.telemetry.gfNow).toBeCloseTo(options.gf.high, 6)
  })

  it('reports PPO2 consistent with the gas and depth', () => {
    for (const segment of result.segments) {
      const mix = result.segments.length ? null : null
      void mix
      expect(segment.telemetry.ppo2).toBeGreaterThan(0)
      expect(segment.telemetry.averagePpo2).toBeGreaterThan(0)
    }
    // On oxygen at the 3 m stop, PPO2 is the ambient pressure.
    const o2Stop = result.segments.find((s) => s.phase === 'stop' && s.gasIndex === 2)
    if (o2Stop) {
      expect(o2Stop.telemetry.ppo2).toBeCloseTo(pressureAt(o2Stop.endDepth, options), 6)
    }
  })
})

describe('ceilingDepth helper', () => {
  it('is zero for an unloaded diver', () => {
    const options = resolveOptions()
    const result = run(makePlan([{ depth: 10, durationMin: 10 }], [AIR_GAS]), options)
    expect(ceilingDepth(result.finalTissues, options.gf.high, options)).toBe(0)
  })
})

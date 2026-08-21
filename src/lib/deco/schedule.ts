/**
 * Schedule generation: a dive profile in, a full runtime table out.
 *
 * Ported from DecoTengu (GPL-3.0) — decotengu/engine.py (`Engine._dive_ascent`,
 * `_find_first_stop`, `_deco_staged_ascent`, `_deco_stop`, `_ndl_ascent`,
 * `_free_staged_ascent`). Copyright original authors (Artur Wroblewski);
 * TypeScript port for DiveBlendr.
 *
 * THE ALGORITHM
 * -------------
 * 1. Descend to the first level, then run the bottom segments.
 * 2. Ask whether a direct ascent to the surface at GF_high would violate any
 *    ceiling. If not, the dive is within the no-decompression limit and we are
 *    done (DecoTengu `_ndl_ascent`).
 * 3. Otherwise find the first stop: ascend repeatedly toward the current
 *    GF_low ceiling, rounded up to the next stop multiple, until further
 *    ascent is blocked (`_find_first_stop`). Ascending changes the tissue
 *    state, which moves the ceiling, so this must iterate rather than compute
 *    once — that is the subtlety the origin's loop exists to handle.
 * 4. Walk up stop by stop. At each, hold whole minutes until the ceiling
 *    clears the *next* stop depth under the GF interpolated for that next
 *    depth, then ascend one increment.
 *
 * TIME IS INTEGER SECONDS
 * -----------------------
 * Every duration is tracked as an integer number of seconds. Ascending 3 m at
 * 9 m/min takes 20 s exactly; accumulating that as 0.3333… minutes forty times
 * drifts. Minute values appear only where the model needs them (the Schreiner
 * equation) and are derived from the integer second count at the point of use.
 *
 * A DEVIATION FROM DECOTENGU, RECORDED DELIBERATELY
 * -------------------------------------------------
 * DecoTengu interpolates the gradient factor by adding a fixed increment once
 * per stop (`_deco_stops`: `gf_step = (gf_high - gf_low)/n`, where `n` is the
 * stop count from the first stop to the surface). This engine interpolates on
 * pressure via `interpolateGF`. At evenly spaced 3 m stops the two are
 * identical — `buhlmann.test.ts` asserts that — but the pressure form also
 * yields a continuous GF at arbitrary depths, which the planner UI needs for
 * its charts and which an accumulating counter cannot express. Where the two
 * could differ is a 6 m last stop, which spans two increments; the last-stop
 * handling below follows DecoTengu's treatment of that case.
 */

import type {
  DivePlanInput,
  EngineOptions,
  ScheduleSegment,
  DecoStop,
  TissueState,
  PlannedGas,
  SegmentTelemetry,
  DiveMode,
} from './types'
import { SCHEMA_VERSION } from './types'
import { MAX_STOP_MINUTES, SECONDS_PER_MINUTE, WATER_VAPOUR_PRESSURE_BAR } from './constants'
import { initialTissueState, loadTissues, type LoadingSegment } from './tissue'
import { ceiling, interpolateGF, leadingSupersaturation } from './buhlmann'
import { ambientPressure, depthFromPressure, type PressureModelOptions } from '../pressure'
import { modRaw, type GasFractions } from '../gas'

/** Pressure model derived from engine options — physical, not the 10 m/bar shortcut. */
export function pressureOptions(options: EngineOptions): PressureModelOptions {
  return {
    simple: false,
    surfacePressureBar: options.surfacePressureBar,
    waterDensityKgL: options.waterDensityKgL,
  }
}

/** Ambient pressure (bar) at a depth under the engine's pressure model. */
export function pressureAt(depth: number, options: EngineOptions): number {
  return ambientPressure(Math.max(0, depth), pressureOptions(options))
}

/** Depth (m) for an ambient pressure under the engine's pressure model. */
export function depthAt(pressureBar: number, options: EngineOptions): number {
  if (pressureBar <= options.surfacePressureBar) return 0
  return depthFromPressure(pressureBar, pressureOptions(options))
}

/**
 * The inspired inert fractions and PPO2 for a gas at a depth.
 *
 * On open circuit these are just the mix fractions. CCR overrides this via
 * `ccr.ts`, which is why the schedule builder takes it as a strategy rather
 * than reading the mix directly.
 */
export interface BreathingStrategy {
  /** Inspired fractions and PPO2 at an ambient pressure. */
  inspired(
    gas: PlannedGas,
    ambientPressureBar: number
  ): { fN2: number; fHe: number; ppo2: number; setpoint?: number }
  /** Gases usable during the ascent, in the diver's carry order. */
  readonly mode: DiveMode
}

/** Open-circuit breathing: the diver inspires the cylinder mix, unmodified. */
export const openCircuit: BreathingStrategy = {
  mode: 'oc',
  inspired(gas, ambientPressureBar) {
    return {
      fN2: gas.mix.n2,
      fHe: gas.mix.he,
      ppo2: gas.mix.o2 * ambientPressureBar,
    }
  },
}

// ---------------------------------------------------------------------------
// Gas selection
// ---------------------------------------------------------------------------

/**
 * The depth at which a deco gas becomes usable, rounded DOWN to a stop
 * multiple so the switch happens at a real stop.
 *
 * DecoTengu rounds gas switch depths to 3 m multiples in
 * `_deco_ascent_stages` (`mix.depth // 3 * 3`). Rounding down is the
 * conservative direction: it switches to the richer gas slightly shallower
 * than the theoretical MOD, never deeper.
 */
export function defaultSwitchDepth(mix: GasFractions, options: EngineOptions): number {
  if (mix.o2 <= 0) return Infinity
  const mod = modRaw(mix, options.maxDecoPPO2, pressureOptions(options))
  return Math.floor(mod / options.stopIncrement) * options.stopIncrement
}

/** Resolved switch depth for a planned gas — explicit if given, else derived. */
export function switchDepthFor(gasEntry: PlannedGas, options: EngineOptions): number {
  return gasEntry.switchDepth ?? defaultSwitchDepth(gasEntry.mix, options)
}

/**
 * Chooses the gas to breathe at a depth during ascent: the one with the
 * highest oxygen fraction whose switch depth is at or below the current depth.
 *
 * Ties (two gases with identical O2) resolve to the earlier entry, keeping the
 * choice deterministic and independent of array ordering quirks.
 */
export function selectGasIndex(
  gases: readonly PlannedGas[],
  depth: number,
  options: EngineOptions,
  usableRoles: readonly string[] = ['bottom', 'travel', 'deco', 'bailout']
): number {
  let best = 0
  let bestO2 = -Infinity
  for (let i = 0; i < gases.length; i++) {
    const entry = gases[i]
    if (!usableRoles.includes(entry.role)) continue
    const switchDepth = switchDepthFor(entry, options)
    if (depth > switchDepth + 1e-9) continue
    if (entry.mix.o2 > bestO2 + 1e-12) {
      bestO2 = entry.mix.o2
      best = i
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Segment assembly
// ---------------------------------------------------------------------------

interface BuilderState {
  tissues: TissueState
  timeSec: number
  depth: number
  segments: ScheduleSegment[]
  stops: DecoStop[]
}

/** Rounds seconds to an integer, guarding against float dust. */
function roundSec(seconds: number): number {
  return Math.round(seconds)
}

/** Seconds needed to traverse a depth change at a rate in m/min. */
export function travelSeconds(fromDepth: number, toDepth: number, ratePerMin: number): number {
  return roundSec((Math.abs(toDepth - fromDepth) / ratePerMin) * SECONDS_PER_MINUTE)
}

function telemetryFor(
  tissues: TissueState,
  depth: number,
  gf: number,
  options: EngineOptions,
  ppo2: number,
  averagePpo2: number
): SegmentTelemetry {
  const c = ceiling(tissues, gf)
  const leader = leadingSupersaturation(tissues, pressureAt(depth, options))
  return {
    leadingCompartment: leader.compartment,
    ceilingDepth: Math.max(0, depthAt(c.pressureBar, options)),
    gfNow: gf,
    ppo2,
    averagePpo2,
  }
}

/**
 * Advances the builder through one segment, loading tissues and recording the
 * runtime row. This is the single place segments are created, so telemetry and
 * timekeeping cannot diverge between phases.
 */
function advance(
  builder: BuilderState,
  params: {
    phase: ScheduleSegment['phase']
    toDepth: number
    durationSec: number
    gasIndex: number
    gases: readonly PlannedGas[]
    strategy: BreathingStrategy
    options: EngineOptions
    gfAtEnd: number
  }
): void {
  const { phase, toDepth, durationSec, gasIndex, gases, strategy, options, gfAtEnd } = params
  const fromDepth = builder.depth
  const startPressure = pressureAt(fromDepth, options)
  const endPressure = pressureAt(toDepth, options)
  const minutes = durationSec / SECONDS_PER_MINUTE

  const gasEntry = gases[gasIndex]
  const startInspired = strategy.inspired(gasEntry, startPressure)
  const endInspired = strategy.inspired(gasEntry, endPressure)

  if (durationSec > 0) {
    const pressureRate = minutes > 0 ? (endPressure - startPressure) / minutes : 0

    // On CCR the inspired inert fractions vary with depth because the setpoint
    // is a fixed partial pressure; the Schreiner ramp assumes a constant
    // fraction. Using the segment's mean fractions keeps the analytic form
    // valid to first order, which is exact at constant depth (where CCR
    // spends nearly all its time) and a close approximation on travel legs.
    const fN2 = (startInspired.fN2 + endInspired.fN2) / 2
    const fHe = (startInspired.fHe + endInspired.fHe) / 2

    const loading: LoadingSegment = {
      startPressureBar: startPressure,
      minutes,
      pressureRate,
      fN2,
      fHe,
    }
    builder.tissues = loadTissues(builder.tissues, loading)
  }

  builder.segments.push({
    phase,
    startSec: builder.timeSec,
    endSec: builder.timeSec + durationSec,
    startDepth: fromDepth,
    endDepth: toDepth,
    gasIndex,
    ...(endInspired.setpoint !== undefined ? { setpoint: endInspired.setpoint } : {}),
    ttsSec: 0, // filled in by a backward pass once the schedule is complete
    telemetry: telemetryFor(
      builder.tissues,
      toDepth,
      gfAtEnd,
      options,
      endInspired.ppo2,
      (startInspired.ppo2 + endInspired.ppo2) / 2
    ),
  })

  builder.timeSec += durationSec
  builder.depth = toDepth
}

// ---------------------------------------------------------------------------
// Ceiling helpers in depth space
// ---------------------------------------------------------------------------

/** Ceiling depth (m) under a gradient factor, never negative. */
export function ceilingDepth(tissues: TissueState, gf: number, options: EngineOptions): number {
  const c = ceiling(tissues, gf)
  return Math.max(0, depthAt(c.pressureBar, options))
}

/** Rounds a depth UP to the next stop multiple (deeper), per DecoTengu `_ceil_pressure_3m`. */
export function ceilToStop(depth: number, options: EngineOptions): number {
  const { stopIncrement } = options
  const stops = Math.ceil(depth / stopIncrement - 1e-9)
  return Math.max(0, stops * stopIncrement)
}

/**
 * Simulates a direct ascent to the surface and reports whether it stays within
 * the ceiling at GF_high throughout.
 *
 * DecoTengu's `_ndl_ascent` checks only the surfacing state. Checking the whole
 * way up is stricter: a fast compartment can be violated mid-ascent and have
 * offgassed by the time the surface is reached, which the endpoint-only test
 * would miss. The extra checks cost nothing and can only make the engine more
 * conservative.
 */
function canAscendDirectly(
  tissues: TissueState,
  fromDepth: number,
  gasIndex: number,
  gases: readonly PlannedGas[],
  strategy: BreathingStrategy,
  options: EngineOptions
): boolean {
  const gfHigh = options.gf.high
  let state = tissues
  let depth = fromDepth
  const stepDepth = options.stopIncrement

  while (depth > 0) {
    const next = Math.max(0, depth - stepDepth)
    const seconds = travelSeconds(depth, next, options.ascentRate)
    const startPressure = pressureAt(depth, options)
    const endPressure = pressureAt(next, options)
    const minutes = seconds / SECONDS_PER_MINUTE
    const inspiredStart = strategy.inspired(gases[gasIndex], startPressure)
    const inspiredEnd = strategy.inspired(gases[gasIndex], endPressure)

    state = loadTissues(state, {
      startPressureBar: startPressure,
      minutes,
      pressureRate: minutes > 0 ? (endPressure - startPressure) / minutes : 0,
      fN2: (inspiredStart.fN2 + inspiredEnd.fN2) / 2,
      fHe: (inspiredStart.fHe + inspiredEnd.fHe) / 2,
    })

    if (ceiling(state, gfHigh).pressureBar > endPressure + 1e-9) return false
    depth = next
  }
  return true
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Everything the schedule builder needs beyond the plan itself. */
export interface BuildContext {
  readonly strategy: BreathingStrategy
  /** Restricts which gases may be selected on ascent (CCR bailout uses this). */
  readonly ascentRoles?: readonly string[]
}

export interface BuiltProfile {
  readonly segments: readonly ScheduleSegment[]
  readonly stops: readonly DecoStop[]
  readonly finalTissues: TissueState
  readonly maxDepth: number
  readonly runtimeSec: number
  readonly decoTimeSec: number
  readonly isDecoDive: boolean
  readonly warnings: readonly string[]
}

/**
 * Builds the complete runtime table for a plan.
 *
 * Deterministic: given the same plan and options it returns byte-identical
 * output. No clock, no randomness.
 */
export function buildProfile(
  plan: DivePlanInput,
  options: EngineOptions,
  context: BuildContext
): BuiltProfile {
  const { strategy, ascentRoles } = context
  const gases = plan.gases
  const warnings: string[] = []

  if (gases.length === 0) throw new Error('A dive plan needs at least one gas')
  if (plan.levels.length === 0) throw new Error('A dive plan needs at least one level')

  const builder: BuilderState = {
    tissues: plan.initialTissues ?? initialTissueState(options.surfacePressureBar),
    timeSec: 0,
    depth: 0,
    segments: [],
    stops: [],
  }

  let maxDepth = 0

  // --- Descent and bottom levels -------------------------------------------
  for (let i = 0; i < plan.levels.length; i++) {
    const level = plan.levels[i]
    if (!Number.isFinite(level.depth) || level.depth < 0) {
      throw new Error(`Level ${i + 1} has an invalid depth (${level.depth} m)`)
    }
    if (!Number.isFinite(level.durationMin) || level.durationMin < 0) {
      throw new Error(`Level ${i + 1} has an invalid duration (${level.durationMin} min)`)
    }
    maxDepth = Math.max(maxDepth, level.depth)

    const gasIndex = level.gasIndex ?? selectGasIndex(gases, level.depth, options, ['bottom', 'travel'])

    // Travel to the level's depth.
    if (Math.abs(level.depth - builder.depth) > 1e-9) {
      const descending = level.depth > builder.depth
      const rate = descending ? options.descentRate : options.ascentRate
      const travelSec = travelSeconds(builder.depth, level.depth, rate)
      advance(builder, {
        phase: descending ? 'descent' : 'ascent',
        toDepth: level.depth,
        durationSec: travelSec,
        gasIndex,
        gases,
        strategy,
        options,
        gfAtEnd: options.gf.low,
      })

      // The conventional reading of "40 m for 20 min" is that runtime at the
      // end of the bottom phase is 20 min, i.e. the descent is inside it.
      if (i === 0 && options.runtimeIncludesDescent) {
        const remainingSec = roundSec(level.durationMin * SECONDS_PER_MINUTE) - travelSec
        if (remainingSec < 0) {
          throw new Error(
            `Level 1 duration (${level.durationMin} min) is shorter than the descent to ` +
              `${level.depth} m at ${options.descentRate} m/min`
          )
        }
        if (remainingSec > 0) {
          advance(builder, {
            phase: 'bottom',
            toDepth: level.depth,
            durationSec: remainingSec,
            gasIndex,
            gases,
            strategy,
            options,
            gfAtEnd: options.gf.low,
          })
        }
        continue
      }
    }

    const holdSec = roundSec(level.durationMin * SECONDS_PER_MINUTE)
    if (holdSec > 0) {
      advance(builder, {
        phase: 'bottom',
        toDepth: level.depth,
        durationSec: holdSec,
        gasIndex,
        gases,
        strategy,
        options,
        gfAtEnd: options.gf.low,
      })
    }
  }

  // --- Ascent ---------------------------------------------------------------
  const roles = ascentRoles ?? ['bottom', 'travel', 'deco', 'bailout']
  const bottomGasIndex = builder.segments.length
    ? builder.segments[builder.segments.length - 1].gasIndex
    : 0

  const surfaceDirectly = canAscendDirectly(
    builder.tissues,
    builder.depth,
    bottomGasIndex,
    gases,
    strategy,
    options
  )

  if (surfaceDirectly) {
    ascendTo(builder, 0, bottomGasIndex, gases, strategy, options, options.gf.high, 'ascent')
  } else {
    runDecompression(builder, gases, strategy, options, roles, warnings)
  }

  // --- TTS backfill ---------------------------------------------------------
  // TTS at a segment's end is the time from there to surfacing. Computed by a
  // single backward pass rather than by re-planning at each point, which would
  // be O(n^2) and could disagree with the schedule actually flown.
  const totalSec = builder.timeSec
  const segments = builder.segments.map((segment) => ({
    ...segment,
    ttsSec: totalSec - segment.endSec,
  }))

  const decoTimeSec = builder.stops.reduce(
    (sum, stop) => sum + roundSec(stop.minutes * SECONDS_PER_MINUTE),
    0
  )

  return {
    segments,
    stops: builder.stops,
    finalTissues: builder.tissues,
    maxDepth,
    runtimeSec: totalSec,
    decoTimeSec,
    isDecoDive: builder.stops.length > 0,
    warnings,
  }
}

/** Ascends to a target depth in one segment. */
function ascendTo(
  builder: BuilderState,
  toDepth: number,
  gasIndex: number,
  gases: readonly PlannedGas[],
  strategy: BreathingStrategy,
  options: EngineOptions,
  gfAtEnd: number,
  phase: ScheduleSegment['phase'] = 'ascent'
): void {
  if (Math.abs(toDepth - builder.depth) < 1e-9) return
  const seconds = travelSeconds(builder.depth, toDepth, options.ascentRate)
  advance(builder, {
    phase,
    toDepth,
    durationSec: seconds,
    gasIndex,
    gases,
    strategy,
    options,
    gfAtEnd,
  })
}

/**
 * Finds the first (deepest) decompression stop.
 *
 * Port of DecoTengu `_find_first_stop`. The loop is essential: each ascent
 * offgasses the fast compartments and lifts the ceiling, so a single
 * evaluation of the ceiling at the bottom would stop far too deep.
 */
function findFirstStopDepth(
  tissues: TissueState,
  fromDepth: number,
  gasIndex: number,
  gases: readonly PlannedGas[],
  strategy: BreathingStrategy,
  options: EngineOptions
): { depth: number; tissues: TissueState; elapsedSec: number } {
  let state = tissues
  let depth = fromDepth
  let elapsedSec = 0

  // Guard against a pathological non-converging profile.
  const maxIterations = Math.ceil(fromDepth / options.stopIncrement) + 8

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const target = Math.max(
      ceilToStop(ceilingDepth(state, options.gf.low, options), options),
      0
    )
    if (target >= depth - 1e-9) break

    const seconds = travelSeconds(depth, target, options.ascentRate)
    const minutes = seconds / SECONDS_PER_MINUTE
    const startPressure = pressureAt(depth, options)
    const endPressure = pressureAt(target, options)
    const inspiredStart = strategy.inspired(gases[gasIndex], startPressure)
    const inspiredEnd = strategy.inspired(gases[gasIndex], endPressure)

    state = loadTissues(state, {
      startPressureBar: startPressure,
      minutes,
      pressureRate: minutes > 0 ? (endPressure - startPressure) / minutes : 0,
      fN2: (inspiredStart.fN2 + inspiredEnd.fN2) / 2,
      fHe: (inspiredStart.fHe + inspiredEnd.fHe) / 2,
    })
    elapsedSec += seconds
    depth = target
  }

  return { depth, tissues: state, elapsedSec }
}

/**
 * Runs the decompression ascent: first stop, then stop-by-stop to the surface.
 */
function runDecompression(
  builder: BuilderState,
  gases: readonly PlannedGas[],
  strategy: BreathingStrategy,
  options: EngineOptions,
  roles: readonly string[],
  warnings: string[]
): void {
  const { stopIncrement, lastStopDepth } = options

  // --- Ascend to the first stop --------------------------------------------
  const bottomGasIndex = builder.segments.length
    ? builder.segments[builder.segments.length - 1].gasIndex
    : 0

  const first = findFirstStopDepth(
    builder.tissues,
    builder.depth,
    bottomGasIndex,
    gases,
    strategy,
    options
  )

  const firstStopDepth = Math.max(first.depth, lastStopDepth)
  const firstStopPressure = pressureAt(firstStopDepth, options)

  if (firstStopDepth < builder.depth - 1e-9) {
    // Ascend in stop-sized legs so the runtime table shows the ascent
    // profile rather than one long jump, and so gas switches en route are
    // possible at their proper depths.
    let depth = builder.depth
    while (depth > firstStopDepth + 1e-9) {
      const next = Math.max(firstStopDepth, depth - stopIncrement)
      const gasIndex = selectGasIndex(gases, next, options, roles)
      if (gasIndex !== builder.segments[builder.segments.length - 1]?.gasIndex) {
        // Switch happens at the shallower depth, after arriving.
        ascendTo(
          builder,
          next,
          builder.segments[builder.segments.length - 1].gasIndex,
          gases,
          strategy,
          options,
          interpolateGF(options.gf, pressureAt(next, options), firstStopPressure, options.surfacePressureBar)
        )
        recordGasSwitch(builder, gasIndex, gases, strategy, options, firstStopPressure)
      } else {
        ascendTo(
          builder,
          next,
          gasIndex,
          gases,
          strategy,
          options,
          interpolateGF(options.gf, pressureAt(next, options), firstStopPressure, options.surfacePressureBar)
        )
      }
      depth = next
    }
  }

  // --- Stop-by-stop to the surface -----------------------------------------
  let stopDepth = firstStopDepth
  let guard = 0

  while (stopDepth > 0) {
    guard++
    if (guard > 1000) {
      warnings.push('Decompression ascent did not converge; schedule truncated.')
      break
    }

    // Next shallower stop. From the last stop depth, the next target is the
    // surface.
    const nextDepth = stopDepth <= lastStopDepth + 1e-9 ? 0 : Math.max(lastStopDepth, stopDepth - stopIncrement)

    const gasIndex = selectGasIndex(gases, stopDepth, options, roles)
    const currentGasIndex = builder.segments[builder.segments.length - 1]?.gasIndex ?? gasIndex
    if (gasIndex !== currentGasIndex) {
      recordGasSwitch(builder, gasIndex, gases, strategy, options, firstStopPressure)
    }

    // The stop lasts until ascent to `nextDepth` is permitted under the GF
    // interpolated *for that next depth* — DecoTengu `_deco_stop` guards the
    // current stop with the next stop's gradient factor.
    const nextPressure = pressureAt(nextDepth, options)
    const gfNext = interpolateGF(
      options.gf,
      nextPressure,
      firstStopPressure,
      options.surfacePressureBar
    )

    const stopMinutes = holdUntilClear(
      builder,
      stopDepth,
      nextDepth,
      gasIndex,
      gases,
      strategy,
      options,
      gfNext,
      warnings
    )

    if (stopMinutes > 0) {
      builder.stops.push({ depth: stopDepth, minutes: stopMinutes, gasIndex })
    }

    ascendTo(
      builder,
      nextDepth,
      gasIndex,
      gases,
      strategy,
      options,
      interpolateGF(options.gf, nextPressure, firstStopPressure, options.surfacePressureBar)
    )

    stopDepth = nextDepth
  }
}

/** Records a zero-or-fixed-duration gas switch segment. */
function recordGasSwitch(
  builder: BuilderState,
  gasIndex: number,
  gases: readonly PlannedGas[],
  strategy: BreathingStrategy,
  options: EngineOptions,
  firstStopPressure: number
): void {
  const durationSec = roundSec(options.gasSwitchMinutes * SECONDS_PER_MINUTE)
  advance(builder, {
    phase: 'gas-switch',
    toDepth: builder.depth,
    durationSec,
    gasIndex,
    gases,
    strategy,
    options,
    gfAtEnd: interpolateGF(
      options.gf,
      pressureAt(builder.depth, options),
      firstStopPressure,
      options.surfacePressureBar
    ),
  })
}

/**
 * Holds at a stop, one minute at a time, until ascent to `nextDepth` is clear.
 *
 * DecoTengu accelerates this with a linear-then-bisection search
 * (`_deco_stop`). A plain minute loop is used here instead: stops are whole
 * minutes by definition, the loop is bounded, and each iteration is a handful
 * of exponentials — the search machinery buys nothing at this scale and the
 * straightforward loop is far easier to verify against the model. The
 * *result* is identical, since both find the least whole minute that clears.
 */
function holdUntilClear(
  builder: BuilderState,
  stopDepth: number,
  nextDepth: number,
  gasIndex: number,
  gases: readonly PlannedGas[],
  strategy: BreathingStrategy,
  options: EngineOptions,
  gfNext: number,
  warnings: string[]
): number {
  const nextPressure = pressureAt(nextDepth, options)
  const stopPressure = pressureAt(stopDepth, options)
  const gasEntry = gases[gasIndex]
  const inspired = strategy.inspired(gasEntry, stopPressure)

  const clears = (state: TissueState): boolean =>
    ceiling(state, gfNext).pressureBar <= nextPressure + 1e-9

  let minutes = 0
  let state = builder.tissues

  /**
   * A stop, once reached, is charged a whole minute before ascent is even
   * considered. This mirrors DecoTengu `_deco_stop`, which loads
   * `const.MINUTE` unconditionally and only then tests `_can_ascend`.
   *
   * The alternative — testing before loading — permits zero-minute stops when
   * the diver arrives already clear. That is arguably truer to the model, but
   * it is not what a deco planner should emit: stops are whole minutes by
   * convention, a diver cannot execute a zero-minute stop, and rounding the
   * obligation down is the non-conservative direction. Matching the origin
   * here also keeps the schedules directly comparable with DecoTengu, which
   * is what the validation matrix checks.
   */
  do {
    state = loadTissues(state, {
      startPressureBar: stopPressure,
      minutes: 1,
      pressureRate: 0,
      fN2: inspired.fN2,
      fHe: inspired.fHe,
    })
    minutes++
  } while (!clears(state) && minutes < MAX_STOP_MINUTES)

  if (minutes >= MAX_STOP_MINUTES) {
    warnings.push(
      `Stop at ${stopDepth} m exceeded ${MAX_STOP_MINUTES} minutes without clearing; ` +
        'the profile may be unplannable with the configured gases.'
    )
  }

  // Enforce the configured minimum stop length for stops that are real.
  if (minutes > 0 && minutes < options.minStopMinutes) {
    const extra = options.minStopMinutes - minutes
    state = loadTissues(state, {
      startPressureBar: stopPressure,
      minutes: extra,
      pressureRate: 0,
      fN2: inspired.fN2,
      fHe: inspired.fHe,
    })
    minutes = options.minStopMinutes
  }

  if (minutes > 0) {
    advance(builder, {
      phase: 'stop',
      toDepth: stopDepth,
      durationSec: minutes * SECONDS_PER_MINUTE,
      gasIndex,
      gases,
      strategy,
      options,
      // Telemetry at the end of the stop reports the GF governing the ascent
      // the diver is now cleared to make.
      gfAtEnd: gfNext,
    })
  }

  return minutes
}

/**
 * No-decompression limit at the first level, in whole minutes.
 *
 * Found by binary search on bottom time: the largest whole-minute bottom time
 * whose schedule requires no stop. Binary search is valid because the
 * obligation is monotonic in bottom time — more time at depth can never reduce
 * a decompression requirement.
 */
export function findNDL(
  plan: DivePlanInput,
  options: EngineOptions,
  context: BuildContext,
  maxMinutes = 999
): number | null {
  const level = plan.levels[0]

  /**
   * The shortest bottom time that is even expressible. When the first level's
   * duration includes the descent, any duration below the descent time is
   * rejected by `buildProfile`, so the search must start above it — treating
   * that rejection as "decompression required" would report an NDL of 0 for
   * every dive deep enough that the descent takes over a minute.
   */
  const descentSec = travelSeconds(0, level.depth, options.descentRate)
  const floorMinutes = options.runtimeIncludesDescent
    ? Math.ceil(descentSec / SECONDS_PER_MINUTE)
    : 0

  const attempt = (minutes: number): boolean => {
    const probe: DivePlanInput = {
      ...plan,
      levels: [{ ...level, durationMin: minutes }],
    }
    try {
      return !buildProfile(probe, options, context).isDecoDive
    } catch {
      // Unplannable (e.g. shorter than the descent) — not an NDL answer.
      return false
    }
  }

  // Search over whole minutes strictly above the floor.
  let low = floorMinutes + 1
  if (!attempt(low)) return 0
  if (attempt(maxMinutes)) return maxMinutes

  let high = maxMinutes
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2)
    if (attempt(mid)) low = mid
    else high = mid - 1
  }
  return low
}

/** Water vapour pressure re-exported for callers building inspired pressures. */
export { WATER_VAPOUR_PRESSURE_BAR, SCHEMA_VERSION }

/**
 * Shared types for the decompression engine.
 *
 * Ported from DecoTengu (GPL-3.0) — decotengu/engine.py, decotengu/model.py.
 * Copyright original authors (Artur Wroblewski); TypeScript port for DiveBlendr.
 *
 * DESIGN RULES ENFORCED BY THESE TYPES
 * ------------------------------------
 * 1. **Everything is a plain serializable object.** No classes, no methods on
 *    state, no `Map`/`Set`/`Date` in any persisted shape. Plans are stored and
 *    shared (Phase 4), so every state type must survive `JSON.parse(JSON.stringify(x))`
 *    unchanged.
 * 2. **Time is integer seconds, everywhere internally.** Minute-valued fields
 *    exist only on output types, for display. Accumulating floating-point
 *    minutes across a 40-segment schedule drifts; integer seconds cannot.
 * 3. **Pressure is bar, depth is metres, volume is litres** — the Phase 1
 *    convention, unchanged.
 */

import type { GasFractions } from '../gas'

/** Bumped whenever a persisted shape changes incompatibly. */
export const SCHEMA_VERSION = 1

/** Number of tissue compartments in ZH-L16. */
export const COMPARTMENT_COUNT = 16

// ---------------------------------------------------------------------------
// Tissue state
// ---------------------------------------------------------------------------

/**
 * Inert gas loading of the 16 compartments.
 *
 * `n2[i]` and `he[i]` are the partial pressures (bar) of nitrogen and helium in
 * compartment `i`. Two parallel arrays rather than an array of pairs: this
 * serializes to compact JSON and avoids allocating 16 objects per step, which
 * matters because a long schedule evaluates this thousands of times.
 */
export interface TissueState {
  readonly schemaVersion: number
  /** Nitrogen tension per compartment, bar. Length 16. */
  readonly n2: readonly number[]
  /** Helium tension per compartment, bar. Length 16. */
  readonly he: readonly number[]
}

// ---------------------------------------------------------------------------
// Gases
// ---------------------------------------------------------------------------

/** What a gas is carried for. Drives switch-depth defaults and PPO2 ceilings. */
export type GasRole = 'bottom' | 'travel' | 'deco' | 'diluent' | 'bailout'

/** A gas mix together with its planning role and switch depth. */
export interface PlannedGas {
  readonly mix: GasFractions
  readonly role: GasRole
  /**
   * Depth (m) at which this gas becomes usable on ascent. When omitted the
   * engine derives it from the mix's MOD at the configured deco PPO2, rounded
   * down to a standard stop depth.
   */
  readonly switchDepth?: number
  /** Optional label for UI ("EAN50", "Bottom 18/45"). Derived if absent. */
  readonly label?: string
}

// ---------------------------------------------------------------------------
// Dive profile input
// ---------------------------------------------------------------------------

/** One planned bottom segment. Multi-level dives are a list of these. */
export interface ProfileLevel {
  /** Depth in metres. */
  readonly depth: number
  /**
   * Time in minutes spent at this level. For the first level this is the
   * conventional "bottom time" and, per `runtimeIncludesDescent`, may or may
   * not include the descent.
   */
  readonly durationMin: number
  /** Index into the plan's gas list. Defaults to the bottom gas. */
  readonly gasIndex?: number
}

/** Open-circuit or closed-circuit. */
export type DiveMode = 'oc' | 'ccr'

/** A CCR setpoint that applies from a depth (on descent) or shallower. */
export interface SetpointSchedule {
  /** Setpoint (bar PPO2) used during descent and shallow phases. */
  readonly low: number
  /** Setpoint used at the bottom. */
  readonly bottom: number
  /** Setpoint used during decompression. */
  readonly deco: number
  /** Depth (m) at or below which `bottom` applies. */
  readonly bottomSwitchDepth: number
  /** Depth (m) at or above which `deco` applies during ascent. */
  readonly decoSwitchDepth: number
}

/** A complete dive to be planned. */
export interface DivePlanInput {
  readonly schemaVersion: number
  readonly mode: DiveMode
  /** Ordered bottom segments. At least one. */
  readonly levels: readonly ProfileLevel[]
  /** Gases available. Index 0 must be the bottom gas (OC) or diluent (CCR). */
  readonly gases: readonly PlannedGas[]
  /** CCR setpoints. Required when `mode === 'ccr'`, ignored otherwise. */
  readonly setpoints?: SetpointSchedule
  /**
   * Tissue state to start from — a repetitive dive's carryover. When absent the
   * diver is assumed saturated on air at surface pressure.
   */
  readonly initialTissues?: TissueState
  /** CNS% already accumulated at the start of this dive (repetitive chains). */
  readonly initialCnsPercent?: number
  /** OTU already accumulated today. */
  readonly initialOtu?: number
}

// ---------------------------------------------------------------------------
// Engine options
// ---------------------------------------------------------------------------

/** Gradient factor pair, as fractions (0.3 = GF 30). */
export interface GradientFactors {
  readonly low: number
  readonly high: number
}

/** Named GF presets offered in preferences. */
export type GradientFactorPreset = 'conservative' | 'moderate' | 'aggressive' | 'custom'

export interface EngineOptions {
  readonly gf: GradientFactors
  /** Descent rate, m/min. Positive. */
  readonly descentRate: number
  /** Ascent rate, m/min. Positive (magnitude). */
  readonly ascentRate: number
  /** Depth of the shallowest stop, 3 or 6 m. */
  readonly lastStopDepth: number
  /** Spacing between stops, conventionally 3 m. */
  readonly stopIncrement: number
  /** Minimum length of any stop, minutes. */
  readonly minStopMinutes: number
  /** Extra time added at each gas switch, minutes (0 = instantaneous). */
  readonly gasSwitchMinutes: number
  /** Surface (atmospheric) pressure in bar — altitude support. */
  readonly surfacePressureBar: number
  /** Water density kg/L — salinity support. */
  readonly waterDensityKgL: number
  /** Max PPO2 (bar) used to derive deco gas switch depths when not explicit. */
  readonly maxDecoPPO2: number
  /** Max PPO2 (bar) permitted on the bottom gas, used for warnings. */
  readonly maxBottomPPO2: number
  /** Whether the first level's `durationMin` includes the descent time. */
  readonly runtimeIncludesDescent: boolean
}

// ---------------------------------------------------------------------------
// Schedule output
// ---------------------------------------------------------------------------

export type SegmentPhase =
  | 'descent'
  | 'bottom'
  | 'ascent'
  | 'stop'
  | 'gas-switch'
  | 'surface-interval'

/** Per-segment engine telemetry, for charts and "show the math" panels. */
export interface SegmentTelemetry {
  /** Index of the compartment with the shallowest tolerated ceiling. */
  readonly leadingCompartment: number
  /** Ceiling depth (m) at the end of the segment under the current GF. */
  readonly ceilingDepth: number
  /** The interpolated gradient factor in force at the end of the segment. */
  readonly gfNow: number
  /** Inspired PPO2 (bar) at the end of the segment. */
  readonly ppo2: number
  /** Inspired PPO2 (bar) averaged over the segment — what CNS/OTU charge. */
  readonly averagePpo2: number
}

/** One row of the runtime table. */
export interface ScheduleSegment {
  readonly phase: SegmentPhase
  /** Runtime at segment start, integer seconds. */
  readonly startSec: number
  /** Runtime at segment end, integer seconds. */
  readonly endSec: number
  /** Depth at segment start, m. */
  readonly startDepth: number
  /** Depth at segment end, m. */
  readonly endDepth: number
  /** Index into the plan's gas list. */
  readonly gasIndex: number
  /** CCR setpoint in force, bar. Absent on open circuit. */
  readonly setpoint?: number
  /** Time-to-surface at the END of this segment, integer seconds. */
  readonly ttsSec: number
  readonly telemetry: SegmentTelemetry
}

/** A decompression stop, as divers read it. */
export interface DecoStop {
  readonly depth: number
  readonly minutes: number
  readonly gasIndex: number
}

/** Oxygen exposure summary. */
export interface OxygenExposure {
  /** CNS% accumulated over this dive, including any carried-in value. */
  readonly cnsPercent: number
  /** True when any segment's PPO2 was outside the NOAA table (>1.6 bar). */
  readonly cnsOverLimit: boolean
  /** OTU accumulated over this dive, including any carried-in value. */
  readonly otu: number
}

/** Verdict of the ICD screening at one gas switch. */
export type IcdVerdict = 'ok' | 'caution' | 'warning'

export interface IcdCheck {
  /** Runtime of the switch, integer seconds. */
  readonly atSec: number
  readonly depth: number
  readonly fromGasIndex: number
  readonly toGasIndex: number
  /** Change in helium fraction (negative when He drops). */
  readonly deltaFHe: number
  /** Change in nitrogen fraction (positive when N2 rises). */
  readonly deltaFN2: number
  /** ΔFN2 / |ΔFHe|; Infinity when He does not drop but N2 rises. */
  readonly ratio: number
  readonly verdict: IcdVerdict
  /** Human-readable reason, for the UI. */
  readonly message: string
  /**
   * Largest N2 fraction increase that would satisfy the rule of fifths, and
   * the deco mix implied by it. Absent when the switch already complies.
   */
  readonly suggestedMaxDeltaFN2?: number
  readonly suggestedMix?: GasFractions
}

/** A generated dive schedule — the engine's primary output. */
export interface DecoSchedule {
  readonly schemaVersion: number
  readonly mode: DiveMode
  /** The full runtime table. */
  readonly segments: readonly ScheduleSegment[]
  /** Just the stops, for the classic deco table view. */
  readonly stops: readonly DecoStop[]
  /** Gases referenced by `gasIndex` throughout. */
  readonly gases: readonly PlannedGas[]
  /** Total runtime, integer seconds. */
  readonly runtimeSec: number
  /** Total decompression time (sum of stops), integer seconds. */
  readonly decoTimeSec: number
  /** Deepest depth reached, m. */
  readonly maxDepth: number
  /**
   * No-decompression limit at the first level, minutes — only when the dive
   * required no stops. `null` for decompression dives.
   */
  readonly ndlMinutes: number | null
  /** True when the dive required at least one decompression stop. */
  readonly isDecoDive: boolean
  readonly oxygen: OxygenExposure
  readonly icd: readonly IcdCheck[]
  /** Tissue state at the moment of surfacing — feeds repetitive planning. */
  readonly finalTissues: TissueState
  /** The options the schedule was generated under, for reproducibility. */
  readonly options: EngineOptions
  /** Non-fatal advisories raised while planning. */
  readonly warnings: readonly string[]
}

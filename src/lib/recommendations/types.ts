/**
 * Types for the best-mix recommendation engine.
 *
 * Phase 4 extraction. The recommendation generator used to live inline in
 * `src/app/(tools)/calculator/page.tsx` as ~650 lines of `recommendations.push({...})`
 * with hand-written KaTeX strings interleaved into the same expressions that did
 * the arithmetic. Two consequences of that shape mattered:
 *
 * 1. The displayed derivation and the computed number came from *different*
 *    expressions, so they could — and did — disagree (see FINDINGS in
 *    `engine.ts`).
 * 2. Nothing was testable, because producing a recommendation required a React
 *    render.
 *
 * This module is pure and framework-free. Preferences arrive as a parameter,
 * output is data, and every LaTeX string is built by `math.ts` from the same
 * numbers the calculation produced.
 */

import type { GasFractions } from '../gas'
import type { LimitingFactor } from '../operatingDepth'
import type { DiveMode, SafetyWarning } from '../warnings'
import type { UnitFormatter } from '../units'

export type { DiveMode }

/**
 * What a recommended gas is for. Drives which PPO2 ceiling applies and how the
 * card is grouped in the UI.
 */
export type RecommendationRole =
  | 'bottom'
  | 'diluent'
  | 'travel'
  | 'deco'
  | 'bailout'

/** Why a mix is on the list: computed for the diver, or a standard fill. */
export type RecommendationOrigin = 'optimised' | 'standard'

/**
 * One line of a derivation.
 *
 * `latex` is display math without delimiters — the renderer supplies them, so
 * no part of the app has to agree on `$$` conventions. `note` carries the plain
 * prose that used to be `<strong>…</strong>` inside the HTML blob.
 */
export interface MathStep {
  /** Short heading, e.g. "Optimal oxygen fraction". Omitted for continuation lines. */
  label?: string
  /** The general formula, in LaTeX, with symbols rather than numbers. */
  formula?: string
  /** The same formula with this recommendation's numbers substituted in. */
  substitution?: string
  /** The result line, e.g. "\\text{MOD} = 32\\,\\text{m}". */
  result?: string
  /** Plain-language explanation shown under the math. */
  note?: string
}

/** A named derivation attached to a recommendation. */
export interface MathDerivation {
  title: string
  steps: MathStep[]
}

/** The analysed properties of a recommended mix at the planned depth. */
export interface MixAnalysis {
  /** Ambient pressure at the target depth, bar. */
  ambientPressureBar: number
  /** PPO2 of this mix at the target depth, bar. */
  ppo2AtTarget: number
  /**
   * Maximum operating depth at the applicable PPO2 ceiling, whole metres.
   * This is the OXYGEN limit alone — not the depth the gas may be dived to.
   * Use `operatingDepthMeters` for that.
   */
  modMeters: number
  /**
   * The depth this gas may actually be taken to, whole metres: the shallowest
   * of the oxygen, narcosis and density limits.
   */
  operatingDepthMeters: number
  /** Which constraint set `operatingDepthMeters`. */
  limitedBy: LimitingFactor
  /** Depth at which END reaches the diver's limit; Infinity if never. */
  narcosisDepthMeters: number
  /** Depth at which density reaches the diver's limit; Infinity if never. */
  densityDepthMeters: number
  /** The PPO2 ceiling the MOD was computed against, bar. */
  modPPO2: number
  /** Equivalent narcotic depth at the mix's own MOD, whole metres. */
  endMeters: number
  /** Gas density at the mix's own MOD, g/L. */
  densityGramsPerLiter: number
  /**
   * Shallowest depth at which the mix still delivers PPO2 0.16 bar, whole
   * metres. Zero for any normoxic mix.
   */
  hypoxicCeilingMeters: number
  /** True when the mix is not breathable at the surface. */
  hypoxic: boolean
  /** CNS clock percentage for the planned bottom time, or null outside the NOAA table. */
  cnsPercent: number | null
  /** True when PPO2 is above the highest tabulated NOAA value. */
  cnsOverLimit: boolean
}

/** One recommended gas. */
export interface Recommendation {
  /** Stable identity, unique within a result set. Used as a React key. */
  id: string
  /** Conventional label: "EAN32", "18/45", "Air", "O₂". */
  label: string
  /** Human-readable role heading, e.g. "Optimised bottom gas". */
  title: string
  role: RecommendationRole
  origin: RecommendationOrigin
  /** Composition as fractions (0–1). */
  mix: GasFractions
  /** Composition as whole percentages, which is how a blender fills it. */
  percentages: { o2: number; he: number; n2: number }
  analysis: MixAnalysis
  /** Warnings for this mix at the planned depth, severity-ordered by the caller. */
  warnings: SafetyWarning[]
  /** One-line reason this mix is being suggested. */
  rationale: string
  /** The derivation behind the numbers above. */
  math: MathDerivation
}

/**
 * Why no viable optimised mix exists for the requested constraints.
 * The legacy code produced an "IMPOSSIBLE" pseudo-recommendation card; a
 * failure is not a gas, so it is modelled separately.
 */
export interface RecommendationFailure {
  /** Which slot could not be filled. */
  role: RecommendationRole
  title: string
  /** Plain statement of the binding constraint. */
  reason: string
  /** What the diver can change. */
  suggestion: string
  math: MathDerivation
}

/** The diver's planning inputs. */
export interface RecommendationRequest {
  mode: DiveMode
  /** Planned maximum depth, metres. */
  targetDepthMeters: number
  /** Narcosis ceiling for the bottom mix, metres. Ignored on nitrox modes. */
  maxEndMeters: number
  /** PPO2 the bottom mix / diluent is planned around, bar. */
  desiredPPO2: number
  /** Bottom time used for the CNS estimate, minutes. */
  bottomTimeMinutes: number
  /** Water temperature for the density calculation, °C. */
  waterTemperatureC?: number
  /**
   * How depths and densities are written in the text this engine produces
   * (C1). Values in this request stay metric whatever this is set to —
   * `targetDepthMeters` is always metres. Defaults to metric, which leaves
   * every existing string unchanged.
   */
  units?: UnitFormatter
}

/** Everything the page needs to render. */
export interface RecommendationSet {
  request: RecommendationRequest
  /** Warnings about the planning targets themselves, before any mix exists. */
  planningWarnings: SafetyWarning[]
  recommendations: Recommendation[]
  /** Present when the optimised bottom mix could not be produced. */
  failure?: RecommendationFailure
}

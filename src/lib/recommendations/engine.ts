/**
 * Best-mix recommendation engine.
 *
 * Pure and framework-free: given a {@link RecommendationRequest} and the diver's
 * {@link SafetyLimits}, it returns the gases to carry, each analysed at depth
 * with its own warnings and its own derivation.
 *
 * ---------------------------------------------------------------------------
 * FINDINGS FROM THE LEGACY IMPLEMENTATION (reported, not silently "fixed")
 * ---------------------------------------------------------------------------
 * The generator this replaces lived inline in the calculator page. These are the
 * defects that extraction exposed. Where the legacy behaviour was demonstrably
 * wrong *and* the correct value is already available from a tested Phase 1
 * module, this engine uses the tested module rather than reproducing the bug.
 *
 * R1. Hardcoded PPO2 ceilings. Deco gases were fixed at 1.6 bar, travel gas at
 *     1.4, bailout at 1.4, air MOD at 1.4, regardless of what the diver had set
 *     in Preferences → Safety Limits. Here every ceiling comes from `limits`.
 *
 * R2. Wrong density model. Density was `P_amb × (O2%·1.429 + He%·0.179 +
 *     N2%·1.251)/100`, i.e. per-species densities defined at 1 atm multiplied by
 *     an absolute pressure in bar. That both ignores temperature and overstates
 *     density by ~1.3%. This engine calls `densityAtDepth` (ideal gas law).
 *
 * R3. Density reported at the wrong depth. Every card computed density at the
 *     *target* depth using its own mix — including deco gases whose MOD is 22 m,
 *     so EAN50's density was reported as if it were breathed at 60 m. Density is
 *     now reported at each mix's own MOD, which is where it is actually breathed.
 *
 * R4. Hardcoded results in "standard mix" cards. The 18/45 card asserted
 *     "MOD 56 m, END 20 m, density 5.3 g/L" as literal text, and the CCR 18/45
 *     card asserted "Gas density @ 67 m = 7.7 × 3.5 = 26.95 g/L" — an arithmetic
 *     error of a factor of ~5 (7.7 × 3.5 = 26.95 is correct arithmetic on wrong
 *     inputs; the mix density is 0.80 g/L at 1 bar, not 3.5). Standard mixes are
 *     now analysed by the same code path as everything else.
 *
 * R5. Helium rounding direction. The legacy code rounded helium *up* on the
 *     grounds that it "ensures adequate helium for narcosis reduction". Because
 *     the downstream calculations consume the reported fraction, overstating
 *     helium *understates* both the narcotic load and the density the diver will
 *     actually experience. `src/lib/rounding.ts` documents this (F6) and rounds
 *     helium down. This engine uses helium as the balance of two conservatively
 *     rounded fractions, which lands in the same conservative direction.
 *
 * R6. The nitrogen ceiling was computed from `maxEnd` even in nitrox modes,
 *     where the diver never sees an END control — so an END field left at its
 *     default silently constrained mixes the diver had not asked to constrain.
 *     END-derived helium is now computed only in trimix modes.
 *
 * R7. `trimixN2 = 100 - trimixO2 - trimixHe` was compared with `!== 100` for
 *     viability, which is a float-equality test on values that had been rounded
 *     independently; it could reject a perfectly valid mix.
 *
 * R8. `classifyGasRole` in `src/lib/warnings.ts` infers a gas's role from its
 *     oxygen percentage and depth alone, so a computed 28% bottom mix at 40 m is
 *     labelled a "travel gas". The thresholds themselves are right for a
 *     classifier that has nothing else to go on; this engine knows the role the
 *     diver asked for, so it corrects the noun in `relabelRole` and leaves the
 *     shared module untouched. Reported, not fixed in place.
 *
 * R9. Two floating-point artifacts in read-only Phase 1 modules, both erring in
 *     the conservative direction and therefore left as they are:
 *     - `modRaw` computes `(P - 1) * 10`, so an exact 1.6 bar hypoxic ceiling
 *       yields 6.000000000000001 m, which `roundHypoxicCeiling`'s ceil promotes
 *       to 7 m — one metre shallower than the true ceiling.
 *     - PPO2 recomputed at a floored MOD lands a hair above the ceiling
 *       (1.4000000000000001), tripping the strict `>` in `generateGasWarnings`
 *       and printing "1.4 bar exceeds your limit of 1.4 bar". This engine snaps
 *       PPO2 to 1e-6 bar before handing it over, which is far below any
 *       observable precision.
 */

import { ambientPressure } from '../pressure'
import {
  densityAtDepth,
  endRaw,
  formatMix,
  gas,
  hypoxicCeilingRaw,
  modRaw,
  molarMass,
  ppo2AtDepth,
  type GasFractions,
} from '../gas'
import { calculateCNS, cnsLimitMinutes } from '../cns'
import {
  HYPOXIA_PPO2_FLOOR,
  MIN_VIABLE_O2_PERCENT,
  normalizeSafetyLimits,
  type SafetyLimits,
} from '../limits'
import { floorTo, roundEND, roundHypoxicCeiling, roundMOD } from '../rounding'
import { operatingDepth } from '../operatingDepth'
import {
  generateGasWarnings,
  generatePlanningWarnings,
  severityOrder,
  type DiveMode,
  type GasRole,
  type SafetyWarning,
} from './warningsBridge'
import {
  ambientPressureStep,
  cnsStep,
  densitySteps,
  endStep,
  heliumBalanceStep,
  hypoxicCeilingStep,
  maxNitrogenStep,
  modStep,
  noteStep,
  optimalOxygenStep,
} from './math'
import type {
  MathDerivation,
  MixAnalysis,
  Recommendation,
  RecommendationFailure,
  RecommendationRequest,
  RecommendationRole,
  RecommendationSet,
} from './types'
import { METRIC_FORMATTER } from '../units'

/** Highest helium fraction a blender will realistically fill, as a percent. */
/**
 * Tolerance when comparing a computed ppO₂ against a configured limit.
 *
 * Oxygen fractions come from whole-percent inputs, so a mix solved exactly to
 * the limit lands a few units in the last place either side of it. 0.005 bar is
 * half the smallest step a diver can set (0.01 bar), so it never masks a real
 * breach while stopping an exact solution reporting itself as one.
 */
const PPO2_EPSILON = 0.005

export const MAX_HELIUM_PERCENT = 95

/** Deepest depth this tool will plan an open-circuit dive to, metres. */
export const MAX_PLANNING_DEPTH_METERS = 150

/** Default bottom time used for the CNS estimate when the diver has not set one. */
export const DEFAULT_BOTTOM_TIME_MINUTES = 20

/** Default water temperature for the density calculation, °C. */
export const DEFAULT_WATER_TEMPERATURE_C = 20

/** Standard decompression gases, in the order a diver switches onto them. */
const DECO_GASES: { o2: number; label: string; rationale: string }[] = [
  {
    o2: 50,
    label: 'EAN50',
    rationale: 'First decompression switch — the conventional 50% mix.',
  },
  {
    o2: 80,
    label: 'EAN80',
    rationale: 'Intermediate switch where a 100% cylinder is not carried.',
  },
  {
    o2: 100,
    label: 'O₂',
    rationale: 'Final stops — the fastest inert-gas washout available.',
  },
]

/** Standard trimix fills, with the depth band each is normally used in. */
const STANDARD_TRIMIXES: { o2: number; he: number; minDepth: number; maxDepth: number }[] = [
  { o2: 21, he: 35, minDepth: 39, maxDepth: 50 },
  { o2: 18, he: 45, minDepth: 45, maxDepth: 62 },
  { o2: 15, he: 55, minDepth: 58, maxDepth: 80 },
  { o2: 12, he: 65, minDepth: 75, maxDepth: 100 },
  { o2: 10, he: 70, minDepth: 95, maxDepth: 130 },
]

function isCCR(mode: DiveMode): boolean {
  return mode === 'ccr' || mode === 'ccr-trimix'
}

function isTrimixMode(mode: DiveMode): boolean {
  return mode === 'oc-trimix' || mode === 'ccr-trimix'
}


/**
 * The PPO2 a mix's MOD is computed against.
 *
 * R1: this used to be a literal per card. A deco gas takes the diver's deco
 * ceiling, a rebreather diluent takes the CCR setpoint ceiling, everything else
 * takes the working ceiling.
 */
export function ceilingFor(
  role: RecommendationRole,
  mode: DiveMode,
  limits: SafetyLimits
): number {
  if (role === 'deco') return limits.maxPPO2Deco
  // A bailout gas is breathed open-circuit by definition, so the CCR setpoint
  // ceiling does not apply to it even on a rebreather.
  if (role === 'bailout') return limits.maxPPO2Work
  if (role === 'diluent' && isCCR(mode)) return limits.maxPPO2CCR
  return limits.maxPPO2Work
}

/**
 * Analyses a mix at the depth it will actually be breathed.
 *
 * R3: `atDepthMeters` is the mix's own MOD for gases whose MOD is shallower than
 * the target — a deco gas is never breathed at the bottom.
 */
export function analyseMix(
  mix: GasFractions,
  request: RecommendationRequest,
  ceilingPPO2: number,
  limits: SafetyLimits
): MixAnalysis {
  const modUnrounded = mix.o2 > 0 ? modRaw(mix, ceilingPPO2) : 0
  const modMeters = Math.max(0, roundMOD(modUnrounded))

  // The depth this gas may actually be taken to. `modMeters` is the oxygen
  // limit alone; narcosis or density frequently binds shallower, and treating
  // the oxygen figure as the operating depth is how air came to be offered to
  // 51 m on a CCR setpoint. See `src/lib/operatingDepth.ts`.
  const operating = operatingDepth(mix, limits, {
    ceilingPPO2,
    temperatureC: request.waterTemperatureC ?? DEFAULT_WATER_TEMPERATURE_C,
  })
  const operatingDepthMeters = operating.depthMeters

  // Where this gas is evaluated for END, density and CNS.
  //
  // This is deliberately the OXYGEN mod, not `operatingDepthMeters`. Clamping
  // to the operating depth would measure the gas at a depth chosen *because*
  // it satisfies the narcosis and density limits, so those breaches would
  // always evaluate as clean and the warnings would silently disappear — the
  // fix hiding the very problem it exists to surface. A gas is analysed at the
  // depth the diver asked for (bounded by where oxygen still permits breathing
  // it at all), and `operatingDepthMeters` separately reports how deep it may
  // actually be taken.
  const analysisDepth = Math.min(modMeters, request.targetDepthMeters)

  const ambientPressureBar = ambientPressure(request.targetDepthMeters)
  const ppo2AtTarget = ppo2AtDepth(mix, request.targetDepthMeters)

  const endMeters = roundEND(endRaw(mix, analysisDepth, limits.oxygenNarcosisModel))
  const densityGramsPerLiter = densityAtDepth(
    mix,
    analysisDepth,
    request.waterTemperatureC ?? DEFAULT_WATER_TEMPERATURE_C
  )

  const ceilingRaw = mix.o2 > 0 ? hypoxicCeilingRaw(mix, HYPOXIA_PPO2_FLOOR) : Infinity
  const hypoxicCeilingMeters = Number.isFinite(ceilingRaw)
    ? Math.max(0, roundHypoxicCeiling(ceilingRaw))
    : Infinity
  const hypoxic = hypoxicCeilingMeters > 0

  const ppo2AtAnalysisDepth = ppo2AtDepth(mix, analysisDepth)
  const cns = calculateCNS(ppo2AtAnalysisDepth, request.bottomTimeMinutes)

  return {
    ambientPressureBar,
    ppo2AtTarget,
    modMeters,
    operatingDepthMeters,
    limitedBy: operating.limitedBy,
    narcosisDepthMeters: operating.narcosisDepthMeters,
    densityDepthMeters: operating.densityDepthMeters,
    modPPO2: ceilingPPO2,
    endMeters,
    densityGramsPerLiter,
    hypoxicCeilingMeters,
    hypoxic,
    cnsPercent: cns.percent,
    cnsOverLimit: cns.overLimit,
  }
}

/** The words `warnings.ts` uses for a role, and what this engine calls it. */
const ROLE_WORDS: Record<GasRole, string> = {
  working: 'working gas',
  travel: 'travel gas',
  deco: 'deco gas',
}

const ROLE_LABELS: Record<RecommendationRole, string> = {
  bottom: 'bottom gas',
  diluent: 'diluent',
  travel: 'travel gas',
  deco: 'deco gas',
  bailout: 'bailout gas',
}

/**
 * Rewrites the role noun in a message from `generateGasWarnings`.
 *
 * R8: `classifyGasRole` infers a role from oxygen percentage and depth alone, so
 * a computed 28% bottom mix at 40 m is labelled a "travel gas" — the heuristic
 * cannot know the diver asked for it as a bottom mix. The threshold logic is
 * still correct and is left untouched in the shared module; only the noun is
 * corrected here, where the true role is known.
 */
function relabelRole(message: string, role: RecommendationRole): string {
  const target = ROLE_LABELS[role]
  const capitalised = target.charAt(0).toUpperCase() + target.slice(1)
  let out = message
  for (const word of Object.values(ROLE_WORDS)) {
    const cap = word.charAt(0).toUpperCase() + word.slice(1)
    out = out.split(cap).join(capitalised).split(word).join(target)
  }
  return out
}

/** Warnings for a mix, evaluated at the depth it is breathed. */
function warningsFor(
  mix: GasFractions,
  role: RecommendationRole,
  analysis: MixAnalysis,
  request: RecommendationRequest,
  limits: SafetyLimits
): SafetyWarning[] {
  const U = request.units ?? METRIC_FORMATTER
  const analysisDepth = Math.min(analysis.modMeters, request.targetDepthMeters)
  const ppo2Here = ppo2AtDepth(mix, analysisDepth)
  const ceiling = ceilingFor(role, request.mode, limits)

  const warnings = generateGasWarnings(
    {
      oxygenPercent: mix.o2 * 100,
      depthMeters: analysisDepth,
      // R9: PPO2 at a mix's own floored MOD lands a hair above the ceiling in
      // floating point (EAN28 at 40 m gives 1.4000000000000001), which trips a
      // strict `>` comparison and produces "1.4 bar exceeds your limit of 1.4
      // bar". Snapping to the same 0.01 bar the message prints at removes the
      // artifact without loosening the comparison by any amount a diver could
      // observe.
      ppo2: Math.round(ppo2Here * 1e6) / 1e6,
      endMeters: analysis.endMeters,
      densityGramsPerLiter: analysis.densityGramsPerLiter,
    },
    request.mode,
    limits,
    request.units ?? METRIC_FORMATTER
  )
    .filter((w) => {
      // Drop the "approaching your limit" advisory when the mix was computed to
      // sit exactly on that limit — being at the number the diver asked for is
      // not news.
      if (role !== 'bottom' && role !== 'diluent') return true
      return !(
        /approaching your limit/.test(w.message) &&
        /PPO₂/.test(w.message) &&
        Math.abs(ppo2Here - ceiling) < 5e-3
      )
    })
    .map((w) => ({ ...w, message: relabelRole(w.message, role) }))

  // Facts the shared classifier cannot see, because they depend on the role the
  // diver asked for rather than on the mix alone.
  if (role === 'bottom' || role === 'diluent') {
    if (analysis.modMeters < request.targetDepthMeters) {
      warnings.push({
        type: 'danger',
        message: `MOD ${U.depth(analysis.modMeters)} is shallower than the planned depth of ${U.depth(request.targetDepthMeters)} — this mix cannot be breathed at the bottom`,
      })
    }
  }
  if (analysis.hypoxic && (role === 'bottom' || role === 'diluent' || role === 'bailout')) {
    warnings.push({
      type: 'warning',
      message: `Hypoxic mix — not breathable above ${U.depth(analysis.hypoxicCeilingMeters)}. Descend on a travel gas and switch below that depth`,
    })
  }
  if (analysis.cnsOverLimit) {
    warnings.push({
      type: 'danger',
      message: 'PPO₂ exceeds the highest value in the NOAA oxygen exposure table — no CNS limit is published above 1.6 bar',
    })
  } else if (analysis.cnsPercent !== null && analysis.cnsPercent > 100) {
    warnings.push({
      type: 'danger',
      message: `CNS ${analysis.cnsPercent.toFixed(0)}% exceeds the NOAA single-exposure limit for ${request.bottomTimeMinutes} minutes at this PPO₂`,
    })
  } else if (analysis.cnsPercent !== null && analysis.cnsPercent > 80) {
    warnings.push({
      type: 'warning',
      message: `CNS ${analysis.cnsPercent.toFixed(0)}% for ${request.bottomTimeMinutes} minutes at this PPO₂ leaves little margin`,
    })
  }

  return warnings.sort((a, b) => severityOrder(a.type) - severityOrder(b.type))
}

/** Builds the shared trailing derivation steps every recommendation carries. */
function analysisSteps(
  mix: GasFractions,
  analysis: MixAnalysis,
  request: RecommendationRequest,
  limits: SafetyLimits
) {
  const pct = { o2: mix.o2 * 100, he: mix.he * 100, n2: mix.n2 * 100 }
  const analysisDepth = Math.min(analysis.modMeters, request.targetDepthMeters)
  const analysisPressure = ambientPressure(analysisDepth)
  const M = molarMass(mix)
  const ppo2Here = ppo2AtDepth(mix, analysisDepth)

  const steps = [
    modStep(
      analysis.modPPO2,
      pct.o2,
      mix.o2 > 0 ? modRaw(mix, analysis.modPPO2) : 0,
      analysis.modMeters
    ),
    endStep(pct.n2, pct.o2, analysisPressure, analysis.endMeters, limits.oxygenNarcosisModel),
    ...densitySteps(
      pct.o2,
      pct.he,
      pct.n2,
      M,
      analysisPressure,
      request.waterTemperatureC ?? DEFAULT_WATER_TEMPERATURE_C,
      analysis.densityGramsPerLiter
    ),
    cnsStep(
      ppo2Here,
      request.bottomTimeMinutes,
      cnsLimitMinutes(ppo2Here),
      analysis.cnsPercent
    ),
  ]

  if (analysis.hypoxic) {
    steps.splice(1, 0, hypoxicCeilingStep(pct.o2, analysis.hypoxicCeilingMeters))
  }

  return steps
}

/** Assembles one recommendation from a mix and its role. */
function buildRecommendation(params: {
  id: string
  title: string
  role: RecommendationRole
  origin: 'optimised' | 'standard'
  mix: GasFractions
  rationale: string
  request: RecommendationRequest
  limits: SafetyLimits
  /** Derivation steps specific to how this mix was chosen, shown before the analysis. */
  derivationSteps?: MathDerivation['steps']
  mathTitle?: string
}): Recommendation {
  const { id, title, role, origin, mix, rationale, request, limits } = params
  const ceiling = ceilingFor(role, request.mode, limits)
  const analysis = analyseMix(mix, request, ceiling, limits)
  const warnings = warningsFor(mix, role, analysis, request, limits)

  const percentages = {
    o2: Math.round(mix.o2 * 1000) / 10,
    he: Math.round(mix.he * 1000) / 10,
    n2: Math.round(mix.n2 * 1000) / 10,
  }

  return {
    id,
    label: formatMix(mix),
    title,
    role,
    origin,
    mix,
    percentages,
    analysis,
    warnings,
    rationale,
    math: {
      title: params.mathTitle ?? `${formatMix(mix)} — ${title.toLowerCase()}`,
      steps: [
        ambientPressureStep(request.targetDepthMeters, analysis.ambientPressureBar),
        ...(params.derivationSteps ?? []),
        ...analysisSteps(mix, analysis, request, limits),
      ],
    },
  }
}

/**
 * The optimised bottom mix (or CCR diluent) for the request.
 *
 * Oxygen is set by the target PPO2 and rounded *down* to a whole percent, so the
 * fillable mix never exceeds the planned PPO2 at depth. In trimix modes nitrogen
 * is then capped by the END limit and rounded down, and helium takes the
 * balance. In nitrox modes nitrogen is simply the balance (R6).
 */
function optimisedBottomMix(
  request: RecommendationRequest,
  // Kept positional: every mix builder in this module takes the same pair, and
  // the nitrox branch simply has no limit to consult beyond the request's own.
  _limits: SafetyLimits
): { mix: GasFractions; steps: MathDerivation['steps'] } | { failure: RecommendationFailure } {
  const { targetDepthMeters, desiredPPO2, maxEndMeters, mode } = request
  const U = request.units ?? METRIC_FORMATTER
  const pressureBar = ambientPressure(targetDepthMeters)
  const rawFO2 = desiredPPO2 / pressureBar

  // Oxygen down to a whole percent — a lower fraction is a lower PPO2 at depth.
  const o2Percent = Math.min(100, floorTo(rawFO2 * 100, 0))

  const steps: MathDerivation['steps'] = [
    optimalOxygenStep(desiredPPO2, pressureBar, rawFO2, o2Percent),
  ]

  if (o2Percent < MIN_VIABLE_O2_PERCENT) {
    return {
      failure: {
        role: isCCR(mode) ? 'diluent' : 'bottom',
        title: 'No viable bottom mix',
        reason: `A PPO₂ of ${desiredPPO2.toFixed(2)} bar at ${U.depth(targetDepthMeters)} needs only ${o2Percent}% oxygen, below the ${MIN_VIABLE_O2_PERCENT}% floor for a breathable mix.`,
        suggestion: 'Raise the target PPO₂ or reduce the planned depth.',
        math: { title: 'Why no mix exists', steps },
      },
    }
  }

  if (!isTrimixMode(mode)) {
    // Nitrox: nitrogen is the balance, no helium.
    const mix = gas(o2Percent / 100, 0)
    return { mix, steps }
  }

  const endPressureBar = ambientPressure(maxEndMeters)
  const rawFN2 = (0.79 * endPressureBar) / pressureBar
  // Nitrogen down: a lower assumed narcotic fraction cannot be reached by
  // rounding, so the fillable mix is at or below the END limit, never above it.
  const n2Ceiling = Math.max(0, 100 - o2Percent)
  const n2Percent = Math.min(n2Ceiling, floorTo(rawFN2 * 100, 0))
  steps.push(maxNitrogenStep(maxEndMeters, endPressureBar, pressureBar, rawFN2, n2Percent))

  // Helium takes whatever is left, so the three still total 100 after two
  // independent downward roundings (R5).
  const hePercent = 100 - o2Percent - n2Percent
  steps.push(heliumBalanceStep(o2Percent, n2Percent, hePercent))

  if (hePercent > MAX_HELIUM_PERCENT) {
    return {
      failure: {
        role: isCCR(mode) ? 'diluent' : 'bottom',
        title: 'No viable bottom mix',
        reason: `Holding an END of ${U.depth(maxEndMeters)} at ${U.depth(targetDepthMeters)} needs ${hePercent}% helium, above the ${MAX_HELIUM_PERCENT}% a blender will fill.`,
        suggestion: 'Accept a deeper END or reduce the planned depth.',
        math: { title: 'Why no mix exists', steps },
      },
    }
  }

  if (maxEndMeters > targetDepthMeters) {
    // Not an error — an END limit deeper than the dive simply means no helium is
    // required. Clamp helium to zero rather than producing a negative fraction.
    return { mix: gas(o2Percent / 100, 0), steps }
  }

  return { mix: gas(o2Percent / 100, hePercent / 100), steps }
}

/**
 * Generates the full recommendation set for a planned dive.
 *
 * @param request - The diver's planning inputs.
 * @param limits - The diver's configured safety limits (from PreferencesContext).
 */
export function generateRecommendations(
  request: RecommendationRequest,
  limits: Partial<SafetyLimits> | SafetyLimits = {}
): RecommendationSet {
  const L = normalizeSafetyLimits(limits)
  const U = request.units ?? METRIC_FORMATTER
  const { mode, targetDepthMeters } = request

  if (!Number.isFinite(targetDepthMeters) || targetDepthMeters <= 0) {
    throw new Error(`Target depth must be a positive finite number (got ${targetDepthMeters})`)
  }
  if (targetDepthMeters > MAX_PLANNING_DEPTH_METERS) {
    throw new Error(
      `Target depth ${targetDepthMeters} m exceeds the planning ceiling of ${MAX_PLANNING_DEPTH_METERS} m`
    )
  }

  const planningWarnings = generatePlanningWarnings(
    {
      targetModMeters: targetDepthMeters,
      maxEndMeters: request.maxEndMeters,
      desiredPPO2: request.desiredPPO2,
    },
    mode,
    L,
    U
  ).sort((a, b) => severityOrder(a.type) - severityOrder(b.type))

  const recommendations: Recommendation[] = []
  let failure: RecommendationFailure | undefined

  // --- Bottom gas / diluent ------------------------------------------------
  const bottomRole: RecommendationRole = isCCR(mode) ? 'diluent' : 'bottom'
  const bottom = optimisedBottomMix(request, L)

  if ('failure' in bottom) {
    failure = bottom.failure
  } else {
    recommendations.push(
      buildRecommendation({
        id: 'optimised-bottom',
        title: isCCR(mode) ? 'Optimised diluent' : 'Optimised bottom gas',
        role: bottomRole,
        origin: 'optimised',
        mix: bottom.mix,
        rationale: isCCR(mode)
          ? `Diluent computed for PPO₂ ${request.desiredPPO2.toFixed(2)} bar at ${U.depth(targetDepthMeters)}, breathable on bailout.`
          : `Computed for PPO₂ ${request.desiredPPO2.toFixed(2)} bar at ${U.depth(targetDepthMeters)}.`,
        request,
        limits: L,
        derivationSteps: bottom.steps,
      })
    )
  }

  // --- Air, where it is still within the diver's working ceiling ------------
  if (!isTrimixMode(mode)) {
    // Air is gated on the depth it may actually be dived to, not its oxygen
    // MOD. Air's oxygen limit is 56 m, but narcosis binds it to 30 m and
    // density to 38 m — recommending it for a 50 m dive because ppO2 allows it
    // is exactly the error this engine used to make.
    const airOperating = operatingDepth(gas(0.21, 0), L, { ceilingPPO2: L.maxPPO2Work })
    const airMod = airOperating.depthMeters
    if (airMod >= targetDepthMeters) {
      recommendations.push(
        buildRecommendation({
          id: 'air',
          title: isCCR(mode) ? 'Air diluent' : 'Air',
          role: bottomRole,
          origin: 'standard',
          mix: gas(0.21, 0),
          rationale:
            airOperating.limitedBy === 'oxygen'
              ? `Air reaches ${U.depth(airMod)} at your ${L.maxPPO2Work.toFixed(2)} bar working limit — always available, no blending required.`
              : `Air reaches ${U.depth(airMod)}, set by your ${
                  airOperating.limitedBy === 'narcosis'
                    ? `${U.depth(L.maxEND)} END limit`
                    : `${U.density(L.maxGasDensity)} density limit`
                } — always available, no blending required.`,
          request,
          limits: L,
          derivationSteps: [
            noteStep(
              'Why air is listed',
              `At your working ceiling of ${L.maxPPO2Work.toFixed(2)} bar, air is usable to ${U.depth(airMod)}, which covers the planned ${U.depth(targetDepthMeters)}.`
            ),
          ],
        })
      )
    }
  }

  // --- Standard trimix fills in the planned depth band ---------------------
  if (isTrimixMode(mode) && !failure) {
    for (const std of STANDARD_TRIMIXES) {
      if (targetDepthMeters < std.minDepth || targetDepthMeters > std.maxDepth) continue
      const mix = gas(std.o2 / 100, std.he / 100)
      recommendations.push(
        buildRecommendation({
          id: `standard-${std.o2}-${std.he}`,
          title: isCCR(mode) ? 'Standard diluent' : 'Standard mix',
          role: bottomRole,
          origin: 'standard',
          mix,
          rationale: `A common shop fill for the ${U.depth(std.minDepth)}–${U.depth(std.maxDepth)} band — usually cheaper and faster to obtain than a custom blend.`,
          request,
          limits: L,
          derivationSteps: [
            noteStep(
              'Why this mix is listed',
              `${std.o2}/${std.he} is a widely stocked fill for ${U.depth(std.minDepth)}–${U.depth(std.maxDepth)}. The numbers below are computed for it at your limits, not quoted from a table.`
            ),
          ],
        })
      )
    }
  }

  // --- Travel gas ----------------------------------------------------------
  // Only meaningful when the bottom mix cannot be breathed from the surface, or
  // when the dive is deep enough that descending on bottom gas wastes it.
  const bottomRec = recommendations.find((r) => r.id === 'optimised-bottom')
  const needsTravel =
    isTrimixMode(mode) && !!bottomRec && (bottomRec.analysis.hypoxic || targetDepthMeters > 40)
  if (needsTravel) {
    const travelMix = gas(0.32, 0)
    // A travel gas is breathed on the descent, so narcosis and density apply
    // to it exactly as they do to a bottom gas.
    const travelMod = operatingDepth(travelMix, L, { ceilingPPO2: L.maxPPO2Work }).depthMeters
    recommendations.push(
      buildRecommendation({
        id: 'travel-ean32',
        title: 'Travel gas',
        role: 'travel',
        origin: 'standard',
        mix: travelMix,
        rationale: bottomRec?.analysis.hypoxic
          ? `Breathable from the surface to ${U.depth(travelMod)}, which covers the hypoxic ceiling of the bottom mix at ${U.depth(bottomRec.analysis.hypoxicCeilingMeters)}.`
          : `Breathable from the surface to ${U.depth(travelMod)} — conserves bottom gas on the descent.`,
        request,
        limits: L,
      })
    )
  }

  // --- Decompression gases -------------------------------------------------
  // Which gases are worth carrying depends on how deep the dive is; a 25 m dive
  // does not need three deco cylinders.
  if (targetDepthMeters > 20) {
    for (const deco of DECO_GASES) {
      const mix = gas(deco.o2 / 100, 0)
      const decoMod = roundMOD(modRaw(mix, L.maxPPO2Deco))
      // Skip a gas whose switch depth is deeper than the dive itself.
      if (decoMod >= targetDepthMeters) continue
      // 100% oxygen is only worth carrying once there is real decompression.
      if (deco.o2 === 100 && targetDepthMeters < 30) continue
      // EAN80 sits between the other two; carry it only on longer/deeper dives.
      if (deco.o2 === 80 && targetDepthMeters < 30) continue

      recommendations.push(
        buildRecommendation({
          id: `deco-${deco.o2}`,
          title: 'Decompression gas',
          role: 'deco',
          origin: 'standard',
          mix,
          rationale: `${deco.rationale} Switch at ${U.depth(decoMod)} against your ${L.maxPPO2Deco.toFixed(2)} bar deco ceiling.`,
          request,
          limits: L,
          derivationSteps: [
            noteStep(
              'Switch depth',
              `The switch depth is this mix's MOD at your configured decompression ceiling of ${L.maxPPO2Deco.toFixed(2)} bar, not a fixed 1.6 bar.`
            ),
          ],
        })
      )
    }
  }

  // --- Bailout, rebreather only -------------------------------------------
  if (isCCR(mode) && !failure) {
    const bailoutPressure = ambientPressure(targetDepthMeters)
    const bailoutO2 = Math.max(
      MIN_VIABLE_O2_PERCENT,
      Math.min(100, floorTo((L.maxPPO2Work / bailoutPressure) * 100, 0))
    )
    let bailoutMix: GasFractions
    const bailoutSteps: MathDerivation['steps'] = [
      optimalOxygenStep(
        L.maxPPO2Work,
        bailoutPressure,
        L.maxPPO2Work / bailoutPressure,
        bailoutO2
      ),
    ]

    if (mode === 'ccr-trimix') {
      const endPressure = ambientPressure(request.maxEndMeters)
      const rawFN2 = (0.79 * endPressure) / bailoutPressure
      const n2 = Math.min(Math.max(0, 100 - bailoutO2), floorTo(rawFN2 * 100, 0))
      const he = 100 - bailoutO2 - n2
      bailoutSteps.push(
        maxNitrogenStep(request.maxEndMeters, endPressure, bailoutPressure, rawFN2, n2),
        heliumBalanceStep(bailoutO2, n2, he)
      )
      bailoutMix = gas(bailoutO2 / 100, Math.min(MAX_HELIUM_PERCENT, he) / 100)
    } else {
      bailoutMix = gas(bailoutO2 / 100, 0)
    }

    const bailoutPPO2AtTarget = bailoutMix.o2 * bailoutPressure

    recommendations.push(
      buildRecommendation({
        id: 'bailout',
        title: 'Bailout gas',
        role: 'bailout',
        origin: 'optimised',
        mix: bailoutMix,
        // The claim is conditional, because the MIN_VIABLE_O2_PERCENT floor can
        // put the mix above the working limit at the planned depth. Saying
        // "within your limit" of a gas that is not would be the worst kind of
        // wrong: reassuring, specific, and about an emergency gas.
        rationale:
          bailoutPPO2AtTarget <= L.maxPPO2Work + PPO2_EPSILON
            ? `Open-circuit bailout breathable at ${U.depth(targetDepthMeters)} within your ${L.maxPPO2Work.toFixed(2)} bar working limit.`
            : `Open-circuit bailout. At ${U.depth(targetDepthMeters)} this mix runs ppO₂ ${bailoutPPO2AtTarget.toFixed(2)} bar, above your ${L.maxPPO2Work.toFixed(2)} bar working limit: ${MIN_VIABLE_O2_PERCENT}% oxygen is the floor for a breathable gas, and this depth needs less. Carry a shallower bailout or reduce the depth.`,
        request,
        limits: L,
        derivationSteps: bailoutSteps,
      })
    )
  }

  // --- The bottom gas must actually reach the planned depth ----------------
  //
  // A nitrox mode has no helium to give, so at depth the optimised mix can be
  // perfectly good on oxygen and still be narcosis- or density-limited far
  // shallower than the dive. The engine used to hand that gas over without
  // comment: a 45 m OC nitrox plan was answered with EAN23 that narcosis binds
  // to 31 m, and nothing on the page said so. Recommending a gas for a depth
  // it may not be taken to is the failure mode this whole change exists to
  // remove, so it is stated at the top level rather than left to a per-gas card.
  //
  // The bailout is checked on the same terms. It is the gas a diver reaches
  // for at maximum depth with a failed loop, and its oxygen fraction is floored
  // at MIN_VIABLE_O2_PERCENT for breathability — which, past about 140 m, puts
  // ppO₂ above the working limit the mix was solved for. That breach was
  // invisible: per-gas warnings are evaluated at `min(mix MOD, target)`, so a
  // bailout whose MOD is 140 m was analysed at 140 m on a 150 m dive, and the
  // ten metres where it exceeds the limit were never tested.
  const reachChecks = recommendations.filter(
    (r) => r.id === 'optimised-bottom' || r.id === 'air' || r.role === 'bailout'
  )
  for (const bottomGas of reachChecks) {
    const ceiling =
      bottomGas.role === 'bailout'
        ? L.maxPPO2Work
        : isCCR(mode)
          ? L.maxPPO2CCR
          : L.maxPPO2Work
    const reach = operatingDepth(bottomGas.mix, L, {
      ceilingPPO2: ceiling,
      temperatureC: request.waterTemperatureC ?? DEFAULT_WATER_TEMPERATURE_C,
    })
    if (reach.depthMeters < targetDepthMeters) {
      const cause =
        reach.limitedBy === 'narcosis'
          ? `an END of ${U.depth(L.maxEND)}`
          : reach.limitedBy === 'density'
            ? `a density of ${U.density(L.maxGasDensity)}`
            : `a ppO₂ of ${ceiling.toFixed(2)} bar`
      planningWarnings.unshift({
        type: 'danger',
        message:
          `${bottomGas.title} reaches only ${U.depth(reach.depthMeters)} against ${cause}, ` +
          `short of the ${U.depth(targetDepthMeters)} you planned.` +
          (bottomGas.role === 'bailout'
            ? ' A bailout must be breathable at the deepest point of the dive.'
            : isTrimixMode(mode)
              ? ''
              : ' A nitrox mode has no helium to trade for narcosis or density — this dive needs trimix.'),
      })
    }
  }

  return { request, planningWarnings, recommendations, failure }
}

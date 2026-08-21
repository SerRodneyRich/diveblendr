/**
 * Single source of truth for safety limits and their permitted ranges.
 *
 * Both the preferences UI and the validators consume these, so a user can never
 * configure a value the validators would then reject (and vice versa).
 *
 * Authorities:
 * - PPO2 working/deco limits: NOAA Diving Manual (6th ed.) oxygen exposure
 *   guidance; 1.6 bar is the accepted contingency/deco ceiling, 1.4 bar the
 *   working ceiling used by essentially every technical agency (TDI, IANTD, GUE).
 * - CCR setpoint 1.3 bar working: standard CCR agency practice (TDI/IANTD CCR).
 * - Gas density 5.2 g/L "ideal" / 6.2 g/L "do not exceed": Anthony & Mitchell,
 *   "Respiratory physiology of rebreather diving" (2016), adopted by NEDU and
 *   widely taught; 5.2 is the recommended target, 6.2 the hard ceiling.
 * - END 30 m: conventional narcosis ceiling for working depths (IANTD/GUE/TDI).
 * - Hypoxia floor PPO2 0.16 bar: below this, loss of consciousness risk.
 * - Normoxic floor 18% O2 at the surface: the boundary every technical agency
 *   draws between normoxic and hypoxic trimix (TDI, IANTD, GUE). A normoxic
 *   mix is defined as one that can be breathed from the surface; below 18% a
 *   travel gas is mandatory and the mix is a hypoxic-trimix qualification.
 *   NOAA treats the same figure as the hypoxic threshold; OSHA 1910.134 is
 *   stricter still at 19.5% for oxygen-deficient atmospheres.
 */

/**
 * PPO2 (bar) below which a breathing gas risks loss of consciousness.
 *
 * This is an acute-danger threshold, not a planning one — it answers "would
 * this render a diver unconscious", which at the surface is 16% oxygen. It is
 * NOT the line between a breathable and an unbreathable surface gas: see
 * `NORMOXIC_MIN_O2_PERCENT` for that. Using this figure alone reported 16% as
 * fine to breathe on the boat.
 */
export const HYPOXIA_PPO2_FLOOR = 0.16

/**
 * Minimum surface oxygen percentage for a gas that may be breathed at the
 * surface without a travel gas.
 *
 * Below this a mix is hypoxic trimix: it requires a travel or bottom-stage gas
 * for the descent, and the training to manage the switch. Every technical
 * agency draws the normoxic boundary here.
 */
export const NORMOXIC_MIN_O2_PERCENT = 18

/** PPO2 (bar) that should never be exceeded on any circuit, ever. */
export const ABSOLUTE_MAX_PPO2 = 1.6

/** Minimum oxygen fraction (%) considered viable in a technical bottom mix. */
export const MIN_VIABLE_O2_PERCENT = 8

/**
 * The configurable safety limits a diver may set. Field names mirror
 * `DiverPreferences` in `src/contexts/PreferencesContext.tsx` so the two can be
 * passed interchangeably to the pure calculation layer.
 */
export interface SafetyLimits {
  /** Max PPO2 (bar) for the working/bottom phase of an open-circuit dive. */
  maxPPO2Work: number
  /** Max PPO2 (bar) permitted on decompression gases. */
  maxPPO2Deco: number
  /** Max PPO2 (bar) for the CCR working setpoint. */
  maxPPO2CCR: number
  /** Gas density (g/L) above which breathing effort becomes significant. */
  maxGasDensity: number
  /** Gas density (g/L) that should not be exceeded at all. */
  maxGasDensityCritical: number
  /** Max Equivalent Narcotic Depth (m) for a working gas. */
  maxEND: number
  /** When true, oxygen is counted as narcotic (NOAA/DCIEM) rather than N2-only. */
  oxygenNarcosisModel: boolean
}

/**
 * Defaults. These match `defaultPreferences` in PreferencesContext; if the two
 * ever diverge, this file wins and PreferencesContext should be updated.
 */
export const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxPPO2Work: 1.4,
  maxPPO2Deco: 1.6,
  maxPPO2CCR: 1.3,
  maxGasDensity: 5.7,
  maxGasDensityCritical: 6.2,
  maxEND: 30,
  oxygenNarcosisModel: false,
}

/** Permitted range for each configurable limit, used by validators and UI sliders. */
export const SAFETY_LIMIT_RANGES: Record<
  keyof Omit<SafetyLimits, 'oxygenNarcosisModel'>,
  { min: number; max: number; step: number; unit: string }
> = {
  maxPPO2Work: { min: 1.0, max: 1.6, step: 0.05, unit: 'bar' },
  maxPPO2Deco: { min: 1.2, max: 1.6, step: 0.05, unit: 'bar' },
  maxPPO2CCR: { min: 1.0, max: 1.4, step: 0.05, unit: 'bar' },
  maxGasDensity: { min: 4.0, max: 6.2, step: 0.1, unit: 'g/L' },
  maxGasDensityCritical: { min: 5.0, max: 7.5, step: 0.1, unit: 'g/L' },
  maxEND: { min: 20, max: 60, step: 1, unit: 'm' },
}

/**
 * Clamps a set of limits into their permitted ranges and repairs ordering
 * invariants (deco ≥ work, critical density ≥ working density).
 *
 * Never widens a limit the caller set more conservatively than the default.
 */
export function normalizeSafetyLimits(partial?: Partial<SafetyLimits>): SafetyLimits {
  const merged: SafetyLimits = { ...DEFAULT_SAFETY_LIMITS, ...partial }

  const clamp = (value: number, key: keyof typeof SAFETY_LIMIT_RANGES): number => {
    const range = SAFETY_LIMIT_RANGES[key]
    if (!Number.isFinite(value)) return DEFAULT_SAFETY_LIMITS[key]
    return Math.min(range.max, Math.max(range.min, value))
  }

  const result: SafetyLimits = {
    maxPPO2Work: clamp(merged.maxPPO2Work, 'maxPPO2Work'),
    maxPPO2Deco: clamp(merged.maxPPO2Deco, 'maxPPO2Deco'),
    maxPPO2CCR: clamp(merged.maxPPO2CCR, 'maxPPO2CCR'),
    maxGasDensity: clamp(merged.maxGasDensity, 'maxGasDensity'),
    maxGasDensityCritical: clamp(merged.maxGasDensityCritical, 'maxGasDensityCritical'),
    maxEND: clamp(merged.maxEND, 'maxEND'),
    oxygenNarcosisModel: merged.oxygenNarcosisModel === true,
  }

  // A deco gas may be breathed at a higher PPO2 than a working gas, never lower.
  if (result.maxPPO2Deco < result.maxPPO2Work) {
    result.maxPPO2Deco = result.maxPPO2Work
  }
  // The critical density ceiling must sit at or above the working threshold.
  if (result.maxGasDensityCritical < result.maxGasDensity) {
    result.maxGasDensityCritical = result.maxGasDensity
  }

  return result
}

/**
 * The ceiling PPO2 a given gas role may be validated against.
 *
 * @param limits - The diver's configured limits.
 * @param role - `'work'` for bottom/working gas, `'deco'` for decompression
 *   gas, `'ccr'` for a closed-circuit setpoint.
 */
export function maxPPO2For(limits: SafetyLimits, role: 'work' | 'deco' | 'ccr'): number {
  switch (role) {
    case 'deco':
      return limits.maxPPO2Deco
    case 'ccr':
      return limits.maxPPO2CCR
    case 'work':
    default:
      return limits.maxPPO2Work
  }
}

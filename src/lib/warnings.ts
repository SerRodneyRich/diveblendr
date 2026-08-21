/**
 * Gas-analysis and planning warning generation.
 *
 * F1 fix. `generateWarnings` in `src/app/calculator/page.tsx` hardcoded PPO2
 * 1.4/1.6, END 30 m and density 6.2/7.0 g/L, while `PreferencesContext` exposed
 * user-configured `maxPPO2Work`, `maxPPO2Deco`, `maxPPO2CCR`, `maxGasDensity`,
 * `maxGasDensityCritical` and `maxEND`. The Preferences "Safety Limits" tab was
 * therefore decorative — changing any of those values altered nothing the diver
 * could see.
 *
 * This module is pure: limits arrive as an explicit parameter, so every
 * threshold is testable and no React state is reachable from the math.
 *
 * C1 fix. Depths and densities were formatted in metres and g/L whatever units
 * the diver had chosen, so an imperial page read "END 39 m exceeds your limit
 * of 30 m" above cards showing 128 ft. A `UnitFormatter` now arrives the same
 * way limits do — as a parameter, defaulting to metric so every existing
 * metric string is unchanged. Values stay in metres and g/L internally;
 * conversion happens only where the message text is built.
 */

import {
  HYPOXIA_PPO2_FLOOR,
  NORMOXIC_MIN_O2_PERCENT,
  type SafetyLimits,
  normalizeSafetyLimits,
} from './limits'
import { METRIC_FORMATTER, type UnitFormatter } from './units'

export type WarningSeverity = 'info' | 'warning' | 'danger'

export interface SafetyWarning {
  type: WarningSeverity
  message: string
}

export type DiveMode = 'oc' | 'oc-trimix' | 'ccr' | 'ccr-trimix'

/** How a gas is intended to be used, which sets which PPO2 ceiling applies. */
export type GasRole = 'working' | 'travel' | 'deco'

/** The analysed state of one gas at one depth. */
export interface GasAnalysis {
  /** Oxygen percentage, 0–100. */
  oxygenPercent: number
  /** Depth the analysis applies to, in metres. */
  depthMeters: number
  /** Partial pressure of oxygen at that depth, in bar. */
  ppo2: number
  /** Equivalent Narcotic Depth at that depth, in metres. */
  endMeters: number
  /** Gas density at that depth, in g/L. */
  densityGramsPerLiter: number
}

/**
 * Classifies a gas by its intended role from its oxygen content and depth.
 * Mirrors the heuristic the calculator page used, extracted so it is testable.
 */
export function classifyGasRole(oxygenPercent: number, depthMeters: number): GasRole {
  if (oxygenPercent >= 50 || (oxygenPercent >= 40 && depthMeters <= 20)) return 'deco'
  if (oxygenPercent > 21 && oxygenPercent < 40 && depthMeters > 30) return 'travel'
  return 'working'
}

function roleLabel(role: GasRole): string {
  switch (role) {
    case 'deco':
      return 'deco gas'
    case 'travel':
      return 'travel gas'
    default:
      return 'working gas'
  }
}

function isCCR(mode: DiveMode): boolean {
  return mode === 'ccr' || mode === 'ccr-trimix'
}

/**
 * The PPO2 ceiling that applies to a gas in a given role on a given circuit.
 *
 * On a rebreather the loop is held at the CCR setpoint, so the working ceiling
 * is `maxPPO2CCR`. Decompression gases are breathed open-circuit either way and
 * take `maxPPO2Deco`.
 */
export function applicablePPO2Limit(
  limits: SafetyLimits,
  mode: DiveMode,
  role: GasRole
): number {
  if (role === 'deco') return limits.maxPPO2Deco
  if (isCCR(mode)) return limits.maxPPO2CCR
  return limits.maxPPO2Work
}

function fmt(value: number, decimals = 2): string {
  return Number(value.toFixed(decimals)).toString()
}

/**
 * Generates the warnings for one analysed gas against the diver's own limits.
 *
 * Every threshold below comes from `limits`; none are hardcoded. The absolute
 * 1.6 bar ceiling still applies on top as a hard stop, since no configured
 * preference may raise it (see SAFETY_LIMIT_RANGES).
 */
export function generateGasWarnings(
  analysis: GasAnalysis,
  mode: DiveMode,
  limits: Partial<SafetyLimits> | SafetyLimits,
  units: UnitFormatter = METRIC_FORMATTER
): SafetyWarning[] {
  const L = normalizeSafetyLimits(limits)
  const warnings: SafetyWarning[] = []
  const { ppo2, endMeters, densityGramsPerLiter: density, oxygenPercent, depthMeters } = analysis

  const role = classifyGasRole(oxygenPercent, depthMeters)
  const label = roleLabel(role)
  const isWorking = role === 'working'

  // --- Oxygen toxicity -----------------------------------------------------
  const ceiling = applicablePPO2Limit(L, mode, role)
  const decoCeiling = L.maxPPO2Deco

  if (ppo2 > decoCeiling) {
    warnings.push({
      type: 'danger',
      message: `PPO₂ ${fmt(ppo2)} bar exceeds your maximum limit of ${fmt(decoCeiling)} bar — risk of oxygen toxicity for ${label}!`,
    })
  } else if (ppo2 > ceiling) {
    const circuit = isCCR(mode) ? 'CCR working' : 'working'
    if (role === 'deco') {
      warnings.push({
        type: 'info',
        message: `Deco gas PPO₂ ${fmt(ppo2)} bar is above your ${circuit} limit of ${fmt(ceiling)} bar — appropriate for shallow decompression stops only`,
      })
    } else if (role === 'travel') {
      warnings.push({
        type: 'warning',
        message: `Travel gas PPO₂ ${fmt(ppo2)} bar exceeds your ${circuit} limit of ${fmt(ceiling)} bar — use only during descent to switch depth`,
      })
    } else {
      warnings.push({
        type: 'warning',
        message: `Working gas PPO₂ ${fmt(ppo2)} bar exceeds your ${circuit} limit of ${fmt(ceiling)} bar — reduce O₂ or add helium`,
      })
    }
  } else if (isWorking && ppo2 > ceiling * 0.85) {
    // Advisory band: within 15% of the diver's own working ceiling.
    warnings.push({
      type: 'info',
      message: `Working gas PPO₂ ${fmt(ppo2)} bar is approaching your limit of ${fmt(ceiling)} bar — monitor CNS exposure on extended bottom times`,
    })
  }

  // --- Hypoxia -------------------------------------------------------------
  //
  // Two separate questions, and conflating them told a diver that 16% oxygen
  // was fine. The checks below are about ppO2 *at depth* — whether the gas is
  // survivable where it is being breathed. This one is about the surface:
  // whether it can be breathed on the boat at all.
  if (oxygenPercent < NORMOXIC_MIN_O2_PERCENT) {
    warnings.push({
      type: 'danger',
      message:
        `${oxygenPercent.toFixed(1)}% O₂ is hypoxic at the surface — ppO₂ ` +
        `${fmt(oxygenPercent / 100)} bar in air at sea level, below the ${NORMOXIC_MIN_O2_PERCENT}% ` +
        `normoxic floor. Not breathable at the surface: a travel gas is required for the ` +
        `descent. Hypoxic trimix is for trained technical divers only.`,
    })
  }

  if (ppo2 < HYPOXIA_PPO2_FLOOR) {
    warnings.push({
      type: 'danger',
      message: `PPO₂ ${fmt(ppo2)} bar is below the hypoxic floor of ${HYPOXIA_PPO2_FLOOR} bar — risk of hypoxia for ${label}!`,
    })
  } else if (ppo2 < 0.18 && isWorking) {
    warnings.push({
      type: 'warning',
      message: `Working gas PPO₂ ${fmt(ppo2)} bar leaves minimal margin above the hypoxic floor of ${HYPOXIA_PPO2_FLOOR} bar`,
    })
  }

  // --- Gas density ---------------------------------------------------------
  if (density > L.maxGasDensityCritical) {
    warnings.push({
      type: isWorking ? 'danger' : 'warning',
      message: isWorking
        ? `Critical working gas density ${units.density(density)} exceeds your limit of ${units.density(L.maxGasDensityCritical)} — potentially unbreathable under physical stress`
        : `High ${label} density ${units.density(density)} exceeds your critical limit of ${units.density(L.maxGasDensityCritical)} — may impair breathing during gas switches`,
    })
  } else if (density > L.maxGasDensity) {
    warnings.push({
      type: isWorking ? 'warning' : 'info',
      message: isWorking
        ? `Working gas density ${units.density(density)} exceeds your target of ${units.density(L.maxGasDensity)} — severe work of breathing at depth`
        : `Elevated ${label} density ${units.density(density)} is above your target of ${units.density(L.maxGasDensity)} — consider adding helium`,
    })
  } else if (isWorking && density > L.maxGasDensity * 0.9) {
    warnings.push({
      type: 'info',
      message: `Working gas density ${units.density(density)} is approaching your limit of ${units.density(L.maxGasDensity)} — monitor breathing effort under workload`,
    })
  }

  // --- Narcosis ------------------------------------------------------------
  if (endMeters > L.maxEND) {
    if (isWorking) {
      warnings.push({
        type: 'warning',
        message: `Working gas END ${units.depth(endMeters)} exceeds your limit of ${units.depth(L.maxEND)} — high narcosis risk during critical tasks!`,
      })
    } else if (role === 'travel') {
      warnings.push({
        type: 'warning',
        message: `Travel gas END ${units.depth(endMeters)} exceeds your limit of ${units.depth(L.maxEND)} — switch to bottom gas before this depth`,
      })
    } else {
      warnings.push({
        type: 'info',
        message: `Deco gas END ${units.depth(endMeters)} is above your limit of ${units.depth(L.maxEND)} — acceptable for shallow decompression use only`,
      })
    }
  } else if (isWorking && endMeters > L.maxEND * 0.67) {
    warnings.push({
      type: 'info',
      message: `Working gas END ${units.depth(endMeters)} is approaching your limit of ${units.depth(L.maxEND)} — consider more helium for mental clarity at depth`,
    })
  }

  return warnings
}

/** Planning parameters the diver sets before recommendations are generated. */
export interface PlanningParams {
  targetModMeters: number
  maxEndMeters: number
  desiredPPO2: number
}

/**
 * Warnings about the *planning targets* themselves, before any mix is produced.
 * Thresholds again come from the diver's configured limits.
 */
export function generatePlanningWarnings(
  params: PlanningParams,
  mode: DiveMode,
  limits: Partial<SafetyLimits> | SafetyLimits,
  units: UnitFormatter = METRIC_FORMATTER
): SafetyWarning[] {
  const L = normalizeSafetyLimits(limits)
  const warnings: SafetyWarning[] = []
  const { targetModMeters, maxEndMeters, desiredPPO2 } = params

  const workingCeiling = isCCR(mode) ? L.maxPPO2CCR : L.maxPPO2Work

  if (desiredPPO2 > L.maxPPO2Deco) {
    warnings.push({
      type: 'danger',
      message: `PLANNING: target PPO₂ ${fmt(desiredPPO2)} bar exceeds your maximum limit of ${fmt(L.maxPPO2Deco)} bar`,
    })
  } else if (desiredPPO2 > workingCeiling) {
    warnings.push({
      type: 'warning',
      message: `PLANNING: target PPO₂ ${fmt(desiredPPO2)} bar exceeds your ${isCCR(mode) ? 'CCR ' : ''}working limit of ${fmt(workingCeiling)} bar`,
    })
  }

  if ((mode === 'oc-trimix' || mode === 'ccr-trimix') && maxEndMeters > L.maxEND) {
    warnings.push({
      type: 'warning',
      message: `PLANNING: target END ${units.depth(maxEndMeters)} exceeds your limit of ${units.depth(L.maxEND)} — high narcosis risk`,
    })
  }

  // Depth-band advisories. These reflect training-agency practice rather than a
  // configurable limit, so the thresholds stay fixed in metres — they are the
  // depths the agencies publish. Only their presentation follows the diver.
  if (mode === 'oc') {
    if (targetModMeters > 100) {
      warnings.push({
        type: 'warning',
        message: `PLANNING: exceeds the practical open-circuit limit (${units.depth(100)})`,
      })
    } else if (targetModMeters > 50) {
      warnings.push({
        type: 'warning',
        message: `PLANNING: consider OC Trimix for depths beyond ${units.depth(50)}`,
      })
    } else if (targetModMeters > 40) {
      warnings.push({
        type: 'warning',
        message: `PLANNING: beyond the recreational air limit (${units.depth(40)})`,
      })
    }
  }

  if (mode === 'ccr') {
    if (targetModMeters > 40) {
      warnings.push({
        type: 'danger',
        message: `PLANNING: CCR beyond ${units.depth(40)} requires a trimix diluent — a nitrox diluent gives an unsafe END`,
      })
    } else if (targetModMeters > 30) {
      warnings.push({
        type: 'warning',
        message: `PLANNING: beyond the CCR entry-level depth (${units.depth(30)})`,
      })
    }
  }

  if (mode === 'oc-trimix' && targetModMeters > 100) {
    warnings.push({
      type: 'warning',
      message: `PLANNING: exceeds the practical open-circuit trimix limit (${units.depth(100)})`,
    })
  }

  if (mode === 'ccr-trimix') {
    if (targetModMeters > 100) {
      warnings.push({
        type: 'warning',
        message: `PLANNING: exceeds the practical CCR trimix limit (${units.depth(100)})`,
      })
    } else if (targetModMeters > 60) {
      warnings.push({
        type: 'warning',
        message: `PLANNING: advanced CCR trimix depth range (beyond ${units.depth(60)})`,
      })
    }
  }

  return warnings
}

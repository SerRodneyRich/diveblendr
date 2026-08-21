/**
 * Derivation builders for the recommendation engine.
 *
 * This is the *only* place in the recommendation pipeline that produces LaTeX.
 * Each builder takes the same numbers the calculation used and returns
 * {@link MathStep}s, so a displayed derivation cannot drift away from the
 * displayed result — the legacy inline strings could, because they recomputed
 * their own values with their own literals.
 *
 * The symbolic forms below are stated once, as exported constants, and reused
 * by every builder. If a formula changes, the shown derivation changes with it.
 */

import { AIR_N2_FRACTION, R_L_BAR, ZERO_CELSIUS_K } from '../gas'
import { GAS_CONSTANTS } from '@/utils/vanDeWaalsPhysics'
import { NORMOXIC_MIN_O2_PERCENT } from '../limits'
import type { MathStep } from './types'

/**
 * The symbolic formulas, in LaTeX. One definition each, shared between the
 * "formula" line of a derivation and the code comments that implement them.
 */
export const FORMULAS = {
  /** Ambient pressure under the 10 msw/bar diving convention. */
  ambientPressure: String.raw`P_\text{amb} = \frac{d}{10} + 1`,
  /** Oxygen fraction that yields a target PPO2 at a given pressure. */
  optimalFO2: String.raw`F_{O_2} = \frac{PPO_2}{P_\text{amb}}`,
  /** Maximum operating depth for a fraction and a PPO2 ceiling. */
  mod: String.raw`\text{MOD} = \left(\frac{PPO_2}{F_{O_2}} - 1\right) \times 10`,
  /** Largest nitrogen fraction that keeps END at or below its limit. */
  maxFN2: String.raw`F_{N_2}^{\max} = \frac{0.79 \times P_\text{END}}{P_\text{amb}}`,
  /** Helium is the balance once oxygen and nitrogen are fixed. */
  heliumBalance: String.raw`F_{He} = 1 - F_{O_2} - F_{N_2}`,
  /** Equivalent narcotic depth, nitrogen-only (IANTD/GUE). */
  endN2: String.raw`\text{END} = \left(\frac{F_{N_2}}{0.79} \times P_\text{amb} - 1\right) \times 10`,
  /** Equivalent narcotic depth counting oxygen as narcotic (NOAA/DCIEM). */
  endN2O2: String.raw`\text{END} = \left(\left(F_{N_2} + F_{O_2}\right) \times P_\text{amb} - 1\right) \times 10`,
  /** Density from the ideal gas law. */
  density: String.raw`\rho = \frac{P_\text{amb} \cdot M}{R \cdot T}`,
  /** Mole-fraction-weighted molar mass. */
  molarMass: String.raw`M = F_{O_2} M_{O_2} + F_{He} M_{He} + F_{N_2} M_{N_2}`,
  /** Hypoxic ceiling: shallowest depth still delivering PPO2 0.16 bar. */
  hypoxicCeiling: String.raw`d_\text{ceiling} = \left(\frac{F_{O_2,\text{min}}}{F_{O_2}} - 1\right) \times 10`,
  /** CNS clock as a fraction of the NOAA single-exposure limit. */
  cns: String.raw`\text{CNS}\% = \frac{t}{t_\text{limit}(PPO_2)} \times 100`,
} as const

/** Formats a number for LaTeX at a fixed precision, without a trailing `.0`. */
export function num(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return '\\text{--}'
  return Number(value.toFixed(decimals)).toString()
}

/** Wraps a value with a unit in LaTeX (`32\,\text{m}`). */
export function withUnit(value: number, unit: string, decimals: number = 2): string {
  return `${num(value, decimals)}\\,\\text{${unit}}`
}

/** Ambient-pressure step. */
export function ambientPressureStep(depthMeters: number, pressureBar: number): MathStep {
  return {
    label: 'Ambient pressure at depth',
    formula: FORMULAS.ambientPressure,
    substitution: String.raw`P_\text{amb} = \frac{${num(depthMeters, 1)}}{10} + 1`,
    result: String.raw`P_\text{amb} = ${withUnit(pressureBar, 'bar')}`,
    note: 'Diving convention: 10 metres of seawater adds one bar to a one-bar surface pressure.',
  }
}

/** Optimal-oxygen step, including the conservative rounding that follows it. */
export function optimalOxygenStep(
  desiredPPO2: number,
  pressureBar: number,
  rawFO2: number,
  roundedO2Percent: number
): MathStep {
  return {
    label: 'Oxygen fraction for the target PPO₂',
    formula: FORMULAS.optimalFO2,
    substitution: String.raw`F_{O_2} = \frac{${num(desiredPPO2, 2)}}{${num(pressureBar, 2)}} = ${num(rawFO2, 4)}`,
    result: String.raw`O_2 = ${num(roundedO2Percent, 0)}\%`,
    note: `Rounded down to a whole percent (${num(rawFO2 * 100, 1)}% → ${num(roundedO2Percent, 0)}%) so the mix a blender can actually fill never exceeds the planned PPO₂ at depth.`,
  }
}

/** Maximum-nitrogen-from-END step. */
export function maxNitrogenStep(
  maxEndMeters: number,
  endPressureBar: number,
  pressureBar: number,
  rawFN2: number,
  roundedN2Percent: number
): MathStep {
  return {
    label: 'Nitrogen ceiling from the END limit',
    formula: FORMULAS.maxFN2,
    substitution: String.raw`F_{N_2}^{\max} = \frac{${AIR_N2_FRACTION} \times ${num(endPressureBar, 2)}}{${num(pressureBar, 2)}} = ${num(rawFN2, 4)}`,
    result: String.raw`N_2 = ${num(roundedN2Percent, 0)}\%`,
    note: `An END of ${num(maxEndMeters, 0)} m is the narcotic load of air at ${num(maxEndMeters, 0)} m. Nitrogen is rounded down, which shortens the assumed narcotic load rather than lengthening it.`,
  }
}

/** Helium-as-balance step. */
export function heliumBalanceStep(
  o2Percent: number,
  n2Percent: number,
  hePercent: number
): MathStep {
  return {
    label: 'Helium makes up the balance',
    formula: FORMULAS.heliumBalance,
    substitution: String.raw`He = 100 - ${num(o2Percent, 0)} - ${num(n2Percent, 0)}`,
    result: String.raw`He = ${num(hePercent, 0)}\%`,
    note: 'Helium is rounded up so the three fractions still total 100% after oxygen and nitrogen have both been rounded down.',
  }
}

/** MOD verification step. */
export function modStep(
  ceilingPPO2: number,
  o2Percent: number,
  rawModMeters: number,
  roundedModMeters: number
): MathStep {
  const fo2 = o2Percent / 100
  return {
    label: 'Maximum operating depth',
    formula: FORMULAS.mod,
    substitution: String.raw`\text{MOD} = \left(\frac{${num(ceilingPPO2, 2)}}{${num(fo2, 3)}} - 1\right) \times 10 = ${num(rawModMeters, 1)}`,
    result: String.raw`\text{MOD} = ${withUnit(roundedModMeters, 'm', 0)}`,
    note: `Floored to a whole metre at PPO₂ ${num(ceilingPPO2, 2)} bar.`,
  }
}

/** END verification step, in whichever narcosis model the diver selected. */
export function endStep(
  n2Percent: number,
  o2Percent: number,
  pressureBar: number,
  endMeters: number,
  includeOxygenNarcosis: boolean
): MathStep {
  const fn2 = n2Percent / 100
  const fo2 = o2Percent / 100
  return {
    label: 'Equivalent narcotic depth',
    formula: includeOxygenNarcosis ? FORMULAS.endN2O2 : FORMULAS.endN2,
    substitution: includeOxygenNarcosis
      ? String.raw`\text{END} = \left(\left(${num(fn2, 3)} + ${num(fo2, 3)}\right) \times ${num(pressureBar, 2)} - 1\right) \times 10`
      : String.raw`\text{END} = \left(\frac{${num(fn2, 3)}}{${AIR_N2_FRACTION}} \times ${num(pressureBar, 2)} - 1\right) \times 10`,
    result: String.raw`\text{END} = ${withUnit(endMeters, 'm', 0)}`,
    note: includeOxygenNarcosis
      ? 'NOAA/DCIEM model — oxygen is counted as narcotic alongside nitrogen.'
      : 'IANTD/GUE model — only nitrogen is treated as narcotic. Switch models in Preferences.',
  }
}

/** Density steps: molar mass, then the ideal gas law. */
export function densitySteps(
  o2Percent: number,
  hePercent: number,
  n2Percent: number,
  molarMassGPerMol: number,
  pressureBar: number,
  temperatureC: number,
  densityGramsPerLiter: number
): MathStep[] {
  const M = GAS_CONSTANTS
  return [
    {
      label: 'Molar mass of the mixture',
      formula: FORMULAS.molarMass,
      substitution: String.raw`M = ${num(o2Percent / 100, 3)}\times${M.O2.molarMass} + ${num(hePercent / 100, 3)}\times${M.He.molarMass} + ${num(n2Percent / 100, 3)}\times${M.N2.molarMass}`,
      result: String.raw`M = ${withUnit(molarMassGPerMol, 'g/mol', 2)}`,
    },
    {
      label: 'Gas density at depth',
      formula: FORMULAS.density,
      substitution: String.raw`\rho = \frac{${num(pressureBar, 2)} \times ${num(molarMassGPerMol, 2)}}{${R_L_BAR} \times ${num(ZERO_CELSIUS_K + temperatureC, 2)}}`,
      result: String.raw`\rho = ${withUnit(densityGramsPerLiter, 'g/L', 1)}`,
      note: `Derived from the ideal gas law at ${num(temperatureC, 0)} °C, not from partial-pressure-scaled surface densities — the latter overstates density by about 1.3%.`,
    },
  ]
}

/** Hypoxic-ceiling step, only relevant for a mix below roughly 16% oxygen. */
export function hypoxicCeilingStep(
  o2Percent: number,
  ceilingMeters: number,
  /**
   * Minimum surface oxygen fraction. The normoxic floor (0.18), not the
   * loss-of-consciousness one — the question is whether the gas may be
   * breathed at the surface, which the agencies answer at 18%.
   */
  minSurfaceFO2: number = NORMOXIC_MIN_O2_PERCENT / 100
): MathStep {
  return {
    label: 'Hypoxic ceiling',
    formula: FORMULAS.hypoxicCeiling,
    substitution: String.raw`d_\text{ceiling} = \left(\frac{${num(minSurfaceFO2, 2)}}{${num(o2Percent / 100, 3)}} - 1\right) \times 10`,
    result: String.raw`d_\text{ceiling} = ${withUnit(ceilingMeters, 'm', 0)}`,
    note:
      `Below ${num(minSurfaceFO2 * 100, 0)}% oxygen a mix is hypoxic trimix: not breathable at ` +
      `the surface, so the descent needs a travel gas and the switch happens below ` +
      `${num(ceilingMeters, 0)} m. ${num(minSurfaceFO2 * 100, 0)}% is the normoxic boundary every ` +
      `technical agency draws.`,
  }
}

/** CNS-clock step. */
export function cnsStep(
  ppo2: number,
  minutes: number,
  limitMinutes: number | null,
  percent: number | null
): MathStep {
  if (percent === null || limitMinutes === null) {
    return {
      label: 'CNS oxygen exposure',
      formula: FORMULAS.cns,
      note: `PPO₂ ${num(ppo2, 2)} bar is above the highest value in the NOAA exposure table (1.6 bar), so no CNS limit is published for it.`,
    }
  }
  return {
    label: 'CNS oxygen exposure',
    formula: FORMULAS.cns,
    substitution: String.raw`\text{CNS}\% = \frac{${num(minutes, 0)}}{${num(limitMinutes, 0)}} \times 100`,
    result: String.raw`\text{CNS}\% = ${num(percent, 1)}\%`,
    note: `NOAA single-exposure limit at PPO₂ ${num(ppo2, 2)} bar is ${num(limitMinutes, 0)} minutes, interpolated between tabulated points.`,
  }
}

/** A plain prose step with no math, for standard-mix rationale. */
export function noteStep(label: string, note: string): MathStep {
  return { label, note }
}

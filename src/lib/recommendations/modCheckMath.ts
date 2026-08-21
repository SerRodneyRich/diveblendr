/**
 * The derivation behind a MOD check.
 *
 * The point of this one is the comparison. Every other derivation in the app
 * answers a single question; this one answers four — oxygen, narcosis, density
 * and the hypoxic ceiling — and then has to show which of them binds and why
 * the others do not. A diver who is told "30 m, set by narcosis" should be able
 * to see the 51 m the oxygen limit alone would have allowed, and check the
 * arithmetic that ruled it out.
 *
 * Pure and framework-free: it emits `MathStep`s, and `MathSteps` renders them.
 */

import { AIR_N2_FRACTION, R_L_BAR, ZERO_CELSIUS_K, molarMass } from '../gas'
import type { GasFractions } from '../gas'
import type { SafetyLimits } from '../limits'
import type { OperatingDepthResult } from '../operatingDepth'
import {
  ambientPressureStep,
  cnsStep,
  densitySteps,
  endStep,
  hypoxicCeilingStep,
  modStep,
  num,
  withUnit,
} from './math'
import type { MathDerivation, MathStep } from './types'

/** How each limit is named to a diver, and the order they are shown in. */
const LIMIT_LABELS = {
  oxygen: { title: 'Oxygen (ppO₂)', inline: 'oxygen' },
  narcosis: { title: 'Narcosis (END)', inline: 'narcosis' },
  density: { title: 'Gas density', inline: 'density' },
} as const

export interface ModCheckMathInput {
  mix: GasFractions
  label: string
  limits: SafetyLimits
  operating: OperatingDepthResult
  /** The ppO₂ ceiling in force — working, or the CCR setpoint. */
  workingPPO2: number
  /** Raw, unrounded oxygen MOD in metres, before the conservative floor. */
  oxygenModRaw: number
  /** END in metres evaluated at the operating depth. */
  endAtWorkingMod: number
  /** Density in g/L evaluated at the operating depth. */
  densityAtWorkingMod: number
  /** Water temperature the density was computed at, °C. */
  temperatureC: number
  hypoxicFloor: number
  isHypoxic: boolean
  cns: { percent: number | null; limitMinutes: number | null }
  plannedMinutes: number
  ppo2AtWorkingMod: number
}

/**
 * Builds the full MOD-check derivation.
 *
 * Ordered as a diver reads it: what the three limits each permit, which one
 * wins, then what the winning depth costs in narcosis, density and oxygen
 * exposure.
 */
export function modCheckDerivation(input: ModCheckMathInput): MathDerivation {
  const {
    mix,
    label,
    limits,
    operating,
    workingPPO2,
    oxygenModRaw,
    endAtWorkingMod,
    densityAtWorkingMod,
    temperatureC,
    hypoxicFloor,
    isHypoxic,
    cns,
    plannedMinutes,
    ppo2AtWorkingMod,
  } = input

  const o2Percent = mix.o2 * 100
  const hePercent = mix.he * 100
  const n2Percent = mix.n2 * 100
  const depth = operating.depthMeters
  const pressureAtDepth = depth / 10 + 1

  const steps: MathStep[] = []

  steps.push({
    label: 'The mix',
    formula: String.raw`F_{O_2} + F_{He} + F_{N_2} = 1`,
    substitution: String.raw`${num(mix.o2, 3)} + ${num(mix.he, 3)} + ${num(mix.n2, 3)} = 1`,
    note: `${label} — ${num(o2Percent, 1)}% oxygen, ${num(hePercent, 1)}% helium, ${num(n2Percent, 1)}% nitrogen. Nitrogen is the balance, never entered directly.`,
  })

  // --- Each limit in turn ---------------------------------------------------

  steps.push(
    modStep(workingPPO2, o2Percent, oxygenModRaw, operating.oxygenDepthMeters)
  )

  steps.push({
    label: 'Depth at the narcosis limit',
    // The END formula solved for depth, not the END formula itself — showing
    // the latter beside a substitution for `d` reads as a mismatch.
    formula: limits.oxygenNarcosisModel
      ? String.raw`d = \left(\frac{\frac{\text{END}_\text{max}}{10} + 1}{F_{N_2} + F_{O_2}} - 1\right) \times 10`
      : String.raw`d = \left(\frac{\left(\frac{\text{END}_\text{max}}{10} + 1\right) \times ${AIR_N2_FRACTION}}{F_{N_2}} - 1\right) \times 10`,
    substitution: limits.oxygenNarcosisModel
      ? String.raw`d = \left(\frac{\frac{${num(limits.maxEND, 0)}}{10} + 1}{${num(mix.n2 + mix.o2, 3)}} - 1\right) \times 10`
      : String.raw`d = \left(\frac{\left(\frac{${num(limits.maxEND, 0)}}{10} + 1\right) \times ${AIR_N2_FRACTION}}{${num(mix.n2, 3)}} - 1\right) \times 10`,
    result: String.raw`d = ${withUnit(operating.narcosisDepthMeters, 'm', 0)}`,
    note: `The depth at which this mix reaches your ${num(limits.maxEND, 0)} m END limit. Inverted from the END formula — the same relation, solved for depth instead of for END. ${
      limits.oxygenNarcosisModel
        ? 'NOAA/DCIEM model: oxygen counts as narcotic.'
        : 'IANTD/GUE model: only nitrogen counts.'
    }`,
  })

  steps.push({
    label: 'Depth at the density limit',
    formula: String.raw`d = \left(\frac{\rho_\text{max} \cdot R \cdot T}{M} - 1\right) \times 10`,
    substitution: String.raw`d = \left(\frac{${num(limits.maxGasDensity, 1)} \times ${num(R_L_BAR, 5)} \times ${num(temperatureC + ZERO_CELSIUS_K, 2)}}{${num(molarMass(mix), 2)}} - 1\right) \times 10`,
    result: String.raw`d = ${withUnit(operating.densityDepthMeters, 'm', 0)}`,
    note: `Where this mix reaches your ${num(limits.maxGasDensity, 1)} g/L target at ${num(temperatureC, 0)} °C. The ideal gas law solved for depth. Colder water is denser, so this depth moves with temperature.`,
  })

  if (isHypoxic) {
    steps.push(hypoxicCeilingStep(o2Percent, hypoxicFloor))
  }

  // --- The comparison -------------------------------------------------------
  //
  // The step this whole derivation exists for. Three limits, three depths, and
  // the shallowest is the answer — stated as a minimum rather than as prose so
  // it is checkable.

  const candidates = [
    { key: 'oxygen', depth: operating.oxygenDepthMeters },
    { key: 'narcosis', depth: operating.narcosisDepthMeters },
    { key: 'density', depth: operating.densityDepthMeters },
  ] as const

  const finite = candidates.filter((c) => Number.isFinite(c.depth))
  const losers = finite.filter((c) => c.key !== operating.limitedBy)

  steps.push({
    label: 'Which limit binds',
    formula: String.raw`d_\text{max} = \min\left(d_{O_2},\; d_\text{END},\; d_\rho\right)`,
    substitution: String.raw`d_\text{max} = \min\left(${finite
      .map((c) => num(c.depth, 0))
      .join(',\; ')}\right)`,
    result: String.raw`d_\text{max} = ${withUnit(depth, 'm', 0)}`,
    note:
      `${LIMIT_LABELS[operating.limitedBy as keyof typeof LIMIT_LABELS]?.title ?? operating.limitedBy} binds first at ${num(depth, 0)} m` +
      (losers.length
        ? `, so ${losers
            .map((c) => `${LIMIT_LABELS[c.key].inline} (${num(c.depth, 0)} m)`)
            .join(' and ')} never come into play. ` +
          `A gas is only as deep as its shallowest limit: the oxygen MOD alone is not an operating depth.`
        : '.'),
  })

  // --- What the binding depth costs ----------------------------------------

  steps.push(ambientPressureStep(depth, pressureAtDepth))

  steps.push(
    endStep(n2Percent, o2Percent, pressureAtDepth, endAtWorkingMod, limits.oxygenNarcosisModel)
  )

  steps.push(...densitySteps(o2Percent, hePercent, n2Percent, molarMass(mix), pressureAtDepth, temperatureC, densityAtWorkingMod))

  steps.push(cnsStep(ppo2AtWorkingMod, plannedMinutes, cns.limitMinutes, cns.percent))

  return { title: `How ${label} was checked`, steps }
}

'use client'

import { useMemo } from 'react'
import {
  gas,
  modRaw,
  endRaw,
  densityAtDepth,
  ppo2AtDepth,
  hypoxicCeilingRaw,
  formatMix,
  type GasFractions,
} from '@/lib/gas'
import { calculateCNS, type CNSResult } from '@/lib/cns'
import { operatingDepth, type OperatingDepthResult } from '@/lib/operatingDepth'
import { NORMOXIC_MIN_O2_PERCENT, normalizeSafetyLimits, type SafetyLimits } from '@/lib/limits'
import { METRIC_FORMATTER, type UnitFormatter } from '@/lib/units'
import {
  generateGasWarnings,
  type DiveMode,
  type SafetyWarning,
} from '@/lib/warnings'
import {
  roundMOD,
  roundEND,
  roundDensity,
  roundHypoxicCeiling,
  roundPPO2,
} from '@/lib/rounding'

export interface ModCheckInputs {
  /** Oxygen percentage of the analysed mix, 0–100. */
  o2Percent: number
  /** Helium percentage of the analysed mix, 0–100. */
  hePercent: number
  /** Dive mode, which selects the applicable working ppO₂ ceiling. */
  diveMode: DiveMode
  /** Planned bottom time at the working MOD, in minutes. */
  plannedMinutes: number
  /** Water temperature in °C, used for the density correction. */
  waterTempC: number
  /**
   * How warning text writes depths and densities (C1). Values stay metric;
   * only the message strings follow the diver. Defaults to metric.
   */
  units?: UnitFormatter
}

export interface ModCheckResult {
  /** Null when the entered percentages cannot form a valid mixture. */
  mix: GasFractions | null
  /** The conventional mix label, e.g. "18/45", "EAN32", "Air". */
  label: string
  /** Error text when the mix is invalid, otherwise null. */
  error: string | null
  /** The diver's normalised safety limits. */
  limits: SafetyLimits
  /**
   * The depth in metres this gas may actually be taken to — the shallowest of
   * the oxygen, narcosis and density limits. This is the number to show a
   * diver; `oxygenMod` alone is not an operating depth.
   */
  workingMod: number
  /** MOD in metres from the ppO₂ ceiling alone, ignoring narcosis and density. */
  oxygenMod: number
  /** Full breakdown of which limit binds and where each one falls. */
  operating: OperatingDepthResult
  /** The ppO₂ ceiling used for `oxygenMod`. */
  workingPPO2: number
  /** MOD in metres at the deco ppO₂ ceiling. */
  decoMod: number
  /** Shallowest breathable depth in metres; 0 for a normoxic mix. */
  hypoxicFloor: number
  /** True when the mix is hypoxic at the surface. */
  isHypoxic: boolean
  /** END in metres at the working MOD. */
  endAtWorkingMod: number
  /** Gas density in g/L at the working MOD. */
  densityAtWorkingMod: number
  /** ppO₂ in bar at the working MOD (equals `workingPPO2` after rounding). */
  ppo2AtWorkingMod: number
  /** CNS loading for `plannedMinutes` at the working MOD. */
  cns: CNSResult
  /** Warnings from the shared module, using the diver's own limits. */
  warnings: SafetyWarning[]
}

/**
 * The MOD-check analysis of a mix the diver already has.
 *
 * Every number here is produced by `src/lib`; this hook only selects which
 * library function answers which question and rounds the result in the
 * conservative direction the rounding module prescribes. No thresholds are
 * defined here — they arrive via `limits`, which the page reads from
 * `PreferencesContext`.
 */
export function useModCheck(
  inputs: ModCheckInputs,
  rawLimits: Partial<SafetyLimits>
): ModCheckResult {
  const { o2Percent, hePercent, diveMode, plannedMinutes, waterTempC, units } = inputs

  return useMemo(() => {
    const limits = normalizeSafetyLimits(rawLimits)
    const isCCR = diveMode === 'ccr' || diveMode === 'ccr-trimix'
    const workingPPO2 = isCCR ? limits.maxPPO2CCR : limits.maxPPO2Work

    const empty = {
      limits,
      workingPPO2,
      workingMod: 0,
      oxygenMod: 0,
      operating: {
        depthMeters: 0,
        limitedBy: 'oxygen' as const,
        oxygenDepthMeters: 0,
        narcosisDepthMeters: 0,
        densityDepthMeters: 0,
        ceilingMeters: 0,
        unusable: false,
      },
      decoMod: 0,
      hypoxicFloor: 0,
      isHypoxic: false,
      endAtWorkingMod: 0,
      densityAtWorkingMod: 0,
      ppo2AtWorkingMod: 0,
      cns: { percent: 0, overLimit: false, limitMinutes: null } as CNSResult,
      warnings: [] as SafetyWarning[],
    }

    let mix: GasFractions
    try {
      mix = gas(o2Percent / 100, hePercent / 100)
    } catch (e) {
      return {
        ...empty,
        mix: null,
        label: '—',
        error: e instanceof Error ? e.message : 'Invalid gas mixture',
      }
    }

    if (mix.o2 <= 0) {
      return {
        ...empty,
        mix,
        label: formatMix(mix),
        error: 'A mix with no oxygen has no operating depth — it is never breathable.',
      }
    }

    // The oxygen limit alone. Kept because the diver still wants to see it,
    // but it is NOT the depth this gas may be taken to — see `operating`.
    const oxygenMod = roundMOD(modRaw(mix, workingPPO2))
    const decoMod = roundMOD(modRaw(mix, limits.maxPPO2Deco))

    // The depth the gas may actually be dived to: the shallowest of the
    // oxygen, narcosis and density limits. Reporting the oxygen MOD alone is
    // how air came to be offered to 51 m on a CCR setpoint while the END card
    // beside it showed 51 m against a 30 m limit.
    const operating = operatingDepth(mix, limits, {
      ceilingPPO2: workingPPO2,
      temperatureC: waterTempC,
    })
    const workingMod = operating.depthMeters

    // The hypoxic floor is the shallowest depth at which the mix still delivers
    // a breathable ppO₂. `hypoxicCeilingRaw` returns 0 for any normoxic mix.
    // Against the normoxic floor, not the loss-of-consciousness one: the
    // question is whether this gas may be breathed at the surface, and the
    // agencies draw that at 18% O2. Using 0.16 bar reported 16% as fine.
    const hypoxicFloorRaw = hypoxicCeilingRaw(mix, NORMOXIC_MIN_O2_PERCENT / 100)
    const hypoxicFloor = roundHypoxicCeiling(hypoxicFloorRaw)
    const isHypoxic = hypoxicFloor > 0

    // Everything below is evaluated at the working MOD, which is the deepest
    // point the diver may take this gas on the bottom phase.
    const endAtWorkingMod = roundEND(endRaw(mix, workingMod, limits.oxygenNarcosisModel))
    const densityAtWorkingMod = roundDensity(densityAtDepth(mix, workingMod, waterTempC))
    const ppo2Working = roundPPO2(ppo2AtDepth(mix, workingMod))

    const cns = calculateCNS(ppo2Working, plannedMinutes)

    const warnings = generateGasWarnings(
      {
        oxygenPercent: o2Percent,
        depthMeters: workingMod,
        ppo2: ppo2Working,
        endMeters: endAtWorkingMod,
        densityGramsPerLiter: densityAtWorkingMod,
      },
      diveMode,
      limits,
      units ?? METRIC_FORMATTER
    )

    return {
      mix,
      label: formatMix(mix),
      error: null,
      limits,
      workingPPO2,
      workingMod,
      oxygenMod,
      operating,
      decoMod,
      hypoxicFloor,
      isHypoxic,
      endAtWorkingMod,
      densityAtWorkingMod,
      ppo2AtWorkingMod: ppo2Working,
      cns,
      warnings,
    }
  }, [o2Percent, hePercent, diveMode, plannedMinutes, waterTempC, rawLimits, units])
}

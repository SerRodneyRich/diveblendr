/**
 * Isobaric counterdiffusion (ICD) screening at gas switches.
 *
 * Not ported from DecoTengu, which does not model ICD. Original to DiveBlendr.
 *
 * WHAT THIS IS GUARDING AGAINST
 * -----------------------------
 * At a gas switch the ambient pressure does not change, but the inspired
 * fractions do. Switching from a helium-rich bottom mix to a nitrogen-rich
 * deco mix means helium leaves the tissues while nitrogen enters them — in
 * opposite directions, at the same ambient pressure, hence *isobaric*
 * counterdiffusion. Helium diffuses roughly 2.65 times faster than nitrogen,
 * so nitrogen can enter faster than helium leaves, and the TOTAL inert gas
 * tension can rise even though the diver is decompressing. In the inner ear,
 * which is poorly perfused and slow to equilibrate, that transient rise is
 * associated with vestibular DCS.
 *
 * Doolette & Mitchell, "Biophysical basis for inner ear decompression
 * sickness" (J Appl Physiol, 2003), is the work that established the
 * mechanism and modelled the inner ear as a distinct tissue.
 *
 * THIS IS A SCREENING HEURISTIC, NOT A MODEL
 * ------------------------------------------
 * The "rule of fifths" (Steve Burton) says: on a switch, the increase in the
 * nitrogen fraction should not exceed one fifth of the decrease in the helium
 * fraction. It is a rule of thumb, not a physiological simulation, and it is
 * labelled as such in the output types so no part of the UI can present it as
 * a computed risk. A compliant switch is not a guarantee of safety and a
 * flagged one is not a prediction of injury.
 *
 * The check runs automatically on every generated schedule, open circuit and
 * CCR bailout alike.
 */

import type { GasFractions } from '../gas'
import { gas } from '../gas'
import type { IcdCheck, IcdVerdict, PlannedGas, ScheduleSegment } from './types'
import { SECONDS_PER_MINUTE } from './constants'

/**
 * Rule-of-fifths ratio threshold for a caution.
 * ΔFN2 above ΔFHe/5 breaches the rule.
 */
export const ICD_CAUTION_RATIO = 1 / 5

/**
 * Ratio at which the breach is severe enough to warrant a strong warning.
 * ΔFN2 above ΔFHe/3.
 */
export const ICD_WARNING_RATIO = 1 / 3

/**
 * Evaluates one gas switch under the rule of fifths.
 *
 * @param from - Mix being left.
 * @param to - Mix being switched to.
 */
export function evaluateSwitch(
  from: GasFractions,
  to: GasFractions
): {
  deltaFHe: number
  deltaFN2: number
  ratio: number
  verdict: IcdVerdict
  message: string
  suggestedMaxDeltaFN2?: number
  suggestedMix?: GasFractions
} {
  // Signed changes: negative deltaFHe means helium is dropping.
  const deltaFHe = to.he - from.he
  const deltaFN2 = to.n2 - from.n2

  // ICD is only a concern when helium falls AND nitrogen rises. Any other
  // combination cannot produce counterdiffusion in the dangerous direction.
  if (deltaFHe >= 0 || deltaFN2 <= 0) {
    return {
      deltaFHe,
      deltaFN2,
      ratio: 0,
      verdict: 'ok',
      message:
        deltaFN2 <= 0
          ? 'Nitrogen fraction does not increase on this switch; no counterdiffusion concern.'
          : 'Helium fraction does not decrease on this switch; no counterdiffusion concern.',
    }
  }

  const heliumDrop = -deltaFHe
  const ratio = deltaFN2 / heliumDrop

  // The largest nitrogen increase that would satisfy the rule.
  const suggestedMaxDeltaFN2 = heliumDrop * ICD_CAUTION_RATIO

  const asPercent = (value: number) => (value * 100).toFixed(1)

  if (ratio > ICD_WARNING_RATIO) {
    return {
      deltaFHe,
      deltaFN2,
      ratio,
      verdict: 'warning',
      message:
        `Nitrogen rises ${asPercent(deltaFN2)}% while helium falls ${asPercent(heliumDrop)}% ` +
        `(1:${(1 / ratio).toFixed(1)}). This substantially breaches the rule of fifths and ` +
        'carries a recognised risk of inner-ear decompression sickness. Consider a deco mix ' +
        'containing helium.',
      suggestedMaxDeltaFN2,
      suggestedMix: suggestCompliantMix(from, to, suggestedMaxDeltaFN2),
    }
  }

  if (ratio > ICD_CAUTION_RATIO) {
    return {
      deltaFHe,
      deltaFN2,
      ratio,
      verdict: 'caution',
      message:
        `Nitrogen rises ${asPercent(deltaFN2)}% while helium falls ${asPercent(heliumDrop)}% ` +
        `(1:${(1 / ratio).toFixed(1)}), exceeding the rule of fifths (1:5). Consider a deco ` +
        'mix containing helium.',
      suggestedMaxDeltaFN2,
      suggestedMix: suggestCompliantMix(from, to, suggestedMaxDeltaFN2),
    }
  }

  return {
    deltaFHe,
    deltaFN2,
    ratio,
    verdict: 'ok',
    message: `Nitrogen rise is within one fifth of the helium drop (1:${(1 / ratio).toFixed(1)}); the switch satisfies the rule of fifths.`,
  }
}

/**
 * A deco mix at the same oxygen fraction as the intended one, whose nitrogen
 * increase satisfies the rule of fifths — the balance made up with helium.
 *
 * Returns undefined when no such mix exists (e.g. the target is pure oxygen,
 * where there is no room to add helium without changing the PPO2 the diver
 * chose the gas for).
 */
function suggestCompliantMix(
  from: GasFractions,
  to: GasFractions,
  maxDeltaFN2: number
): GasFractions | undefined {
  const targetN2 = from.n2 + maxDeltaFN2
  const o2 = to.o2
  const he = 1 - o2 - targetN2

  if (he < 0 || targetN2 < 0) return undefined
  // A suggestion identical to what was already asked for is not a suggestion.
  if (Math.abs(he - to.he) < 1e-9) return undefined

  try {
    return gas(o2, he)
  } catch {
    return undefined
  }
}

/**
 * Screens every gas switch in a schedule.
 *
 * A "switch" is any point where the breathed gas index changes, whether it was
 * recorded as an explicit `gas-switch` segment or arose from gas selection
 * during the ascent.
 */
export function screenSchedule(
  segments: readonly ScheduleSegment[],
  gases: readonly PlannedGas[]
): IcdCheck[] {
  const checks: IcdCheck[] = []
  let previousGasIndex: number | null = null

  for (const segment of segments) {
    if (previousGasIndex !== null && segment.gasIndex !== previousGasIndex) {
      const from = gases[previousGasIndex]
      const to = gases[segment.gasIndex]
      if (from && to) {
        const evaluation = evaluateSwitch(from.mix, to.mix)
        checks.push({
          atSec: segment.startSec,
          depth: segment.startDepth,
          fromGasIndex: previousGasIndex,
          toGasIndex: segment.gasIndex,
          deltaFHe: evaluation.deltaFHe,
          deltaFN2: evaluation.deltaFN2,
          ratio: evaluation.ratio,
          verdict: evaluation.verdict,
          message: evaluation.message,
          ...(evaluation.suggestedMaxDeltaFN2 !== undefined
            ? { suggestedMaxDeltaFN2: evaluation.suggestedMaxDeltaFN2 }
            : {}),
          ...(evaluation.suggestedMix ? { suggestedMix: evaluation.suggestedMix } : {}),
        })
      }
    }
    previousGasIndex = segment.gasIndex
  }

  return checks
}

/** The most severe verdict across a set of checks. */
export function worstVerdict(checks: readonly IcdCheck[]): IcdVerdict {
  if (checks.some((c) => c.verdict === 'warning')) return 'warning'
  if (checks.some((c) => c.verdict === 'caution')) return 'caution'
  return 'ok'
}

/** Formats a switch time as minutes, for messages and tables. */
export function switchMinutes(check: IcdCheck): number {
  return check.atSec / SECONDS_PER_MINUTE
}

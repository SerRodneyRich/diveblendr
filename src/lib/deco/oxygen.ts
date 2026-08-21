/**
 * Oxygen exposure over a dive: CNS% and OTU.
 *
 * Not ported from DecoTengu — DecoTengu models inert gas only and tracks no
 * oxygen exposure. This module is original to DiveBlendr, built on the Phase 1
 * NOAA CNS table in `src/lib/cns.ts`.
 *
 * THE TWO CLOCKS MEASURE DIFFERENT INJURIES
 * -----------------------------------------
 * **CNS%** tracks central nervous system oxygen toxicity — the acute risk,
 * whose endpoint is a convulsion underwater. It is a percentage of the NOAA
 * single-exposure limit at the PPO2 breathed, and the limit falls steeply with
 * PPO2 (300 min at 1.0 bar, 45 min at 1.6).
 *
 * **OTU** (oxygen tolerance units) tracks *pulmonary* oxygen toxicity — the
 * cumulative lung irritation from long exposures, which matters across a day
 * or a week of diving rather than within one dive. Repex:
 *
 *     OTU = t · ((PPO2 − 0.5)/0.5)^0.83     for PPO2 > 0.5 bar
 *
 * A dive can be fine on one clock and not the other, which is why both are
 * reported rather than combined into one number.
 *
 * RAMP SEGMENTS USE THE MEAN PPO2
 * -------------------------------
 * Both clocks are integrated segment by segment. On a descent or ascent the
 * PPO2 varies continuously, and both formulae are non-linear in PPO2, so
 * charging the segment at its mean PPO2 is an approximation rather than an
 * identity. It is a good one here because travel segments are short (a 3 m
 * ascent leg is 20 s) and the curvature over such a small PPO2 range is
 * slight; the error is far below the accuracy of the underlying tables, which
 * NOAA itself describes as judgement rather than measurement. Constant-depth
 * segments — where essentially all exposure accumulates — are exact.
 */

import type { ScheduleSegment, OxygenExposure } from './types'
import {
  OTU_EXPONENT,
  OTU_THRESHOLD_PPO2,
  OTU_DAILY_LIMIT,
  CNS_HALF_TIME_MINUTES,
  SECONDS_PER_MINUTE,
} from './constants'
import { calculateCNS, CNS_TABLE_MAX_PPO2 } from '../cns'

/** Per-segment oxygen exposure, for charting. */
export interface SegmentOxygen {
  /** CNS% contributed by this segment alone. */
  readonly cnsPercent: number
  /** OTU contributed by this segment alone. */
  readonly otu: number
  /** The PPO2 the segment was charged at (mean over the segment). */
  readonly ppo2: number
  /** True when the segment's PPO2 exceeded the NOAA table. */
  readonly overLimit: boolean
}

/**
 * OTU accumulated breathing at a PPO2 for a duration.
 *
 * Below the 0.5 bar threshold no pulmonary loading is charged. The exponent
 * and threshold are pinned in `constants.ts` with their Repex citation.
 */
export function otuForSegment(ppo2: number, minutes: number): number {
  if (!Number.isFinite(ppo2) || !Number.isFinite(minutes)) {
    throw new Error(`OTU inputs must be finite (ppo2=${ppo2}, minutes=${minutes})`)
  }
  if (minutes <= 0) return 0
  if (ppo2 <= OTU_THRESHOLD_PPO2) return 0
  return minutes * Math.pow((ppo2 - OTU_THRESHOLD_PPO2) / OTU_THRESHOLD_PPO2, OTU_EXPONENT)
}

/**
 * CNS% accumulated breathing at a PPO2 for a duration.
 *
 * Delegates to the Phase 1 NOAA module, which interpolates the limit linearly
 * between tabulated PPO2 values.
 */
export function cnsForSegment(ppo2: number, minutes: number): { percent: number; overLimit: boolean } {
  if (minutes <= 0) return { percent: 0, overLimit: false }
  const result = calculateCNS(ppo2, minutes)
  return { percent: result.percent ?? 0, overLimit: result.overLimit }
}

/** Oxygen exposure contributed by one schedule segment. */
export function segmentOxygen(segment: ScheduleSegment): SegmentOxygen {
  const minutes = (segment.endSec - segment.startSec) / SECONDS_PER_MINUTE
  const ppo2 = segment.telemetry.averagePpo2
  const cns = cnsForSegment(ppo2, minutes)
  return {
    cnsPercent: cns.percent,
    otu: otuForSegment(ppo2, minutes),
    ppo2,
    overLimit: cns.overLimit,
  }
}

/**
 * Total oxygen exposure over a schedule.
 *
 * @param segments - The runtime table.
 * @param carriedCns - CNS% already on the clock (repetitive dives).
 * @param carriedOtu - OTU already accumulated today.
 */
export function accumulateOxygen(
  segments: readonly ScheduleSegment[],
  carriedCns = 0,
  carriedOtu = 0
): OxygenExposure & { perSegment: readonly SegmentOxygen[] } {
  let cnsPercent = carriedCns
  let otu = carriedOtu
  let overLimit = false
  const perSegment: SegmentOxygen[] = []

  for (const segment of segments) {
    const contribution = segmentOxygen(segment)
    perSegment.push(contribution)
    cnsPercent += contribution.cnsPercent
    otu += contribution.otu
    if (contribution.overLimit) overLimit = true
  }

  return {
    // One decimal is all the underlying table justifies.
    cnsPercent: Math.round(cnsPercent * 10) / 10,
    cnsOverLimit: overLimit,
    otu: Math.round(otu * 10) / 10,
    perSegment,
  }
}

/**
 * CNS% remaining after a surface interval.
 *
 * CNS decays with a 90-minute half-time. This is a modelling convention used
 * by Shearwater and Subsurface rather than a measured constant — NOAA
 * publishes no decay curve — so it is documented as such and pinned in
 * `constants.ts`.
 */
export function decayCNS(cnsPercent: number, surfaceIntervalMinutes: number): number {
  if (!Number.isFinite(cnsPercent) || cnsPercent < 0) {
    throw new Error(`CNS% must be finite and non-negative (got ${cnsPercent})`)
  }
  if (!Number.isFinite(surfaceIntervalMinutes) || surfaceIntervalMinutes < 0) {
    throw new Error(`Surface interval must be finite and non-negative (got ${surfaceIntervalMinutes})`)
  }
  const decayed = cnsPercent * Math.pow(0.5, surfaceIntervalMinutes / CNS_HALF_TIME_MINUTES)
  return Math.round(decayed * 10) / 10
}

/**
 * OTU does NOT decay across a surface interval the way CNS does.
 *
 * Pulmonary loading is tracked as a daily and multi-day total in Repex, with
 * recovery measured in days rather than the hours between two dives. This
 * function exists to make that explicit at the call site rather than leaving a
 * reader to wonder whether the omission was an oversight.
 */
export function carryOtuAcrossSurfaceInterval(otu: number): number {
  return otu
}

/** Severity of an oxygen exposure advisory. */
export type OxygenAdvisoryLevel = 'ok' | 'caution' | 'warning'

export interface OxygenAdvisory {
  readonly level: OxygenAdvisoryLevel
  readonly message: string
}

/**
 * Advisories for an exposure. Thresholds are the conventional ones: CNS 80% is
 * the usual planning caution and 100% the limit; OTU 300 is the Repex
 * single-day figure.
 */
export function oxygenAdvisories(exposure: OxygenExposure): OxygenAdvisory[] {
  const advisories: OxygenAdvisory[] = []

  if (exposure.cnsOverLimit) {
    advisories.push({
      level: 'warning',
      message: `Part of this dive is breathed above PPO2 ${CNS_TABLE_MAX_PPO2} bar, beyond the NOAA exposure table. CNS loading cannot be quantified and is certainly excessive.`,
    })
  }

  if (exposure.cnsPercent >= 100) {
    advisories.push({
      level: 'warning',
      message: `CNS oxygen loading reaches ${exposure.cnsPercent}% of the NOAA single-exposure limit. Reduce PPO2 or shorten the exposure.`,
    })
  } else if (exposure.cnsPercent >= 80) {
    advisories.push({
      level: 'caution',
      message: `CNS oxygen loading reaches ${exposure.cnsPercent}%, approaching the NOAA single-exposure limit.`,
    })
  }

  if (exposure.otu >= OTU_DAILY_LIMIT) {
    advisories.push({
      level: 'warning',
      message: `Pulmonary oxygen exposure is ${exposure.otu} OTU, at or above the ${OTU_DAILY_LIMIT} OTU single-day Repex guideline.`,
    })
  } else if (exposure.otu >= OTU_DAILY_LIMIT * 0.8) {
    advisories.push({
      level: 'caution',
      message: `Pulmonary oxygen exposure is ${exposure.otu} OTU, approaching the ${OTU_DAILY_LIMIT} OTU single-day guideline.`,
    })
  }

  return advisories
}

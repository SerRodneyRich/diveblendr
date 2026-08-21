/**
 * CNS oxygen toxicity clock (single-exposure).
 *
 * F2 fix. The previous table in `src/utils/endModCalculations.ts` used banded
 * lookups with several wrong limits — most severely, everything from PPO2 1.25
 * upward was assigned 45 minutes, so a 30-minute exposure at 1.3 bar reported
 * 67% CNS instead of the correct ~17%. The bands also left gaps (PPO2 0.645
 * matched no band and returned null), and the result was rounded to an integer.
 *
 * SOURCE OF THE VALUES BELOW
 * --------------------------
 * NOAA Diving Manual, October 1991 (3rd ed.), oxygen exposure limits table.
 * The 4th, 5th and 6th (2017) editions reprint this same table unchanged, so it
 * is commonly cited as "NOAA 4th ed." The values were verified against the
 * table reproduced verbatim as Table 1 of:
 *
 *   Hoyt JT, Murphy FG, Pollock NW, Kernagis D, Bird N, Menduno M, Bright J,
 *   Mitchell SJ. "Revised guideline for central nervous system oxygen toxicity
 *   exposure limits when using an inspired PO2 of 1.3 atmospheres."
 *   Diving and Hyperbaric Medicine 2025;55(3):262-270.
 *   DOI 10.28920/dhm55.3.262-270 · PMID 40986922
 *
 * KNOWN PENDING REVISION (deliberately not applied)
 * -------------------------------------------------
 * The 2025 NOAA-convened workshop above revised the PPO2 1.3 atm row only,
 * from 180 min single exposure to up to 240 min working followed by up to
 * 240 min resting decompression. That revision is conditional on the diver's
 * activity state, which a single scalar per PPO2 cannot express, and adopting
 * only the 240 figure would be less conservative than the published table for
 * working dives. This module therefore keeps the 1991/2017 value of 180 min.
 *
 * The discontinuity at 1.6 bar (45 min, against 120 min at 1.5) is genuine and
 * appears in the source table. Per Vann and Hamilton, quoted in the guideline
 * above, the limits "were based on best judgement from extensive experience,
 * not on the statistical analysis of quantitative data"; substantial US Navy
 * experimental data existed at PPO2 >= 1.6 atm while the lower values are
 * largely judgement, which is where the step comes from.
 *
 * INTERPOLATION
 * -------------
 * Between tabulated points the *limit* is interpolated linearly, which is the
 * standard implementation (and what Shearwater documents for its CNS clock).
 * This makes CNS% continuous in PPO2 rather than stepping at band edges.
 */

/** A single row of the NOAA oxygen exposure table. */
export interface CNSLimitRow {
  /** Inspired PPO2 in bar (the source tabulates atm; 1 atm ≈ 1.01325 bar and
   *  the diving convention treats them interchangeably here). */
  ppo2: number
  /** Maximum single-exposure duration in minutes. */
  singleExposureMinutes: number
  /** Maximum total duration per 24 hours in minutes. */
  perDayMinutes: number
}

/**
 * NOAA oxygen exposure limits, ascending by PPO2.
 * Source: NOAA Diving Manual 1991 table (reprinted through the 6th ed., 2017).
 */
export const NOAA_CNS_LIMITS: readonly CNSLimitRow[] = [
  { ppo2: 0.6, singleExposureMinutes: 720, perDayMinutes: 720 },
  { ppo2: 0.7, singleExposureMinutes: 570, perDayMinutes: 570 },
  { ppo2: 0.8, singleExposureMinutes: 450, perDayMinutes: 450 },
  { ppo2: 0.9, singleExposureMinutes: 360, perDayMinutes: 360 },
  { ppo2: 1.0, singleExposureMinutes: 300, perDayMinutes: 300 },
  { ppo2: 1.1, singleExposureMinutes: 240, perDayMinutes: 270 },
  { ppo2: 1.2, singleExposureMinutes: 210, perDayMinutes: 240 },
  { ppo2: 1.3, singleExposureMinutes: 180, perDayMinutes: 210 },
  { ppo2: 1.4, singleExposureMinutes: 150, perDayMinutes: 180 },
  { ppo2: 1.5, singleExposureMinutes: 120, perDayMinutes: 180 },
  { ppo2: 1.6, singleExposureMinutes: 45, perDayMinutes: 150 },
] as const

/**
 * PPO2 at or below which oxygen exposure is not tracked at all.
 * The NOAA table starts at 0.6 bar; below 0.5 bar CNS loading is conventionally
 * treated as nil.
 */
export const CNS_TRACKING_FLOOR_PPO2 = 0.5

/** Lowest tabulated PPO2. */
export const CNS_TABLE_MIN_PPO2 = NOAA_CNS_LIMITS[0].ppo2

/** Highest tabulated PPO2. Above this the table gives no guidance. */
export const CNS_TABLE_MAX_PPO2 = NOAA_CNS_LIMITS[NOAA_CNS_LIMITS.length - 1].ppo2

/** Result of a CNS calculation. */
export interface CNSResult {
  /**
   * CNS loading as a percentage of the single-exposure limit, to one decimal.
   * `null` only when the exposure is beyond the table's guidance
   * (`overLimit === true`).
   */
  percent: number | null
  /** True when PPO2 exceeds the highest tabulated value (1.6 bar). */
  overLimit: boolean
  /**
   * The interpolated single-exposure limit in minutes at this PPO2, or `null`
   * when `overLimit` is true.
   */
  limitMinutes: number | null
}

/**
 * The single-exposure limit in minutes at an arbitrary PPO2, linearly
 * interpolated between tabulated points.
 *
 * @returns Minutes, `Infinity` below the tracking floor (no limit applies), or
 *   `null` above the highest tabulated PPO2 (outside NOAA guidance).
 */
export function cnsLimitMinutes(ppo2: number): number | null {
  if (!Number.isFinite(ppo2)) {
    throw new Error(`PPO2 must be a finite number (got ${ppo2})`)
  }
  if (ppo2 <= CNS_TRACKING_FLOOR_PPO2) return Infinity
  if (ppo2 > CNS_TABLE_MAX_PPO2) return null

  // Between the tracking floor and the first tabulated point, interpolate from
  // "no limit is tracked" toward the 0.6 bar limit by holding the 0.6 value.
  // Holding is the conservative choice: it charges CNS at the 0.6 bar rate
  // rather than fading it to zero.
  if (ppo2 <= CNS_TABLE_MIN_PPO2) return NOAA_CNS_LIMITS[0].singleExposureMinutes

  for (let i = 0; i < NOAA_CNS_LIMITS.length - 1; i++) {
    const lo = NOAA_CNS_LIMITS[i]
    const hi = NOAA_CNS_LIMITS[i + 1]
    if (ppo2 >= lo.ppo2 && ppo2 <= hi.ppo2) {
      const t = (ppo2 - lo.ppo2) / (hi.ppo2 - lo.ppo2)
      return (
        lo.singleExposureMinutes + t * (hi.singleExposureMinutes - lo.singleExposureMinutes)
      )
    }
  }

  // Unreachable for finite ppo2 in range, but keeps the function total.
  return NOAA_CNS_LIMITS[NOAA_CNS_LIMITS.length - 1].singleExposureMinutes
}

/**
 * CNS loading for a single continuous exposure.
 *
 *   CNS% = (time at PPO2 / single-exposure limit at that PPO2) × 100
 *
 * @param ppo2 - Inspired partial pressure of oxygen, in bar.
 * @param minutes - Duration of the exposure, in minutes.
 */
export function calculateCNS(ppo2: number, minutes: number): CNSResult {
  if (!Number.isFinite(ppo2)) {
    throw new Error(`PPO2 must be a finite number (got ${ppo2})`)
  }
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error(`Exposure time must be a finite non-negative number (got ${minutes})`)
  }

  if (ppo2 > CNS_TABLE_MAX_PPO2) {
    return { percent: null, overLimit: true, limitMinutes: null }
  }

  const limit = cnsLimitMinutes(ppo2)

  if (limit === null) {
    return { percent: null, overLimit: true, limitMinutes: null }
  }
  if (limit === Infinity) {
    return { percent: 0, overLimit: false, limitMinutes: Infinity }
  }

  const percent = (minutes / limit) * 100
  return {
    percent: Math.round(percent * 10) / 10,
    overLimit: false,
    limitMinutes: Math.round(limit * 10) / 10,
  }
}

/**
 * Total CNS loading across a sequence of exposure segments, summed additively
 * as the NOAA clock prescribes.
 *
 * If any segment is beyond the table, the whole result is flagged `overLimit`
 * and `percent` reports the sum of the segments that could be evaluated, so the
 * UI can say "at least X%, and one segment exceeds NOAA limits".
 */
export function calculateCNSTotal(
  segments: ReadonlyArray<{ ppo2: number; minutes: number }>
): CNSResult {
  let total = 0
  let overLimit = false

  for (const segment of segments) {
    const result = calculateCNS(segment.ppo2, segment.minutes)
    if (result.overLimit) {
      overLimit = true
      continue
    }
    total += result.percent ?? 0
  }

  return {
    percent: Math.round(total * 10) / 10,
    overLimit,
    limitMinutes: null,
  }
}

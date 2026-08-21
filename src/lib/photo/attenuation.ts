/**
 * Inverting underwater attenuation: from (depth, distance, water type) to
 * per-channel gains.
 *
 * THE PATH LIGHT ACTUALLY TAKES
 * -----------------------------
 * Light reaching the sensor from a subject has travelled two legs, and they are
 * not interchangeable:
 *
 *   1. **Downwelling leg** — sunlight from the surface down to the subject.
 *      Path length is the subject's *depth*. This is what removes red from the
 *      light illuminating the subject in the first place.
 *   2. **Return leg** — light reflected off the subject to the camera. Path
 *      length is the *distance to subject*, which is horizontal (or at least
 *      not vertical) and typically 0.5–5 m.
 *
 * Total optical path is therefore `depth + distance`, and the observed radiance
 * is attenuated by `exp(-β_c · (depth + distance))` per channel. The previous
 * implementation modelled neither leg: it applied a constant per-channel
 * multiplier from a hand-typed table, which is the correct inverse for exactly
 * one path length and wrong everywhere else.
 *
 * Note the two legs use the same β here. Strictly, the downwelling leg should
 * use the *diffuse* attenuation coefficient Kd and the return leg the *beam*
 * attenuation c; these differ because scattered light continues to propagate
 * downward but not necessarily toward the lens. Using a single β is the
 * standard simplification in the single-image restoration literature (Berman et
 * al.; Akkaynak & Treibitz) and is well within the accuracy this tool claims.
 *
 * WHY THE GAIN MUST BE CAPPED
 * ---------------------------
 * The naive inverse is `gain_c = 1 / exp(-β_c · x) = exp(β_c · x)`. That grows
 * without bound. In clear oceanic water (β_R ≈ 0.35) at 30 m the red gain would
 * be exp(10.5) ≈ 36,000. There is no red signal left to recover at that point —
 * only sensor noise and JPEG artefacts, which would be amplified 36,000-fold.
 *
 * So the inverse is capped. Past the cap the correction is honestly incomplete,
 * and `capped` is returned so the UI can say so instead of silently handing back
 * a noise field. This is the same reasoning as the rest of the app's safety
 * rules: state the limit, do not pretend past it.
 *
 * A second, physical reason the raw inverse overshoots: the camera has already
 * applied its own auto white balance. A GoPro underwater pushes red hard before
 * the file is written, so some fraction of the loss is already compensated. We
 * cannot know how much, which is why the automatic image-driven estimate in
 * `autoWhiteBalance.ts` is the default path and this physical model is an
 * optional prior layered on top.
 *
 * SOURCES
 * -------
 * - Beer–Lambert law; see `water.ts` for the Jerlov/β citation chain.
 * - Akkaynak, D. et al. "What Is the Space of Attenuation Coefficients in
 *   Underwater Computer Vision?", CVPR 2017 — range-dependence of wideband β.
 * - Akkaynak, D. & Treibitz, T. "A Revised Underwater Image Formation Model",
 *   CVPR 2018; "Sea-thru", CVPR 2019 — the full model this one deliberately
 *   simplifies (Sea-thru needs a per-pixel range map, which a single photo does
 *   not carry).
 */

import {
  getWaterType,
  channelTransmission,
  type AttenuationCoefficients,
  type WaterTypeId,
} from './water'

/**
 * Maximum per-channel gain.
 *
 * ESTIMATED, not sourced. Chosen so that an 8-bit channel sitting at the noise
 * floor (value ~4/255) cannot be amplified past mid-grey. Beyond roughly this
 * much amplification, consumer JPEG data in the red channel is dominated by
 * quantisation and chroma-subsampling artefacts rather than scene content.
 */
export const MAX_CHANNEL_GAIN = 12

/**
 * The gain past which correcting red stops being worth doing.
 *
 * ESTIMATED, not sourced. This is a signal-to-noise judgement, not a physical
 * extinction: in clear oceanic water (Jerlov IB) red transmits
 * `exp(-0.37 · path)`, so an 8x gain corresponds to a ~5.6 m path where about
 * 12% of the red still reaches the sensor. There is red left — but by then it
 * is a small, heavily quantised signal in an 8-bit channel that JPEG has also
 * chroma-subsampled, and amplifying it eightfold amplifies its noise and its
 * compression artefacts just as much.
 *
 * The demand runs away fast past that:
 *
 *     path 5 m   ->      4.8x     (~16% red transmitted)
 *     path 8 m   ->     12.4x     (~5%)
 *     path 20 m  ->    545x       (~0.2%)
 *     path 48 m  ->  4,300,000x   (~2e-6 %)
 *
 * At the deep end the claim really is extinction — every 8-bit red value is
 * quantisation noise, and correcting it is invention. That is what produced
 * radioactive green kelp and orange rock on a real 47 m photograph. The
 * threshold sits well short of there deliberately: it stops while the result
 * is still merely bad rather than fabricated.
 *
 * Beyond this the model stops scaling with depth and says so. A photograph
 * taken that deep on ambient light needs a strobe, not an algorithm.
 */
export const RECOVERABLE_RED_GAIN = 8

export interface AttenuationInput {
  /** Subject depth in metres. */
  depth: number
  /** Camera-to-subject distance in metres. */
  distance: number
  waterType: WaterTypeId
  /**
   * How much of the physical correction to apply, 0–1. Below 1 the gains are
   * interpolated toward unity in log space, which keeps the *ratios* between
   * channels physically meaningful rather than just fading toward grey.
   */
  strength?: number
}

export interface ChannelGains extends AttenuationCoefficients {
  /** True if any channel hit `MAX_CHANNEL_GAIN` and the correction is partial. */
  capped: boolean
  /**
   * True when the path is long enough that ambient red is unrecoverable — the
   * correction shown is the most the data supports, and going deeper changes
   * nothing because there is nothing left to change.
   */
  beyondRecovery: boolean
}

/**
 * Per-channel gains that invert attenuation over the optical path.
 *
 * The gains are normalised so the least-attenuated channel has gain 1. Without
 * that, the result would also be an exposure boost of several stops — the model
 * would brighten the whole image rather than only correcting its colour, and
 * brightness is the user's decision, not the model's.
 */
export function attenuationGains(input: AttenuationInput): ChannelGains {
  const { depth, distance, waterType } = input
  const strength = input.strength ?? 1

  const beta = getWaterType(waterType).beta
  // Both legs of the path. Negative inputs are meaningless; clamp at zero.
  const pathLength = Math.max(0, depth) + Math.max(0, distance)

  const t = channelTransmission(beta, pathLength)

  // Normalise to the best-surviving channel so this is a colour correction and
  // not an exposure change. In oceanic water that is blue; in green coastal
  // water it is green — which is exactly the behaviour the old fixed
  // "boost red / cut blue and green" recipe could not express.
  const best = Math.max(t.r, t.g, t.b)

  const raw = {
    r: best / t.r,
    g: best / t.g,
    b: best / t.b,
  }

  const s = Math.max(0, Math.min(1, strength))

  // Interpolate in log space: gain^strength. Keeps channel ratios consistent
  // at partial strength, where linear interpolation would distort hue.
  const r = Math.pow(raw.r, s)
  const g = Math.pow(raw.g, s)
  const b = Math.pow(raw.b, s)

  // CAP ALL THREE TOGETHER, NOT ONE AT A TIME.
  //
  // Clamping each channel independently truncated red at the ceiling while
  // green and blue passed through untouched, which does not limit the
  // correction — it changes its direction. Red saturated at 10 m and never
  // moved again, while green kept climbing (1.40x at 10 m, 4.08x at 47 m), so
  // every metre deeper skewed the result further toward green. A real 47 m
  // kelp photograph came back with radioactive green weed and orange rock,
  // and the deeper the dive the worse it got — the opposite of what a cap is
  // supposed to do.
  //
  // Compressing in log space raises every gain to a common exponent < 1. That
  // pulls the largest down to the ceiling while leaving the smallest at
  // exactly 1 (1^k == 1), so the correction keeps its hue and only loses
  // magnitude. This mirrors what `computeGains` already does to the combined
  // gain; doing it here too means the model is never the thing that breaks
  // the ratio.
  //
  // The ceiling is `RECOVERABLE_RED_GAIN`, not `MAX_CHANNEL_GAIN`. The latter
  // is where amplified noise stops being data; the former is where ambient red
  // stops being *present*. Correcting between the two is inventing colour, and
  // it is what made a 47 m frame lurid. See the constant for the numbers.
  return capGainsToRecoverable(r, g, b)
}

/**
 * Holds a set of channel gains at what the data can actually support.
 *
 * Compresses in log space so the *ratio* between channels is preserved — a
 * plain clamp would flatten the colour correction into a brightness change by
 * pinning the largest channel while the others kept their raw values.
 *
 * The ceiling is `RECOVERABLE_RED_GAIN`, not `MAX_CHANNEL_GAIN`: the latter is
 * where amplified noise stops being data, the former where correcting red stops
 * being worth doing at all. See that constant for the numbers.
 *
 * Shared by the physical model and the image-driven white balance. It was
 * written out twice, identically, in both — the same safety-relevant arithmetic
 * in two places to keep in step.
 */
export function capGainsToRecoverable(
  r: number,
  g: number,
  b: number
): { r: number; g: number; b: number; capped: boolean; beyondRecovery: boolean } {
  const largest = Math.max(r, g, b)
  if (largest <= RECOVERABLE_RED_GAIN) {
    return { r, g, b, capped: false, beyondRecovery: false }
  }

  const k = Math.log(RECOVERABLE_RED_GAIN) / Math.log(largest)
  let cr = Math.pow(r, k)
  let cg = Math.pow(g, k)
  let cb = Math.pow(b, k)

  // `pow` round-trips to 7.999999999999997 rather than exactly the ceiling.
  // Snap the channel that defined the ceiling so callers can compare against
  // the constant, and so a "did it cap?" test is not chasing float dust.
  if (cr >= cg && cr >= cb) cr = RECOVERABLE_RED_GAIN
  else if (cg >= cb) cg = RECOVERABLE_RED_GAIN
  else cb = RECOVERABLE_RED_GAIN

  return {
    r: cr,
    g: cg,
    b: cb,
    capped: true,
    // Well past the ceiling is a different message from "we trimmed this
    // slightly" — see PhotoEditor's two banners.
    beyondRecovery: largest > RECOVERABLE_RED_GAIN * 4,
  }
}

/**
 * The optical path length the model uses, exposed so the UI can explain itself.
 */
export function opticalPathLength(depth: number, distance: number): number {
  return Math.max(0, depth) + Math.max(0, distance)
}

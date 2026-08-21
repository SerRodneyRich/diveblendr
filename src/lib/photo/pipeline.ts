/**
 * The correction pipeline: an ordered set of operations over an RGBA buffer.
 *
 * Pure and framework-free — it takes a byte buffer and mutates it. No canvas, no
 * DOM, no React. That is what makes it testable, and what lets it run unchanged
 * inside a Web Worker.
 *
 * ORDER MATTERS
 * -------------
 * 1. **Decode to linear light.** Everything physical happens here.
 * 2. **White balance** (auto estimate and/or physical attenuation gains).
 *    Colour first, because the later steps depend on the corrected hue.
 * 3. **Exposure / black point.** Fixes the flat, hazy contrast of a photo
 *    taken through metres of scattering water.
 * 4. **Saturation / vibrance.** Only after the cast is gone. Saturating first
 *    would amplify the blue cast, which is what the old pipeline did.
 * 5. **Highlight roll-off, then encode back to sRGB.**
 *
 * The old pipeline ran red-boost → blue/green cut → contrast → saturation, all
 * on gamma-encoded bytes with hard clipping between stages, so each stage
 * compounded the previous one's clipping errors.
 */

import {
  SRGB_TO_LINEAR_LUT,
  linearToSrgb,
  luminance,
  clamp01,
  clamp,
  rolloff,
} from './color'
import { attenuationGains, capGainsToRecoverable, type ChannelGains } from './attenuation'
import {
  estimateWhiteBalance,
  scaleWhiteBalance,
  type WhiteBalanceEstimate,
} from './autoWhiteBalance'
import type { WaterTypeId } from './water'

export interface CorrectionSettings {
  /** Apply the image-driven white-balance estimate. */
  autoWhiteBalance: boolean
  /** Strength of the auto white balance, 0–1. */
  autoStrength: number

  /** Layer the physical depth/water-type model on top of the auto estimate. */
  usePhysicalModel: boolean
  depth: number
  distance: number
  waterType: WaterTypeId
  /** Strength of the physical model, 0–1. */
  physicalStrength: number

  /** Exposure in stops. 0 = unchanged. */
  exposure: number
  /** Contrast, -1 to 1. 0 = unchanged. */
  contrast: number
  /** Global saturation, -1 to 1. 0 = unchanged. */
  saturation: number
  /**
   * Vibrance, -1 to 1. Saturates muted colours more than already-saturated
   * ones, which protects skin tones and already-vivid coral from going neon.
   */
  vibrance: number
  /** Black point lift/cut, -0.1 to 0.1. Removes the milky veil of backscatter. */
  blackPoint: number
}

export const DEFAULT_SETTINGS: CorrectionSettings = {
  autoWhiteBalance: true,
  autoStrength: 0.85,
  usePhysicalModel: false,
  depth: 10,
  distance: 1.5,
  waterType: 'IB',
  physicalStrength: 0.6,
  exposure: 0,
  contrast: 0.08,
  saturation: 0,
  vibrance: 0.15,
  blackPoint: 0,
}

export interface CorrectionAnalysis {
  /** The auto estimate that was used, if any. */
  whiteBalance?: WhiteBalanceEstimate
  /** The physical gains that were used, if any. */
  physical?: ChannelGains
  /** Combined per-channel gain actually applied. */
  appliedGain: { r: number; g: number; b: number }
  /** True if the physical model hit its gain cap — correction is partial. */
  capped: boolean
  /**
   * The photograph is beyond what colour correction can recover: at this path
   * length essentially no ambient red reached the sensor, so what is shown is
   * the most the data supports. Deeper than this needs a strobe.
   */
  beyondRecovery?: boolean
}

/**
 * Compute the combined per-channel gains for a set of settings.
 *
 * Separated from the pixel loop so the UI can show what the model decided (and
 * so it can be unit-tested) without processing an image.
 */
export function computeGains(
  settings: CorrectionSettings,
  estimate?: WhiteBalanceEstimate
): CorrectionAnalysis {
  let r = 1
  let g = 1
  let b = 1
  let capped = false
  let beyondRecovery = false

  const analysis: CorrectionAnalysis = {
    appliedGain: { r: 1, g: 1, b: 1 },
    capped: false,
  }

  if (settings.autoWhiteBalance && estimate) {
    const scaled = scaleWhiteBalance(estimate, settings.autoStrength)
    r *= scaled.r
    g *= scaled.g
    b *= scaled.b
    analysis.whiteBalance = scaled
  }

  if (settings.usePhysicalModel) {
    const phys = attenuationGains({
      depth: settings.depth,
      distance: settings.distance,
      waterType: settings.waterType,
      strength: settings.physicalStrength,
    })
    r *= phys.r
    g *= phys.g
    b *= phys.b
    capped = phys.capped
    beyondRecovery = phys.beyondRecovery
    analysis.physical = phys
  }

  // Re-normalise against the *smallest* gain, so the least-attenuated channel
  // sits at exactly 1 and the starved channels are raised toward it.
  //
  // Dividing by the largest gain instead would be a sign error with a very
  // convincing disguise: the channel ratios stay correct, so the hue shift
  // still looks right, but every channel lands at or below 1 and the image is
  // darkened rather than colour-corrected. A blue-cast frame came back with red
  // unchanged and green and blue crushed to 14% and 5%.
  const min = Math.min(r, g, b)
  if (min > 0) {
    r /= min
    g /= min
    b /= min
  }

  // Cap the COMBINED gain, not just the physical model's contribution.
  //
  // `attenuationGains` caps its own output, but the auto white-balance estimate
  // is unbounded: a frame with almost no red left produces a gain in the tens
  // regardless of what the physical model does. Verified on a real photo whose
  // red channel sat near 20/255 — the estimator alone asked for 25x, which
  // amplifies the red noise floor exactly as if there were no cap at all.
  //
  // Compression is in LOG space: every gain is raised to a common exponent < 1.
  // That pulls the largest gain down to the cap while leaving the smallest at
  // exactly 1 (since 1^k == 1), so the correction keeps its direction and the
  // normalisation invariant survives.
  //
  // Scaling linearly instead does not work: dividing all three by the same
  // factor and then renormalising against the minimum returns the exact
  // original values, silently cancelling the cap.
  //
  // The auto estimator is unbounded and on a deep frame asked for 31x on its
  // own, so the same ceiling applies to the image-driven path as to the
  // physical model — one shared implementation, in attenuation.ts.
  const held = capGainsToRecoverable(r, g, b)

  analysis.appliedGain = { r: held.r, g: held.g, b: held.b }
  analysis.capped = capped || held.capped
  analysis.beyondRecovery = beyondRecovery || held.beyondRecovery
  return analysis
}

export interface ProcessOptions {
  /**
   * Pre-computed white-balance estimate. If omitted and `autoWhiteBalance` is
   * on, it is computed from this buffer. Passing it in lets the caller estimate
   * once from a downsampled proxy and reuse it for the full-resolution pass —
   * the estimate is a global statistic, so it must not be recomputed per tile.
   */
  estimate?: WhiteBalanceEstimate
  /** Called with 0–1 as rows are processed. */
  onProgress?: (fraction: number) => void
}

/**
 * Apply a correction to an RGBA buffer, in place.
 *
 * @returns What the model decided, for display.
 */
export function processBuffer(
  data: Uint8ClampedArray | Uint8Array,
  settings: CorrectionSettings,
  options: ProcessOptions = {}
): CorrectionAnalysis {
  const estimate =
    options.estimate ??
    (settings.autoWhiteBalance
      ? estimateWhiteBalance(data, {
          // A global statistic does not need every pixel of a 12 MP image.
          stride: data.length > 4_000_000 ? 7 : 1,
        })
      : undefined)

  const analysis = computeGains(settings, estimate)
  const { r: gr, g: gg, b: gb } = analysis.appliedGain

  const exposureScale = Math.pow(2, settings.exposure)
  const contrast = clamp(settings.contrast, -1, 1)
  const saturation = clamp(settings.saturation, -1, 1)
  const vibrance = clamp(settings.vibrance, -1, 1)
  const blackPoint = clamp(settings.blackPoint, -0.1, 0.1)

  // Contrast pivots around mid-grey in linear light (0.18, the standard scene
  // reference) rather than 0.5, which is a gamma-encoded midpoint and would
  // darken the image as a side effect of adding contrast.
  const PIVOT = 0.18
  const contrastFactor = 1 + contrast

  const saturationFactor = 1 + saturation
  const len = data.length

  for (let i = 0; i < len; i += 4) {
    // 1. Decode to linear light.
    let r = SRGB_TO_LINEAR_LUT[data[i]]
    let g = SRGB_TO_LINEAR_LUT[data[i + 1]]
    let b = SRGB_TO_LINEAR_LUT[data[i + 2]]

    // 2. White balance.
    r *= gr
    g *= gg
    b *= gb

    // 3. Black point, then exposure, then contrast.
    if (blackPoint !== 0) {
      const scale = 1 / Math.max(0.05, 1 - blackPoint)
      r = (r - blackPoint) * scale
      g = (g - blackPoint) * scale
      b = (b - blackPoint) * scale
    }

    if (exposureScale !== 1) {
      r *= exposureScale
      g *= exposureScale
      b *= exposureScale
    }

    if (contrast !== 0) {
      r = PIVOT + (r - PIVOT) * contrastFactor
      g = PIVOT + (g - PIVOT) * contrastFactor
      b = PIVOT + (b - PIVOT) * contrastFactor
    }

    // Negative values are not meaningful light and break the later maths.
    if (r < 0) r = 0
    if (g < 0) g = 0
    if (b < 0) b = 0

    // 4. Saturation and vibrance, around the pixel's own luminance.
    if (saturation !== 0 || vibrance !== 0) {
      const lum = luminance(r, g, b)

      let factor = saturationFactor
      if (vibrance !== 0) {
        // Current saturation, 0 (grey) to 1 (fully saturated). Muted pixels get
        // the most vibrance; already-vivid ones are largely left alone.
        const maxC = Math.max(r, g, b)
        const minC = Math.min(r, g, b)
        const currentSat = maxC > 0 ? (maxC - minC) / maxC : 0
        factor += vibrance * (1 - currentSat)
      }

      r = lum + (r - lum) * factor
      g = lum + (g - lum) * factor
      b = lum + (b - lum) * factor

      if (r < 0) r = 0
      if (g < 0) g = 0
      if (b < 0) b = 0
    }

    // 5. Soft shoulder instead of a hard clip, then re-encode.
    data[i] = Math.round(clamp01(linearToSrgb(rolloff(r))) * 255)
    data[i + 1] = Math.round(clamp01(linearToSrgb(rolloff(g))) * 255)
    data[i + 2] = Math.round(clamp01(linearToSrgb(rolloff(b))) * 255)
    // Alpha (data[i+3]) is deliberately untouched.
  }

  options.onProgress?.(1)
  return analysis
}

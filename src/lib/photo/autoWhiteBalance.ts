/**
 * Automatic white-balance estimation from the image itself.
 *
 * WHY THIS IS THE DEFAULT PATH
 * ----------------------------
 * The physical model in `attenuation.ts` needs three numbers the diver may not
 * remember and cannot recover from a JPEG: depth, distance to subject, and
 * water type. It also cannot know how much correction the camera's own auto
 * white balance already applied before writing the file.
 *
 * Estimating the illuminant from the pixels sidesteps all three unknowns. It is
 * the difference between "fill in a form about your dive" and "drop the photo
 * in and it looks right", which is the single biggest usability win available
 * here. The physical model then becomes an optional refinement layered on top,
 * rather than a mandatory interrogation.
 *
 * THE ESTIMATOR: SHADES OF GREY
 * -----------------------------
 * Source: Finlayson, G. D. & Trezzi, E., "Shades of Gray and Colour Constancy",
 * Proc. IS&T/SID Twelfth Color Imaging Conference, pp. 37–41, 2004.
 *
 * The family is parameterised by a Minkowski norm p:
 *
 *     e_c = ( (1/N) · Σ I_c(x)^p )^(1/p)
 *
 * and the illuminant estimate `e` is normalised and inverted to give the
 * correction. Two familiar algorithms are the endpoints of this family:
 *
 *   - **p = 1** is Grey-World (Buchsbaum, 1980): assume the average scene
 *     reflectance is achromatic. Fails badly when one colour genuinely
 *     dominates the frame — and a wall of blue water is exactly that case,
 *     which is why plain grey-world over-corrects underwater photos to muddy
 *     brown.
 *   - **p = ∞** is White-Patch / max-RGB: assume the brightest pixel is white.
 *     Fails on a single specular glint or a hot strobe pixel.
 *
 * Finlayson & Trezzi found intermediate p outperforms both. We default to
 * **p = 6**, the value they report as best-performing. It weights bright pixels
 * more than the mean without collapsing onto a single outlier — the right
 * trade-off for underwater frames, where the bright regions (sand, strobe-lit
 * subject) carry more of the true illuminant than the dominant blue background.
 *
 * WHY THE ESTIMATE IS DAMPED
 * --------------------------
 * A full inversion of the estimated illuminant assumes the scene really is
 * achromatic on average. Underwater it is not — the water itself is genuinely
 * blue, and a diver does not want that removed entirely. Fully neutralising it
 * produces the grey, lifeless look typical of naive auto-correction. So the
 * estimate is applied at a strength the caller chooses, and the default leaves
 * some of the water's character intact.
 *
 * All computation is in LINEAR LIGHT. Running the norm over gamma-encoded sRGB
 * (as the old `grayWorldCorrection` did) weights the statistics incorrectly,
 * because the encoding is non-linear in exactly the range that dominates the sum.
 */

import { SRGB_TO_LINEAR_LUT, clamp } from './color'

export interface WhiteBalanceEstimate {
  /** Per-channel gains, normalised so the largest is 1 (never brightens). */
  r: number
  g: number
  b: number
  /**
   * How strong a colour cast was found, 0 = neutral. Ratio of largest to
   * smallest channel response. Lets the UI say "this photo barely needs it".
   */
  castStrength: number
}

export interface WhiteBalanceOptions {
  /** Minkowski norm. 1 = grey-world, large = white-patch. Default 6. */
  p?: number
  /**
   * Ignore near-black pixels, which are dominated by noise and carry no
   * illuminant information. Threshold is on linear luminance. Default 0.002.
   */
  blackPoint?: number
  /**
   * Ignore clipped pixels. A blown highlight has lost its chromaticity, so
   * including it drags the estimate toward neutral. Default 250 (of 255).
   */
  clipPoint?: number
  /**
   * Sample stride in pixels. The estimate is a global statistic, so sampling
   * every Nth pixel is statistically equivalent and far cheaper on a 12 MP
   * image. Default 1 (every pixel); the pipeline raises it for large images.
   */
  stride?: number
}

/**
 * Estimate the illuminant of an RGBA buffer and return correcting gains.
 *
 * @param data RGBA bytes, as from `ImageData.data`.
 */
export function estimateWhiteBalance(
  data: Uint8ClampedArray | Uint8Array,
  options: WhiteBalanceOptions = {}
): WhiteBalanceEstimate {
  const p = options.p ?? 6
  const blackPoint = options.blackPoint ?? 0.002
  const clipPoint = options.clipPoint ?? 250
  const stride = Math.max(1, Math.floor(options.stride ?? 1))

  let sumR = 0
  let sumG = 0
  let sumB = 0
  let count = 0

  const step = 4 * stride

  for (let i = 0; i < data.length; i += step) {
    const r8 = data[i]
    const g8 = data[i + 1]
    const b8 = data[i + 2]

    // Skip clipped pixels — chromaticity is unrecoverable once a channel rails.
    if (r8 >= clipPoint || g8 >= clipPoint || b8 >= clipPoint) continue

    const r = SRGB_TO_LINEAR_LUT[r8]
    const g = SRGB_TO_LINEAR_LUT[g8]
    const b = SRGB_TO_LINEAR_LUT[b8]

    // Skip near-black pixels — noise, not illuminant.
    if (r + g + b < blackPoint * 3) continue

    if (p === 1) {
      sumR += r
      sumG += g
      sumB += b
    } else {
      sumR += Math.pow(r, p)
      sumG += Math.pow(g, p)
      sumB += Math.pow(b, p)
    }
    count++
  }

  // A frame with nothing usable in it (all black, or all blown) gets no
  // correction rather than a divide-by-zero.
  if (count === 0) {
    return { r: 1, g: 1, b: 1, castStrength: 0 }
  }

  const inv = 1 / count
  const eR = p === 1 ? sumR * inv : Math.pow(sumR * inv, 1 / p)
  const eG = p === 1 ? sumG * inv : Math.pow(sumG * inv, 1 / p)
  const eB = p === 1 ? sumB * inv : Math.pow(sumB * inv, 1 / p)

  const maxE = Math.max(eR, eG, eB)
  const minE = Math.min(eR, eG, eB)

  if (maxE <= 0) {
    return { r: 1, g: 1, b: 1, castStrength: 0 }
  }

  // Gain is the inverse of the illuminant response, normalised so the strongest
  // channel is left alone (gain 1) and the others are raised toward it. This
  // never brightens the image overall — a correction that also changed exposure
  // would be making a decision that belongs to the user.
  const gains = {
    r: eR > 0 ? maxE / eR : 1,
    g: eG > 0 ? maxE / eG : 1,
    b: eB > 0 ? maxE / eB : 1,
  }

  return {
    ...gains,
    castStrength: minE > 0 ? maxE / minE : 0,
  }
}

/**
 * Interpolate an estimate toward neutral.
 *
 * Interpolation is in log space (`gain^strength`) so channel *ratios* stay
 * consistent as strength varies; linear interpolation toward 1 would distort
 * hue at intermediate settings.
 *
 * @param strength 0 = no correction, 1 = full neutralisation.
 */
export function scaleWhiteBalance(
  estimate: WhiteBalanceEstimate,
  strength: number
): WhiteBalanceEstimate {
  const s = clamp(strength, 0, 1)
  return {
    r: Math.pow(estimate.r, s),
    g: Math.pow(estimate.g, s),
    b: Math.pow(estimate.b, s),
    castStrength: estimate.castStrength,
  }
}

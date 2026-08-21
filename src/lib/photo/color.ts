/**
 * Colour-space primitives for the underwater correction pipeline.
 *
 * WHY THIS EXISTS
 * ---------------
 * The previous implementation multiplied sRGB-encoded byte values directly:
 *
 *     data[i] = data[i] * (1 + redBoost / 100)
 *
 * sRGB is gamma-encoded (roughly a 2.2 power law), while Beer–Lambert
 * attenuation is linear-light physics. Scaling an encoded value by `k` scales
 * the underlying radiance by roughly `k^2.2`, so a "1.4x red boost" actually
 * applied about 2.2x — and the error varied with pixel brightness, which is why
 * strong presets tore bright pixels to magenta. Every physical operation in
 * this module's callers happens in linear light; encode/decode happen only at
 * the boundaries.
 *
 * Source: IEC 61966-2-1:1999 (sRGB). The piecewise transfer function below is
 * the standard's exact definition, not the 2.2 power-law approximation.
 */

/** sRGB → linear-light, for a single channel in [0,1]. IEC 61966-2-1. */
export function srgbToLinear(v: number): number {
  if (v <= 0.04045) return v / 12.92
  return Math.pow((v + 0.055) / 1.055, 2.4)
}

/** Linear-light → sRGB, for a single channel in [0,1]. IEC 61966-2-1. */
export function linearToSrgb(v: number): number {
  if (v <= 0.0031308) return v * 12.92
  return 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

/** Clamp to [0,1]. */
export function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

/** Clamp to an arbitrary range. */
export function clamp(v: number, min: number, max: number): number {
  if (v < min) return min
  if (v > max) return max
  return v
}

/**
 * Relative luminance of a linear-light RGB triplet.
 *
 * Rec. ITU-R BT.709 coefficients. Note these differ from the 0.299/0.587/0.114
 * of Rec. 601 used by the old code — 601's weights are intended for
 * gamma-encoded video signals, and applying them to linear light (as the
 * saturation code did) biases the grey point.
 */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * 256-entry sRGB→linear lookup table.
 *
 * The pipeline decodes every pixel of a potentially 12-megapixel image, so this
 * replaces ~36 million `Math.pow` calls per pass with array indexing. Byte
 * input means the table is exact, not an approximation.
 */
export const SRGB_TO_LINEAR_LUT: Float64Array = (() => {
  const lut = new Float64Array(256)
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i / 255)
  return lut
})()

/**
 * Soft highlight roll-off applied in linear light.
 *
 * Raising a single channel past 1.0 and hard-clipping (`Math.min(255, …)`)
 * destroys hue: the clipped channel stops growing while the others continue, so
 * a warm highlight slides toward cyan and then tears. This compresses the
 * approach to white instead, so gains above the clip point desaturate smoothly
 * rather than shifting hue.
 *
 * Below `knee` the response is exactly linear (identity), so mid-tones and
 * shadows — the bulk of the image — are untouched. Above it, the remaining
 * headroom `1 - knee` is approached asymptotically.
 *
 * This is a standard tone-mapping shoulder, chosen for behaviour rather than
 * taken from a specific paper.
 */
export function rolloff(v: number, knee = 0.8): number {
  if (v <= knee) return v
  if (knee >= 1) return Math.min(v, 1)
  const headroom = 1 - knee
  const excess = (v - knee) / headroom
  // 1 - exp(-x) approaches 1 asymptotically and has unit slope at x=0, so the
  // curve is C1-continuous with the linear segment at the knee.
  return knee + headroom * (1 - Math.exp(-excess))
}

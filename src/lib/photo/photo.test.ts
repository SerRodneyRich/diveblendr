/**
 * Tests for the underwater correction model.
 *
 * Per the repo's safety rules: expected values are **re-derived independently**
 * inside the test (from the closed-form physics), never read back from another
 * function in the module under test. Where a test asserts a physical property
 * (monotonicity, ordering, an invariant), it states which property and why it
 * must hold.
 */

import { describe, it, expect } from 'vitest'
import {
  srgbToLinear,
  linearToSrgb,
  luminance,
  rolloff,
  clamp01,
  SRGB_TO_LINEAR_LUT,
} from './color'
import {
  WATER_TYPES,
  getWaterType,
  transmission,
  channelTransmission,
  dominantBand,
  PURE_WATER_ABSORPTION,
  type WaterTypeId,
} from './water'
import {
  attenuationGains,
  opticalPathLength,
  MAX_CHANNEL_GAIN,
  RECOVERABLE_RED_GAIN,
} from './attenuation'
import { estimateWhiteBalance, scaleWhiteBalance } from './autoWhiteBalance'
import { processBuffer, computeGains, DEFAULT_SETTINGS } from './pipeline'
import { ALL_PRESETS, applyPreset, CONDITION_PRESETS, AUTO_PRESET } from './presets'

// ---------------------------------------------------------------------------
// color.ts
// ---------------------------------------------------------------------------

describe('sRGB transfer function', () => {
  it('round-trips', () => {
    for (const v of [0, 0.001, 0.04, 0.05, 0.2, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 10)
    }
  })

  it('matches the IEC 61966-2-1 definition at the segment boundary', () => {
    // The piecewise breakpoint is at sRGB 0.04045 -> linear 0.0031308.
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 12)
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.0031308, 6)
  })

  it('anchors 0 and 1 exactly', () => {
    expect(srgbToLinear(0)).toBe(0)
    expect(srgbToLinear(1)).toBeCloseTo(1, 12)
    expect(linearToSrgb(1)).toBeCloseTo(1, 12)
  })

  it('mid-grey sRGB 0.5 is about 0.214 linear, not 0.5', () => {
    // This is the whole reason the old byte-space multiply was wrong: perceptual
    // middle is nowhere near linear middle.
    expect(srgbToLinear(0.5)).toBeCloseTo(0.2140, 3)
  })

  it('the LUT agrees with the function it tabulates', () => {
    for (const byte of [0, 1, 17, 64, 128, 200, 254, 255]) {
      expect(SRGB_TO_LINEAR_LUT[byte]).toBeCloseTo(srgbToLinear(byte / 255), 12)
    }
  })
})

describe('luminance', () => {
  it('uses Rec.709 weights that sum to 1', () => {
    expect(0.2126 + 0.7152 + 0.0722).toBeCloseTo(1, 10)
    expect(luminance(1, 1, 1)).toBeCloseTo(1, 10)
  })

  it('weights green most and blue least', () => {
    expect(luminance(0, 1, 0)).toBeGreaterThan(luminance(1, 0, 0))
    expect(luminance(1, 0, 0)).toBeGreaterThan(luminance(0, 0, 1))
  })
})

describe('highlight roll-off', () => {
  it('is the identity below the knee', () => {
    expect(rolloff(0.5, 0.8)).toBe(0.5)
    expect(rolloff(0.8, 0.8)).toBe(0.8)
  })

  it('never exceeds 1, however large the input', () => {
    for (const v of [1, 2, 10, 1000]) {
      expect(rolloff(v, 0.8)).toBeLessThanOrEqual(1)
    }
  })

  it('is monotonic, so ordering of brightness is preserved', () => {
    let prev = -1
    for (let v = 0; v <= 5; v += 0.01) {
      const out = rolloff(v, 0.8)
      expect(out).toBeGreaterThanOrEqual(prev)
      prev = out
    }
  })

  it('is continuous at the knee', () => {
    const knee = 0.8
    expect(rolloff(knee + 1e-9, knee)).toBeCloseTo(knee, 8)
  })

  it('compresses rather than clips, so hue survives a raised channel', () => {
    // Two channels above the knee by different amounts must stay distinguishable
    // after roll-off. Hard clipping would collapse both to 1.0 and destroy hue.
    const a = rolloff(1.2, 0.8)
    const b = rolloff(1.8, 0.8)
    expect(b).toBeGreaterThan(a)
    expect(a).toBeLessThan(1)
    expect(b).toBeLessThan(1)
  })
})

// ---------------------------------------------------------------------------
// water.ts
// ---------------------------------------------------------------------------

describe('Jerlov water types', () => {
  it('has all ten types', () => {
    expect(WATER_TYPES).toHaveLength(10)
    const ids = WATER_TYPES.map((w) => w.id)
    expect(ids).toEqual(['I', 'IA', 'IB', 'II', 'III', '1C', '3C', '5C', '7C', '9C'])
  })

  it('never falls below pure-water absorption', () => {
    // Pope & Fry (1997) pure water is a hard physical floor: no natural water
    // body attenuates less than pure water does.
    for (const w of WATER_TYPES) {
      expect(w.beta.r).toBeGreaterThanOrEqual(PURE_WATER_ABSORPTION.r)
      expect(w.beta.g).toBeGreaterThanOrEqual(PURE_WATER_ABSORPTION.g)
      expect(w.beta.b).toBeGreaterThanOrEqual(PURE_WATER_ABSORPTION.b)
    }
  })

  it('increases attenuation monotonically from clearest to most turbid', () => {
    for (let i = 1; i < WATER_TYPES.length; i++) {
      const prev = WATER_TYPES[i - 1].beta
      const cur = WATER_TYPES[i].beta
      expect(cur.r).toBeGreaterThanOrEqual(prev.r)
      expect(cur.g).toBeGreaterThanOrEqual(prev.g)
      expect(cur.b).toBeGreaterThanOrEqual(prev.b)
    }
  })

  it('loses red fastest in every water type', () => {
    // True universally: 600nm is absorbed by water itself more than 525 or 475.
    for (const w of WATER_TYPES) {
      expect(w.beta.r).toBeGreaterThan(w.beta.g)
    }
  })

  it('blue penetrates deepest in oceanic water', () => {
    for (const w of WATER_TYPES.filter((t) => t.family === 'oceanic')) {
      expect(dominantBand(w.beta)).toBe('b')
    }
  })

  it('green — not blue — penetrates deepest in coastal water', () => {
    // The point most underwater tools get wrong. CDOM in coastal water absorbs
    // short wavelengths hardest, so the "always cut green, boost red" recipe is
    // backwards there. Berman et al. and Akkaynak et al. both state this.
    for (const w of WATER_TYPES.filter((t) => t.family === 'coastal')) {
      expect(dominantBand(w.beta)).toBe('g')
    }
  })

  it('rejects an unknown type rather than silently defaulting', () => {
    expect(() => getWaterType('nonsense' as WaterTypeId)).toThrow()
  })
})

describe('Beer-Lambert transmission', () => {
  it('matches exp(-beta*x) computed independently', () => {
    // Re-derived here, not read from the module.
    expect(transmission(0.35, 10)).toBeCloseTo(Math.E ** -3.5, 12)
    expect(transmission(0.05, 20)).toBeCloseTo(Math.E ** -1, 12)
  })

  it('is 1 at zero path length and for negative input', () => {
    expect(transmission(0.5, 0)).toBe(1)
    expect(transmission(0.5, -5)).toBe(1)
  })

  it('halves again over each additional half-life distance', () => {
    // A defining property of exponential decay, independent of the constant.
    const beta = 0.35
    const halfLife = Math.LN2 / beta
    expect(transmission(beta, halfLife)).toBeCloseTo(0.5, 10)
    expect(transmission(beta, 2 * halfLife)).toBeCloseTo(0.25, 10)
  })

  it('leaves essentially no red at 30 m in clear water', () => {
    // The reason gains must be capped: there is no signal left to restore.
    const clear = getWaterType('I').beta
    const t = channelTransmission(clear, 30)
    expect(t.r).toBeLessThan(1e-4)
    expect(t.b).toBeGreaterThan(0.3)
  })
})

// ---------------------------------------------------------------------------
// attenuation.ts
// ---------------------------------------------------------------------------

describe('attenuation inversion', () => {
  it('uses both legs of the optical path', () => {
    expect(opticalPathLength(10, 2)).toBe(12)
    // Depth and distance are interchangeable in total path length...
    expect(opticalPathLength(0, 12)).toBe(12)
    // ...and negative inputs contribute nothing rather than subtracting.
    expect(opticalPathLength(-5, 3)).toBe(3)
  })

  it('inverts transmission exactly, independently re-derived', () => {
    const depth = 5
    const distance = 1
    const beta = getWaterType('IB').beta
    const x = depth + distance

    const g = attenuationGains({ depth, distance, waterType: 'IB', strength: 1 })

    // Independent derivation: gain_c = T_best / T_c, with T = exp(-beta*x).
    const tR = Math.exp(-beta.r * x)
    const tG = Math.exp(-beta.g * x)
    const tB = Math.exp(-beta.b * x)
    const best = Math.max(tR, tG, tB)

    expect(g.r).toBeCloseTo(best / tR, 8)
    expect(g.g).toBeCloseTo(best / tG, 8)
    expect(g.b).toBeCloseTo(best / tB, 8)
  })

  it('normalises so the best-surviving channel is not amplified', () => {
    // Otherwise the model would silently double as a multi-stop exposure boost.
    const g = attenuationGains({ depth: 12, distance: 2, waterType: 'II' })
    expect(Math.min(g.r, g.g, g.b)).toBeCloseTo(1, 10)
  })

  it('boosts red hardest in oceanic water', () => {
    const g = attenuationGains({ depth: 15, distance: 2, waterType: 'IB' })
    expect(g.r).toBeGreaterThan(g.g)
    expect(g.g).toBeGreaterThan(g.b)
    expect(g.b).toBeCloseTo(1, 10)
  })

  it('boosts blue, not green, in green coastal water', () => {
    // The inverse of the oceanic case. A fixed "cut blue, cut green" preset
    // makes green water worse; this model corrects it in the right direction.
    const g = attenuationGains({ depth: 8, distance: 2, waterType: '7C' })
    expect(g.b).toBeGreaterThan(g.g)
    expect(g.g).toBeCloseTo(1, 10)
  })

  it('increases red gain monotonically with depth, up to the recoverable limit', () => {
    // Monotonic while the correction is still recovering something. Past the
    // ceiling it is flat rather than continuing to climb, because past there
    // no red survives to recover — see RECOVERABLE_RED_GAIN.
    let prev = 0
    for (const depth of [0, 2, 4, 6]) {
      const g = attenuationGains({ depth, distance: 1, waterType: 'IB', strength: 1 })
      expect(g.r).toBeGreaterThanOrEqual(prev)
      prev = g.r
    }
  })

  it('holds the hue ratio constant once capped, instead of skewing green', () => {
    // THE 47 m BUG. Each channel used to be clamped independently, so red hit
    // the ceiling and stopped while green kept climbing — every metre deeper
    // skewed the result further toward green. A real 47 m kelp photograph came
    // back with radioactive green weed and orange rock.
    //
    // Capping all three together in log space keeps the ratio, so the
    // correction loses magnitude without changing direction.
    const ratios = [15, 25, 35, 47].map((depth) => {
      const g = attenuationGains({ depth, distance: 1.5, waterType: 'IB', strength: 1 })
      expect(g.capped).toBe(true)
      return g.r / g.g
    })
    for (const ratio of ratios) {
      expect(ratio).toBeCloseTo(ratios[0], 6)
    }
  })

  it('applies no correction at zero path length', () => {
    const g = attenuationGains({ depth: 0, distance: 0, waterType: 'IB' })
    expect(g.r).toBeCloseTo(1, 10)
    expect(g.g).toBeCloseTo(1, 10)
    expect(g.b).toBeCloseTo(1, 10)
    expect(g.capped).toBe(false)
  })

  it('caps the gain and reports it rather than amplifying noise', () => {
    // At 40 m in clear water the true inverse is ~e^14; returning that would
    // multiply the red noise floor into garbage.
    const g = attenuationGains({ depth: 40, distance: 2, waterType: 'I', strength: 1 })
    expect(g.capped).toBe(true)
    expect(g.r).toBe(RECOVERABLE_RED_GAIN)
    // The recoverable ceiling is stricter than the noise ceiling: the latter is
    // where amplified noise swamps the signal, the former is where ambient red
    // is no longer present at all.
    expect(RECOVERABLE_RED_GAIN).toBeLessThan(MAX_CHANNEL_GAIN)
  })

  it('flags a photograph as beyond recovery when the red is simply gone', () => {
    // At a 48 m path in clear ocean, transmission is 1.6e-8: the file holds no
    // red information, only quantisation noise. Saying so is more useful than
    // inventing colour.
    const deep = attenuationGains({ depth: 47, distance: 1.5, waterType: 'IB', strength: 1 })
    expect(deep.beyondRecovery).toBe(true)

    const shallow = attenuationGains({ depth: 3, distance: 1, waterType: 'IB', strength: 1 })
    expect(shallow.beyondRecovery).toBe(false)
  })

  it('does not report capping for a modest, fully-representable correction', () => {
    const g = attenuationGains({ depth: 5, distance: 1, waterType: 'IB', strength: 1 })
    expect(g.capped).toBe(false)
  })

  it('interpolates in log space so hue is stable across strength', () => {
    // Shallow enough that neither strength hits the cap, so the pure log-space
    // relationship is observable.
    const full = attenuationGains({ depth: 4, distance: 1, waterType: 'IB', strength: 1 })
    const half = attenuationGains({ depth: 4, distance: 1, waterType: 'IB', strength: 0.5 })
    expect(full.capped).toBe(false)
    // gain^0.5 — re-derived from the definition, not read from another output.
    expect(half.r).toBeCloseTo(Math.sqrt(full.r), 8)
  })

  it('applies strength before the cap, so partial strength is not double-limited', () => {
    // Order matters. Capping first and then scaling would give sqrt(12)=3.46
    // for a correction whose honest half-strength value is exp(0.5*(bR-bB)*x).
    // That would silently under-correct every deep photo at partial strength.
    const depth = 10
    const distance = 1
    const beta = getWaterType('IB').beta
    const x = depth + distance

    const full = attenuationGains({ depth, distance, waterType: 'IB', strength: 1 })
    const half = attenuationGains({ depth, distance, waterType: 'IB', strength: 0.5 })

    expect(full.capped).toBe(true)
    expect(full.r).toBe(RECOVERABLE_RED_GAIN)

    // Independent derivation of the uncapped half-strength gain.
    const expected = Math.pow(Math.exp((beta.r - beta.b) * x), 0.5)
    expect(half.r).toBeCloseTo(expected, 6)
    expect(half.r).toBeGreaterThan(Math.sqrt(RECOVERABLE_RED_GAIN))
  })

  it('is the identity at zero strength', () => {
    const g = attenuationGains({ depth: 30, distance: 3, waterType: '5C', strength: 0 })
    expect(g.r).toBeCloseTo(1, 10)
    expect(g.g).toBeCloseTo(1, 10)
    expect(g.b).toBeCloseTo(1, 10)
  })
})

// ---------------------------------------------------------------------------
// autoWhiteBalance.ts
// ---------------------------------------------------------------------------

/** Build an RGBA buffer of a single flat colour. */
function flatImage(r: number, g: number, b: number, pixels = 64): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * 4)
  for (let i = 0; i < pixels; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  return data
}

describe('white balance estimation', () => {
  it('leaves a neutral grey image alone', () => {
    const est = estimateWhiteBalance(flatImage(128, 128, 128))
    expect(est.r).toBeCloseTo(1, 6)
    expect(est.g).toBeCloseTo(1, 6)
    expect(est.b).toBeCloseTo(1, 6)
    expect(est.castStrength).toBeCloseTo(1, 6)
  })

  it('raises the starved channels of a blue-cast image', () => {
    // A typical underwater frame: blue intact, red gone.
    const est = estimateWhiteBalance(flatImage(40, 110, 180))
    expect(est.r).toBeGreaterThan(est.g)
    expect(est.g).toBeGreaterThan(est.b)
    expect(est.b).toBeCloseTo(1, 6)
  })

  it('never brightens — the strongest channel is always left at gain 1', () => {
    // The correction changes colour only; exposure stays the user's decision.
    for (const px of [[40, 110, 180], [200, 90, 30], [10, 200, 90]]) {
      const est = estimateWhiteBalance(flatImage(px[0], px[1], px[2]))
      expect(Math.min(est.r, est.g, est.b)).toBeCloseTo(1, 6)
    }
  })

  it('inverts a flat cast exactly, re-derived from the definition', () => {
    // For a flat image the Minkowski norm equals the pixel value regardless of
    // p, so the gain must be exactly the linear-light ratio.
    const r = 40
    const g = 110
    const b = 180
    const est = estimateWhiteBalance(flatImage(r, g, b), { p: 6 })
    const lr = srgbToLinear(r / 255)
    const lb = srgbToLinear(b / 255)
    expect(est.r).toBeCloseTo(lb / lr, 6)
  })

  it('neutralises the cast it measured', () => {
    // Applying the estimate to the colour it came from must produce equal
    // linear channels. This is the defining property of the estimator.
    const est = estimateWhiteBalance(flatImage(40, 110, 180))
    const lr = srgbToLinear(40 / 255) * est.r
    const lg = srgbToLinear(110 / 255) * est.g
    const lb = srgbToLinear(180 / 255) * est.b
    expect(lr).toBeCloseTo(lg, 6)
    expect(lg).toBeCloseTo(lb, 6)
  })

  it('reports a stronger cast for a stronger cast', () => {
    const mild = estimateWhiteBalance(flatImage(100, 130, 160))
    const severe = estimateWhiteBalance(flatImage(20, 110, 200))
    expect(severe.castStrength).toBeGreaterThan(mild.castStrength)
  })

  it('ignores clipped pixels, which have lost their chromaticity', () => {
    const data = new Uint8ClampedArray(2 * 4)
    // One usable blue-cast pixel, one blown white pixel.
    data.set([40, 110, 180, 255], 0)
    data.set([255, 255, 255, 255], 4)
    const withClipped = estimateWhiteBalance(data)
    const withoutClipped = estimateWhiteBalance(flatImage(40, 110, 180))
    expect(withClipped.r).toBeCloseTo(withoutClipped.r, 6)
  })

  it('returns identity for an image with nothing usable in it', () => {
    const black = flatImage(0, 0, 0)
    const est = estimateWhiteBalance(black)
    expect(est.r).toBe(1)
    expect(est.g).toBe(1)
    expect(est.b).toBe(1)
  })

  it('p=1 is grey-world: the linear mean of the channels', () => {
    // Two-pixel image; re-derive the arithmetic mean by hand.
    const data = new Uint8ClampedArray(2 * 4)
    data.set([50, 100, 150, 255], 0)
    data.set([100, 150, 200, 255], 4)
    const est = estimateWhiteBalance(data, { p: 1 })
    const meanR = (srgbToLinear(50 / 255) + srgbToLinear(100 / 255)) / 2
    const meanB = (srgbToLinear(150 / 255) + srgbToLinear(200 / 255)) / 2
    expect(est.r).toBeCloseTo(meanB / meanR, 6)
  })

  it('a higher norm weights bright pixels more', () => {
    // Dim blue-cast background plus a bright neutral highlight. Grey-world is
    // dragged by the background; a high norm follows the highlight. This is
    // exactly why p=6 is used rather than p=1 for underwater frames.
    const n = 100
    const data = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      const bright = i < 5
      data[i * 4] = bright ? 200 : 30
      data[i * 4 + 1] = bright ? 200 : 90
      data[i * 4 + 2] = bright ? 200 : 150
      data[i * 4 + 3] = 255
    }
    const greyWorld = estimateWhiteBalance(data, { p: 1 })
    const shadesOfGrey = estimateWhiteBalance(data, { p: 6 })
    expect(shadesOfGrey.r).toBeLessThan(greyWorld.r)
  })

  it('stride sampling approximates the full estimate', () => {
    const n = 400
    const data = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      data[i * 4] = 40
      data[i * 4 + 1] = 110
      data[i * 4 + 2] = 180
      data[i * 4 + 3] = 255
    }
    const full = estimateWhiteBalance(data, { stride: 1 })
    const sampled = estimateWhiteBalance(data, { stride: 7 })
    expect(sampled.r).toBeCloseTo(full.r, 6)
  })

  it('scales toward neutral in log space', () => {
    const est = estimateWhiteBalance(flatImage(40, 110, 180))
    const half = scaleWhiteBalance(est, 0.5)
    expect(half.r).toBeCloseTo(Math.sqrt(est.r), 8)
    const none = scaleWhiteBalance(est, 0)
    expect(none.r).toBeCloseTo(1, 10)
    const all = scaleWhiteBalance(est, 1)
    expect(all.r).toBeCloseTo(est.r, 10)
  })
})

// ---------------------------------------------------------------------------
// pipeline.ts
// ---------------------------------------------------------------------------

describe('correction pipeline', () => {
  it('makes no change at all when every control is neutral', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      autoWhiteBalance: false,
      usePhysicalModel: false,
      exposure: 0,
      contrast: 0,
      saturation: 0,
      vibrance: 0,
      blackPoint: 0,
    }
    const data = flatImage(90, 140, 190)
    const before = Array.from(data)
    processBuffer(data, settings)
    // Allow a single count of rounding on the 8-bit round trip.
    for (let i = 0; i < before.length; i++) {
      expect(Math.abs(data[i] - before[i])).toBeLessThanOrEqual(1)
    }
  })

  it('preserves the alpha channel', () => {
    const data = new Uint8ClampedArray([40, 110, 180, 123])
    processBuffer(data, DEFAULT_SETTINGS)
    expect(data[3]).toBe(123)
  })

  it('warms a blue-cast image: red rises, blue does not', () => {
    const data = flatImage(40, 110, 180, 1)
    processBuffer(data, {
      ...DEFAULT_SETTINGS,
      contrast: 0,
      vibrance: 0,
      autoStrength: 1,
    })
    expect(data[0]).toBeGreaterThan(40)
    expect(data[2]).toBeLessThanOrEqual(180)
  })

  it('never emits values outside the byte range', () => {
    const data = flatImage(250, 250, 250, 16)
    processBuffer(data, {
      ...DEFAULT_SETTINGS,
      exposure: 4,
      contrast: 1,
      saturation: 1,
    })
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBeGreaterThanOrEqual(0)
      expect(data[i]).toBeLessThanOrEqual(255)
    }
  })

  it('exposure of +1 stop doubles linear light', () => {
    const data = flatImage(100, 100, 100, 1)
    processBuffer(data, {
      ...DEFAULT_SETTINGS,
      autoWhiteBalance: false,
      contrast: 0,
      vibrance: 0,
      exposure: 1,
    })
    // Independent derivation, including the roll-off shoulder.
    const expected = Math.round(
      clamp01(linearToSrgb(rolloff(srgbToLinear(100 / 255) * 2))) * 255
    )
    expect(data[0]).toBe(expected)
  })

  it('fully desaturates at saturation -1', () => {
    const data = flatImage(200, 100, 50, 1)
    processBuffer(data, {
      ...DEFAULT_SETTINGS,
      autoWhiteBalance: false,
      contrast: 0,
      vibrance: 0,
      saturation: -1,
    })
    expect(data[0]).toBe(data[1])
    expect(data[1]).toBe(data[2])
  })

  it('vibrance moves a muted colour more than an already-vivid one', () => {
    // Measured as relative change in saturation (max-min)/max, which is the
    // quantity vibrance actually acts on. Differencing two arbitrary channels
    // instead is meaningless for a colour whose blue is already near zero.
    const saturationOf = (px: Uint8ClampedArray) => {
      const max = Math.max(px[0], px[1], px[2])
      const min = Math.min(px[0], px[1], px[2])
      return max > 0 ? (max - min) / max : 0
    }

    const muted = flatImage(120, 130, 140, 1)
    const vivid = flatImage(240, 20, 20, 1)
    const opts = { ...DEFAULT_SETTINGS, autoWhiteBalance: false, contrast: 0, vibrance: 1 }

    const mutedBefore = saturationOf(muted)
    const vividBefore = saturationOf(vivid)
    processBuffer(muted, opts)
    processBuffer(vivid, opts)

    const mutedGrowth = saturationOf(muted) / mutedBefore
    const vividGrowth = saturationOf(vivid) / vividBefore
    expect(mutedGrowth).toBeGreaterThan(vividGrowth)
    // And the vivid one is barely touched, rather than pushed to neon.
    expect(vividGrowth).toBeLessThan(1.1)
  })

  it('reports the cap through the pipeline, not just the model', () => {
    // A safety-shaped property: the UI can only warn if this survives the trip.
    const data = flatImage(40, 110, 180, 4)
    const analysis = processBuffer(data, {
      ...DEFAULT_SETTINGS,
      autoWhiteBalance: false,
      usePhysicalModel: true,
      depth: 45,
      distance: 3,
      waterType: 'I',
      physicalStrength: 1,
    })
    expect(analysis.capped).toBe(true)
  })

  it('reuses a supplied estimate instead of recomputing per call', () => {
    // Matters for tiling: a per-tile estimate would make each tile a different
    // colour. Passing a fixed estimate must give a fixed result.
    const estimate = estimateWhiteBalance(flatImage(40, 110, 180))
    const a = flatImage(200, 200, 200, 1)
    const b = flatImage(200, 200, 200, 1)
    processBuffer(a, DEFAULT_SETTINGS, { estimate })
    processBuffer(b, DEFAULT_SETTINGS, { estimate })
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('normalises against the least-attenuated channel, which stays at gain 1', () => {
    // The invariant is min(gain) == 1: starved channels are raised toward the
    // surviving one, and no channel is ever *reduced*. Normalising against the
    // max instead darkens the image while keeping the hue shift plausible —
    // a sign error that is invisible unless this is asserted explicitly.
    const estimate = estimateWhiteBalance(flatImage(40, 110, 180))
    const analysis = computeGains(
      { ...DEFAULT_SETTINGS, usePhysicalModel: true, depth: 20, distance: 2 },
      estimate
    )
    const { r, g, b } = analysis.appliedGain
    expect(Math.min(r, g, b)).toBeCloseTo(1, 10)
    expect(Math.max(r, g, b)).toBeGreaterThan(1)
  })

  it('processes a large buffer without producing NaN', () => {
    const n = 5000
    const data = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      data[i * 4] = i % 256
      data[i * 4 + 1] = (i * 7) % 256
      data[i * 4 + 2] = (i * 13) % 256
      data[i * 4 + 3] = 255
    }
    processBuffer(data, DEFAULT_SETTINGS)
    for (let i = 0; i < data.length; i++) {
      expect(Number.isFinite(data[i])).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// presets.ts
// ---------------------------------------------------------------------------

describe('presets', () => {
  it('has unique ids', () => {
    const ids = ALL_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('produces a complete, valid settings object', () => {
    for (const preset of ALL_PRESETS) {
      const s = applyPreset(preset)
      expect(Number.isFinite(s.depth)).toBe(true)
      expect(Number.isFinite(s.distance)).toBe(true)
      expect(s.autoStrength).toBeGreaterThanOrEqual(0)
      expect(s.autoStrength).toBeLessThanOrEqual(1)
      expect(s.physicalStrength).toBeGreaterThanOrEqual(0)
      expect(s.physicalStrength).toBeLessThanOrEqual(1)
      // Must name a real Jerlov type, not an invented one.
      expect(() => getWaterType(s.waterType)).not.toThrow()
    }
  })

  it('the default preset needs no dive details', () => {
    const s = applyPreset(AUTO_PRESET)
    expect(s.autoWhiteBalance).toBe(true)
    expect(s.usePhysicalModel).toBe(false)
  })

  it('deeper presets lean on tone rather than correcting the cast harder', () => {
    // THE INTUITION IS BACKWARDS, and this is the property that says so.
    //
    // Attenuation is exponential, so the deeper the shot the more red the
    // physics "wants" — but past roughly 8 m of water path there is none left
    // in the file to recover. At 20 m the model asks 545x, at 48 m it asks
    // 4,300,000x, against a transmission of 1.6e-8. Amplifying that amplifies
    // quantisation noise, which is how a real 47 m frame came back with
    // radioactive green kelp.
    //
    // So the deep bands deliberately correct the cast LESS and lean on
    // exposure, contrast and saturation instead — which is what actually
    // rescues a deep photograph.
    const tropical = CONDITION_PRESETS
      .filter((p) => p.id.startsWith('tropical-'))
      .map((p) => applyPreset(p))
      .sort((a, b) => a.depth - b.depth)

    for (let i = 1; i < tropical.length; i++) {
      const shallower = tropical[i - 1]
      const deeper = tropical[i]
      expect(
        deeper.physicalStrength,
        'the deeper band must not invert the cast harder'
      ).toBeLessThanOrEqual(shallower.physicalStrength)
      expect(deeper.contrast).toBeGreaterThanOrEqual(shallower.contrast)
      expect(deeper.saturation).toBeGreaterThanOrEqual(shallower.saturation)
      expect(deeper.exposure).toBeGreaterThanOrEqual(shallower.exposure)
    }

    // And the shallowest band still genuinely inverts the water, or the model
    // would be doing nothing anywhere.
    expect(tropical[0].physicalStrength).toBeGreaterThan(0.5)
  })

  it('the strobe preset barely corrects, because artificial light is not attenuated', () => {
    // Over-correcting strobe-lit shots is the classic way to ruin them.
    const s = applyPreset(
      ALL_PRESETS.find((p) => p.id === 'artificial-light')!
    )
    expect(s.depth).toBe(0)
    const g = attenuationGains({
      depth: s.depth,
      distance: s.distance,
      waterType: s.waterType,
      strength: s.physicalStrength,
    })
    expect(g.r).toBeLessThan(1.5)
  })

  it('is far smaller than the 16-preset table it replaced, per axis', () => {
    // Navigability: 5 water conditions x 4 depths is a grid a diver can reason
    // about, not a flat list of 16 near-identical named entries.
    expect(CONDITION_PRESETS).toHaveLength(20)
    const waters = new Set(CONDITION_PRESETS.map((p) => p.id.split('-')[0]))
    expect(waters.size).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Combined gain cap — regression
// ---------------------------------------------------------------------------

describe('the combined gain is capped, not just the physical model', () => {
  /**
   * Found on the real page, not in a unit test: a photo whose red channel sat
   * near 20/255 produced an applied red gain of 25x while the UI claimed a cap
   * of 12. `attenuationGains` caps itself, but the auto white-balance estimate
   * is unbounded, and nothing capped their product.
   */
  const severelyRedStarved = () => {
    const n = 64
    const data = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      data[i * 4] = 20
      data[i * 4 + 1] = 90
      data[i * 4 + 2] = 160
      data[i * 4 + 3] = 255
    }
    return data
  }

  it('never applies a gain above MAX_CHANNEL_GAIN, even from auto alone', () => {
    const estimate = estimateWhiteBalance(severelyRedStarved())
    // The raw estimate genuinely wants far more than the cap allows.
    expect(estimate.r).toBeGreaterThan(MAX_CHANNEL_GAIN)

    const analysis = computeGains(
      { ...DEFAULT_SETTINGS, autoWhiteBalance: true, autoStrength: 1, usePhysicalModel: false },
      estimate
    )
    const { r, g, b } = analysis.appliedGain
    expect(Math.max(r, g, b)).toBeLessThanOrEqual(MAX_CHANNEL_GAIN + 1e-9)
    expect(analysis.capped).toBe(true)
  })

  it('preserves the normalisation invariant while capping', () => {
    // Linear rescaling followed by renormalising is a no-op; log-space
    // compression is what actually limits the magnitude.
    const estimate = estimateWhiteBalance(severelyRedStarved())
    const analysis = computeGains(
      { ...DEFAULT_SETTINGS, autoStrength: 1, usePhysicalModel: false },
      estimate
    )
    const { r, g, b } = analysis.appliedGain
    expect(Math.min(r, g, b)).toBeCloseTo(1, 9)
    expect(Math.max(r, g, b)).toBeCloseTo(RECOVERABLE_RED_GAIN, 6)
  })

  it('keeps the direction of the correction when capping', () => {
    // Red is the starved channel, so it must still be the most-boosted one.
    const estimate = estimateWhiteBalance(severelyRedStarved())
    const { appliedGain } = computeGains(
      { ...DEFAULT_SETTINGS, autoStrength: 1, usePhysicalModel: false },
      estimate
    )
    expect(appliedGain.r).toBeGreaterThan(appliedGain.g)
    expect(appliedGain.g).toBeGreaterThan(appliedGain.b)
  })

  it('leaves a modest correction completely untouched', () => {
    // The cap must not quietly alter corrections that were already in range.
    const mild = new Uint8ClampedArray([100, 130, 150, 255])
    const estimate = estimateWhiteBalance(mild)
    const analysis = computeGains(
      { ...DEFAULT_SETTINGS, autoStrength: 1, usePhysicalModel: false },
      estimate
    )
    expect(analysis.capped).toBe(false)
    expect(analysis.appliedGain.r).toBeCloseTo(estimate.r, 9)
  })
})

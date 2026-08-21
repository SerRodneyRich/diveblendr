/**
 * Crop framing for the share card.
 *
 * Expectations are derived from the geometry rather than from what the
 * function currently returns: a `cover` fit scales by the LARGER of the two
 * ratios, so exactly one axis overflows, and the offset chooses which part of
 * that overflow is discarded.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_FRAMING, PHOTO_CORRECTIONS, framedRect } from './photo'
import { coverRect } from './card'

describe('framedRect', () => {
  it('matches the plain centre crop at the default framing', () => {
    // The default must be a no-op, or every existing card silently reframes.
    const a = framedRect(4000, 3000, 1080, 1920, DEFAULT_FRAMING)
    const b = coverRect(4000, 3000, 1080, 1920)
    expect(a.w).toBeCloseTo(b.w, 6)
    expect(a.h).toBeCloseTo(b.h, 6)
    expect(a.x).toBeCloseTo(b.x, 6)
    expect(a.y).toBeCloseTo(b.y, 6)
  })

  it('covers the box on both axes, whatever the framing', () => {
    for (const offsetY of [0, 0.25, 0.5, 0.75, 1]) {
      const r = framedRect(4000, 3000, 1080, 1920, { offsetX: 0.5, offsetY, zoom: 1 })
      // No gap at any edge: the drawn rect must start at or before the box
      // origin and end at or after its far edge.
      expect(r.x).toBeLessThanOrEqual(0.0001)
      expect(r.y).toBeLessThanOrEqual(0.0001)
      expect(r.x + r.w).toBeGreaterThanOrEqual(1080 - 0.0001)
      expect(r.y + r.h).toBeGreaterThanOrEqual(1920 - 0.0001)
    }
  })

  it('offset 0 keeps the top of the image, offset 1 keeps the bottom', () => {
    // A portrait box against a landscape photo overflows horizontally, so use
    // a tall photo to get vertical overflow to steer.
    const top = framedRect(1080, 4000, 1080, 1920, { offsetX: 0.5, offsetY: 0, zoom: 1 })
    const bottom = framedRect(1080, 4000, 1080, 1920, { offsetX: 0.5, offsetY: 1, zoom: 1 })
    expect(top.y).toBeCloseTo(0, 6)
    expect(bottom.y).toBeCloseTo(1920 - bottom.h, 6)
    expect(bottom.y).toBeLessThan(top.y)
  })

  it('zoom crops further rather than leaving the image smaller', () => {
    const plain = framedRect(4000, 3000, 1080, 1920, DEFAULT_FRAMING)
    const zoomed = framedRect(4000, 3000, 1080, 1920, { ...DEFAULT_FRAMING, zoom: 2 })
    expect(zoomed.w).toBeCloseTo(plain.w * 2, 6)
    expect(zoomed.h).toBeCloseTo(plain.h * 2, 6)
  })

  it('never scales below cover, however low the zoom is driven', () => {
    // A zoom under 1 would leave a gap at the edges; it is clamped, not honoured.
    const r = framedRect(4000, 3000, 1080, 1920, { offsetX: 0.5, offsetY: 0.5, zoom: 0.2 })
    expect(r.w).toBeGreaterThanOrEqual(1080 - 0.0001)
    expect(r.h).toBeGreaterThanOrEqual(1920 - 0.0001)
  })

  it('ignores an offset on an axis with nothing to crop', () => {
    // An exact-aspect photo has no overflow, so the offset has nothing to move
    // and must not push the image off the box.
    const a = framedRect(1080, 1920, 1080, 1920, { offsetX: 0, offsetY: 0, zoom: 1 })
    const b = framedRect(1080, 1920, 1080, 1920, { offsetX: 1, offsetY: 1, zoom: 1 })
    expect(a).toEqual(b)
    expect(a.x).toBeCloseTo(0, 6)
    expect(a.y).toBeCloseTo(0, 6)
  })

  it('clamps an out-of-range offset instead of drifting off the box', () => {
    const r = framedRect(4000, 3000, 1080, 1920, { offsetX: 5, offsetY: -3, zoom: 1 })
    expect(r.x).toBeLessThanOrEqual(0.0001)
    expect(r.x + r.w).toBeGreaterThanOrEqual(1080 - 0.0001)
  })
})

describe('PHOTO_CORRECTIONS', () => {
  it('leaves "As shot" with no settings, so the photo is untouched', () => {
    expect(PHOTO_CORRECTIONS.none.settings).toBeNull()
  })

  it('corrects harder on the deep preset than on auto', () => {
    const auto = PHOTO_CORRECTIONS.auto.settings!
    const deep = PHOTO_CORRECTIONS.strong.settings!
    expect(deep.autoStrength).toBeGreaterThan(auto.autoStrength)
    expect(deep.vibrance).toBeGreaterThan(auto.vibrance)
  })

  it('neither preset layers the physical model on top of auto white balance', () => {
    // Deep used to stack Beer-Lambert on the auto estimate, correcting the
    // same physics twice. The gains multiply: on a mildly blue frame auto asks
    // for 3.0x red while the stacked version asked for 12.0x — the hard cap.
    // Saturated, not stronger. On a genuinely deep frame BOTH hit 12.0x, so
    // the presets became indistinguishable at exactly the depth where the
    // choice was supposed to matter. Measured on a real 47 m photograph.
    //
    // The physical model belongs in the editor, where the diver enters the
    // depth and distance it needs. Here it is off for both.
    for (const [id, entry] of Object.entries(PHOTO_CORRECTIONS)) {
      if (!entry.settings) continue
      expect(entry.settings.usePhysicalModel, `${id} must not stack the model`).toBe(false)
    }
  })

  it('every preset names itself and says what it does', () => {
    for (const entry of Object.values(PHOTO_CORRECTIONS)) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.note.length).toBeGreaterThan(0)
    }
  })
})


/**
 * The card's own ceiling on how much red it will restore.
 *
 * The editor stops at 12x — the point where an 8-bit channel at the noise
 * floor stops carrying scene content. That suits a tool with a live preview
 * the diver can back off. A share card is fire-and-forget, so it stops well
 * short: a 47 m frame with almost no red left asked for the full 12x, which
 * amplified the noise floor and blew the image out.
 *
 * jsdom has no real canvas, so these assert the arithmetic that tames the
 * request rather than running the pixel pass.
 */
describe('card correction ceiling', () => {
  /** Mirrors the log-space back-off in `correctPhoto`. */
  function tamedStrength(requested: number, strength: number, ceiling: number) {
    if (requested <= ceiling) return strength
    return strength * (Math.log(ceiling) / Math.log(requested))
  }

  const CEILING = 3.5

  it('leaves a modest request untouched', () => {
    expect(tamedStrength(3, 0.85, CEILING)).toBeCloseTo(0.85, 6)
  })

  it('gives the deep preset a higher ceiling, so the two actually differ', () => {
    // A single shared ceiling clamped both presets to the same result on any
    // deeply-cast photo, which is a control that claims a choice it does not
    // offer. Deep reaches further before it stops.
    const autoGain = Math.pow(20, tamedStrength(20, 1, 3.5))
    const deepGain = Math.pow(20, tamedStrength(20, 1, 6))
    expect(deepGain).toBeGreaterThan(autoGain)
    expect(autoGain).toBeCloseTo(3.5, 4)
    expect(deepGain).toBeCloseTo(6, 4)
  })

  it('backs off a request that would amplify the noise floor', () => {
    // A starved-red frame asks for far more than the card should attempt.
    const tamed = tamedStrength(25, 1, CEILING)
    expect(tamed).toBeLessThan(1)
    // And the back-off lands the effective gain at the ceiling, not below it:
    // raising the request to the tamed exponent is the ceiling by definition.
    expect(Math.pow(25, tamed)).toBeCloseTo(CEILING, 4)
  })

  it('backs off more the more extreme the request', () => {
    const mild = tamedStrength(6, 1, CEILING)
    const extreme = tamedStrength(30, 1, CEILING)
    expect(extreme).toBeLessThan(mild)
  })

  it('never inverts the correction', () => {
    for (const requested of [5, 8, 12, 25, 60]) {
      expect(tamedStrength(requested, 1, CEILING)).toBeGreaterThan(0)
    }
  })
})

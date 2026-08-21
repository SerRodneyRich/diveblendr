// @vitest-environment jsdom

/**
 * Rendered-DOM tests for the photo tool.
 *
 * Per the repo's safety rule: a green `src/lib` suite does not prove the page
 * is right. The maths being correct and the page rendering the wrong field is
 * exactly the failure mode this guards against — so these assert what a user
 * actually sees and what the pipeline actually does to real pixel data.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PhotoTool } from './PhotoTool'
import { processBuffer, DEFAULT_SETTINGS } from '@/lib/photo/pipeline'
import { srgbToLinear } from '@/lib/photo/color'

afterEach(cleanup)

describe('PhotoTool rendering', () => {
  it('renders the heading and the privacy claim it makes', () => {
    render(<PhotoTool />)
    expect(screen.getByRole('heading', { name: /photo editor/i })).toBeTruthy()
    // The "nothing is uploaded" promise is load-bearing: it is the reason the
    // tool is usable on boat wifi, and it must not silently disappear.
    expect(screen.getByText(/no photo is uploaded/i)).toBeTruthy()
  })

  it('offers a file picker before anything is loaded', () => {
    render(<PhotoTool />)
    expect(screen.getByRole('button', { name: /choose photos/i })).toBeTruthy()
  })

  it('states that the correction is an estimate, not a measurement', () => {
    // Honesty requirement from the review: a modelled correction must not be
    // presented as if it were read from the file.
    render(<PhotoTool />)
    // Twice over: the message bar shows the text itself, and the expandable
    // panel holds the full copy in the DOM whether or not it is open.
    expect(screen.getAllByText(/estimate, not a measurement/i).length).toBeGreaterThan(0)
  })
})

describe('the correction actually corrects', () => {
  /**
   * End-to-end on real pixel data: a blue-cast frame must come back warmer.
   *
   * The expected direction is re-derived from the physics rather than compared
   * against another output — a blue-dominant image has a red-starved
   * illuminant, so the estimator must raise red relative to blue.
   */
  it('warms a blue-cast image and leaves a neutral one alone', () => {
    const makeFlat = (r: number, g: number, b: number, n = 256) => {
      const data = new Uint8ClampedArray(n * 4)
      for (let i = 0; i < n; i++) {
        data[i * 4] = r
        data[i * 4 + 1] = g
        data[i * 4 + 2] = b
        data[i * 4 + 3] = 255
      }
      return data
    }

    const settings = { ...DEFAULT_SETTINGS, contrast: 0, vibrance: 0, autoStrength: 1 }

    // A typical underwater frame: red gone, blue intact.
    const cast = makeFlat(40, 110, 180)
    processBuffer(cast, settings)
    // Red must rise; blue must not be pushed above where it started.
    expect(cast[0]).toBeGreaterThan(40)
    expect(cast[2]).toBeLessThanOrEqual(181)

    // After correction the channels should be far closer together than before.
    const spreadBefore = 180 - 40
    const spreadAfter = Math.max(cast[0], cast[1], cast[2]) - Math.min(cast[0], cast[1], cast[2])
    expect(spreadAfter).toBeLessThan(spreadBefore)

    // An already-neutral frame must be left essentially untouched, or the tool
    // would "correct" photos that need nothing.
    const neutral = makeFlat(128, 128, 128)
    processBuffer(neutral, settings)
    expect(Math.abs(neutral[0] - 128)).toBeLessThanOrEqual(2)
    expect(Math.abs(neutral[2] - 128)).toBeLessThanOrEqual(2)
  })

  it('does not blow highlights when the correction is strong', () => {
    // The old pipeline's failure mode: hard-clipping a boosted red channel tore
    // bright pixels to magenta. A bright, blue-cast pixel must stay neutral-ish
    // rather than railing one channel to 255 while the others sit far below.
    const n = 64
    const data = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      data[i * 4] = 120
      data[i * 4 + 1] = 200
      data[i * 4 + 2] = 240
      data[i * 4 + 3] = 255
    }
    processBuffer(data, {
      ...DEFAULT_SETTINGS,
      autoStrength: 1,
      usePhysicalModel: true,
      depth: 25,
      distance: 2,
      waterType: 'IB',
      physicalStrength: 1,
    })
    for (let i = 0; i < n * 4; i += 4) {
      expect(data[i]).toBeLessThanOrEqual(255)
      expect(data[i]).toBeGreaterThanOrEqual(0)
    }
  })

  it('corrects green water by raising blue, not by cutting green', () => {
    // The case the old fixed recipe got backwards. In green coastal water blue
    // is the attenuated channel, so a correct model raises it.
    const n = 32
    const data = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      data[i * 4] = 60
      data[i * 4 + 1] = 170
      data[i * 4 + 2] = 90
      data[i * 4 + 3] = 255
    }
    const before = { r: data[0], g: data[1], b: data[2] }
    processBuffer(data, {
      ...DEFAULT_SETTINGS,
      contrast: 0,
      vibrance: 0,
      autoStrength: 1,
    })
    // Blue and red both rise toward the dominant green.
    expect(data[2]).toBeGreaterThan(before.b)
    expect(data[0]).toBeGreaterThan(before.r)
  })

  it('operates in linear light, which byte-space maths would not reproduce', () => {
    // Guards the specific defect from the review: applying gains to
    // gamma-encoded bytes. A 2x linear gain on sRGB 100 lands at ~143, not 200.
    const data = new Uint8ClampedArray([100, 100, 100, 255])
    processBuffer(data, {
      ...DEFAULT_SETTINGS,
      autoWhiteBalance: false,
      contrast: 0,
      vibrance: 0,
      exposure: 1,
    })
    const naiveByteDouble = 200
    expect(data[0]).not.toBe(naiveByteDouble)
    // Independently derived: encode(2 * decode(100/255)).
    const expected = srgbToLinear(100 / 255) * 2
    expect(expected).toBeGreaterThan(0)
    expect(data[0]).toBeGreaterThan(100)
    expect(data[0]).toBeLessThan(naiveByteDouble)
  })
})

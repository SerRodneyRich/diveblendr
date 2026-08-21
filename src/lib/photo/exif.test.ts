/**
 * EXIF orientation tests.
 *
 * The fixtures are real JPEG/TIFF byte structures assembled here, not mocks, so
 * these exercise the actual parser against the actual format.
 */

import { describe, it, expect } from 'vitest'
import {
  readExifOrientation,
  orientationSwapsAxes,
  orientationTransform,
  rotateOrientation,
  type ExifOrientation,
} from './exif'

/**
 * Build a minimal but structurally valid JPEG carrying one EXIF Orientation tag.
 */
function jpegWithOrientation(orientation: number, little = true): ArrayBuffer {
  // APP1 payload: "Exif\0\0" + TIFF header + one-entry IFD.
  const payload = new ArrayBuffer(6 + 8 + 2 + 12 + 4)
  const v = new DataView(payload)

  // "Exif\0\0"
  v.setUint32(0, 0x45786966, false)
  v.setUint16(4, 0x0000, false)

  const tiff = 6
  v.setUint16(tiff, little ? 0x4949 : 0x4d4d, false) // II / MM
  v.setUint16(tiff + 2, 0x002a, little) // TIFF magic
  v.setUint32(tiff + 4, 8, little) // IFD offset, relative to TIFF start

  const ifd = tiff + 8
  v.setUint16(ifd, 1, little) // one entry
  v.setUint16(ifd + 2, 0x0112, little) // Orientation tag
  v.setUint16(ifd + 4, 3, little) // type SHORT
  v.setUint32(ifd + 6, 1, little) // count
  v.setUint16(ifd + 10, orientation, little) // value
  v.setUint32(ifd + 14, 0, little) // next IFD = none

  // Wrap: SOI + APP1 marker + length + payload.
  const out = new ArrayBuffer(2 + 2 + 2 + payload.byteLength)
  const o = new DataView(out)
  o.setUint16(0, 0xffd8, false) // SOI
  o.setUint16(2, 0xffe1, false) // APP1
  o.setUint16(4, 2 + payload.byteLength, false) // segment length
  new Uint8Array(out).set(new Uint8Array(payload), 6)
  return out
}

describe('EXIF orientation parsing', () => {
  it('reads every orientation value in little-endian files', () => {
    for (let o = 1; o <= 8; o++) {
      expect(readExifOrientation(jpegWithOrientation(o, true))).toBe(o)
    }
  })

  it('reads big-endian (MM) files too', () => {
    for (let o = 1; o <= 8; o++) {
      expect(readExifOrientation(jpegWithOrientation(o, false))).toBe(o)
    }
  })

  it('defaults to 1 rather than rotating when the tag is absent or invalid', () => {
    // Safe failure: guessing would rotate a correct photo.
    expect(readExifOrientation(new ArrayBuffer(0))).toBe(1)
    expect(readExifOrientation(new Uint8Array([0xff, 0xd8]).buffer)).toBe(1)
    // Not a JPEG at all (PNG signature).
    expect(readExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBe(1)
    // Valid JPEG structure, out-of-range orientation value.
    expect(readExifOrientation(jpegWithOrientation(42))).toBe(1)
  })

  it('does not run off the end of a truncated file', () => {
    const full = new Uint8Array(jpegWithOrientation(6))
    for (let cut = 1; cut < full.length; cut++) {
      const truncated = full.slice(0, cut)
      expect(() => readExifOrientation(truncated.buffer)).not.toThrow()
    }
  })
})

describe('orientation geometry', () => {
  it('knows which orientations swap the axes', () => {
    // 5-8 involve a transpose, so a portrait sensor frame becomes landscape.
    for (const o of [1, 2, 3, 4] as ExifOrientation[]) {
      expect(orientationSwapsAxes(o)).toBe(false)
    }
    for (const o of [5, 6, 7, 8] as ExifOrientation[]) {
      expect(orientationSwapsAxes(o)).toBe(true)
    }
  })

  it('orientation 1 is the identity transform', () => {
    expect(orientationTransform(1, 100, 50)).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
  })

  it('every transform maps the image corners into the canvas', () => {
    // A transform that pushed content off-canvas would silently crop the photo.
    for (let o = 1 as number; o <= 8; o++) {
      const orientation = o as ExifOrientation
      const swaps = orientationSwapsAxes(orientation)
      // Source is 100x50; canvas dimensions account for the swap.
      const srcW = 100
      const srcH = 50
      const canvasW = swaps ? srcH : srcW
      const canvasH = swaps ? srcW : srcH
      const t = orientationTransform(orientation, canvasW, canvasH)

      const corners = [
        [0, 0],
        [srcW, 0],
        [0, srcH],
        [srcW, srcH],
      ]
      const xs: number[] = []
      const ys: number[] = []
      for (const [x, y] of corners) {
        xs.push(t.a * x + t.c * y + t.e)
        ys.push(t.b * x + t.d * y + t.f)
      }
      expect(Math.min(...xs)).toBeCloseTo(0, 6)
      expect(Math.min(...ys)).toBeCloseTo(0, 6)
      expect(Math.max(...xs)).toBeCloseTo(canvasW, 6)
      expect(Math.max(...ys)).toBeCloseTo(canvasH, 6)
    }
  })
})

describe('composing user rotation with EXIF orientation', () => {
  it('four quarter turns returns to the start', () => {
    for (let o = 1 as number; o <= 8; o++) {
      expect(rotateOrientation(o as ExifOrientation, 4)).toBe(o)
    }
  })

  it('zero turns changes nothing', () => {
    for (let o = 1 as number; o <= 8; o++) {
      expect(rotateOrientation(o as ExifOrientation, 0)).toBe(o)
    }
  })

  it('rotates an upright image through the clockwise cycle', () => {
    expect(rotateOrientation(1, 1)).toBe(6) // 90 CW
    expect(rotateOrientation(1, 2)).toBe(3) // 180
    expect(rotateOrientation(1, 3)).toBe(8) // 270 CW
  })

  it('keeps mirrored images mirrored', () => {
    // Rotation must never silently un-mirror a flipped image.
    const mirrored: ExifOrientation[] = [2, 7, 4, 5]
    for (const o of mirrored) {
      for (let t = 0; t < 4; t++) {
        expect(mirrored).toContain(rotateOrientation(o, t))
      }
    }
  })

  it('handles negative turns', () => {
    expect(rotateOrientation(1, -1)).toBe(8)
    expect(rotateOrientation(6, -1)).toBe(1)
  })
})

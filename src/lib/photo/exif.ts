/**
 * Minimal EXIF orientation reader.
 *
 * WHY THIS EXISTS
 * ---------------
 * Phones and action cameras almost always record the sensor in its native
 * landscape orientation and set an EXIF `Orientation` tag saying how to rotate
 * it for display. Browsers honour that tag when rendering an `<img>`, but
 * `canvas.drawImage()` historically does not — so the previous tool drew
 * portrait photos sideways, then re-encoded them through a canvas, which
 * *strips* the EXIF tag. The result was an exported file that was both rotated
 * wrongly and had lost the metadata that would have let a viewer fix it.
 *
 * The fix is to read the tag ourselves and bake the rotation into the pixels,
 * so what is exported matches what was displayed, with no metadata dependency.
 *
 * WHY NOT A LIBRARY
 * -----------------
 * A full EXIF parser is a large dependency for one 16-bit integer. This reads
 * only the `Orientation` tag (0x0112) from the APP1/TIFF header and stops.
 *
 * FORMAT REFERENCE
 * ----------------
 * JPEG: JFIF/EXIF marker structure — segments begin 0xFF <marker> <length:2>.
 * The EXIF APP1 segment (0xFFE1) contains "Exif\0\0" then a TIFF header whose
 * byte order is given by "II" (little-endian) or "MM" (big-endian).
 * Tag 0x0112 is Orientation, values 1–8, per the EXIF 2.3 specification
 * (CIPA DC-008), Table 6.
 */

/** EXIF orientation values 1–8. 1 is "already correct". */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * Read the EXIF orientation tag from a JPEG.
 *
 * @returns 1–8, or 1 when there is no tag, the file is not a JPEG, or the
 *          header is malformed. Defaulting to 1 (no transform) is the safe
 *          failure mode: a missing tag must never rotate a correct image.
 */
export function readExifOrientation(buffer: ArrayBuffer): ExifOrientation {
  const view = new DataView(buffer)

  // JPEG SOI marker.
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return 1

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false)
    // Every segment marker starts 0xFF. Anything else means we have lost sync.
    if ((marker & 0xff00) !== 0xff00) break

    const size = view.getUint16(offset + 2, false)
    if (size < 2) break

    // APP1 — the EXIF segment.
    if (marker === 0xffe1) {
      const exifStart = offset + 4
      if (exifStart + 6 > view.byteLength) return 1
      // "Exif\0\0"
      if (view.getUint32(exifStart, false) !== 0x45786966) return 1

      const tiff = exifStart + 6
      if (tiff + 8 > view.byteLength) return 1

      const byteOrder = view.getUint16(tiff, false)
      // "II" = 0x4949 little-endian, "MM" = 0x4d4d big-endian.
      const little = byteOrder === 0x4949
      if (!little && byteOrder !== 0x4d4d) return 1

      // 0x002A magic confirms a valid TIFF header.
      if (view.getUint16(tiff + 2, little) !== 0x002a) return 1

      const ifdOffset = view.getUint32(tiff + 4, little)
      const ifd = tiff + ifdOffset
      if (ifd + 2 > view.byteLength) return 1

      const entries = view.getUint16(ifd, little)
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12
        if (entry + 12 > view.byteLength) return 1
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little)
          if (value >= 1 && value <= 8) return value as ExifOrientation
          return 1
        }
      }
      return 1
    }

    // Start of scan — image data begins, no metadata past here.
    if (marker === 0xffda) break

    offset += 2 + size
  }

  return 1
}

/** True if the orientation swaps width and height. */
export function orientationSwapsAxes(orientation: ExifOrientation): boolean {
  return orientation >= 5 && orientation <= 8
}

/**
 * Canvas transform that bakes an EXIF orientation into the pixels.
 *
 * Returns the transform to apply before `drawImage(img, 0, 0)`, given the
 * *already swapped* canvas dimensions. Values follow EXIF 2.3 Table 6:
 *   1 none · 2 flip-H · 3 rotate 180 · 4 flip-V
 *   5 transpose · 6 rotate 90 CW · 7 transverse · 8 rotate 270 CW
 */
export function orientationTransform(
  orientation: ExifOrientation,
  width: number,
  height: number
): { a: number; b: number; c: number; d: number; e: number; f: number } {
  switch (orientation) {
    case 2:
      return { a: -1, b: 0, c: 0, d: 1, e: width, f: 0 }
    case 3:
      return { a: -1, b: 0, c: 0, d: -1, e: width, f: height }
    case 4:
      return { a: 1, b: 0, c: 0, d: -1, e: 0, f: height }
    case 5:
      return { a: 0, b: 1, c: 1, d: 0, e: 0, f: 0 }
    case 6:
      return { a: 0, b: 1, c: -1, d: 0, e: width, f: 0 }
    case 7:
      return { a: 0, b: -1, c: -1, d: 0, e: width, f: height }
    case 8:
      return { a: 0, b: -1, c: 1, d: 0, e: 0, f: height }
    case 1:
    default:
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  }
}

/**
 * Compose an EXIF orientation with an extra user rotation in 90° steps.
 *
 * Lets the manual rotate button and the EXIF tag share one code path, so the
 * exported pixels always match the preview.
 */
export function rotateOrientation(
  orientation: ExifOrientation,
  quarterTurns: number
): ExifOrientation {
  // Orientation values in clockwise order for the non-mirrored set.
  const cw: ExifOrientation[] = [1, 6, 3, 8]
  // ...and for the mirrored set.
  const mirroredCw: ExifOrientation[] = [2, 7, 4, 5]

  const turns = ((quarterTurns % 4) + 4) % 4
  if (turns === 0) return orientation

  const plain = cw.indexOf(orientation)
  if (plain !== -1) return cw[(plain + turns) % 4]

  const mirrored = mirroredCw.indexOf(orientation)
  if (mirrored !== -1) return mirroredCw[(mirrored + turns) % 4]

  return orientation
}

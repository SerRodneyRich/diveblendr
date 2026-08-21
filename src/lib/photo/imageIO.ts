/**
 * Browser-side image loading and export.
 *
 * Touches DOM/canvas APIs, so it is deliberately separate from the pure modules
 * beside it — those stay testable in node, this one does not.
 */

import {
  readExifOrientation,
  orientationSwapsAxes,
  orientationTransform,
  rotateOrientation,
  type ExifOrientation,
} from './exif'

export interface LoadedImage {
  /** Orientation already baked into these pixels. */
  canvas: HTMLCanvasElement
  width: number
  height: number
  /** The orientation that was found and applied. */
  orientation: ExifOrientation
}

/**
 * Decode a file to a canvas with EXIF orientation baked into the pixels.
 *
 * Baking rather than applying a CSS transform is what makes the export match
 * the preview. The old tool rotated the preview with a CSS `transform` and
 * exported the unrotated canvas, so a photo the user had straightened came out
 * sideways.
 */
export async function loadImage(
  file: File,
  extraQuarterTurns = 0
): Promise<LoadedImage> {
  const arrayBuffer = await file.arrayBuffer()
  const baseOrientation = readExifOrientation(arrayBuffer)

  const bitmap = await decodeToBitmap(file)

  try {
    const orientation = rotateOrientation(baseOrientation, extraQuarterTurns)
    const swaps = orientationSwapsAxes(orientation)

    const canvasWidth = swaps ? bitmap.height : bitmap.width
    const canvasHeight = swaps ? bitmap.width : bitmap.height

    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = canvasHeight

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas 2D is unavailable in this browser')

    const t = orientationTransform(orientation, canvasWidth, canvasHeight)
    ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f)
    ctx.drawImage(bitmap, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    return { canvas, width: canvasWidth, height: canvasHeight, orientation }
  } finally {
    // Release the decoded bitmap's memory immediately rather than waiting for
    // GC. A handful of 12 MP bitmaps is hundreds of megabytes.
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()
  }
}

async function decodeToBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // `imageOrientation: 'none'` is important: we apply orientation ourselves, and
  // browsers that auto-apply it would otherwise rotate twice.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'none' })
    } catch {
      // Fall through to the <img> path — Safari has historically been patchy.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not decode this image'))
      img.src = url
    })
  } finally {
    // Revoke as soon as the image has decoded. The previous implementation
    // created an object URL per load and never revoked one, leaking a
    // full-resolution blob on every re-process.
    URL.revokeObjectURL(url)
  }
}

/** Draw a canvas scaled to fit within `maxEdge`, for fast preview work. */
export function downscale(source: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height))
  if (scale >= 1) return source

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return source
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp'

export interface ExportOptions {
  format: ExportFormat
  /** 0–1. Ignored for PNG, which is lossless. */
  quality: number
}

/** Encode a canvas to a Blob. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  options: ExportOptions
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not encode the image'))
      },
      options.format,
      options.format === 'image/png' ? undefined : options.quality
    )
  })
}

/** File extension matching the encoded bytes. */
export function extensionFor(format: ExportFormat): string {
  switch (format) {
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return 'jpg'
  }
}

/**
 * Build the download filename.
 *
 * The old implementation kept the *original* extension while always encoding
 * JPEG, so a `.png` upload downloaded as `.png` containing JPEG bytes.
 */
export function exportFilename(originalName: string, format: ExportFormat): string {
  const stem = originalName.replace(/\.[^.]+$/, '') || 'photo'
  return `${stem}-corrected.${extensionFor(format)}`
}

/**
 * Photo preparation for the share card: colour correction and crop framing.
 *
 * Both reuse work that already exists rather than duplicating it — the colour
 * correction is the underwater model from `src/lib/photo`, and the crop is the
 * same `cover` arithmetic the renderer uses, with the framing exposed so the
 * diver can move the visible window instead of accepting a centre crop.
 *
 * Pure and framework-free: everything here takes and returns canvases or plain
 * numbers, so the card renderer stays the only thing that touches the output
 * context.
 */

import { estimateWhiteBalance } from '../photo/autoWhiteBalance'
import { DEFAULT_SETTINGS, processBuffer, type CorrectionSettings } from '../photo/pipeline'

/**
 * The most red each preset will restore, as a multiple.
 *
 * The editor's own ceiling is 12x — where an 8-bit channel at the noise floor
 * stops carrying scene content. That suits a tool with a live preview the
 * diver can back off. A share card is fire-and-forget and stops well short: a
 * real 47 m frame asked for the full 12x, which amplified the red noise floor
 * and blew the image out.
 *
 * The ceiling is per preset, which is also what makes the two presets actually
 * differ. A single shared ceiling clamped both to the same result on any
 * deeply-cast photo — a control that changes nothing is worse than no control,
 * because it claims a choice that does not exist.
 *
 * Both numbers are judgements, not sourced constants: roughly where restoring
 * a starved red channel still looks like color rather than like grain, on the
 * dive photographs tested here. Labelled as estimated for that reason.
 */
const CARD_RED_CEILING: Record<PhotoCorrectionId, number> = {
  none: 1,
  auto: 3.5,
  strong: 6,
}

/**
 * How the photo sits inside the card.
 *
 * `cover` scaling always crops one axis. `offsetX`/`offsetY` say which part of
 * that axis survives, as a fraction from 0 (top/left) to 1 (bottom/right);
 * 0.5 is the centre crop that was previously the only option. A diver whose
 * subject is low in the frame — the usual case, since you shoot downward at a
 * reef — had no way to keep it.
 */
export interface PhotoFraming {
  /** 0 = show the left edge, 1 = the right edge, 0.5 = centred. */
  offsetX: number
  /** 0 = show the top, 1 = the bottom, 0.5 = centred. */
  offsetY: number
  /** 1 = fill exactly; above 1 zooms in, cropping more. */
  zoom: number
}

export const DEFAULT_FRAMING: PhotoFraming = { offsetX: 0.5, offsetY: 0.5, zoom: 1 }

/**
 * The rectangle to draw a photo into so it covers the box at the requested
 * framing.
 *
 * Generalises `coverRect`: at the default framing it produces exactly the same
 * centred rectangle, so nothing changes for a diver who never touches the
 * controls.
 */
export function framedRect(
  imageW: number,
  imageH: number,
  boxW: number,
  boxH: number,
  framing: PhotoFraming = DEFAULT_FRAMING
): { x: number; y: number; w: number; h: number } {
  const zoom = Math.max(1, framing.zoom)
  const scale = Math.max(boxW / imageW, boxH / imageH) * zoom
  const w = imageW * scale
  const h = imageH * scale

  // Overflow is what the crop consumes. With none on an axis the offset has
  // nothing to move, so it is ignored rather than pushing the image off-box.
  const overflowX = w - boxW
  const overflowY = h - boxH
  const clampFraction = (v: number) => Math.min(1, Math.max(0, v))

  return {
    x: -overflowX * clampFraction(framing.offsetX),
    y: -overflowY * clampFraction(framing.offsetY),
    w,
    h,
  }
}

/**
 * Correction presets for the share card.
 *
 * The full editor exposes every slider; a card only needs "leave it alone" or
 * "fix the water". Offering the whole panel here would duplicate the photo
 * editor badly rather than reusing it — the diver who wants that goes to the
 * editor and comes back with a corrected file.
 */
export type PhotoCorrectionId = 'none' | 'auto' | 'strong'

/**
 * Correction presets for the share card.
 *
 * The full editor exposes every slider; a card only needs "leave it alone" or
 * "fix the water". Offering the whole panel here would duplicate the photo
 * editor badly rather than reusing it.
 *
 * WHY "DEEP" IS NOT "AUTO PLUS THE PHYSICAL MODEL".
 *
 * It was, and it blew out. Auto white balance already removes the cast the
 * water caused — that is the whole job. Layering Beer-Lambert on top corrects
 * the same physics a second time, and the two multiply: on a mildly blue frame
 * auto asks for 3.0x red while the stacked version asked for 12.0x, which is
 * the hard cap. Saturated, not stronger. On a genuinely deep frame both hit
 * 12.0x, so the two presets became indistinguishable at exactly the depth
 * where the choice was supposed to matter. Measured, not assumed.
 *
 * "Deep" now works the same way as auto and simply pushes it further — full
 * strength plus more vibrance and a black-point lift for the backscatter veil
 * — with the physical model left to the editor, where the diver can enter the
 * depth and distance it actually needs.
 */
export const PHOTO_CORRECTIONS: Record<
  PhotoCorrectionId,
  { label: string; note: string; settings: CorrectionSettings | null }
> = {
  none: {
    label: 'As shot',
    note: 'The photo exactly as you took it.',
    settings: null,
  },
  auto: {
    label: 'Auto',
    note: 'Estimates the color cast from the image and removes it.',
    settings: { ...DEFAULT_SETTINGS },
  },
  strong: {
    label: 'Deep',
    note: 'Same correction pushed further, for a heavily blue-cast shot.',
    settings: {
      ...DEFAULT_SETTINGS,
      autoStrength: 1,
      // Deliberately NOT layering the physical model — see the note above.
      usePhysicalModel: false,
      contrast: 0.12,
      vibrance: 0.25,
      // Lifts the milky veil backscatter leaves in a deep frame.
      blackPoint: 0.012,
    },
  },
}

/**
 * Returns a corrected copy of an image, or the original when no correction is
 * asked for.
 *
 * Works on a canvas rather than the source element so the result can be drawn
 * straight into the card, and so the expensive pass runs once per settings
 * change rather than on every card repaint.
 */
export function correctPhoto(
  source: CanvasImageSource & { width: number; height: number },
  correction: PhotoCorrectionId
): HTMLCanvasElement | null {
  const settings = PHOTO_CORRECTIONS[correction].settings
  if (!settings) return null

  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(source, 0, 0)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)

  // Estimate first so the requested gain can be inspected, then dial the
  // strength back if it would exceed what a card should attempt. Reducing
  // `autoStrength` scales the estimate in log space, which keeps the channel
  // ratios — and therefore the hue — rather than fading toward grey.
  const estimate = estimateWhiteBalance(image.data, {
    stride: image.data.length > 4_000_000 ? 7 : 1,
  })
  const ceiling = CARD_RED_CEILING[correction]
  const requested = Math.max(estimate.r, estimate.g, estimate.b)
  const tamed =
    requested > ceiling
      ? {
          ...settings,
          autoStrength:
            settings.autoStrength * (Math.log(ceiling) / Math.log(requested)),
        }
      : settings

  processBuffer(image.data, tamed, { estimate })
  ctx.putImageData(image, 0, 0)
  return canvas
}

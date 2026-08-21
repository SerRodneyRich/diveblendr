/**
 * The share-card renderer.
 *
 * Pure drawing: it takes a `Dive`, a resolved list of stats and a canvas
 * context, and paints. It holds no React and reads no context, so the layout
 * arithmetic is testable and the same code paints the on-screen preview and
 * the exported PNG at full resolution.
 *
 * Colour choices mirror the app's tokens (`src/app/globals.css`) rather than
 * importing them, because a canvas cannot read CSS custom properties from a
 * detached element reliably across browsers. They are stated once here.
 */

import { DEFAULT_FRAMING, framedRect, type PhotoFraming } from './photo'
import type { Dive } from './types'

/**
 * Card sizes. Story is the Strava-like default.
 *
 * The 1200x630 "Link" preview size was dropped: nothing here produces a page
 * for a link unfurler to read, so it was a shape with no destination, and its
 * letterbox aspect forced a separate `compact` layout branch through the whole
 * renderer for a size nobody exported.
 */
export type CardSize = 'portrait' | 'square'

export const CARD_SIZES: Record<CardSize, { w: number; h: number; label: string; note: string }> =
  {
    portrait: { w: 1080, h: 1920, label: 'Story', note: '1080 × 1920 — Instagram/TikTok story' },
    square: { w: 1080, h: 1080, label: 'Square', note: '1080 × 1080 — feed post' },
  }

/**
 * Palette, taken from the app's design tokens. `brand` is BLUE and `accent` is
 * AMBER — the names are the opposite way round from the obvious guess, and
 * inverting them renders a wrong-coloured card that still typechecks.
 */
const PALETTE = {
  brand: '#4aa8e0',
  brandStrong: '#7cc6f2',
  accent: '#f5b428',
  text: '#eaf2fa',
  textMuted: '#a8bed3',
  textSubtle: '#8fa9c0',
  surface0: '#06101c',
  abyss: '#040a12',
  border: '#1c3f5c',
} as const

/** The app's depth gradient, as colour stops. */
const DEPTH_STOPS: [number, string][] = [
  [0, '#14496b'],
  [0.22, '#0d3352'],
  [0.48, '#08213a'],
  [0.78, '#06101c'],
  [1, '#040a12'],
]

/** Built-in gradient backgrounds, as an alternative to a photo. */
export type GradientId = 'depth' | 'dusk' | 'abyss'

export const GRADIENTS: Record<GradientId, { label: string; stops: [number, string][] }> = {
  depth: { label: 'Depth', stops: DEPTH_STOPS },
  dusk: {
    label: 'Dusk',
    stops: [
      [0, '#2a4a6b'],
      [0.35, '#173a5c'],
      [0.7, '#0b1d31'],
      [1, '#040a12'],
    ],
  },
  abyss: {
    label: 'Abyss',
    stops: [
      [0, '#0b2137'],
      [0.5, '#071627'],
      [1, '#020609'],
    ],
  },
}

/** Every stat the card can show. */
/**
 * Every stat the card can show.
 *
 * `avgDepth` was removed: on a card meant to be read in a feed it is the one
 * number nobody quotes, and it competed for a slot with max depth and run
 * time, which are what a dive is remembered by. `timeWeightedAvgDepth` still
 * computes it for the `Dive` model, where a gas calculation may want it.
 */
export type StatId =
  | 'maxDepth'
  | 'duration'
  | 'waterTemp'
  | 'date'
  | 'surfaceInterval'
  | 'gas'
  | 'diveNumber'

/** One rendered stat: already formatted for the diver's unit preference. */
export interface CardStat {
  id: StatId
  label: string
  value: string
  unit?: string
  /**
   * Additional lines stacked under `value`, at the same size.
   *
   * Exists for the gas list. A technical dive carries three or four mixes, and
   * "19/15 · EAN51 · Air" on one line is three times the width of every other
   * figure in the row — it either clipped or dragged the whole row's type size
   * down to fit one stat.
   */
  extraLines?: string[]
}

export interface CardOptions {
  size: CardSize
  /** Title line, e.g. a site name. Blank hides it. */
  title: string
  /** Small line under the title. */
  subtitle: string
  stats: CardStat[]
  /** A decoded photo to composite behind everything. */
  background?: CanvasImageSource | null
  /**
   * Which part of the photo survives the crop. Defaults to the centre, which
   * is what `cover` alone produces.
   */
  framing?: PhotoFraming
  gradient: GradientId
  /** Show the DiveBlendr wordmark bottom-left. */
  showBranding: boolean
  /**
   * Set when the background photo was corrected by this app, which the card
   * says so the viewer knows the colour is restored rather than as-shot.
   */
  photoCorrected?: boolean
  /**
   * Which half the profile occupies. With a photo behind the card the subject
   * is rarely centred, so the diver needs to move the chrome off it rather
   * than crop around a fixed layout.
   */
  profilePosition: 'top' | 'bottom'
  /**
   * Colour the trace amber where the computer had a decompression obligation,
   * and tick the stop depths it called. Ignored when the file carried no deco
   * data.
   */
  showDeco: boolean
}

/** Paints a vertical gradient across the whole card. */
function paintGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stops: [number, string][]
) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h)
  for (const [offset, colour] of stops) gradient.addColorStop(offset, colour)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
}

/**
 * Draws a photo cropped to fill the card, preserving aspect ratio.
 *
 * `cover` semantics, not `stretch`: a squashed photograph is the single most
 * obvious tell of a generated graphic.
 */
export function coverRect(
  imageW: number,
  imageH: number,
  boxW: number,
  boxH: number
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(boxW / imageW, boxH / imageH)
  const w = imageW * scale
  const h = imageH * scale
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h }
}

/**
 * Scrim over a background photo.
 *
 * Without this, white text over a bright sunlit shot is unreadable. Two layers:
 * a flat wash that guarantees a floor of darkness whatever the photo, and a
 * bottom-weighted gradient under the stats block where the text density is
 * highest. Checked by eye against a bright photo, not assumed.
 */
/**
 * Darkens the half of the card that carries text, so a photograph keeps its
 * own half legible. Which half depends on where the profile and stats sit.
 */
function paintScrim(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  side: 'top' | 'bottom'
) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  // BOTH ends are darkened, because both carry text: the profile sits at one
  // end and the stat row at the other, with the clear window between them.
  // An earlier version darkened only the profile's end, so the white stat
  // figures at the opposite end sat on the brightest part of the photograph
  // and washed out — visible on a real shot, where "DIVE TIME" and
  // "WATER TEMP" nearly vanished against sunlit water.
  //
  // The profile end takes the heavier scrim: a thin trace over a busy reef
  // needs more separation than a row of bold figures does. `side` says which
  // end that is.
  const heavy = 'rgba(4, 10, 18, 0.86)'
  const firm = 'rgba(4, 10, 18, 0.66)'
  const clear = 'rgba(4, 10, 18, 0.24)'

  if (side === 'bottom') {
    // Profile at the foot.
    g.addColorStop(0, firm)
    g.addColorStop(0.18, clear)
    g.addColorStop(0.62, clear)
    g.addColorStop(1, heavy)
  } else {
    // Profile at the head.
    g.addColorStop(0, heavy)
    g.addColorStop(0.38, clear)
    g.addColorStop(0.82, clear)
    g.addColorStop(1, firm)
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}


/**
 * Resamples the profile down to at most `maxPoints` points.
 *
 * A 90-minute dive at 1 Hz is 5400 samples across ~900 px of card: more than
 * six per pixel, which costs draw time and renders no differently. Keeps the
 * deepest sample in each bucket so the profile's peak is never smoothed away —
 * the max depth line must agree with the curve it is drawn beside.
 */
export function resampleProfile(
  samples: Dive['samples'],
  maxPoints: number
): Dive['samples'] {
  if (samples.length <= maxPoints) return samples

  const bucketSize = samples.length / maxPoints
  const out: Dive['samples'] = []
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * bucketSize)
    const end = Math.min(samples.length, Math.floor((i + 1) * bucketSize))
    let deepest = samples[start]
    for (let j = start; j < end; j++) {
      if (samples[j].depth > deepest.depth) deepest = samples[j]
    }
    out.push(deepest)
  }
  // Always keep the true final sample so the curve returns to the surface.
  const last = samples[samples.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/**
 * Maps the profile into a drawing box.
 *
 * Depth increases *downward*: a dive profile that rises with depth reads as a
 * mountain and is the classic mistake here. y = top + depth/scale.
 */
export function profilePath(
  samples: Dive['samples'],
  maxDepth: number,
  duration: number,
  box: { x: number; y: number; w: number; h: number }
): { x: number; y: number }[] {
  // Headroom so the deepest point is not welded to the bottom edge.
  const depthScale = Math.max(maxDepth, 1) * 1.08
  const span = Math.max(duration, 1)
  return samples.map((s) => ({
    x: box.x + (s.t / span) * box.w,
    y: box.y + (s.depth / depthScale) * box.h,
  }))
}

/**
 * Paints the whole card.
 *
 * The canvas is assumed to already be sized to `CARD_SIZES[size]`; the caller
 * decides whether that is a full-resolution export canvas or a scaled preview.
 */
export function renderCard(ctx: CanvasRenderingContext2D, dive: Dive, options: CardOptions) {
  const { w, h } = CARD_SIZES[options.size]
  const atBottom = options.profilePosition === 'bottom'

  ctx.clearRect(0, 0, w, h)

  // --- Background --------------------------------------------------------
  if (options.background) {
    const source = options.background as HTMLImageElement
    const iw = source.width || w
    const ih = source.height || h
    const rect = framedRect(iw, ih, w, h, options.framing ?? DEFAULT_FRAMING)
    ctx.drawImage(options.background, rect.x, rect.y, rect.w, rect.h)
    // The scrim follows the chrome: it darkens the half carrying text so the
    // photo keeps its own half clear.
    paintScrim(ctx, w, h, atBottom ? 'bottom' : 'top')
  } else {
    paintGradient(ctx, w, h, GRADIENTS[options.gradient].stops)
  }

  const margin = Math.round(w * 0.075)
  const contentW = w - margin * 2

  // --- Block heights -----------------------------------------------------
  // The stat row is one line of type, not a grid of panels, so it needs a
  // fixed slab rather than "whatever is left" — which is what let four boxes
  // grow into half the card.
  const statsH = statsHeight(options.stats, w)
  const brandingH = options.showBranding ? Math.round(h * 0.05) : 0
  const headerH = measureHeader(ctx, options, w, contentW)

  // THE EMPTY AREA IS A PHOTO WINDOW, NOT WASTED SPACE.
  //
  // The chrome sizes itself to what is behind it. Over a gradient there is
  // nothing to look at, so the profile expands to fill the card and the
  // layout reads as a designed graphic. Over a photograph the same expansion
  // would bury the picture, so the chrome contracts to a band and deliberately
  // leaves the rest clear — that gap is the subject.
  const gap = Math.round(h * 0.035)
  const free = h - margin * 2 - headerH - statsH - brandingH - gap * 2

  const profileH = options.background
    ? // Enough to read the dive shape, no more. The remainder is the window
      // between the two blocks, which is where the photograph shows.
      Math.round(h * (options.size === 'square' ? 0.24 : 0.2))
    : // Nothing behind to reveal, so the profile takes the slack and the card
      // reads as a designed graphic rather than one with a hole in it.
      Math.max(Math.round(h * 0.22), free)

  // The profile and the stats sit at OPPOSITE ends, with the photo window
  // between them — not stacked together at one end, which left the whole
  // other end blank and the two blocks crowding each other.
  let profileY: number
  let statsY: number

  if (atBottom) {
    // Profile at the foot; stats at the very top. `headerH` collapses to
    // almost nothing when there is no title or subtitle, so with the default
    // empty wording the figures start at the top margin itself.
    profileY = h - margin - brandingH - profileH
    statsY = margin + headerH
  } else {
    // Profile under the header, stats down at the foot.
    profileY = margin + headerH
    statsY = h - margin - brandingH - statsH
  }

  // --- Header ------------------------------------------------------------
  drawHeader(ctx, options, margin, contentW, w)

  // --- Profile -----------------------------------------------------------
  drawProfile(
    ctx,
    dive,
    { x: margin, y: profileY, w: contentW, h: profileH },
    options.showDeco
  )

  // --- Stats -------------------------------------------------------------
  drawStats(ctx, options.stats, { x: margin, y: statsY, w: contentW, h: statsH }, w)

  // --- Branding ----------------------------------------------------------
  if (options.showBranding) {
    const brandSize = Math.round(w * 0.028)
    ctx.font = `700 ${brandSize}px ${SANS}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const baseline = h - margin

    ctx.fillStyle = PALETTE.brand
    ctx.fillText('Dive', margin, baseline)
    const diveWidth = ctx.measureText('Dive').width
    ctx.fillStyle = PALETTE.accent
    ctx.fillText('Blendr', margin + diveWidth, baseline)

    ctx.textAlign = 'right'
    ctx.fillStyle = PALETTE.textSubtle
    ctx.font = `500 ${Math.round(brandSize * 0.85)}px ${SANS}`
    ctx.fillText(
      options.photoCorrected ? 'DiveBlendr corrected' : 'diveblendr.com',
      w - margin,
      baseline
    )
  }
}

/** Font stacks. Geist is the app's face; the fallbacks matter for the export. */
const SANS = '"Geist", "Geist Sans", system-ui, -apple-system, "Helvetica Neue", sans-serif'
const MONO = '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace'

/** How tall the title/subtitle block will be, so the profile can start below it. */
function measureHeader(
  ctx: CanvasRenderingContext2D,
  options: CardOptions,
  w: number,
  contentW: number
): number {
  // No wording means no band at all — not an empty one that still pushes the
  // stat row down off the top edge.
  if (!options.title.trim() && !options.subtitle.trim()) return 0

  let height = Math.round(w * 0.02)
  if (options.title.trim()) {
    const titleSize = Math.round(w * 0.072)
    ctx.font = `700 ${titleSize}px ${SANS}`
    height += wrapText(ctx, options.title.trim(), contentW, 2).length * titleSize * 1.16
  }
  if (options.subtitle.trim()) height += Math.round(w * 0.032) * 1.6
  return Math.round(height)
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  options: CardOptions,
  margin: number,
  contentW: number,
  w: number
) {
  let cursorY = margin + Math.round(w * 0.055)

  if (options.title.trim()) {
    ctx.fillStyle = PALETTE.text
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const titleSize = Math.round(w * 0.072)
    ctx.font = `700 ${titleSize}px ${SANS}`
    for (const line of wrapText(ctx, options.title.trim(), contentW, 2)) {
      ctx.fillText(line, margin, cursorY)
      cursorY += titleSize * 1.16
    }
  }

  if (options.subtitle.trim()) {
    const subSize = Math.round(w * 0.032)
    ctx.font = `500 ${subSize}px ${SANS}`
    ctx.fillStyle = PALETTE.brandStrong
    ctx.fillText(options.subtitle.trim(), margin, cursorY)
  }
}

/** True when any sample carries a decompression obligation. */
export function hasDecoData(dive: Dive): boolean {
  return dive.samples.some((s) => s.inDeco)
}

/**
 * Draws the depth profile: a surface rule at the top, the curve falling away
 * from it, and a filled area beneath.
 *
 * Where the computer recorded a decompression obligation the trace turns
 * amber, and the stop depths it called are ticked on the right. The colour
 * change is per-segment, so a dive that enters and clears deco more than once
 * reads correctly rather than being painted from first onset to last clear.
 */
function drawProfile(
  ctx: CanvasRenderingContext2D,
  dive: Dive,
  box: { x: number; y: number; w: number; h: number },
  showDeco: boolean
) {
  if (dive.samples.length < 2) return

  const resampled = resampleProfile(dive.samples, Math.round(box.w))
  const points = profilePath(resampled, dive.maxDepth, dive.duration, box)
  const deco = showDeco && resampled.some((s) => s.inDeco)

  // Surface line — the datum the curve descends from.
  ctx.save()
  ctx.strokeStyle = 'rgba(124, 198, 242, 0.5)'
  ctx.lineWidth = Math.max(2, box.w * 0.0022)
  ctx.setLineDash([box.w * 0.012, box.w * 0.012])
  ctx.beginPath()
  ctx.moveTo(box.x, box.y)
  ctx.lineTo(box.x + box.w, box.y)
  ctx.stroke()
  ctx.restore()

  // Filled water column under the curve.
  const fill = ctx.createLinearGradient(0, box.y, 0, box.y + box.h)
  fill.addColorStop(0, 'rgba(74, 168, 224, 0.42)')
  fill.addColorStop(1, 'rgba(74, 168, 224, 0.04)')
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(points[0].x, box.y)
  for (const p of points) ctx.lineTo(p.x, p.y)
  ctx.lineTo(points[points.length - 1].x, box.y)
  ctx.closePath()
  ctx.fill()

  // Stop-depth ticks, behind the trace so the curve stays on top.
  if (deco) {
    const stops = [...new Set(resampled.map((s) => s.stopDepth).filter((d): d is number => !!d))]
    const depthScale = Math.max(dive.maxDepth, 1) * 1.08
    ctx.save()
    ctx.strokeStyle = 'rgba(245, 180, 40, 0.28)'
    ctx.lineWidth = Math.max(1, box.w * 0.0015)
    ctx.setLineDash([box.w * 0.006, box.w * 0.008])
    for (const stop of stops) {
      const y = box.y + (stop / depthScale) * box.h
      ctx.beginPath()
      ctx.moveTo(box.x, y)
      ctx.lineTo(box.x + box.w, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  // The trace, drawn segment by segment so deco can change colour mid-dive.
  ctx.lineWidth = Math.max(3, box.w * 0.005)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (!deco) {
    ctx.strokeStyle = PALETTE.brandStrong
    ctx.beginPath()
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
  } else {
    for (let i = 1; i < points.length; i++) {
      // A segment is "in deco" if either end is: the obligation starts
      // somewhere inside the segment, and colouring the whole of it errs
      // toward showing the obligation rather than hiding it.
      const inDeco = !!(resampled[i - 1].inDeco || resampled[i].inDeco)
      ctx.strokeStyle = inDeco ? PALETTE.accent : PALETTE.brandStrong
      ctx.beginPath()
      ctx.moveTo(points[i - 1].x, points[i - 1].y)
      ctx.lineTo(points[i].x, points[i].y)
      ctx.stroke()
    }
  }

  // Mark the deepest point — the moment the card is really about.
  const deepest = points.reduce((a, b) => (b.y > a.y ? b : a))
  const r = Math.max(5, box.w * 0.008)
  // Ringed in the card's darkest ink: a plain dot in either palette colour
  // vanishes against a trace of the same colour, which is exactly where it
  // sits when the deepest point is in deco.
  ctx.beginPath()
  ctx.arc(deepest.x, deepest.y, r * 1.75, 0, Math.PI * 2)
  ctx.fillStyle = PALETTE.abyss
  ctx.fill()
  ctx.beginPath()
  ctx.arc(deepest.x, deepest.y, r, 0, Math.PI * 2)
  ctx.fillStyle = deco ? PALETTE.accent : PALETTE.brandStrong
  ctx.fill()

  // Labels. "Surface" sits just under its own rule; the deco key only appears
  // when there is deco to explain.
  const labelSize = Math.round(box.w * 0.024)
  ctx.font = `500 ${labelSize}px ${SANS}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = PALETTE.textSubtle
  ctx.fillText('Surface', box.x, box.y + labelSize * 0.5)

  if (deco) {
    // ABOVE the surface rule, not below it. A dive surfaces at the right-hand
    // edge by definition, so anything drawn inside the plot at that corner is
    // drawn on top of the trace — which is where this key kept landing.
    ctx.textAlign = 'right'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = PALETTE.accent
    ctx.fillText('In deco', box.x + box.w, box.y - labelSize * 0.55)
    // Swatch, so the colour is named rather than merely implied.
    const swatchW = labelSize * 0.9
    const textW = ctx.measureText('In deco').width
    ctx.fillRect(
      box.x + box.w - textW - swatchW - labelSize * 0.4,
      box.y - labelSize * 1.05,
      swatchW,
      Math.max(2, labelSize * 0.16)
    )
  }
}

/**
 * Draws the stats as one row of typography — value above a small-caps label,
 * no panels and no rules.
 *
 * The previous version drew each stat in its own glass box on a grid. At
 * story size that made four slabs occupying a third of the card, which is
 * what a photo background has to compete with. A row of bold figures reads
 * faster, survives being scaled down in a feed, and leaves the photograph
 * visible — which is the point of putting one behind it.
 */
function drawStats(
  ctx: CanvasRenderingContext2D,
  stats: CardStat[],
  box: { x: number; y: number; w: number; h: number },
  cardW: number
) {
  if (stats.length === 0) return

  const cols = Math.min(stats.length, 4)
  const shown = stats.slice(0, cols)
  const cellW = box.w / cols
  const labelSize = Math.round(cardW * 0.021)

  // LABELS ON TOP, VALUES BENEATH.
  //
  // With the label under the value, a stat whose value stacks — the gas list —
  // pushed its own label away from the row the others sat on, so the labels no
  // longer lined up. Above the value they share one baseline whatever any
  // value does underneath.
  //
  // The row is then sized to its WIDEST line, counting stacked ones and the
  // label itself. A fixed size per column clipped "Sep 26, 2025" mid-word
  // while three shorter figures beside it had room to spare: the column was
  // wide enough, the type was not sized to fit it.
  const gutter = cardW * 0.018
  const start = Math.round(cardW * (cols >= 4 ? 0.062 : cols === 3 ? 0.072 : 0.086))
  const floor = Math.round(cardW * 0.03)

  const fits = (size: number) =>
    shown.every((stat) => {
      const lines = [stat.value, ...(stat.extraLines ?? [])]
      for (const [i, line] of lines.entries()) {
        ctx.font = `700 ${size}px ${MONO}`
        let width = ctx.measureText(line).width
        // Only the first line carries the unit.
        if (i === 0 && stat.unit) {
          ctx.font = `500 ${Math.round(size * 0.44)}px ${SANS}`
          width += ctx.measureText(stat.unit).width + cardW * 0.007
        }
        if (width > cellW - gutter) return false
      }
      return true
    })

  let valueSize = start
  while (valueSize > floor && !fits(valueSize)) valueSize -= 2

  // Labels never truncate either: they shrink until the longest one fits.
  let labelPx = labelSize
  const labelsFit = (size: number) =>
    shown.every((stat) => {
      ctx.font = `600 ${size}px ${SANS}`
      return ctx.measureText(stat.label.toUpperCase()).width <= cellW - gutter
    })
  while (labelPx > Math.round(cardW * 0.013) && !labelsFit(labelPx)) labelPx -= 1

  shown.forEach((stat, i) => {
    const x = box.x + i * cellW
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    // Label first, on a baseline shared across the whole row.
    ctx.font = `600 ${labelPx}px ${SANS}`
    ctx.fillStyle = PALETTE.textSubtle
    ctx.fillText(stat.label.toUpperCase(), x, box.y + labelPx)

    // Value, with its unit trailing at a smaller size.
    let lineY = box.y + labelPx + valueSize * 1.15
    ctx.font = `700 ${valueSize}px ${MONO}`
    ctx.fillStyle = i === 0 ? PALETTE.accent : PALETTE.text
    ctx.fillText(stat.value, x, lineY)

    if (stat.unit) {
      const valueWidth = ctx.measureText(stat.value).width
      ctx.font = `500 ${Math.round(valueSize * 0.44)}px ${SANS}`
      ctx.fillStyle = PALETTE.textMuted
      ctx.fillText(stat.unit, x + valueWidth + cardW * 0.007, lineY)
    }

    // Stacked lines — the gas list — under the first, same size and colour.
    for (const line of stat.extraLines ?? []) {
      lineY += valueSize * 1.12
      ctx.font = `700 ${valueSize}px ${MONO}`
      ctx.fillStyle = i === 0 ? PALETTE.accent : PALETTE.text
      ctx.fillText(line, x, lineY)
    }
  })
}

/** How tall the stat row needs to be, including any stacked values. */
export function statsHeight(stats: CardStat[], cardW: number): number {
  if (stats.length === 0) return 0
  const cols = Math.min(stats.length, 4)
  const valueSize = Math.round(cardW * (cols >= 4 ? 0.062 : cols === 3 ? 0.072 : 0.086))
  const labelSize = Math.round(cardW * 0.021)
  const maxExtra = Math.max(0, ...stats.slice(0, cols).map((s) => s.extraLines?.length ?? 0))
  return Math.round(labelSize + valueSize * 1.15 + maxExtra * valueSize * 1.12 + valueSize * 0.35)
}

/** Greedy word wrap, capped at `maxLines` with an ellipsis on overflow. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (ctx.measureText(candidate).width <= maxWidth || line === '') {
      line = candidate
    } else {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && line !== '') lines.push(line)

  if (lines.length === maxLines) {
    let last = lines[maxLines - 1]
    if (ctx.measureText(last).width > maxWidth) {
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1)
      }
      lines[maxLines - 1] = `${last}…`
    }
  }
  return lines
}

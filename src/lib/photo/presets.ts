/**
 * Presets, derived from the model rather than typed by hand.
 *
 * WHAT REPLACED WHAT
 * ------------------
 * The previous tool shipped 16 presets across 7 categories ("Hero11 Black",
 * "Hero12 Black", "Hero10 Black", "Water Conditions", "Lighting", "Quick Fix",
 * "Emergency"), each a hand-typed set of slider offsets. Two problems:
 *
 * 1. The numbers were invented. Four Hero11 presets stepped redBoost 15/25/35/45
 *    across unequal depth bands — an arithmetic sequence against an exponential
 *    physical process.
 * 2. The camera axis carried no information. "Hero11 15-30ft" and "Hero10
 *    10-25ft" differed by 3 units of an undefined scale. A camera's effect on
 *    colour is its spectral response and white-balance behaviour; a scalar red
 *    gain expresses neither.
 *
 * A preset here is instead just a **named point in the model's input space** —
 * water type, depth, distance. The actual gains are computed by
 * `attenuation.ts` at apply time. Change the physics and every preset updates;
 * there is no table to drift out of sync.
 *
 * The navigable axis is the one that carries information: what the water looks
 * like, and how deep. That is the choice a diver can actually answer.
 */

import type { CorrectionSettings } from './pipeline'
import { DEFAULT_SETTINGS } from './pipeline'
import type { WaterTypeId } from './water'

export interface PhotoPreset {
  id: string
  name: string
  /** What a diver would recognise. */
  description: string
  settings: Partial<CorrectionSettings>
}

/**
 * The default: let the image speak for itself. No dive details required.
 * This is the path most users should never need to leave.
 */
export const AUTO_PRESET: PhotoPreset = {
  id: 'auto',
  name: 'Auto',
  description: 'Estimates the correction from the photo itself. No dive details needed.',
  settings: {
    autoWhiteBalance: true,
    autoStrength: 0.85,
    usePhysicalModel: false,
    contrast: 0.08,
    vibrance: 0.15,
  },
}

/** Depth bands, geometric rather than arithmetic — attenuation is exponential. */
const DEPTH_BANDS: { id: string; label: string; depth: number }[] = [
  { id: 'shallow', label: 'Shallow (0–5 m)', depth: 3 },
  { id: 'mid', label: 'Mid (5–15 m)', depth: 10 },
  { id: 'deep', label: 'Deep (15–30 m)', depth: 22 },
  { id: 'verydeep', label: 'Very deep (30 m+)', depth: 35 },
]

/**
 * The water conditions a diver can actually identify by looking, mapped onto
 * Jerlov types. Five options rather than ten — the intermediate Jerlov types
 * are not distinguishable by eye, so offering them would be false precision.
 */
const WATER_CHOICES: { id: string; label: string; type: WaterTypeId }[] = [
  { id: 'tropical', label: 'Tropical blue', type: 'IB' },
  { id: 'temperate', label: 'Temperate blue', type: 'II' },
  { id: 'coastal', label: 'Clear coastal', type: '1C' },
  { id: 'green', label: 'Green water', type: '5C' },
  { id: 'murky', label: 'Murky / low viz', type: '7C' },
]

/**
 * How hard to correct, and how much to lean on tone instead, by depth band.
 *
 * WHY THE DEEP BANDS CORRECT *LESS*, NOT MORE.
 *
 * The intuition is backwards. Attenuation is exponential, so the deeper the
 * shot the more red the physics says to restore — but past roughly 8 m of
 * water path there is no red left in the file to restore. In clear ocean the
 * red channel transmits `exp(-0.37 · path)`: at 20 m the model wants 545x, at
 * 48 m it wants 4,300,000x, and only 1.6e-8 of the red light ever reached the
 * sensor. Amplifying that is amplifying quantisation noise.
 *
 * A real 47 m photograph came back with radioactive green kelp and orange
 * rock for exactly this reason. What actually rescues a deep frame is tone —
 * lifting exposure, adding contrast to cut the haze, and restoring saturation
 * — with only a light hand on the cast. So `physicalStrength` falls with
 * depth while exposure, contrast and saturation rise.
 */
const BAND_TREATMENT: Record<
  string,
  { physicalStrength: number; autoStrength: number; exposure: number; contrast: number; saturation: number; vibrance: number }
> = {
  // Shallow: plenty of red survives, so inverting the water is the right move
  // and needs little help from tone.
  shallow: { physicalStrength: 0.7, autoStrength: 0.6, exposure: 0, contrast: 0.06, saturation: 0, vibrance: 0.12 },
  // Mid: still recoverable, starting to need contrast for the haze.
  mid: { physicalStrength: 0.55, autoStrength: 0.6, exposure: 0.08, contrast: 0.1, saturation: 0.05, vibrance: 0.16 },
  // Deep: the cast correction is near its useful limit; tone does the work.
  deep: { physicalStrength: 0.35, autoStrength: 0.5, exposure: 0.18, contrast: 0.16, saturation: 0.12, vibrance: 0.2 },
  // Very deep: ambient red is gone. Correcting the cast harder only invents
  // colour, so this is almost entirely a tone-and-clarity treatment.
  verydeep: { physicalStrength: 0.2, autoStrength: 0.4, exposure: 0.25, contrast: 0.2, saturation: 0.18, vibrance: 0.22 },
}

/**
 * Presets generated from the cross product of water condition and depth.
 *
 * These set `usePhysicalModel: true` *and* leave the auto white balance on.
 * The physical model is a prior layered on the image-driven estimate, not a
 * replacement: the estimate handles whatever the camera already did, the model
 * handles what the water did. Both are held to the recoverable-red ceiling in
 * `attenuation.ts`, so neither can run away on a deep frame.
 */
export const CONDITION_PRESETS: PhotoPreset[] = WATER_CHOICES.flatMap((water) =>
  DEPTH_BANDS.map((band) => {
    const treat = BAND_TREATMENT[band.id]
    return {
      id: `${water.id}-${band.id}`,
      name: `${water.label} · ${band.label}`,
      description: `Jerlov ${water.type} at ${band.depth} m`,
      settings: {
        autoWhiteBalance: true,
        autoStrength: treat.autoStrength,
        usePhysicalModel: true,
        waterType: water.type,
        depth: band.depth,
        distance: 1.5,
        physicalStrength: treat.physicalStrength,
        exposure: treat.exposure,
        contrast: treat.contrast,
        saturation: treat.saturation,
        vibrance: treat.vibrance,
        // Backscatter leaves a milky veil that grows with path length; a small
        // black-point lift removes it and is what makes a deep frame read as
        // clear rather than merely brighter.
        blackPoint: band.id === 'deep' ? 0.01 : band.id === 'verydeep' ? 0.018 : 0,
      } satisfies Partial<CorrectionSettings>,
    }
  })
)

/**
 * "I used a strobe or video light." Artificial light travels only the short
 * return leg from subject to camera, so the long downwelling leg is irrelevant
 * and very little colour correction is warranted — over-correcting strobe-lit
 * shots is the classic way to turn good photos orange.
 */
export const ARTIFICIAL_LIGHT_PRESET: PhotoPreset = {
  id: 'artificial-light',
  name: 'Strobe / video light',
  description:
    'Subject lit artificially — only the short camera-to-subject path needs correcting.',
  settings: {
    autoWhiteBalance: true,
    autoStrength: 0.35,
    usePhysicalModel: true,
    depth: 0,
    distance: 1.5,
    waterType: 'IB',
    physicalStrength: 0.5,
    contrast: 0.05,
    vibrance: 0.1,
  },
}

export const ALL_PRESETS: PhotoPreset[] = [
  AUTO_PRESET,
  ARTIFICIAL_LIGHT_PRESET,
  ...CONDITION_PRESETS,
]

export { DEPTH_BANDS, WATER_CHOICES }

/** Merge a preset onto the defaults. */
export function applyPreset(preset: PhotoPreset): CorrectionSettings {
  return { ...DEFAULT_SETTINGS, ...preset.settings }
}

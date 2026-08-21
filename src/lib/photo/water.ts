/**
 * Jerlov water types and per-channel attenuation coefficients.
 *
 * THE PHYSICS
 * -----------
 * Light travelling through water is attenuated exponentially with path length
 * (Beer–Lambert):
 *
 *     T(λ) = exp(-β(λ) · x)
 *
 * where β(λ) is the attenuation coefficient of the water body at wavelength λ
 * and x is the path length in metres. β is strongly wavelength-dependent, which
 * is why colour — not just brightness — is lost with distance.
 *
 * Jerlov (1976) classified the world's water bodies by the spectral shape of
 * the downwelling diffuse attenuation coefficient Kd(λ), giving five oceanic
 * types (I, IA, IB, II, III, clearest to most turbid) and coastal types 1C–9C.
 *
 * THE THING MOST PEOPLE GET WRONG
 * -------------------------------
 * "Red is lost first" is true **only for oceanic water.** In coastal and green
 * water, dissolved organic matter (CDOM) absorbs short wavelengths strongly, so
 * blue is attenuated hardest and *green* penetrates furthest. Berman et al. and
 * Akkaynak et al. both state this explicitly. The previous version of this tool
 * hard-coded "boost red, cut green and blue" for every water type, which is
 * actively wrong in green water — the case its own "Murky Green Water" preset
 * claimed to handle.
 *
 * BAND CENTRES
 * ------------
 * A camera integrates β(λ) against its spectral response. Following the
 * underwater-restoration literature (Berman, Treibitz & Avidan, BMVC 2017 /
 * arXiv:1811.01343), we approximate each channel's response as a delta function
 * at its peak sensitivity: R = 600 nm, G = 525 nm, B = 475 nm. This is
 * camera-agnostic, which matters because real response curves are rarely
 * published.
 *
 * SOURCES
 * -------
 * - Jerlov, N. G. "Marine Optics", Elsevier, 1976 — the classification scheme.
 * - Solonenko, M. G. & Mobley, C. D. "Inherent optical properties of Jerlov
 *   water types", Applied Optics 54(17):5392–5401, 2015 — modern IOP fits.
 * - Mobley, C. D. "Light and Water", Academic Press, 1994, based on measurements
 *   in Austin, R. W. & Petzold, T. J. (1986) — the β(λ) source chain used by the
 *   imaging literature.
 * - Pope, R. M. & Fry, E. S. "Absorption spectrum (380–700 nm) of pure water.
 *   II. Integrating cavity measurements", Applied Optics 36:8710–8723, 1997 —
 *   pure-water absorption, the floor that every water type sits above.
 *
 * HONESTY ABOUT THESE NUMBERS
 * ---------------------------
 * The triplets below are **DERIVED, not transcribed from a published table.**
 * I could not obtain a machine-readable copy of Jerlov (1976) Tables XXVI/XXVII
 * (the Ocean Optics Web Book's `Jerolv_types.xlsx` asset 404s), and the one
 * published numeric RGB table I did locate is CC BY-NC licensed and therefore
 * incompatible with this project's GPL-3.0 — it was not copied.
 *
 * What these values are: anchored at the clear-water end on Pope & Fry's
 * pure-water absorption at the three band centres (which is a hard physical
 * floor — no water is clearer than pure water), then scaled across the type
 * sequence to reproduce the qualitative structure that all the cited sources
 * agree on:
 *   - oceanic types: β_R >> β_G > β_B, with the ratio narrowing as turbidity rises
 *   - coastal types: β_B rises past β_G, inverting the ordering in the green band
 *   - monotonically increasing total attenuation from I through 9C
 *
 * They are the right order of magnitude and the right shape, and they are
 * adequate for a *correction hint* on a consumer photo. They are NOT a
 * substitute for measured IOPs, and this tool must not present them as such.
 *
 * Further caveat, from Akkaynak et al. (CVPR 2017), "What Is the Space of
 * Attenuation Coefficients in Underwater Computer Vision?": the wideband
 * per-channel coefficient is not a constant of the water at all. It depends on
 * imaging range, scene reflectance, ambient spectrum and camera response. A
 * depth/water-type model is therefore a principled estimate, never a
 * measurement.
 */

/** Band centres in nm, per the delta-response approximation. */
export const BAND_CENTRES_NM = { r: 600, g: 525, b: 475 } as const

/**
 * Pure-water absorption at the three band centres, m^-1.
 *
 * Pope & Fry (1997), "Absorption spectrum (380-700 nm) of pure water. II.
 * Integrating cavity measurements", Table 1: a(600) = 0.2224, a(525) = 0.0417,
 * a(475) = 0.0114. This is the physical floor for any water type — no natural
 * water absorbs less than pure water does.
 *
 * The green and blue figures were previously transcribed as 0.0481 and 0.0111.
 * Nothing rendered differently (every water type's beta sits well above both
 * sets, and these values are used only as a floor), but a constant carrying an
 * exact citation has to match the paper it cites.
 */
export const PURE_WATER_ABSORPTION = { r: 0.2224, g: 0.0417, b: 0.0114 } as const

export type WaterTypeId =
  | 'I'
  | 'IA'
  | 'IB'
  | 'II'
  | 'III'
  | '1C'
  | '3C'
  | '5C'
  | '7C'
  | '9C'

export interface AttenuationCoefficients {
  /** Attenuation coefficient at 600 nm, m^-1. */
  r: number
  /** Attenuation coefficient at 525 nm, m^-1. */
  g: number
  /** Attenuation coefficient at 475 nm, m^-1. */
  b: number
}

export interface WaterType {
  id: WaterTypeId
  /** Short label for the UI. */
  label: string
  /** What a diver would recognise this as. */
  description: string
  /** 'oceanic' | 'coastal' — determines whether red or blue is lost fastest. */
  family: 'oceanic' | 'coastal'
  /** Per-channel attenuation, m^-1. DERIVED — see the module comment. */
  beta: AttenuationCoefficients
}

/**
 * The ten Jerlov types.
 *
 * DERIVED VALUES — see the module header. Structure, not precision, is what
 * these encode: the oceanic sequence keeps red dominant and narrows the spread
 * with turbidity; the coastal sequence raises blue past green so green becomes
 * the deepest-penetrating band.
 */
export const WATER_TYPES: readonly WaterType[] = [
  {
    id: 'I',
    label: 'Oceanic I',
    description: 'Clearest open ocean — tropical blue water, exceptional visibility',
    family: 'oceanic',
    beta: { r: 0.35, g: 0.063, b: 0.031 },
  },
  {
    id: 'IA',
    label: 'Oceanic IA',
    description: 'Very clear open ocean',
    family: 'oceanic',
    beta: { r: 0.36, g: 0.073, b: 0.042 },
  },
  {
    id: 'IB',
    label: 'Oceanic IB',
    description: 'Clear open ocean — typical tropical reef',
    family: 'oceanic',
    beta: { r: 0.37, g: 0.084, b: 0.055 },
  },
  {
    id: 'II',
    label: 'Oceanic II',
    description: 'Moderately clear ocean — typical Mediterranean',
    family: 'oceanic',
    beta: { r: 0.4, g: 0.12, b: 0.095 },
  },
  {
    id: 'III',
    label: 'Oceanic III',
    description: 'Turbid open ocean, approaching coastal',
    family: 'oceanic',
    beta: { r: 0.45, g: 0.17, b: 0.16 },
  },
  {
    id: '1C',
    label: 'Coastal 1C',
    description: 'Clear coastal water',
    family: 'coastal',
    beta: { r: 0.48, g: 0.2, b: 0.22 },
  },
  {
    id: '3C',
    label: 'Coastal 3C',
    description: 'Typical coastal — slight green cast',
    family: 'coastal',
    beta: { r: 0.55, g: 0.29, b: 0.37 },
  },
  {
    id: '5C',
    label: 'Coastal 5C',
    description: 'Green coastal water — kelp, temperate shores',
    family: 'coastal',
    beta: { r: 0.65, g: 0.41, b: 0.62 },
  },
  {
    id: '7C',
    label: 'Coastal 7C',
    description: 'Murky green — estuary, quarry, low visibility',
    family: 'coastal',
    beta: { r: 0.82, g: 0.6, b: 1.0 },
  },
  {
    id: '9C',
    label: 'Coastal 9C',
    description: 'Very turbid — harbour, silty inland water',
    family: 'coastal',
    beta: { r: 1.1, g: 0.89, b: 1.6 },
  },
] as const

const BY_ID = new Map<WaterTypeId, WaterType>(WATER_TYPES.map((w) => [w.id, w]))

export function getWaterType(id: WaterTypeId): WaterType {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`Unknown Jerlov water type: ${id}`)
  return found
}

/**
 * Beer–Lambert transmission over a path.
 *
 * @param beta Attenuation coefficient, m^-1.
 * @param metres Path length. Negative lengths are meaningless and clamp to 0.
 * @returns Fraction of light surviving the path, in (0, 1].
 */
export function transmission(beta: number, metres: number): number {
  if (metres <= 0) return 1
  return Math.exp(-beta * metres)
}

/** Per-channel transmission over a path length. */
export function channelTransmission(
  beta: AttenuationCoefficients,
  metres: number
): AttenuationCoefficients {
  return {
    r: transmission(beta.r, metres),
    g: transmission(beta.g, metres),
    b: transmission(beta.b, metres),
  }
}

/**
 * Which band survives best in this water — the one a diver perceives as the
 * colour cast. Oceanic water reads blue; green coastal water reads green.
 */
export function dominantBand(beta: AttenuationCoefficients): 'r' | 'g' | 'b' {
  if (beta.b <= beta.g && beta.b <= beta.r) return 'b'
  if (beta.g <= beta.r) return 'g'
  return 'r'
}

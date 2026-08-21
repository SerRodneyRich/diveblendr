/**
 * Depth ↔ ambient pressure conversion.
 *
 * Two models are provided deliberately:
 *
 * - `simple` (default) reproduces the diving-industry convention of 1 bar per
 *   10 m of seawater with a 1 bar surface pressure: P = depth/10 + 1. Every
 *   legacy calculator in this app used this inline; centralising it here keeps
 *   their published outputs bit-identical while removing the duplicated literal.
 *
 * - `physical` computes P = P_surface + ρ·g·d, which is what a decompression
 *   planner needs once altitude or fresh water enters the picture.
 *
 * Reference for the hydrostatic form: NOAA Diving Manual (6th ed.), Ch. 2
 * "Physics of Diving" — pressure increases with the product of fluid density,
 * gravitational acceleration and depth.
 *
 * Units: depth in metres, pressure in bar, water density in kg/L.
 */

/** Standard atmosphere at sea level, in bar (CIPM / ISO 2533). */
export const STANDARD_SURFACE_PRESSURE_BAR = 1.01325

/** Standard gravity, m/s² (CGPM 1901). */
export const STANDARD_GRAVITY = 9.80665

/**
 * Nominal seawater density in kg/L.
 * NOAA Diving Manual uses 1.025–1.03 kg/L for seawater; 1.03 is the
 * conservative (denser → higher pressure at depth) end of that range.
 */
export const SEAWATER_DENSITY_KG_L = 1.03

/** Fresh water density in kg/L at ~4 °C. */
export const FRESHWATER_DENSITY_KG_L = 1.0

export type WaterType = 'salt' | 'fresh'

export interface PressureModelOptions {
  /**
   * When true (default), use the 10 msw = 1 bar convention with a 1.0 bar
   * surface pressure. This is what the existing MOD/END/density tools expect.
   */
  simple?: boolean
  /** Surface (atmospheric) pressure in bar. Ignored when `simple` is true. */
  surfacePressureBar?: number
  /** Water density in kg/L. Ignored when `simple` is true. */
  waterDensityKgL?: number
}

const DEFAULT_OPTIONS: Required<PressureModelOptions> = {
  simple: true,
  surfacePressureBar: STANDARD_SURFACE_PRESSURE_BAR,
  waterDensityKgL: SEAWATER_DENSITY_KG_L,
}

function resolve(options?: PressureModelOptions): Required<PressureModelOptions> {
  if (!options) return DEFAULT_OPTIONS
  return {
    simple: options.simple ?? DEFAULT_OPTIONS.simple,
    surfacePressureBar: options.surfacePressureBar ?? DEFAULT_OPTIONS.surfacePressureBar,
    waterDensityKgL: options.waterDensityKgL ?? DEFAULT_OPTIONS.waterDensityKgL,
  }
}

/** Water density in kg/L for a named water type. */
export function waterDensity(type: WaterType): number {
  return type === 'fresh' ? FRESHWATER_DENSITY_KG_L : SEAWATER_DENSITY_KG_L
}

/**
 * Absolute (ambient) pressure at a depth, in bar.
 *
 * @param depthMeters - Depth below the surface, in metres. Must be ≥ 0.
 * @param options - Pressure model. Defaults to the simple 10 msw/bar convention.
 */
export function ambientPressure(depthMeters: number, options?: PressureModelOptions): number {
  if (!Number.isFinite(depthMeters)) {
    throw new Error(`Depth must be a finite number (got ${depthMeters})`)
  }
  if (depthMeters < 0) {
    throw new Error(`Depth cannot be negative (got ${depthMeters} m)`)
  }

  const { simple, surfacePressureBar, waterDensityKgL } = resolve(options)

  if (simple) {
    return depthMeters / 10 + 1
  }

  if (surfacePressureBar <= 0) {
    throw new Error(`Surface pressure must be positive (got ${surfacePressureBar} bar)`)
  }
  if (waterDensityKgL <= 0) {
    throw new Error(`Water density must be positive (got ${waterDensityKgL} kg/L)`)
  }

  // P_gauge [bar] = ρ [kg/L] * 1000 [L/m³] * g [m/s²] * d [m] / 100000 [Pa/bar]
  const hydrostaticBar = (waterDensityKgL * 1000 * STANDARD_GRAVITY * depthMeters) / 100000
  return surfacePressureBar + hydrostaticBar
}

/**
 * Depth in metres corresponding to an absolute pressure, in bar.
 * Inverse of {@link ambientPressure} under the same options.
 */
export function depthFromPressure(pressureBar: number, options?: PressureModelOptions): number {
  if (!Number.isFinite(pressureBar)) {
    throw new Error(`Pressure must be a finite number (got ${pressureBar})`)
  }

  const { simple, surfacePressureBar, waterDensityKgL } = resolve(options)

  if (simple) {
    if (pressureBar < 1) {
      throw new Error(`Absolute pressure must be at least 1 bar (got ${pressureBar})`)
    }
    return (pressureBar - 1) * 10
  }

  if (pressureBar < surfacePressureBar) {
    throw new Error(
      `Absolute pressure must be at least the surface pressure of ${surfacePressureBar} bar (got ${pressureBar})`
    )
  }
  return ((pressureBar - surfacePressureBar) * 100000) / (waterDensityKgL * 1000 * STANDARD_GRAVITY)
}

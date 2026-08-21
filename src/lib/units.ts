/**
 * Unit formatting for message text — pure, framework-free.
 *
 * Carried item C1. Every message the diver reads used to be written in metres
 * and g/L whatever units they had selected, so an imperial page showed
 * "END 39 m exceeds your limit of 30 m" above cards reading 128 ft. Two pages
 * papered over it with a footnote saying warnings are stated in metres.
 *
 * The warnings module and the recommendation engine are pure (roadmap
 * constraint 3) and must not import a React context, so the unit choice
 * arrives as a parameter: a `UnitFormatter` is a plain object of formatting
 * functions. `METRIC_FORMATTER` is the default everywhere, which keeps every
 * existing metric string byte-identical; the pages build an imperial one from
 * `UnitsContext` and pass it in.
 *
 * Calculations stay in metres, bar, °C and g/L throughout. Conversion happens
 * only at the moment a string is built.
 */

/** Feet per metre (exact, by definition of the international foot). */
const FEET_PER_METER = 1 / 0.3048

/** lb/ft³ per g/L. 1 g/L = 1 kg/m³; 1 kg/m³ = 0.0624279606 lb/ft³. */
const LB_PER_CUBIC_FOOT_PER_GRAM_PER_LITER = 0.0624279606

/** psi per bar (1 bar = 100000 Pa; 1 psi = 6894.757293168 Pa). */
const PSI_PER_BAR = 100000 / 6894.757293168

/**
 * Formats a physical quantity into the diver's units, with its unit symbol.
 *
 * Each function takes the value in the app's internal metric unit and returns
 * a display string including the symbol, e.g. `depth(30)` → `"30 m"` or
 * `"98 ft"`.
 */
export interface UnitFormatter {
  /** A depth in metres. */
  depth(meters: number, decimals?: number): string
  /** A gas density in g/L. */
  density(gramsPerLiter: number, decimals?: number): string
  /** A pressure in bar. Partial pressures stay in bar in every system. */
  pressure(bar: number, decimals?: number): string
  /** The bare depth unit symbol, for callers assembling their own text. */
  depthUnit: string
  /** The bare density unit symbol. */
  densityUnit: string
}

/** Trims trailing zeros so "30.0 m" prints as "30 m". */
function trim(value: number, decimals: number): string {
  return Number(value.toFixed(decimals)).toString()
}

/**
 * The default. Produces exactly the strings the app has always produced, so
 * passing no formatter anywhere is a no-op.
 */
export const METRIC_FORMATTER: UnitFormatter = {
  depth: (m, decimals = 0) => `${trim(m, decimals)} m`,
  density: (d, decimals = 1) => `${trim(d, decimals)} g/L`,
  pressure: (bar, decimals = 2) => `${trim(bar, decimals)} bar`,
  depthUnit: 'm',
  densityUnit: 'g/L',
}

/**
 * Imperial: feet and lb/ft³.
 *
 * Partial pressures stay in bar. Imperial-unit divers still read ppO₂ in bar —
 * every training agency, table and dive computer states oxygen partial
 * pressure in bar (or the numerically near-identical atm), so converting it to
 * psi would produce a number no diver recognises.
 */
export const IMPERIAL_FORMATTER: UnitFormatter = {
  depth: (m, decimals = 0) => `${trim(m * FEET_PER_METER, decimals)} ft`,
  density: (d, decimals = 2) =>
    `${trim(d * LB_PER_CUBIC_FOOT_PER_GRAM_PER_LITER, decimals)} lb/ft³`,
  pressure: (bar, decimals = 2) => `${trim(bar, decimals)} bar`,
  depthUnit: 'ft',
  densityUnit: 'lb/ft³',
}

/** Picks a formatter from a depth-unit preference. */
export function formatterFor(depthUnit: 'meters' | 'feet'): UnitFormatter {
  return depthUnit === 'feet' ? IMPERIAL_FORMATTER : METRIC_FORMATTER
}

/** Bar → psi, for callers that genuinely want tank pressure in imperial. */
export function barToPsi(bar: number): number {
  return bar * PSI_PER_BAR
}

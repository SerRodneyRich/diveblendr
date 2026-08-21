/**
 * Context-specific conservative rounding.
 *
 * F6 fix. The previous `src/utils/safeRounding.ts` chose rounding direction by
 * *species* — oxygen always down, helium always up — and justified rounding O2
 * down as "safer for MOD". That rationale is backwards:
 *
 *   MOD = (PPO2 / FO2 − 1) × 10
 *
 * MOD varies inversely with FO2, so understating FO2 *deepens* the computed MOD
 * and makes the limit less conservative, not more. The correct rule is that
 * direction depends on what the number is used for:
 *
 * | Context           | Direction for the gas fraction | Why |
 * |-------------------|--------------------------------|-----|
 * | MOD / O2 toxicity | FO2 **up**                     | higher FO2 → shallower MOD → more conservative |
 * | Hypoxia check     | FO2 **down**                   | lower FO2 → deeper breathable ceiling assumed → more conservative |
 * | END / narcosis    | narcotic fraction **up**       | more narcotic gas assumed → deeper END → more conservative |
 * | Density           | mixture mass **up**            | heavier gas assumed → higher work of breathing |
 *
 * Depth *results* keep their existing directions: MOD floors to whole metres
 * (a shallower limit), END ceils (a deeper narcosis estimate).
 */

/** What a rounded gas fraction is going to be used for. */
export type RoundingContext = 'mod' | 'hypoxia' | 'end' | 'density'

function scale(decimals: number): number {
  return Math.pow(10, decimals)
}

function guard(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot round a non-finite value (got ${value})`)
  }
  return value
}

/**
 * Rounds up to `decimals` places, tolerating float representation error.
 * Without the epsilon nudge, `Math.ceil(0.33 * 100) / 100` can return 0.34
 * because 0.33 * 100 evaluates to 33.000000000000004.
 */
export function ceilTo(value: number, decimals: number = 1): number {
  guard(value)
  const m = scale(decimals)
  const scaled = value * m
  const nearest = Math.round(scaled)
  if (Math.abs(scaled - nearest) < 1e-9) return nearest / m
  return Math.ceil(scaled) / m
}

/** Rounds down to `decimals` places, tolerating float representation error. */
export function floorTo(value: number, decimals: number = 1): number {
  guard(value)
  const m = scale(decimals)
  const scaled = value * m
  const nearest = Math.round(scaled)
  if (Math.abs(scaled - nearest) < 1e-9) return nearest / m
  return Math.floor(scaled) / m
}

/** Rounds to nearest at `decimals` places. */
export function roundTo(value: number, decimals: number = 1): number {
  guard(value)
  const m = scale(decimals)
  return Math.round(value * m) / m
}

/**
 * Rounds an oxygen fraction (0–1) or percentage in the conservative direction
 * for the given context.
 *
 * - `'mod'`: rounds **up** — a richer assumed mix yields a shallower MOD.
 * - `'hypoxia'`: rounds **down** — a leaner assumed mix yields a deeper
 *   hypoxic ceiling, so the diver is told to descend sooner.
 * - `'end'` / `'density'`: oxygen is not the driver; rounds to nearest.
 */
export function roundO2(value: number, context: RoundingContext, decimals: number = 1): number {
  switch (context) {
    case 'mod':
      return ceilTo(value, decimals)
    case 'hypoxia':
      return floorTo(value, decimals)
    default:
      return roundTo(value, decimals)
  }
}

/**
 * Rounds a narcotic (nitrogen, or nitrogen+oxygen) fraction conservatively.
 * Always rounds **up** for END purposes: more narcotic gas assumed → deeper END.
 */
export function roundNarcoticFraction(value: number, decimals: number = 1): number {
  return ceilTo(value, decimals)
}

/**
 * Rounds a helium fraction. Helium is neither narcotic nor toxic in the ranges
 * of interest and is the lightest species, so the conservative direction is
 * **down**: assuming less helium overstates both narcosis and density.
 *
 * This reverses the old `RoundingType.HE` rule, which rounded helium up on the
 * grounds that it "ensures adequate helium for narcosis reduction" — but the
 * calculation consumes the *reported* fraction, and overstating helium
 * understates the narcotic and density load the diver will actually experience.
 */
export function roundHe(value: number, decimals: number = 1): number {
  return floorTo(value, decimals)
}

/** MOD in metres: floor to a whole metre for a conservative depth limit. */
export function roundMOD(depthMeters: number): number {
  return Math.floor(guard(depthMeters))
}

/** END in metres: ceil to a whole metre for a conservative narcosis estimate. */
export function roundEND(depthMeters: number): number {
  return Math.ceil(guard(depthMeters))
}

/** A hypoxic ceiling in metres: ceil, so the diver is told to go deeper sooner. */
export function roundHypoxicCeiling(depthMeters: number): number {
  return Math.ceil(guard(depthMeters))
}

/** Gas density in g/L: ceil to 0.1 so the reported density is never understated. */
export function roundDensity(gramsPerLiter: number): number {
  return ceilTo(gramsPerLiter, 1)
}

/** Pressure in bar to 0.1 (display precision, no safety direction). */
export function roundPressure(bar: number): number {
  return roundTo(bar, 1)
}

/** PPO2 in bar: ceil to 0.01 so the reported exposure is never understated. */
export function roundPPO2(bar: number): number {
  return ceilTo(bar, 2)
}

/**
 * Rounds a full mixture to whole percentages such that the result is never less
 * conservative than the input for MOD purposes, and the three still sum to 100.
 *
 * Oxygen goes up (conservative MOD), helium goes down (conservative narcosis
 * and density), and nitrogen absorbs the balance.
 */
export function roundMixToWholePercent(
  o2Percent: number,
  hePercent: number
): { o2: number; he: number; n2: number } {
  const o2 = Math.min(100, ceilTo(guard(o2Percent), 0))
  const he = Math.max(0, Math.min(100 - o2, floorTo(guard(hePercent), 0)))
  return { o2, he, n2: 100 - o2 - he }
}

/**
 * A surface-conditions score for a dive site.
 *
 * **This is an unsourced heuristic, and the only number in this app that is.**
 * Every calculation elsewhere traces to NOAA, Bühlmann, Baker or a named agency
 * standard. No agency publishes a "diveability index", so these thresholds are
 * a judgement about when surface conditions make entry, exit and station-keeping
 * unpleasant or unsafe — not a standard, and not a substitute for looking at
 * the water or asking someone who dives the site.
 *
 * The bands are chosen so that:
 *   - Wave and wind-wave heights are what a diver deals with at the surface,
 *     entering and exiting. Around 1 m is where a shore entry gets awkward;
 *     past 2 m it is a decision, not a nuisance.
 *   - Swell is longer-period energy that matters more at a wall or a pinnacle
 *     than in a bay, so it is weighted slightly below wind chop of the same
 *     height.
 *   - Current is scored hardest per unit: 1 m/s is roughly 2 knots, which is
 *     already beyond what most divers can swim against.
 *
 * Pure and framework-free so it can be tested. It was previously ~20 unnamed
 * magic numbers inside the conditions page component.
 */

export interface ConditionInputs {
  /** Significant wave height, metres. */
  waveHeight?: number | null
  /** Swell wave height, metres. */
  swellHeight?: number | null
  /** Wind wave (chop) height, metres. */
  windWaveHeight?: number | null
  /** Ocean current velocity, m/s. */
  currentVelocity?: number | null
}

export interface ConditionScore {
  /** 0–100, higher is better. */
  score: number
  rating: 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Poor' | 'Very Poor'
  explanation: {
    waveHeight?: number
    swellHeight?: number
    windWaveHeight?: number
    currentVelocity?: number
  }
}

/** A penalty band: at or above `above` metres (or m/s), subtract `penalty`. */
type Band = readonly { readonly above: number; readonly penalty: number }[]

/** Descending order, so the first match is the worst applicable band. */
const WAVE_BANDS: Band = [
  { above: 3, penalty: 40 },
  { above: 2.5, penalty: 30 },
  { above: 2, penalty: 25 },
  { above: 1.5, penalty: 15 },
  { above: 1, penalty: 10 },
  { above: 0.5, penalty: 5 },
]

const SWELL_BANDS: Band = [
  { above: 2.5, penalty: 25 },
  { above: 2, penalty: 20 },
  { above: 1.5, penalty: 15 },
  { above: 1, penalty: 10 },
  { above: 0.5, penalty: 5 },
]

const WIND_WAVE_BANDS: Band = [
  { above: 2, penalty: 20 },
  { above: 1.5, penalty: 15 },
  { above: 1, penalty: 10 },
  { above: 0.5, penalty: 5 },
]

/** Metres per second. 1 m/s ≈ 1.94 knots. */
const CURRENT_BANDS: Band = [
  { above: 2, penalty: 25 },
  { above: 1.5, penalty: 20 },
  { above: 1, penalty: 15 },
  { above: 0.5, penalty: 10 },
]

const RATING_FLOORS = [
  { floor: 85, rating: 'Excellent' },
  { floor: 70, rating: 'Very Good' },
  { floor: 55, rating: 'Good' },
  { floor: 40, rating: 'Fair' },
  { floor: 25, rating: 'Poor' },
] as const

function penaltyFor(value: number | null | undefined, bands: Band): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0
  return bands.find((b) => value > b.above)?.penalty ?? 0
}

/**
 * Scores surface conditions out of 100.
 *
 * Returns `null` when there is no wave height, which is the one reading the
 * score cannot be computed without — the others each contribute zero when
 * absent rather than being guessed at.
 */
export function scoreConditions(inputs: ConditionInputs): ConditionScore | null {
  const { waveHeight, swellHeight, windWaveHeight, currentVelocity } = inputs

  if (waveHeight === null || waveHeight === undefined || !Number.isFinite(waveHeight)) {
    return null
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        penaltyFor(waveHeight, WAVE_BANDS) -
        penaltyFor(swellHeight, SWELL_BANDS) -
        penaltyFor(windWaveHeight, WIND_WAVE_BANDS) -
        penaltyFor(currentVelocity, CURRENT_BANDS)
    )
  )

  const rating = RATING_FLOORS.find((r) => score >= r.floor)?.rating ?? 'Very Poor'

  return {
    score,
    rating,
    explanation: {
      waveHeight: waveHeight ?? undefined,
      swellHeight: swellHeight ?? undefined,
      windWaveHeight: windWaveHeight ?? undefined,
      currentVelocity: currentVelocity ?? undefined,
    },
  }
}

/**
 * Green through red for a 0–100 score.
 *
 * Kept beside the score because the two are read together, and because a
 * caller picking its own ramp would break the correspondence between the number
 * and the colour a diver actually looks at.
 */
export function scoreColor(score: number): string {
  const clamped = Math.max(0, Math.min(100, score))
  const red = Math.round(Math.max(0, Math.min(255, 255 - clamped * 2.55)))
  const green = Math.round(Math.max(0, Math.min(255, clamped * 2.55)))
  return `rgb(${red}, ${green}, 0)`
}

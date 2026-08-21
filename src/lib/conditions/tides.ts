/**
 * Tide series handling for the marine conditions tool.
 *
 * Pure and framework-free by project rule: the page that used to own this
 * logic could not be tested, and the defect it carried was invisible at the
 * hour it was tested by hand. See `tides.test.ts`, which fixes the clock.
 *
 * Source: Open-Meteo Marine API, `sea_level_height_msl` — a global ~8 km ocean
 * model, not a harmonic tide station. Good for locating slack water, not for
 * coastal navigation.
 */

export interface MarineHourly {
  time: string[]
  sea_level_height_msl: (number | null)[]
}

export interface SunDaily {
  time: string[]
  sunrise: string[]
  sunset: string[]
}

export interface TideExtreme {
  /** Local hour of day, 0–23. */
  time: number
  /** Height above MSL in metres. */
  height: number
  type: 'high' | 'low'
}

export interface TideDay {
  hours: number[]
  heights: number[]
  extremes: TideExtreme[]
  availableDateRange: { startDate: Date; endDate: Date }
  sunData?: { sunrise: Date; sunset: Date }
}

/**
 * The local calendar date as `YYYY-MM-DD`.
 *
 * Open-Meteo is queried with `timezone=auto`, so every timestamp it returns
 * (`2026-08-21T00:00`) is already in the **dive site's** local time, carrying
 * no offset suffix. `Date.toISOString()` yields the **UTC** date, which
 * disagrees with the local one for part of every day at any non-zero offset —
 * at UTC+11 for the eleven hours between local midnight and 11:00. Matching a
 * UTC key against local strings silently missed the day.
 */
export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Whether a date falls inside the forecast window.
 *
 * Compared as date keys, never as `Date` objects: `new Date('2026-08-21')`
 * parses as UTC midnight while a date picked in the UI carries a local
 * wall-clock time, so east of Greenwich the window's own first day compares as
 * out of bounds for part of every day.
 */
export function isWithinForecastWindow(date: Date, times: string[]): boolean {
  if (!times.length) return true // No window known yet — do not block.
  const key = toLocalDateKey(date)
  return key >= times[0].split('T')[0] && key <= times[times.length - 1].split('T')[0]
}

/**
 * Build one day of tide data from the sea-level series.
 *
 * Returns `null` when the model has nothing for this location or day. There is
 * deliberately no synthetic fallback: a sinusoid that looks like a tide curve
 * but is not one is a plausible, unfounded number acted on by a diver planning
 * slack water. "No tide data" is the honest answer, and the page says so.
 */
export function buildTideDay(
  hourly: MarineHourly | undefined,
  baseDate: Date,
  sun?: SunDaily
): TideDay | null {
  if (!hourly?.time?.length || !hourly?.sea_level_height_msl?.length) {
    return null
  }

  const targetKey = toLocalDateKey(baseDate)

  // Every hour the API actually returned for this date. Requiring a full 24
  // discarded the last day of the window, which is short by however many hours
  // have already elapsed locally.
  const dayIndices: number[] = []
  for (let i = 0; i < hourly.time.length; i++) {
    if (hourly.time[i].startsWith(targetKey)) dayIndices.push(i)
  }

  if (!dayIndices.length) {
    return null // The forecast window does not cover this day.
  }

  const hours = dayIndices.map(i => Number(hourly.time[i].slice(11, 13)))
  const heights = dayIndices.map(i => hourly.sea_level_height_msl[i])

  // A turning point needs an interior sample to exist at all, and a gap in the
  // series would invent an extreme where the model reported nothing.
  if (heights.length < 3 || heights.some(h => h === null || h === undefined)) {
    return null
  }

  const known = heights as number[]

  // Turning points in the series are the high and low tides.
  //
  // Neighbours are compared past any run of equal samples rather than to the
  // immediately adjacent one. At hourly resolution a turning point routinely
  // lands as a tied pair — Port Vila's 21 Aug low reads `0.36, 0.36` at 06:00
  // and 07:00 — and a strict `prev < curr < next` test skips it, hiding the
  // largest low of the day from a diver timing slack water.
  const extremes: TideExtreme[] = []
  for (let i = 1; i < known.length - 1; i++) {
    let before = i - 1
    while (before >= 0 && known[before] === known[i]) before--

    let after = i + 1
    while (after < known.length && known[after] === known[i]) after++

    // A plateau reports its first sample, so a tied pair yields one extreme.
    if (before < 0 || after >= known.length || known[i - 1] === known[i]) continue

    if (known[i] > known[before] && known[i] > known[after]) {
      extremes.push({ time: hours[i], height: known[i], type: 'high' })
    } else if (known[i] < known[before] && known[i] < known[after]) {
      extremes.push({ time: hours[i], height: known[i], type: 'low' })
    }
  }

  const lastKey = hourly.time[hourly.time.length - 1].split('T')[0]
  const availableDateRange = {
    startDate: new Date(hourly.time[0]),
    endDate: new Date(`${lastKey}T23:59:59`)
  }

  let sunData: { sunrise: Date; sunset: Date } | undefined
  if (sun?.time) {
    const dateIndex = sun.time.findIndex(t => t === targetKey)
    if (dateIndex !== -1) {
      sunData = {
        sunrise: new Date(sun.sunrise[dateIndex]),
        sunset: new Date(sun.sunset[dateIndex])
      }
    }
  }

  return {
    hours,
    heights: known,
    extremes,
    availableDateRange,
    sunData
  }
}

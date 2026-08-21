/**
 * The single normalised dive model.
 *
 * Both parsers (Garmin FIT, Shearwater CSV/XML) produce this shape and nothing
 * else, so the card renderer never learns what a `.fit` file is. Adding a third
 * format is one new parser and one line in `parseDiveFile`.
 *
 * CANONICAL UNITS, always — metres, seconds, degrees Celsius, bar. The units
 * context converts for display only. Holding display units here is how a unit
 * toggle silently reinterprets 30 m as 30 ft.
 */

/** One instant in the dive profile. */
export interface DiveSample {
  /** Seconds since the start of the dive. Monotonic, starts at 0. */
  t: number
  /** Depth in metres, positive downward. Surface is 0. */
  depth: number
  /** Water temperature in °C, where the computer recorded one. */
  temp?: number
  /**
   * True where the computer had a mandatory decompression obligation at this
   * instant — the no-stop time was exhausted and a ceiling existed.
   *
   * Recorded per-sample rather than as a single time span because a dive can
   * enter and clear deco more than once, and because the card draws the trace
   * segment by segment.
   */
  inDeco?: boolean
  /**
   * The shallowest mandatory stop the computer was calling, in metres.
   * Present only while `inDeco` is true. `undefined` means the file recorded
   * a deco obligation without naming the stop depth.
   */
  stopDepth?: number
}

/** A breathing gas recorded by the computer. */
export interface DiveGas {
  /** Oxygen fraction as a percentage, 0-100. */
  o2: number
  /** Helium fraction as a percentage, 0-100. */
  he: number
}

/** Which file a dive came from. Shown on the card and used in error copy. */
export type DiveSource = 'garmin-fit' | 'shearwater-csv' | 'shearwater-xml'

export interface Dive {
  samples: DiveSample[]
  /** Metres. The deepest sample, or the computer's own summary if it gave one. */
  maxDepth: number
  /** Seconds of runtime. */
  duration: number
  /** Metres, time-weighted over the profile. */
  avgDepth: number
  /** Dive start, as a real instant. Absent when the file records only elapsed time. */
  startTime?: Date
  /** °C. The coldest recorded temperature — what a diver means by "water temp". */
  waterTemp?: number
  /** Seconds on the surface before this dive, where the file records it. */
  surfaceInterval?: number
  gases?: DiveGas[]
  /** The computer's own dive counter, where present. */
  diveNumber?: number
  source: DiveSource
  /** Free-text device name, e.g. "Garmin Descent Mk2i". */
  device?: string
}

/**
 * A parse failure a diver can act on.
 *
 * `code` drives the copy; `detail` carries the specific byte offset, column
 * name or missing field so the message names the actual problem rather than
 * saying "invalid file".
 */
export type DiveParseErrorCode =
  | 'not-recognised'
  | 'truncated'
  | 'corrupt'
  | 'no-dive-data'
  | 'empty-profile'

export class DiveParseError extends Error {
  readonly code: DiveParseErrorCode
  readonly detail?: string

  constructor(code: DiveParseErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'DiveParseError'
    this.code = code
    this.detail = detail
  }
}

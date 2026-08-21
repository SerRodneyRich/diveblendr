/**
 * Shearwater log parsers — the CSV dive-profile export and the Shearwater
 * Cloud/Desktop XML export.
 *
 * Both are text formats with no published schema, so the parsers here are
 * written defensively: columns are matched by *meaning* against a set of known
 * header spellings rather than by position, because Shearwater Cloud has
 * shipped several header variants across desktop versions and a positional
 * parser breaks silently on the next one — reading temperature as depth rather
 * than failing.
 *
 * CSV (Shearwater Cloud "CSV dive profile" export)
 * ------------------------------------------------
 * One file per dive, in two parts. Verified against a real Petrel 3 export:
 *
 *   row 0   dive-level metadata *header*  ("Dive Number", "Start Date",
 *           "Max Depth", "Surface Interval (min)", "Imperial Units", ...)
 *   row 1   the matching values
 *   row 2   the per-sample header ("Time (sec)", "Depth", "Water Temp", ...)
 *   row 3+  the samples, at 10 s intervals
 *
 * Older/other versions instead emit a `key: value` preamble or start straight
 * at the sample header, so the sample header row is *found* by scanning for a
 * row that carries both a depth and a time column rather than being assumed to
 * be at a fixed index.
 *
 * Units: the Petrel export names its sample columns bare ("Depth", not
 * "Depth (m)") and states the unit once, in the metadata column
 * "Imperial Units" (True/False). Both are honoured — an explicit unit in the
 * column header wins, and the metadata flag is the fallback. Assuming metres
 * would silently under-report every dive logged by a diver on feet by a factor
 * of 3.28.
 *
 * XML (Shearwater Desktop / Cloud XML export)
 * -------------------------------------------
 * Samples are `<diveLogRecord>` elements. The fields used here:
 *   currentTime   milliseconds of runtime
 *   currentDepth  metres, decimal
 *   waterTemp     degrees Celsius, integer
 * Container elements vary between exports (`<dive>`, `<diveLog>`), so records
 * are located by tag name anywhere in the document rather than by path.
 *
 * Sourcing note: element names and their units were taken from the public
 * description of the format and cross-checked against an independent
 * permissively-licensed converter (bee-eater/ShearXMLConv). No GPL-2.0-only
 * source (Subsurface) was consulted for implementation.
 */

import { timeWeightedAvgDepth } from './fit'
import { DiveParseError, type Dive, type DiveSample } from './types'

const FEET_TO_METRES = 0.3048

/** Normalises a header cell for matching: lowercase, alphanumerics only. */
function normaliseHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Finds the index of the first column whose normalised header matches one of
 * `candidates`, preferring an exact match over a prefix match so that
 * "sampledepth" wins over "sampledepthmax" when both exist.
 */
function findColumn(headers: string[], candidates: string[]): number {
  const normalised = headers.map(normaliseHeader)
  for (const candidate of candidates) {
    const exact = normalised.indexOf(candidate)
    if (exact !== -1) return exact
  }
  for (const candidate of candidates) {
    const partial = normalised.findIndex((h) => h.startsWith(candidate))
    if (partial !== -1) return partial
  }
  return -1
}

/** Splits a delimited line, honouring double-quoted cells. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell.trim())
  return cells
}

/** Picks the delimiter by counting candidates in the header line. */
function detectDelimiter(line: string): string {
  const counts = [',', ';', '\t'].map((d) => ({ d, n: line.split(d).length }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0].n > 1 ? counts[0].d : ','
}

/**
 * Parses a duration cell, which appears either as seconds ("754") or as
 * clock time ("12:34" / "1:02:03").
 */
function parseTimeCell(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((p) => Number(p))
    if (parts.some((p) => !Number.isFinite(p))) return undefined
    return parts.reduce((acc, p) => acc * 60 + p, 0)
  }

  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

function parseNumberCell(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/** True when a header cell names a depth column measured in feet. */
function headerSaysFeet(header: string): boolean {
  return /\b(ft|feet)\b/i.test(header)
}

function headerSaysFahrenheit(header: string): boolean {
  return /(°\s*f|\bf\b|fahrenheit)/i.test(header) && !/celsius|°\s*c/i.test(header)
}

const DEPTH_HEADERS = ['sampledepth', 'depth', 'depthm', 'depthft', 'currentdepth']
const TIME_HEADERS = ['sampletime', 'time', 'divetime', 'currenttime', 'elapsedtime', 'runtime']
const TEMP_HEADERS = ['sampletemperature', 'temperature', 'temp', 'watertemp', 'watertemperature']
const DATE_HEADERS = ['date', 'divedate', 'startdate']
const CLOCK_HEADERS = ['time', 'starttime', 'clocktime']
const DIVE_NUMBER_HEADERS = ['divenumber', 'diveno', 'dive', 'number']
/**
 * Deco state. A Petrel writes "First Stop Depth" (0 when no stop is required)
 * and "Current NDL" (0 when the no-stop time is spent). Verified against a
 * real Petrel 3 export: both agreed on the same 331 samples, with stop depths
 * of 6/9/12/15/18 m. `First Stop Depth` is preferred because it names the
 * ceiling as well as the fact of the obligation.
 */
const STOP_DEPTH_HEADERS = ['firststopdepth', 'stopdepth', 'decostopdepth', 'nextstopdepth']
const NDL_HEADERS = ['currentndl', 'ndl', 'nostoptime']

/** Metadata-block columns (row 0/1 of a Shearwater Cloud export). */
const META_START_DATE = ['startdate', 'divedate', 'date']
const META_SURFACE_INTERVAL = ['surfaceintervalmin', 'surfaceinterval']
const META_IMPERIAL = ['imperialunits']
const META_MAX_DEPTH = ['maxdepth']

/**
 * Parses a US-style `M/D/YYYY h:mm:ss AM` stamp, which is what the Petrel
 * export writes regardless of locale.
 *
 * Kept separate from `parseDateAndClock` (which handles ISO) because guessing
 * between D/M and M/D is exactly the ambiguity that puts a wrong date on a
 * shareable card. This is applied only to the metadata column, whose format is
 * known from a real export.
 */
export function parseUsDateTime(raw: string): Date | undefined {
  const m = raw
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i)
  if (!m) return undefined
  const [, month, day, year, hh, mm, ss, meridiem] = m

  let hours = hh === undefined ? 0 : Number(hh)
  if (meridiem) {
    const upper = meridiem.toUpperCase()
    if (upper === 'PM' && hours < 12) hours += 12
    if (upper === 'AM' && hours === 12) hours = 0
  }

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hours,
    mm === undefined ? 0 : Number(mm),
    ss === undefined ? 0 : Number(ss)
  )
  return Number.isNaN(date.getTime()) ? undefined : date
}

interface CsvMetadata {
  startTime?: Date
  diveNumber?: number
  surfaceInterval?: number
  imperial?: boolean
  maxDepth?: number
}

/**
 * Reads the dive-level metadata pair (header row + value row) that precedes
 * the samples, when the export has one.
 */
function readMetadata(headers: string[], values: string[]): CsvMetadata {
  const get = (candidates: string[]): string | undefined => {
    const index = findColumn(headers, candidates)
    return index === -1 || index >= values.length ? undefined : values[index].trim()
  }

  const startRaw = get(META_START_DATE)
  const numberRaw = get(META_DIVE_NUMBER)
  const intervalRaw = get(META_SURFACE_INTERVAL)
  const imperialRaw = get(META_IMPERIAL)
  const maxDepthRaw = get(META_MAX_DEPTH)

  const diveNumber = numberRaw === undefined ? undefined : parseNumberCell(numberRaw)
  const intervalMinutes = intervalRaw === undefined ? undefined : parseNumberCell(intervalRaw)
  const maxDepth = maxDepthRaw === undefined ? undefined : parseNumberCell(maxDepthRaw)

  return {
    startTime:
      startRaw === undefined
        ? undefined
        : (parseDateAndClock(startRaw) ?? parseUsDateTime(startRaw)),
    diveNumber,
    // The column is stated in minutes; the model holds seconds.
    surfaceInterval: intervalMinutes === undefined ? undefined : intervalMinutes * 60,
    imperial:
      imperialRaw === undefined ? undefined : /^(true|yes|1)$/i.test(imperialRaw.trim()),
    maxDepth,
  }
}

const META_DIVE_NUMBER = ['divenumber', 'diveno']

/**
 * Parses the Shearwater CSV dive-profile export.
 *
 * The header row is located by scanning for the first line that contains both
 * a recognisable depth column and a recognisable time column, so a metadata
 * preamble does not have to be described in advance.
 */
export function parseShearwaterCsv(text: string): Dive {
  const lines = text.split(/\r?\n/)

  let headerIndex = -1
  let headers: string[] = []
  let delimiter = ','
  /** Non-empty rows seen before the sample header, for the metadata block. */
  const preamble: string[][] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    const candidateDelimiter = detectDelimiter(line)
    const cells = splitLine(line, candidateDelimiter)
    if (cells.length < 2) {
      preamble.push(cells)
      continue
    }
    if (
      findColumn(cells, DEPTH_HEADERS) !== -1 &&
      findColumn(cells, TIME_HEADERS) !== -1
    ) {
      headerIndex = i
      headers = cells
      delimiter = candidateDelimiter
      break
    }
    preamble.push(cells)
  }

  if (headerIndex === -1) {
    throw new DiveParseError(
      'not-recognised',
      'No dive profile columns were found in this CSV — it needs a depth column and a time column.',
      'no header row carried both a depth and a time column'
    )
  }

  /**
   * The metadata block is a header row immediately followed by its value row.
   * Taking the *last* such pair before the samples avoids picking up a banner
   * line, and requiring equal widths avoids pairing two unrelated rows.
   */
  let metadata: CsvMetadata = {}
  for (let i = preamble.length - 2; i >= 0; i--) {
    const keys = preamble[i]
    const values = preamble[i + 1]
    if (keys.length !== values.length || keys.length < 2) continue
    if (findColumn(keys, META_MAX_DEPTH) === -1 && findColumn(keys, META_DIVE_NUMBER) === -1) {
      continue
    }
    metadata = readMetadata(keys, values)
    break
  }

  const depthCol = findColumn(headers, DEPTH_HEADERS)
  const timeCol = findColumn(headers, TIME_HEADERS)
  const tempCol = findColumn(headers, TEMP_HEADERS)
  const dateCol = findColumn(headers, DATE_HEADERS)
  const diveNumberCol = findColumn(headers, DIVE_NUMBER_HEADERS)
  // The clock column is only usable when it is a *different* column from the
  // sample-time column, which also matches the bare header "time".
  const clockColRaw = findColumn(headers, CLOCK_HEADERS)
  const clockCol = clockColRaw === timeCol ? -1 : clockColRaw
  const stopCol = findColumn(headers, STOP_DEPTH_HEADERS)
  const ndlCol = findColumn(headers, NDL_HEADERS)
  // The stop depth carries the same unit as the depth column.
  const stopInFeet =
    stopCol !== -1 &&
    (headerSaysFeet(headers[stopCol]) ||
      (metadata.imperial === true && !/\(\s*m\s*\)/i.test(headers[stopCol])))

  /**
   * An explicit unit in the sample column header is authoritative. When the
   * header is bare ("Depth"), fall back to the metadata's "Imperial Units"
   * flag; the Petrel export states the unit only there.
   */
  const depthInFeet = headerSaysFeet(headers[depthCol]) || (metadata.imperial === true && !/\(\s*m\s*\)/i.test(headers[depthCol]))
  const tempInFahrenheit =
    tempCol !== -1 &&
    (headerSaysFahrenheit(headers[tempCol]) ||
      (metadata.imperial === true && !/celsius|\(\s*c\s*\)/i.test(headers[tempCol])))

  const samples: DiveSample[] = []
  let firstDate: string | undefined
  let firstClock: string | undefined
  let diveNumber: number | undefined

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    const cells = splitLine(line, delimiter)
    if (cells.length <= depthCol || cells.length <= timeCol) continue

    const depthRaw = parseNumberCell(cells[depthCol])
    const t = parseTimeCell(cells[timeCol])
    if (depthRaw === undefined || t === undefined) continue

    const depth = depthInFeet ? depthRaw * FEET_TO_METRES : depthRaw

    let temp: number | undefined
    if (tempCol !== -1 && cells.length > tempCol) {
      const raw = parseNumberCell(cells[tempCol])
      if (raw !== undefined) {
        // Shearwater writes 0 into the temperature column when the sensor
        // reported nothing. The sentinel is a literal zero *in the file's own
        // units*, so it has to be recognised here, before conversion: on an
        // imperial export, converting first turns every sentinel into
        // −17.78 °C, and `finaliseDive`'s all-zeros check no longer sees zeros.
        // The card then reported "Water temp −18 °C" for a dive that recorded
        // no temperature at all. Left undefined, the sample simply has none.
        //
        // A genuine 0 °C reading is possible under ice, and is discarded here
        // along with the sentinel — an unavoidable trade, and the conservative
        // direction: a missing temperature is honest, an invented one is not.
        if (raw !== 0) {
          temp = tempInFahrenheit ? ((raw - 32) * 5) / 9 : raw
        }
      }
    }

    if (firstDate === undefined && dateCol !== -1 && cells.length > dateCol) {
      firstDate = cells[dateCol] || undefined
    }
    if (firstClock === undefined && clockCol !== -1 && cells.length > clockCol) {
      firstClock = cells[clockCol] || undefined
    }
    if (diveNumber === undefined && diveNumberCol !== -1 && cells.length > diveNumberCol) {
      diveNumber = parseNumberCell(cells[diveNumberCol])
    }

    // Deco: a stop shallower-limit above zero is a mandatory ceiling; an NDL
    // of exactly zero says the same thing where no stop column exists.
    let stopDepth: number | undefined
    if (stopCol !== -1 && cells.length > stopCol) {
      const raw = parseNumberCell(cells[stopCol])
      if (raw !== undefined && raw > 0) stopDepth = stopInFeet ? raw * FEET_TO_METRES : raw
    }
    let inDeco = stopDepth !== undefined
    if (!inDeco && stopCol === -1 && ndlCol !== -1 && cells.length > ndlCol) {
      inDeco = parseNumberCell(cells[ndlCol]) === 0
    }

    const sample: DiveSample = { t, depth }
    if (temp !== undefined) sample.temp = temp
    if (inDeco) {
      sample.inDeco = true
      if (stopDepth !== undefined) sample.stopDepth = stopDepth
    }
    samples.push(sample)
  }

  if (samples.length === 0) {
    throw new DiveParseError(
      'empty-profile',
      'This CSV has dive profile columns but no readable sample rows.',
      `header found at line ${headerIndex + 1}, ${lines.length - headerIndex - 1} lines after it`
    )
  }

  return finaliseDive(samples, {
    source: 'shearwater-csv',
    // Metadata beats a per-sample date column: it carries a full timestamp,
    // where the sample rows repeat only the date.
    startTime: metadata.startTime ?? parseDateAndClock(firstDate, firstClock),
    diveNumber: metadata.diveNumber ?? diveNumber,
    surfaceInterval: metadata.surfaceInterval,
  })
}

/**
 * Builds a Date from a date cell and an optional clock cell.
 *
 * Returns undefined rather than guessing when the format is ambiguous: a wrong
 * date printed confidently on a shareable card is worse than no date.
 */
export function parseDateAndClock(date?: string, clock?: string): Date | undefined {
  if (!date) return undefined
  const trimmed = date.trim()
  if (trimmed === '') return undefined

  // ISO first — unambiguous, and what the XML export uses.
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (isoMatch) {
    const [, y, m, d, hh, mm, ss] = isoMatch
    const clockParts = hh === undefined ? parseClock(clock) : null
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      hh !== undefined ? Number(hh) : (clockParts?.[0] ?? 0),
      mm !== undefined ? Number(mm) : (clockParts?.[1] ?? 0),
      ss !== undefined ? Number(ss) : (clockParts?.[2] ?? 0)
    )
  }

  return undefined
}

function parseClock(clock?: string): [number, number, number] | null {
  if (!clock) return null
  const m = clock.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)]
}

/** Reads the text of the first matching child tag, anywhere inside `xml`. */
function tagValues(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim())
  return out
}

function firstTagValue(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml)
  return m ? m[1].trim() : undefined
}

/**
 * Parses the Shearwater XML export.
 *
 * Uses regular expressions rather than DOMParser so the module stays pure and
 * framework-free — `src/lib` is tested in a node environment with no DOM, and
 * these documents are machine-generated with a flat, predictable record shape.
 */
export function parseShearwaterXml(text: string): Dive {
  const records = tagValues(text, 'diveLogRecord')

  if (records.length === 0) {
    throw new DiveParseError(
      'not-recognised',
      'This XML has no <diveLogRecord> entries, so it is not a Shearwater dive log.',
      'no diveLogRecord elements found'
    )
  }

  const samples: DiveSample[] = []
  for (const record of records) {
    const depthRaw = firstTagValue(record, 'currentDepth')
    const timeRaw = firstTagValue(record, 'currentTime')
    if (depthRaw === undefined || timeRaw === undefined) continue

    const depth = Number(depthRaw)
    // currentTime is milliseconds of runtime in this export.
    const t = Number(timeRaw) / 1000
    if (!Number.isFinite(depth) || !Number.isFinite(t)) continue

    const tempRaw = firstTagValue(record, 'waterTemp')
    const temp = tempRaw === undefined ? undefined : Number(tempRaw)

    samples.push(
      temp === undefined || !Number.isFinite(temp) ? { t, depth } : { t, depth, temp }
    )
  }

  if (samples.length === 0) {
    throw new DiveParseError(
      'empty-profile',
      'This Shearwater XML has dive records but none carry a depth and a time.',
      `${records.length} diveLogRecord elements, none usable`
    )
  }

  // Dive-level metadata sits outside the sample records.
  const startRaw =
    firstTagValue(text, 'startDate') ??
    firstTagValue(text, 'diveDate') ??
    firstTagValue(text, 'date')
  const numberRaw = firstTagValue(text, 'number') ?? firstTagValue(text, 'diveNumber')
  const parsedNumber = numberRaw === undefined ? undefined : Number(numberRaw)

  return finaliseDive(samples, {
    source: 'shearwater-xml',
    startTime: parseDateAndClock(startRaw),
    diveNumber: Number.isFinite(parsedNumber) ? parsedNumber : undefined,
  })
}

/**
 * Derives the summary values from a sample list.
 *
 * Shared by both Shearwater parsers because neither export carries a trusted
 * summary block — unlike FIT, where the computer states its own max depth and
 * that value is preferred over the sampled one.
 */
export function finaliseDive(
  samples: DiveSample[],
  meta: {
    source: Dive['source']
    startTime?: Date
    diveNumber?: number
    surfaceInterval?: number
  }
): Dive {
  const sorted = [...samples].sort((a, b) => a.t - b.t)

  // Rebase onto zero: some exports start the clock at the first sample's
  // wall time rather than at zero.
  const t0 = sorted[0].t
  const rebased = t0 === 0 ? sorted : sorted.map((s) => ({ ...s, t: s.t - t0 }))

  const maxDepth = rebased.reduce((m, s) => Math.max(m, s.depth), 0)
  const duration = rebased[rebased.length - 1].t

  const temps = rebased.map((s) => s.temp).filter((t): t is number => t !== undefined)
  // Judged on the file's own values, before unit conversion — see the note at
  // the parse site. A profile of exact zeros is the sentinel; anything with
  // variation in it is a real measurement.
  const meaningfulTemps = temps.some((t) => t !== 0) ? temps : []

  return {
    samples: rebased,
    maxDepth,
    duration,
    avgDepth: timeWeightedAvgDepth(rebased),
    startTime: meta.startTime,
    waterTemp: meaningfulTemps.length > 0 ? Math.min(...meaningfulTemps) : undefined,
    diveNumber: meta.diveNumber,
    surfaceInterval: meta.surfaceInterval,
    source: meta.source,
  }
}

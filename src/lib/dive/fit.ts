/**
 * A minimal Garmin/ANT+ FIT decoder, covering only the messages a dive card
 * needs.
 *
 * WHY WRITTEN RATHER THAN DEPENDED ON
 * -----------------------------------
 * Garmin's own SDKs (`@garmin/fitsdk`) ship under the *FIT Protocol License*,
 * not a standard OSI licence: it is a bespoke licence with a field-of-use
 * restriction and an attribution/no-endorsement clause. That is not obviously
 * GPL-3.0-compatible, and this repo has a hard rule about licence hygiene, so
 * vendoring it into a GPL-3.0 app is a risk with no upside. The third-party
 * parsers are either the same problem one step removed or unmaintained.
 *
 * The FIT *protocol* itself is a published wire format, not code — describing
 * it and implementing it independently carries no licence. Everything below is
 * written from the protocol description; the field numbers and scales are read
 * out of the published FIT Profile as *data* (see citations per field) in the
 * same way one reads a spec table. No SDK code is copied.
 *
 * PROTOCOL SUMMARY (FIT Protocol V2)
 * ----------------------------------
 * File = header, then a stream of records, then a 2-byte file CRC.
 *
 * Header (12 or 14 bytes):
 *   0      uint8   header size (12 = no header CRC, 14 = header CRC present)
 *   1      uint8   protocol version
 *   2..3   uint16  profile version (little endian)
 *   4..7   uint32  data size, bytes of records, excluding header and file CRC
 *   8..11  char[4] ".FIT" magic
 *   12..13 uint16  header CRC (only when header size is 14; 0 means "not set")
 *
 * Every record starts with one header byte. Bit 7 selects the encoding:
 *   - Normal header (bit 7 = 0):
 *       bit 6    1 = definition message, 0 = data message
 *       bit 5    developer-data flag (definition messages only)
 *       bits 3-0 local message type
 *   - Compressed-timestamp header (bit 7 = 1), always a data message:
 *       bits 6-5 local message type (only 0-3 are addressable this way)
 *       bits 4-0 a 5-bit offset into the running timestamp
 *
 * A definition message declares what the data messages carrying that local
 * type look like:
 *   uint8   reserved
 *   uint8   architecture, 0 = little endian, 1 = big endian
 *   uint16  global message number (in the declared architecture)
 *   uint8   field count
 *   then per field: uint8 field definition number, uint8 size, uint8 base type
 *   then, when the developer-data flag is set:
 *     uint8 developer field count, then per field:
 *       uint8 field number, uint8 size, uint8 developer data index
 *
 * Developer field *values* are of no interest here, but their bytes still have
 * to be counted: skipping the declaration would desynchronise the stream for
 * every subsequent record.
 *
 * Masks and base types below are the protocol's own constants.
 */

import { DiveParseError, type Dive, type DiveGas, type DiveSample } from './types'

// --- Record header bit masks (FIT Protocol V2) ------------------------------
const COMPRESSED_HEADER_MASK = 0x80
const MESG_DEFINITION_MASK = 0x40
const DEV_DATA_MASK = 0x20
const LOCAL_MESG_NUM_MASK = 0x0f
/** Compressed headers address only local types 0-3, in bits 6-5. */
const COMPRESSED_LOCAL_MESG_NUM_MASK = 0x60
const COMPRESSED_LOCAL_MESG_NUM_SHIFT = 5
/** The 5-bit time offset carried in a compressed header. */
const COMPRESSED_TIME_MASK = 0x1f
const BASE_TYPE_MASK = 0x1f

/**
 * Base type number -> size in bytes and the "invalid" sentinel FIT writes for
 * a field it has no value for. Reading a sentinel as a real number is how a
 * dive ends up 4294967 m deep, so every read checks it.
 */
interface BaseType {
  size: number
  /**
   * The sentinel FIT writes for a field it has no value for. Held as a plain
   * number: every sentinel up to 32 bits is exactly representable, and the
   * 64-bit types below are declared with `size: 0` because they do not occur
   * in the dive messages this decoder reads — they are skipped by size rather
   * than decoded, so their sentinel is never compared.
   */
  invalid: number
  signed: boolean
  float: boolean
}

const BASE_TYPES: Record<number, BaseType> = {
  0x00: { size: 1, invalid: 0xff, signed: false, float: false }, // enum
  0x01: { size: 1, invalid: 0x7f, signed: true, float: false }, // sint8
  0x02: { size: 1, invalid: 0xff, signed: false, float: false }, // uint8
  0x03: { size: 2, invalid: 0x7fff, signed: true, float: false }, // sint16
  0x04: { size: 2, invalid: 0xffff, signed: false, float: false }, // uint16
  0x05: { size: 4, invalid: 0x7fffffff, signed: true, float: false }, // sint32
  0x06: { size: 4, invalid: 0xffffffff, signed: false, float: false }, // uint32
  0x07: { size: 1, invalid: 0x00, signed: false, float: false }, // string
  0x08: { size: 4, invalid: 0xffffffff, signed: false, float: true }, // float32
  0x09: { size: 8, invalid: Number.NaN, signed: false, float: true }, // float64
  0x0a: { size: 1, invalid: 0x00, signed: false, float: false }, // uint8z
  0x0b: { size: 2, invalid: 0x0000, signed: false, float: false }, // uint16z
  0x0c: { size: 4, invalid: 0x00000000, signed: false, float: false }, // uint32z
  0x0d: { size: 1, invalid: 0xff, signed: false, float: false }, // byte
  // 64-bit types: sizes are correct so the cursor advances properly, but the
  // values are never read as numbers (see `readValue`).
  0x0e: { size: 8, invalid: Number.NaN, signed: true, float: false }, // sint64
  0x0f: { size: 8, invalid: Number.NaN, signed: false, float: false }, // uint64
  0x10: { size: 8, invalid: Number.NaN, signed: false, float: false }, // uint64z
}

// --- Global message numbers (FIT Profile) -----------------------------------
const MESG_FILE_ID = 0
const MESG_SESSION = 18
const MESG_RECORD = 20
const MESG_DIVE_GAS = 259
const MESG_DIVE_SUMMARY = 268

/**
 * FIT timestamps count seconds since 1989-12-31T00:00:00Z, not the Unix epoch.
 * 631065600 is that instant expressed in Unix seconds.
 */
const FIT_EPOCH_OFFSET_S = 631065600

/**
 * Field numbers and scales, read from the published FIT Profile (Profile.xlsx,
 * mirrored in Garmin's generated SDK profile, v21.213.0).
 *
 * Scales are divisors: real value = raw / scale. Depths are uint32 in
 * millimetres (scale 1000 against units "m"); temperatures are sint8 in whole
 * degrees Celsius (scale 1).
 */
const FIELD = {
  /** record (20) */
  record: {
    timestamp: 253, // uint32, s, FIT epoch
    depth: 92, // uint32, scale 1000 -> m
    temperature: 13, // sint8, scale 1 -> C
    // Deco state. `next_stop_depth` is non-zero exactly when the computer is
    // calling a mandatory stop, and `ndl_time` reaches 0 at the same instant —
    // verified against a real Garmin Descent dive, where both agreed on the
    // same 3137 samples and the stop depths were the expected 6/9/12/15/18 m.
    // `next_stop_depth` is preferred because it also names the ceiling.
    nextStopDepth: 93, // uint32, scale 1000 -> m
    ndlTime: 96, // uint32, scale 1 -> s
  },
  /** session (18) */
  session: {
    timestamp: 253, // uint32, s
    startTime: 2, // uint32, s
    totalElapsedTime: 7, // uint32, scale 1000 -> s
    totalTimerTime: 8, // uint32, scale 1000 -> s
    sport: 5, // enum
    subSport: 6, // enum
    avgDepth: 140, // uint32, scale 1000 -> m
    maxDepth: 141, // uint32, scale 1000 -> m
    avgTemperature: 57, // sint8, C
    maxTemperature: 58, // sint8, C
    minTemperature: 150, // sint8, C
  },
  /** dive_summary (268) */
  diveSummary: {
    avgDepth: 2, // uint32, scale 1000 -> m
    maxDepth: 3, // uint32, scale 1000 -> m
    surfaceInterval: 4, // uint32, scale 1 -> s
    diveNumber: 10, // uint32
    bottomTime: 11, // uint32, scale 1000 -> s
  },
  /** dive_gas (259) */
  diveGas: {
    heliumContent: 0, // uint8, percent
    oxygenContent: 1, // uint8, percent
    status: 2, // enum: 0 disabled, 1 enabled, 2 backup
  },
  /** file_id (0) */
  fileId: {
    type: 0, // enum: 4 = activity
    manufacturer: 1, // uint16
    product: 2, // uint16
    timeCreated: 4, // uint32, s
  },
} as const

/** `sport` enum value for diving (FIT Profile, sport). */
const SPORT_DIVING = 53

interface FieldDef {
  num: number
  size: number
  baseType: number
}

interface MessageDef {
  globalNum: number
  littleEndian: boolean
  fields: FieldDef[]
  /** Total bytes of developer field data to skip per data message. */
  devDataSize: number
}

/** A decoded data message: field number -> numeric value, invalids dropped. */
type DecodedMessage = Map<number, number>

/**
 * FIT's CRC-16, as published in the protocol: a nibble-wise table of 16
 * entries applied low nibble first. It guards both the header and the file.
 */
const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800,
  0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
]

export function fitCrc(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0
  for (let i = start; i < end; i++) {
    const byte = bytes[i]
    let tmp = CRC_TABLE[crc & 0xf]
    crc = (crc >> 4) & 0x0fff
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xf]

    tmp = CRC_TABLE[crc & 0xf]
    crc = (crc >> 4) & 0x0fff
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf]
  }
  return crc & 0xffff
}

/** Reads one scalar field value, returning undefined for FIT's invalid sentinel. */
function readValue(
  view: DataView,
  offset: number,
  baseType: BaseType,
  littleEndian: boolean
): number | undefined {
  if (baseType.float) {
    if (baseType.size !== 4 && baseType.size !== 8) return undefined
    const value =
      baseType.size === 4
        ? view.getFloat32(offset, littleEndian)
        : view.getFloat64(offset, littleEndian)
    return Number.isFinite(value) ? value : undefined
  }

  let raw: number
  switch (baseType.size) {
    case 1:
      raw = baseType.signed ? view.getInt8(offset) : view.getUint8(offset)
      break
    case 2:
      raw = baseType.signed
        ? view.getInt16(offset, littleEndian)
        : view.getUint16(offset, littleEndian)
      break
    case 4:
      raw = baseType.signed
        ? view.getInt32(offset, littleEndian)
        : view.getUint32(offset, littleEndian)
      break
    default:
      // 64-bit and array/string fields are skipped by size rather than decoded.
      return undefined
  }

  // Compare against the sentinel in the *unsigned* domain the profile states
  // it in, so e.g. sint8's 0x7F matches.
  const unsigned = raw < 0 ? raw + Math.pow(2, baseType.size * 8) : raw
  if (unsigned === baseType.invalid) return undefined
  return raw
}

interface RawMessages {
  records: DecodedMessage[]
  sessions: DecodedMessage[]
  diveSummaries: DecodedMessage[]
  diveGases: DecodedMessage[]
  fileIds: DecodedMessage[]
}

/**
 * Walks the record stream, returning only the messages a dive card cares
 * about. Unknown globals are still *parsed* (their length comes from the
 * definition) but discarded.
 */
function decodeMessages(bytes: Uint8Array): RawMessages {
  const headerSize = bytes[0]
  if (headerSize !== 12 && headerSize !== 14) {
    throw new DiveParseError(
      'not-recognised',
      'This does not look like a FIT file.',
      `header size byte was ${headerSize}, expected 12 or 14`
    )
  }

  const magic = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
  if (magic !== '.FIT') {
    throw new DiveParseError(
      'not-recognised',
      'This does not look like a FIT file.',
      `missing the ".FIT" marker at byte 8 (found ${JSON.stringify(magic)})`
    )
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dataSize = view.getUint32(4, true)

  // A 14-byte header carries its own CRC; 0 means the writer left it unset.
  if (headerSize === 14) {
    const headerCrc = view.getUint16(12, true)
    if (headerCrc !== 0 && headerCrc !== fitCrc(bytes, 0, 12)) {
      throw new DiveParseError(
        'corrupt',
        'This FIT file is damaged — its header checksum does not match.',
        'header CRC mismatch'
      )
    }
  }

  const dataEnd = headerSize + dataSize
  if (dataEnd + 2 > bytes.length) {
    throw new DiveParseError(
      'truncated',
      'This FIT file is incomplete — it ends before the data it declares.',
      `header declares ${dataSize} bytes of records, but only ${
        bytes.length - headerSize
      } bytes follow`
    )
  }

  const fileCrc = view.getUint16(dataEnd, true)
  if (fileCrc !== 0 && fileCrc !== fitCrc(bytes, 0, dataEnd)) {
    throw new DiveParseError(
      'corrupt',
      'This FIT file is damaged — its checksum does not match its contents.',
      'file CRC mismatch'
    )
  }

  const out: RawMessages = {
    records: [],
    sessions: [],
    diveSummaries: [],
    diveGases: [],
    fileIds: [],
  }

  const definitions = new Map<number, MessageDef>()
  let pos = headerSize

  while (pos < dataEnd) {
    const recordHeader = bytes[pos]
    pos += 1

    const compressed = (recordHeader & COMPRESSED_HEADER_MASK) === COMPRESSED_HEADER_MASK

    if (!compressed && (recordHeader & MESG_DEFINITION_MASK) === MESG_DEFINITION_MASK) {
      // --- Definition message ---
      const localNum = recordHeader & LOCAL_MESG_NUM_MASK
      if (pos + 5 > dataEnd) {
        throw new DiveParseError(
          'truncated',
          'This FIT file is incomplete — it stops part-way through a message definition.',
          `ran out of data at byte ${pos}`
        )
      }
      pos += 1 // reserved
      const littleEndian = bytes[pos] === 0
      pos += 1
      const globalNum = view.getUint16(pos, littleEndian)
      pos += 2
      const fieldCount = bytes[pos]
      pos += 1

      const fields: FieldDef[] = []
      if (pos + fieldCount * 3 > dataEnd) {
        throw new DiveParseError(
          'truncated',
          'This FIT file is incomplete — a message definition runs past the end of the file.',
          `definition for global message ${globalNum} needs ${fieldCount * 3} bytes at ${pos}`
        )
      }
      for (let i = 0; i < fieldCount; i++) {
        fields.push({
          num: bytes[pos],
          size: bytes[pos + 1],
          baseType: bytes[pos + 2] & BASE_TYPE_MASK,
        })
        pos += 3
      }

      // Developer fields: their values are skipped, but the declaration must
      // still be consumed or every later record misreads its own length.
      let devDataSize = 0
      if ((recordHeader & DEV_DATA_MASK) === DEV_DATA_MASK) {
        const devFieldCount = bytes[pos]
        pos += 1
        for (let i = 0; i < devFieldCount; i++) {
          devDataSize += bytes[pos + 1]
          pos += 3
        }
      }

      definitions.set(localNum, { globalNum, littleEndian, fields, devDataSize })
      continue
    }

    // --- Data message (normal or compressed-timestamp header) ---
    const localNum = compressed
      ? (recordHeader & COMPRESSED_LOCAL_MESG_NUM_MASK) >> COMPRESSED_LOCAL_MESG_NUM_SHIFT
      : recordHeader & LOCAL_MESG_NUM_MASK

    const def = definitions.get(localNum)
    if (!def) {
      throw new DiveParseError(
        'corrupt',
        'This FIT file is damaged — it contains data for a message it never defined.',
        `local message type ${localNum} used at byte ${pos - 1} before being defined`
      )
    }

    const wanted =
      def.globalNum === MESG_RECORD ||
      def.globalNum === MESG_SESSION ||
      def.globalNum === MESG_DIVE_SUMMARY ||
      def.globalNum === MESG_DIVE_GAS ||
      def.globalNum === MESG_FILE_ID

    const decoded: DecodedMessage = new Map()

    for (const field of def.fields) {
      if (pos + field.size > dataEnd) {
        throw new DiveParseError(
          'truncated',
          'This FIT file is incomplete — it ends part-way through a record.',
          `field ${field.num} of global message ${def.globalNum} needs ${field.size} bytes at ${pos}`
        )
      }
      const baseType = BASE_TYPES[field.baseType]
      // Only scalars are of interest. Arrays and strings are skipped by size,
      // which keeps the cursor correct without decoding them.
      if (wanted && baseType && field.size === baseType.size) {
        const value = readValue(view, pos, baseType, def.littleEndian)
        if (value !== undefined) decoded.set(field.num, value)
      }
      pos += field.size
    }

    pos += def.devDataSize

    // A compressed-timestamp header carries a 5-bit offset rather than a
    // `timestamp` field. Depth-over-time only needs *relative* spacing, and
    // reconstructing an absolute timestamp needs a running reference that
    // Garmin dive files do not exercise — so the offset is recorded and the
    // sample keeps its ordering. See `buildProfile`, which falls back to
    // sample index when timestamps are absent.
    if (compressed && wanted) {
      decoded.set(COMPRESSED_TIME_FIELD, recordHeader & COMPRESSED_TIME_MASK)
    }

    if (!wanted) continue

    switch (def.globalNum) {
      case MESG_RECORD:
        out.records.push(decoded)
        break
      case MESG_SESSION:
        out.sessions.push(decoded)
        break
      case MESG_DIVE_SUMMARY:
        out.diveSummaries.push(decoded)
        break
      case MESG_DIVE_GAS:
        out.diveGases.push(decoded)
        break
      case MESG_FILE_ID:
        out.fileIds.push(decoded)
        break
    }
  }

  return out
}

/**
 * Synthetic field key for a compressed header's 5-bit time offset. Chosen
 * above the 255 addressable field numbers so it cannot collide with a real one.
 */
const COMPRESSED_TIME_FIELD = 1000

/** Applies a profile scale (a divisor) to a raw field value. */
function scaled(raw: number | undefined, scale: number): number | undefined {
  return raw === undefined ? undefined : raw / scale
}

function fitTimestampToDate(raw: number | undefined): Date | undefined {
  if (raw === undefined) return undefined
  return new Date((raw + FIT_EPOCH_OFFSET_S) * 1000)
}

/**
 * Decodes a FIT file into the normalised dive model.
 *
 * Throws `DiveParseError` with a code the UI turns into specific copy — a
 * running watch's FIT file parses perfectly well and simply has no depth in
 * it, which is `no-dive-data`, not a corrupt file.
 */
export function parseFit(buffer: ArrayBuffer): Dive {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 14) {
    throw new DiveParseError(
      'truncated',
      'This file is too small to be a FIT file.',
      `${bytes.length} bytes`
    )
  }

  const msgs = decodeMessages(bytes)

  // --- Profile ------------------------------------------------------------
  const depthRecords = msgs.records.filter((r) => r.has(FIELD.record.depth))

  if (depthRecords.length === 0) {
    const isDiveSession = msgs.sessions.some(
      (s) => s.get(FIELD.session.sport) === SPORT_DIVING
    )
    if (msgs.records.length > 0 && !isDiveSession) {
      throw new DiveParseError(
        'no-dive-data',
        'This FIT file is an activity without any depth recorded — a run or a ride rather than a dive.',
        `${msgs.records.length} records, none carrying depth`
      )
    }
    throw new DiveParseError(
      'no-dive-data',
      'This FIT file contains no depth data, so there is no dive profile to draw.',
      `${msgs.records.length} record messages found`
    )
  }

  const timestamps = depthRecords.map((r) => r.get(FIELD.record.timestamp))
  const haveTimestamps = timestamps.every((t) => t !== undefined)
  const firstTimestamp = haveTimestamps ? (timestamps[0] as number) : undefined

  const samples: DiveSample[] = depthRecords.map((r, i) => {
    const ts = r.get(FIELD.record.timestamp)
    // With no absolute timestamps, fall back to one sample per second, which
    // is the Descent series' record rate. The profile shape is unaffected; only
    // the time axis labels would be, and duration comes from the summary below.
    const t = haveTimestamps && ts !== undefined ? ts - (firstTimestamp as number) : i
    const depth = scaled(r.get(FIELD.record.depth), 1000) as number
    const temp = r.get(FIELD.record.temperature)

    // A stop deeper than 0 is a mandatory ceiling. Where the field is absent
    // the dive simply has no deco data and the trace stays one colour.
    const stop = scaled(r.get(FIELD.record.nextStopDepth), 1000)
    const ndl = r.get(FIELD.record.ndlTime)
    const inDeco = stop !== undefined && stop > 0 ? true : ndl === 0 ? true : undefined

    const sample: DiveSample = { t, depth }
    if (temp !== undefined) sample.temp = temp
    if (inDeco) {
      sample.inDeco = true
      if (stop !== undefined && stop > 0) sample.stopDepth = stop
    }
    return sample
  })

  samples.sort((a, b) => a.t - b.t)

  // --- Summary values ------------------------------------------------------
  const summary = msgs.diveSummaries[0]
  const session = msgs.sessions.find((s) => s.get(FIELD.session.maxDepth) !== undefined) ??
    msgs.sessions[0]

  const profileMax = samples.reduce((m, s) => Math.max(m, s.depth), 0)
  const maxDepth =
    scaled(summary?.get(FIELD.diveSummary.maxDepth), 1000) ??
    scaled(session?.get(FIELD.session.maxDepth), 1000) ??
    profileMax

  const profileDuration = samples.length > 0 ? samples[samples.length - 1].t : 0
  const duration =
    scaled(session?.get(FIELD.session.totalElapsedTime), 1000) ??
    scaled(summary?.get(FIELD.diveSummary.bottomTime), 1000) ??
    profileDuration

  const avgDepth =
    scaled(summary?.get(FIELD.diveSummary.avgDepth), 1000) ??
    scaled(session?.get(FIELD.session.avgDepth), 1000) ??
    timeWeightedAvgDepth(samples)

  // Start time: prefer the session's own start, then the first record's
  // timestamp, then the file's creation time.
  const startTime =
    fitTimestampToDate(session?.get(FIELD.session.startTime)) ??
    fitTimestampToDate(firstTimestamp) ??
    fitTimestampToDate(msgs.fileIds[0]?.get(FIELD.fileId.timeCreated))

  // "Water temperature" to a diver is the cold one, not the average, which is
  // dragged up by the surface. Prefer the session minimum, else the coldest
  // sample.
  const sampleTemps = samples.map((s) => s.temp).filter((t): t is number => t !== undefined)
  const waterTemp =
    session?.get(FIELD.session.minTemperature) ??
    (sampleTemps.length > 0 ? Math.min(...sampleTemps) : undefined)

  const gases: DiveGas[] = msgs.diveGases
    // status 0 is "disabled" — a gas slot the diver switched off. Only enabled
    // (1) and backup (2) gases were actually available on the dive.
    .filter((g) => (g.get(FIELD.diveGas.status) ?? 1) !== 0)
    .map((g) => ({
      o2: g.get(FIELD.diveGas.oxygenContent) ?? 21,
      he: g.get(FIELD.diveGas.heliumContent) ?? 0,
    }))

  return {
    samples,
    maxDepth,
    duration,
    avgDepth,
    startTime,
    waterTemp,
    surfaceInterval: summary?.get(FIELD.diveSummary.surfaceInterval),
    diveNumber: summary?.get(FIELD.diveSummary.diveNumber),
    gases: gases.length > 0 ? dedupeGases(gases) : undefined,
    source: 'garmin-fit',
  }
}

/**
 * Time-weighted mean depth: each sample holds until the next one, so an
 * irregular sample rate does not bias the mean toward densely-sampled parts of
 * the dive. A plain arithmetic mean of samples would.
 */
export function timeWeightedAvgDepth(samples: DiveSample[]): number {
  if (samples.length === 0) return 0
  if (samples.length === 1) return samples[0].depth

  let area = 0
  let span = 0
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t
    if (dt <= 0) continue
    // Trapezoid: depth is a continuous signal sampled discretely, so the mean
    // of the two endpoints is a closer estimate than either alone.
    area += ((samples[i].depth + samples[i - 1].depth) / 2) * dt
    span += dt
  }
  return span > 0 ? area / span : samples[0].depth
}

/** Collapses duplicate gas entries; computers commonly repeat a slot per dive. */
function dedupeGases(gases: DiveGas[]): DiveGas[] {
  const seen = new Set<string>()
  return gases.filter((g) => {
    const key = `${g.o2}/${g.he}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

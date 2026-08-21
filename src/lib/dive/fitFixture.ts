/**
 * A FIT file *writer*, used only by tests to synthesise valid byte streams.
 *
 * Writing the encoder independently of the decoder is deliberate: a fixture
 * produced by the decoder's own assumptions would pass however wrong those
 * assumptions are. This builds the bytes from the protocol description —
 * header, definition messages, data messages, CRC — so a round trip actually
 * exercises the layout, and byte-level expectations in the tests are checked
 * against a stream whose every offset is written by hand here.
 *
 * Kept in `src/lib` rather than a fixtures folder because it is also the
 * cheapest way to produce a downloadable sample file for manual UI testing,
 * and it commits no large binary to the repo.
 */

import { fitCrc } from './fit'

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z). */
export const FIT_EPOCH_OFFSET_S = 631065600

export interface FitFieldSpec {
  num: number
  size: number
  baseType: number
}

export interface FitMessageSpec {
  localNum: number
  globalNum: number
  fields: FitFieldSpec[]
  /** Values in field order; `undefined` writes the base type's invalid sentinel. */
  values: (number | undefined)[]
}

/** Invalid sentinels, keyed by base type, matching the protocol's table. */
const INVALID: Record<number, number> = {
  0x00: 0xff,
  0x01: 0x7f,
  0x02: 0xff,
  0x03: 0x7fff,
  0x04: 0xffff,
  0x05: 0x7fffffff,
  0x06: 0xffffffff,
  0x0a: 0x00,
  0x0b: 0x0000,
  0x0c: 0x00000000,
  0x0d: 0xff,
}

const SIGNED = new Set([0x01, 0x03, 0x05])

class ByteWriter {
  private bytes: number[] = []

  u8(value: number) {
    this.bytes.push(value & 0xff)
  }

  u16(value: number) {
    this.u8(value)
    this.u8(value >> 8)
  }

  u32(value: number) {
    this.u8(value)
    this.u8(value >> 8)
    this.u8(value >> 16)
    this.u8(value >> 24)
  }

  raw(values: number[]) {
    for (const v of values) this.u8(v)
  }

  /** Writes a scalar of the given base type, little endian. */
  scalar(value: number | undefined, baseType: number, size: number) {
    const resolved =
      value === undefined ? (INVALID[baseType] ?? 0xff) : Math.trunc(value)

    // Signed values are written in two's complement of the field's width.
    const encoded =
      SIGNED.has(baseType) && resolved < 0 ? resolved + Math.pow(2, size * 8) : resolved

    for (let i = 0; i < size; i++) {
      this.u8(Math.floor(encoded / Math.pow(2, 8 * i)))
    }
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }

  get length() {
    return this.bytes.length
  }
}

/**
 * Encodes a FIT file from definition/data message specs.
 *
 * Emits a 14-byte header (with header CRC), the record stream, then the file
 * CRC — the shape a Garmin device actually writes.
 */
export function encodeFit(messages: FitMessageSpec[]): ArrayBuffer {
  const body = new ByteWriter()
  const defined = new Set<number>()

  for (const message of messages) {
    if (!defined.has(message.localNum)) {
      // Definition message: header byte has bit 6 set.
      body.u8(0x40 | message.localNum)
      body.u8(0) // reserved
      body.u8(0) // architecture: little endian
      body.u16(message.globalNum)
      body.u8(message.fields.length)
      for (const field of message.fields) {
        body.u8(field.num)
        body.u8(field.size)
        body.u8(field.baseType)
      }
      defined.add(message.localNum)
    }

    // Data message: bit 7 and bit 6 clear.
    body.u8(message.localNum)
    message.fields.forEach((field, i) => {
      body.scalar(message.values[i], field.baseType, field.size)
    })
  }

  const bodyBytes = body.toUint8Array()

  const header = new ByteWriter()
  header.u8(14) // header size
  header.u8(0x20) // protocol version 2.0
  header.u16(2189) // profile version, arbitrary but plausible
  header.u32(bodyBytes.length)
  header.raw([0x2e, 0x46, 0x49, 0x54]) // ".FIT"
  const headerBytes = header.toUint8Array()
  const headerCrc = fitCrc(headerBytes, 0, 12)

  const out = new Uint8Array(14 + bodyBytes.length + 2)
  out.set(headerBytes, 0)
  out[12] = headerCrc & 0xff
  out[13] = (headerCrc >> 8) & 0xff
  out.set(bodyBytes, 14)

  const fileCrc = fitCrc(out, 0, 14 + bodyBytes.length)
  out[14 + bodyBytes.length] = fileCrc & 0xff
  out[15 + bodyBytes.length] = (fileCrc >> 8) & 0xff

  return out.buffer
}

// --- Field/base-type shorthands used by the fixtures ------------------------
const UINT32 = 0x06
const UINT16 = 0x04
const UINT8 = 0x02
const SINT8 = 0x01
const ENUM = 0x00

export interface SyntheticDiveOptions {
  /** Depth in metres per sample, one sample per `sampleIntervalS`. */
  depths: number[]
  temps?: number[]
  sampleIntervalS?: number
  startUnix?: number
  maxDepthM?: number
  avgDepthM?: number
  surfaceIntervalS?: number
  diveNumber?: number
  minTempC?: number
  gases?: { o2: number; he: number }[]
  /** Emit a session with sport = running and no depth, for the failure path. */
  asRunningActivity?: boolean
}

/**
 * Builds a plausible Descent-series dive file: file_id, dive_gas entries,
 * record samples, a session and a dive_summary.
 */
export function synthesiseDiveFit(options: SyntheticDiveOptions): ArrayBuffer {
  const {
    depths,
    temps,
    sampleIntervalS = 1,
    startUnix = Date.UTC(2026, 4, 17, 9, 30, 0) / 1000,
    maxDepthM,
    avgDepthM,
    surfaceIntervalS,
    diveNumber,
    minTempC,
    gases = [],
    asRunningActivity = false,
  } = options

  const fitStart = Math.round(startUnix - FIT_EPOCH_OFFSET_S)
  const messages: FitMessageSpec[] = []

  // file_id (global 0): type=4 (activity), manufacturer=1 (Garmin).
  messages.push({
    localNum: 0,
    globalNum: 0,
    fields: [
      { num: 0, size: 1, baseType: ENUM }, // type
      { num: 1, size: 2, baseType: UINT16 }, // manufacturer
      { num: 4, size: 4, baseType: UINT32 }, // time_created
    ],
    values: [4, 1, fitStart],
  })

  // dive_gas (global 259)
  gases.forEach((gas) => {
    messages.push({
      localNum: 1,
      globalNum: 259,
      fields: [
        { num: 0, size: 1, baseType: UINT8 }, // helium_content
        { num: 1, size: 1, baseType: UINT8 }, // oxygen_content
        { num: 2, size: 1, baseType: ENUM }, // status: 1 = enabled
      ],
      values: [gas.he, gas.o2, 1],
    })
  })

  // record (global 20): timestamp, depth (mm), temperature (C)
  const recordFields: FitFieldSpec[] = asRunningActivity
    ? [
        { num: 253, size: 4, baseType: UINT32 },
        { num: 3, size: 1, baseType: UINT8 }, // heart_rate — no depth at all
      ]
    : [
        { num: 253, size: 4, baseType: UINT32 },
        { num: 92, size: 4, baseType: UINT32 }, // depth, scale 1000
        { num: 13, size: 1, baseType: SINT8 }, // temperature
      ]

  depths.forEach((depth, i) => {
    const timestamp = fitStart + i * sampleIntervalS
    messages.push({
      localNum: 2,
      globalNum: 20,
      fields: recordFields,
      values: asRunningActivity
        ? [timestamp, 140]
        : [timestamp, Math.round(depth * 1000), temps?.[i]],
    })
  })

  const lastTimestamp = fitStart + (depths.length - 1) * sampleIntervalS

  // session (global 18)
  messages.push({
    localNum: 3,
    globalNum: 18,
    fields: [
      { num: 253, size: 4, baseType: UINT32 }, // timestamp
      { num: 2, size: 4, baseType: UINT32 }, // start_time
      { num: 7, size: 4, baseType: UINT32 }, // total_elapsed_time, scale 1000
      { num: 5, size: 1, baseType: ENUM }, // sport
      { num: 141, size: 4, baseType: UINT32 }, // max_depth, scale 1000
      { num: 150, size: 1, baseType: SINT8 }, // min_temperature
    ],
    values: [
      lastTimestamp,
      fitStart,
      (depths.length - 1) * sampleIntervalS * 1000,
      asRunningActivity ? 1 : 53, // 1 = running, 53 = diving
      asRunningActivity ? undefined : Math.round((maxDepthM ?? Math.max(...depths)) * 1000),
      minTempC,
    ],
  })

  if (!asRunningActivity) {
    // dive_summary (global 268)
    messages.push({
      localNum: 4,
      globalNum: 268,
      fields: [
        { num: 253, size: 4, baseType: UINT32 }, // timestamp
        { num: 2, size: 4, baseType: UINT32 }, // avg_depth, scale 1000
        { num: 3, size: 4, baseType: UINT32 }, // max_depth, scale 1000
        { num: 4, size: 4, baseType: UINT32 }, // surface_interval, s
        { num: 10, size: 4, baseType: UINT32 }, // dive_number
        { num: 11, size: 4, baseType: UINT32 }, // bottom_time, scale 1000
      ],
      values: [
        lastTimestamp,
        avgDepthM === undefined ? undefined : Math.round(avgDepthM * 1000),
        Math.round((maxDepthM ?? Math.max(...depths)) * 1000),
        surfaceIntervalS,
        diveNumber,
        (depths.length - 1) * sampleIntervalS * 1000,
      ],
    })
  }

  return encodeFit(messages)
}

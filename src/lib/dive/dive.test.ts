import { describe, expect, it } from 'vitest'

import { fitCrc, parseFit, timeWeightedAvgDepth } from './fit'
import { encodeFit, synthesiseDiveFit, FIT_EPOCH_OFFSET_S } from './fitFixture'
import { parseShearwaterCsv, parseShearwaterXml } from './shearwater'
import { detectFormat, parseDiveFile, sourceLabel } from './parse'
import { DiveParseError } from './types'

/** A simple square-ish dive: descend, hold 30 m, ascend. */
function squareProfile(): number[] {
  const depths: number[] = []
  for (let i = 0; i < 10; i++) depths.push(i * 3) // descent to 27
  for (let i = 0; i < 20; i++) depths.push(30) // bottom
  for (let i = 9; i >= 0; i--) depths.push(i * 3) // ascent
  return depths
}

describe('FIT CRC', () => {
  it('matches the protocol check value for the ASCII digits 1-9', () => {
    // The FIT CRC-16 is fully determined by its published nibble table, so an
    // independent implementation of the same algorithm must agree. Computed
    // here by a straight transcription of the algorithm rather than by calling
    // the module under test.
    const bytes = new TextEncoder().encode('123456789')
    const table = [
      0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00,
      0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
    ]
    let expected = 0
    for (const byte of bytes) {
      let tmp = table[expected & 0xf]
      expected = (expected >> 4) & 0x0fff
      expected = expected ^ tmp ^ table[byte & 0xf]
      tmp = table[expected & 0xf]
      expected = (expected >> 4) & 0x0fff
      expected = expected ^ tmp ^ table[(byte >> 4) & 0xf]
    }
    expect(fitCrc(bytes, 0, bytes.length)).toBe(expected & 0xffff)
  })

  it('changes when any byte changes', () => {
    const a = Uint8Array.from([1, 2, 3, 4, 5])
    const b = Uint8Array.from([1, 2, 3, 4, 6])
    expect(fitCrc(a, 0, a.length)).not.toBe(fitCrc(b, 0, b.length))
  })
})

describe('synthesised FIT byte layout', () => {
  it('writes the header the protocol describes', () => {
    const buffer = synthesiseDiveFit({ depths: [0, 5, 10] })
    const bytes = new Uint8Array(buffer)
    const view = new DataView(buffer)

    expect(bytes[0]).toBe(14) // header size
    expect(String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])).toBe('.FIT')

    const dataSize = view.getUint32(4, true)
    // header + declared data + 2-byte file CRC accounts for the whole file
    expect(14 + dataSize + 2).toBe(bytes.length)

    // Both CRCs verify against an independent computation over the same ranges.
    expect(view.getUint16(12, true)).toBe(fitCrc(bytes, 0, 12))
    expect(view.getUint16(14 + dataSize, true)).toBe(fitCrc(bytes, 0, 14 + dataSize))
  })

  it('marks definition messages with bit 6 and data messages without it', () => {
    const buffer = encodeFit([
      {
        localNum: 0,
        globalNum: 20,
        fields: [{ num: 92, size: 4, baseType: 0x06 }],
        values: [12345],
      },
    ])
    const bytes = new Uint8Array(buffer)
    // First record byte sits immediately after the 14-byte header.
    expect(bytes[14] & 0x40).toBe(0x40) // definition
    expect(bytes[14] & 0x80).toBe(0) // not compressed
    // reserved, architecture, global(2), field count, then 3 bytes of field def
    const dataHeaderIndex = 14 + 1 + 1 + 1 + 2 + 1 + 3
    expect(bytes[dataHeaderIndex] & 0x40).toBe(0) // data message
  })
})

describe('parseFit', () => {
  it('reads depth at the profile scale of 1000 (millimetres to metres)', () => {
    // Written as an explicit millimetre value so the test states the scale
    // independently: 31.42 m must come back from 31420 mm.
    const dive = parseFit(synthesiseDiveFit({ depths: [0, 31.42, 0], maxDepthM: 31.42 }))
    expect(dive.samples[1].depth).toBeCloseTo(31.42, 3)
    expect(dive.maxDepth).toBeCloseTo(31.42, 3)
  })

  it('parses a full square dive with summary values', () => {
    const depths = squareProfile()
    const dive = parseFit(
      synthesiseDiveFit({
        depths,
        sampleIntervalS: 10,
        maxDepthM: 30,
        avgDepthM: 21.5,
        surfaceIntervalS: 3600,
        diveNumber: 142,
        minTempC: 12,
        gases: [
          { o2: 32, he: 0 },
          { o2: 50, he: 0 },
        ],
      })
    )

    expect(dive.source).toBe('garmin-fit')
    expect(dive.samples).toHaveLength(depths.length)
    expect(dive.maxDepth).toBe(30)
    // 39 intervals of 10 s
    expect(dive.duration).toBe((depths.length - 1) * 10)
    expect(dive.avgDepth).toBeCloseTo(21.5, 3)
    expect(dive.surfaceInterval).toBe(3600)
    expect(dive.diveNumber).toBe(142)
    expect(dive.waterTemp).toBe(12)
    expect(dive.gases).toEqual([
      { o2: 32, he: 0 },
      { o2: 50, he: 0 },
    ])
  })

  it('converts FIT timestamps off the 1989 epoch, not the Unix epoch', () => {
    const startUnix = Date.UTC(2026, 4, 17, 9, 30, 0) / 1000
    const dive = parseFit(synthesiseDiveFit({ depths: [0, 10, 0], startUnix }))
    expect(dive.startTime?.getTime()).toBe(startUnix * 1000)
    // Mutation guard: reading the raw value as Unix seconds would land in 1990.
    expect(dive.startTime?.getUTCFullYear()).toBe(2026)
    expect(FIT_EPOCH_OFFSET_S).toBe(631065600)
  })

  it('starts the sample clock at zero regardless of the absolute timestamp', () => {
    const dive = parseFit(
      synthesiseDiveFit({ depths: [0, 5, 10, 5, 0], sampleIntervalS: 30 })
    )
    expect(dive.samples[0].t).toBe(0)
    expect(dive.samples[4].t).toBe(120)
  })

  it('reads per-sample temperature and reports the coldest as water temp', () => {
    const dive = parseFit(
      synthesiseDiveFit({
        depths: [0, 20, 30, 20, 0],
        temps: [22, 18, 11, 14, 21],
      })
    )
    expect(dive.samples[2].temp).toBe(11)
    // The mean would be ~17; a diver means the cold one.
    expect(dive.waterTemp).toBe(11)
  })

  it('drops fields written as the invalid sentinel rather than reading them as data', () => {
    // avg_depth omitted -> uint32 invalid 0xFFFFFFFF. Read naively that is
    // 4294967.295 m; it must instead fall through to the computed average.
    const dive = parseFit(
      synthesiseDiveFit({ depths: [0, 10, 20, 10, 0], avgDepthM: undefined })
    )
    expect(dive.avgDepth).toBeLessThan(30)
    expect(dive.avgDepth).toBeGreaterThan(0)
  })

  it('skips developer field data without desynchronising the stream', () => {
    // A definition with the developer-data flag set declares 1 developer field
    // of 4 bytes; those bytes must be consumed after the regular fields, or the
    // next record header is read from the middle of this record.
    const body: number[] = []
    // definition: header 0x60 = definition + developer data flag
    body.push(0x60, 0, 0, 20, 0, 1, 92, 4, 0x06)
    body.push(1, 0, 4, 0) // 1 dev field: num 0, size 4, dev index 0
    // two data messages, each with 4 bytes depth + 4 bytes developer payload
    for (const mm of [12000, 24000]) {
      body.push(0)
      body.push(mm & 0xff, (mm >> 8) & 0xff, (mm >> 16) & 0xff, (mm >> 24) & 0xff)
      body.push(0xde, 0xad, 0xbe, 0xef)
    }

    const out = new Uint8Array(14 + body.length + 2)
    out[0] = 14
    out[1] = 0x20
    out[2] = 0x8d
    out[3] = 0x08
    new DataView(out.buffer).setUint32(4, body.length, true)
    out.set([0x2e, 0x46, 0x49, 0x54], 8)
    const headerCrc = fitCrc(out, 0, 12)
    out[12] = headerCrc & 0xff
    out[13] = (headerCrc >> 8) & 0xff
    out.set(body, 14)
    const fileCrc = fitCrc(out, 0, 14 + body.length)
    out[14 + body.length] = fileCrc & 0xff
    out[15 + body.length] = (fileCrc >> 8) & 0xff

    const dive = parseFit(out.buffer)
    expect(dive.samples.map((s) => s.depth)).toEqual([12, 24])
  })

  it('rejects a file whose CRC does not match its contents', () => {
    const buffer = synthesiseDiveFit({ depths: [0, 10, 20, 0] })
    const bytes = new Uint8Array(buffer)
    // Corrupt a depth byte in the middle of the record stream.
    bytes[40] = bytes[40] ^ 0xff
    expect(() => parseFit(bytes.buffer)).toThrowError(
      expect.objectContaining({ code: 'corrupt' })
    )
  })

  it('rejects a truncated file', () => {
    const buffer = synthesiseDiveFit({ depths: squareProfile() })
    const truncated = new Uint8Array(buffer).slice(0, 60)
    expect(() => parseFit(truncated.buffer)).toThrowError(
      expect.objectContaining({ code: 'truncated' })
    )
  })

  it('rejects a file that is not FIT at all', () => {
    const bytes = new TextEncoder().encode('this is definitely not a FIT file at all')
    expect(() => parseFit(bytes.buffer as ArrayBuffer)).toThrowError(
      expect.objectContaining({ code: 'not-recognised' })
    )
  })

  it('names the problem when a running activity has no depth', () => {
    const buffer = synthesiseDiveFit({ depths: [0, 0, 0], asRunningActivity: true })
    try {
      parseFit(buffer)
      throw new Error('expected a parse error')
    } catch (error) {
      expect(error).toBeInstanceOf(DiveParseError)
      const parseError = error as DiveParseError
      expect(parseError.code).toBe('no-dive-data')
      expect(parseError.message).toMatch(/run or a ride/i)
    }
  })
})

describe('timeWeightedAvgDepth', () => {
  it('weights by time, not by sample count', () => {
    // 10 m held for 100 s, then 30 m held for 100 s -> mean 20 m, even though
    // the shallow leg is sampled far more often.
    const samples = [
      ...Array.from({ length: 21 }, (_, i) => ({ t: i * 5, depth: 10 })),
      { t: 100, depth: 30 },
      { t: 200, depth: 30 },
    ]
    expect(timeWeightedAvgDepth(samples)).toBeCloseTo(20, 1)
  })

  it('handles a single sample', () => {
    expect(timeWeightedAvgDepth([{ t: 0, depth: 12 }])).toBe(12)
  })
})

const SHEARWATER_CSV = `Dive Number,Date,Time,Sample Time,Sample Depth (m),Sample Temperature (C),Sample Pressure
27,2026-03-14,08:12:00,0,0.0,21,210
27,2026-03-14,08:12:00,10,6.4,20,208
27,2026-03-14,08:12:00,20,18.2,17,205
27,2026-03-14,08:12:00,30,32.5,13,200
27,2026-03-14,08:12:00,40,32.9,13,195
27,2026-03-14,08:12:00,50,18.0,15,190
27,2026-03-14,08:12:00,60,5.0,19,186
27,2026-03-14,08:12:00,70,0.0,21,184
`

describe('parseShearwaterCsv', () => {
  it('parses samples, max depth, duration and start time', () => {
    const dive = parseShearwaterCsv(SHEARWATER_CSV)
    expect(dive.source).toBe('shearwater-csv')
    expect(dive.samples).toHaveLength(8)
    expect(dive.maxDepth).toBeCloseTo(32.9, 3)
    expect(dive.duration).toBe(70)
    expect(dive.diveNumber).toBe(27)
    expect(dive.waterTemp).toBe(13)
    expect(dive.startTime?.getFullYear()).toBe(2026)
    expect(dive.startTime?.getMonth()).toBe(2) // March
    expect(dive.startTime?.getDate()).toBe(14)
    expect(dive.startTime?.getHours()).toBe(8)
  })

  it('converts a feet-headed depth column to metres', () => {
    const csv = `Sample Time,Sample Depth (ft)
0,0
10,100
20,0
`
    const dive = parseShearwaterCsv(csv)
    // 100 ft = 30.48 m. Reading feet as metres would give 100.
    expect(dive.maxDepth).toBeCloseTo(30.48, 3)
  })

  it('converts a Fahrenheit temperature column to Celsius', () => {
    const csv = `Sample Time,Depth (m),Temperature (F)
0,0,72
10,20,50
20,0,72
`
    const dive = parseShearwaterCsv(csv)
    expect(dive.waterTemp).toBeCloseTo(10, 3) // 50 F
  })

  it('reads the no-sensor sentinel before converting units, not after', () => {
    // Shearwater writes a literal 0 where the sensor reported nothing. On an
    // imperial export, converting first turns every sentinel into −17.78 °C —
    // a profile with variation in it, so the all-zeros check downstream no
    // longer recognises it, and the card printed "Water temp −18 °C" for a
    // dive that recorded no temperature at all.
    const csv = `Sample Time,Depth (ft),Temperature (F)
0,0,0
10,60,0
20,0,0
`
    const dive = parseShearwaterCsv(csv)
    expect(dive.waterTemp).toBeUndefined()
  })

  it('still reports a real Fahrenheit reading alongside a zero sample', () => {
    // The sentinel is all-zeros. One zero among real readings is discarded as
    // a sample, but must not suppress the temperature the dive did record.
    const csv = `Sample Time,Depth (ft),Temperature (F)
0,0,0
10,60,50
20,0,50
`
    const dive = parseShearwaterCsv(csv)
    expect(dive.waterTemp).toBeCloseTo(10, 3)
  })

  it('skips a metadata preamble and finds the real header row', () => {
    const csv = `Shearwater Cloud Export
Serial: 1234567
Computer: Perdix AI

Sample Time,Sample Depth (m)
0,0
10,15
20,0
`
    const dive = parseShearwaterCsv(csv)
    expect(dive.samples).toHaveLength(3)
    expect(dive.maxDepth).toBe(15)
  })

  it('matches columns by name, not by position', () => {
    // Same data, columns reordered. A positional parser reads depth as
    // temperature here and silently reports a 13 m dive.
    const csv = `Sample Temperature (C),Sample Depth (m),Sample Time
21,0,0
13,32.5,30
21,0,60
`
    const dive = parseShearwaterCsv(csv)
    expect(dive.maxDepth).toBeCloseTo(32.5, 3)
    expect(dive.duration).toBe(60)
    expect(dive.waterTemp).toBe(13)
  })

  it('reads clock-formatted sample times', () => {
    const csv = `Sample Time,Sample Depth (m)
0:00,0
0:30,20
1:00,25
1:30,0
`
    const dive = parseShearwaterCsv(csv)
    expect(dive.duration).toBe(90)
  })

  it('reports a CSV with no dive columns specifically', () => {
    expect(() => parseShearwaterCsv('name,age\nalice,30\n')).toThrowError(
      expect.objectContaining({ code: 'not-recognised' })
    )
  })

  it('reports a header with no readable rows specifically', () => {
    expect(() => parseShearwaterCsv('Sample Time,Sample Depth (m)\n')).toThrowError(
      expect.objectContaining({ code: 'empty-profile' })
    )
  })

  it('treats an all-zero temperature column as no reading', () => {
    const csv = `Sample Time,Sample Depth (m),Sample Temperature (C)
0,0,0
10,20,0
20,0,0
`
    expect(parseShearwaterCsv(csv).waterTemp).toBeUndefined()
  })
})

/**
 * The real Shearwater Cloud shape, verified against a Petrel 3 export: a
 * dive-level metadata header row, its value row, then the sample header and
 * samples. Column names, ordering and the US date format are reproduced
 * exactly; only the sample count is cut down.
 */
const PETREL_CSV = `Dive Number,GF Minimum,GF Maximum,Surface Interval (min),Imperial Units,Start CNS %,Start Date,Max Depth,Max Time,End Date,Computer Serial Number,Computer Model,Product
34,40,80,1292,False,0,12/13/2024 10:23:13 AM,46,4617,12/13/2024 11:40:05 AM,B9FBA2C0,4,Petrel 3
Time (sec),Depth,First Stop Depth,Time To Surface (min),Average PPO2,Fraction O2,Fraction He,Current NDL,Water Temp,Battery Voltage
0,0,0,0,0.64,0.18,0.26,0,28,1.27
10,1.7,0,1,0.72,0.18,0.26,99,28,1.27
20,2.6,0,1,0.62,0.18,0.26,99,28,1.27
30,3.6,0,1,0.66,0.18,0.26,99,28,1.27
40,5.7,0,1,0.77,0.18,0.26,99,27,1.27
50,30.4,0,1,1.02,0.18,0.26,20,24,1.27
60,45.7,6,12,1.18,0.18,0.26,0,22,1.27
70,45.1,6,12,1.19,0.18,0.26,0,22,1.27
80,20.0,6,9,1.10,0.18,0.26,0,25,1.27
90,0,0,0,0.70,0.18,0.26,0,28,1.27
`

describe('parseShearwaterCsv — real Petrel 3 export shape', () => {
  it('reads the dive-level metadata block above the samples', () => {
    const dive = parseShearwaterCsv(PETREL_CSV)
    expect(dive.diveNumber).toBe(34)
    // "Surface Interval (min)" is minutes; the model holds seconds.
    expect(dive.surfaceInterval).toBe(1292 * 60)
  })

  it('parses the US-format start date without transposing day and month', () => {
    const dive = parseShearwaterCsv(PETREL_CSV)
    // 12/13/2024 is unambiguously December 13th — there is no 13th month.
    expect(dive.startTime?.getFullYear()).toBe(2024)
    expect(dive.startTime?.getMonth()).toBe(11) // December
    expect(dive.startTime?.getDate()).toBe(13)
    expect(dive.startTime?.getHours()).toBe(10)
    expect(dive.startTime?.getMinutes()).toBe(23)
  })

  it('reads bare "Depth" and "Water Temp" sample columns', () => {
    const dive = parseShearwaterCsv(PETREL_CSV)
    expect(dive.maxDepth).toBeCloseTo(45.7, 3)
    expect(dive.duration).toBe(90)
    expect(dive.waterTemp).toBe(22)
  })

  it('does not mistake "Time To Surface (min)" for the sample time column', () => {
    // Both match a loose "time" search; picking the wrong one collapses the
    // whole profile into a 12-second dive.
    const dive = parseShearwaterCsv(PETREL_CSV)
    expect(dive.duration).toBe(90)
  })

  it('treats the depth column as feet when the metadata says imperial', () => {
    // Same file, Imperial Units flipped. The sample header is bare, so the
    // metadata flag is the only statement of the unit; ignoring it reports a
    // 150 ft dive as 150 m.
    const imperial = PETREL_CSV.replace(',False,', ',True,')
    const dive = parseShearwaterCsv(imperial)
    expect(dive.maxDepth).toBeCloseTo(45.7 * 0.3048, 3)
  })

  it('keeps metres when the metadata says metric', () => {
    expect(parseShearwaterCsv(PETREL_CSV).maxDepth).toBeCloseTo(45.7, 3)
  })

  it('produces a profile that descends and returns to the surface', () => {
    const dive = parseShearwaterCsv(PETREL_CSV)
    expect(dive.samples[0].depth).toBe(0)
    expect(dive.samples[dive.samples.length - 1].depth).toBe(0)
    // The deepest point is in the middle, not at t=0 — the shape check that
    // catches a transposed or mis-scaled depth column.
    const deepest = dive.samples.reduce((a, b) => (b.depth > a.depth ? b : a))
    expect(deepest.t).toBeGreaterThan(0)
    expect(deepest.t).toBeLessThan(dive.duration)
  })
})

const SHEARWATER_XML = `<?xml version="1.0" encoding="utf-8"?>
<dive>
  <number>18</number>
  <startDate>2026-02-02 14:05:00</startDate>
  <diveLogRecords>
    <diveLogRecord><currentTime>0</currentTime><currentDepth>0.0</currentDepth><waterTemp>19</waterTemp></diveLogRecord>
    <diveLogRecord><currentTime>60000</currentTime><currentDepth>21.3</currentDepth><waterTemp>15</waterTemp></diveLogRecord>
    <diveLogRecord><currentTime>120000</currentTime><currentDepth>41.7</currentDepth><waterTemp>11</waterTemp></diveLogRecord>
    <diveLogRecord><currentTime>180000</currentTime><currentDepth>20.0</currentDepth><waterTemp>14</waterTemp></diveLogRecord>
    <diveLogRecord><currentTime>240000</currentTime><currentDepth>0.0</currentDepth><waterTemp>19</waterTemp></diveLogRecord>
  </diveLogRecords>
</dive>
`

describe('parseShearwaterXml', () => {
  it('parses records, converting currentTime from milliseconds', () => {
    const dive = parseShearwaterXml(SHEARWATER_XML)
    expect(dive.source).toBe('shearwater-xml')
    expect(dive.samples).toHaveLength(5)
    expect(dive.duration).toBe(240) // 240000 ms, not 240000 s
    expect(dive.maxDepth).toBeCloseTo(41.7, 3)
    expect(dive.waterTemp).toBe(11)
    expect(dive.diveNumber).toBe(18)
    expect(dive.startTime?.getFullYear()).toBe(2026)
  })

  it('rejects XML with no dive records', () => {
    expect(() => parseShearwaterXml('<?xml version="1.0"?><root><a/></root>')).toThrowError(
      expect.objectContaining({ code: 'not-recognised' })
    )
  })

  it('reports records that carry no usable depth', () => {
    const xml = `<dive><diveLogRecord><ttsMins>3</ttsMins></diveLogRecord></dive>`
    expect(() => parseShearwaterXml(xml)).toThrowError(
      expect.objectContaining({ code: 'empty-profile' })
    )
  })
})

describe('detectFormat', () => {
  const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

  it('detects FIT by its magic bytes, not by extension', () => {
    expect(detectFormat(synthesiseDiveFit({ depths: [0, 5, 0] }))).toBe('fit')
  })

  it('detects Shearwater XML', () => {
    expect(detectFormat(encode(SHEARWATER_XML))).toBe('shearwater-xml')
  })

  it('detects Shearwater CSV', () => {
    expect(detectFormat(encode(SHEARWATER_CSV))).toBe('shearwater-csv')
  })

  it('does not mistake arbitrary binary for CSV', () => {
    const bytes = new Uint8Array(64)
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG magic
    expect(detectFormat(bytes.buffer)).toBe('unknown')
  })
})

describe('parseDiveFile', () => {
  it('routes each format to its parser', () => {
    expect(parseDiveFile(synthesiseDiveFit({ depths: [0, 10, 0] })).source).toBe('garmin-fit')
    expect(
      parseDiveFile(new TextEncoder().encode(SHEARWATER_CSV).buffer as ArrayBuffer).source
    ).toBe('shearwater-csv')
    expect(
      parseDiveFile(new TextEncoder().encode(SHEARWATER_XML).buffer as ArrayBuffer).source
    ).toBe('shearwater-xml')
  })

  it('reports an empty file', () => {
    expect(() => parseDiveFile(new ArrayBuffer(0))).toThrowError(
      expect.objectContaining({ code: 'truncated' })
    )
  })

  it('reports an unrecognised file', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 4, 5, 6, 7])
    expect(() => parseDiveFile(bytes.buffer)).toThrowError(
      expect.objectContaining({ code: 'not-recognised' })
    )
  })

  it('labels every source', () => {
    expect(sourceLabel('garmin-fit')).toBe('Garmin FIT')
    expect(sourceLabel('shearwater-csv')).toBe('Shearwater CSV')
    expect(sourceLabel('shearwater-xml')).toBe('Shearwater XML')
  })
})

/**
 * Format detection and the one entry point the UI calls.
 *
 * Detection sniffs *content*, never the file extension. A diver who renamed an
 * export, or whose OS handed us `dive.txt`, still gets a parsed dive; and a
 * `.fit` file that is really a CSV fails with an honest message instead of a
 * binary-decoding error at byte 3.
 */

import { parseFit } from './fit'
import { parseShearwaterCsv, parseShearwaterXml } from './shearwater'
import { DiveParseError, type Dive } from './types'

export type DiveFileFormat = 'fit' | 'shearwater-xml' | 'shearwater-csv' | 'unknown'

/** Decodes the leading bytes as UTF-8 for sniffing, without decoding the lot. */
function leadingText(bytes: Uint8Array, length = 4096): string {
  const slice = bytes.subarray(0, Math.min(length, bytes.length))
  return new TextDecoder('utf-8', { fatal: false }).decode(slice)
}

/**
 * Identifies the format of a dive file from its contents.
 *
 * FIT is checked first and is unambiguous: bytes 8-11 are the literal ".FIT".
 * XML and CSV are then separated by structure rather than by guessing.
 */
export function detectFormat(buffer: ArrayBuffer): DiveFileFormat {
  const bytes = new Uint8Array(buffer)

  // FIT: ".FIT" magic at offset 8, per the file header layout.
  if (
    bytes.length >= 12 &&
    bytes[8] === 0x2e && // .
    bytes[9] === 0x46 && // F
    bytes[10] === 0x49 && // I
    bytes[11] === 0x54 // T
  ) {
    return 'fit'
  }

  // A NUL byte in the first block means binary; neither text format we support
  // contains one. Checked before the text sniffs so a non-FIT binary cannot be
  // misread as a CSV that happens to contain the letters "depth".
  const probe = bytes.subarray(0, Math.min(4096, bytes.length))
  if (probe.includes(0)) return 'unknown'

  const head = leadingText(bytes)

  if (/<\s*diveLogRecord\b/i.test(head) || (/^\s*<\?xml/i.test(head) && /<\s*dive/i.test(head))) {
    return 'shearwater-xml'
  }
  if (/^\s*</.test(head) && /<\s*dive/i.test(head)) return 'shearwater-xml'

  // CSV: a line with a depth-ish column and at least one delimiter.
  const lines = head.split(/\r?\n/).slice(0, 40)
  const looksTabular = lines.some(
    (l) => /depth/i.test(l) && (l.includes(',') || l.includes(';') || l.includes('\t'))
  )
  if (looksTabular) return 'shearwater-csv'

  return 'unknown'
}

/**
 * Parses any supported dive file into the normalised model.
 *
 * Throws `DiveParseError`; the UI maps `code` onto specific copy.
 */
export function parseDiveFile(buffer: ArrayBuffer): Dive {
  if (buffer.byteLength === 0) {
    throw new DiveParseError('truncated', 'That file is empty.', '0 bytes')
  }

  const format = detectFormat(buffer)

  switch (format) {
    case 'fit':
      return parseFit(buffer)
    case 'shearwater-xml':
      return parseShearwaterXml(new TextDecoder().decode(buffer))
    case 'shearwater-csv':
      return parseShearwaterCsv(new TextDecoder().decode(buffer))
    default:
      throw new DiveParseError(
        'not-recognised',
        'That file is not a dive log this tool can read. It accepts Garmin .fit files and Shearwater CSV or XML exports.',
        `${buffer.byteLength} bytes, no recognised signature`
      )
  }
}

/** Human-readable name for a source, for the card and the UI. */
export function sourceLabel(source: Dive['source']): string {
  switch (source) {
    case 'garmin-fit':
      return 'Garmin FIT'
    case 'shearwater-csv':
      return 'Shearwater CSV'
    case 'shearwater-xml':
      return 'Shearwater XML'
  }
}

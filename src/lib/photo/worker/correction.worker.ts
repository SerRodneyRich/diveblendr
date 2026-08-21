/**
 * Correction worker.
 *
 * WHY A WORKER
 * ------------
 * Correcting a 12-megapixel image is ~48 million byte operations. On the main
 * thread that is a multi-second freeze: no scroll, no slider, no spinner
 * animation — the tab simply stops. The previous implementation ran everything
 * on the main thread and tried to paper over it with `await setTimeout(0)`
 * between tiles, which yields between blocks but still blocks within each one.
 *
 * HOW IT SURVIVES `output: export`
 * --------------------------------
 * Instantiated with the `new Worker(new URL('./correction.worker.ts', import.meta.url))`
 * pattern, which webpack understands statically and emits as a separate chunk
 * at build time. No runtime path construction, no CDN, no `eval` — so it works
 * from a static export served off any origin, and satisfies the existing
 * `worker-src 'self'` CSP directive.
 *
 * The pixel buffer is transferred, not copied (see the `postMessage` transfer
 * list), so a 48 MB buffer changes hands with no allocation.
 */

/// <reference lib="webworker" />

import { processBuffer, type CorrectionSettings, type CorrectionAnalysis } from '../pipeline'
import { estimateWhiteBalance, type WhiteBalanceEstimate } from '../autoWhiteBalance'

export interface CorrectionRequest {
  id: number
  buffer: ArrayBuffer
  width: number
  height: number
  settings: CorrectionSettings
  /** Reuse a previously computed estimate instead of re-deriving it. */
  estimate?: WhiteBalanceEstimate
}

export interface CorrectionResponse {
  id: number
  buffer: ArrayBuffer
  analysis: CorrectionAnalysis
  estimate?: WhiteBalanceEstimate
  error?: string
}

self.onmessage = (event: MessageEvent<CorrectionRequest>) => {
  const { id, buffer, settings, estimate } = event.data

  try {
    const data = new Uint8ClampedArray(buffer)

    // Compute the estimate once here if the caller did not supply one, and
    // return it so the caller can reuse it for the full-resolution pass. A
    // white-balance estimate is a *global* statistic: recomputing it on a
    // different crop would give a different correction for the same photo.
    const effectiveEstimate =
      estimate ??
      (settings.autoWhiteBalance
        ? estimateWhiteBalance(data, { stride: data.length > 4_000_000 ? 7 : 1 })
        : undefined)

    const analysis = processBuffer(data, settings, { estimate: effectiveEstimate })

    const response: CorrectionResponse = {
      id,
      buffer: data.buffer as ArrayBuffer,
      analysis,
      estimate: effectiveEstimate,
    }
    ;(self as unknown as Worker).postMessage(response, [data.buffer as ArrayBuffer])
  } catch (error) {
    const response: CorrectionResponse = {
      id,
      buffer: new ArrayBuffer(0),
      analysis: { appliedGain: { r: 1, g: 1, b: 1 }, capped: false },
      error: error instanceof Error ? error.message : 'Correction failed',
    }
    ;(self as unknown as Worker).postMessage(response)
  }
}

'use client'

/**
 * The hook that drives correction: worker lifecycle, debounce, undo/redo.
 *
 * WHY A HOOK AND NOT COMPONENT STATE
 * ----------------------------------
 * The previous editor coordinated one derived image across nine `useState`s
 * (`baseProcessedCanvas`, `cleanProcessedCanvas`, `lastEnhancementSettings`,
 * `isProcessing`, `isEnhancing`, …) with the settings also duplicated on the
 * parent page. Keeping them consistent was manual, and they drifted — turning
 * on an enhancement discarded every colour correction, because one branch
 * forgot to reapply them.
 *
 * Here there is exactly one source of truth (`settings`), one derived artifact
 * (the preview URL), and the derivation runs in a worker.
 *
 * PREVIEW VS EXPORT
 * -----------------
 * Interactive edits run against a downscaled proxy — correcting 1600px is
 * milliseconds, correcting 12 MP is seconds, and nobody can see the difference
 * on screen. The full-resolution pass runs once, on export.
 *
 * The white-balance estimate is computed from the proxy and then *reused* for
 * the export. It is a global statistic, so re-estimating it at full resolution
 * would give a subtly different correction than the one the user approved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, type CorrectionSettings, type CorrectionAnalysis } from './pipeline'
import type { WhiteBalanceEstimate } from './autoWhiteBalance'
import type { CorrectionRequest, CorrectionResponse } from './worker/correction.worker'
import { processBuffer } from './pipeline'

/** Longest edge used for the interactive preview. */
const PREVIEW_MAX_EDGE = 1600

export interface UseCorrectionResult {
  settings: CorrectionSettings
  /** Update settings and push an undo entry. */
  update: (patch: Partial<CorrectionSettings>) => void
  /** Replace all settings (preset application) and push an undo entry. */
  replace: (next: CorrectionSettings) => void
  reset: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  analysis: CorrectionAnalysis | null
  estimate: WhiteBalanceEstimate | undefined
  busy: boolean
  error: string | null
}

interface HistoryState {
  past: CorrectionSettings[]
  present: CorrectionSettings
  future: CorrectionSettings[]
}

/** Undo/redo over the settings object. */
export function useCorrectionSettings(initial: CorrectionSettings = DEFAULT_SETTINGS) {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: initial,
    future: [],
  })

  // Coalesce rapid changes from a slider drag into one undo entry, so a single
  // Ctrl+Z does not step back through 200 intermediate values.
  const lastPushRef = useRef(0)
  const COALESCE_MS = 500

  const commit = useCallback((next: CorrectionSettings) => {
    const now = Date.now()
    const coalesce = now - lastPushRef.current < COALESCE_MS
    lastPushRef.current = now

    setHistory((h) => ({
      past: coalesce && h.past.length > 0 ? h.past : [...h.past, h.present].slice(-50),
      present: next,
      future: [],
    }))
  }, [])

  const update = useCallback(
    (patch: Partial<CorrectionSettings>) => {
      setHistory((h) => {
        const next = { ...h.present, ...patch }
        const now = Date.now()
        const coalesce = now - lastPushRef.current < COALESCE_MS
        lastPushRef.current = now
        return {
          past: coalesce && h.past.length > 0 ? h.past : [...h.past, h.present].slice(-50),
          present: next,
          future: [],
        }
      })
    },
    []
  )

  const replace = useCallback(
    (next: CorrectionSettings) => {
      // A preset is a discrete action, so it always gets its own undo entry.
      lastPushRef.current = 0
      commit(next)
    },
    [commit]
  )

  const reset = useCallback(() => {
    lastPushRef.current = 0
    commit(DEFAULT_SETTINGS)
  }, [commit])

  const undo = useCallback(() => {
    lastPushRef.current = 0
    setHistory((h) => {
      if (h.past.length === 0) return h
      const previous = h.past[h.past.length - 1]
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future].slice(0, 50),
      }
    })
  }, [])

  const redo = useCallback(() => {
    lastPushRef.current = 0
    setHistory((h) => {
      if (h.future.length === 0) return h
      const next = h.future[0]
      return {
        past: [...h.past, h.present].slice(-50),
        present: next,
        future: h.future.slice(1),
      }
    })
  }, [])

  return {
    settings: history.present,
    update,
    replace,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }
}

/**
 * Owns the worker. Falls back to main-thread processing where workers are
 * unavailable (older Safari, some embedded webviews) so the tool still works.
 */
export function useCorrectionWorker() {
  const workerRef = useRef<Worker | null>(null)
  const nextIdRef = useRef(1)
  const pendingRef = useRef(new Map<number, (r: CorrectionResponse) => void>())
  const [supported, setSupported] = useState(true)
  /**
   * Whether the worker-creation effect has run yet.
   *
   * `run` is a stable callback, so a job issued before the effect mounts would
   * see a null `workerRef` and silently take the main-thread path. Tracking
   * readiness lets the first job wait for the worker instead of racing it.
   */
  const readyRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      readyRef.current = true
      setSupported(false)
      return
    }

    let worker: Worker
    try {
      // This exact form — `new URL(..., import.meta.url)` inline — is what lets
      // webpack emit the worker as its own chunk at build time. A computed path
      // would break under `output: export`.
      worker = new Worker(new URL('./worker/correction.worker.ts', import.meta.url))
    } catch {
      readyRef.current = true
      setSupported(false)
      return
    }

    worker.onmessage = (event: MessageEvent<CorrectionResponse>) => {
      const resolve = pendingRef.current.get(event.data.id)
      if (resolve) {
        pendingRef.current.delete(event.data.id)
        resolve(event.data)
      }
    }
    worker.onerror = () => setSupported(false)

    workerRef.current = worker
    readyRef.current = true

    // Captured now, not read at teardown. The ref's `.current` could point at a
    // different Map by the time cleanup runs, which would leave this worker's
    // callbacks resolved against the wrong generation's pending set.
    const pending = pendingRef.current

    return () => {
      worker.terminate()
      workerRef.current = null
      readyRef.current = false
      pending.clear()
    }
  }, [])

  const run = useCallback(
    (
      data: Uint8ClampedArray,
      width: number,
      height: number,
      settings: CorrectionSettings,
      estimate?: WhiteBalanceEstimate
    ): Promise<CorrectionResponse> => {
      // Let the worker-creation effect finish before deciding there is no
      // worker. Without this the very first correction — the one that produces
      // the initial preview — could take the fallback path purely on timing.
      const waitForReady = async () => {
        for (let i = 0; i < 50 && !readyRef.current; i++) {
          await new Promise((r) => setTimeout(r, 10))
        }
      }

      return waitForReady().then(() => runNow())

      function runNow(): Promise<CorrectionResponse> {
      const worker = workerRef.current
      const id = nextIdRef.current++

      if (!worker) {
        // Main-thread fallback. Same pure function, so the result is identical.
        const copy = new Uint8ClampedArray(data)
        const analysis = processBuffer(copy, settings, { estimate })
        return Promise.resolve({
          id,
          buffer: copy.buffer as ArrayBuffer,
          analysis,
          estimate,
        })
      }

      return new Promise((resolve) => {
        pendingRef.current.set(id, resolve)
        // Copy before transferring: the caller's buffer must stay intact so the
        // next edit can start from the unmodified original rather than
        // compounding corrections.
        const copy = new Uint8ClampedArray(data)
        const request: CorrectionRequest = {
          id,
          buffer: copy.buffer as ArrayBuffer,
          width,
          height,
          settings,
          estimate,
        }
        worker.postMessage(request, [copy.buffer as ArrayBuffer])
      })
      }
    },
    []
  )

  return { run, workerSupported: supported }
}

export { PREVIEW_MAX_EDGE }

/** Debounce a rapidly-changing value. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/** Stable JSON identity for a settings object, for change detection. */
export function useSettingsKey(settings: CorrectionSettings): string {
  return useMemo(() => JSON.stringify(settings), [settings])
}

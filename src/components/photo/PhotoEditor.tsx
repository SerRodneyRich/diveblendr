'use client'

/**
 * The photo editor.
 *
 * Replaces a 1872-line modal and a 1081-line page that each carried their own
 * copy of a 300-line preset table. All correction maths lives in
 * `src/lib/photo/`; this file is composition and layout only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MdDownload,
  MdUndo,
  MdRedo,
  MdRestartAlt,
  MdRotateRight,
  MdShare,
  MdAutoAwesome,
} from 'react-icons/md'
import {
  Button,
  Card,
  CardHeader,
  MessageBar,
  Slider,
  Select,
  SegmentedControl,
  Switch,
  StatCard,
  ToolLayout,
  Inputs,
  Results,
} from '@/components/ui'
import type { MessageBarItem } from '@/components/ui'
import { CompareView } from './CompareView'
import {
  DEFAULT_SETTINGS,
  type CorrectionSettings,
  type CorrectionAnalysis,
} from '@/lib/photo/pipeline'
import { WATER_TYPES } from '@/lib/photo/water'
import { ALL_PRESETS, applyPreset, WATER_CHOICES, DEPTH_BANDS } from '@/lib/photo/presets'
import {
  useCorrectionSettings,
  useCorrectionWorker,
  useDebounced,
  PREVIEW_MAX_EDGE,
} from '@/lib/photo/useCorrection'
import {
  loadImage,
  downscale,
  canvasToBlob,
  exportFilename,
  type ExportFormat,
} from '@/lib/photo/imageIO'
import type { WhiteBalanceEstimate } from '@/lib/photo/autoWhiteBalance'

export interface PhotoEditorProps {
  file: File
  onClose: () => void
}

type Tab = 'auto' | 'conditions' | 'manual' | 'export'

export function PhotoEditor({ file, onClose }: PhotoEditorProps) {
  const { settings, update, replace, reset, undo, redo, canUndo, canRedo } =
    useCorrectionSettings(DEFAULT_SETTINGS)
  const { run, workerSupported } = useCorrectionWorker()

  const [tab, setTab] = useState<Tab>('auto')
  const [quarterTurns, setQuarterTurns] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [analysis, setAnalysis] = useState<CorrectionAnalysis | null>(null)
  const [estimate, setEstimate] = useState<WhiteBalanceEstimate | undefined>()
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null)
  const [afterUrl, setAfterUrl] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('image/jpeg')
  const [quality, setQuality] = useState(0.92)
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)

  /** Full-resolution source, orientation already baked in. */
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null)
  /**
   * Downscaled proxy used for every interactive edit.
   *
   * State, not a ref, and deliberately so: the preview effect depends on it.
   * Holding it in a ref meant the effect ran once on mount with nothing loaded,
   * returned early, and never re-ran when the image arrived — the preview sat
   * on "Preparing preview…" forever.
   */
  const [proxy, setProxy] = useState<{
    data: Uint8ClampedArray
    w: number
    h: number
  } | null>(null)
  /** Every object URL we have created, so none leak. */
  const urlsRef = useRef<Set<string>>(new Set())

  const trackUrl = useCallback((url: string) => {
    urlsRef.current.add(url)
    return url
  }, [])

  const releaseUrl = useCallback((url: string | null) => {
    if (url && urlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      urlsRef.current.delete(url)
    }
  }, [])

  // Revoke every outstanding object URL on unmount. The previous editor leaked
  // a full-resolution blob on every re-process.
  useEffect(() => {
    const urls = urlsRef.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  // Load (and reload on rotation), baking EXIF orientation into the pixels.
  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    setBusy(true)

    loadImage(file, quarterTurns)
      .then(async ({ canvas, width, height }) => {
        if (cancelled) return
        fullCanvasRef.current = canvas
        setDimensions({ w: width, h: height })

        const proxyCanvas = downscale(canvas, PREVIEW_MAX_EDGE)
        const ctx = proxyCanvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('Canvas 2D is unavailable in this browser')
        const imageData = ctx.getImageData(0, 0, proxyCanvas.width, proxyCanvas.height)
        setProxy({
          data: imageData.data,
          w: proxyCanvas.width,
          h: proxyCanvas.height,
        })

        const blob = await canvasToBlob(proxyCanvas, { format: 'image/jpeg', quality: 0.92 })
        if (cancelled) return
        setBeforeUrl((prev) => {
          releaseUrl(prev)
          return trackUrl(URL.createObjectURL(blob))
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not open this image')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })

    return () => {
      cancelled = true
    }
  }, [file, quarterTurns, releaseUrl, trackUrl])

  // Debounce so a slider drag issues one job, not one per pixel of travel.
  const debouncedSettings = useDebounced(settings, 120)

  // Re-derive the preview whenever the settings settle.
  useEffect(() => {
    if (!proxy) return

    let cancelled = false
    setBusy(true)

    run(proxy.data, proxy.w, proxy.h, debouncedSettings, undefined)
      .then(async (response) => {
        if (cancelled || response.error) return
        setAnalysis(response.analysis)
        if (response.estimate) setEstimate(response.estimate)

        const out = new Uint8ClampedArray(response.buffer)
        const canvas = document.createElement('canvas')
        canvas.width = proxy.w
        canvas.height = proxy.h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.putImageData(new ImageData(out, proxy.w, proxy.h), 0, 0)

        const blob = await canvasToBlob(canvas, { format: 'image/jpeg', quality: 0.92 })
        if (cancelled) return
        setAfterUrl((prev) => {
          releaseUrl(prev)
          return trackUrl(URL.createObjectURL(blob))
        })
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })

    return () => {
      cancelled = true
    }
  }, [proxy, debouncedSettings, run, releaseUrl, trackUrl])

  /**
   * Export at full resolution.
   *
   * Reuses the white-balance estimate derived from the proxy. Re-estimating on
   * the full image would give a slightly different correction from the one the
   * user just approved on screen.
   */
  const handleExport = useCallback(async () => {
    const source = fullCanvasRef.current
    if (!source) return

    setExporting(true)
    try {
      const ctx = source.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('Canvas 2D is unavailable in this browser')
      const imageData = ctx.getImageData(0, 0, source.width, source.height)

      const response = await run(
        imageData.data,
        source.width,
        source.height,
        settings,
        estimate
      )
      if (response.error) throw new Error(response.error)

      const out = new Uint8ClampedArray(response.buffer)
      const canvas = document.createElement('canvas')
      canvas.width = source.width
      canvas.height = source.height
      const outCtx = canvas.getContext('2d')
      if (!outCtx) throw new Error('Canvas 2D is unavailable in this browser')
      outCtx.putImageData(new ImageData(out, source.width, source.height), 0, 0)

      const blob = await canvasToBlob(canvas, { format, quality })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = exportFilename(file.name, format)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }, [run, settings, estimate, format, quality, file.name])

  const handleShare = useCallback(async () => {
    const source = fullCanvasRef.current
    if (!source || typeof navigator.share !== 'function') return

    try {
      const ctx = source.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      const imageData = ctx.getImageData(0, 0, source.width, source.height)
      const response = await run(
        imageData.data,
        source.width,
        source.height,
        settings,
        estimate
      )
      const out = new Uint8ClampedArray(response.buffer)
      const canvas = document.createElement('canvas')
      canvas.width = source.width
      canvas.height = source.height
      canvas.getContext('2d')?.putImageData(
        new ImageData(out, source.width, source.height),
        0,
        0
      )
      const blob = await canvasToBlob(canvas, { format, quality })
      const shareFile = new File([blob], exportFilename(file.name, format), {
        type: format,
      })
      if (navigator.canShare?.({ files: [shareFile] })) {
        await navigator.share({ files: [shareFile], title: 'Corrected underwater photo' })
      }
    } catch {
      // A cancelled share is a normal outcome, not an error worth surfacing.
    }
  }, [run, settings, estimate, format, quality, file.name])

  // Keyboard shortcuts, scoped so they never fire while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void handleExport()
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, handleExport, onClose])

  const waterOptions = useMemo(
    () =>
      WATER_TYPES.map((w) => ({
        value: w.id,
        label: `${w.label} — ${w.description}`,
      })),
    []
  )

  const castLabel = useMemo(() => {
    if (!estimate) return '—'
    if (estimate.castStrength < 1.2) return 'Minimal'
    if (estimate.castStrength < 2) return 'Moderate'
    if (estimate.castStrength < 4) return 'Strong'
    return 'Severe'
  }, [estimate])

  // Everything the editor reports about this photo, ranked by the bar.
  const messages: MessageBarItem[] = [
    ...(loadError
      ? [
          {
            id: 'load-error',
            severity: 'danger' as const,
            title: 'Could not process this photo',
            message: loadError,
          },
        ]
      : []),
    ...(analysis?.beyondRecovery
      ? [
          {
            id: 'beyond-recovery',
            severity: 'warning' as const,
            title: 'Beyond colour recovery',
            message:
              'Too little red reached the sensor here for correction to recover colour rather than amplify noise — what is left in the red channel is mostly quantisation and JPEG artefacts, and pushing it further invents colour instead of restoring it. What helps a shot like this is exposure, contrast and clarity, on the Manual tab. For true colour this deep, a strobe or video light is the only answer.',
          },
        ]
      : analysis?.capped
        ? [
            {
              id: 'capped',
              severity: 'info' as const,
              title: 'Correction is capped',
              message:
                'Little red light reaches the subject at this depth, so the correction is held at what the data supports rather than amplifying noise.',
            },
          ]
        : []),
    ...(!workerSupported
      ? [
          {
            id: 'main-thread',
            severity: 'info' as const,
            title: 'Running on the main thread',
            message:
              'This browser does not support background workers, so large images may pause the page while they process.',
          },
        ]
      : []),
  ]

  return (
    <>
      <ToolLayout ratio="narrow-input">
      <Inputs sticky>
        <Card panel="input">
          <CardHeader
            title="Correction"
            description="Auto handles most photos. The other tabs refine it."
          />

          <SegmentedControl
            ariaLabel="Correction mode"
            fullWidth
            size="sm"
            value={tab}
            onChange={(v) => setTab(v)}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'conditions', label: 'Dive' },
              { value: 'manual', label: 'Manual' },
              { value: 'export', label: 'Export' },
            ]}
          />

          <div className="mt-4 space-y-4">
            {tab === 'auto' && (
              <>
                <Switch
                  label="Automatic white balance"
                  description="Estimates the colour cast from the photo itself."
                  checked={settings.autoWhiteBalance}
                  onChange={(v) => update({ autoWhiteBalance: v })}
                />
                <Slider
                  label="Strength"
                  value={settings.autoStrength}
                  onChange={(v) => update({ autoStrength: v })}
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={!settings.autoWhiteBalance}
                  hint="Below 1 keeps some of the water's own colour."
                />
                <div className="flex flex-wrap gap-2">
                  {ALL_PRESETS.slice(0, 2).map((preset) => (
                    <Button
                      key={preset.id}
                      size="sm"
                      variant="outline"
                      leadingIcon={<MdAutoAwesome aria-hidden="true" />}
                      onClick={() => replace(applyPreset(preset))}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </>
            )}

            {tab === 'conditions' && (
              <>
                <Switch
                  label="Use the dive profile"
                  description="Models the light lost over the water path."
                  checked={settings.usePhysicalModel}
                  onChange={(v) => update({ usePhysicalModel: v })}
                />
                <Select
                  label="Water type"
                  value={settings.waterType}
                  onChange={(e) =>
                    update({ waterType: e.target.value as CorrectionSettings['waterType'] })
                  }
                  disabled={!settings.usePhysicalModel}
                  hint="Jerlov optical classification."
                >
                  {waterOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Slider
                  label="Subject depth"
                  value={settings.depth}
                  onChange={(v) => update({ depth: v })}
                  min={0}
                  max={60}
                  step={1}
                  unit=" m"
                  disabled={!settings.usePhysicalModel}
                />
                <Slider
                  label="Distance to subject"
                  value={settings.distance}
                  onChange={(v) => update({ distance: v })}
                  min={0}
                  max={10}
                  step={0.1}
                  unit=" m"
                  disabled={!settings.usePhysicalModel}
                  hint="The second leg of the light path."
                />
                <Slider
                  label="Model strength"
                  value={settings.physicalStrength}
                  onChange={(v) => update({ physicalStrength: v })}
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={!settings.usePhysicalModel}
                />

                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs text-text-subtle">Common conditions</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {WATER_CHOICES.map((water) => (
                      <div key={water.id} className="flex flex-wrap gap-1.5">
                        {DEPTH_BANDS.map((band) => {
                          const preset = ALL_PRESETS.find(
                            (p) => p.id === `${water.id}-${band.id}`
                          )
                          if (!preset) return null
                          return (
                            <Button
                              key={preset.id}
                              size="sm"
                              variant="ghost"
                              onClick={() => replace(applyPreset(preset))}
                            >
                              {water.label} · {band.depth} m
                            </Button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === 'manual' && (
              <>
                <Slider
                  label="Exposure"
                  value={settings.exposure}
                  onChange={(v) => update({ exposure: v })}
                  min={-2}
                  max={2}
                  step={0.05}
                  unit=" EV"
                />
                <Slider
                  label="Contrast"
                  value={settings.contrast}
                  onChange={(v) => update({ contrast: v })}
                  min={-1}
                  max={1}
                  step={0.01}
                />
                <Slider
                  label="Black point"
                  value={settings.blackPoint}
                  onChange={(v) => update({ blackPoint: v })}
                  min={-0.1}
                  max={0.1}
                  step={0.005}
                  hint="Lift to cut the haze of backscatter."
                />
                <Slider
                  label="Saturation"
                  value={settings.saturation}
                  onChange={(v) => update({ saturation: v })}
                  min={-1}
                  max={1}
                  step={0.01}
                />
                <Slider
                  label="Vibrance"
                  value={settings.vibrance}
                  onChange={(v) => update({ vibrance: v })}
                  min={-1}
                  max={1}
                  step={0.01}
                  hint="Lifts muted colours and leaves vivid ones alone."
                />
              </>
            )}

            {tab === 'export' && (
              <>
                <Select
                  label="Format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ExportFormat)}
                >
                  <option value="image/jpeg">JPEG — smallest</option>
                  <option value="image/webp">WebP — smaller, same quality</option>
                  <option value="image/png">PNG — lossless, large</option>
                </Select>
                {format !== 'image/png' && (
                  <Slider
                    label="Quality"
                    value={quality}
                    onChange={setQuality}
                    min={0.5}
                    max={1}
                    step={0.01}
                  />
                )}
                <p className="text-xs text-text-subtle">
                  Exports at full resolution
                  {dimensions ? ` — ${dimensions.w} × ${dimensions.h}` : ''}.
                </p>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label="Undo"
              disabled={!canUndo}
              onClick={undo}
            >
              <MdUndo aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label="Redo"
              disabled={!canRedo}
              onClick={redo}
            >
              <MdRedo aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label="Rotate 90 degrees"
              onClick={() => setQuarterTurns((t) => (t + 1) % 4)}
            >
              <MdRotateRight aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<MdRestartAlt aria-hidden="true" />}
              onClick={reset}
            >
              Reset
            </Button>
          </div>
        </Card>
      </Inputs>

      <Results>
        <Card panel="output" padding="sm">
          {beforeUrl && afterUrl ? (
            <CompareView
              beforeSrc={beforeUrl}
              afterSrc={afterUrl}
              alt={file.name}
              className="w-full"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-text-subtle">
              {loadError ? 'No preview' : 'Preparing preview…'}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Colour cast" value={castLabel} />
          <StatCard
            label="Red gain"
            value={analysis ? analysis.appliedGain.r.toFixed(2) : '—'}
            unit="×"
            tone={analysis?.capped ? 'warning' : 'none'}
          />
          <StatCard
            label="Resolution"
            value={dimensions ? `${dimensions.w}×${dimensions.h}` : '—'}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            leadingIcon={<MdDownload aria-hidden="true" />}
            onClick={handleExport}
            disabled={exporting || busy || !!loadError}
          >
            {exporting ? 'Exporting…' : 'Download'}
          </Button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button
              variant="secondary"
              leadingIcon={<MdShare aria-hidden="true" />}
              onClick={handleShare}
              disabled={exporting || busy || !!loadError}
            >
              Share
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </Results>
      </ToolLayout>

      {/* Everything the editor has to say about this photo, docked. These
          appear and vanish as depth and water type change, and in the flow
          they moved the image preview under the diver's cursor. */}
      <MessageBar items={messages} />
    </>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TbDownload, TbPhoto, TbShare2, TbTrash } from 'react-icons/tb'
import {
  MessageBar,
  Button,
  Card,
  CardHeader,
  Inputs,
  Input,
  Results,
  SegmentedControl,
  Slider,
  Switch,
  ToolLayout,
} from '@/components/ui'
import { DiveFileDrop } from './DiveFileDrop'
import {
  DEFAULT_FRAMING,
  PHOTO_CORRECTIONS,
  correctPhoto,
  type PhotoCorrectionId,
} from '@/lib/dive/photo'
import { useUnits } from '@/contexts/UnitsContext'
import {
  CARD_SIZES,
  GRADIENTS,
  hasDecoData,
  renderCard,
  type CardSize,
  type GradientId,
  type StatId,
} from '@/lib/dive/card'
import { parseDiveFile, sourceLabel } from '@/lib/dive/parse'
import {
  MAX_CARD_STATS,
  STAT_LABELS,
  availableStats,
  buildStats,
  defaultStats,
} from '@/lib/dive/stats'
import { DiveParseError, type Dive } from '@/lib/dive/types'


/** What went wrong, and what the diver can do about it. */
function errorHelp(error: DiveParseError): string {
  switch (error.code) {
    case 'not-recognised':
      return 'Export again from Garmin Connect (.fit) or Shearwater Cloud (CSV or XML). Renaming a file does not change its contents.'
    case 'truncated':
      return 'The file appears to have been cut short — a transfer that stopped early will do this. Copy it from the computer again.'
    case 'corrupt':
      return 'The file failed its own checksum, so its contents cannot be trusted. Re-export it from the device.'
    case 'no-dive-data':
      return 'Pick the activity that was actually a dive. Files from a running or cycling activity carry no depth track.'
    case 'empty-profile':
      return 'The file has the right shape but no usable samples. A dive shorter than the computer\'s logging threshold can produce this.'
  }
}

export default function ShareCardTool() {
  // The drawer footer remains the single source of truth for units; this page
  // reads it and can set it, rather than keeping a second copy. A card is made
  // to be looked at, so the unit choice belongs beside the preview instead of
  // behind a drawer the diver has to go and find.
  const { preferences, setUnitSystem } = useUnits()

  const [dive, setDive] = useState<Dive | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; detail?: string; help: string } | null>(
    null
  )
  const [busy, setBusy] = useState(false)

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [size, setSize] = useState<CardSize>('portrait')
  const [gradient, setGradient] = useState<GradientId>('depth')
  const [showBranding, setShowBranding] = useState(true)
  const [selected, setSelected] = useState<StatId[]>([])
  // Default: profile at the FOOT, stats at the very top. Title and subtitle
  // start empty, so the card opens as figures over the photograph with no
  // chrome above them — the arrangement that reads best in a feed.
  const [profilePosition, setProfilePosition] = useState<'top' | 'bottom'>('bottom')
  const [showDeco, setShowDeco] = useState(true)

  const [photo, setPhoto] = useState<HTMLImageElement | null>(null)
  const [photoName, setPhotoName] = useState<string | null>(null)
  const [correction, setCorrection] = useState<PhotoCorrectionId>('none')
  const [framing, setFraming] = useState(DEFAULT_FRAMING)

  /**
   * The corrected bitmap, recomputed only when the photo or the correction
   * changes — never on a framing nudge or a stat toggle, which repaint the
   * card many times a second.
   */
  const corrected = useMemo(() => {
    if (!photo) return null
    if (correction === 'none') return null
    return correctPhoto(photo, correction)
  }, [photo, correction])

  const background = corrected ?? photo

  const previewRef = useRef<HTMLCanvasElement>(null)

  /** Units come from context — never forked into local state (CLAUDE.md). */
  const statUnits = useMemo(
    () => ({ depth: preferences.depth, temperature: preferences.temperature }),
    [preferences.depth, preferences.temperature]
  )

  const stats = useMemo(
    () => (dive ? buildStats(dive, selected, statUnits) : []),
    [dive, selected, statUnits]
  )

  const offered = useMemo(() => (dive ? availableStats(dive) : []), [dive])

  const cardOptions = useMemo(
    () => ({
      size,
      title,
      subtitle,
      stats,
      background,
      framing,
      gradient,
      showBranding,
      photoCorrected: corrected !== null,
      profilePosition,
      showDeco,
    }),
    [
      size,
      title,
      subtitle,
      stats,
      background,
      framing,
      gradient,
      showBranding,
      corrected,
      profilePosition,
      showDeco,
    ]
  )

  /** Only offer the deco control when the file actually recorded deco. */
  const diveHasDeco = useMemo(() => (dive ? hasDecoData(dive) : false), [dive])

  const handleDiveFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const parsed = parseDiveFile(buffer)
      setDive(parsed)
      setFileName(file.name)
      setSelected(defaultStats(parsed))
      // Deliberately NOT prefilled with the date: the date is already a stat,
      // and a subtitle pushes the stat row down off the top edge. The diver
      // adds wording only if they want it.
      setSubtitle('')
    } catch (caught) {
      setDive(null)
      setFileName(null)
      if (caught instanceof DiveParseError) {
        setError({ message: caught.message, detail: caught.detail, help: errorHelp(caught) })
      } else {
        setError({
          message: 'That file could not be read.',
          detail: caught instanceof Error ? caught.message : undefined,
          help: 'Try exporting it again from your dive computer software.',
        })
      }
    } finally {
      setBusy(false)
    }
  }, [])

  const handlePhoto = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setPhoto(image)
      setPhotoName(file.name)
      setFraming(DEFAULT_FRAMING)
      // The bitmap is decoded and retained by the Image; the object URL has
      // done its job and would otherwise leak for the life of the document.
      URL.revokeObjectURL(url)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      setError({
        message: 'That image could not be decoded.',
        help: 'Use a JPEG, PNG or WebP file.',
      })
    }
    image.src = url
  }, [])

  /**
   * Repaint the preview whenever anything it depends on changes.
   *
   * The preview canvas is the full export resolution and is scaled down by
   * CSS, so what is on screen is exactly what downloads — no second rendering
   * path that can drift from the real one.
   */
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !dive) return
    const { w, h } = CARD_SIZES[size]
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderCard(ctx, dive, cardOptions)
  }, [dive, cardOptions, size])

  const download = useCallback(() => {
    const canvas = previewRef.current
    if (!canvas || !dive) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const stamp = dive.startTime
        ? dive.startTime.toISOString().slice(0, 10)
        : 'dive'
      link.download = `diveblendr-${stamp}-${size}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [dive, size])

  /**
   * Native share, where the platform offers it. Falls back to download, which
   * is why the download button is always present rather than being replaced.
   */
  const [canShare, setCanShare] = useState(false)
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const share = useCallback(() => {
    const canvas = previewRef.current
    if (!canvas) return
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], 'dive.png', { type: 'image/png' })
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] })
        }
      } catch {
        // A cancelled share rejects; that is not an error worth reporting.
      }
    }, 'image/png')
  }, [])

  const reset = useCallback(() => {
    setDive(null)
    setFileName(null)
    setError(null)
    setSelected([])
    setTitle('')
    setSubtitle('')
  }, [])

  const toggleStat = useCallback((id: StatId) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
    )
  }, [])

  return (
    /*
      DENSE BY DESIGN.
      This is the one tool where controls and a live preview compete for the
      same fold: a diver nudging a crop must see what moved without scrolling.
      So the page carries no heading of its own (the app header already names
      it), the cards lose their descriptions once there is something to look
      at, and nothing is stated twice. An earlier version repeated max depth,
      dive time and water temp in stat cards above the very card that shows
      them.
    */
    <>
    <ToolLayout ratio="balanced">
      <Inputs className="space-y-2 [&_[data-card]]:p-3 [&_[data-card-header]]:mb-1.5">
        <Card panel="input">
          <CardHeader
            title="1 · Dive log"
            description={dive ? undefined : 'Read on this device. Never uploaded.'}
            actions={
              dive ? (
                <Button variant="ghost" size="sm" onClick={reset}>
                  <TbTrash aria-hidden="true" className="h-4 w-4" />
                  Clear
                </Button>
              ) : undefined
            }
          />
          {dive ? (
            <p className="truncate text-sm text-text-muted">
              <span className="font-medium text-text">{fileName}</span> ·{' '}
              {sourceLabel(dive.source)} · {dive.samples.length} samples
            </p>
          ) : (
            <DiveFileDrop onFile={handleDiveFile} busy={busy} />
          )}
        </Card>

        {dive && (
          <>
            {/* Sources first, then edits. The dive log and the photo are both
                things the diver brings; everything after is an adjustment to
                what they brought. */}
            <Card panel="input">
              <CardHeader
                title="2 · Background"
                actions={
                  photo ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPhoto(null)
                        setPhotoName(null)
                        setCorrection('none')
                        setFraming(DEFAULT_FRAMING)
                      }}
                    >
                      Remove
                    </Button>
                  ) : undefined
                }
              />
              <div className="space-y-2">
                {photo ? (
                  <p className="truncate text-sm text-text-muted">{photoName}</p>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-2/40 p-2 text-sm text-text-muted hover:border-brand-muted hover:text-text">
                    <TbPhoto aria-hidden="true" className="h-4 w-4" />
                    Add a photo
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) handlePhoto(file)
                        event.target.value = ''
                      }}
                    />
                  </label>
                )}

                {/* With a photo behind it the gradient is never painted, so a
                    choice of three would be a control with no effect. */}
                {!photo ? (
                  <SegmentedControl
                    label="Gradient"
                    tone="brand"
                    fullWidth
                    options={(Object.keys(GRADIENTS) as GradientId[]).map((id) => ({
                      value: id,
                      label: GRADIENTS[id].label,
                    }))}
                    value={gradient}
                    onChange={setGradient}
                  />
                ) : (
                  <div className="space-y-2">
                    {/* The photo editor's underwater colour model, reduced to
                        presets. A card needs "fix the water", not a panel. */}
                    <SegmentedControl
                      label="Color"
                      tone="brand"
                      fullWidth
                      options={(Object.keys(PHOTO_CORRECTIONS) as PhotoCorrectionId[]).map(
                        (id) => ({ value: id, label: PHOTO_CORRECTIONS[id].label })
                      )}
                      value={correction}
                      onChange={setCorrection}
                    />
                    {/* Cover-scaling always crops one axis. Centred by default
                        loses a subject low in the frame — the usual underwater
                        composition, since you shoot downward. */}
                    <div className="grid grid-cols-3 gap-2">
                      <Slider
                        label="Across"
                        min={0}
                        max={1}
                        step={0.01}
                        value={framing.offsetX}
                        onChange={(v) => setFraming((f) => ({ ...f, offsetX: v }))}
                        hideValue
                      />
                      <Slider
                        label="Down"
                        min={0}
                        max={1}
                        step={0.01}
                        value={framing.offsetY}
                        onChange={(v) => setFraming((f) => ({ ...f, offsetY: v }))}
                        hideValue
                      />
                      <Slider
                        label="Zoom"
                        min={1}
                        max={2.5}
                        step={0.05}
                        value={framing.zoom}
                        onChange={(v) => setFraming((f) => ({ ...f, zoom: v }))}
                        hideValue
                      />
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card panel="input">
              <CardHeader title="3 · Card" />
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <SegmentedControl
                    label="Size"
                    tone="brand"
                    fullWidth
                    options={(Object.keys(CARD_SIZES) as CardSize[]).map((id) => ({
                      value: id,
                      label: CARD_SIZES[id].label,
                    }))}
                    value={size}
                    onChange={setSize}
                  />
                  {/* Flipping the chrome is what makes a photo usable: the
                      subject is rarely centred, so the diver moves the profile
                      and stats off it rather than cropping around them. */}
                  <SegmentedControl
                    label="Profile"
                    tone="brand"
                    fullWidth
                    options={[
                      { value: 'bottom', label: 'Foot' },
                      { value: 'top', label: 'Head' },
                    ]}
                    value={profilePosition}
                    onChange={setProfilePosition}
                  />
                  {/* Units live in the drawer footer app-wide, but a card is
                      made to be looked at, so the choice is offered beside the
                      preview too. This SETS the shared preference. */}
                  <SegmentedControl
                    label="Units"
                    tone="brand"
                    fullWidth
                    options={[
                      { value: 'metric', label: 'm' },
                      { value: 'imperial', label: 'ft' },
                    ]}
                    value={preferences.system}
                    onChange={setUnitSystem}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Title"
                    placeholder="Optional"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={60}
                  />
                  <Input
                    label="Subtitle"
                    placeholder="Optional"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    maxLength={60}
                  />
                </div>

                {/* Stats share this card: a separate panel spent a header and
                    two paddings on a column of checkboxes. */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-border pt-2">
                  {offered.map((id) => {
                    const checked = selected.includes(id)
                    // A fifth would be silently dropped by the row, so it is
                    // disabled rather than accepted and ignored.
                    const atLimit = !checked && selected.length >= MAX_CARD_STATS
                    return (
                      <Switch
                        key={id}
                        checked={checked}
                        onChange={() => toggleStat(id)}
                        label={STAT_LABELS[id]}
                        disabled={atLimit}
                      />
                    )
                  })}
                  <Switch
                    checked={showBranding}
                    onChange={setShowBranding}
                    label="DiveBlendr mark"
                  />
                  {/* Only offered when the computer actually recorded an
                      obligation — a dead toggle on a no-stop dive would
                      suggest the data is there and switched off. */}
                  {diveHasDeco && (
                    <Switch checked={showDeco} onChange={setShowDeco} label="Mark deco" />
                  )}
                </div>
              </div>
            </Card>
          </>
        )}
      </Inputs>

      <Results>
        {dive ? (
          <Card panel="output">
            <CardHeader
              title="Your card"
              actions={
                <div className="flex gap-2">
                  {canShare && (
                    <Button variant="secondary" size="sm" onClick={share}>
                      <TbShare2 aria-hidden="true" className="h-4 w-4" />
                      Share
                    </Button>
                  )}
                  <Button variant="primary" size="sm" onClick={download}>
                    <TbDownload aria-hidden="true" className="h-4 w-4" />
                    Download PNG
                  </Button>
                </div>
              }
            />
            <div className="flex justify-center">
              <canvas
                ref={previewRef}
                aria-label={`Share card: ${dive.maxDepth.toFixed(1)} metre dive`}
                // Bounded by the viewport, not only by width: a 1080x1920 card
                // scaled to the column width is taller than a laptop screen.
                className="h-auto max-h-[70vh] w-auto max-w-full rounded-md border border-border"
              />
            </div>
          </Card>
        ) : (
          <Card panel="output">
            <CardHeader
              title="Example card"
              description="Drop a dive log to build your own."
            />
            {/* A real card, exported from this tool, rather than a description
                of one. The empty state is the only place a diver can see what
                they are being asked to make before making it — and "your depth
                profile as the hero" means nothing until you have seen the
                profile drawn.

                A plain <img>: `next/image` needs an optimizer, and a static
                export ships none. */}
            <div className="flex flex-col items-center gap-3">
              <img
                src="/photos/example-card.jpg"
                alt="Example share card: a 47.1 metre, 1 hour 15 minute dive on trimix 19/15 with EAN51 and air, its depth profile drawn over an underwater photograph, with the decompression portion of the ascent picked out in amber."
                width={506}
                height={900}
                className="h-auto max-h-[60vh] w-auto max-w-full rounded-md border border-border"
              />
              {/* Two lines, deliberately: one about the example, one about
                  what the tool reads. As a single paragraph they ran together
                  and the file formats were easy to miss. */}
              <div className="space-y-1 text-center text-xs text-text-subtle">
                <p>Shown in metres. Your own card follows the units you have set.</p>
                <p>
                  Reads Garmin Descent <code className="text-text">.fit</code>, and
                  Shearwater Cloud CSV or XML.
                </p>
                {/* The toggle already exists; nobody could tell from here. Said
                    plainly, and asked for rather than assumed — the mark is off
                    with one switch and the card is yours either way. */}
                <p>
                  The <span className="text-text">DiveBlendr mark</span> in the corner
                  can be switched off. We would appreciate it if you left it on —
                  it is how people find the tool.
                </p>
              </div>
            </div>
          </Card>
        )}
      </Results>
    </ToolLayout>

    <MessageBar
      items={
        error
          ? [
              {
                id: 'parse-error',
                severity: 'danger' as const,
                title: 'That file could not be read',
                message: (
                  <>
                    {error.message} {error.help}
                    {error.detail ? (
                      <span className="text-text-subtle"> Technical detail: {error.detail}</span>
                    ) : null}
                  </>
                ),
              },
            ]
          : []
      }
    />
    </>
  )
}

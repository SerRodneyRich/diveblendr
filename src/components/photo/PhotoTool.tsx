'use client'

/**
 * The photo tool shell: pick a photo, edit it, pick the next one.
 *
 * The page that this replaced was 1081 lines and owned a preset table, batch
 * processing loops, favourites persistence and the editor's state. It is now a
 * file list plus the editor.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { MdClose, MdPhotoCamera } from 'react-icons/md'
import { Button, Card, CardHeader, MessageBar } from '@/components/ui'
import { PhotoEditor } from './PhotoEditor'

/** Formats a browser can decode without a third-party codec. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']

interface Selected {
  id: string
  file: File
}

export function PhotoTool() {
  const [files, setFiles] = useState<Selected[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = useCallback((incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return

    const accepted: Selected[] = []
    const rejected: string[] = []

    for (const file of Array.from(incoming)) {
      const name = file.name.toLowerCase()

      // RAW needs a decoder no browser ships. Say so usefully rather than
      // failing at decode time with "could not load image".
      if (name.endsWith('.gpr') || name.endsWith('.dng') || name.endsWith('.cr2')) {
        rejected.push(
          `${file.name} is a RAW file. Convert it to JPEG first — Adobe DNG Converter is free.`
        )
        continue
      }

      const typeOk = ACCEPTED.includes(file.type)
      const extOk = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
      if (!typeOk && !extOk) {
        rejected.push(`${file.name} is not a JPEG, PNG, WebP or HEIC image.`)
        continue
      }

      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
      })
    }

    setError(rejected.length > 0 ? rejected.join(' ') : null)

    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted])
      setActiveId((prev) => prev ?? accepted[0].id)
    }
  }, [])

  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
    setActiveId((prev) => (prev === id ? null : prev))
  }, [])

  // Nothing to clean up per-file: the editor owns and revokes its own URLs.
  useEffect(() => {
    if (activeId && !files.some((f) => f.id === activeId)) setActiveId(null)
  }, [files, activeId])

  const active = files.find((f) => f.id === activeId) ?? null

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-text">Photo editor</h1>
        <p className="mt-1 text-sm text-text-muted">
          Restores the colour that water removed. Everything runs on your device —
          no photo is uploaded.
        </p>
      </header>

      {!active && (
        <Card panel="input">
          <CardHeader
            title="Choose a photo"
            description="JPEG, PNG, WebP or HEIC. Corrected at full resolution."
          />
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              accept(e.dataTransfer.files)
            }}
            className={`flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center transition-colors ${
              dragging ? 'border-brand bg-brand/10' : 'border-border-strong'
            }`}
          >
            <MdPhotoCamera aria-hidden="true" className="h-8 w-8 text-text-subtle" />
            <p className="text-sm text-text-muted">Drag a photo here, or</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => inputRef.current?.click()}>
                Choose photos
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                accept(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        </Card>
      )}

      {files.length > 0 && (
        <Card panel="input" padding="sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-subtle">
              {files.length} photo{files.length === 1 ? '' : 's'}
            </span>
            {files.map((f) => (
              <span
                key={f.id}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                  f.id === activeId
                    ? 'border-brand bg-brand/10 text-text'
                    : 'border-border text-text-muted'
                }`}
              >
                <button
                  type="button"
                  className="max-w-[12rem] truncate"
                  onClick={() => setActiveId(f.id)}
                >
                  {f.file.name}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  onClick={() => remove(f.id)}
                  className="text-text-subtle hover:text-danger"
                >
                  <MdClose aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
              Add more
            </Button>
          </div>
        </Card>
      )}

      {active && (
        <PhotoEditor
          key={active.id}
          file={active.file}
          onClose={() => setActiveId(null)}
        />
      )}

      <MessageBar
        items={[
          ...(error
            ? [
                {
                  id: 'skipped',
                  severity: 'warning' as const,
                  title: 'Some files were skipped',
                  message: error,
                },
              ]
            : []),
          {
            id: 'estimate',
            severity: 'info',
            title: 'These are estimates',
            message:
              'Corrections are a physically-motivated estimate, not a measurement. Depth, water type and distance are inferred or entered, never read from the file.',
          },
        ]}
      />
    </div>
  )
}

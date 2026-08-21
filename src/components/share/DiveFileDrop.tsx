'use client'

import { useCallback, useId, useRef, useState } from 'react'
import { TbCloudUpload } from 'react-icons/tb'
import { Button } from '@/components/ui'
import { cn } from '@/components/ui/cn'

/**
 * The drop target for a dive log.
 *
 * Both a drop zone and a real `<input type="file">`: the input is what makes
 * it keyboard-operable and what works on a phone, where there is nothing to
 * drag from. The visible panel is a label for it rather than a button that
 * clicks it, so focus and activation come from the platform.
 */
export function DiveFileDrop({
  onFile,
  busy,
  className,
}: {
  onFile: (file: File) => void
  busy?: boolean
  className?: string
}) {
  const [dragging, setDragging] = useState(false)
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(false)
      const file = event.dataTransfer.files?.[0]
      if (file) onFile(file)
    },
    [onFile]
  )

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-3 rounded-md border-2 border-dashed p-8 text-center transition-colors motion-reduce:transition-none',
          dragging
            ? 'border-brand bg-surface-2/70'
            : 'border-border-strong bg-surface-2/40 hover:border-brand-muted hover:bg-surface-2/60'
        )}
      >
        <TbCloudUpload aria-hidden="true" className="h-9 w-9 text-brand" />
        <span className="text-h4 font-semibold text-text">
          {busy ? 'Reading the file…' : 'Drop a dive log here'}
        </span>
        <span className="max-w-md text-sm text-text-muted">
          Garmin <code className="text-text">.fit</code> files from a Descent computer, or a
          Shearwater CSV or XML export. The file is read on this device and never uploaded.
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={(e) => {
          // The label already opens the picker; stop the click bubbling to it
          // so the dialog is not opened twice on browsers that fire both.
          e.preventDefault()
          inputRef.current?.click()
        }}>
          Choose a file
        </Button>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".fit,.csv,.xml,.txt,application/octet-stream,text/csv,text/xml,application/xml"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          // Clear it so choosing the same file twice still fires a change.
          event.target.value = ''
        }}
      />
    </div>
  )
}

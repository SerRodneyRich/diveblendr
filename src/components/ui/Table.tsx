'use client'

import { cn } from './cn'

export interface TableColumn<Row> {
  key: string
  header: React.ReactNode
  /** Cell renderer. Return a primitive for numeric columns to get tabular alignment. */
  cell: (row: Row, index: number) => React.ReactNode
  /** Numeric columns are right-aligned and set in mono tabular figures. */
  numeric?: boolean
  /** Extra classes for both header and body cells in this column. */
  className?: string
  /** Screen-reader-only header text when `header` is a glyph. */
  srHeader?: string
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[]
  rows: Row[]
  /** Stable React key per row. */
  rowKey: (row: Row, index: number) => string
  /** Describes the table for assistive tech. Rendered visually unless `hideCaption`. */
  caption?: React.ReactNode
  hideCaption?: boolean
  /** Row tint, e.g. to flag a deco stop that breaches a limit. */
  rowSeverity?: (row: Row, index: number) => 'warning' | 'danger' | undefined
  /** Keeps the header visible while the body scrolls. */
  stickyHeader?: boolean
  /** Message shown when `rows` is empty. */
  emptyMessage?: React.ReactNode
  className?: string
  /** Max height of the scroll region, e.g. "24rem". Enables vertical scrolling. */
  maxHeight?: string
}

/**
 * Data table for runtime schedules and gas plans.
 *
 * Numeric columns are mono + `tabular-nums` and right-aligned so a deco
 * schedule reads as a column of comparable numbers rather than ragged text.
 * The scroll container owns the horizontal overflow, so a wide schedule never
 * makes the whole page scroll sideways.
 *
 * @example
 * <Table caption="Decompression schedule" rows={stops} rowKey={(s) => s.depth}
 *   columns={[{ key: 'depth', header: 'Depth', numeric: true, cell: (s) => s.depth }]} />
 */
export function Table<Row>({
  columns,
  rows,
  rowKey,
  caption,
  hideCaption = false,
  rowSeverity,
  stickyHeader = true,
  emptyMessage = 'No data.',
  className,
  maxHeight,
}: TableProps<Row>) {
  return (
    <div
      className={cn(
        'overflow-auto rounded-md border border-border bg-surface-1',
        className
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse text-sm">
        {caption && (
          <caption
            className={cn(
              hideCaption
                ? 'sr-only'
                : 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-text-muted'
            )}
          >
            {caption}
          </caption>
        )}
        <thead
          className={cn(
            'bg-surface-2',
            stickyHeader && 'sticky top-0 z-[1]'
          )}
        >
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted',
                  c.numeric ? 'text-right' : 'text-left',
                  c.className
                )}
              >
                {c.srHeader ? (
                  <>
                    <span aria-hidden="true">{c.header}</span>
                    <span className="sr-only">{c.srHeader}</span>
                  </>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center text-sm text-text-subtle"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const sev = rowSeverity?.(row, i)
              return (
                <tr
                  key={rowKey(row, i)}
                  className={cn(
                    'border-b border-border last:border-b-0',
                    sev === 'danger' && 'bg-danger-bg',
                    sev === 'warning' && 'bg-warning-bg'
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2 text-text',
                        c.numeric ? 'text-right font-mono tnum' : 'text-left',
                        c.className
                      )}
                    >
                      {c.cell(row, i)}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

'use client'

import { Table } from '@/components/ui'
import type { BlendStep } from '@/lib/blending'
import type { GasFractions } from '@/lib/gas'

/** Renders a mix as three species-coloured figures, so the gas mapping is learned once. */
export function MixReadout({ mix }: { mix: GasFractions }) {
  return (
    <span className="whitespace-nowrap font-mono tnum">
      <span className="text-o2">{(mix.o2 * 100).toFixed(1)}</span>
      <span className="text-text-subtle">/</span>
      <span className="text-he">{(mix.he * 100).toFixed(1)}</span>
      <span className="text-text-subtle">/</span>
      <span className="text-n2">{(mix.n2 * 100).toFixed(1)}</span>
    </span>
  )
}

export interface BlendStepsTableProps {
  steps: BlendStep[]
  /** Formats a bar figure into the diver's pressure unit. */
  formatPressure: (bar: number) => string
  /** Label for the pressure unit column headers, e.g. "bar" or "psi". */
  pressureUnit: string
  /**
   * True when there are no steps because the target is unreachable, rather
   * than because the cylinder already holds it. The two look identical in the
   * table and must not read the same.
   */
  unreachable?: boolean
}

/**
 * The blend procedure, as a numbered sequence.
 *
 * A blend is an ordered list of physical actions on a cylinder, so it is a
 * table with a running total rather than a set of tiles: the diver reads down
 * it at the fill station and stops the compressor at each `Total` figure. Every
 * numeric column is tabular so the running total is scannable as a column.
 *
 * A drain step carries a negative delta and is tinted `warning`, because it is
 * the one step that destroys gas and cannot be undone by continuing.
 */
export function BlendStepsTable({
  steps,
  formatPressure,
  pressureUnit,
}: BlendStepsTableProps) {
  return (
    <Table
      caption="Blend procedure"
      hideCaption
      rows={steps}
      rowKey={(s) => String(s.step)}
      rowSeverity={(s) => (s.addPressureBar < 0 ? 'warning' : undefined)}
      emptyMessage="Nothing to do — the tank already holds the target mix at the target pressure."
      columns={[
        {
          key: 'step',
          header: '#',
          srHeader: 'Step number',
          numeric: true,
          className: 'w-10',
          cell: (s) => s.step,
        },
        {
          key: 'action',
          header: 'Action',
          cell: (s) => (
            <span className="whitespace-nowrap font-medium text-text">{s.action}</span>
          ),
        },
        {
          key: 'delta',
          header: `Δ ${pressureUnit}`,
          srHeader: `Pressure change in ${pressureUnit}`,
          numeric: true,
          cell: (s) => (
            <span className={s.addPressureBar < 0 ? 'text-warning' : 'text-text'}>
              {s.addPressureBar > 0 ? '+' : ''}
              {formatPressure(s.addPressureBar)}
            </span>
          ),
        },
        {
          key: 'total',
          header: `Total ${pressureUnit}`,
          srHeader: `Running total in ${pressureUnit}`,
          numeric: true,
          cell: (s) => (
            <span className="font-semibold text-text">
              {formatPressure(s.totalPressureBar)}
            </span>
          ),
        },
        {
          key: 'mix',
          header: 'O₂ / He / N₂',
          numeric: true,
          // Dropped on narrow panels. This table sits in a ~380px column on a
          // tablet, where five columns cut the mono readout mid-number
          // ("100.0/0.") and pushed the rest behind a horizontal scroll — in
          // the one table a diver reads while actually filling a cylinder.
          // What matters mid-fill is which gas to add and to what pressure;
          // the running mix is reference, and the final mix is already a
          // StatCard above. Hidden, not truncated, so nothing reads as a
          // wrong number.
          className: 'hidden min-[1180px]:table-cell',
          cell: (s) => <MixReadout mix={s.resultingMix} />,
        },
      ]}
    />
  )
}

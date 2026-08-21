'use client'

import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2'
import { Button, Input, NumberField, cn } from '@/components/ui'
import { gas, type GasFractions } from '@/lib/gas'
import type { SupplyGas } from '@/lib/blending'

/**
 * A supply gas as the user edits it: percentages, which is how a fill station
 * labels a bank, rather than the fractions the planner works in.
 *
 * The percentage form is kept as the editing state so a half-typed "3" on the
 * way to "32" does not have to survive a round trip through `gas()`, which
 * throws on an invalid pair.
 */
export interface SupplyDraft {
  id: string
  name: string
  o2Percent: number
  hePercent: number
  /** False when this bank is not connected today. Excluded from the plan. */
  enabled: boolean
}

/** The default bank: pure helium, pure oxygen, air — in fill order. */
export const DEFAULT_SUPPLY_DRAFTS: SupplyDraft[] = [
  { id: 'he', name: 'Helium', o2Percent: 0, hePercent: 100, enabled: true },
  { id: 'o2', name: 'Oxygen', o2Percent: 100, hePercent: 0, enabled: true },
  { id: 'air', name: 'Air', o2Percent: 21, hePercent: 0, enabled: true },
]

/** True when the draft's O₂ + He is a mixture the planner will accept. */
export function isDraftValid(d: SupplyDraft): boolean {
  return (
    Number.isFinite(d.o2Percent) &&
    Number.isFinite(d.hePercent) &&
    d.o2Percent >= 0 &&
    d.hePercent >= 0 &&
    d.o2Percent + d.hePercent <= 100
  )
}

/** Converts the enabled, valid drafts into the planner's supply list, in order. */
export function toSupplies(drafts: SupplyDraft[]): SupplyGas[] {
  return drafts
    .filter((d) => d.enabled && isDraftValid(d))
    .map((d) => ({
      name: d.name.trim() || 'Unnamed gas',
      mix: gas(d.o2Percent / 100, d.hePercent / 100),
    }))
}

/** Nitrogen balance of a draft, as a percentage. */
export function draftN2(d: SupplyDraft): number {
  return Math.max(0, 100 - d.o2Percent - d.hePercent)
}

/** Composition of a draft as fractions, for display. Assumes `isDraftValid`. */
export function draftMix(d: SupplyDraft): GasFractions {
  return gas(d.o2Percent / 100, d.hePercent / 100)
}

export interface SupplyGasEditorProps {
  drafts: SupplyDraft[]
  onChange: (drafts: SupplyDraft[]) => void
}

/**
 * Editor for what is actually available at the fill station.
 *
 * The previous blender assumed three fixed sources — pure O₂, pure He and air —
 * with a scalar "purity" knob, so blending from a banked nitrox or trimix was
 * not expressible. The Phase 1 planner solves the full linear system over
 * arbitrary supply mixtures, so a bank is a real mixture here: a row of banked
 * 32% is `{o2: 32, he: 0, n2: 68}` and its nitrogen is credited to the tank.
 *
 * Order matters physically — helium first, then oxygen, then the diluent
 * top-off — and it is also the order the solver prefers when more than one
 * combination of banks reaches the target, so the rows are draggable-by-intent:
 * the list you see is the order the steps come out in.
 */
export function SupplyGasEditor({ drafts, onChange }: SupplyGasEditorProps) {
  const update = (id: string, patch: Partial<SupplyDraft>) => {
    onChange(drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  const remove = (id: string) => {
    onChange(drafts.filter((d) => d.id !== id))
  }

  const add = () => {
    onChange([
      ...drafts,
      {
        id: `bank-${Date.now().toString(36)}`,
        name: 'Banked EAN32',
        o2Percent: 32,
        hePercent: 0,
        enabled: true,
      },
    ])
  }

  return (
    <div className="space-y-3">
      {drafts.map((d) => {
        const valid = isDraftValid(d)
        return (
          <div
            key={d.id}
            className={cn(
              'rounded-sm border border-border bg-surface-1 p-3',
              !d.enabled && 'opacity-60'
            )}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Input
                label="Bank"
                value={d.name}
                onChange={(e) => update(d.id, { name: e.target.value })}
                placeholder="Banked EAN32"
              />
              <NumberField
                label="O₂"
                unit="%"
                value={d.o2Percent}
                onChange={(v) => update(d.id, { o2Percent: v })}
                min={0}
                max={100}
                step={1}
              />
              <NumberField
                label="He"
                unit="%"
                value={d.hePercent}
                onChange={(v) => update(d.id, { hePercent: v })}
                min={0}
                max={100}
                step={1}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {valid ? (
                <p className="font-mono tnum text-xs text-text-subtle">
                  <span className="text-o2">{d.o2Percent.toFixed(0)}% O₂</span>
                  <span className="text-text-subtle"> · </span>
                  <span className="text-he">{d.hePercent.toFixed(0)}% He</span>
                  <span className="text-text-subtle"> · </span>
                  <span className="text-n2">{draftN2(d).toFixed(0)}% N₂</span>
                </p>
              ) : (
                <p className="text-xs text-danger">O₂ + He cannot exceed 100%.</p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={d.enabled ? 'secondary' : 'outline'}
                  onClick={() => update(d.id, { enabled: !d.enabled })}
                  aria-pressed={d.enabled}
                >
                  {d.enabled ? 'Connected' : 'Off line'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={`Remove ${d.name || 'gas'}`}
                  onClick={() => remove(d.id)}
                  disabled={drafts.length <= 1}
                >
                  <HiOutlineTrash />
                </Button>
              </div>
            </div>
          </div>
        )
      })}

      <Button variant="outline" fullWidth leadingIcon={<HiOutlinePlus />} onClick={add}>
        Add a bank
      </Button>
    </div>
  )
}

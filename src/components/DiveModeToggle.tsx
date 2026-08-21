'use client'

import React from 'react'
import { Select } from '@/components/ui'
import { usePreferences } from '@/contexts/PreferencesContext'
import type { DiverPreferences } from '@/contexts/PreferencesContext'

export type DiveMode = DiverPreferences['diveMode']

/** The four modes, in the order a diver progresses through them. */
export const DIVE_MODE_OPTIONS: { value: DiveMode; label: string; description: string }[] = [
  { value: 'oc', label: 'OC nitrox', description: 'Open circuit, no helium' },
  { value: 'oc-trimix', label: 'OC trimix', description: 'Open circuit with helium' },
  { value: 'ccr', label: 'CCR', description: 'Rebreather, nitrox diluent' },
  { value: 'ccr-trimix', label: 'CCR trimix', description: 'Rebreather, trimix diluent' },
]

/** True for the two modes that carry helium. */
export function isTrimixMode(mode: DiveMode): boolean {
  return mode === 'oc-trimix' || mode === 'ccr-trimix'
}

/** True for the two rebreather modes. */
export function isCCRMode(mode: DiveMode): boolean {
  return mode === 'ccr' || mode === 'ccr-trimix'
}

interface DiveModeToggleProps {
  className?: string
  /** Shows the mode's one-line description under the control. */
  showLabel?: boolean
}

/**
 * How you are diving — the app-wide setting, not a per-page one.
 *
 * Sits in the sidebar footer beside {@link UnitsToggle}, because it is the same
 * kind of thing: a fact about the diver that every tool needs and none of them
 * owns. Previously each page rendered its own dive-mode selector seeded with
 * `useState(prefs.diveMode)`, so the value forked the moment it was changed —
 * picking CCR on Best mix left MOD check still computing open circuit, with
 * nothing on screen to say the two disagreed.
 *
 * A `Select` rather than the segmented control used for units: four options
 * with names as long as "CCR trimix" do not fit a 240px sidebar as segments,
 * and unlike metric/imperial there is no benefit to seeing the unpicked
 * options at all times.
 */
export const DiveModeToggle: React.FC<DiveModeToggleProps> = ({
  className = '',
  showLabel = true,
}) => {
  const { preferences, updatePreferences } = usePreferences()
  const current = DIVE_MODE_OPTIONS.find((o) => o.value === preferences.diveMode)

  return (
    <div className={className}>
      <Select
        aria-label="Dive mode"
        value={preferences.diveMode}
        onChange={(e) => updatePreferences({ diveMode: e.target.value as DiveMode })}
      >
        {DIVE_MODE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {showLabel && current && (
        <p className="mt-1 text-center text-[0.6875rem] text-text-subtle">
          {current.description}
        </p>
      )}
    </div>
  )
}

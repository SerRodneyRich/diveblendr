'use client'

import React from 'react'
import { useUnits } from '../contexts/UnitsContext'
import { SegmentedControl } from '@/components/ui'

interface UnitsToggleProps {
  className?: string
  /** Shows the unit legend (bar • m • L) under the control. */
  showLabel?: boolean
}

/**
 * Metric / imperial switch.
 *
 * Rebuilt on `SegmentedControl`. The previous version was the app's second
 * light-first `dark:` island, and its gradient pill mixed a blue and a green
 * that belonged to no palette — the green in particular read as a status
 * indicator rather than a setting. It also had a 12px track carrying a 16px
 * handle, so the knob overflowed its own switch.
 *
 * Both units are now labelled and visible at once, which is what a segmented
 * control is for: with a two-state switch you had to know which side meant
 * what before you could read your own setting.
 */
export const UnitsToggle: React.FC<UnitsToggleProps> = ({
  className = '',
  showLabel = true,
}) => {
  const { preferences, setUnitSystem } = useUnits()

  return (
    <div className={className}>
      <SegmentedControl<'metric' | 'imperial'>
        ariaLabel="Unit system"
        value={preferences.system}
        onChange={setUnitSystem}
        size="sm"
        tone="brand"
        fullWidth={showLabel}
        options={[
          { value: 'metric', label: 'Metric' },
          { value: 'imperial', label: 'Imperial' },
        ]}
      />
      {showLabel && (
        <p className="mt-1 text-center font-mono text-[0.6875rem] text-text-subtle">
          {preferences.system === 'metric' ? 'bar • m • L' : 'psi • ft • ft³'}
        </p>
      )}
    </div>
  )
}

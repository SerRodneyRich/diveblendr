'use client'

import { useMemo } from 'react'
import { Select } from '@/components/ui'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useUnitConversion } from '@/hooks/useUnitConversion'
import { tankSpecifications, type TankSpecification } from '@/data/tankSpecifications'

/** The sentinel option value meaning "type the water volume yourself". */
export const CUSTOM_CYLINDER = 'custom'

export interface CylinderFieldProps {
  /** Tank id, or {@link CUSTOM_CYLINDER}. */
  value: string
  /** Receives the tank id and, for a real tank, its specification. */
  onChange: (id: string, tank?: TankSpecification) => void
  label?: React.ReactNode
  hint?: React.ReactNode
  className?: string
}

/**
 * Cylinder chooser for the consumption tools.
 *
 * Deliberately a `Select` rather than the legacy `TankSelector`: the legacy
 * component is un-migrated (raw palette, hand-rolled popover, portal tooltip)
 * and is shared with other in-flight work, so composing the primitive is both
 * the style-guide answer and the safe one. Custom tanks from
 * `PreferencesContext` are merged in ahead of the system list.
 */
export function CylinderField({
  value,
  onChange,
  label = 'Cylinder',
  hint,
  className,
}: CylinderFieldProps) {
  const { preferences } = usePreferences()
  const { convertPressure, convertVolume, preferences: unitPrefs } = useUnitConversion()

  const { custom, system } = useMemo(
    () => ({ custom: preferences.customTanks, system: tankSpecifications }),
    [preferences.customTanks]
  )

  const byId = useMemo(() => {
    const map = new Map<string, TankSpecification>()
    for (const t of [...custom, ...system]) map.set(t.id, t)
    return map
  }, [custom, system])

  /**
   * Option text follows the unit preference. A diver working in psi should not
   * have to read the list in bar to find their cylinder.
   */
  const describe = (t: TankSpecification) => {
    const metric = unitPrefs.system === 'metric'
    const vol = convertVolume(t.waterVolumeL, metric ? 1 : 2)
    const pressure = convertPressure(t.workingPressureBar, 0)
    return `${t.name} — ${vol.formatted} @ ${pressure.formatted}`
  }

  return (
    <Select
      label={label}
      hint={hint}
      value={value}
      className={className}
      onChange={(e) => {
        const id = e.target.value
        onChange(id, id === CUSTOM_CYLINDER ? undefined : byId.get(id))
      }}
    >
      {custom.length > 0 && (
        <optgroup label="Your cylinders">
          {custom.map((t) => (
            <option key={t.id} value={t.id}>
              {describe(t)}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Standard cylinders">
        {system.map((t) => (
          <option key={t.id} value={t.id}>
            {describe(t)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Other">
        <option value={CUSTOM_CYLINDER}>Enter water volume manually</option>
      </optgroup>
    </Select>
  )
}

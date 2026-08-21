'use client'

import React from 'react'
import { FiEye, FiType, FiZap, FiTarget, FiHeadphones } from 'react-icons/fi'
import { useAccessibility } from '../contexts/AccessibilityContext'
import { Button, Modal, SegmentedControl, Switch } from '@/components/ui'

interface AccessibilitySettingsProps {
  isOpen: boolean
  onClose: () => void
}

type FontSize = 'normal' | 'large' | 'larger' | 'largest'

const toggles = [
  {
    key: 'highContrast',
    icon: FiEye,
    label: 'High contrast',
    description: 'Maximises contrast between text, surfaces and borders.',
  },
  {
    key: 'reducedMotion',
    icon: FiZap,
    label: 'Reduced motion',
    description: 'Minimises animations and transitions.',
  },
  {
    key: 'enhancedFocus',
    icon: FiTarget,
    label: 'Enhanced focus indicators',
    description: 'Thicker focus outlines for keyboard navigation.',
  },
  {
    key: 'screenReaderOptimized',
    icon: FiHeadphones,
    label: 'Screen reader optimised',
    description: 'Reveals descriptions normally hidden to sighted users.',
  },
] as const

/**
 * Accessibility preferences.
 *
 * Two defects fixed in the Phase 3 migration:
 * - The component wrapped itself in a second `AccessibilityProvider`, so every
 *   toggle wrote to a fresh isolated context and changed nothing in the app.
 *   It now consumes the provider from the layout.
 * - It was one of two light-first `dark:` islands. Now fully tokenized, so it
 *   also responds to its own high-contrast setting.
 */
export const AccessibilitySettings: React.FC<AccessibilitySettingsProps> = ({
  isOpen,
  onClose,
}) => {
  const { settings, updateSettings, announceToScreenReader } = useAccessibility()

  const handleToggle = (key: (typeof toggles)[number]['key'], value: boolean, label: string) => {
    updateSettings({ [key]: value })
    announceToScreenReader(`${label} ${value ? 'enabled' : 'disabled'}`)
  }

  const handleFontSize = (fontSize: FontSize) => {
    updateSettings({ fontSize })
    announceToScreenReader(`Font size ${fontSize}`)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Accessibility"
      description="Saved to this device and applied across the app."
      size="md"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <FiType aria-hidden="true" className="h-4 w-4 text-text-muted" />
            <span className="text-sm font-medium text-text">Font size</span>
          </div>
          <SegmentedControl<FontSize>
            ariaLabel="Font size"
            value={settings.fontSize}
            onChange={handleFontSize}
            size="sm"
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'large', label: 'Large' },
              { value: 'larger', label: 'Larger' },
              { value: 'largest', label: 'Largest' },
            ]}
          />
        </div>

        <div className="divide-y divide-border border-t border-border">
          {toggles.map(({ key, icon: Icon, label, description }) => (
            <div key={key} className="flex items-start gap-3 py-1">
              <Icon aria-hidden="true" className="mt-4 h-4 w-4 shrink-0 text-text-muted" />
              <Switch
                className="flex-1"
                checked={settings[key]}
                onChange={(v) => handleToggle(key, v, label)}
                label={label}
                description={description}
              />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

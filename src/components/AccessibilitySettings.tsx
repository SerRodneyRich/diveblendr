'use client';

import React, { useState } from 'react';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { FiSettings, FiX, FiEye, FiType, FiZap, FiTarget, FiHeadphones } from 'react-icons/fi';
import { AccessibilityProvider } from '../contexts/AccessibilityContext';

interface AccessibilitySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccessibilitySettings: React.FC<AccessibilitySettingsProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, announceToScreenReader } = useAccessibility();

  const handleToggle = (setting: string, value: boolean) => {
    updateSettings({ [setting]: value });
    announceToScreenReader(`${setting} ${value ? 'enabled' : 'disabled'}`);
  };

  const handleFontSizeChange = (fontSize: 'normal' | 'large' | 'larger' | 'largest') => {
    updateSettings({ fontSize });
    announceToScreenReader(`Font size changed to ${fontSize}`);
  };

  if (!isOpen) return null;

  return (
    <AccessibilityProvider>
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-labelledby="accessibility-settings-title"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 id="accessibility-settings-title" className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FiSettings className="w-5 h-5" />
            Accessibility Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close accessibility settings"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* High Contrast Mode */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <FiEye className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">High Contrast Mode</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Increases color contrast for better visibility
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={(e) => handleToggle('highContrast', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                aria-describedby="high-contrast-description"
              />
            </label>
          </div>

          {/* Font Size */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <FiType className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div className="font-medium text-gray-900 dark:text-white">Font Size</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'normal', label: 'Normal' },
                { value: 'large', label: 'Large' },
                { value: 'larger', label: 'Larger' },
                { value: 'largest', label: 'Largest' }
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleFontSizeChange(value as 'normal' | 'large' | 'larger' | 'largest')}
                  className={`p-2 text-sm rounded-lg border transition-colors ${
                    settings.fontSize === value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  aria-pressed={settings.fontSize === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Reduced Motion */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <FiZap className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">Reduced Motion</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Minimizes animations and transitions
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(e) => handleToggle('reducedMotion', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
            </label>
          </div>

          {/* Enhanced Focus */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <FiTarget className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">Enhanced Focus Indicators</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Stronger visual focus indicators for keyboard navigation
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.enhancedFocus}
                onChange={(e) => handleToggle('enhancedFocus', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
            </label>
          </div>

          {/* Screen Reader Optimized */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <FiHeadphones className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">Screen Reader Optimized</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Enhanced announcements and descriptions for screen readers
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.screenReaderOptimized}
                onChange={(e) => handleToggle('screenReaderOptimized', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
            </label>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Your accessibility preferences are automatically saved and will persist across sessions.
          </div>
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
    </AccessibilityProvider>
  );
};
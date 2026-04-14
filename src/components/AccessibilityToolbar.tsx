'use client';

import React, { useState } from 'react';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibilitySettings } from './AccessibilitySettings';
import { MdAccessibility } from 'react-icons/md';

export const AccessibilityToolbar: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const { isAccessibilityMode } = useAccessibility();

  return (
    <>
      {/* Skip Navigation Links */}
      <div className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 z-[9999] bg-blue-600 text-white p-2 rounded">
        <a href="#main-content" className="underline">
          Skip to main content
        </a>
        <span className="mx-2">|</span>
        <a href="#navigation" className="underline">
          Skip to navigation
        </a>
      </div>

      {/* Accessibility Settings Button - Bottom Right */}
      <div className="fixed bottom-4 right-4 z-[1000]">
        <button
          onClick={() => setShowSettings(true)}
          className={`p-3 rounded-full shadow-lg transition-colors ${
            isAccessibilityMode
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white dark:bg-blue-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          aria-label="Open accessibility settings"
          title="Accessibility Settings"
        >
          <MdAccessibility className="w-4 h-4" />
        </button>
      </div>

      {/* ARIA Live Region for Announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        id="aria-live-region"
      />

      {/* Accessibility Settings Modal */}
      <AccessibilitySettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
};
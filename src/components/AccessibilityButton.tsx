'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AccessibilitySettings } from './AccessibilitySettings';
import { MdAccessibility } from 'react-icons/md';

interface AccessibilityButtonProps {
  className?: string;
}

export const AccessibilityButton: React.FC<AccessibilityButtonProps> = ({ className }) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      {/* Accessibility Button - Simplified */}
      <button
        onClick={() => setShowSettings(true)}
        className={`${className}`}
        aria-label="Open accessibility settings"
        title="Accessibility Settings"
      >
        <MdAccessibility className="w-6 h-6" />
      </button>

      {/* Accessibility Settings Modal - Rendered as Portal */}
      {showSettings && typeof window !== 'undefined' && createPortal(
        <AccessibilitySettings
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />,
        document.body
      )}
    </>
  );
};
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { announce } from '@react-aria/live-announcer';

export interface AccessibilitySettings {
  highContrast: boolean;
  fontSize: 'normal' | 'large' | 'larger' | 'largest';
  reducedMotion: boolean;
  enhancedFocus: boolean;
  screenReaderOptimized: boolean;
}

interface AccessibilityContextType {
  settings: AccessibilitySettings;
  updateSettings: (newSettings: Partial<AccessibilitySettings>) => void;
  announceToScreenReader: (message: string, priority?: 'polite' | 'assertive') => void;
  isAccessibilityMode: boolean;
}

const defaultSettings: AccessibilitySettings = {
  highContrast: false,
  fontSize: 'normal',
  reducedMotion: false,
  enhancedFocus: false,
  screenReaderOptimized: false,
};

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};

interface AccessibilityProviderProps {
  children: ReactNode;
}

export const AccessibilityProvider: React.FC<AccessibilityProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultSettings);

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSettings = localStorage.getItem('diveblendr-accessibility');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          setSettings({ ...defaultSettings, ...parsed });
        } catch {
          // Unreadable storage falls back to the defaults rather than
          // failing the app.
        }
      }

      // Check for system preferences
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
      
      if (prefersReducedMotion || prefersHighContrast) {
        setSettings(current => ({
          ...current,
          reducedMotion: prefersReducedMotion,
          highContrast: prefersHighContrast,
        }));
      }
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('diveblendr-accessibility', JSON.stringify(settings));
      
      // Apply CSS classes to document
      const { body } = document;
    
      // High contrast
      body.classList.toggle('high-contrast', settings.highContrast);
      
      // Font size
      body.classList.remove('font-large', 'font-larger', 'font-largest');
      if (settings.fontSize !== 'normal') {
        body.classList.add(`font-${settings.fontSize}`);
      }
      
      // Reduced motion
      body.classList.toggle('reduce-motion', settings.reducedMotion);
      
      // Enhanced focus
      body.classList.toggle('enhanced-focus', settings.enhancedFocus);
      
      // Screen reader optimized
      body.classList.toggle('screen-reader-optimized', settings.screenReaderOptimized);
    }
  }, [settings]);

  const updateSettings = (newSettings: Partial<AccessibilitySettings>) => {
    setSettings(current => ({ ...current, ...newSettings }));
  };

  /**
   * Announce a calculation result or state change to assistive technology.
   *
   * Was previously a `console.log` stub, so no announcement ever reached a
   * screen reader. Now backed by @react-aria/live-announcer, which manages a
   * pair of visually-hidden live regions outside React's tree — the reliable
   * way to get a message spoken without a live region being remounted (a
   * remounted region is frequently missed).
   *
   * Use `assertive` only for a safety limit being breached; results and status
   * changes should stay `polite` so they do not interrupt what is being read.
   */
  const announceToScreenReader = useCallback(
    (message: string, priority: 'polite' | 'assertive' = 'polite') => {
      if (typeof window === 'undefined' || !message) return;
      announce(message, priority);
    },
    []
  );

  const isAccessibilityMode = Object.values(settings).some(value => 
    typeof value === 'boolean' ? value : value !== 'normal'
  );

  const value: AccessibilityContextType = {
    settings,
    updateSettings,
    announceToScreenReader,
    isAccessibilityMode,
  };

  return (
      <AccessibilityContext.Provider value={value}>
        {children}
      </AccessibilityContext.Provider>
  );
};
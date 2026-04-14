'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// import { announce } from '@react-aria/live-announcer';

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
  announceToScreenReader: (message: string) => void;
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
        } catch (error) {
          console.error('Failed to parse accessibility settings:', error);
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

  const announceToScreenReader = (message: string) => {
    // announce(message);
    console.log('Screen reader announcement:', message);
  };

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
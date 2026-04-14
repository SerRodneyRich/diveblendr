'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type UnitSystem = 'metric' | 'imperial';

export interface UnitPreferences {
  system: UnitSystem;
  pressure: 'bar' | 'psi';
  depth: 'meters' | 'feet';
  temperature: 'celsius' | 'fahrenheit';
  volume: 'liters' | 'cubic_feet';
}

interface UnitsContextType {
  preferences: UnitPreferences;
  setUnitSystem: (system: UnitSystem) => void;
  updatePreferences: (newPreferences: Partial<UnitPreferences>) => void;
}

const defaultMetricPreferences: UnitPreferences = {
  system: 'metric',
  pressure: 'bar',
  depth: 'meters',
  temperature: 'celsius',
  volume: 'liters',
};

const defaultImperialPreferences: UnitPreferences = {
  system: 'imperial',
  pressure: 'psi',
  depth: 'feet',
  temperature: 'fahrenheit',
  volume: 'cubic_feet',
};

const UnitsContext = createContext<UnitsContextType | undefined>(undefined);

export const useUnits = () => {
  const context = useContext(UnitsContext);
  if (context === undefined) {
    throw new Error('useUnits must be used within a UnitsProvider');
  }
  return context;
};

interface UnitsProviderProps {
  children: ReactNode;
}

export const UnitsProvider: React.FC<UnitsProviderProps> = ({ children }) => {
  const [preferences, setPreferences] = useState<UnitPreferences>(defaultMetricPreferences);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPreferences = localStorage.getItem('diveblendr-units');
      if (savedPreferences) {
        try {
          const parsed = JSON.parse(savedPreferences);
          setPreferences({ ...defaultMetricPreferences, ...parsed });
        } catch (error) {
          console.error('Failed to parse unit preferences:', error);
        }
      } else {
        // Try to detect user's region/locale for default units
        const userLocale = navigator.language || 'en-US';
        const isUSLocale = userLocale.startsWith('en-US') || userLocale.startsWith('en_US');
        
        if (isUSLocale) {
          setPreferences(defaultImperialPreferences);
        }
      }
    }
  }, []);

  // Save preferences to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('diveblendr-units', JSON.stringify(preferences));
    }
  }, [preferences]);

  const setUnitSystem = (system: UnitSystem) => {
    const newPreferences = system === 'metric' 
      ? defaultMetricPreferences 
      : defaultImperialPreferences;
    
    setPreferences(newPreferences);
  };

  const updatePreferences = (newPreferences: Partial<UnitPreferences>) => {
    setPreferences(current => ({ ...current, ...newPreferences }));
  };

  const value: UnitsContextType = {
    preferences,
    setUnitSystem,
    updatePreferences,
  };

  return (
    <UnitsContext.Provider value={value}>
      {children}
    </UnitsContext.Provider>
  );
};
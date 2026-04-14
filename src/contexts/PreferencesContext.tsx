'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TankSpecification } from '@/data/tankSpecifications';

export interface CustomTankSpecification extends TankSpecification {
  isCustom: true;
  createdAt: string; // ISO date string
}

export interface DiverPreferences {
  // Dive profile defaults
  diveMode: 'oc' | 'oc-trimix' | 'ccr' | 'ccr-trimix';
  gasType: 'nitrox' | 'trimix';
  defaultTankId: string | null;

  // Safety thresholds
  maxPPO2Work: number;           // default 1.4
  maxPPO2Deco: number;           // default 1.6
  maxPPO2CCR: number;            // default 1.3
  maxGasDensity: number;         // default 5.7 (g/L, NEDU threshold)
  maxGasDensityCritical: number; // default 6.2 (g/L)
  maxEND: number;                // default 30 (meters)

  // Calculation options
  oxygenNarcosisModel: boolean; // default false (IANTD/GUE standard)

  // Default calculation parameters
  defaultTargetMod: number;   // default 40
  defaultDesiredPPO2: number; // default 1.2

  // Custom tanks
  customTanks: CustomTankSpecification[];
}

const defaultPreferences: DiverPreferences = {
  diveMode: 'oc',
  gasType: 'nitrox',
  defaultTankId: null,
  maxPPO2Work: 1.4,
  maxPPO2Deco: 1.6,
  maxPPO2CCR: 1.3,
  maxGasDensity: 5.7,
  maxGasDensityCritical: 6.2,
  maxEND: 30,
  oxygenNarcosisModel: false,
  defaultTargetMod: 40,
  defaultDesiredPPO2: 1.2,
  customTanks: [],
};

interface PreferencesContextType {
  preferences: DiverPreferences;
  updatePreferences: (updates: Partial<DiverPreferences>) => void;
  addCustomTank: (tank: Omit<CustomTankSpecification, 'isCustom' | 'createdAt'>) => void;
  updateCustomTank: (id: string, updates: Partial<Omit<CustomTankSpecification, 'isCustom' | 'createdAt'>>) => void;
  removeCustomTank: (id: string) => void;
  resetToDefaults: () => void;
}

const STORAGE_KEY = 'diveblendr-preferences';

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};

interface PreferencesProviderProps {
  children: ReactNode;
}

export const PreferencesProvider: React.FC<PreferencesProviderProps> = ({ children }) => {
  const [preferences, setPreferences] = useState<DiverPreferences>(defaultPreferences);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPreferences = localStorage.getItem(STORAGE_KEY);
      if (savedPreferences) {
        try {
          const parsed = JSON.parse(savedPreferences);
          setPreferences({ ...defaultPreferences, ...parsed });
        } catch (error) {
          console.error('Failed to parse diver preferences:', error);
        }
      }
    }
  }, []);

  // Save preferences to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }
  }, [preferences]);

  const updatePreferences = (updates: Partial<DiverPreferences>) => {
    setPreferences(current => ({ ...current, ...updates }));
  };

  const addCustomTank = (tank: Omit<CustomTankSpecification, 'isCustom' | 'createdAt'>) => {
    const newTank: CustomTankSpecification = {
      ...tank,
      id: `custom-${Date.now()}`,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    setPreferences(current => ({
      ...current,
      customTanks: [...current.customTanks, newTank],
    }));
  };

  const updateCustomTank = (
    id: string,
    updates: Partial<Omit<CustomTankSpecification, 'isCustom' | 'createdAt'>>
  ) => {
    setPreferences(current => ({
      ...current,
      customTanks: current.customTanks.map(tank =>
        tank.id === id ? { ...tank, ...updates } : tank
      ),
    }));
  };

  const removeCustomTank = (id: string) => {
    setPreferences(current => ({
      ...current,
      customTanks: current.customTanks.filter(tank => tank.id !== id),
      // Clear defaultTankId if it references the removed custom tank
      defaultTankId: current.defaultTankId === id ? null : current.defaultTankId,
    }));
  };

  const resetToDefaults = () => {
    setPreferences(defaultPreferences);
  };

  const value: PreferencesContextType = {
    preferences,
    updatePreferences,
    addCustomTank,
    updateCustomTank,
    removeCustomTank,
    resetToDefaults,
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};

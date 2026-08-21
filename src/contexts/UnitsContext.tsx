'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  ReactNode,
} from 'react';

/**
 * `useLayoutEffect` logs a warning when React renders on the server, where
 * there is no layout to read. Selecting at module scope keeps the server on
 * `useEffect` (which never runs there anyway) and the browser on the layout
 * effect, which commits before paint.
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
  /**
   * False during the server render and the first client render, true once the
   * stored preference has been applied. Consumers that must not flash the
   * wrong unit can hold back until this is true; most do not need it, because
   * the value is already correct on first paint (see below).
   */
  hydrated: boolean;
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

/**
 * Reads the diver's stored unit preference, falling back to locale detection.
 *
 * Returns null on the server, where neither localStorage nor navigator exists.
 */
function readStoredPreferences(): UnitPreferences | null {
  if (typeof window === 'undefined') return null;

  try {
    const saved = window.localStorage.getItem('diveblendr-units');
    if (saved) {
      return { ...defaultMetricPreferences, ...JSON.parse(saved) };
    }
  } catch {
    // A corrupt or unreadable entry (private mode, quota, bad JSON) is not
    // worth failing the app over — fall through to locale detection.
  }

  const locale = window.navigator?.language ?? 'en-US';
  return locale.startsWith('en-US') || locale.startsWith('en_US')
    ? defaultImperialPreferences
    : defaultMetricPreferences;
}

export const UnitsProvider: React.FC<UnitsProviderProps> = ({ children }) => {
  /**
   * C4 — HYDRATION. The first client render MUST match the server HTML.
   *
   * This is a static export: `out/*.html` is generated once at build time,
   * with no request and no diver, so every page ships metric. Any client
   * render that disagrees with that HTML is a hydration mismatch, and React
   * throws away and re-renders the whole subtree (error #418).
   *
   * Two wrong fixes were tried and rejected:
   *
   *  - Switching inside `useEffect` (the original). The effect runs after
   *    hydration, so the mismatch happens first and React reports it.
   *  - Reading storage in the `useState` initialiser. Worse, not better: the
   *    initialiser runs during the hydration render itself, so a US client's
   *    very first render was imperial against metric HTML — the mismatch moved
   *    earlier rather than going away. Measured, not assumed: the toggle
   *    rendered `aria-checked={false}` where the server had `"true"`.
   *
   * What actually works: render the SERVER's value on the hydration pass, then
   * adopt the stored preference in a layout effect. `useLayoutEffect` fires
   * after commit but before the browser paints, so the diver never sees a
   * metric frame — there is no flash — while React still hydrates against
   * matching output.
   *
   * `useLayoutEffect` warns if it runs during SSR, so it is selected at module
   * scope; on the server the effect never runs at all.
   */
  const [preferences, setPreferences] = useState<UnitPreferences>(defaultMetricPreferences);
  const [hydrated, setHydrated] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const stored = readStoredPreferences();
    if (stored) setPreferences(stored);
    setHydrated(true);
  }, []);

  // Persist changes. Gated on `hydrated`: before the stored value has been
  // read, `preferences` is still the metric placeholder, and writing that
  // would overwrite the diver's saved imperial setting with metric on every
  // page load.
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('diveblendr-units', JSON.stringify(preferences));
    } catch {
      // Storage can be unavailable or full; the session still works.
    }
  }, [preferences, hydrated]);

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
    hydrated,
  };

  return (
    <UnitsContext.Provider value={value}>
      {children}
    </UnitsContext.Provider>
  );
};
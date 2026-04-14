const BACKUP_VERSION = '1.0';

const LAST_EXPORT_KEY = 'diveblendr-last-export';

const STORAGE_KEYS = {
  units: 'diveblendr-units',
  accessibility: 'diveblendr-accessibility',
  preferences: 'diveblendr-preferences',
  favorites: 'diveblendr-favorites',
} as const;

export interface PreferencesBackup {
  version: string;
  exportedAt: string;
  units: unknown;
  accessibility: unknown;
  preferences: unknown;
  favorites: unknown;
}

export interface ImportResult {
  success: boolean;
  sectionsImported: string[];
  errors: string[];
}

/**
 * Reads all 4 preference keys from localStorage and returns a combined backup object.
 * Returns partial data (null) for any keys that are missing or unreadable.
 */
export function exportAllPreferences(): PreferencesBackup {
  const readKey = (key: string): unknown => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    units: readKey(STORAGE_KEYS.units),
    accessibility: readKey(STORAGE_KEYS.accessibility),
    preferences: readKey(STORAGE_KEYS.preferences),
    favorites: readKey(STORAGE_KEYS.favorites),
  };
}

/**
 * Creates a Blob from the backup object and triggers a browser download with a
 * filename of the form `diveblendr-preferences-YYYY-MM-DD.json`.
 */
export function downloadPreferencesFile(backup: PreferencesBackup): void {
  if (typeof window === 'undefined') return;

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `diveblendr-preferences-${date}.json`;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Parses the provided JSON string, validates it contains a `version` field, then
 * writes each section back to localStorage. Per-section errors are captured so a
 * bad section does not block the remaining ones.
 *
 * Returns an ImportResult describing which sections were imported and any errors.
 */
export function importAllPreferences(jsonString: string): ImportResult {
  const result: ImportResult = {
    success: false,
    sectionsImported: [],
    errors: [],
  };

  if (typeof window === 'undefined') {
    result.errors.push('Cannot import preferences in a non-browser environment.');
    return result;
  }

  let backup: Record<string, unknown>;

  try {
    backup = JSON.parse(jsonString) as Record<string, unknown>;
  } catch {
    result.errors.push('Invalid JSON: could not parse the provided string.');
    return result;
  }

  if (!('version' in backup)) {
    result.errors.push('Invalid backup file: missing required "version" field.');
    return result;
  }

  const sectionMap: Record<string, string> = {
    units: STORAGE_KEYS.units,
    accessibility: STORAGE_KEYS.accessibility,
    preferences: STORAGE_KEYS.preferences,
    favorites: STORAGE_KEYS.favorites,
  };

  for (const [section, storageKey] of Object.entries(sectionMap)) {
    if (!(section in backup) || backup[section] === null) {
      // Section not present in backup — skip silently rather than error
      continue;
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(backup[section]));
      result.sectionsImported.push(section);
    } catch (err) {
      result.errors.push(
        `Failed to import "${section}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  result.success = result.sectionsImported.length > 0;
  return result;
}

/**
 * Returns the ISO timestamp of the last export, or null if no export has been
 * recorded yet. SSR-safe.
 */
export function getLastExportDate(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAST_EXPORT_KEY);
}

/**
 * Saves the current ISO timestamp to localStorage so the last-export date can be
 * retrieved later. SSR-safe.
 */
export function recordExportDate(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
}

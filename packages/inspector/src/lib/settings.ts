import { useEffect, useState } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';

export interface InspectorSettings {
  theme: ThemePref;
  /** Max calls retained in the Calls Log ring buffer. */
  maxCalls: number;
  /** Max events retained in the in-memory event ring buffer. */
  maxEvents: number;
}

export const DEFAULT_SETTINGS: InspectorSettings = {
  theme: 'auto',
  maxCalls: 500,
  maxEvents: 1000,
};

const STORAGE_KEY = 'mcify-inspector:settings';

/**
 * Read settings from localStorage. Returns the defaults if there's no entry,
 * the entry isn't valid JSON, or any field is missing/wrong-typed. We never
 * throw on bad storage — that would break the inspector for a user who has
 * a stale or hand-edited blob.
 */
const readStoredSettings = (): InspectorSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<InspectorSettings>;
    return {
      theme:
        parsed.theme === 'auto' || parsed.theme === 'light' || parsed.theme === 'dark'
          ? parsed.theme
          : DEFAULT_SETTINGS.theme,
      maxCalls:
        typeof parsed.maxCalls === 'number' && parsed.maxCalls > 0 && parsed.maxCalls <= 100_000
          ? Math.floor(parsed.maxCalls)
          : DEFAULT_SETTINGS.maxCalls,
      maxEvents:
        typeof parsed.maxEvents === 'number' && parsed.maxEvents > 0 && parsed.maxEvents <= 100_000
          ? Math.floor(parsed.maxEvents)
          : DEFAULT_SETTINGS.maxEvents,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const applyTheme = (theme: ThemePref): void => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'auto') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
};

/**
 * Hook that exposes the inspector's persistent settings. The state is
 * kept in localStorage so a refresh preserves the user's preferences.
 * Theme changes are reflected on `<html>` immediately so CSS variables
 * pick them up without a re-render dependency.
 */
export const useInspectorSettings = (): {
  settings: InspectorSettings;
  setSettings: (next: Partial<InspectorSettings>) => void;
  reset: () => void;
} => {
  const [settings, setSettingsState] = useState<InspectorSettings>(DEFAULT_SETTINGS);

  // Initial load from localStorage (after hydration to avoid SSR mismatch).
  useEffect(() => {
    const stored = readStoredSettings();
    setSettingsState(stored);
    applyTheme(stored.theme);
  }, []);

  // Cross-tab sync — if the user changes settings in another tab, this one
  // picks it up too.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      const next = readStoredSettings();
      setSettingsState(next);
      applyTheme(next.theme);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setSettings = (next: Partial<InspectorSettings>): void => {
    setSettingsState((prev) => {
      const merged: InspectorSettings = { ...prev, ...next };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch (e) {
        // Storage can fail in private browsing or when over-quota. Surface
        // the issue but keep the in-memory state so the UI stays usable.
        console.warn('[mcify inspector] could not persist settings', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
      if (next.theme && next.theme !== prev.theme) applyTheme(merged.theme);
      return merged;
    });
  };

  const reset = (): void => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore — defaults still apply in memory.
    }
    setSettingsState(DEFAULT_SETTINGS);
    applyTheme(DEFAULT_SETTINGS.theme);
  };

  return { settings, setSettings, reset };
};

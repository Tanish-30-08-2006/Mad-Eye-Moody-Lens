/**
 * core/settings.ts – Synchronized user preferences.
 *
 * Persists extension settings in chrome.storage.sync with typed defaults.
 */

import { createLogger } from './logger';

const log = createLogger('settings');

export interface ExtensionSettings {
  /** Backend API base URL (http or https, no trailing slash). */
  apiUrl: string;
  /** Allow the server-side URL fallback (Tier-2, yt-dlp) when a video cannot be fetched in the browser. Default OFF. */
  enableUrlDetect: boolean;
  /** Automatically scan visible images (never video). Default OFF. */
  enableAutoScan: boolean;
  /** Verbose logging, including post/media details. Default OFF. */
  debug: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiUrl: 'http://localhost:8000',
  enableUrlDetect: false,
  enableAutoScan: false,
  debug: false,
};

export const SETTINGS_KEY = 'moody_settings';

/**
 * Validates a user-entered API base URL. Returns the normalised URL (no trailing slash)
 * or null when it is not a well-formed http(s) URL.
 */
export function normalizeApiUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** Keeps only known keys with the right types, so stale or tampered storage cannot leak in. */
function sanitize(stored: unknown): ExtensionSettings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const apiUrl = typeof s.apiUrl === 'string' ? normalizeApiUrl(s.apiUrl) : null;
  return {
    apiUrl: apiUrl ?? DEFAULT_SETTINGS.apiUrl,
    enableUrlDetect: s.enableUrlDetect === true,
    enableAutoScan: s.enableAutoScan === true,
    debug: s.debug === true,
  };
}

/**
 * Load settings from chrome.storage.sync, falling back to defaults.
 */
export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      const result = await chrome.storage.sync.get(SETTINGS_KEY);
      if (result[SETTINGS_KEY]) return sanitize(result[SETTINGS_KEY]);
    }
  } catch (err) {
    log.warn('Could not read settings from chrome.storage.sync, using defaults:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save partial settings updates to chrome.storage.sync.
 */
export async function saveSettings(
  partial: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const updated = sanitize({ ...current, ...partial });

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });
    }
  } catch (err) {
    log.error('Failed to save settings:', err);
  }

  return updated;
}

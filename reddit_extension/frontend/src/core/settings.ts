/**
 * core/settings.ts – Synchronized user preferences.
 *
 * Persists extension settings in chrome.storage.sync with typed defaults.
 */

import { createLogger } from './logger';

const log = createLogger('settings');

export interface ExtensionSettings {
  /** Backend API base URL (no trailing slash). */
  apiUrl: string;
  /** Enable Tier-2 URL-based detection (yt-dlp fallback). */
  enableUrlDetect: boolean;
  /** Enable automatic scanning of visible posts. Default OFF. */
  enableAutoScan: boolean;
  /** Logging level. */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiUrl: 'http://localhost:8000',
  enableUrlDetect: false,
  enableAutoScan: false,
  logLevel: 'info',
};

const SETTINGS_KEY = 'moody_settings';

/**
 * Load settings from chrome.storage.sync, falling back to defaults.
 */
export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      const result = await chrome.storage.sync.get(SETTINGS_KEY);
      if (result[SETTINGS_KEY]) {
        return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
      }
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
  const updated: ExtensionSettings = { ...current, ...partial };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });
      log.info('Settings saved successfully:', partial);
    }
  } catch (err) {
    log.error('Failed to save settings:', err);
  }

  return updated;
}

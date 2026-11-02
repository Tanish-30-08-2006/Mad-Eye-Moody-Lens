/**
 * core/settings.ts – Extension settings management.
 *
 * Reads/writes user preferences to chrome.storage.sync.
 * Provides typed defaults and a reactive settings accessor.
 *
 * TODO: Implement full settings UI and persistence in Phase 7.
 */

import { createLogger } from './logger';

const log = createLogger('settings');

/** Extension settings shape. */
export interface ExtensionSettings {
  /** Backend API base URL (no trailing slash). */
  apiUrl: string;
  /** Enable Tier-2 URL-based detection (yt-dlp on backend). */
  enableUrlDetect: boolean;
  /** Enable automatic scanning of visible posts. OFF by default in v1. */
  enableAutoScan: boolean;
  /** Logging level. */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/** Default settings. */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiUrl: 'http://localhost:8000',
  enableUrlDetect: false,
  enableAutoScan: false,
  logLevel: 'info',
};

/**
 * Load settings from chrome.storage.sync, falling back to defaults.
 * TODO: Implement in Phase 7.
 */
export async function loadSettings(): Promise<ExtensionSettings> {
  log.debug('loadSettings called (stub)');
  // TODO: Read from chrome.storage.sync in Phase 7
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to chrome.storage.sync.
 * TODO: Implement in Phase 7.
 */
export async function saveSettings(
  _settings: Partial<ExtensionSettings>,
): Promise<void> {
  log.debug('saveSettings called (stub)');
  // TODO: Write to chrome.storage.sync in Phase 7
}

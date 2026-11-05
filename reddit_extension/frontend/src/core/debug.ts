/**
 * core/debug.ts – Keeps the logger's Debug flag in sync with the saved settings.
 */

import { loadSettings, SETTINGS_KEY } from './settings';
import { setDebugLogging } from './logger';

/** Applies the saved Debug setting now and follows later changes. Call once per context. */
export async function bindDebugToSettings(): Promise<void> {
  try {
    setDebugLogging((await loadSettings()).debug);
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !changes[SETTINGS_KEY]) return;
        void loadSettings().then((s) => setDebugLogging(s.debug));
      });
    }
  } catch {
    // Logging stays quiet if settings are unreachable.
  }
}

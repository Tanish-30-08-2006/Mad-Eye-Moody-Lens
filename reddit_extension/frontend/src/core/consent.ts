/**
 * core/consent.ts – First-run consent to send media to the user's Moody Lens backend.
 *
 * Stored in chrome.storage.local (not synced) so consent is per browser profile/device.
 */

const CONSENT_KEY = 'moody_consent';

export interface ConsentRecord {
  accepted: boolean;
  at: number;
}

export async function getConsent(): Promise<boolean> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const items = await chrome.storage.local.get(CONSENT_KEY);
      return (items[CONSENT_KEY] as ConsentRecord | undefined)?.accepted === true;
    }
  } catch {
    // Treat unreadable storage as "not consented".
  }
  return false;
}

export async function setConsent(accepted: boolean): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const record: ConsentRecord = { accepted, at: Date.now() };
    await chrome.storage.local.set({ [CONSENT_KEY]: record });
  }
}

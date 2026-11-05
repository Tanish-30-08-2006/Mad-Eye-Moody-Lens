/**
 * entrypoints/options/App.tsx – Settings page component placeholder.
 *
 * Allows configuring backend API endpoint, auto-scan behavior, and feature flags.
 *
 * TODO: Persist settings to chrome.storage.sync in Phase 7.
 */

import React, { useState } from 'react';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../../core/settings';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '24px', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <header style={{ borderBottom: '1px solid #edf2f7', paddingBottom: '16px', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Moody Lens Settings</h1>
        <p style={{ margin: '4px 0 0 0', color: '#718096', fontSize: '13px' }}>
          Configure detection backend connection and browser extension preferences.
        </p>
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Backend API URL
          </label>
          <input
            type="text"
            value={settings.apiUrl}
            onChange={(e) => setSettings({ ...settings, apiUrl: e.target.value })}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '14px', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={settings.enableAutoScan}
              onChange={(e) => setSettings({ ...settings, enableAutoScan: e.target.checked })}
            />
            <span>Enable in-feed automatic scanning (Experimental, off by default)</span>
          </label>
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={settings.enableUrlDetect}
              onChange={(e) => setSettings({ ...settings, enableUrlDetect: e.target.checked })}
            />
            <span>Enable Tier-2 URL resolution fallback (yt-dlp server-side)</span>
          </label>
        </div>
      </section>

      <footer style={{ marginTop: '32px', borderTop: '1px solid #edf2f7', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => alert('Settings saved (placeholder)')}
          style={{ padding: '8px 16px', backgroundColor: '#3182ce', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
        >
          Save Changes
        </button>
      </footer>
    </div>
  );
};

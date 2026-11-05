/**
 * entrypoints/popup/App.tsx – Status placeholder for extension popup.
 *
 * Displays local backend status, active configuration summary, and settings link.
 *
 * TODO: Add live health check ping in Phase 3.
 */

import React, { useState } from 'react';

export const App: React.FC = () => {
  const [backendStatus] = useState<'checking' | 'connected' | 'disconnected'>('connected');

  return (
    <div style={{ padding: '16px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '20px' }}>🔍</span>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Moody Lens</h2>
      </header>

      <section style={{ background: '#fff', borderRadius: '6px', padding: '12px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
          <span>Backend:</span>
          <span style={{ fontWeight: 600, color: backendStatus === 'connected' ? '#38a169' : '#e53e3e' }}>
            {backendStatus.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>
          Target: http://localhost:8000
        </div>
      </section>

      <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#a0aec0' }}>
        <span>v0.1.0</span>
        <button
          type="button"
          onClick={() => {
            if (chrome?.runtime?.openOptionsPage) {
              chrome.runtime.openOptionsPage();
            }
          }}
          style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', padding: 0, fontSize: '11px' }}
        >
          Options
        </button>
      </footer>
    </div>
  );
};

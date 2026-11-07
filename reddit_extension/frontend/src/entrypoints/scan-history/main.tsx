/**
 * entrypoints/history/main.tsx – Entrypoint for the local scan history page.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '../pages.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

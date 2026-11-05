import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  runner: {
    binaries: {
      chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
  },
  manifest: {
    name: 'Moody Lens – Deepfake Detection',
    description:
      'In-feed deepfake detection for Reddit. Scan posts for AI-generated or manipulated media.',
    permissions: ['storage', 'contextMenus', 'alarms'],
    commands: {
      'scan-nearest': {
        suggested_key: { default: 'Alt+Shift+L' },
        description: 'Scan the post nearest the middle of the screen',
      },
    },
    host_permissions: [
      'https://*.reddit.com/*',
      'http://localhost:8000/*',
      'https://i.redd.it/*',
      'https://v.redd.it/*',
      'https://preview.redd.it/*',
      'https://external-preview.redd.it/*',
    ],
    // A custom backend URL set in Options is requested at runtime (chrome.permissions.request).
    optional_host_permissions: ['http://*/*', 'https://*/*'],
  },
});

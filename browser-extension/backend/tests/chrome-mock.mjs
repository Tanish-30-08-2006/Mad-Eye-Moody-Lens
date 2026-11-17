// Minimal in-memory `chrome.*` for running the service worker under `node --test`.
// Only what background.js and audio/* touch at load time and in the tested message paths.

export const EXT_URL = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/";

function listeners() {
  const fns = [];
  return { addListener: fn => fns.push(fn), fns };
}

export function installChromeMock() {
  const store = {};
  const clone = value => (value === undefined ? undefined : structuredClone(value));

  const local = {
    async get(keys) {
      if (keys == null) return clone(store);
      if (typeof keys === "string") return keys in store ? { [keys]: clone(store[keys]) } : {};
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter(k => k in store).map(k => [k, clone(store[k])]));
      return Object.fromEntries(Object.entries(keys).map(([k, d]) => [k, k in store ? clone(store[k]) : d]));
    },
    async set(items) { for (const [k, v] of Object.entries(items)) store[k] = clone(v); },
    async setAccessLevel() {},
  };

  const runtime = {
    onInstalled: listeners(), onStartup: listeners(), onMessage: listeners(),
    getURL: path => EXT_URL + path,
    sendMessage: async () => undefined,
    lastError: undefined,
  };

  globalThis.chrome = {
    storage: { local },
    runtime,
    contextMenus: { removeAll: cb => cb?.(), create: () => {}, onClicked: listeners() },
    sidePanel: { setPanelBehavior: async () => {}, open: async () => {} },
    permissions: { contains: async () => true },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
    tabs: { query: async () => [], sendMessage: async () => undefined, get: async () => ({}) },
  };

  // audio-manager.js opens ws://127.0.0.1:8765 at load; keep the test process offline.
  globalThis.WebSocket = class {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    constructor() { this.readyState = 3; }
    send() {}
    close() {}
  };

  /** Deliver a runtime message like Chrome does; resolves with the sendResponse value (or undefined). */
  function send(message, sender = { url: EXT_URL + "frontend/popup.html" }) {
    return new Promise(resolve => {
      let answered = false;
      const sendResponse = value => { answered = true; resolve(value); };
      let keepOpen = false;
      for (const fn of runtime.onMessage.fns) keepOpen = fn(message, sender, sendResponse) === true || keepOpen;
      if (!keepOpen && !answered) resolve(undefined);
    });
  }

  return { store, send, runtime };
}

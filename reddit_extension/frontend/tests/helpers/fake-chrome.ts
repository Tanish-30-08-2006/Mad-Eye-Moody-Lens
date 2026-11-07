/**
 * tests/helpers/fake-chrome.ts – Small in-memory stand-in for the chrome.* APIs the extension uses.
 */
import { vi } from 'vitest';

function storageArea() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (keys == null) return Object.fromEntries(data);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => data.has(k)).map((k) => [k, data.get(k)]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    }),
  };
}

export interface FakeChrome {
  storage: { sync: ReturnType<typeof storageArea>; local: ReturnType<typeof storageArea>; session: ReturnType<typeof storageArea>; onChanged: { addListener: ReturnType<typeof vi.fn> } };
  permissions: { contains: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn> };
  runtime: { id: string; openOptionsPage: ReturnType<typeof vi.fn>; getManifest: () => { version: string }; sendMessage: ReturnType<typeof vi.fn>; lastError?: unknown };
  tabs: { query: ReturnType<typeof vi.fn>; sendMessage: ReturnType<typeof vi.fn> };
  action: { setBadgeText: ReturnType<typeof vi.fn> };
}

export function installFakeChrome(): FakeChrome {
  const fake: FakeChrome = {
    storage: { sync: storageArea(), local: storageArea(), session: storageArea(), onChanged: { addListener: vi.fn() } },
    permissions: { contains: vi.fn(async () => true), request: vi.fn(async () => true) },
    runtime: { id: 'test-extension', openOptionsPage: vi.fn(), getManifest: () => ({ version: '0.1.0' }), sendMessage: vi.fn() },
    tabs: { query: vi.fn(async () => []), sendMessage: vi.fn(async () => undefined) },
    action: { setBadgeText: vi.fn(async () => undefined) },
  };
  (globalThis as unknown as { chrome: FakeChrome }).chrome = fake;
  return fake;
}

export function removeFakeChrome(): void {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
}

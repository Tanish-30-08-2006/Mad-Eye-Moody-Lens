const API_ENDPOINT = "https://api.bitmind.ai/oracle/v1/34/detect-image";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MEMORY_CACHE = 250;
const MAX_PERSISTENT_CACHE = 180;
const cache = new Map();
const inFlight = new Map();
let activeApiRequests = 0;
const apiWaiters = [];

async function withApiConcurrencyLimit(task) {
  if (activeApiRequests >= 3) await new Promise(resolve => apiWaiters.push(resolve));
  activeApiRequests++;
  try { return await task(); }
  finally { activeApiRequests--; apiWaiters.shift()?.(); }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["apiKey", "scanEnabled", "recentDetections", "scanThreshold", "detectionCache"]);
  await chrome.storage.local.set({
    apiKey: existing.apiKey ?? "",
    scanEnabled: existing.scanEnabled ?? false,
    recentDetections: existing.recentDetections ?? [],
    scanThreshold: existing.scanThreshold ?? "standard",
    detectionCache: existing.detectionCache ?? {},
    scanDiagnostics: null
  });
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({
    id: "detection-studio-analyze-image",
    title: "Analyze image with Mad Eye Moody Lens",
    contexts: ["image"]
  }));
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }); } catch (_) {}
  if (existing.scanEnabled) await restoreScanner();
});

chrome.runtime.onStartup.addListener(restoreScanner);
async function restoreScanner() {
  const settings = await getStored();
  if (!settings.scanEnabled) return;
  const granted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
  if (granted) {
    try { await registerScanner(); }
    catch (error) { console.warn("Could not restore scanner registration:", error); }
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "detection-studio-analyze-image" || !info.srcUrl) return;
  await chrome.storage.local.set({ pendingReviewImage: info.srcUrl });
  if (tab?.id) {
    try { await chrome.sidePanel.open({ tabId: tab.id }); }
    catch (error) { console.warn("Could not open side panel:", error); }
  }
});

async function getStored() {
  return chrome.storage.local.get({
    apiKey: "", scanEnabled: false, recentDetections: [], scanThreshold: "standard"
  });
}

async function registerScanner() {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  if (scripts.some(s => s.id === "detection-studio-scanner")) {
    await chrome.scripting.unregisterContentScripts({ ids: ["detection-studio-scanner"] });
  }
  await chrome.scripting.registerContentScripts([{
    id: "detection-studio-scanner",
    matches: ["http://*/*", "https://*/*"],
    js: ["frontend/content.js"], css: ["frontend/overlay.css"],
    runAt: "document_idle", persistAcrossSessions: true
  }]);
}

async function unregisterScanner() {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  if (scripts.some(s => s.id === "detection-studio-scanner")) {
    await chrome.scripting.unregisterContentScripts({ ids: ["detection-studio-scanner"] });
  }
}

async function injectAndPing(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["frontend/overlay.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["frontend/content.js"] });
  const pong = await chrome.tabs.sendMessage(tabId, { type: "DS_PING" });
  if (!pong?.alive) throw new Error("The scanner did not respond. Refresh this webpage and try again.");
  return pong;
}

function trimMemoryCache() {
  const now = Date.now();
  for (const [key, entry] of cache) if (now - entry.time > CACHE_TTL_MS) cache.delete(key);
  while (cache.size > MAX_MEMORY_CACHE) cache.delete(cache.keys().next().value);
}

function cacheable(image) {
  return (image.startsWith("https://") || image.startsWith("http://")) && image.length <= 4096;
}

async function readPersistentCache(image) {
  if (!cacheable(image)) return null;
  const saved = await chrome.storage.local.get("detectionCache");
  const all = saved.detectionCache || {};
  const entry = all[image];
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL_MS) {
    delete all[image];
    await chrome.storage.local.set({ detectionCache: all });
    return null;
  }
  return { ok: true, response: entry.response, durationMs: entry.durationMs || 0, cached: true, source: "24-hour local cache" };
}

async function writePersistentCache(image, result) {
  if (!cacheable(image)) return;
  const saved = await chrome.storage.local.get("detectionCache");
  const all = saved.detectionCache || {};
  all[image] = { time: Date.now(), response: result.response, durationMs: result.durationMs };
  const now = Date.now();
  const entries = Object.entries(all)
    .filter(([, value]) => value && now - value.time <= CACHE_TTL_MS)
    .sort((a, b) => b[1].time - a[1].time)
    .slice(0, MAX_PERSISTENT_CACHE);
  await chrome.storage.local.set({ detectionCache: Object.fromEntries(entries) });
}

async function callBitMind(image, apiKey) {
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "x-bitmind-application": "oracle-api",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ image, rich: true }),
    signal: AbortSignal.timeout(45000)
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `BitMind returned HTTP ${response.status}.`);
  if (typeof data?.isAI !== "boolean") throw new Error("BitMind response did not contain the expected isAI field.");
  return data;
}

async function analyzeImage(image, source) {
  if (!image || typeof image !== "string") throw new Error("No image URL or image data was supplied.");
  const { apiKey } = await getStored();
  if (!apiKey) throw new Error("Add your BitMind API key in the extension popup first.");
  trimMemoryCache();
  const memory = cache.get(image);
  if (memory && Date.now() - memory.time < CACHE_TTL_MS) return { ...memory.result, cached: true };
  if (inFlight.has(image)) return await inFlight.get(image);

  const task = (async () => {
    const persisted = await readPersistentCache(image);
    if (persisted) {
      cache.set(image, { time: Date.now(), result: persisted });
      return persisted;
    }
    const start = Date.now();
    const response = await withApiConcurrencyLimit(() => callBitMind(image, apiKey));
    const result = { ok: true, response, durationMs: Date.now() - start, cached: false, source };
    cache.set(image, { time: Date.now(), result });
    await writePersistentCache(image, result);
    const settings = await getStored();
    const history = Array.isArray(settings.recentDetections) ? settings.recentDetections : [];
    const item = {
      time: Date.now(), isAI: response.isAI, confidence: response.confidence,
      similarity: response.similarity, objectKey: response.objectKey, source
    };
    await chrome.storage.local.set({ recentDetections: [item, ...history].slice(0, 30) });
    return result;
  })();
  inFlight.set(image, task);
  try { return await task; }
  finally { inFlight.delete(image); }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "GET_PUBLIC_STATUS") {
    Promise.all([
      getStored(),
      chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] }),
      chrome.storage.local.get("scanDiagnostics")
    ]).then(([settings, hasPermission, diag]) => sendResponse({
      keyConfigured: Boolean(settings.apiKey), scanEnabled: Boolean(settings.scanEnabled),
      scanThreshold: settings.scanThreshold || "standard", hostPermission: hasPermission,
      diagnostics: diag.scanDiagnostics || null
    })).catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === "SAVE_API_KEY") {
    chrome.storage.local.set({ apiKey: String(message.apiKey || "").trim() })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "SET_SCAN_THRESHOLD") {
    const value = ["standard", "large", "xlarge"].includes(message.value) ? message.value : "standard";
    chrome.storage.local.set({ scanThreshold: value })
      .then(() => sendResponse({ ok: true, value }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "ENABLE_SCANNING") {
    (async () => {
      const settings = await getStored();
      if (!settings.apiKey) throw new Error("Save your BitMind API key before enabling automatic scanning.");
      const granted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
      if (!granted) throw new Error("Website access permission is missing. Enable scanning again and approve access.");
      await registerScanner();
      await chrome.storage.local.set({ scanEnabled: true });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let ping = null;
      if (tab?.id && /^https?:/.test(tab.url || "")) ping = await injectAndPing(tab.id);
      return { ok: true, ping };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "SCAN_CURRENT_TAB") {
    (async () => {
      const settings = await getStored();
      if (!settings.apiKey) throw new Error("Save your BitMind API key first.");
      const granted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
      if (!granted) throw new Error("Website access permission is missing. Enable automatic scanning first.");
      await chrome.storage.local.set({ scanEnabled: true });
      await registerScanner();
      const tab = await chrome.tabs.get(message.tabId);
      if (!/^https?:/.test(tab.url || "")) throw new Error("Chrome does not allow scanning this type of page.");
      await injectAndPing(message.tabId);
      const scanResult = await chrome.tabs.sendMessage(message.tabId, { type: "DS_SCAN_NOW" });
      return scanResult;
    })().then(ping => sendResponse({ ok: true, ping })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "DISABLE_SCANNING") {
    (async () => {
      await unregisterScanner();
      await chrome.storage.local.set({ scanEnabled: false });
      const tabs = await chrome.tabs.query({});
      await Promise.all(tabs.filter(t => t.id && /^https?:/.test(t.url || "")).map(t =>
        chrome.tabs.sendMessage(t.id, { type: "DS_STOP" }).catch(() => null)
      ));
      return { ok: true };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "SCAN_DIAGNOSTICS") {
    if (sender?.tab?.id) {
      chrome.storage.local.set({ scanDiagnostics: {
        ...message.stats, tabId: sender.tab.id, url: sender.tab.url || "", updatedAt: Date.now()
      }}).catch(() => {});
    }
    return false;
  }

  if (message.type === "ANALYZE_IMAGE") {
    analyzeImage(String(message.image || ""), message.source || "manual")
      .then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "TEST_API_KEY") {
    (async () => {
      const { apiKey } = await getStored();
      if (!apiKey) throw new Error("Save your API key first.");
      return await callBitMind("https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=480", apiKey);
    })().then(response => sendResponse({ ok: true, response }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_HISTORY") {
    getStored().then(settings => sendResponse({ items: settings.recentDetections || [] }));
    return true;
  }
});

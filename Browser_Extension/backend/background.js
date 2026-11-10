importScripts("providers/provider-engine.js");

// Keep provider credentials and configuration out of webpage content scripts.
let storageAccessReady = Promise.resolve();
try {
  if (chrome.storage.local.setAccessLevel) {
    storageAccessReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    storageAccessReady.catch(error => console.warn("Could not restrict extension storage access:", error));
  }
} catch (error) {
  console.warn("Could not restrict extension storage access:", error);
}

const API_ENDPOINT = "https://api.bitmind.ai/oracle/v1/34/detect-image";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MEMORY_CACHE = 250;
const MAX_PERSISTENT_CACHE = 180;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 45000;
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

function isExtensionPage(sender) {
  return typeof sender?.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
}

function customConfigIsReady(config) {
  try { ProviderEngine.validateCustomConfig(config); return true; }
  catch { return false; }
}

function providerIsReady(settings, provider = settings.activeProvider) {
  if (provider === "custom") return customConfigIsReady(settings.customProviderConfig);
  return provider === "bitmind" && Boolean(String(settings.apiKey || "").trim());
}

async function providerIsUsable(settings, provider = settings.activeProvider) {
  if (!providerIsReady(settings, provider)) return false;
  if (provider !== "custom") return true;
  try {
    const endpoint = new URL(settings.customProviderConfig.endpoint);
    return await chrome.permissions.contains({ origins: [`${endpoint.origin}/*`] });
  } catch (_) {
    return false;
  }
}

function getProviderVersion(settings, provider) {
  return provider === "custom"
    ? (settings.customProviderConfig?.updatedAt || 0)
    : (settings.apiKeyUpdatedAt || 0);
}

function makeCacheKey(image, settings, provider) {
  return `${provider}:${getProviderVersion(settings, provider)}:${image}`;
}

chrome.runtime.onInstalled.addListener(async () => {
  try { await storageAccessReady; } catch (_) {}
  try { await chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }); } catch (_) {}
  const existing = await chrome.storage.local.get([
    "apiKey", "apiKeyUpdatedAt", "scanEnabled", "recentDetections", "scanThreshold",
    "detectionCache", "activeProvider", "customProviderConfig"
  ]);
  await chrome.storage.local.set({
    apiKey: existing.apiKey ?? "",
    apiKeyUpdatedAt: existing.apiKeyUpdatedAt ?? (existing.apiKey ? 1 : 0),
    activeProvider: ["bitmind", "custom"].includes(existing.activeProvider) ? existing.activeProvider : "bitmind",
    customProviderConfig: existing.customProviderConfig ?? null,
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
  if (!(await providerIsUsable(settings))) {
    await chrome.storage.local.set({ scanEnabled: false });
    return;
  }
  const granted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
  if (granted) {
    try { await registerScanner(); }
    catch (error) { console.warn("Could not restore scanner registration:", error); }
  } else {
    await chrome.storage.local.set({ scanEnabled: false });
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
    apiKey: "", apiKeyUpdatedAt: 0, activeProvider: "bitmind", customProviderConfig: null,
    scanEnabled: false, recentDetections: [], scanThreshold: "standard"
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
  const scannerSettings = await getScannerSettings();
  await chrome.tabs.sendMessage(tabId, { type: "DS_SETTINGS_CHANGED", settings: scannerSettings });
  const pong = await chrome.tabs.sendMessage(tabId, { type: "DS_PING" });
  if (!pong?.alive) throw new Error("The scanner did not respond. Refresh this webpage and try again.");
  return pong;
}

function trimMemoryCache() {
  const now = Date.now();
  for (const [key, entry] of cache) if (now - entry.time > CACHE_TTL_MS) cache.delete(key);
  while (cache.size > MAX_MEMORY_CACHE) cache.delete(cache.keys().next().value);
}

function cacheable(image, cacheKey) {
  return (image.startsWith("https://") || image.startsWith("http://")) && image.length <= 4096 && cacheKey.length <= 8192;
}

async function readPersistentCache(image, cacheKey) {
  if (!cacheable(image, cacheKey)) return null;
  const saved = await chrome.storage.local.get("detectionCache");
  const all = saved.detectionCache || {};
  const entry = all[cacheKey];
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL_MS) {
    delete all[cacheKey];
    await chrome.storage.local.set({ detectionCache: all });
    return null;
  }
  return { ok: true, response: entry.response, durationMs: entry.durationMs || 0, cached: true, source: "24-hour local cache" };
}

async function writePersistentCache(image, cacheKey, result) {
  if (!cacheable(image, cacheKey)) return;
  const saved = await chrome.storage.local.get("detectionCache");
  const all = saved.detectionCache || {};
  all[cacheKey] = { time: Date.now(), response: result.response, durationMs: result.durationMs };
  const now = Date.now();
  const entries = Object.entries(all)
    .filter(([, value]) => value && now - value.time <= CACHE_TTL_MS)
    .sort((a, b) => b[1].time - a[1].time)
    .slice(0, MAX_PERSISTENT_CACHE);
  await chrome.storage.local.set({ detectionCache: Object.fromEntries(entries) });
}

async function readJsonResponse(response, providerName) {
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { data = { raw: raw.slice(0, 2000) }; }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || data?.detail || `${providerName} returned HTTP ${response.status}.`;
    throw new Error(String(message).slice(0, 500));
  }
  if (!data || typeof data !== "object") throw new Error(`${providerName} returned an unsupported response. Expected a JSON object or array.`);
  return data;
}

async function callBitMind(image, apiKey) {
  // Preserve the original extension behaviour: BitMind receives either a
  // webpage image URL or a data URI created by the manual upload panel.
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "x-bitmind-application": "oracle-api",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ image, rich: true }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const data = await readJsonResponse(response, "BitMind");
  if (typeof data?.isAI !== "boolean") throw new Error("BitMind response did not contain the expected Boolean isAI field.");
  return ProviderEngine.normalizeBitMindResponse(data);
}

function isPrivateOrLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || host === "::") return true;
  if (host.includes(":")) {
    return host.startsWith("fc") || host.startsWith("fd") || /^fe[89ab]/i.test(host) || host.startsWith("::ffff:");
  }
  const parts = host.split(".");
  if (parts.length === 4 && parts.every(part => /^\d+$/.test(part) && Number(part) <= 255)) {
    const [a, b] = parts.map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

function parseDataImage(dataUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new Error("The supplied data URL is not a valid Base64 image.");
  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("Image exceeds the 8 MB upload limit.");
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

async function loadImageBlob(image) {
  if (image.startsWith("data:")) return parseDataImage(image);
  let url;
  try { url = new URL(image); }
  catch { throw new Error("Enter a valid HTTP(S) image URL or upload an image file."); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || isPrivateOrLocalHostname(url.hostname)) {
    throw new Error("For security, image uploads can only fetch public HTTP(S) image URLs. Upload a local file directly instead.");
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      method: "GET", credentials: "omit", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new Error(`Could not fetch image bytes. Grant access to the image host or upload the image directly. (${error.message})`);
  }
  if (!response.ok) throw new Error(`Image host returned HTTP ${response.status}.`);
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) throw new Error("The supplied URL did not return an image content type.");
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_UPLOAD_BYTES) throw new Error("Image exceeds the 8 MB upload limit.");
  const blob = await response.blob();
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("Image exceeds the 8 MB upload limit.");
  return blob.type ? blob : blob.slice(0, blob.size, type);
}

function blobToDataUri(blob) {
  return blob.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
  });
}

async function callCustomProvider(image, rawConfig) {
  const config = ProviderEngine.validateCustomConfig(rawConfig);
  const headers = new Headers(JSON.parse(config.additionalHeaders || "{}"));
  if (config.authType === "bearer") headers.set("Authorization", `Bearer ${config.apiKey.trim()}`);
  if (config.authType === "header") headers.set(config.authHeaderName.trim(), config.apiKey.trim());

  const modelId = String(config.modelId || "").trim();
  let body;
  let method = "POST";

  if (config.imageTransport === "url_json") {
    if (!/^https?:\/\//i.test(image)) throw new Error("JSON image URL mode requires a public HTTP(S) image URL. Choose another transport for uploaded files.");
    const url = new URL(image);
    if (isPrivateOrLocalHostname(url.hostname)) throw new Error("Private/local image URLs cannot be sent to a remote provider.");
    const payload = { [config.imageField]: image };
    if (modelId && config.modelField) payload[config.modelField] = modelId;
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(payload);
  } else {
    const blob = await loadImageBlob(image);
    const filename = `image.${(blob.type.split("/")[1] || "bin").replace(/[^a-z0-9.+-]/gi, "")}`;
    if (config.imageTransport === "base64_json") {
      const payload = { [config.imageField]: await blobToDataUri(blob) };
      if (modelId && config.modelField) payload[config.modelField] = modelId;
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(payload);
    } else if (config.imageTransport === "multipart") {
      const form = new FormData();
      form.append(config.imageField, blob, filename);
      if (modelId && config.modelField) form.append(config.modelField, modelId);
      body = form;
    } else if (config.imageTransport === "binary") {
      headers.set("Content-Type", blob.type || "application/octet-stream");
      if (modelId && config.modelHeaderName) headers.set(config.modelHeaderName, modelId);
      body = blob;
    }
  }

  const response = await fetch(config.endpoint, {
    method, headers, body, credentials: "omit", redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const raw = await readJsonResponse(response, config.name || "Custom provider");
  return ProviderEngine.normalizeCustomResponse(raw, config);
}

async function analyzeImage(image, source) {
  if (!image || typeof image !== "string") throw new Error("No image URL or image data was supplied.");
  const settings = await getStored();
  const provider = settings.activeProvider || "bitmind";
  if (!(await providerIsUsable(settings, provider))) {
    throw new Error(provider === "custom"
      ? "Configure the Custom REST API and grant its API host permission in Manage provider settings."
      : "Add your BitMind API key in the extension popup first.");
  }

  trimMemoryCache();
  const cacheKey = makeCacheKey(image, settings, provider);
  const useCache = cacheable(image, cacheKey);
  const memory = useCache ? cache.get(cacheKey) : null;
  if (memory && Date.now() - memory.time < CACHE_TTL_MS) return { ...memory.result, cached: true };
  if (inFlight.has(cacheKey)) return await inFlight.get(cacheKey);

  const task = (async () => {
    const persisted = useCache ? await readPersistentCache(image, cacheKey) : null;
    if (persisted) {
      cache.set(cacheKey, { time: Date.now(), result: persisted });
      return persisted;
    }
    const start = Date.now();
    const response = await withApiConcurrencyLimit(() => provider === "custom"
      ? callCustomProvider(image, settings.customProviderConfig)
      : callBitMind(image, settings.apiKey));
    const result = { ok: true, response, durationMs: Date.now() - start, cached: false, source, provider };
    if (useCache) {
      cache.set(cacheKey, { time: Date.now(), result });
      await writePersistentCache(image, cacheKey, result);
    }

    const latest = await getStored();
    const history = Array.isArray(latest.recentDetections) ? latest.recentDetections : [];
    const item = {
      time: Date.now(), provider: response.provider, providerName: response.providerName,
      model: response.model, isAI: response.isAI, verdict: response.verdict,
      confidence: response.confidence, similarity: response.similarity, source
    };
    await chrome.storage.local.set({ recentDetections: [item, ...history].slice(0, 30) });
    return result;
  })();
  inFlight.set(cacheKey, task);
  try { return await task; }
  finally { inFlight.delete(cacheKey); }
}

async function getProviderPublicStatus(settings) {
  const activeProvider = settings.activeProvider || "bitmind";
  return {
    activeProvider,
    activeProviderConfigured: await providerIsUsable(settings, activeProvider),
    bitmindConfigured: Boolean(String(settings.apiKey || "").trim()),
    customConfigured: await providerIsUsable(settings, "custom"),
    customProviderName: settings.customProviderConfig?.name || "Custom REST API",
    scanEnabled: Boolean(settings.scanEnabled),
    scanThreshold: settings.scanThreshold || "standard"
  };
}

async function getScannerSettings() {
  const settings = await getStored();
  const activeProvider = settings.activeProvider || "bitmind";
  return {
    scanEnabled: Boolean(settings.scanEnabled),
    scanThreshold: settings.scanThreshold || "standard",
    activeProvider,
    providerConfigured: await providerIsUsable(settings),
    providerVersion: getProviderVersion(settings, activeProvider)
  };
}

async function broadcastScannerSettings() {
  const scannerSettings = await getScannerSettings();
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter(tab => tab.id && /^https?:/.test(tab.url || "")).map(tab =>
    chrome.tabs.sendMessage(tab.id, { type: "DS_SETTINGS_CHANGED", settings: scannerSettings }).catch(() => null)
  ));
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "GET_SCANNER_SETTINGS") {
    storageAccessReady.then(getScannerSettings).then(sendResponse)
      .catch(error => sendResponse({ scanEnabled: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_PUBLIC_STATUS") {
    Promise.all([
      getStored(),
      chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] }),
      chrome.storage.local.get("scanDiagnostics")
    ]).then(async ([settings, hasPermission, diag]) => sendResponse({
      ...(await getProviderPublicStatus(settings)), hostPermission: hasPermission,
      diagnostics: diag.scanDiagnostics || null
    })).catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === "GET_CUSTOM_PROVIDER_CONFIG") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "Provider settings are available only inside the extension." }); return false; }
    getStored().then(settings => sendResponse({ ok: true, config: settings.customProviderConfig || ProviderEngine.DEFAULT_CUSTOM_CONFIG }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "SAVE_API_KEY") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    const apiKey = String(message.apiKey || "").trim();
    getStored().then(settings => chrome.storage.local.set({
      apiKey,
      apiKeyUpdatedAt: Math.max(Date.now(), Number(settings.apiKeyUpdatedAt || 0) + 1)
    }))
      .then(() => broadcastScannerSettings())
      .then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "SAVE_CUSTOM_PROVIDER_CONFIG") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    (async () => {
      const config = ProviderEngine.validateCustomConfig(message.config);
      const endpoint = new URL(config.endpoint);
      const originPattern = `${endpoint.origin}/*`;
      const granted = await chrome.permissions.contains({ origins: [originPattern] });
      if (!granted) throw new Error("API host permission is missing. Save the provider from its settings page and approve access.");
      const current = await getStored();
      const updatedAt = Math.max(Date.now(), Number(current.customProviderConfig?.updatedAt || 0) + 1);
      await chrome.storage.local.set({ customProviderConfig: { ...config, updatedAt } });
      await broadcastScannerSettings();
      return { ok: true };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "SET_ACTIVE_PROVIDER") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    (async () => {
      const provider = message.provider;
      if (!["bitmind", "custom"].includes(provider)) throw new Error("Choose a supported detection provider.");
      const settings = await getStored();
      if (!(await providerIsUsable(settings, provider))) {
        throw new Error(provider === "custom"
          ? "Configure the Custom REST API and grant its API host permission in Manage provider settings."
          : "Save your BitMind API key before selecting BitMind.");
      }
      await chrome.storage.local.set({ activeProvider: provider });
      await broadcastScannerSettings();
      return { ok: true, provider };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "SET_SCAN_THRESHOLD") {
    const value = ["standard", "large", "xlarge"].includes(message.value) ? message.value : "standard";
    chrome.storage.local.set({ scanThreshold: value })
      .then(() => broadcastScannerSettings())
      .then(() => sendResponse({ ok: true, value }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "ENABLE_SCANNING") {
    (async () => {
      const settings = await getStored();
      if (!(await providerIsUsable(settings))) throw new Error("Configure the selected detection provider and approve its API host permission before enabling scanning.");
      const granted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
      if (!granted) throw new Error("Website access permission is missing. Enable scanning again and approve access.");
      await registerScanner();
      await chrome.storage.local.set({ scanEnabled: true });
      await broadcastScannerSettings();
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
      if (!(await providerIsUsable(settings))) throw new Error("Configure the selected detection provider and approve its API host permission before scanning.");
      const granted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
      if (!granted) throw new Error("Website access permission is missing. Enable automatic scanning first.");
      await chrome.storage.local.set({ scanEnabled: true });
      await registerScanner();
      const tab = await chrome.tabs.get(message.tabId);
      if (!/^https?:/.test(tab.url || "")) throw new Error("Chrome does not allow scanning this type of page.");
      await injectAndPing(message.tabId);
      return await chrome.tabs.sendMessage(message.tabId, { type: "DS_SCAN_NOW" });
    })().then(result => sendResponse({ ok: true, ping: result })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "DISABLE_SCANNING") {
    (async () => {
      await unregisterScanner();
      await chrome.storage.local.set({ scanEnabled: false });
      const tabs = await chrome.tabs.query({});
      await Promise.all(tabs.filter(tab => tab.id && /^https?:/.test(tab.url || "")).map(tab =>
        chrome.tabs.sendMessage(tab.id, { type: "DS_STOP" }).catch(() => null)
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
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    (async () => {
      const { apiKey } = await getStored();
      if (!apiKey) throw new Error("Save your BitMind API key first.");
      return await callBitMind("https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=480", apiKey);
    })().then(response => sendResponse({ ok: true, response }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "TEST_CUSTOM_PROVIDER") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    (async () => {
      const settings = await getStored();
      if (!(await providerIsUsable(settings, "custom"))) throw new Error("Save a valid Custom REST API configuration and approve its API host permission first.");
      let testImage;
      if (settings.customProviderConfig.imageTransport === "url_json") {
        testImage = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=480";
      } else {
        const asset = await fetch(chrome.runtime.getURL("assets/provider-test-image.png"));
        if (!asset.ok) throw new Error("Could not load the bundled provider test image.");
        testImage = await blobToDataUri(await asset.blob());
      }
      const start = Date.now();
      const response = await withApiConcurrencyLimit(() => callCustomProvider(testImage, settings.customProviderConfig));
      return { ok: true, response, durationMs: Date.now() - start };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_HISTORY") {
    getStored().then(settings => sendResponse({ items: settings.recentDetections || [] }))
      .catch(error => sendResponse({ items: [], error: error.message }));
    return true;
  }
});

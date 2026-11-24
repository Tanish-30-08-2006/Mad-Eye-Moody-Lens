/**
 * background.js – Mad-Eye Moody Lens unified service worker (Manifest V3, "type": "module").
 * ============================================================================================
 * One extension, three modalities:
 *   IMAGE  providers/provider-engine.js        BitMind detect-image | Custom REST | Moody Lens server
 *   AUDIO  audio/*                             local WebSocket model | ZeroTrue | Moody Lens server
 *   VIDEO  providers/video-provider-engine.js  BitMind detect-video (+ frame fallback) | Custom REST
 *                                              | Moody Lens server
 * The image + audio code is the primary Chrome extension (Browser_Extension-backend); the video
 * engine comes from backend_for_video_testing and lives in the VIDEO section below. Its storage
 * keys are prefixed `video*` so the two engines can never overwrite each other's provider
 * configuration or caches, and its messages answer with the original `{ok, data}` envelope.
 * "moodylens" is the team's own backend (functional-ui-models-backend /api/v1).
 */

import "./providers/provider-engine.js";        // globalThis.ProviderEngine (image)
import "./providers/video-provider-engine.js";  // globalThis.VideoProviderEngine (video); importScripts is unavailable in module workers
import * as MoodyLens from "./providers/moodylens-client.js";
import {
  startMonitoring,
  stopMonitoring,
  getStatus as getAudioStatus,
  forwardAudioChunk,
  triggerDeepAnalysis,
  getLastForensicReport,
  startTabPlaybackCapture,
  stopTabPlaybackCapture,
  handlePlaybackCaptureFinished,
  AUDIO_ENGINE_MODES,
} from "./audio/audio-manager.js";
import { AudioStorage } from "./audio/audio-storage.js";
import {
  testZeroTrueApiKey,
  callZeroTrueFileApi,
  callZeroTrueUrlApi,
  normalizeZeroTrueImageResponse,
  normalizeZeroTrueVideoResponse,
} from "./audio/zerotrue-client.js";

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
  if (sender?.id && sender.id === chrome.runtime.id) return true;
  return typeof sender?.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
}

const IMAGE_PROVIDERS = ["bitmind", "zerotrue", "custom", MoodyLens.PROVIDER_ID];
const MOODYLENS_DEFAULTS = {
  moodyLensServerUrl: MoodyLens.DEFAULT_SERVER_URL, moodyLensApiKey: "", moodyLensUpdatedAt: 0,
};

function moodyLensConfig(settings) {
  return {
    baseUrl: settings.moodyLensServerUrl, apiKey: settings.moodyLensApiKey, updatedAt: settings.moodyLensUpdatedAt,
  };
}

function customConfigIsReady(config) {
  try { ProviderEngine.validateCustomConfig(config); return true; }
  catch { return false; }
}

export function getProviderVerificationState(settings, provider) {
  if (provider === "zerotrue") {
    const key = String(settings.zeroTrueApiKey || "").trim();
    if (!key) return { state: "not_configured", label: "Not configured", error: null };
    const state = settings.zeroTrueVerificationState || "unverified";
    const error = settings.zeroTrueVerificationError || null;
    return {
      state,
      label: state === "verified" ? "Verified" : (state === "invalid" ? "Invalid credentials" : "Configured, not verified"),
      error
    };
  }
  if (provider === "custom") {
    const ready = customConfigIsReady(settings.customProviderConfig);
    if (!ready) return { state: "not_configured", label: "Not configured", error: null };
    const state = settings.customVerificationState || "unverified";
    const error = settings.customVerificationError || null;
    return {
      state,
      label: state === "verified" ? "Verified" : (state === "invalid" ? "Invalid credentials" : "Configured, not verified"),
      error
    };
  }
  if (provider === MoodyLens.PROVIDER_ID) {
    const validUrl = MoodyLens.serverUrlIsValid(settings.moodyLensServerUrl);
    if (!validUrl) return { state: "not_configured", label: "Not configured", error: null };
    const state = settings.moodyLensVerificationState || "unverified";
    const error = settings.moodyLensVerificationError || null;
    return {
      state,
      label: state === "verified" ? "Verified" : (state === "invalid" ? "Invalid credentials" : "Configured, not verified"),
      error
    };
  }
  // bitmind
  const key = String(settings.apiKey || "").trim();
  if (!key) return { state: "not_configured", label: "Not configured", error: null };
  const state = settings.bitmindVerificationState || "unverified";
  const error = settings.bitmindVerificationError || null;
  return {
    state,
    label: state === "verified" ? "Verified" : (state === "invalid" ? "Invalid credentials" : "Configured, not verified"),
    error
  };
}

export function isBitMindSupportedVideoUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    if (/(^|\.)((x\.com)|(twitter\.com)|(tiktok\.com)|(facebook\.com)|(fb\.watch))$/i.test(host)) return true;
    const path = url.pathname.toLowerCase();
    if (/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function providerIsReady(settings, provider = settings.activeProvider) {
  if (provider === "zerotrue") return Boolean(String(settings.zeroTrueApiKey || "").trim());
  if (provider === "custom") return customConfigIsReady(settings.customProviderConfig);
  if (provider === MoodyLens.PROVIDER_ID) return MoodyLens.serverUrlIsValid(settings.moodyLensServerUrl);
  return provider === "bitmind" && Boolean(String(settings.apiKey || "").trim());
}

async function providerIsUsable(settings, provider = settings.activeProvider) {
  if (!providerIsReady(settings, provider)) return false;
  const readiness = getProviderVerificationState(settings, provider);
  if (readiness.state === "invalid") return false;
  if (provider === "zerotrue") return true;
  if (provider === MoodyLens.PROVIDER_ID) return MoodyLens.serverIsUsable(moodyLensConfig(settings));
  if (provider !== "custom") return true;
  try {
    const endpoint = new URL(settings.customProviderConfig.endpoint);
    return await chrome.permissions.contains({ origins: [`${endpoint.origin}/*`] });
  } catch (_) {
    return false;
  }
}

function getProviderVersion(settings, provider) {
  if (provider === "zerotrue") return settings.zeroTrueUpdatedAt || (settings.zeroTrueApiKey ? 1 : 0);
  if (provider === "custom") return settings.customProviderConfig?.updatedAt || 0;
  if (provider === MoodyLens.PROVIDER_ID) return settings.moodyLensUpdatedAt || 0;
  return settings.apiKeyUpdatedAt || 0;
}

function providerSetupMessage(provider, settings) {
  const readiness = settings ? getProviderVerificationState(settings, provider) : null;
  if (readiness?.state === "invalid") {
    const errText = readiness.error ? ` (${readiness.error})` : "";
    if (provider === "zerotrue") return `ZeroTrue API key failed validation${errText}. Update your key in Settings → Providers.`;
    if (provider === "bitmind") return `BitMind API key failed validation${errText}. Update your key in Settings → Providers.`;
    if (provider === MoodyLens.PROVIDER_ID) return `Mad-Eye Moody Lens server failed validation${errText}. Update address in Settings.`;
    return `Custom REST API failed validation${errText}. Update configuration in Settings.`;
  }
  if (provider === "zerotrue") return "ZeroTrue is not configured. Add your API key in Settings → Providers to enable detection.";
  if (provider === "custom") return "Configure the Custom REST API and grant its API host permission in Settings → Providers.";
  if (provider === MoodyLens.PROVIDER_ID) return "Set the Mad-Eye Moody Lens server address in settings and allow the extension to reach it.";
  return "BitMind is not configured. Add your API key in Settings → Providers to enable detection.";
}

// chrome.storage has no transactions: read-modify-write updates (history, caches) go through
// this queue so two scans finishing together cannot drop each other's entries.
let storageQueue = Promise.resolve();
function serializedStorageUpdate(task) {
  const run = storageQueue.then(task, task);
  storageQueue = run.catch(() => {});
  return run;
}

function makeConcurrencyLimiter(limit) {
  let active = 0;
  const waiters = [];
  return async function limited(task) {
    if (active >= limit) await new Promise(resolve => waiters.push(resolve));
    active++;
    try { return await task(); }
    finally { active--; waiters.shift()?.(); }
  };
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function makeCacheKey(image, settings, provider) {
  return `${provider}:${getProviderVersion(settings, provider)}:${image}`;
}

chrome.runtime.onInstalled.addListener(async () => {
  try { await storageAccessReady; } catch (_) {}
  try { await chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }); } catch (_) {}
  const existing = await chrome.storage.local.get([
    "apiKey", "apiKeyUpdatedAt", "scanEnabled", "recentDetections", "scanThreshold",
    "detectionCache", "activeProvider", "customProviderConfig",
    "audioServerToken", "audioServerUrl", "zeroTrueApiKey", "audioEngineMode",
    "videoActiveProvider", "videoCustomProviderConfig", "videoDetectionCache", "videoDetectionHistory",
    "hoverScanEnabled", "autoScanOnHover", "hoverDelayMs",
    "moodyLensServerUrl", "moodyLensApiKey", "moodyLensUpdatedAt",
  ]);

  // Migration from the standalone video extension, which used the same un-prefixed keys:
  // a custom config with `videoTransport` is a video config and moves to the video engine.
  let imageCustom = existing.customProviderConfig ?? null;
  let videoCustom = existing.videoCustomProviderConfig ?? null;
  let imageProvider = existing.activeProvider;
  let videoProvider = existing.videoActiveProvider;
  if (imageCustom && typeof imageCustom === "object" && "videoTransport" in imageCustom) {
    if (!videoCustom) videoCustom = imageCustom;
    if (imageProvider === "custom" && videoProvider === undefined) videoProvider = "custom";
    imageCustom = null;
    if (imageProvider === "custom") imageProvider = "bitmind";
  }

  await chrome.storage.local.set({
    apiKey: existing.apiKey ?? "",                     // BitMind key: shared by image and video
    apiKeyUpdatedAt: existing.apiKeyUpdatedAt ?? (existing.apiKey ? 1 : 0),
    activeProvider: IMAGE_PROVIDERS.includes(imageProvider) ? imageProvider : "bitmind",
    customProviderConfig: imageCustom,
    scanEnabled: existing.scanEnabled ?? false,
    recentDetections: existing.recentDetections ?? [],
    scanThreshold: existing.scanThreshold ?? "standard",
    detectionCache: existing.detectionCache ?? {},
    scanDiagnostics: null,
    audioServerToken: existing.audioServerToken ?? "madeye-local-dev-token-change-me",
    audioServerUrl:   existing.audioServerUrl   ?? "ws://127.0.0.1:8765",
    zeroTrueApiKey:   existing.zeroTrueApiKey   ?? "",
    audioEngineMode:  AUDIO_ENGINE_MODES.includes(existing.audioEngineMode) ? existing.audioEngineMode : "auto",
    videoActiveProvider: VIDEO_PROVIDERS.includes(videoProvider) ? videoProvider : "bitmind",
    videoCustomProviderConfig: videoCustom,
    videoDetectionCache: existing.videoDetectionCache ?? {},
    videoDetectionHistory: existing.videoDetectionHistory ?? [],
    hoverScanEnabled: existing.hoverScanEnabled ?? true,
    autoScanOnHover: existing.autoScanOnHover ?? true,
    hoverDelayMs: existing.hoverDelayMs ?? 400,
    moodyLensServerUrl: existing.moodyLensServerUrl ?? MoodyLens.DEFAULT_SERVER_URL,
    moodyLensApiKey: existing.moodyLensApiKey ?? "",
    moodyLensUpdatedAt: existing.moodyLensUpdatedAt ?? 0,
  });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: IMAGE_MENU_ID,
      title: "Analyze image with Mad Eye Moody Lens",
      contexts: ["image"]
    });
    chrome.contextMenus.create({
      id: VIDEO_MENU_ID,
      title: "Analyze video with Mad Eye Moody Lens",
      contexts: ["video", "link"]
    });
  });
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }); } catch (_) {}
  if (existing.scanEnabled) await restoreScanner();
});

chrome.runtime.onStartup.addListener(restoreScanner);
async function restoreScanner() {
  const settings = await getStored();
  if (!settings.scanEnabled && !settings.videoScanEnabled) return;
  const imageUsable = await providerIsUsable(settings);
  const videoProvider = settings.videoActiveProvider || "bitmind";
  const videoReadiness = getProviderVerificationState(settings, videoProvider);
  const videoUsable = videoReadiness.state !== "not_configured" && videoReadiness.state !== "invalid";
  if (!imageUsable && !videoUsable) {
    await chrome.storage.local.set({ scanEnabled: false, videoScanEnabled: false });
    return;
  }
  const granted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
  if (granted) {
    try { await registerScanner(); }
    catch (error) { console.warn("Could not restore scanner registration:", error); }
  } else {
    await chrome.storage.local.set({ scanEnabled: false, videoScanEnabled: false });
  }
}

const IMAGE_MENU_ID = "detection-studio-analyze-image";
const VIDEO_MENU_ID = "bitmind-detect-video";  // id kept from the video extension

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let pending = null;
  if (info.menuItemId === IMAGE_MENU_ID && info.srcUrl) pending = { pendingReviewImage: info.srcUrl };
  if (info.menuItemId === VIDEO_MENU_ID && (info.srcUrl || info.linkUrl)) {
    pending = { pendingReviewVideo: info.srcUrl || info.linkUrl };
  }
  if (!pending) return;
  // Issue the write first (the panel reads it on load), but call sidePanel.open in the same
  // tick: it is only allowed while the click's user gesture is still live.
  const written = chrome.storage.local.set(pending);
  if (tab?.id) {
    try { await chrome.sidePanel.open({ tabId: tab.id }); }
    catch (error) { console.warn("Could not open side panel:", error); }
  }
  await written;
});

async function getStored() {
  return chrome.storage.local.get({
    apiKey: "", apiKeyUpdatedAt: 0, activeProvider: "bitmind", customProviderConfig: null,
    scanEnabled: false, recentDetections: [], scanThreshold: "standard",
    zeroTrueApiKey: "", zeroTrueUpdatedAt: 0,
    bitmindVerificationState: "unverified", bitmindVerificationError: null,
    zeroTrueVerificationState: "unverified", zeroTrueVerificationError: null,
    customVerificationState: "unverified", customVerificationError: null,
    videoActiveProvider: "bitmind", videoScanEnabled: true,
    ...MOODYLENS_DEFAULTS,
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
      method: "GET", credentials: "omit", cache: "no-store", redirect: "follow",
      headers: { "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new Error(`Could not fetch image bytes. Grant access to the image host or upload the image directly. (${error.message})`);
  }
  if (!response.ok) throw new Error(`Image host returned HTTP ${response.status}.`);
  let type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_UPLOAD_BYTES) throw new Error("Image exceeds the 8 MB upload limit.");
  const blob = await response.blob();
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("Image exceeds the 8 MB upload limit.");

  // If content-type is generic, infer from URL pathname
  if (!type || !type.startsWith("image/")) {
    const pathname = url.pathname.toLowerCase();
    if (pathname.endsWith(".png")) type = "image/png";
    else if (pathname.endsWith(".webp")) type = "image/webp";
    else if (pathname.endsWith(".gif")) type = "image/gif";
    else type = "image/jpeg";
  }

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

async function callMoodyLensImage(image, settings) {
  // Same byte loading as the Custom provider: data URIs from uploads, public HTTP(S) URLs only.
  const blob = await loadImageBlob(image);
  const result = await MoodyLens.analyzeBlob("image", blob, moodyLensConfig(settings));
  return MoodyLens.toImageResponse(result);
}

async function prepareZeroTrueImageBlob(blob) {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error("The webpage did not provide a usable image file.");
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("Image exceeds the 8 MB ZeroTrue upload limit.");
  }

  const mime = String(blob.type || "").toLowerCase();
  if (mime === "image/jpeg" || mime === "image/png") return { blob, extension: mime === "image/png" ? "png" : "jpg" };
  if (!mime.startsWith("image/")) {
    throw new Error(`The webpage URL did not return image content (received ${mime || "unknown content type"}).`);
  }

  // ZeroTrue's public image detector documents JPG/PNG input. Webpages commonly
  // serve WebP, AVIF, GIF or SVG thumbnails, so rasterize those to JPEG before
  // falling back to file upload. This also avoids misleading MIME/filename pairs.
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") {
    throw new Error(`The image format ${mime} needs browser image conversion, which is unavailable in this context.`);
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
    if (!bitmap.width || !bitmap.height) throw new Error("The image has no decodable dimensions.");
    const maxDimension = 2560;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Could not create an image conversion canvas.");
    context.drawImage(bitmap, 0, 0, width, height);
    const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    if (!jpeg.size) throw new Error("Image conversion produced an empty file.");
    if (jpeg.size > MAX_UPLOAD_BYTES) throw new Error("Converted image exceeds the 8 MB ZeroTrue upload limit.");
    return { blob: jpeg, extension: "jpg" };
  } catch (error) {
    throw new Error(`Could not prepare this webpage image for ZeroTrue: ${error.message || "Image conversion failed"}`);
  } finally {
    bitmap?.close?.();
  }
}

async function callZeroTrueImage(image, apiKey) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error("Add your ZeroTrue API key in settings first.");
  }

  // Automatic webpage detections and manual uploads now share the same official
  // /analyze/file multipart API. Do not send `input.type: image` to /check: that
  // endpoint rejects it (HTTP 422). Download the public page image, normalize
  // unsupported web formats to JPEG, then upload the actual image bytes.
  const blob = await loadImageBlob(image);
  const prepared = await prepareZeroTrueImageBlob(blob);
  const { data, latencyMs } = await callZeroTrueFileApi(
    prepared.blob,
    apiKey,
    `image.${prepared.extension}`
  );
  return normalizeZeroTrueImageResponse(data, latencyMs);
}

async function analyzeImage(image, source, requestedProvider) {
  if (!image || typeof image !== "string") throw new Error("No image URL or image data was supplied.");
  const settings = await getStored();
  const provider = (requestedProvider && IMAGE_PROVIDERS.includes(requestedProvider))
    ? requestedProvider
    : (settings.activeProvider || "bitmind");
  if (!(await providerIsUsable(settings, provider))) throw new Error(providerSetupMessage(provider));

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
    const response = await withApiConcurrencyLimit(() => {
      if (provider === "zerotrue") return callZeroTrueImage(image, settings.zeroTrueApiKey);
      if (provider === "custom") return callCustomProvider(image, settings.customProviderConfig);
      if (provider === MoodyLens.PROVIDER_ID) return callMoodyLensImage(image, settings);
      return callBitMind(image, settings.apiKey);
    });
    const result = { ok: true, response, durationMs: Date.now() - start, cached: false, source, provider };
    if (useCache) {
      cache.set(cacheKey, { time: Date.now(), result });
      await writePersistentCache(image, cacheKey, result);
    }

    const item = {
      time: Date.now(), provider: response.provider, providerName: response.providerName,
      model: response.model, isAI: response.isAI, verdict: response.verdict,
      confidence: response.confidence, similarity: response.similarity, source
    };
    await serializedStorageUpdate(async () => {
      const { recentDetections } = await getStored();
      const history = Array.isArray(recentDetections) ? recentDetections : [];
      await chrome.storage.local.set({ recentDetections: [item, ...history].slice(0, 30) });
    });
    return result;
  })();
  inFlight.set(cacheKey, task);
  try { return await task; }
  finally { inFlight.delete(cacheKey); }
}

async function getProviderPublicStatus(settings) {
  const activeProvider = settings.activeProvider || "bitmind";
  const videoActiveProvider = settings.videoActiveProvider || "bitmind";
  const imageReadiness = getProviderVerificationState(settings, activeProvider);
  const videoReadiness = getProviderVerificationState(settings, videoActiveProvider);
  const bitmindReadiness = getProviderVerificationState(settings, "bitmind");
  const zeroTrueReadiness = getProviderVerificationState(settings, "zerotrue");
  const customReadiness = getProviderVerificationState(settings, "custom");
  const moodyLensReadiness = getProviderVerificationState(settings, MoodyLens.PROVIDER_ID);

  return {
    activeProvider,
    videoActiveProvider,
    imageReadiness,
    videoReadiness,
    bitmindReadiness,
    zeroTrueReadiness,
    customReadiness,
    moodyLensReadiness,
    activeProviderConfigured: imageReadiness.state !== "not_configured" && imageReadiness.state !== "invalid",
    activeProviderVerified: imageReadiness.state === "verified",
    videoProviderConfigured: videoReadiness.state !== "not_configured" && videoReadiness.state !== "invalid",
    videoProviderVerified: videoReadiness.state === "verified",
    bitmindConfigured: bitmindReadiness.state !== "not_configured",
    zeroTrueConfigured: zeroTrueReadiness.state !== "not_configured",
    customConfigured: customReadiness.state !== "not_configured",
    customProviderName: settings.customProviderConfig?.name || "Custom REST API",
    moodyLensConfigured: moodyLensReadiness.state !== "not_configured",
    scanEnabled: Boolean(settings.scanEnabled),
    videoScanEnabled: settings.videoScanEnabled !== false,
    scanThreshold: settings.scanThreshold || "standard"
  };
}

async function getScannerSettings() {
  const settings = await getStored();
  const activeProvider = settings.activeProvider || "bitmind";
  const videoActiveProvider = settings.videoActiveProvider || "bitmind";
  const imageReadiness = getProviderVerificationState(settings, activeProvider);
  const videoReadiness = getProviderVerificationState(settings, videoActiveProvider);
  return {
    scanEnabled: Boolean(settings.scanEnabled),
    videoScanEnabled: settings.videoScanEnabled !== false,
    scanThreshold: settings.scanThreshold || "standard",
    activeProvider,
    videoActiveProvider,
    imageReadiness,
    videoReadiness,
    providerConfigured: imageReadiness.state !== "not_configured" && imageReadiness.state !== "invalid",
    providerVerified: imageReadiness.state === "verified",
    videoProviderConfigured: videoReadiness.state !== "not_configured" && videoReadiness.state !== "invalid",
    videoProviderVerified: videoReadiness.state === "verified",
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

// ==================================================================
// VIDEO DEEPFAKE DETECTION (from backend_for_video_testing)
// ==================================================================
// Storage: videoActiveProvider, videoCustomProviderConfig, videoDetectionCache,
// videoDetectionHistory, hoverScanEnabled, autoScanOnHover, hoverDelayMs, pendingReviewVideo.
// Shared with image: apiKey / apiKeyUpdatedAt (one BitMind key) and the moodyLens* server config.

const VIDEO_PROVIDERS = ["bitmind", "zerotrue", "custom", MoodyLens.PROVIDER_ID];
const BITMIND_VIDEO_ENDPOINT = "https://api.bitmind.ai/oracle/v1/34/detect-video";
const BITMIND_VIDEO_UPLOAD_URL_ENDPOINT = "https://api.bitmind.ai/oracle/v1/34/get-video-upload-url";
const BITMIND_VIDEO_DIRECT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // API Gateway direct-upload limit
const BITMIND_VIDEO_MAX_BYTES = 200 * 1024 * 1024; // documented presigned-upload limit
const VIDEO_REQUEST_TIMEOUT_MS = 60000;
const VIDEO_MAX_FRAMES = 3;
const VIDEO_MAX_CACHE = 150;
const VIDEO_MAX_HISTORY = 250;
// chrome.storage.local holds ~10 MB for image + audio + video together: frame thumbnails
// (data URIs) are kept only for the newest history items, and never in the result cache.
const VIDEO_HISTORY_THUMBNAILS = 50;
const VIDEO_MAX_THUMBNAIL_CHARS = 48 * 1024;
const videoMemoryCache = new Map();
const videoInFlight = new Map();
const withVideoConcurrencyLimit = makeConcurrencyLimiter(3);

async function getVideoSettings() {
  return chrome.storage.local.get({
    apiKey: "", apiKeyUpdatedAt: 0,
    zeroTrueApiKey: "", zeroTrueUpdatedAt: 0,
    videoActiveProvider: "bitmind", videoCustomProviderConfig: null,
    hoverScanEnabled: true, autoScanOnHover: true, hoverDelayMs: 400,
    ...MOODYLENS_DEFAULTS,
  });
}

function videoProviderVersion(settings, provider) {
  if (provider === "zerotrue") return settings.zeroTrueUpdatedAt || (settings.zeroTrueApiKey ? 1 : 0);
  if (provider === "custom") return settings.videoCustomProviderConfig?.updatedAt || 0;
  if (provider === MoodyLens.PROVIDER_ID) return settings.moodyLensUpdatedAt || 0;
  return settings.apiKeyUpdatedAt || 0;
}

async function videoProviderIsUsable(settings, provider = settings.videoActiveProvider) {
  const readiness = getProviderVerificationState(settings, provider);
  if (readiness.state === "not_configured" || readiness.state === "invalid") return false;
  if (provider === "zerotrue") return true;
  if (provider === "bitmind") return true;
  if (provider === MoodyLens.PROVIDER_ID) return MoodyLens.serverIsUsable(moodyLensConfig(settings));
  if (provider === "custom") {
    try {
      const config = VideoProviderEngine.validateCustomConfig(settings.videoCustomProviderConfig);
      return await chrome.permissions.contains({ origins: [`${new URL(config.endpoint).origin}/*`] });
    } catch (_) {
      return false;
    }
  }
  return false;
}

function videoSetupMessage(provider, settings) {
  const readiness = settings ? getProviderVerificationState(settings, provider) : null;
  if (readiness?.state === "invalid") {
    const errText = readiness.error ? ` (${readiness.error})` : "";
    if (provider === "zerotrue") return `ZeroTrue API key failed validation${errText}. Update your key in Settings → Providers.`;
    if (provider === "bitmind") return `BitMind API key failed validation${errText}. Update your key in Settings → Providers.`;
    if (provider === MoodyLens.PROVIDER_ID) return `Mad-Eye Moody Lens server failed validation${errText}. Update address in Settings.`;
    return `Custom Video REST API failed validation${errText}. Update configuration in Settings.`;
  }
  if (provider === "zerotrue") return "ZeroTrue is not configured. Add your API key in Settings → Providers to enable detection.";
  if (provider === "custom") return "Configure the Custom Video REST API and grant its API host permission in settings.";
  if (provider === MoodyLens.PROVIDER_ID) return "Set the Mad-Eye Moody Lens server address in settings and allow the extension to reach it.";
  return "BitMind is not configured. Add your API key in Settings → Providers to enable detection.";
}

function isPublicHttpUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password && !isPrivateOrLocalHostname(url.hostname);
  } catch (_) {
    return false;
  }
}

/** Captured frames as [{dataUri, timestamp}], newest API first: payload.frames, else payload.frameDataUri. */
function videoFrames(payload) {
  const isImageData = value => typeof value === "string" && value.startsWith("data:image/");
  const frames = Array.isArray(payload.frames)
    ? payload.frames.filter(frame => isImageData(frame?.dataUri))
    : [];
  if (!frames.length && isImageData(payload.frameDataUri)) {
    frames.push({ dataUri: payload.frameDataUri, timestamp: payload.timestamp ?? 0 });
  }
  return frames.slice(0, VIDEO_MAX_FRAMES);
}

function dataUriToBlob(dataUri, maxBytes) {
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUri);
  if (!match) throw new Error("The captured frame is not a valid Base64 data URL.");
  const binary = atob(match[2].replace(/\s/g, ""));
  if (binary.length > maxBytes) throw new Error(`The captured frame exceeds the ${Math.round(maxBytes / 1048576)} MB limit.`);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

/** Stable cache identity: the public URL, a caller-supplied hash, or a SHA-256 of the frames. */
async function videoCacheIdentity(payload) {
  if (typeof payload.videoUrl === "string" && /^https?:\/\//i.test(payload.videoUrl) && payload.videoUrl.length <= 4096) {
    return `url:${payload.videoUrl}`;
  }
  if (typeof payload.cacheHash === "string" && /^[\w:.-]{8,128}$/.test(payload.cacheHash)) return `hash:${payload.cacheHash}`;
  // Hash ALL frame bytes. The old key (the first 100 characters of the data URI) is the same
  // JPEG header for almost every frame, so different videos collided and got each other's verdict.
  const frames = videoFrames(payload);
  if (frames.length) return `frames:${await sha256Hex(frames.map(frame => frame.dataUri).join("|"))}`;
  return null;
}

async function callCustomVideoProvider(payload, rawConfig) {
  const config = VideoProviderEngine.validateCustomConfig(rawConfig);
  const headers = new Headers(JSON.parse(config.additionalHeaders || "{}"));
  if (config.authType === "bearer") headers.set("Authorization", `Bearer ${config.apiKey.trim()}`);
  if (config.authType === "header") headers.set(config.authHeaderName.trim(), config.apiKey.trim());

  const frameUri = videoFrames(payload)[0]?.dataUri || null;
  // Same rule as the image engine: private/local URLs are never sent to a remote provider.
  const publicUrl = payload.videoUrl && isPublicHttpUrl(payload.videoUrl) ? payload.videoUrl : null;
  const modelFields = config.modelId && config.modelField ? { [config.modelField]: config.modelId } : {};
  let body;

  if (config.videoTransport === "url_json" || config.videoTransport === "base64_json") {
    const target = config.videoTransport === "url_json" ? (publicUrl || frameUri) : (frameUri || publicUrl);
    if (!target) throw new Error("This video has no public URL or captured frame to send to the provider.");
    headers.set("Content-Type", "application/json");
    body = JSON.stringify({ [config.videoField]: target, ...modelFields });
  } else if (config.videoTransport === "multipart") {
    const form = new FormData();
    if (frameUri) form.append(config.videoField, dataUriToBlob(frameUri, MAX_UPLOAD_BYTES), "frame.jpg");
    else if (publicUrl) form.append(config.videoField, publicUrl);
    else throw new Error("This video has no public URL or captured frame to send to the provider.");
    for (const [name, value] of Object.entries(modelFields)) form.append(name, value);
    body = form;
  } else {
    // binary: the captured frame's own bytes and type (the old code sent the data-URI *text* as video/mp4).
    if (!frameUri) throw new Error("Binary transport needs a captured frame. Play the video for a moment and scan again.");
    const blob = dataUriToBlob(frameUri, MAX_UPLOAD_BYTES);
    headers.set("Content-Type", blob.type || "application/octet-stream");
    if (config.modelId && config.modelHeaderName) headers.set(config.modelHeaderName, config.modelId);
    body = blob;
  }

  const response = await fetch(config.endpoint, {
    method: "POST", headers, body, credentials: "omit", redirect: "error",
    signal: AbortSignal.timeout(VIDEO_REQUEST_TIMEOUT_MS)
  });
  const rawData = await readJsonResponse(response, config.name);
  return VideoProviderEngine.normalizeCustomResponse(rawData, config);
}

function safeVideoReferrer(value) {
  if (!isPublicHttpUrl(value)) return "";
  try {
    const referrer = new URL(value);
    referrer.username = "";
    referrer.password = "";
    referrer.hash = "";
    // Only the origin is sent cross-site by the policy below. Strip query strings
    // up front as an additional privacy guard for signed/player-page URLs.
    referrer.search = "";
    return referrer.href;
  } catch (_) {
    return "";
  }
}

async function fetchPublicVideo(url, options = {}) {
  if (!isPublicHttpUrl(url)) throw new Error("Enter a public HTTP or HTTPS video URL.");
  let response;
  const useBrowserSession = options.includeSession === true;
  const referrer = useBrowserSession ? safeVideoReferrer(options.referrerUrl) : "";
  try {
    // BitMind URL uploads may point to sources that require the user's signed-in
    // browser session or an originating-page referrer. Only the BitMind path opts
    // into credentials, after the user grants permission for this exact media host.
    // Cookies are sent only to that host; cross-site referrers are reduced to origin.
    response = await fetch(url, {
      method: "GET", credentials: useBrowserSession ? "include" : "omit", cache: "no-store", redirect: "follow",
      ...(referrer ? { referrer, referrerPolicy: "strict-origin-when-cross-origin" } : { referrerPolicy: "no-referrer" }),
      signal: AbortSignal.timeout(180000)
    });
  } catch (error) {
    const detail = error?.message || String(error);
    if (/permission|host permission|access.*denied|failed to fetch/i.test(detail)) {
      throw new Error(`Chrome could not download this video from ${new URL(url).origin}. Grant access to that site and retry. (${detail})`);
    }
    throw new Error(`Could not download the video URL: ${detail}`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(`The video host denied the download (HTTP ${response.status}). The URL may require a signed-in browser session, a valid download token, or an originating-page referrer. Chrome site permission cannot override a server-side denial. Download the video from its source while signed in, then drop the saved video file into the extension.`);
  }
  if (!response.ok) throw new Error(`Video host returned HTTP ${response.status}.`);
  if (response.url && !isPublicHttpUrl(response.url)) {
    throw new Error("The video URL redirected to a private or unsupported address.");
  }
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const path = new URL(response.url || url).pathname.toLowerCase();
  const hasVideoExtension = /\.(mp4|m4v|mov|avi|mkv|webm|wmv)$/.test(path);
  if (!type.startsWith("video/") && !["application/octet-stream", "application/mp4", "binary/octet-stream"].includes(type) && !hasVideoExtension) {
    throw new Error(`The URL returned ${type || "an unknown content type"}, not a video file. Use a direct downloadable MP4, MOV, AVI, MKV, WebM, or WMV URL.`);
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > BITMIND_VIDEO_MAX_BYTES) throw new Error("The video is larger than BitMind's 200 MB upload limit.");
  const blob = await response.blob();
  if (!blob.size) throw new Error("The video URL returned an empty file.");
  if (blob.size > BITMIND_VIDEO_MAX_BYTES) throw new Error("The video is larger than BitMind's 200 MB upload limit.");
  return blob;
}

function bitMindVideoFileInfo(filename, blob) {
  const cleanName = String(filename || "video.mp4").split(/[\\/]/).pop().replace(/[^a-z0-9._-]/gi, "_").slice(0, 120) || "video.mp4";
  let ext = (cleanName.split(".").pop() || "").toLowerCase();
  const mimeByExt = {
    mp4: "video/mp4", m4v: "video/x-m4v", mov: "video/quicktime", avi: "video/x-msvideo",
    mkv: "video/x-matroska", webm: "video/webm", wmv: "video/x-ms-wmv"
  };
  if (!mimeByExt[ext]) {
    const mime = String(blob?.type || "").toLowerCase();
    const match = Object.entries(mimeByExt).find(([, value]) => value === mime);
    ext = match?.[0] || "mp4";
  }
  return { filename: /\.[a-z0-9]{2,5}$/i.test(cleanName) ? cleanName : `${cleanName}.${ext}`, ext, contentType: mimeByExt[ext] || blob?.type || "video/mp4" };
}

function bitMindAuthHeaders(apiKey, contentType = "") {
  const headers = {
    Authorization: `Bearer ${String(apiKey || "").trim()}`,
    "x-bitmind-application": "oracle-api"
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

function requireBitMindVideoVerdict(raw, sourceLabel) {
  const normalized = VideoProviderEngine.normalizeBitMindResponse(raw);
  if (typeof normalized.isAI !== "boolean") {
    throw new Error(`${sourceLabel} succeeded but did not return a Boolean AI verdict. The result was not classified as authentic or AI-generated.`);
  }
  return normalized;
}

async function callBitMindVideoUrl(videoUrl, apiKey) {
  const response = await fetch(BITMIND_VIDEO_ENDPOINT, {
    method: "POST", headers: bitMindAuthHeaders(apiKey, "application/json"), credentials: "omit", redirect: "error",
    body: JSON.stringify({ video: videoUrl, rich: true }),
    signal: AbortSignal.timeout(180000)
  });
  const data = await readJsonResponse(response, "BitMind Video URL");
  return requireBitMindVideoVerdict(data, "BitMind Video URL analysis");
}

async function callBitMindVideoBlob(blob, filename, apiKey) {
  if (!(blob instanceof Blob)) throw new Error("The selected video could not be read as a file.");
  if (!blob.size) throw new Error("The selected video file is empty.");
  if (blob.size > BITMIND_VIDEO_MAX_BYTES) throw new Error("BitMind supports video uploads up to 200 MB.");
  const fileInfo = bitMindVideoFileInfo(filename, blob);
  const authHeaders = bitMindAuthHeaders(apiKey);

  // BitMind documents direct multipart uploads for files up to 10 MB.
  if (blob.size <= BITMIND_VIDEO_DIRECT_UPLOAD_MAX_BYTES) {
    const form = new FormData();
    form.append("video", blob, fileInfo.filename);
    form.append("rich", "true");
    const response = await fetch(BITMIND_VIDEO_ENDPOINT, {
      method: "POST", headers: authHeaders, body: form, credentials: "omit", redirect: "error",
      signal: AbortSignal.timeout(180000)
    });
    const data = await readJsonResponse(response, "BitMind Video Upload");
    return requireBitMindVideoVerdict(data, "BitMind video upload");
  }

  // Larger videos use BitMind's documented three-stage S3 flow:
  // request a presigned upload, POST its exact fields + file to S3, then detect the S3 videoUrl.
  const presignResponse = await fetch(BITMIND_VIDEO_UPLOAD_URL_ENDPOINT, {
    method: "POST", headers: bitMindAuthHeaders(apiKey, "application/json"), credentials: "omit", redirect: "error",
    body: JSON.stringify({ filename: fileInfo.filename, contentType: fileInfo.contentType }),
    signal: AbortSignal.timeout(60000)
  });
  const presign = await readJsonResponse(presignResponse, "BitMind Video Upload Setup");
  if (!presign?.url || !presign?.videoUrl || !presign?.fields || typeof presign.fields !== "object") {
    throw new Error("BitMind returned incomplete presigned-upload details.");
  }
  const s3Form = new FormData();
  for (const [name, value] of Object.entries(presign.fields)) {
    if (value !== undefined && value !== null) s3Form.append(name, String(value));
  }
  s3Form.append("file", blob, fileInfo.filename);
  const uploadResponse = await fetch(presign.url, {
    method: "POST", body: s3Form, credentials: "omit", redirect: "error",
    signal: AbortSignal.timeout(180000)
  });
  if (!uploadResponse.ok) {
    const detail = (await uploadResponse.text().catch(() => "")).slice(0, 350);
    throw new Error(`BitMind's temporary video upload failed (HTTP ${uploadResponse.status})${detail ? `: ${detail}` : "."}`);
  }

  const detectResponse = await fetch(BITMIND_VIDEO_ENDPOINT, {
    method: "POST", headers: bitMindAuthHeaders(apiKey, "application/json"), credentials: "omit", redirect: "error",
    body: JSON.stringify({ video: presign.videoUrl, rich: true, startTime: 0, fps: 30 }),
    signal: AbortSignal.timeout(180000)
  });
  const data = await readJsonResponse(detectResponse, "BitMind Video Detection");
  return requireBitMindVideoVerdict(data, "BitMind video detection");
}

async function callBitMindVideo(payload, apiKey) {
  if (!String(apiKey || "").trim()) throw new Error("BitMind API key is not configured.");

  let lastWholeVideoError = null;
  const frames = videoFrames(payload);

  // Local File/Blob payloads are supported for direct upload. If the runtime message
  // cannot carry the File object, the captured-frame path below remains available.
  if (payload.videoFileIsVideo && payload.videoFile instanceof Blob) {
    try {
      return await callBitMindVideoBlob(payload.videoFile, payload.videoFileName || "video.mp4", apiKey);
    } catch (error) {
      lastWholeVideoError = error;
      if (!frames.length) throw error;
      console.warn("BitMind whole-video upload failed; trying captured frames:", error.message);
    }
  }

  if (payload.videoUrl && isPublicHttpUrl(payload.videoUrl)) {
    if (!isBitMindSupportedVideoUrl(payload.videoUrl) && !frames.length) {
      throw new Error("BitMind video detection currently supports X/Twitter, TikTok, Facebook video URLs, and uploaded video files. Other video URLs are not supported.");
    }
    let videoBlob = null;
    try {
      videoBlob = await fetchPublicVideo(payload.videoUrl, { referrerUrl: payload.referrerUrl, includeSession: true });
    } catch (downloadError) {
      lastWholeVideoError = downloadError;
      console.warn("Could not download the video in the extension:", downloadError.message);

      // This can work when the URL is already a provider-accessible/presigned object URL.
      // It is not the primary path for arbitrary media links; those are uploaded as bytes.
      try { return await callBitMindVideoUrl(payload.videoUrl, apiKey); }
      catch (providerUrlError) {
        const isForbidden = /HTTP 403|HTTP 401|denied the download/i.test(downloadError.message);
        lastWholeVideoError = new Error(isForbidden
          ? `${downloadError.message} BitMind's server-side URL analysis also failed: ${providerUrlError.message}`
          : `Video download failed: ${downloadError.message}. BitMind's URL request also failed: ${providerUrlError.message}`);
      }
    }

    if (videoBlob) {
      const filename = bitMindVideoFileInfo(new URL(payload.videoUrl).pathname, videoBlob).filename;
      try {
        return await callBitMindVideoBlob(videoBlob, filename, apiKey);
      } catch (uploadError) {
        lastWholeVideoError = uploadError;
        if (!frames.length) throw uploadError;
        console.warn("BitMind file upload failed; trying captured frames:", uploadError.message);
      }
    }
  }

  if (!frames.length) {
    if (lastWholeVideoError) {
      const isForbidden = /HTTP 403|HTTP 401|denied the download/i.test(lastWholeVideoError.message);
      throw new Error(isForbidden
        ? `${lastWholeVideoError.message} This is an access restriction at the video source, not a BitMind detection result. Download the video from the original website using your browser session, then drag the saved file into the Video tab.`
        : `${lastWholeVideoError.message} For direct video URLs, allow Chrome site access when prompted and use a publicly downloadable video file (not a watch/player page).`);
    }
    throw new Error("No video file or captured frame was available. Enter a direct downloadable video URL, upload a video, or scan while the video is playing in a tab.");
  }

  const postFrame = async frameDataUri => {
    const response = await fetch(API_ENDPOINT, {
      method: "POST", headers: bitMindAuthHeaders(apiKey, "application/json"), credentials: "omit", redirect: "error",
      body: JSON.stringify({ image: frameDataUri, rich: true }),
      signal: AbortSignal.timeout(VIDEO_REQUEST_TIMEOUT_MS)
    });
    const normalized = VideoProviderEngine.normalizeBitMindResponse(await readJsonResponse(response, "BitMind Frame"));
    if (typeof normalized.isAI !== "boolean") throw new Error("BitMind frame response did not contain a Boolean isAI result.");
    return normalized;
  };

  if (frames.length > 1) {
    const frameResults = [];
    for (const frame of frames) {
      try {
        const norm = await postFrame(frame.dataUri);
        frameResults.push({ timestamp: frame.timestamp, isAI: norm.isAI, confidence: norm.confidence });
      } catch (err) {
        console.warn("Error scanning frame at " + frame.timestamp, err);
      }
    }
    if (frameResults.length > 0) {
      const aiCount = frameResults.filter(f => f.isAI).length;
      const avgConfidence = frameResults.reduce((acc, f) => acc + (f.confidence || 0.5), 0) / frameResults.length;
      const isAI = aiCount >= (frameResults.length / 2);
      return {
        provider: "bitmind", providerName: "BitMind Video Oracle", model: "BitMind Video Multi-Frame Analysis",
        isAI, confidence: Number(avgConfidence.toFixed(4)), similarity: null,
        verdict: VideoProviderEngine.verdictFor(isAI, avgConfidence), frameBreakdown: frameResults,
        explanation: isAI
          ? `Deepfake artifacts detected across ${aiCount}/${frameResults.length} analyzed video frames.`
          : `Video evaluated as authentic across ${frameResults.length} sampled frames.`,
        rawResponse: { frameResults }
      };
    }
  }

  if (frames.length === 1) return postFrame(frames[0].dataUri);
  throw new Error(lastWholeVideoError?.message || "BitMind could not analyse the video. No video file or usable frame was available.");
}

async function callMoodyLensVideo(payload, settings) {
  const cfg = moodyLensConfig(settings);
  const frames = videoFrames(payload);
  // Whole file first (24 frames + soundtrack on the server); captured frames as the fallback.
  if (payload.videoUrl && isPublicHttpUrl(payload.videoUrl)) {
    try {
      const blob = await fetchPublicVideo(payload.videoUrl);
      return MoodyLens.toVideoResponse(await MoodyLens.analyzeVideoBlob(blob, cfg));
    } catch (error) {
      if (!frames.length) throw error;
      console.warn("Whole-video analysis unavailable, using captured frames:", error.message);
    }
  }
  if (!frames.length) {
    throw new Error("No downloadable video or captured frame to analyse. Play the video for a moment and scan again.");
  }
  const results = [];
  for (const frame of frames) {
    const blob = dataUriToBlob(frame.dataUri, MoodyLens.MAX_BYTES.image);
    results.push({ timestamp: frame.timestamp, result: await MoodyLens.analyzeBlob("image", blob, cfg) });
  }
  return MoodyLens.framesToVideoResponse(results);
}

async function callZeroTrueVideo(payload, apiKey) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error("Add your ZeroTrue API key in settings first.");
  }
  const cleanKey = String(apiKey).trim();

  // Uploaded side-panel files use the documented /analyze/file route.
  if (payload.videoFileIsVideo && payload.videoFile instanceof Blob) {
    const fileBlob = payload.videoFile;
    if (fileBlob.size > MoodyLens.MAX_BYTES.video) throw new Error("Video exceeds the 100 MB upload limit.");
    const filename = String(payload.videoFileName || "video.mp4").replace(/[^a-z0-9._-]/gi, "_");
    const ext = (filename.split(".").pop() || "mp4").toLowerCase();
    const { data, latencyMs } = await callZeroTrueFileApi(fileBlob, cleanKey, `video.${ext}`, 300000);
    return normalizeZeroTrueVideoResponse(data, latencyMs);
  }

  let urlAnalysisError = null;
  // For a public URL, let ZeroTrue fetch the original media using its documented
  // /analyze/url route. This avoids browser CORS, redirects, range-request, and
  // cross-origin download failures common with CDN/video hosts.
  if (payload.videoUrl && isPublicHttpUrl(payload.videoUrl)) {
    try {
      const { data, latencyMs } = await callZeroTrueUrlApi(payload.videoUrl, cleanKey, 300000);
      return normalizeZeroTrueVideoResponse(data, latencyMs);
    } catch (error) {
      urlAnalysisError = error;
      console.warn("ZeroTrue URL analysis failed; trying browser download + file upload:", error.message);
    }

    // Fallback for valid downloadable video URLs if ZeroTrue's URL fetcher cannot
    // retrieve the source. File uploads still use the known-working file endpoint.
    try {
      const blob = await fetchPublicVideo(payload.videoUrl);
      const path = new URL(payload.videoUrl).pathname;
      const pathExt = (path.split(".").pop() || "").toLowerCase();
      const mimeExt = (blob.type.split("/")[1] || "").toLowerCase();
      const ext = (/^(mp4|mov|avi|mkv|webm)$/.test(pathExt) ? pathExt : mimeExt)
        .replace(/[^a-z0-9.+-]/gi, "") || "mp4";
      const { data, latencyMs } = await callZeroTrueFileApi(blob, cleanKey, `video.${ext}`, 300000);
      return normalizeZeroTrueVideoResponse(data, latencyMs);
    } catch (error) {
      urlAnalysisError = new Error(`URL analysis failed (${urlAnalysisError.message}); browser download/upload fallback failed (${error.message}).`);
      console.warn("ZeroTrue video URL fallback failed:", error.message);
    }
  }

  // When the user is scanning a video playing in a tab, frame-based analysis is
  // still available. A pasted webpage URL cannot produce frames by itself.
  const frames = videoFrames(payload);
  if (!frames.length) {
    if (urlAnalysisError) {
      throw new Error(`${urlAnalysisError.message} ZeroTrue URL scans require a direct, publicly accessible media-file URL with a supported extension (MP4, MOV, AVI, MKV, or WebM). Streaming/watch-page URLs must be scanned from their playing video instead.`);
    }
    throw new Error("Enter a direct public video-file URL (MP4, MOV, AVI, MKV, or WebM), or scan a video while it is playing in a webpage so frames can be captured.");
  }

  if (frames.length > 1) {
    const frameResults = [];
    for (const frame of frames) {
      try {
        const frameBlob = dataUriToBlob(frame.dataUri, MAX_UPLOAD_BYTES);
        const { data, latencyMs } = await callZeroTrueFileApi(frameBlob, cleanKey, "frame.jpg");
        const norm = normalizeZeroTrueImageResponse(data, latencyMs);
        frameResults.push({ timestamp: frame.timestamp, isAI: norm.isAI, confidence: norm.confidence });
      } catch (err) {
        console.warn("Error scanning frame with ZeroTrue at " + frame.timestamp, err);
      }
    }
    if (frameResults.length > 0) {
      const aiCount = frameResults.filter(f => f.isAI).length;
      const avgConfidence = frameResults.reduce((acc, f) => acc + (f.confidence || 0.5), 0) / frameResults.length;
      const isAI = aiCount >= (frameResults.length / 2);
      const confidence = Number(avgConfidence.toFixed(4));
      return {
        provider: "zerotrue",
        providerName: "ZeroTrue Video AI",
        model: "ZeroTrue Multi-Frame AI Detector",
        isAI,
        confidence,
        similarity: null,
        verdict: confidence < 0.58 ? "uncertain" : (isAI ? "likely_ai" : "likely_not_ai"),
        frameBreakdown: frameResults,
        explanation: isAI
          ? `Deepfake artifacts detected across ${aiCount}/${frameResults.length} analyzed video frames.`
          : `Video evaluated as authentic across ${frameResults.length} sampled frames.`,
        rawResponse: { frameResults }
      };
    }
    if (urlAnalysisError) throw new Error(`${urlAnalysisError.message} Frame-based fallback also failed: no frames could be analysed.`);
    throw new Error("ZeroTrue could not analyse any captured video frames. Try scanning again while the video is playing.");
  }

  const singleBlob = dataUriToBlob(frames[0].dataUri, MAX_UPLOAD_BYTES);
  const { data, latencyMs } = await callZeroTrueFileApi(singleBlob, cleanKey, "frame.jpg");
  return normalizeZeroTrueVideoResponse(data, latencyMs);
}

function safeSourceUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value) && value.length <= 2048 ? value : "";
}

async function saveVideoHistory(record) {
  return serializedStorageUpdate(async () => {
    try {
      const { videoDetectionHistory = [] } = await chrome.storage.local.get("videoDetectionHistory");
      const thumbnail = typeof record.thumbnail === "string" && record.thumbnail.length <= VIDEO_MAX_THUMBNAIL_CHARS
        ? record.thumbnail : "";
      const item = {
        id: "scan_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        timestamp: Date.now(),
        dateFormatted: new Date().toLocaleString(),
        title: record.title || "Web Video",
        sourceUrl: record.sourceUrl || "",
        thumbnail,
        verdict: record.verdict,
        isAI: record.isAI,
        confidence: record.confidence,
        model: record.model,
        provider: record.provider,
        providerName: record.providerName,
        type: record.scanType || "hover_scan",
        duration: record.videoDuration || null,
        explanation: record.explanation || ""
      };
      const updated = [item, ...videoDetectionHistory.filter(h => h.sourceUrl !== item.sourceUrl || item.sourceUrl === "")]
        .slice(0, VIDEO_MAX_HISTORY)
        .map((h, i) => (i < VIDEO_HISTORY_THUMBNAILS || !h.thumbnail ? h : { ...h, thumbnail: "" }));
      await chrome.storage.local.set({ videoDetectionHistory: updated });
      return item;
    } catch (err) {
      console.warn("Could not save to history:", err);
      return null;
    }
  });
}

async function writeVideoCache(cacheKey, result) {
  // The cache stores the verdict only: no thumbnail, no raw provider response.
  const { thumbnail: _thumbnail, rawResponse: _raw, ...data } = result;
  const entry = { data, cachedAt: Date.now() };
  videoMemoryCache.set(cacheKey, entry);
  while (videoMemoryCache.size > VIDEO_MAX_CACHE) videoMemoryCache.delete(videoMemoryCache.keys().next().value);
  return serializedStorageUpdate(async () => {
    const { videoDetectionCache = {} } = await chrome.storage.local.get("videoDetectionCache");
    const now = Date.now();
    const kept = Object.entries({ ...videoDetectionCache, [cacheKey]: entry })
      .filter(([, value]) => value && now - value.cachedAt <= CACHE_TTL_MS)
      .sort((a, b) => b[1].cachedAt - a[1].cachedAt)
      .slice(0, VIDEO_MAX_CACHE);
    await chrome.storage.local.set({ videoDetectionCache: Object.fromEntries(kept) });
  });
}

async function readVideoCache(cacheKey) {
  const memory = videoMemoryCache.get(cacheKey);
  if (memory && Date.now() - memory.cachedAt < CACHE_TTL_MS) return memory;
  const { videoDetectionCache = {} } = await chrome.storage.local.get("videoDetectionCache");
  const saved = videoDetectionCache[cacheKey];
  if (saved && Date.now() - saved.cachedAt < CACHE_TTL_MS) {
    videoMemoryCache.set(cacheKey, saved);
    return saved;
  }
  return null;
}

async function scanVideo(payload, sender) {
  if (!payload || typeof payload !== "object") throw new Error("No video was supplied for analysis.");
  const settings = await getVideoSettings();
  const provider = (payload?.provider && VIDEO_PROVIDERS.includes(payload.provider))
    ? payload.provider
    : settings.videoActiveProvider;
  if (!(await videoProviderIsUsable(settings, provider))) throw new Error(videoSetupMessage(provider));

  const identity = await videoCacheIdentity(payload);
  const cacheKey = identity ? `${provider}:${videoProviderVersion(settings, provider)}:${identity}` : null;
  if (cacheKey) {
    const cached = await readVideoCache(cacheKey);
    if (cached) return { ...cached.data, fromCache: true };
    if (videoInFlight.has(cacheKey)) return await videoInFlight.get(cacheKey);
  }

  // The limiter wraps the provider call itself (it used to wrap an already-started promise,
  // so it never limited anything).
  const task = withVideoConcurrencyLimit(async () => {
    const startTime = Date.now();
    let result;
    if (provider === "zerotrue") result = await callZeroTrueVideo(payload, settings.zeroTrueApiKey);
    else if (provider === "custom") result = await callCustomVideoProvider(payload, settings.videoCustomProviderConfig);
    else if (provider === MoodyLens.PROVIDER_ID) result = await callMoodyLensVideo(payload, settings);
    else result = await callBitMindVideo(payload, settings.apiKey);

    result.durationMs = Date.now() - startTime;
    result.title = String(payload.title || sender?.tab?.title || "Web Video").slice(0, 300);
    // blob:/data: player URLs are meaningless later; record the page instead.
    result.sourceUrl = safeSourceUrl(payload.videoUrl) || safeSourceUrl(sender?.tab?.url);
    result.thumbnail = payload.thumbnail || payload.frameDataUri || "";
    result.scanType = payload.scanType || "hover_scan";
    result.videoDuration = payload.videoDuration;

    await saveVideoHistory(result);
    if (cacheKey) await writeVideoCache(cacheKey, result);
    return result;
  });

  if (cacheKey) videoInFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    if (cacheKey) videoInFlight.delete(cacheKey);
  }
}

async function loadBundledTestFrame() {
  // The video extension shipped assets/test-frame.png; the image extension assets/provider-test-image.png.
  for (const path of ["assets/test-frame.png", "assets/provider-test-image.png"]) {
    try {
      const asset = await fetch(chrome.runtime.getURL(path));
      if (asset.ok) return await blobToDataUri(await asset.blob());
    } catch (_) {}
  }
  throw new Error("Could not load the bundled provider test image.");
}

function requireExtensionPage(sender) {
  if (!isExtensionPage(sender)) throw new Error("This action is available only inside the extension.");
}

// Old names from the standalone video extension still work, except GET_HISTORY, which is the
// image history: video UIs must use VIDEO_GET_HISTORY.
const VIDEO_MESSAGE_ALIASES = {
  PING: "VIDEO_PING",
  CHECK_PROVIDER_CONFIG: "VIDEO_CHECK_PROVIDER_CONFIG",
  TEST_PROVIDER_KEY: "VIDEO_TEST_PROVIDER_KEY",
  CLEAR_HISTORY: "VIDEO_CLEAR_HISTORY",
  DELETE_HISTORY_ITEM: "VIDEO_DELETE_HISTORY_ITEM",
  OPEN_SIDEPANEL: "VIDEO_OPEN_SIDEPANEL",
};

// Every handler answers {ok: true, data} or {ok: false, error}, as the video UI expects.
const VIDEO_HANDLERS = {
  async VIDEO_PING() {
    const settings = await getVideoSettings();
    return {
      status: "ready",
      hoverScanEnabled: settings.hoverScanEnabled,
      autoScanOnHover: settings.autoScanOnHover,
      hoverDelayMs: settings.hoverDelayMs,
      activeProvider: settings.videoActiveProvider,
      hasKey: Boolean(String(settings.apiKey || "").trim())
    };
  },

  async VIDEO_CHECK_PROVIDER_CONFIG() {
    const settings = await getVideoSettings();
    return {
      activeProvider: settings.videoActiveProvider,
      isConfigured: await videoProviderIsUsable(settings),
      bitmindConfigured: await videoProviderIsUsable(settings, "bitmind"),
      zeroTrueConfigured: await videoProviderIsUsable(settings, "zerotrue"),
      customConfigured: await videoProviderIsUsable(settings, "custom"),
      moodyLensConfigured: await videoProviderIsUsable(settings, MoodyLens.PROVIDER_ID),
    };
  },

  async VIDEO_TEST_PROVIDER_KEY(message, sender) {
    requireExtensionPage(sender);
    const keyToTest = String(message.apiKey || "").trim();
    if (!keyToTest) throw new Error("Please enter an API key to test.");
    const testRes = await callBitMindVideo({ frameDataUri: await loadBundledTestFrame() }, keyToTest);
    return { success: true, result: testRes };
  },

  async SCAN_VIDEO(message, sender) {
    return scanVideo(message.payload, sender);
  },

  async VIDEO_GET_HISTORY() {
    const { videoDetectionHistory = [] } = await chrome.storage.local.get("videoDetectionHistory");
    return videoDetectionHistory;
  },

  async VIDEO_CLEAR_HISTORY() {
    await serializedStorageUpdate(() => chrome.storage.local.set({ videoDetectionHistory: [] }));
    return { success: true };
  },

  async VIDEO_DELETE_HISTORY_ITEM(message) {
    await serializedStorageUpdate(async () => {
      const { videoDetectionHistory = [] } = await chrome.storage.local.get("videoDetectionHistory");
      await chrome.storage.local.set({ videoDetectionHistory: videoDetectionHistory.filter(h => h.id !== message.id) });
    });
    return { success: true };
  },

  async VIDEO_OPEN_SIDEPANEL(message, sender) {
    const pending = message.payload?.videoUrl
      ? chrome.storage.local.set({ pendingReviewVideo: message.payload.videoUrl })
      : Promise.resolve();
    let opened = false;
    if (sender.tab?.id && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ tabId: sender.tab.id });
        opened = true;
      } catch (err) {
        console.warn("Could not open side panel directly:", err);
      }
    }
    await pending;
    return { opened };
  },

  async VIDEO_SET_ACTIVE_PROVIDER(message, sender) {
    requireExtensionPage(sender);
    const provider = message.provider;
    if (!VIDEO_PROVIDERS.includes(provider)) throw new Error("Choose a supported video detection provider.");
    await chrome.storage.local.set({ videoActiveProvider: provider });
    return { provider };
  },

  async VIDEO_GET_CUSTOM_PROVIDER_CONFIG(message, sender) {
    requireExtensionPage(sender);
    const { videoCustomProviderConfig } = await chrome.storage.local.get("videoCustomProviderConfig");
    return { config: videoCustomProviderConfig || VideoProviderEngine.DEFAULT_CUSTOM_CONFIG };
  },

  async VIDEO_SAVE_CUSTOM_PROVIDER_CONFIG(message, sender) {
    requireExtensionPage(sender);
    const config = VideoProviderEngine.validateCustomConfig(message.config);
    const granted = await chrome.permissions.contains({ origins: [`${new URL(config.endpoint).origin}/*`] });
    if (!granted) throw new Error("API host permission is missing. Save the provider from its settings page and approve access.");
    const { videoCustomProviderConfig: current } = await chrome.storage.local.get("videoCustomProviderConfig");
    const updatedAt = Math.max(Date.now(), Number(current?.updatedAt || 0) + 1);
    await chrome.storage.local.set({ videoCustomProviderConfig: { ...config, updatedAt } });
    return { saved: true };
  },
};

function validateAudioServerUrl(raw) {
  // The live meeting-audio stream must stay on this computer (audio-manager.js security note).
  let url;
  try { url = new URL(String(raw || "ws://127.0.0.1:8765")); }
  catch { throw new Error("Enter the local audio model address, e.g. ws://127.0.0.1:8765"); }
  if (!["ws:", "wss:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("The local audio model must run on this computer: use ws://127.0.0.1:<port>.");
  }
  return url.toString().replace(/\/$/, "");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  const videoType = Object.hasOwn(VIDEO_MESSAGE_ALIASES, message.type) ? VIDEO_MESSAGE_ALIASES[message.type] : message.type;
  if (Object.hasOwn(VIDEO_HANDLERS, videoType)) {
    VIDEO_HANDLERS[videoType](message, sender)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

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
    const bitmindVerificationState = apiKey ? "unverified" : "not_configured";
    getStored().then(settings => chrome.storage.local.set({
      apiKey,
      apiKeyUpdatedAt: Math.max(Date.now(), Number(settings.apiKeyUpdatedAt || 0) + 1),
      bitmindVerificationState,
      bitmindVerificationError: null
    }))
      .then(() => broadcastScannerSettings())
      .then(() => sendResponse({ ok: true, state: bitmindVerificationState })).catch(error => sendResponse({ ok: false, error: error.message }));
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
      if (!IMAGE_PROVIDERS.includes(provider)) throw new Error("Choose a supported detection provider.");
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
      await chrome.storage.local.set({ scanEnabled: false });
      const settings = await getStored();
      if (!settings.videoScanEnabled) {
        await unregisterScanner();
      }
      await broadcastScannerSettings();
      const tabs = await chrome.tabs.query({});
      await Promise.all(tabs.filter(tab => tab.id && /^https?:/.test(tab.url || "")).map(tab =>
        chrome.tabs.sendMessage(tab.id, { type: "DS_STOP_IMAGE" }).catch(() => null)
      ));
      return { ok: true };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "ENABLE_VIDEO_SCANNING") {
    (async () => {
      const settings = await getStored();
      const videoProvider = settings.videoActiveProvider || "bitmind";
      const readiness = getProviderVerificationState(settings, videoProvider);
      if (readiness.state === "not_configured" || readiness.state === "invalid") {
        throw new Error("Configure your video detection provider in Settings > Providers to enable video auto-scan.");
      }
      const granted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
      if (!granted) throw new Error("Website access permission is missing. Enable scanning again and approve access.");
      await registerScanner();
      await chrome.storage.local.set({ videoScanEnabled: true });
      await broadcastScannerSettings();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let ping = null;
      if (tab?.id && /^https?:/.test(tab.url || "")) ping = await injectAndPing(tab.id);
      return { ok: true, ping };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "DISABLE_VIDEO_SCANNING") {
    (async () => {
      await chrome.storage.local.set({ videoScanEnabled: false });
      const settings = await getStored();
      if (!settings.scanEnabled) {
        await unregisterScanner();
      }
      await broadcastScannerSettings();
      const tabs = await chrome.tabs.query({});
      await Promise.all(tabs.filter(tab => tab.id && /^https?:/.test(tab.url || "")).map(tab =>
        chrome.tabs.sendMessage(tab.id, { type: "DS_STOP_VIDEO" }).catch(() => null)
      ));
      return { ok: true };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "SET_VIDEO_SCAN_ENABLED") {
    (async () => {
      const enable = Boolean(message.enabled);
      if (enable) {
        const settings = await getStored();
        const videoProvider = settings.videoActiveProvider || "bitmind";
        const readiness = getProviderVerificationState(settings, videoProvider);
        if (readiness.state === "not_configured" || readiness.state === "invalid") {
          throw new Error("Configure your video detection provider in Settings > Providers to enable video auto-scan.");
        }
        const granted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
        if (!granted) throw new Error("Website access permission is missing. Enable scanning again and approve access.");
        await registerScanner();
      }
      await chrome.storage.local.set({ videoScanEnabled: enable });
      const settings = await getStored();
      if (!enable && !settings.scanEnabled) {
        await unregisterScanner();
      }
      await broadcastScannerSettings();
      if (!enable) {
        const tabs = await chrome.tabs.query({});
        await Promise.all(tabs.filter(tab => tab.id && /^https?:/.test(tab.url || "")).map(tab =>
          chrome.tabs.sendMessage(tab.id, { type: "DS_STOP_VIDEO" }).catch(() => null)
        ));
      }
      return { ok: true, videoScanEnabled: enable };
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
    analyzeImage(String(message.image || ""), message.source || "manual", message.provider)
      .then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "TEST_API_KEY") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    (async () => {
      const { apiKey: storedKey } = await getStored();
      const apiKey = String(message.apiKey || storedKey || "").trim();
      if (!apiKey) throw new Error("Save or enter your BitMind API key first.");
      try {
        const response = await callBitMind("https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=480", apiKey);
        await chrome.storage.local.set({ bitmindVerificationState: "verified", bitmindVerificationError: null });
        await broadcastScannerSettings();
        return response;
      } catch (err) {
        await chrome.storage.local.set({ bitmindVerificationState: "invalid", bitmindVerificationError: err.message });
        await broadcastScannerSettings();
        throw err;
      }
    })().then(response => sendResponse({ ok: true, response, state: "verified" }))
      .catch(error => sendResponse({ ok: false, error: error.message, state: "invalid" }));
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

  // ------------------------------------------------------------------
  // MAD-EYE MOODY LENS SERVER (team backend; provider "moodylens" for image, video and audio)
  // ------------------------------------------------------------------

  if (message.type === "SAVE_MOODYLENS_SERVER_CONFIG") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    (async () => {
      const url = MoodyLens.validateServerUrl(message.url);
      // Like the Custom provider: the settings page requests the host permission (user gesture) first.
      const granted = await chrome.permissions.contains({ origins: [MoodyLens.originPattern(url)] });
      if (!granted) throw new Error("Server access permission is missing. Save the server from the settings page and approve access.");
      const current = await chrome.storage.local.get(MOODYLENS_DEFAULTS);
      const update = { moodyLensServerUrl: url, moodyLensUpdatedAt: Math.max(Date.now(), Number(current.moodyLensUpdatedAt || 0) + 1) };
      if (typeof message.apiKey === "string") update.moodyLensApiKey = message.apiKey.trim();
      await chrome.storage.local.set(update);
      await broadcastScannerSettings();
      return { ok: true, url };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_MOODYLENS_SERVER_CONFIG") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "Server settings are available only inside the extension." }); return false; }
    (async () => {
      const settings = await chrome.storage.local.get(MOODYLENS_DEFAULTS);
      return {
        ok: true,
        url: settings.moodyLensServerUrl,
        apiKeySet: Boolean(settings.moodyLensApiKey),   // the key itself never leaves storage
        usable: await MoodyLens.serverIsUsable(moodyLensConfig(settings)),
      };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "TEST_MOODYLENS_SERVER") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    (async () => {
      const cfg = moodyLensConfig(await chrome.storage.local.get(MOODYLENS_DEFAULTS));
      if (!(await MoodyLens.serverIsUsable(cfg))) throw new Error(providerSetupMessage(MoodyLens.PROVIDER_ID));
      return { ok: true, ...(await MoodyLens.checkServer(cfg)) };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_HISTORY") {
    getStored().then(settings => sendResponse({ items: settings.recentDetections || [] }))
      .catch(error => sendResponse({ items: [], error: error.message }));
    return true;
  }

  if (message.type === "CLEAR_DETECTION_HISTORY") {
    // Content scripts can share the extension ID, so require an extension document URL.
    if (typeof sender?.url !== "string" || !sender.url.startsWith(chrome.runtime.getURL(""))) {
      sendResponse({ ok: false, error: "Open the extension to clear detection history." });
      return false;
    }
    serializedStorageUpdate(() => chrome.storage.local.set({ recentDetections: [], videoDetectionHistory: [] }))
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  // ==================================================================
  // AUDIO DEEPFAKE DETECTION (TAB MEDIA & ONLINE ZERO TRUE API)
  // ==================================================================

  if (message.type === "AUDIO_START_MONITORING") {
    startMonitoring(message.tabId)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "AUDIO_STOP_MONITORING") {
    stopMonitoring()
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "AUDIO_GET_STATUS") {
    Promise.resolve(getAudioStatus())
      .then(status => sendResponse({ ok: true, status }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "AUDIO_CHUNK_DATA") {
    forwardAudioChunk({
      pcm_b64:     message.pcm_b64,
      sample_rate: message.sample_rate,
      channels:    message.channels,
      num_samples: message.num_samples,
    });
    return false;
  }

  if (message.type === "AUDIO_GET_SESSIONS") {
    AudioStorage.getSessions()
      .then(data => sendResponse({ ok: true, ...data }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "AUDIO_CLEAR_SESSIONS") {
    AudioStorage.clearSessions()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "AUDIO_SAVE_SERVER_CONFIG") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    (async () => {
      await chrome.storage.local.set({
        audioServerToken: message.token || "madeye-local-dev-token-change-me",
        audioServerUrl:   validateAudioServerUrl(message.url),
      });
      return { ok: true };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "OPEN_AUDIO_REPORT") {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    })();
    return false;
  }

  if (message.type === "AUDIO_TRIGGER_DEEP_ANALYSIS") {
    triggerDeepAnalysis(message.payload || message.durationSec || 30)
      .then(report => sendResponse({ ok: true, report }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "AUDIO_GET_FORENSIC_REPORT") {
    getLastForensicReport()
      .then(report => sendResponse({ ok: true, report }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  // ------------------------------------------------------------------
  // TAB AUDIO PLAYBACK CAPTURE & AUTO DEEPFAKE ANALYSIS (FINISHED OR 30s)
  // ------------------------------------------------------------------

  if (message.type === "AUDIO_START_PLAYBACK_CAPTURE") {
    startTabPlaybackCapture(message.tabId, message.maxDurationSec || 30)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "AUDIO_STOP_PLAYBACK_CAPTURE") {
    stopTabPlaybackCapture(message.reason)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "PLAYBACK_CAPTURE_FINISHED") {
    handlePlaybackCaptureFinished(message)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "TAB_MEDIA_ENDED") {
    chrome.runtime.sendMessage({
      target: "offscreen-audio",
      type:   "TAB_MEDIA_ENDED",
    }).catch(() => {});
    return false;
  }

  // ------------------------------------------------------------------
  // ZEROTRUE ONLINE API CONFIGURATION & TESTING (https://zerotrue.app)
  // ------------------------------------------------------------------

  if (message.type === "SAVE_ZEROTRUE_CONFIG") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    if (message.engineMode && !AUDIO_ENGINE_MODES.includes(message.engineMode)) {
      sendResponse({ ok: false, error: "Choose a supported audio engine." });
      return false;
    }
    const toSave = {};
    let zeroTrueVerificationState = "unverified";
    if (message.apiKey != null) {
      const cleanKey = String(message.apiKey).trim();
      toSave.zeroTrueApiKey = cleanKey;
      toSave.zeroTrueUpdatedAt = Date.now();
      zeroTrueVerificationState = cleanKey ? "unverified" : "not_configured";
      toSave.zeroTrueVerificationState = zeroTrueVerificationState;
      toSave.zeroTrueVerificationError = null;
    }
    if (message.engineMode) toSave.audioEngineMode = message.engineMode;
    chrome.storage.local.set(toSave)
      .then(() => broadcastScannerSettings())
      .then(() => sendResponse({ ok: true, state: zeroTrueVerificationState }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "TEST_ZEROTRUE_KEY") {
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "This action is available only inside the extension." }); return false; }
    (async () => {
      let key = String(message.apiKey || "").trim();
      if (!key) {
        const stored = await chrome.storage.local.get("zeroTrueApiKey");
        key = String(stored.zeroTrueApiKey || "").trim();
      }
      if (!key) throw new Error("Please enter or save your ZeroTrue API key first.");
      try {
        const res = await testZeroTrueApiKey(key);
        await chrome.storage.local.set({ zeroTrueVerificationState: "verified", zeroTrueVerificationError: null });
        await broadcastScannerSettings();
        return res;
      } catch (err) {
        await chrome.storage.local.set({ zeroTrueVerificationState: "invalid", zeroTrueVerificationError: err.message });
        await broadcastScannerSettings();
        throw err;
      }
    })().then(res => sendResponse({ ok: true, ...res, state: "verified" }))
      .catch(error => sendResponse({ ok: false, error: error.message, state: "invalid" }));
    return true;
  }

  if (message.type === "GET_AUDIO_CONFIG") {
    // Returns the ZeroTrue key: extension pages only (storage is TRUSTED_CONTEXTS for this reason).
    if (!isExtensionPage(sender)) { sendResponse({ ok: false, error: "Audio settings are available only inside the extension." }); return false; }
    Promise.all([chrome.storage.local.get(["zeroTrueApiKey", "audioEngineMode"]), getStored()])
      .then(async ([cfg, settings]) => sendResponse({
        ok: true,
        zeroTrueConfigured: Boolean(cfg.zeroTrueApiKey),
        audioEngineMode: cfg.audioEngineMode || "auto",
        zeroTrueApiKey: cfg.zeroTrueApiKey || "",
        moodyLensConfigured: await providerIsUsable(settings, MoodyLens.PROVIDER_ID),
      }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

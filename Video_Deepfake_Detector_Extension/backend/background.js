importScripts("providers/video-provider-engine.js");

// Restrict extension storage access to trusted contexts (service worker, popup, sidepanel)
let storageAccessReady = Promise.resolve();
try {
  if (chrome.storage?.local?.setAccessLevel) {
    storageAccessReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    storageAccessReady.catch(error => console.warn("Could not restrict storage access level:", error));
  }
} catch (error) {
  console.warn("Could not restrict storage access level:", error);
}

const BITMIND_VIDEO_ENDPOINT = "https://api.bitmind.ai/oracle/v1/34/detect-video";
const BITMIND_IMAGE_ENDPOINT = "https://api.bitmind.ai/oracle/v1/34/detect-image";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_ITEMS = 250;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB for video
const REQUEST_TIMEOUT_MS = 60000;

const memoryCache = new Map();
const inFlight = new Map();
let activeRequests = 0;
const requestQueue = [];

async function withConcurrencyLimit(task) {
  if (activeRequests >= 3) {
    await new Promise(resolve => requestQueue.push(resolve));
  }
  activeRequests++;
  try {
    return await task();
  } finally {
    activeRequests--;
    requestQueue.shift()?.();
  }
}

function isExtensionPage(sender) {
  return typeof sender?.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
}

chrome.runtime.onInstalled.addListener(async () => {
  try { await storageAccessReady; } catch (_) {}
  const existing = await chrome.storage.local.get([
    "apiKey", "apiKeyUpdatedAt", "activeProvider", "customProviderConfig",
    "hoverScanEnabled", "autoScanOnHover", "hoverDelayMs",
    "videoDetectionHistory", "detectionCache"
  ]);

  await chrome.storage.local.set({
    apiKey: existing.apiKey ?? "",
    apiKeyUpdatedAt: existing.apiKeyUpdatedAt ?? (existing.apiKey ? Date.now() : 0),
    activeProvider: ["bitmind", "custom"].includes(existing.activeProvider) ? existing.activeProvider : "bitmind",
    customProviderConfig: existing.customProviderConfig ?? null,
    hoverScanEnabled: existing.hoverScanEnabled ?? true,
    autoScanOnHover: existing.autoScanOnHover ?? true,
    hoverDelayMs: existing.hoverDelayMs ?? 400,
    videoDetectionHistory: existing.videoDetectionHistory ?? [],
    detectionCache: existing.detectionCache ?? {}
  });

  // Create context menus for videos
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "bitmind-detect-video",
      title: "Detect Deepfake with BitMind",
      contexts: ["video", "link"]
    });
  });

  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    }
  } catch (_) {}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "bitmind-detect-video") return;
  const targetUrl = info.srcUrl || info.linkUrl || "";
  if (!targetUrl) return;

  await chrome.storage.local.set({ pendingReviewVideo: targetUrl });
  if (tab?.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (err) {
      console.warn("Could not open side panel:", err);
    }
  }
});

async function getStoredSettings() {
  return chrome.storage.local.get({
    apiKey: "",
    apiKeyUpdatedAt: 0,
    activeProvider: "bitmind",
    customProviderConfig: null,
    hoverScanEnabled: true,
    autoScanOnHover: true,
    hoverDelayMs: 400,
    videoDetectionHistory: [],
    detectionCache: {}
  });
}

function makeCacheKey(mediaIdentifier, provider, version) {
  return `${provider}:${version}:${mediaIdentifier}`;
}

async function readJsonResponse(response, providerName) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${providerName} returned HTTP ${response.status} with an invalid JSON body.`);
  }

  if (!response.ok) {
    const msg = data?.error?.message || data?.message || data?.detail || `${providerName} returned HTTP ${response.status}.`;
    throw new Error(String(msg).slice(0, 500));
  }
  return data;
}

// BitMind Call: supports video detection with fallback to frame-based detection
async function callBitMind(payload, apiKey) {
  // payload can contain: { videoUrl, frameDataUri, frames, title, duration }
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "x-bitmind-application": "oracle-api",
    "Content-Type": "application/json"
  };

  // If a direct video URL is available, attempt BitMind video endpoint
  if (payload.videoUrl && !payload.videoUrl.startsWith("blob:") && !payload.videoUrl.startsWith("data:")) {
    try {
      const response = await fetch(BITMIND_VIDEO_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ video: payload.videoUrl, rich: true }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (response.ok) {
        const data = await readJsonResponse(response, "BitMind Video");
        return VideoProviderEngine.normalizeBitMindResponse(data);
      }
    } catch (videoEndpointError) {
      console.warn("Direct video endpoint call failed, attempting frame analysis:", videoEndpointError);
    }
  }

  // Frame-based detection: either multiple frames or single keyframe
  const frameToAnalyze = payload.frameDataUri || (Array.isArray(payload.frames) && payload.frames[0]?.dataUri) || payload.videoUrl;
  if (!frameToAnalyze) {
    throw new Error("No video frame or valid URL was provided for analysis.");
  }

  // If we have multiple frames, sample them
  if (Array.isArray(payload.frames) && payload.frames.length > 1) {
    const frameResults = [];
    for (const frame of payload.frames.slice(0, 3)) {
      try {
        const response = await fetch(BITMIND_IMAGE_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({ image: frame.dataUri, rich: true }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        const data = await readJsonResponse(response, "BitMind Frame");
        const norm = VideoProviderEngine.normalizeBitMindResponse(data);
        frameResults.push({
          timestamp: frame.timestamp,
          isAI: norm.isAI,
          confidence: norm.confidence
        });
      } catch (err) {
        console.warn("Error scanning frame at " + frame.timestamp, err);
      }
    }

    if (frameResults.length > 0) {
      const aiCount = frameResults.filter(f => f.isAI).length;
      const avgConfidence = frameResults.reduce((acc, f) => acc + (f.confidence || 0.5), 0) / frameResults.length;
      const isAI = aiCount >= (frameResults.length / 2);
      return {
        provider: "bitmind",
        providerName: "BitMind Video Oracle",
        model: "BitMind Video Multi-Frame Analysis",
        isAI,
        confidence: Number(avgConfidence.toFixed(4)),
        similarity: null,
        verdict: VideoProviderEngine.verdictFor(isAI, avgConfidence),
        frameBreakdown: frameResults,
        explanation: isAI
          ? `Deepfake artifacts detected across ${aiCount}/${frameResults.length} analyzed video frames.`
          : `Video evaluated as authentic across ${frameResults.length} sampled frames.`,
        rawResponse: { frameResults }
      };
    }
  }

  // Single frame analysis
  const response = await fetch(BITMIND_IMAGE_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ image: frameToAnalyze, rich: true }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const data = await readJsonResponse(response, "BitMind");
  return VideoProviderEngine.normalizeBitMindResponse(data);
}

// Custom Provider Dispatcher
async function callCustomProvider(payload, rawConfig) {
  const config = VideoProviderEngine.validateCustomConfig(rawConfig);
  const headers = new Headers(JSON.parse(config.additionalHeaders || "{}"));
  if (config.authType === "bearer") headers.set("Authorization", `Bearer ${config.apiKey.trim()}`);
  if (config.authType === "header") headers.set(config.authHeaderName.trim(), config.apiKey.trim());

  let body;
  let method = "POST";

  if (config.videoTransport === "url_json") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify({
      [config.videoField]: payload.videoUrl || payload.frameDataUri,
      ...(config.modelId ? { [config.modelField]: config.modelId } : {})
    });
  } else if (config.videoTransport === "base64_json") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify({
      [config.videoField]: payload.frameDataUri || payload.videoUrl,
      ...(config.modelId ? { [config.modelField]: config.modelId } : {})
    });
  } else if (config.videoTransport === "multipart") {
    const formData = new FormData();
    if (payload.fileBlob) {
      formData.append(config.videoField, payload.fileBlob, payload.fileName || "video.mp4");
    } else if (payload.frameDataUri) {
      // Convert base64 dataUri to Blob
      const parts = payload.frameDataUri.split(",");
      const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      formData.append(config.videoField, new Blob([u8arr], { type: mime }), "frame.jpg");
    } else {
      formData.append(config.videoField, payload.videoUrl);
    }
    if (config.modelId) formData.append(config.modelField, config.modelId);
    body = formData;
  } else {
    // Binary
    headers.set("Content-Type", "video/mp4");
    body = payload.fileBlob || payload.frameDataUri;
  }

  const response = await fetch(config.endpoint, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  const rawData = await readJsonResponse(response, config.name);
  return VideoProviderEngine.normalizeCustomResponse(rawData, config);
}

// Append result to persistent history
async function saveToHistory(detectionRecord) {
  try {
    const { videoDetectionHistory = [] } = await chrome.storage.local.get("videoDetectionHistory");
    const item = {
      id: "scan_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      timestamp: Date.now(),
      dateFormatted: new Date().toLocaleString(),
      title: detectionRecord.title || "Web Video",
      sourceUrl: detectionRecord.sourceUrl || "",
      thumbnail: detectionRecord.thumbnail || "",
      verdict: detectionRecord.verdict,
      isAI: detectionRecord.isAI,
      confidence: detectionRecord.confidence,
      model: detectionRecord.model,
      provider: detectionRecord.provider,
      providerName: detectionRecord.providerName,
      type: detectionRecord.scanType || "hover_scan",
      duration: detectionRecord.videoDuration || null,
      explanation: detectionRecord.explanation || ""
    };

    // Keep up to MAX_HISTORY_ITEMS, newest first
    const updated = [item, ...videoDetectionHistory.filter(h => h.sourceUrl !== item.sourceUrl || item.sourceUrl === "")].slice(0, MAX_HISTORY_ITEMS);
    await chrome.storage.local.set({ videoDetectionHistory: updated });
    return item;
  } catch (err) {
    console.warn("Could not save to history:", err);
  }
}

// Handle messages from content script, popup, and sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case "PING": {
        const settings = await getStoredSettings();
        return {
          status: "ready",
          hoverScanEnabled: settings.hoverScanEnabled,
          autoScanOnHover: settings.autoScanOnHover,
          hoverDelayMs: settings.hoverDelayMs,
          activeProvider: settings.activeProvider,
          hasKey: Boolean(settings.apiKey)
        };
      }

      case "CHECK_PROVIDER_CONFIG": {
        const settings = await getStoredSettings();
        const hasKey = Boolean(String(settings.apiKey || "").trim());
        const customValid = Boolean(settings.customProviderConfig?.endpoint);
        return {
          activeProvider: settings.activeProvider,
          isConfigured: settings.activeProvider === "custom" ? customValid : hasKey,
          bitmindConfigured: hasKey,
          customConfigured: customValid
        };
      }

      case "TEST_PROVIDER_KEY": {
        if (!isExtensionPage(sender)) throw new Error("Unauthorized context.");
        const keyToTest = message.apiKey?.trim();
        if (!keyToTest) throw new Error("Please enter an API key to test.");

        // Test with bundled test frame
        const testImgUrl = chrome.runtime.getURL("assets/test-frame.png");
        const resp = await fetch(testImgUrl);
        const blob = await resp.blob();
        const reader = new FileReader();
        const dataUri = await new Promise(resolve => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });

        const testRes = await callBitMind({ frameDataUri: dataUri }, keyToTest);
        return { success: true, result: testRes };
      }

      case "SCAN_VIDEO": {
        const settings = await getStoredSettings();
        const provider = settings.activeProvider;
        const version = provider === "custom"
          ? (settings.customProviderConfig?.updatedAt || 1)
          : (settings.apiKeyUpdatedAt || 1);

        const cacheId = message.payload.videoUrl || message.payload.cacheHash || (message.payload.frameDataUri ? message.payload.frameDataUri.slice(0, 100) : "");
        const cacheKey = makeCacheKey(cacheId, provider, version);

        // Check memory cache
        if (cacheId && memoryCache.has(cacheKey)) {
          const cached = memoryCache.get(cacheKey);
          if (Date.now() - cached.cachedAt < CACHE_TTL_MS) {
            return { ...cached.data, fromCache: true };
          }
        }

        // Check persistent cache
        if (cacheId && settings.detectionCache?.[cacheKey]) {
          const cached = settings.detectionCache[cacheKey];
          if (Date.now() - cached.cachedAt < CACHE_TTL_MS) {
            memoryCache.set(cacheKey, cached);
            return { ...cached.data, fromCache: true };
          }
        }

        // Deduplicate in-flight requests for the same media
        if (cacheId && inFlight.has(cacheKey)) {
          return await inFlight.get(cacheKey);
        }

        const task = (async () => {
          const startTime = Date.now();
          let detectionResult;

          if (provider === "bitmind") {
            if (!settings.apiKey) {
              throw new Error("BitMind API key is not configured. Please open extension settings to add your key.");
            }
            detectionResult = await callBitMind(message.payload, settings.apiKey);
          } else {
            if (!settings.customProviderConfig) {
              throw new Error("Custom Video Provider is not configured.");
            }
            detectionResult = await callCustomProvider(message.payload, settings.customProviderConfig);
          }

          detectionResult.durationMs = Date.now() - startTime;
          detectionResult.title = message.payload.title || sender.tab?.title || "Web Video";
          detectionResult.sourceUrl = message.payload.videoUrl || sender.tab?.url || "";
          detectionResult.thumbnail = message.payload.thumbnail || message.payload.frameDataUri || "";
          detectionResult.scanType = message.payload.scanType || "hover_scan";
          detectionResult.videoDuration = message.payload.videoDuration;

          // Save to history
          await saveToHistory(detectionResult);

          // Update cache
          if (cacheId) {
            const cacheEntry = { data: detectionResult, cachedAt: Date.now() };
            memoryCache.set(cacheKey, cacheEntry);
            const updatedCache = { ...(settings.detectionCache || {}), [cacheKey]: cacheEntry };
            // Limit cache size to 150 items
            const keys = Object.keys(updatedCache);
            if (keys.length > 150) {
              delete updatedCache[keys[0]];
            }
            chrome.storage.local.set({ detectionCache: updatedCache });
          }

          return detectionResult;
        })();

        if (cacheId) inFlight.set(cacheKey, task);
        try {
          return await withConcurrencyLimit(() => task);
        } finally {
          if (cacheId) inFlight.delete(cacheKey);
        }
      }

      case "GET_HISTORY": {
        const { videoDetectionHistory = [] } = await chrome.storage.local.get("videoDetectionHistory");
        return videoDetectionHistory;
      }

      case "CLEAR_HISTORY": {
        await chrome.storage.local.set({ videoDetectionHistory: [] });
        return { success: true };
      }

      case "DELETE_HISTORY_ITEM": {
        const { videoDetectionHistory = [] } = await chrome.storage.local.get("videoDetectionHistory");
        const filtered = videoDetectionHistory.filter(h => h.id !== message.id);
        await chrome.storage.local.set({ videoDetectionHistory: filtered });
        return { success: true };
      }

      case "OPEN_SIDEPANEL": {
        if (message.payload?.videoUrl) {
          await chrome.storage.local.set({ pendingReviewVideo: message.payload.videoUrl });
        }
        if (sender.tab?.id && chrome.sidePanel?.open) {
          try {
            await chrome.sidePanel.open({ tabId: sender.tab.id });
            return { opened: true };
          } catch (err) {
            console.warn("Could not open side panel directly:", err);
          }
        }
        return { opened: false };
      }

      default:
        throw new Error(`Unhandled message type: ${message.type}`);
    }
  };

  handler()
    .then(result => sendResponse({ ok: true, data: result }))
    .catch(error => sendResponse({ ok: false, error: error.message || String(error) }));

  return true; // Keep sendResponse asynchronous
});

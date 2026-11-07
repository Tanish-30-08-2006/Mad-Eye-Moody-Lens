/**
 * Mad-Eye Moody Lens - Background Service Worker (Manifest V3)
 * Handles off-origin media fetches, context menus, and proxy communication with backend.
 */

const DEFAULT_SETTINGS = {
  backendUrl: "http://localhost:8000",
  holdDurationMs: 1000,
  enabled: true,
  autoOpenHeatmap: false,
};

// Initialize context menu and default settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
    chrome.storage.local.set(stored);
  });

  chrome.contextMenus.create({
    id: "moody-lens-analyze-image",
    title: "🔍 Analyze Image with Moody Lens (Deepfake Check)",
    contexts: ["image"],
  });
});

// Context menu click listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "moody-lens-analyze-image" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: "TRIGGER_CONTEXT_ANALYSIS",
      srcUrl: info.srcUrl,
    });
  }
});

// Helper: fetch remote image and convert to Base64 to bypass web-page CORS restrictions
async function urlToBase64(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("[MoodyLens Background] Direct image fetch failed, sending raw URL to backend:", err);
    return null;
  }
}

// Helper: Call Moody Lens Backend API
async function callBackendApi(endpoint, payload) {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const baseUrl = settings.backendUrl || "http://localhost:8000";
  const targetUrl = `${baseUrl.replace(/\/+$/, "")}${endpoint}`;

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Backend error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

// Log scan to history (stores last 30 scans)
async function recordScanHistory(scanData) {
  try {
    const { scanHistory = [] } = await chrome.storage.local.get("scanHistory");
    const updated = [
      {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...scanData,
      },
      ...scanHistory,
    ].slice(0, 30);
    await chrome.storage.local.set({ scanHistory: updated });
  } catch (e) {
    console.error("[MoodyLens Background] Error recording history:", e);
  }
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  if (action === "GET_SETTINGS") {
    chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
      sendResponse({ status: "ok", settings });
    });
    return true;
  }

  if (action === "ANALYZE_IMAGE") {
    (async () => {
      try {
        let { imageUrl, imageBase64, isAdvanced } = message;

        // If no base64 provided and imageUrl is available, attempt background fetch
        if (!imageBase64 && imageUrl && !imageUrl.startsWith("data:")) {
          const b64 = await urlToBase64(imageUrl);
          if (b64) imageBase64 = b64;
        }

        const endpoint = isAdvanced ? "/api/analyze-advanced" : "/api/analyze";
        const payload = imageBase64 ? { image_base64: imageBase64 } : { image_url: imageUrl };

        const result = await callBackendApi(endpoint, payload);

        // Record scan history
        await recordScanHistory({
          imageUrl: imageUrl || (imageBase64 ? imageBase64.slice(0, 100) : "Image"),
          verdict: result.verdict,
          fake_probability: result.fake_probability,
          confidence_score: result.confidence_score,
          manipulation_type: result.manipulation_type,
          manipulation_scope: result.manipulation_scope || "unknown",
        });

        sendResponse({ status: "success", data: result });
      } catch (err) {
        console.error("[MoodyLens Background] Analysis failed:", err);
        sendResponse({ status: "error", error: err.message || "Failed to analyze image" });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (action === "PING_BACKEND") {
    (async () => {
      try {
        const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
        const baseUrl = settings.backendUrl || "http://localhost:8000";
        const t0 = performance.now();
        const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/health`, { method: "GET" });
        const latency = Math.round(performance.now() - t0);
        if (resp.ok) {
          const data = await resp.json();
          sendResponse({ status: "ok", data, latency });
        } else {
          sendResponse({ status: "error", error: `HTTP ${resp.status}` });
        }
      } catch (e) {
        sendResponse({ status: "error", error: e.message });
      }
    })();
    return true;
  }
});

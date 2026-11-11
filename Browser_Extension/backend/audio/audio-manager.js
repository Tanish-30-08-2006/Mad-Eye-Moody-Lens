/**
 * audio-manager.js
 * ================
 * Core audio monitoring controller for the background service worker.
 *
 * Responsibilities:
 *   - Manage the offscreen document lifecycle (create / destroy).
 *   - Manage the WebSocket connection to the local Python inference server.
 *   - Receive audio PCM chunks from the offscreen document.
 *   - Forward chunks to the WebSocket server.
 *   - Receive inference results and dispatch them to:
 *       (a) the meeting tab (audio-alert.js overlay)
 *       (b) audio-session.js for session tracking
 *       (c) any open popup/sidepanel for live status updates
 *
 * Security:
 *   - WebSocket connects to ws://127.0.0.1:8765 ONLY.
 *   - Auth token is kept in chrome.storage.local (never committed).
 *   - Duplicate monitoring sessions are prevented.
 */

"use strict";

import { AudioSession } from "./audio-session.js";
import { AudioRiskEngine } from "./audio-risk-engine.js";
import { AudioStorage } from "./audio-storage.js";
import {
  pcmToWavBlob,
  base64ToFloat32Array,
  callZeroTrueAudioApi,
} from "./zerotrue-client.js";

const WS_URL_DEFAULT = "ws://127.0.0.1:8765";
const OFFSCREEN_URL  = "frontend/audio/offscreen.html";
const OFFSCREEN_REASON = chrome.offscreen?.Reason?.USER_MEDIA ?? "USER_MEDIA";

// ---------------------------------------------------------------------------
// Module state  (service-worker lifetime; re-initialised on each SW startup)
// ---------------------------------------------------------------------------
let _ws           = null;
let _wsReady      = false;
let _wsConnecting = false;
let _wsAuthOk     = false;
let _monitoringTab  = null;   // { tabId, url, platform }
let _session      = null;
let _riskEngine   = null;
let _reconnectTimer = null;
let _reconnectAttempts = 0;
const MAX_RECONNECT = 10;
const _pendingDeepAnalysisResolvers = new Map();
let _playbackCaptureRunning = false;
let _modelMetadata = {
  modelName:    "SSL Anti-Spoofing (wav2vec 2.0 + AASIST)",
  modelVersion: "1.0",
  device:       "cuda",
  modelReady:   false,
};

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------
const MEETING_PLATFORMS = {
  "meet.google.com":    "Google Meet",
  "zoom.us":            "Zoom Web",
  "teams.microsoft.com":"Microsoft Teams",
  "app.webex.com":      "Cisco Webex",
  "whereby.com":        "Whereby",
};

function detectPlatform(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    for (const [domain, name] of Object.entries(MEETING_PLATFORMS)) {
      if (hostname.includes(domain)) return name;
    }
  } catch {}
  return "Unknown";
}

// ---------------------------------------------------------------------------
// Offscreen document helpers
// ---------------------------------------------------------------------------
async function ensureOffscreenDocument() {
  if (typeof chrome.offscreen === "undefined") {
    throw new Error("chrome.offscreen API is not available in this Chrome version.");
  }
  const existing = await chrome.offscreen.hasDocument?.() ?? false;
  if (!existing) {
    await chrome.offscreen.createDocument({
      url:    chrome.runtime.getURL(OFFSCREEN_URL),
      reasons: [OFFSCREEN_REASON],
      justification: "Capture and process meeting tab audio for local deepfake detection.",
    });
  }
}

async function closeOffscreenDocument() {
  try {
    if (typeof chrome.offscreen !== "undefined") {
      await chrome.offscreen.closeDocument();
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// WebSocket management
// ---------------------------------------------------------------------------
async function getWsConfig() {
  const data = await chrome.storage.local.get(["audioServerUrl", "audioServerToken"]);
  return {
    url:   data.audioServerUrl  || WS_URL_DEFAULT,
    token: data.audioServerToken || "madeye-local-dev-token-change-me",
  };
}

async function connectWebSocket() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  _wsConnecting = true;
  _wsReady  = false;
  _wsAuthOk = false;

  const { url, token } = await getWsConfig();

  try {
    _ws = new WebSocket(url);
  } catch (err) {
    _wsConnecting = false;
    _wsReady = false;
    _wsAuthOk = false;
    broadcastStatus();
    return;
  }

  _ws.onopen = () => {
    _wsReady = true;
    _wsConnecting = false;
    _reconnectAttempts = 0;
    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
    // Authenticate immediately
    _ws.send(JSON.stringify({ type: "auth", token }));
    broadcastStatus();
  };

  _ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handleServerMessage(msg);
  };

  _ws.onerror = (err) => {
    _wsConnecting = false;
    console.warn("[audio-manager] WebSocket connection failed to 127.0.0.1:8765");
  };

  _ws.onclose = () => {
    _wsReady  = false;
    _wsAuthOk = false;
    _wsConnecting = false;
    _modelMetadata.modelReady = false;
    broadcastStatus();

    // Background reconnection check: auto-detect when local Python service starts
    if (!_reconnectTimer) {
      _reconnectAttempts++;
      const delay = _monitoringTab ? 2000 : 5000;
      _reconnectTimer = setTimeout(() => {
        _reconnectTimer = null;
        connectWebSocket().catch(() => {});
      }, delay);
    }
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case "auth_ok":
      _wsAuthOk = true;
      _modelMetadata = {
        modelName:    msg.model   || _modelMetadata.modelName,
        modelVersion: msg.version || _modelMetadata.modelVersion,
        device:       msg.device  || _modelMetadata.device,
        modelReady:   msg.ready   ?? true,
      };
      broadcastStatus();
      break;

    case "auth_fail":
      console.error("[audio-manager] Auth failed:", msg.reason);
      _wsAuthOk = false;
      _modelMetadata.modelReady = false;
      broadcastStatus({ error: "Auth failed: " + msg.reason });
      break;

    case "inference_result":
      handleInferenceResult(msg);
      break;

    case "deep_analysis_result":
      handleDeepAnalysisResult(msg);
      break;

    case "buffering":
      // Server is accumulating; no action needed
      break;

    case "skipped_silence":
      // VAD skipped chunk; no action needed
      break;

    case "error":
      console.warn("[audio-manager] Server error:", msg.message);
      if (_session) _session.recordError(msg.message);
      break;

    case "status":
      if (msg.model)  _modelMetadata.modelName = msg.model;
      if (msg.device) _modelMetadata.device = msg.device;
      if (msg.ready != null) _modelMetadata.modelReady = msg.ready;
      broadcastStatus();
      break;
  }
}

function handleInferenceResult(result) {
  if (!_session || !_monitoringTab) return;

  _session.recordWindow(result);
  const evaluation = _riskEngine ? _riskEngine.evaluate(result) : { shouldAlert: false };
  const shouldAlert = Boolean(evaluation.shouldAlert);

  // Attach multi-window risk metrics
  result.ema_spoof    = evaluation.emaSpoof ?? result.p_spoof;
  result.risk_level   = evaluation.riskLevel ?? "LOW";
  result.alert_reason = evaluation.reason ?? null;

  // Forward result and alert decision to meeting tab overlay
  chrome.tabs.sendMessage(_monitoringTab.tabId, {
    type:        "AUDIO_INFERENCE_RESULT",
    result,
    shouldAlert,
    reason:      evaluation.reason,
  }).catch(() => {});

  // Record alert if multi-window risk engine triggered or high confidence synthetic detected
  if (shouldAlert) {
    _session.recordAlert({
      ...result,
      reason: evaluation.reason,
    });
  } else if (result.category === "POSSIBLE_SYNTHETIC_SPEECH") {
    _session.recordAlert({
      ...result,
      reason: `Synthetic speech interval detected: ${result.timestamp_range || "Active segment"}`,
    });
  }

  // Update session summary in storage
  AudioStorage.updateSession(_session.toSummary()).catch(() => {});

  // Broadcast live stats to popup/sidepanel
  broadcastStatus();
}

// ---------------------------------------------------------------------------
// Broadcast current status to any open extension UI
// ---------------------------------------------------------------------------
function broadcastStatus(extra = {}) {
  const status = buildStatusPayload(extra);
  chrome.runtime.sendMessage({ type: "AUDIO_STATUS_UPDATE", status }).catch(() => {});
}

function buildStatusPayload(extra = {}) {
  const isReady = _wsAuthOk && (_modelMetadata.modelReady ?? true);
  return {
    monitoring:             Boolean(_monitoringTab),
    playbackCaptureActive:  _playbackCaptureRunning,
    tabId:                  _monitoringTab?.tabId ?? null,
    platform:               _monitoringTab?.platform ?? null,
    audioSource:            _monitoringTab?.audioSource ?? "tab",
    wsConnected:            _wsReady,
    wsConnecting:           _wsConnecting,
    wsAuthenticated:        _wsAuthOk,
    modelReady:             isReady,
    modelName:              _modelMetadata.modelName,
    modelVersion:           _modelMetadata.modelVersion,
    device:                 _modelMetadata.device,
    session:                _session?.toSummary() ?? null,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Public API  (called from background.js message handler)
// ---------------------------------------------------------------------------
export async function startMonitoring(tabId) {
  if (_monitoringTab) {
    throw new Error("Monitoring is already active on " + (_monitoringTab.platform || "current session"));
  }

  let tab = null;
  if (tabId) {
    try { tab = await chrome.tabs.get(tabId); } catch {}
  }

  if (!tab || !/^https?:/.test(tab.url || "")) {
    throw new Error("Please open a Zoom, meeting, or media tab first.");
  }
  const platform = detectPlatform(tab.url);

  // Create offscreen document
  await ensureOffscreenDocument();

  // Capture tab audio stream (Zoom screen share, meeting sound, media playback)
  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });

  // Start audio processing in offscreen document
  await chrome.runtime.sendMessage({
    target:        "offscreen-audio",
    type:          "AUDIO_START",
    streamId,
    tabSampleRate: 48000,
  });

  // Initialise session and risk engine
  _session     = new AudioSession({ tabId: tabId || 0, platform, url: tab?.url || "" });
  _riskEngine  = new AudioRiskEngine();
  _monitoringTab = { tabId, url: tab?.url || "", platform };

  await AudioStorage.saveSession(_session.toSummary());

  // Connect WebSocket if local server is available (do not block for ZeroTrue online users)
  if (!_ws || _ws.readyState === WebSocket.CLOSED || _ws.readyState === WebSocket.CLOSING) {
    connectWebSocket().catch(() => {});
  }

  // Inject alert script into meeting tab
  if (tabId && tab && /^https?:/.test(tab.url || "")) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files:  ["frontend/audio/audio-alert.js"],
    }).catch(() => {});
    await chrome.scripting.insertCSS({
      target: { tabId },
      files:  ["frontend/audio/audio-alert.css"],
    }).catch(() => {});
  }

  broadcastStatus();
  console.info(`[audio-manager] Deep audio monitoring started on tab ${tabId} – ${platform}`);
  return { ok: true, platform, sessionId: _session.id };
}

export async function stopMonitoring() {
  if (!_monitoringTab) return { ok: true };

  const { tabId } = _monitoringTab;

  // Notify meeting tab overlay
  chrome.tabs.sendMessage(tabId, { type: "AUDIO_MONITORING_STOPPED" }).catch(() => {});

  // Stop offscreen audio capture
  await chrome.runtime.sendMessage({ target: "offscreen-audio", type: "AUDIO_STOP" })
    .catch(() => {});

  // Close offscreen document
  await closeOffscreenDocument();

  // Reset server buffer for next session (keep WebSocket open and ready!)
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ type: "reset_buffer" }));
  }

  // Finalise session
  if (_session) {
    _session.end();
    await AudioStorage.updateSession(_session.toSummary());
  }

  _monitoringTab = null;
  _session       = null;
  _riskEngine    = null;
  _playbackCaptureRunning = false;

  broadcastStatus();
  console.info("[audio-manager] Monitoring stopped (local WebSocket connection remains active).");
  return { ok: true };
}

export async function getStatus() {
  const cfg = await chrome.storage.local.get(["audioEngineMode", "zeroTrueApiKey"]);
  // Proactively ensure WebSocket is connected to local model service if using auto or local
  if (cfg.audioEngineMode !== "zerotrue") {
    if (!_ws || _ws.readyState === WebSocket.CLOSED || _ws.readyState === WebSocket.CLOSING) {
      connectWebSocket().catch(() => {});
    }
    // If connection is in progress, wait briefly for auth_ok so frontend sees READY immediately
    if (!_wsAuthOk && (_wsConnecting || (_ws && _ws.readyState === WebSocket.CONNECTING))) {
      for (let i = 0; i < 6; i++) {
        if (_wsAuthOk) break;
        await new Promise(r => setTimeout(r, 50));
      }
    }
  }
  return buildStatusPayload({
    audioEngineMode: cfg.audioEngineMode || "auto",
    zeroTrueConfigured: Boolean(cfg.zeroTrueApiKey),
  });
}

// ---------------------------------------------------------------------------
// Timed Tab Playback Capture API (Play audio until finished or 30s cap)
// ---------------------------------------------------------------------------
export async function startTabPlaybackCapture(tabId, maxDurationSec = 30) {
  if (!tabId) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = active?.id;
  }
  if (!tabId) throw new Error("No active tab found for audio playback capture.");

  // If tab audio monitoring is not active, initialize it
  if (!_monitoringTab) {
    await startMonitoring(tabId);
  }

  // Inject ended/pause media listeners into the tab
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.__tabMediaListenerAttached) return;
        window.__tabMediaListenerAttached = true;
        const notifyEnded = () => {
          chrome.runtime.sendMessage({ type: "TAB_MEDIA_ENDED" }).catch(() => {});
        };
        document.querySelectorAll("audio, video").forEach(el => {
          el.addEventListener("ended", notifyEnded, { once: true });
          el.addEventListener("pause", () => {
            if (el.duration && el.currentTime >= el.duration - 0.5) {
              notifyEnded();
            }
          });
        });
        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              if (node.tagName === "AUDIO" || node.tagName === "VIDEO") {
                node.addEventListener("ended", notifyEnded, { once: true });
              } else if (node.querySelectorAll) {
                node.querySelectorAll("audio, video").forEach(el => {
                  el.addEventListener("ended", notifyEnded, { once: true });
                });
              }
            }
          }
        });
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      }
    });
  } catch (e) {
    console.warn("[audio-manager] Could not inject media ended listeners into tab:", e);
  }

  // Notify offscreen to start capturing playback
  await chrome.runtime.sendMessage({
    target: "offscreen-audio",
    type:   "START_PLAYBACK_CAPTURE",
    maxDurationSec: maxDurationSec || 30,
  });

  _playbackCaptureRunning = true;
  broadcastStatus();
  console.info(`[audio-manager] Tab playback capture started on tab ${tabId} (max ${maxDurationSec}s).`);
  return { ok: true, playbackCaptureActive: true, tabId };
}

export async function stopTabPlaybackCapture(reason = "user_stopped") {
  _playbackCaptureRunning = false;
  try {
    await chrome.runtime.sendMessage({
      target: "offscreen-audio",
      type:   "STOP_PLAYBACK_CAPTURE",
      reason,
    });
  } catch {}
  broadcastStatus();
  console.info(`[audio-manager] Tab playback capture stop requested (${reason}).`);
  return { ok: true, playbackCaptureActive: false };
}

export async function handlePlaybackCaptureFinished(data) {
  _playbackCaptureRunning = false;
  broadcastStatus();

  chrome.runtime.sendMessage({
    type: "PLAYBACK_ANALYZING",
    durationSec: data.duration_sec,
    reason: data.reason,
  }).catch(() => {});

  console.info(`[audio-manager] Playback capture finished (${data.reason}, ${data.duration_sec}s). Dispatched for deep analysis.`);

  try {
    const report = await triggerDeepAnalysis({
      pcm_b64: data.pcm_b64,
      sample_rate: data.sample_rate,
      duration_sec: data.duration_sec,
    });
    return { ok: true, report };
  } catch (err) {
    console.error("[audio-manager] Playback deep analysis failed:", err);
    chrome.runtime.sendMessage({
      type: "PLAYBACK_ANALYSIS_ERROR",
      error: err.message,
    }).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Deep Forensic Analysis API (Local GPU Model or ZeroTrue Online Cloud API)
// ---------------------------------------------------------------------------
export async function triggerDeepAnalysis(params = 30) {
  let pcm_b64, sample_rate, duration_sec;
  if (typeof params === "object" && params?.pcm_b64) {
    // Direct audio file payload (from tab playback capture or file drop)
    pcm_b64 = params.pcm_b64;
    sample_rate = params.sample_rate || 16000;
    duration_sec = params.duration_sec || "file";
  } else {
    // Screen share / tab audio ring buffer
    if (!_monitoringTab) {
      throw new Error("No live audio session is active. Play tab audio or drop an audio file.");
    }
    const bufferResponse = await chrome.runtime.sendMessage({
      target: "offscreen-audio",
      type:   "AUDIO_GET_BUFFER",
    });
    if (!bufferResponse || !bufferResponse.ok) {
      throw new Error(bufferResponse?.error || "Could not retrieve audio ring buffer. Allow audio to accumulate.");
    }
    pcm_b64 = bufferResponse.pcm_b64;
    sample_rate = bufferResponse.sample_rate;
    duration_sec = bufferResponse.duration_sec;
  }

  // Check Engine Mode configuration (Local vs ZeroTrue)
  const cfg = await chrome.storage.local.get(["audioEngineMode", "zeroTrueApiKey"]);
  const mode = cfg.audioEngineMode || "auto"; // "auto", "local", "zerotrue"
  const ztKey = String(cfg.zeroTrueApiKey || "").trim();

  const isLocalReady = Boolean(_ws && _ws.readyState === WebSocket.OPEN && _wsAuthOk);
  const useZeroTrue = mode === "zerotrue" || (mode === "auto" && !isLocalReady);

  // If using ZeroTrue Cloud API (for users without local GPU model)
  if (useZeroTrue) {
    if (!ztKey) {
      throw new Error(
        "Local inference model is offline and no ZeroTrue API key was found. " +
        "Please start your local Python service or enter your ZeroTrue API key (from https://zerotrue.app) in extension settings."
      );
    }

    console.info(`[audio-manager] Dispatching ${duration_sec}s audio to ZeroTrue Online API (https://zerotrue.app)...`);
    const float32Data = base64ToFloat32Array(pcm_b64);
    const wavBlob = pcmToWavBlob(float32Data, sample_rate || 16000);
    const durNum = typeof duration_sec === "number" ? duration_sec : Number((float32Data.length / (sample_rate || 16000)).toFixed(2));

    const ztRes = await callZeroTrueAudioApi(wavBlob, ztKey);

    const report = {
      status:             "success",
      source:             "ZeroTrue Cloud API (https://zerotrue.app)",
      duration_sec:       durNum,
      overall_verdict:    ztRes.overall_verdict,
      incidents_count:    ztRes.is_synthetic ? 1 : 0,
      analyzed_windows:   1,
      total_windows:      1,
      model_name:         "ZeroTrue Voice AI Detector (zerotrue.app)",
      engine:             "cloud_zerotrue",
      processing_time_ms: ztRes.processing_time_ms,
      timeline: [
        {
          is_speech: true,
          p_spoof:   ztRes.ai_probability,
          p_bonafide: 1.0 - ztRes.ai_probability,
          cm_score:  ztRes.cm_score,
          category:  ztRes.is_synthetic ? "POSSIBLE_SYNTHETIC_SPEECH" : "LIKELY_NATURAL",
          verdict:   ztRes.is_synthetic ? "Synthetic Speech" : "Verified Genuine",
        }
      ],
      flagged_incidents: ztRes.is_synthetic ? [
        {
          timestamp_range: `00:00.0 - 00:${String(Math.round(durNum)).padStart(2, "0")}.0`,
          description:     ztRes.signals?.length > 0
            ? ztRes.signals.map(s => s.description || s.category).join("; ")
            : `ZeroTrue classified audio as AI-generated (${(ztRes.ai_probability * 100).toFixed(1)}% AI probability)`,
          max_spoof:       ztRes.ai_probability,
          min_cm:          ztRes.cm_score,
        }
      ] : [],
    };

    handleDeepAnalysisResult(report);
    return report;
  }

  // Local GPU WebSocket Engine (127.0.0.1:8765)
  if (!_ws || _ws.readyState !== WebSocket.OPEN || !_wsAuthOk) {
    throw new Error(
      "Local inference service is not running on 127.0.0.1:8765. " +
      "Start the local server or switch to ZeroTrue API (https://zerotrue.app) in extension settings."
    );
  }

  const requestId = `deep-scan-${Date.now()}`;

  // Send deep_analysis request over WebSocket
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pendingDeepAnalysisResolvers.delete(requestId);
      reject(new Error("Deep forensic analysis timed out after 90 seconds."));
    }, 90000);

    _pendingDeepAnalysisResolvers.set(requestId, { resolve, reject, timer });
  });

  _ws.send(JSON.stringify({
    type:        "deep_analysis",
    requestId,
    pcm_b64,
    sample_rate,
    step_sec:    2.0,
  }));

  console.info("[audio-manager] Deep forensic scan dispatched to local model for", duration_sec, "seconds of audio.");
  return promise;
}

function handleDeepAnalysisResult(msg) {
  const reqId = msg.requestId;
  if (reqId && _pendingDeepAnalysisResolvers.has(reqId)) {
    const { resolve, reject, timer } = _pendingDeepAnalysisResolvers.get(reqId);
    clearTimeout(timer);
    _pendingDeepAnalysisResolvers.delete(reqId);
    if (msg.status === "error") {
      reject(new Error(msg.message || "Deep analysis failed on server"));
      return;
    }
    resolve(msg);
  }

  // Store last report in storage for sidepanel forensic review
  chrome.storage.local.set({ lastAudioForensicReport: msg }).catch(() => {});

  // Broadcast to open popup or sidepanel
  chrome.runtime.sendMessage({
    type:   "AUDIO_DEEP_ANALYSIS_COMPLETE",
    report: msg,
  }).catch(() => {});

  // If synthetic speech incidents were found, record incident in session
  if (msg.incidents_count > 0 && _session) {
    for (const inc of msg.flagged_incidents) {
      _session.recordAlert({
        category: "POSSIBLE_SYNTHETIC_SPEECH",
        p_spoof:  inc.max_spoof,
        cm_score: inc.min_cm,
        reason:   inc.description,
      });
    }
    AudioStorage.updateSession(_session.toSummary()).catch(() => {});
  }
}

export async function getLastForensicReport() {
  const data = await chrome.storage.local.get("lastAudioForensicReport");
  return data.lastAudioForensicReport || null;
}

// ---------------------------------------------------------------------------
// Forward PCM chunks from offscreen document to WebSocket server
// ---------------------------------------------------------------------------
export function forwardAudioChunk(payload) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN || !_wsAuthOk) return;
  _ws.send(JSON.stringify({
    type:        "audio_chunk",
    pcm_b64:     payload.pcm_b64,
    sample_rate: payload.sample_rate,
    channels:    payload.channels,
    num_samples: payload.num_samples,
  }));
}

// ---------------------------------------------------------------------------
// Proactively connect to the local inference server at startup
// ---------------------------------------------------------------------------
connectWebSocket().catch(() => {});

/**
 * zerotrue-client.js  –  Mad Eye Moody Lens v2.0
 * ===============================================
 * Client for the ZeroTrue multi-modal Detection API (https://zerotrue.app).
 * Supports file and direct-URL analysis for image, video, and audio content.
 */

"use strict";

const ZEROTRUE_API_BASE         = "https://api.zerotrue.app";
const ZEROTRUE_PRIMARY_ENDPOINT  = `${ZEROTRUE_API_BASE}/api/v1/analyze/file`;
const ZEROTRUE_URL_ENDPOINT      = `${ZEROTRUE_API_BASE}/api/v1/analyze/url`;

/**
 * Convert Float32Array PCM samples into a standard 16-bit PCM .wav Blob.
 */
export function pcmToWavBlob(float32Array, sampleRate = 16000) {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = float32Array.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");

  // Format chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);              // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);    // NumChannels
  view.setUint32(24, sampleRate, true);     // SampleRate
  view.setUint32(28, byteRate, true);       // ByteRate
  view.setUint16(32, blockAlign, true);     // BlockAlign
  view.setUint16(34, 16, true);             // BitsPerSample (16-bit)

  // Data chunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Write 16-bit PCM samples (clamped to [-1, 1], with NaN guard)
  let offset = 44;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = float32Array[i];
    if (isNaN(s)) s = 0;
    const clamped = Math.max(-1, Math.min(1, s));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Decode base64 float32 PCM back into Float32Array
 */
export function base64ToFloat32Array(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/**
 * Safely format error responses from FastAPI / Pydantic validation errors.
 */
export function extractErrorMessage(data, status) {
  if (!data) return `HTTP ${status}`;

  // FastAPI Pydantic detail list: [{ loc: ["body", "api_key"], msg: "field required" }]
  if (Array.isArray(data?.detail)) {
    return data.detail.map(d => {
      const loc = Array.isArray(d?.loc) ? d.loc.filter(x => x !== "body").join(".") : "";
      const msg = d?.msg || "invalid value";
      return loc ? `${loc}: ${msg}` : msg;
    }).join("; ");
  }

  if (typeof data?.detail === "string") return data.detail;
  if (data?.error?.message) return data.error.message;
  if (typeof data?.error === "string") return data.error;
  if (data?.message) return data.message;
  if (typeof data?.raw === "string" && data.raw.trim().length > 0) {
    return data.raw.trim().slice(0, 150);
  }
  return `HTTP ${status}`;
}

/**
 * Send any media file (image, video, audio, etc.) Blob to ZeroTrue API for synthetic media detection.
 * Supports /api/v1/analyze/file with multipart/form-data.
 */
async function readZeroTrueJsonResponse(response, startedAt, endpointLabel = "ZeroTrue") {
  const rawText = await response.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    // Do not flood the extension diagnostics with a full HTML error page.
    const isHtml = /<\s*!doctype\s+html|<\s*html[ >]/i.test(rawText);
    data = { raw: isHtml ? `${endpointLabel} returned an HTML error page (route not found).` : rawText.slice(0, 200) };
  }

  if (!response.ok) {
    const errorDetail = extractErrorMessage(data, response.status);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`ZeroTrue API key invalid or unauthorized: ${errorDetail}`);
    }
    if (response.status === 429) {
      throw new Error(`ZeroTrue API rate limit exceeded. Check your plan at https://zerotrue.app.`);
    }
    throw new Error(`ZeroTrue API error (HTTP ${response.status}): ${errorDetail}`);
  }
  return { data, latencyMs: Date.now() - startedAt };
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

/**
 * Analyze a direct public media-file URL with ZeroTrue.
 *
 * The official API expects multipart form-data fields `url` and `api_key` at
 * POST /api/v1/analyze/url. This is a synchronous endpoint (up to five minutes).
 * It is intended for direct media files whose URL includes a supported extension,
 * not ordinary webpage URLs such as YouTube watch pages.
 */
export async function callZeroTrueUrlApi(mediaUrl, apiKey, timeoutMs = 300000) {
  const cleanKey = String(apiKey || "").trim();
  if (!cleanKey) throw new Error("ZeroTrue API key is not configured. Add your key in settings.");

  let parsed;
  try { parsed = new URL(mediaUrl); }
  catch { throw new Error("Enter a valid public HTTP(S) media-file URL."); }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error("ZeroTrue URL analysis only supports public HTTP(S) media URLs.");
  }

  const formData = new FormData();
  formData.append("url", parsed.toString());
  formData.append("api_key", cleanKey);
  formData.append("is_private_scan", "false");
  formData.append("is_deep_scan", "false");

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(ZEROTRUE_URL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${cleanKey}` },
      body: formData,
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`Could not reach ZeroTrue URL analysis API: ${error.message || "Network error"}`);
  }

  const result = await readZeroTrueJsonResponse(response, startedAt, "ZeroTrue URL API");
  const envelope = result.data?.data || result.data;
  const state = String(envelope?.status || envelope?.result?.status || "").toLowerCase();
  if (["queued", "processing", "pending", "running"].includes(state)) {
    const id = envelope?.id || envelope?.check_id || envelope?.result?.id;
    throw new Error(`ZeroTrue accepted the URL scan${id ? ` (ID ${id})` : ""}, but returned status ${state} instead of a completed result.`);
  }
  if (["failed", "canceled", "cancelled", "expired"].includes(state)) {
    const detail = envelope?.error?.message || envelope?.error?.detail || envelope?.message || envelope?.detail || state;
    throw new Error(`ZeroTrue URL scan ${state}: ${String(detail).slice(0, 220)}`);
  }
  if (state && state !== "completed") {
    throw new Error(`ZeroTrue URL scan returned an unexpected status: ${state}.`);
  }
  return result;
}

export async function callZeroTrueFileApi(fileBlob, apiKey, filename = "file.bin", timeoutMs = 45000) {
  const cleanKey = String(apiKey || "").trim();
  if (!cleanKey) {
    throw new Error("ZeroTrue API key is not configured. Add your key from https://zerotrue.app in settings.");
  }
  if (!(fileBlob instanceof Blob) || fileBlob.size === 0) {
    throw new Error("Choose a non-empty file to analyse with ZeroTrue.");
  }

  // Official file endpoint: multipart fields file, api_key, is_private_scan, is_deep_scan.
  const formData = new FormData();
  formData.append("file", fileBlob, filename);
  formData.append("api_key", cleanKey);
  formData.append("is_private_scan", "false");
  formData.append("is_deep_scan", "false");

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(ZEROTRUE_PRIMARY_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${cleanKey}` },
      body: formData,
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`ZeroTrue file API connection failed: ${error.message || "Network unreachable"}. Check your connection.`);
  }

  return readZeroTrueJsonResponse(response, startedAt, "ZeroTrue file API");
}

/**
 * Send an audio WAV Blob to ZeroTrue API for synthetic voice detection.
 */
export async function callZeroTrueAudioApi(wavBlob, apiKey) {
  const { data, latencyMs } = await callZeroTrueFileApi(wavBlob, apiKey, "playback_audio.wav");
  return parseZeroTrueResponse(data, latencyMs);
}

/**
 * Verify / test a ZeroTrue API Key.
 */
export async function testZeroTrueApiKey(apiKey) {
  const cleanKey = String(apiKey || "").trim();
  if (!cleanKey) throw new Error("Please enter your ZeroTrue API key first.");

  // The official API supports .txt files on the same authenticated file endpoint.
  // Keep the test lightweight and use the same request path as real file scans.
  const probeBlob = new Blob(["ZeroTrue authentication verification ping from Mad-Eye Moody Lens."], { type: "text/plain" });
  await callZeroTrueFileApi(probeBlob, cleanKey, "probe.txt", 15000);
  return { ok: true, message: "ZeroTrue API key verified successfully!" };
}

/**
 * Standardize ZeroTrue response into our complete forensic report format.
 */
export function parseZeroTrueResponse(data, latencyMs = 0) {
  // Support nested: data.data.result, data.result, data.data, or data directly
  const res = data?.data?.result || data?.result || data?.data || data;
  const signals = data?.data?.signals || data?.signals || [];
  const metadata = data?.data?.metadata || data?.metadata || {};

  let aiProb = null;

  if (typeof res?.ai_probability === "number") {
    aiProb = res.ai_probability;
  } else if (typeof res?.combined_probability === "number") {
    aiProb = res.combined_probability;
  } else if (typeof res?.score === "number") {
    aiProb = res.score;
  } else if (typeof res?.human_probability === "number") {
    aiProb = 1.0 - res.human_probability;
  } else if (typeof res?.is_ai === "boolean") {
    aiProb = res.is_ai ? (res.confidence ? res.confidence / 100 : 0.95) : 0.05;
  } else if (typeof res?.isAI === "boolean") {
    aiProb = res.isAI ? (res.confidence ? res.confidence / 100 : 0.95) : 0.05;
  }

  // Fallback to text verdict analysis if probability wasn't explicitly numeric
  if (aiProb === null) {
    const verdictStr = String(res?.verdict || res?.result_type || "").toLowerCase();
    if (verdictStr.includes("ai") || verdictStr.includes("synthetic") || verdictStr.includes("spoof")) {
      aiProb = 0.92;
    } else if (verdictStr.includes("human") || verdictStr.includes("genuine") || verdictStr.includes("bonafide") || verdictStr.includes("natural")) {
      aiProb = 0.08;
    } else {
      aiProb = 0.50; // Inconclusive
    }
  }

  // Scale [0, 100] to [0.0, 1.0] if needed
  if (aiProb > 1.0) {
    aiProb = aiProb / 100;
  }
  aiProb = Math.max(0.0, Math.min(1.0, aiProb));

  const isSynthetic = aiProb >= 0.50 || res?.result_type === "ai";
  const overall_verdict = isSynthetic ? "SUSPICIOUS_AUDIO_DETECTED" : "CLEAN_SPEECH";

  // Calibrated equivalent CM score mapping
  // Synthetic: [-3.0, -0.40] | Genuine: [+0.80, +4.50]
  const cmScore = isSynthetic
    ? -0.40 - (aiProb * 2.6)
    : 0.80 + ((1.0 - aiProb) * 3.7);

  const verdictLabel = res?.verdict || (isSynthetic ? "Synthetic Speech Detected" : "Verified Genuine Speech");

  return {
    status:             "success",
    source:             "ZeroTrue Cloud API (https://zerotrue.app)",
    model_name:         res?.ml_model ? `ZeroTrue (${res.ml_model})` : "ZeroTrue Voice AI Detector (zerotrue.app)",
    engine:             "cloud_zerotrue",
    overall_verdict,
    verdict_label:      verdictLabel,
    is_synthetic:       isSynthetic,
    ai_probability:     aiProb,
    human_probability:  typeof res?.human_probability === "number" ? res.human_probability : (1.0 - aiProb),
    confidence:         isSynthetic ? aiProb : (1.0 - aiProb),
    cm_score:           Number(cmScore.toFixed(2)),
    processing_time_ms: latencyMs,
    signals:            Array.isArray(signals) ? signals : [],
    metadata,
    raw_response:       data,
  };
}

/**
 * Standardize ZeroTrue response for Image Detection.
 */
function zeroTrueResult(data) {
  return data?.data?.result || data?.result || data?.data || data;
}

function zeroTrueProbability(res) {
  for (const field of ["ai_probability", "combined_probability", "score"]) {
    if (typeof res?.[field] === "number" && Number.isFinite(res[field])) {
      const value = res[field] > 1 ? res[field] / 100 : res[field];
      return Math.max(0, Math.min(1, value));
    }
  }
  if (typeof res?.human_probability === "number" && Number.isFinite(res.human_probability)) {
    const human = res.human_probability > 1 ? res.human_probability / 100 : res.human_probability;
    return Math.max(0, Math.min(1, 1 - human));
  }
  if (typeof res?.is_ai === "boolean" || typeof res?.isAI === "boolean") {
    const flag = typeof res.is_ai === "boolean" ? res.is_ai : res.isAI;
    const raw = Number(res.confidence ?? res.confidence_pct ?? res.confidence_percent);
    const conf = Number.isFinite(raw) ? (raw > 1 ? raw / 100 : raw) : 0.95;
    return flag ? conf : 1 - conf;
  }
  const summaryProb = res?.details_summary?.ai_probability_pct ?? res?.details_summary?.ai_probability;
  if (typeof summaryProb === "number" && Number.isFinite(summaryProb)) return Math.max(0, Math.min(1, summaryProb > 1 ? summaryProb / 100 : summaryProb));
  const type = String(res?.result_type || res?.verdict || res?.overall_assessment || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (["human_created", "human", "real", "authentic", "genuine", "clean_speech", "not_ai", "not_ai_generated"].some(v => type === v || type.startsWith(v + "_"))) return 0.08;
  if (["ai", "ai_generated", "synthetic", "deepfake", "fake", "suspicious_audio_detected"].some(v => type === v || type.startsWith(v + "_"))) return 0.92;
  return 0.5;
}

/** Standardize ZeroTrue response for Image Detection. */
export function normalizeZeroTrueImageResponse(data, latencyMs = 0) {
  const res = zeroTrueResult(data);
  const aiProb = zeroTrueProbability(res);
  const isAI = aiProb >= 0.5;
  const confidence = Number((isAI ? aiProb : 1 - aiProb).toFixed(4));
  const verdict = confidence < 0.60 ? "uncertain" : (isAI ? "likely_ai" : "likely_not_ai");
  const model = res?.ml_model ? `ZeroTrue (${res.ml_model})` : "ZeroTrue Universal AI Detector";
  return {
    provider: "zerotrue", providerName: "ZeroTrue", model,
    isAI: aiProb === 0.5 && !res?.result_type ? null : isAI,
    confidence, similarity: null, verdict,
    explanation: res?.feedback || res?.verdict || `ZeroTrue returned ${(aiProb * 100).toFixed(1)}% AI probability.`,
    rawResponse: data, processingTimeMs: latencyMs,
  };
}


/**
 * Standardize ZeroTrue response for Video Detection.
 */
export function normalizeZeroTrueVideoResponse(data, latencyMs = 0) {
  const res = zeroTrueResult(data);
  const aiProb = zeroTrueProbability(res);
  const isAI = aiProb >= 0.5;
  const confidence = Number((isAI ? aiProb : 1 - aiProb).toFixed(4));
  const verdict = confidence < 0.58 ? "uncertain" : (isAI ? "likely_ai" : "likely_not_ai");
  return {
    provider: "zerotrue", providerName: "ZeroTrue Video AI",
    model: res?.ml_model ? `ZeroTrue (${res.ml_model})` : "ZeroTrue Video AI Detector",
    isAI: aiProb === 0.5 && !res?.result_type ? null : isAI,
    confidence, similarity: null, verdict, frameBreakdown: null,
    explanation: res?.feedback || res?.verdict || `ZeroTrue returned ${(aiProb * 100).toFixed(1)}% AI probability for the video.`,
    rawResponse: data, processingTimeMs: latencyMs,
  };
}

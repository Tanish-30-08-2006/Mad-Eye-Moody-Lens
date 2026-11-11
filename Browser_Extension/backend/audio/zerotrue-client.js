/**
 * zerotrue-client.js  –  Mad Eye Moody Lens v2.0
 * ===============================================
 * Client for ZeroTrue Online Audio Detection API (https://zerotrue.app).
 * Provides cloud-based multi-modal synthetic voice and deepfake detection
 * for users without a local GPU / Python engine.
 */

"use strict";

const ZEROTRUE_PRIMARY_ENDPOINT  = "https://api.zerotrue.app/api/v1/analyze/file";
const ZEROTRUE_FALLBACK_ENDPOINT = "https://app.zerotrue.app/api/v1/analyze/file";
const ZEROTRUE_TEXT_ENDPOINT     = "https://api.zerotrue.app/api/v1/analyze/text";
const ZEROTRUE_CHECK_ENDPOINT    = "https://app.zerotrue.app/api/v1/check";

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
 * Send an audio WAV Blob to ZeroTrue API for synthetic voice detection.
 */
export async function callZeroTrueAudioApi(wavBlob, apiKey) {
  const cleanKey = String(apiKey || "").trim();
  if (!cleanKey) {
    throw new Error("ZeroTrue API key is not configured. Add your key from https://zerotrue.app in settings.");
  }

  // ZeroTrue expects multipart/form-data with file, api_key, and is_private_scan
  const formData = new FormData();
  formData.append("file", wavBlob, "playback_audio.wav");
  formData.append("api_key", cleanKey);
  formData.append("is_private_scan", "false");

  const headers = {
    "Authorization": `Bearer ${cleanKey}`,
    "x-api-key": cleanKey,
  };

  const startTime = Date.now();
  let response = null;
  let lastErr = null;

  // 1. Try primary endpoint
  try {
    response = await fetch(ZEROTRUE_PRIMARY_ENDPOINT, {
      method: "POST",
      headers,
      body: formData,
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    lastErr = err;
  }

  // 2. Fallback endpoint if primary failed to connect or 404 / 502 / 503
  if (!response || response.status === 404 || response.status >= 502) {
    try {
      response = await fetch(ZEROTRUE_FALLBACK_ENDPOINT, {
        method: "POST",
        headers,
        body: formData,
        signal: AbortSignal.timeout(45000),
      });
    } catch (err) {
      if (!response) lastErr = err;
    }
  }

  if (!response) {
    throw new Error(`ZeroTrue API connection failed: ${lastErr?.message || "Network unreachable"}. Check your connection.`);
  }

  const rawText = await response.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = { raw: rawText };
  }

  if (!response.ok) {
    const errorDetail = extractErrorMessage(data, response.status);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`ZeroTrue API key invalid or unauthorized: ${errorDetail}`);
    }
    if (response.status === 429) {
      throw new Error(`ZeroTrue API rate limit exceeded. Please wait a moment or check your plan at https://zerotrue.app.`);
    }
    if (response.status === 422) {
      throw new Error(`ZeroTrue API validation error (HTTP 422): ${errorDetail}`);
    }
    throw new Error(`ZeroTrue API error (HTTP ${response.status}): ${errorDetail}`);
  }

  const latencyMs = Date.now() - startTime;
  return parseZeroTrueResponse(data, latencyMs);
}

/**
 * Verify / test a ZeroTrue API Key.
 */
export async function testZeroTrueApiKey(apiKey) {
  const cleanKey = String(apiKey || "").trim();
  if (!cleanKey) throw new Error("Please enter your ZeroTrue API key first.");

  const headers = {
    "Authorization": `Bearer ${cleanKey}`,
    "x-api-key": cleanKey,
  };

  // 1. Attempt lightweight text evaluation probe
  try {
    const textFormData = new FormData();
    textFormData.append("text", "Verification ping.");
    textFormData.append("api_key", cleanKey);
    textFormData.append("is_private_scan", "false");

    const textRes = await fetch(ZEROTRUE_TEXT_ENDPOINT, {
      method: "POST",
      headers,
      body: textFormData,
      signal: AbortSignal.timeout(12000),
    });

    if (textRes.ok) {
      return { ok: true, message: "ZeroTrue API key verified successfully!" };
    }

    const raw = await textRes.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (textRes.status === 401 || textRes.status === 403) {
      const err = extractErrorMessage(data, textRes.status);
      throw new Error(`ZeroTrue API key invalid or unauthorized (${err})`);
    }
    if (textRes.status === 429) {
      throw new Error("ZeroTrue API rate limit reached. Key is valid but quota exceeded.");
    }
  } catch (err) {
    if (err.message.includes("invalid or unauthorized") || err.message.includes("rate limit")) {
      throw err;
    }
    // Fall through to audio probe if text endpoint isn't enabled on this plan
  }

  // 2. Fallback: 1.0s WAV audio probe to file endpoint
  const dummySamples = new Float32Array(16000);
  const dummyWav = pcmToWavBlob(dummySamples, 16000);

  const fileFormData = new FormData();
  fileFormData.append("file", dummyWav, "probe.wav");
  fileFormData.append("api_key", cleanKey);
  fileFormData.append("is_private_scan", "false");

  let response;
  try {
    response = await fetch(ZEROTRUE_PRIMARY_ENDPOINT, {
      method: "POST",
      headers,
      body: fileFormData,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    try {
      response = await fetch(ZEROTRUE_FALLBACK_ENDPOINT, {
        method: "POST",
        headers,
        body: fileFormData,
        signal: AbortSignal.timeout(15000),
      });
    } catch (e2) {
      throw new Error(`Failed to reach ZeroTrue API: ${err.message || e2.message || "Network unreachable"}`);
    }
  }

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }

  if (!response.ok) {
    const errorMsg = extractErrorMessage(data, response.status);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`ZeroTrue API key invalid or unauthorized: ${errorMsg}`);
    }
    if (response.status === 429) {
      throw new Error(`ZeroTrue API rate limit exceeded: ${errorMsg}`);
    }
    if (response.status === 422) {
      throw new Error(`ZeroTrue API validation error: ${errorMsg}`);
    }
    throw new Error(`ZeroTrue API error: ${errorMsg}`);
  }

  return { ok: true, message: "ZeroTrue API key verified successfully." };
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

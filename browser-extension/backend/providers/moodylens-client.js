/**
 * moodylens-client.js – Mad-Eye Moody Lens server provider (functional-ui-models-backend, /api/v1).
 * =================================================================================================
 * The team's own backend, available as one more provider next to BitMind / ZeroTrue / custom:
 *   image -> POST /analyze/image   (Organika/sdxl-detector + EfficientNet-B0 face model)
 *   audio -> POST /analyze/audio   (MelodyMachine/Deepfake-audio-detection-V2, 4 s windows)
 *   video -> POST /analyze/video   (202, then GET /jobs/{id}; 24 frames + soundtrack)
 *
 * Results are normalised to the exact shapes the image engine, the video engine and the audio
 * forensic report already use, so the popup / side panel need no new rendering code.
 *
 * Security: HTTPS for remote servers, plain HTTP only for loopback (the laptop demo binds
 * 127.0.0.1:8080); no cookies, no redirects; the server origin must be granted as an optional
 * host permission (same rule as the Custom REST provider).
 */

"use strict";

export const DEFAULT_SERVER_URL = "http://127.0.0.1:8080";
export const PROVIDER_ID = "moodylens";
export const PROVIDER_NAME = "Mad-Eye Moody Lens server";

// Must match MML_MAX_*_MB on the server (functional-ui-models-backend/.env.example).
export const MAX_BYTES = { image: 10 * 1024 * 1024, audio: 25 * 1024 * 1024, video: 100 * 1024 * 1024 };
// Must match MML_BAND_LOW / MML_BAND_HIGH (used only where the client aggregates by itself).
export const BAND_LOW = 0.35;
export const BAND_HIGH = 0.65;

const SYNC_TIMEOUT_MS = 45000;            // the API waits <= 30 s for image/audio, plus upload time
const VIDEO_POLL_MS = 2000;
const VIDEO_TIMEOUT_MS = 4.5 * 60 * 1000; // stay inside the MV3 service worker's 5-minute event budget

const TASK_LABELS = {
  ai_generated_image: "AI-generated image",
  face_manipulation:  "Face manipulation",
  synthetic_speech:   "Synthetic speech",
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Normalised base URL (origin + optional path prefix, no trailing slash); throws a user-facing Error. */
export function validateServerUrl(raw) {
  let url;
  try { url = new URL(String(raw || "").trim()); }
  catch { throw new Error("Enter the Mad-Eye Moody Lens server address, e.g. http://127.0.0.1:8080"); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new Error("Use an HTTPS server address. Plain HTTP is allowed only for this computer (127.0.0.1 / localhost).");
  }
  if (url.username || url.password) throw new Error("Do not put credentials in the server address; use the API key field.");
  if (url.hash || url.search) throw new Error("The server address must not contain a query or fragment.");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function serverUrlIsValid(raw) {
  try { validateServerUrl(raw); return true; } catch { return false; }
}

export function originPattern(baseUrl) {
  return `${new URL(baseUrl).origin}/*`;
}

/** {baseUrl, apiKey, updatedAt} from storage (settings pages save it via SAVE_MOODYLENS_SERVER_CONFIG). */
export async function getServerConfig() {
  const s = await chrome.storage.local.get({
    moodyLensServerUrl: DEFAULT_SERVER_URL, moodyLensApiKey: "", moodyLensUpdatedAt: 0,
  });
  return { baseUrl: s.moodyLensServerUrl, apiKey: s.moodyLensApiKey, updatedAt: s.moodyLensUpdatedAt };
}

/** Valid address AND its host permission granted. */
export async function serverIsUsable(cfg) {
  if (!cfg || !serverUrlIsValid(cfg.baseUrl)) return false;
  try { return await chrome.permissions.contains({ origins: [originPattern(validateServerUrl(cfg.baseUrl))] }); }
  catch { return false; }
}

async function request(cfg, path, { method = "GET", body = null, timeoutMs = SYNC_TIMEOUT_MS } = {}) {
  const base = validateServerUrl(cfg.baseUrl);
  const headers = { "X-Client": "chrome-extension" };
  if (cfg.apiKey) headers["X-API-Key"] = String(cfg.apiKey).trim();
  let response;
  try {
    response = await fetch(`${base}/api/v1${path}`, {
      method, headers, body, credentials: "omit", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError") throw new Error("The Mad-Eye Moody Lens server did not answer in time.");
    throw new Error(`Cannot reach the Mad-Eye Moody Lens server at ${base}. Is it running?`);
  }
  if (response.status === 204) return null;
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    // The API's {"error": "..."} messages are plain language and meant to be shown verbatim.
    const message = typeof data?.error === "string" && data.error
      ? data.error
      : `Mad-Eye Moody Lens server returned HTTP ${response.status}.`;
    const err = new Error(message.slice(0, 500));
    err.status = response.status;
    throw err;
  }
  return data;
}

function uploadForm(blob, name) {
  const form = new FormData();
  // Generic name: the API ignores names and MIME types (it sniffs bytes), and the original
  // file name is never sent (privacy rule).
  form.append("file", blob, name);
  return form;
}

function checkSize(kind, blob) {
  if (blob.size > MAX_BYTES[kind]) {
    throw new Error(`The ${kind} is larger than the server's ${MAX_BYTES[kind] / (1024 * 1024)} MB limit.`);
  }
}

/** Image or audio: synchronous AnalysisResult. */
export async function analyzeBlob(kind, blob, cfg) {
  if (kind !== "image" && kind !== "audio") throw new Error(`Unsupported kind: ${kind}`);
  checkSize(kind, blob);
  return request(cfg, `/analyze/${kind}`, { method: "POST", body: uploadForm(blob, `upload.${kind}`) });
}

/** Video: start the job, poll until done; cancels the job if the budget runs out. */
export async function analyzeVideoBlob(blob, cfg, { onProgress } = {}) {
  checkSize("video", blob);
  const job = await request(cfg, "/analyze/video", { method: "POST", body: uploadForm(blob, "upload.video") });
  const deadline = Date.now() + VIDEO_TIMEOUT_MS;
  let current = job;
  while (true) {
    if (current.status === "done" && current.result) return current.result;
    if (current.status === "failed") throw new Error(current.error || "The video analysis failed.");
    if (Date.now() >= deadline) {
      await request(cfg, `/jobs/${encodeURIComponent(job.job_id)}`, { method: "DELETE" }).catch(() => {});
      throw new Error("The video analysis took too long and was cancelled. Try a shorter clip.");
    }
    try { onProgress?.(current); } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, VIDEO_POLL_MS));
    current = await request(cfg, `/jobs/${encodeURIComponent(job.job_id)}`);
  }
}

/** Readiness + model list for the settings page's "Test connection" button. */
export async function checkServer(cfg) {
  const [ready, models] = await Promise.all([
    request(cfg, "/ready").then(body => ({ ready: true, body })).catch(error => ({ ready: false, error: error.message })),
    request(cfg, "/models").catch(() => []),
  ]);
  return { ...ready, models };
}

// ---------------------------------------------------------------------------
// Normalisers to the extension's existing response shapes
// ---------------------------------------------------------------------------
function modelSummary(result) {
  return (result.scores || []).map(s => s.model).filter(Boolean).join(" + ") || "Mad-Eye Moody Lens";
}

function explanationFor(result) {
  const parts = (result.scores || []).map(s =>
    `${TASK_LABELS[s.task] || s.task} ${(s.fake_probability * 100).toFixed(1)}%`);
  const overall = `${(result.fake_probability * 100).toFixed(1)}%`;
  return parts.length > 1
    ? `Overall fake probability ${overall} (checks: ${parts.join(", ")}).`
    : `Fake probability ${overall}${parts.length ? ` (${parts[0]})` : ""}.`;
}

/** Server verdict bands -> the engines' verdict vocabulary. */
function engineVerdict(serverVerdict) {
  return { likely_fake: "likely_ai", likely_real: "likely_not_ai", uncertain: "uncertain" }[serverVerdict] || "unknown";
}

function decision(p) {
  const isAI = p >= 0.5;
  return { isAI, confidence: Number((isAI ? p : 1 - p).toFixed(4)) };
}

/** AnalysisResult -> image engine response (ProviderEngine.normalize*Response shape). */
export function toImageResponse(result) {
  return {
    provider: PROVIDER_ID,
    providerName: PROVIDER_NAME,
    model: modelSummary(result),
    ...decision(result.fake_probability),
    similarity: null,
    verdict: engineVerdict(result.verdict),
    explanation: explanationFor(result),
    analysisId: result.analysis_id,
    explanationAvailable: Boolean(result.explanation_available),
    rawResponse: result,
  };
}

/** AnalysisResult (video) -> video engine response (VideoProviderEngine shape, with frameBreakdown). */
export function toVideoResponse(result) {
  const frameBreakdown = (result.segments || []).map((s, index) => ({
    index, timestamp: s.start, isAI: s.fake_probability >= 0.5, confidence: Number(s.fake_probability.toFixed(4)),
  }));
  const d = result.details || {};
  let explanation = explanationFor(result);
  if (typeof d.frames_sampled === "number") {
    explanation += ` Faces found in ${d.frames_with_face ?? 0}/${d.frames_sampled} sampled frames.`;
  }
  if (!("audio_checked" in d)) explanation += " No usable soundtrack (none or silent).";
  return {
    provider: PROVIDER_ID,
    providerName: PROVIDER_NAME,
    model: modelSummary(result),
    ...decision(result.fake_probability),
    similarity: null,
    verdict: engineVerdict(result.verdict),
    frameBreakdown,
    explanation,
    analysisId: result.analysis_id,
    rawResponse: result,
  };
}

/** Several frame-level image results -> one video response (mean, like the server's video detector). */
export function framesToVideoResponse(frames) {
  const p = frames.reduce((acc, f) => acc + f.result.fake_probability, 0) / frames.length;
  const verdict = p >= BAND_HIGH ? "likely_ai" : p <= BAND_LOW ? "likely_not_ai" : "uncertain";
  const flagged = frames.filter(f => f.result.fake_probability >= 0.5).length;
  return {
    provider: PROVIDER_ID,
    providerName: PROVIDER_NAME,
    model: `${modelSummary(frames[0].result)} (frame analysis)`,
    ...decision(p),
    similarity: null,
    verdict,
    frameBreakdown: frames.map((f, index) => ({
      index, timestamp: f.timestamp ?? index, isAI: f.result.fake_probability >= 0.5,
      confidence: Number(f.result.fake_probability.toFixed(4)),
    })),
    explanation: `Mean fake probability ${(p * 100).toFixed(1)}% over ${frames.length} captured frame(s); ${flagged} flagged.`,
    rawResponse: { frameResults: frames.map(f => f.result) },
  };
}

function clock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Log-odds of genuine vs spoof: the sign convention of anti-spoofing CM scores (positive = genuine). */
function cmScore(p) {
  const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4);
  return Number(Math.max(-5, Math.min(5, Math.log((1 - q) / q))).toFixed(2));
}

function windowCategory(p) {
  if (p >= BAND_HIGH) return ["POSSIBLE_SYNTHETIC_SPEECH", "Synthetic Speech"];
  if (p <= BAND_LOW) return ["LIKELY_NATURAL", "Verified Genuine"];
  return ["UNCERTAIN", "Uncertain"];
}

/** AnalysisResult (audio) -> the deep forensic report shape used by the side panel. */
export function toAudioReport(result, durationSec) {
  const segments = result.segments || [];
  const timeline = segments.map((s, i) => {
    const [category, verdict] = windowCategory(s.fake_probability);
    return {
      window_index: i,
      start_sec: s.start,
      end_sec: s.end,
      timestamp_range: `${clock(s.start)} - ${clock(s.end)}`,
      is_speech: true,
      category,
      verdict,
      p_spoof: s.fake_probability,
      p_bonafide: 1 - s.fake_probability,
      cm_score: cmScore(s.fake_probability),
    };
  });
  const flagged = timeline.filter(w => w.category === "POSSIBLE_SYNTHETIC_SPEECH");
  const overall = {
    likely_fake: "SUSPICIOUS_AUDIO_DETECTED", likely_real: "CLEAN_SPEECH", uncertain: "UNCERTAIN",
  }[result.verdict] || "UNCERTAIN";
  return {
    status: "success",
    source: PROVIDER_NAME,
    duration_sec: result.details?.duration_s ?? durationSec,
    overall_verdict: overall,
    verdict_label: { likely_fake: "Synthetic Speech Detected", likely_real: "Verified Genuine Speech" }[result.verdict]
      || "Inconclusive",
    incidents_count: flagged.length,
    analyzed_windows: timeline.length,
    total_windows: timeline.length,
    model_name: modelSummary(result),
    engine: "moodylens_server",
    processing_time_ms: result.processing_ms,
    ai_probability: result.fake_probability,
    timeline,
    flagged_incidents: flagged.map(w => ({
      timestamp_range: w.timestamp_range,
      description: `Synthetic speech probability ${(w.p_spoof * 100).toFixed(1)}% in this 4-second window`,
      max_spoof: w.p_spoof,
      min_cm: w.cm_score,
    })),
    disclaimer: result.disclaimer,
    analysis_id: result.analysis_id,
  };
}

/**
 * Typed client for the Mad-Eye Moody Lens API (/api/v1).
 * Mirrors backend/app/schemas.py field for field — treat it as the contract.
 * If you change a Pydantic model, change the matching interface here (or
 * regenerate with: npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.ts).
 */

export type Verdict = "likely_real" | "uncertain" | "likely_fake";
export type MediaType = "image" | "audio" | "video";

/** Task strings emitted by backend/app/services/analysis.py */
export type Task = "ai_generated_image" | "face_manipulation" | "synthetic_speech";

export interface Segment {
  start: number;
  end: number;
  fake_probability: number;
}

export interface ModelScore {
  model: string;
  task: Task | string;
  fake_probability: number;
}

/**
 * Keys the backend puts in `details`, per media type:
 *  image: faces_found
 *  audio: duration_s
 *  video: frames_sampled, frames_with_face, max_frame_probability,
 *         fraction_flagged, audio_checked (absent = no audio track)
 */
export interface AnalysisDetails {
  faces_found?: number;
  duration_s?: number;
  frames_sampled?: number;
  frames_with_face?: number;
  max_frame_probability?: number;
  fraction_flagged?: number;
  audio_checked?: boolean;
  [key: string]: unknown;
}

export interface AnalysisResult {
  analysis_id: string;
  media_type: MediaType;
  verdict: Verdict;
  fake_probability: number;
  scores: ModelScore[];
  segments: Segment[];
  details: AnalysisDetails;
  processing_ms: number;
  disclaimer: string;
  /** API 1.1: model id -> pinned revision used for this result. */
  model_versions?: Record<string, string>;
  /** API 1.1: true when GET /analyses/{id}/explanation has Grad-CAM heatmaps. */
  explanation_available?: boolean;
  api_version?: string;
}

export type JobStage = "queued" | "frames" | "audio" | "finalising";

export interface JobStatus {
  job_id: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  result?: AnalysisResult | null;
  error?: string | null;
  /** API 1.1: what a running video job is doing (progress holds at 1.0 after "frames"). */
  stage?: JobStage | null;
}

/** One explained face: attention map + where it sits; never image pixels. */
export interface FaceHeatmap {
  source: "image" | "frame";
  time_s?: number | null;
  face_index: number;
  /** x0, y0, x1, y1 in the original image/frame pixels (crop incl. 25% margin). */
  box: [number, number, number, number];
  fake_probability: number;
  /** base64 PNG, 224×224 8-bit greyscale: 0 = no attention, 255 = most. */
  heatmap_png: string;
}

/** GET /api/v1/analyses/{id}/explanation — Grad-CAM from the EfficientNet-B0 face model. */
export interface Explanation {
  analysis_id: string;
  model: string;
  method: "grad-cam";
  target_class: "fake";
  layer: string;
  items: FaceHeatmap[];
}

/** GET /api/v1/models — registry keys are image | face | audio | video */
export interface ModelInfo {
  key: string;
  name: string;
  media_type: string;
  loaded: boolean;
}

/**
 * "" (empty) = same origin: the production build is served by nginx next to /api,
 * so calls go to relative /api/v1/... paths and no CORS is needed.
 */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** AnalysisError -> {error}; HTTPException -> {detail: str}; validation -> {detail: [...]}. */
function messageFrom(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error;
    if (typeof b.detail === "string") return b.detail;
    if (Array.isArray(b.detail) && b.detail[0]?.msg) return String(b.detail[0].msg);
  }
  if (status === 413) return "File is too large for the server.";
  if (status === 415) return "Unsupported file format.";
  return `Request failed (${status}).`;
}

const unreachable = () =>
  new ApiError(`Cannot reach the analysis server at ${API_BASE || window.location.origin}. Is the backend running?`, 0);

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    throw unreachable();
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(messageFrom(res.status, body), res.status);
  return body as T;
}

/**
 * Multipart upload via XHR so the UI can show real upload progress
 * (fetch has no upload progress events) — matters for 100 MB videos.
 */
function upload<T>(path: string, file: File, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    xhr.responseType = "json";
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      const body = xhr.response ?? {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(messageFrom(xhr.status, body), xhr.status));
    };
    xhr.onerror = () => reject(unreachable());
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

type Progress = (fraction: number) => void;

export const analyzeImage = (f: File, p?: Progress) =>
  upload<AnalysisResult>("/api/v1/analyze/image", f, p);
export const analyzeAudio = (f: File, p?: Progress) =>
  upload<AnalysisResult>("/api/v1/analyze/audio", f, p);
/** 202 Accepted — poll getJob() until status is done or failed. */
export const startVideoJob = (f: File, p?: Progress) =>
  upload<JobStatus>("/api/v1/analyze/video", f, p);

export const getJob = (id: string) => getJson<JobStatus>(`/api/v1/jobs/${encodeURIComponent(id)}`);
export const getAnalysis = (id: string) =>
  getJson<AnalysisResult>(`/api/v1/analyses/${encodeURIComponent(id)}`);
export const getExplanation = (id: string) =>
  getJson<Explanation>(`/api/v1/analyses/${encodeURIComponent(id)}/explanation`);
export const listModels = () => getJson<ModelInfo[]>("/api/v1/models");
export const health = () => getJson<{ status: string }>("/api/v1/health");

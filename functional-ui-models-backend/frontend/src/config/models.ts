/**
 * Frontend view of the Sprint 2 model selection.
 * Must stay in sync with backend/app/core/config.py defaults:
 *   MML_IMAGE_MODEL_ID = Organika/sdxl-detector
 *   MML_FACE_MODEL_URL = Xicor9/efficientnet-b0-ffpp-c23 (.pth)
 *   MML_AUDIO_MODEL_ID = MelodyMachine/Deepfake-audio-detection-V2
 *   MML_VIDEO_FRAMES = 24, MML_VIDEO_CHECK_AUDIO = true, MML_AUDIO_WINDOW_S = 4.0
 *   MML_MAX_IMAGE_MB = 10, MML_MAX_AUDIO_MB = 25, MML_MAX_VIDEO_MB = 100
 *   MML_BAND_LOW = 0.35, MML_BAND_HIGH = 0.65
 * The live model names shown on the page come from GET /api/v1/models;
 * this file only supplies descriptions, licences and limits.
 */
import type { MediaType, Task, Verdict } from "../api/client";

export type RegistryKey = "image" | "face" | "audio";

export interface ModelSpec {
  key: RegistryKey;
  id: string;
  task: Task;
  checkName: string;
  architecture: string;
  family: "CNN" | "Transformer";
  input: string;
  trainedOn: string;
  licence: string;
  url: string;
  weakness: string;
}

export const MODELS: Record<RegistryKey, ModelSpec> = {
  image: {
    key: "image",
    id: "Organika/sdxl-detector",
    task: "ai_generated_image",
    checkName: "AI-generated image check",
    architecture: "Swin Transformer",
    family: "Transformer",
    input: "Whole RGB image, HF image-classification pipeline",
    trainedOn: "Fine-tuned from umm-maybe/AI-image-detector on Wikimedia vs SDXL pairs",
    licence: "CC BY-NC 3.0 (non-commercial)",
    url: "https://huggingface.co/Organika/sdxl-detector",
    weakness: "Weaker on older GANs and generators unlike SDXL; heavy compression or screenshots can shift scores.",
  },
  face: {
    key: "face",
    id: "Xicor9/efficientnet-b0-ffpp-c23",
    task: "face_manipulation",
    checkName: "Face manipulation check",
    architecture: "EfficientNet-B0 CNN",
    family: "CNN",
    input: "Haar-cascade face crops (25% margin, up to 4 faces), resized to 224 × 224",
    trainedOn: "FaceForensics++ C23 — DeepFakes, FaceSwap, Face2Face, NeuralTextures",
    licence: "MIT, stated for research / education use",
    url: "https://huggingface.co/Xicor9/efficientnet-b0-ffpp-c23",
    weakness: "Needs a visible, mostly frontal face; profile views, tiny faces and unseen manipulation methods reduce reliability.",
  },
  audio: {
    key: "audio",
    id: "MelodyMachine/Deepfake-audio-detection-V2",
    task: "synthetic_speech",
    checkName: "Synthetic speech check",
    architecture: "wav2vec2-family Transformer",
    family: "Transformer",
    input: "16 kHz mono, scored in 4-second windows",
    trainedOn: "Real vs synthetic speech (see model card)",
    licence: "Apache-2.0",
    url: "https://huggingface.co/MelodyMachine/Deepfake-audio-detection-V2",
    weakness: "Music, heavy noise and clips under 0.5 s are unreliable or rejected; new voice-cloning systems may evade it.",
  },
};

export const TASK_TO_MODEL: Record<Task, RegistryKey> = {
  ai_generated_image: "image",
  face_manipulation: "face",
  synthetic_speech: "audio",
};

export interface MediaSpec {
  type: MediaType;
  label: string;
  maxMb: number;
  /** <input accept> — mirrors ALLOWED in backend/app/core/uploads.py */
  accept: string;
  extensions: string[];
  formatsLabel: string;
  /** Which registry models run for this media type, in order. */
  pipeline: RegistryKey[];
  pipelineNote: string;
  mode: "sync" | "job";
}

export const VIDEO_FRAMES = 24;
export const AUDIO_WINDOW_S = 4;
/** VideoDetector(threshold=0.5) — used for fraction_flagged. */
export const FRAME_FLAG_THRESHOLD = 0.5;

export const MEDIA: Record<MediaType, MediaSpec> = {
  image: {
    type: "image",
    label: "Image",
    maxMb: 10,
    accept: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
    extensions: ["jpg", "jpeg", "png", "webp"],
    formatsLabel: "JPG · PNG · WEBP",
    pipeline: ["image", "face"],
    pipelineNote:
      "The whole image is scored by the SDXL detector. If a face is found, each face crop is also scored by the EfficientNet-B0 CNN.",
    mode: "sync",
  },
  audio: {
    type: "audio",
    label: "Audio",
    maxMb: 25,
    accept: "audio/*,.wav,.mp3,.flac,.ogg,.m4a",
    extensions: ["wav", "mp3", "flac", "ogg", "m4a"],
    formatsLabel: "WAV · MP3 · FLAC · OGG · M4A",
    pipeline: ["audio"],
    pipelineNote:
      "Resampled to 16 kHz mono and scored in 4-second windows, so you can see where in the clip the synthetic speech sits.",
    mode: "sync",
  },
  video: {
    type: "video",
    label: "Video",
    maxMb: 100,
    accept: "video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo,.mp4,.webm,.mov,.mkv,.avi",
    extensions: ["mp4", "webm", "mov", "mkv", "avi"],
    formatsLabel: "MP4 · MOV · WEBM · MKV · AVI",
    pipeline: ["face", "audio"],
    pipelineNote: `${VIDEO_FRAMES} frames are sampled evenly; faces in each are scored by the EfficientNet-B0 CNN. The audio track is extracted and scored by the speech model.`,
    mode: "job",
  },
};

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? n : d;
};

export const BANDS = {
  low: num(import.meta.env.VITE_BAND_LOW, 0.35),
  high: num(import.meta.env.VITE_BAND_HIGH, 0.65),
};

export const VERDICT_TEXT: Record<Verdict, { title: string; short: string }> = {
  likely_real: { title: "Likely authentic", short: "Authentic" },
  uncertain: { title: "Uncertain — inspect manually", short: "Uncertain" },
  likely_fake: { title: "Likely AI-generated or manipulated", short: "Manipulated" },
};

/** Client-side mirror of verdict_for() — used only for per-check labels. */
export function verdictFor(p: number): Verdict {
  if (p >= BANDS.high) return "likely_fake";
  if (p <= BANDS.low) return "likely_real";
  return "uncertain";
}

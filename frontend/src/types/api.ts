// API types matching backend Pydantic schemas

export type ModelStatus =
  | 'not_configured'
  | 'missing_weights'
  | 'missing_dependencies'
  | 'ready'
  | 'error'

export type PredictionStatus = 'success' | 'unavailable' | 'error'

export type Modality = 'image' | 'audio' | 'video'

export interface ModelInfo {
  model_id: string
  name: string
  modality: Modality
  framework: string | null
  status: ModelStatus
  weight_available: boolean
  runtime_available: boolean
  expected_input: string
  configuration_notes: string
  integration_instructions: string
}

export interface ModelListResponse {
  models: ModelInfo[]
  configured_count: number
  unavailable_count: number
}

export interface HealthResponse {
  status: string
  version: string
  models_configured: number
  models_unavailable: number
}

export interface ImageMetadata {
  filename: string
  content_type: string
  size_bytes: number
  width: number | null
  height: number | null
  mode: string | null
}

export interface ImagePredictionResponse {
  model_id: string
  status: PredictionStatus
  predicted_label: string | null
  score: number | null
  score_type: string | null
  real_score: number | null
  fake_score: number | null
  inference_time_ms: number | null
  visualization_url: string | null
  metadata: ImageMetadata | null
  error: string | null
  unavailable_reason: string | null
}

export interface AudioMetadata {
  filename: string
  content_type: string
  size_bytes: number
  duration_sec: number | null
  sample_rate: number | null
  channels: number | null
  bit_depth: number | null
  codec: string | null
}

export interface AudioPredictionResponse {
  model_id: string
  status: PredictionStatus
  predicted_label: string | null
  score: number | null
  score_type: string | null
  inference_time_ms: number | null
  metadata: AudioMetadata | null
  error: string | null
  unavailable_reason: string | null
}

export interface VideoMetadata {
  filename: string
  content_type: string
  size_bytes: number
  duration_sec: number | null
  width: number | null
  height: number | null
  fps: number | null
  total_frames: number | null
  has_audio: boolean
  codec: string | null
}

export interface ExtractedFrame {
  frame_index: number
  timestamp_sec: number
  frame_url: string | null
  width: number | null
  height: number | null
}

export interface FramePrediction {
  frame_index: number
  timestamp_sec: number
  model_id: string
  status: PredictionStatus
  predicted_label: string | null
  score: number | null
  real_score: number | null
  fake_score: number | null
  inference_time_ms: number | null
  error: string | null
  unavailable_reason: string | null
}

export interface VideoSummary {
  overall_status: PredictionStatus
  frames_analyzed: number
  fake_frame_count: number | null
  real_frame_count: number | null
  mean_fake_score: number | null
  verdict: string | null
  unavailable_reason: string | null
}

export interface VideoPredictionResponse {
  model_id: string
  status: PredictionStatus
  metadata: VideoMetadata | null
  extracted_frames: ExtractedFrame[]
  frame_predictions: FramePrediction[]
  audio_result: AudioPredictionResponse | null
  summary: VideoSummary | null
  error: string | null
  unavailable_reason: string | null
}

export interface AnalysisHistoryItem {
  id: string
  modality: Modality
  filename: string
  timestamp: string
  status: PredictionStatus
  model_id: string
  summary: string | null
}

export interface HistoryResponse {
  items: AnalysisHistoryItem[]
  total: number
}

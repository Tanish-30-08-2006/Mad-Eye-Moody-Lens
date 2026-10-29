import axios from 'axios'
import type {
  AudioPredictionResponse,
  HealthResponse,
  HistoryResponse,
  ImagePredictionResponse,
  ModelInfo,
  ModelListResponse,
  VideoPredictionResponse,
} from '../types/api'

const api = axios.create({
  baseURL: '/api',
  timeout: 120_000,
})

// ── Health ────────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health')
  return data
}

// ── Models ────────────────────────────────────────────────────────────────────

export async function fetchModels(): Promise<ModelListResponse> {
  const { data } = await api.get<ModelListResponse>('/models')
  return data
}

export async function fetchModel(modelId: string): Promise<ModelInfo> {
  const { data } = await api.get<ModelInfo>(`/models/${modelId}`)
  return data
}

// ── Predictions ───────────────────────────────────────────────────────────────

export async function predictImage(file: File): Promise<ImagePredictionResponse> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<ImagePredictionResponse>('/predict/image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function predictAudio(file: File): Promise<AudioPredictionResponse> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<AudioPredictionResponse>('/predict/audio', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function predictVideo(
  file: File,
  maxFrames: number = 16,
  intervalSec?: number,
  analyzeAudio: boolean = false,
): Promise<VideoPredictionResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('max_frames', String(maxFrames))
  if (intervalSec != null) form.append('interval_sec', String(intervalSec))
  form.append('analyze_audio', String(analyzeAudio))
  const { data } = await api.post<VideoPredictionResponse>('/predict/video', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

// ── History ───────────────────────────────────────────────────────────────────

export async function fetchHistory(limit = 20): Promise<HistoryResponse> {
  const { data } = await api.get<HistoryResponse>('/history', { params: { limit } })
  return data
}

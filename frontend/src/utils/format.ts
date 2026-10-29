import { clsx, type ClassValue } from 'clsx'
import type { ModelStatus, PredictionStatus } from '../types/api'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function modelStatusLabel(status: ModelStatus): string {
  const map: Record<ModelStatus, string> = {
    not_configured: 'Not Configured',
    missing_weights: 'Missing Weights',
    missing_dependencies: 'Missing Dependencies',
    ready: 'Ready',
    error: 'Error',
  }
  return map[status] ?? status
}

export function modelStatusVariant(
  status: ModelStatus,
): 'success' | 'warning' | 'error' | 'neutral' | 'info' {
  if (status === 'ready') return 'success'
  if (status === 'error') return 'error'
  if (status === 'missing_weights' || status === 'missing_dependencies') return 'warning'
  return 'neutral'
}

export function predictionStatusVariant(
  status: PredictionStatus,
): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'success') return 'success'
  if (status === 'error') return 'error'
  return 'neutral'
}

export function truncate(s: string, max = 40): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Image, Music, Video, Activity, Clock, ArrowRight, AlertCircle } from 'lucide-react'
import { fetchHealth, fetchHistory, fetchModels } from '../api/client'
import type { AnalysisHistoryItem, HealthResponse, ModelListResponse } from '../types/api'
import { ModelStatusBadge } from '../components/ui/ModelStatusBadge'
import { Spinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import { formatBytes, formatTimestamp, predictionStatusVariant } from '../utils/format'

const modalityIcon: Record<string, React.ElementType> = {
  image: Image,
  audio: Music,
  video: Video,
}

export function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [models, setModels] = useState<ModelListResponse | null>(null)
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [h, m, hist] = await Promise.all([fetchHealth(), fetchModels(), fetchHistory(10)])
        if (!cancelled) {
          setHealth(h)
          setModels(m)
          setHistory(hist.items)
        }
      } catch (e: any) {
        if (!cancelled) setError('Could not connect to the backend API.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const quickActions = [
    { to: '/image', icon: Image, label: 'Analyse Image', color: 'text-violet-400' },
    { to: '/audio', icon: Music, label: 'Analyse Audio', color: 'text-sky-400' },
    { to: '/video', icon: Video, label: 'Analyse Video', color: 'text-emerald-400' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Multimodal deepfake detection — upload media and inspect results.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/50 rounded-lg p-4 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error} — make sure the backend is running on port 8000.
        </div>
      )}

      {/* Status row */}
      {loading ? (
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <Spinner size="sm" /> Connecting to backend…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card-sm flex items-center gap-3">
            <Activity className="w-5 h-5 text-brand-400" />
            <div>
              <p className="text-xs text-gray-500">API Status</p>
              <p className="text-sm font-semibold text-emerald-400">{health?.status ?? '—'}</p>
            </div>
          </div>
          <div className="card-sm flex items-center gap-3">
            <div className="w-5 h-5 flex items-center justify-center">
              <span className="text-base">🟢</span>
            </div>
            <div>
              <p className="text-xs text-gray-500">Configured Models</p>
              <p className="text-sm font-semibold text-white">{models?.configured_count ?? 0}</p>
            </div>
          </div>
          <div className="card-sm flex items-center gap-3">
            <div className="w-5 h-5 flex items-center justify-center">
              <span className="text-base">⚪</span>
            </div>
            <div>
              <p className="text-xs text-gray-500">Unavailable Models</p>
              <p className="text-sm font-semibold text-amber-400">{models?.unavailable_count ?? 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <p className="section-label mb-3">Quick Actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickActions.map(({ to, icon: Icon, label, color }) => (
            <Link
              key={to}
              to={to}
              className="card hover:border-gray-700 transition-colors group flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${color}`} />
                <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                  {label}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Model readiness */}
      {models && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="section-label">Model Readiness</p>
            <Link to="/models" className="text-xs text-brand-400 hover:text-brand-300">
              Configure →
            </Link>
          </div>
          <div className="space-y-2">
            {models.models.map((m) => (
              <div key={m.model_id} className="card-sm flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{m.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{m.modality}</p>
                </div>
                <ModelStatusBadge status={m.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">Recent Analyses</p>
          <Clock className="w-3.5 h-3.5 text-gray-600" />
        </div>
        {history.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-sm text-gray-500">No analyses yet — upload a file to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item) => {
              const Icon = modalityIcon[item.modality] ?? Image
              return (
                <div key={item.id} className="card-sm flex items-center gap-4">
                  <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">{item.filename}</p>
                    <p className="text-xs text-gray-600">{formatTimestamp(item.timestamp)}</p>
                  </div>
                  <Badge variant={predictionStatusVariant(item.status)}>
                    {item.status}
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

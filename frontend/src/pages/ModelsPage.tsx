import { useEffect, useState } from 'react'
import { fetchModels } from '../api/client'
import type { ModelInfo, ModelListResponse } from '../types/api'
import { ModelStatusBadge } from '../components/ui/ModelStatusBadge'
import { Alert } from '../components/ui/Alert'
import { Spinner } from '../components/ui/Spinner'
import { MetaRow } from '../components/ui/MetaRow'
import { Settings, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'

export function ModelsPage() {
  const [data, setData] = useState<ModelListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetchModels()
      .then(setData)
      .catch(() => setError('Could not fetch model information from the backend.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Models &amp; Configuration</h1>
        <p className="page-subtitle">
          View the status of each detection model and instructions for connecting real checkpoints.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-gray-400">
          <Spinner size="sm" /> Loading model registry…
        </div>
      )}

      {error && (
        <Alert variant="error" title="Backend Unreachable">{error}</Alert>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="card-sm">
              <p className="text-xs text-gray-500">Configured</p>
              <p className="text-2xl font-bold text-emerald-400">{data.configured_count}</p>
            </div>
            <div className="card-sm">
              <p className="text-xs text-gray-500">Unavailable</p>
              <p className="text-2xl font-bold text-amber-400">{data.unavailable_count}</p>
            </div>
          </div>

          <Alert variant="info" title="No Model Uploads Required">
            Model checkpoints are installed locally by you (the developer), not uploaded
            through this interface. Follow the instructions below each model entry to connect
            your checkpoint files.
          </Alert>

          <div className="space-y-4">
            {data.models.map((model) => (
              <ModelCard
                key={model.model_id}
                model={model}
                isExpanded={expanded === model.model_id}
                onToggle={() =>
                  setExpanded(expanded === model.model_id ? null : model.model_id)
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ModelCard({
  model,
  isExpanded,
  onToggle,
}: {
  model: ModelInfo
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="card">
      <button
        className="flex items-center justify-between w-full gap-4"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="flex items-start gap-3 text-left min-w-0">
          <Settings className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-200">{model.name}</p>
            <p className="text-xs text-gray-500 capitalize mt-0.5">{model.modality} detector</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ModelStatusBadge status={model.status} />
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
          {/* Status breakdown */}
          <div className="space-y-1">
            <MetaRow label="Model ID" value={model.model_id} />
            <MetaRow label="Framework" value={model.framework} />
            <MetaRow label="Expected Input" value={model.expected_input} />
            <MetaRow
              label="Weights Available"
              value={
                <span className={model.weight_available ? 'text-emerald-400' : 'text-red-400'}>
                  {model.weight_available ? '✓ Yes' : '✗ No'}
                </span>
              }
            />
            <MetaRow
              label="Runtime Available"
              value={
                <span className={model.runtime_available ? 'text-emerald-400' : 'text-amber-400'}>
                  {model.runtime_available ? '✓ Yes' : '✗ No (deps missing)'}
                </span>
              }
            />
          </div>

          {/* Notes */}
          <div className="bg-gray-800/60 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Configuration Notes</p>
            <p className="text-xs text-gray-300">{model.configuration_notes}</p>
          </div>

          {/* Integration instructions */}
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2">Integration Instructions</p>
            <pre className="text-xs text-gray-300 bg-gray-950 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-gray-800">
              {model.integration_instructions}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

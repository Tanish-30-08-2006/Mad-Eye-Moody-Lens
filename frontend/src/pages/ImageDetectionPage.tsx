import { useState, useCallback } from 'react'
import { Image as ImageIcon, RefreshCw, Download } from 'lucide-react'
import { predictImage } from '../api/client'
import type { ImagePredictionResponse } from '../types/api'
import { FileDropzone } from '../components/upload/FileDropzone'
import { Alert } from '../components/ui/Alert'
import { Spinner } from '../components/ui/Spinner'
import { MetaRow } from '../components/ui/MetaRow'
import { Badge } from '../components/ui/Badge'
import { formatBytes, predictionStatusVariant } from '../utils/format'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
}

export function ImageDetectionPage() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImagePredictionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileAccepted = useCallback((f: File) => {
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setResult(null)
    setError(null)
  }, [])

  const handleClear = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setResult(null)
    setError(null)
  }, [previewUrl])

  const handleDetect = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await predictImage(file)
      setResult(res)
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'Unknown error'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Image Detection</h1>
        <p className="page-subtitle">Upload an image to analyse it for deepfake artifacts.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Upload */}
        <div className="space-y-4">
          <div className="card">
            <p className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-brand-400" /> Upload Image
            </p>
            <FileDropzone
              accept={ACCEPT}
              maxSize={MAX_IMAGE_BYTES}
              label="Drop an image here, or click to browse"
              hint="JPEG, PNG, WebP, BMP, TIFF"
              file={file}
              onFileAccepted={handleFileAccepted}
              onClear={handleClear}
              disabled={loading}
            />

            {file && (
              <div className="mt-4 space-y-1">
                <MetaRow label="Filename" value={file.name} />
                <MetaRow label="Size" value={formatBytes(file.size)} />
                <MetaRow label="Type" value={file.type} />
              </div>
            )}

            {file && (
              <button
                onClick={handleDetect}
                disabled={loading}
                className="btn-primary w-full mt-4 justify-center"
              >
                {loading ? <><Spinner size="sm" /> Running Detection…</> : 'Run Detection'}
              </button>
            )}

            {file && (
              <button
                onClick={handleClear}
                disabled={loading}
                className="btn-secondary w-full mt-2 justify-center"
              >
                <RefreshCw className="w-4 h-4" /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Right: Preview + Results */}
        <div className="space-y-4">
          {previewUrl && (
            <div className="card p-0 overflow-hidden">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full object-contain max-h-64 bg-gray-950"
              />
              {result?.metadata && (
                <div className="px-4 py-3 border-t border-gray-800 space-y-1">
                  <MetaRow label="Dimensions" value={`${result.metadata.width} × ${result.metadata.height}`} />
                  <MetaRow label="Mode" value={result.metadata.mode} />
                </div>
              )}
            </div>
          )}

          {error && <Alert variant="error" title="Error">{error}</Alert>}

          {result && (
            <ResultCard result={result} />
          )}

          {!file && !result && (
            <div className="card text-center py-12 text-gray-600">
              <ImageIcon className="mx-auto w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Upload an image to see the preview and results here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultCard({ result }: { result: ImagePredictionResponse }) {
  const isUnavailable = result.status === 'unavailable'
  const isError = result.status === 'error'

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-300">Detection Result</p>
        <Badge variant={predictionStatusVariant(result.status)}>{result.status}</Badge>
      </div>

      {isUnavailable && (
        <Alert variant="warning" title="Model Not Configured">
          {result.unavailable_reason ?? 'The visual detector is not yet configured.'}
          <span className="block mt-2">
            See the <a href="/models" className="underline">Models &amp; Config</a> page for setup instructions.
          </span>
        </Alert>
      )}

      {isError && (
        <Alert variant="error" title="Detection Error">
          {result.error ?? 'An unexpected error occurred.'}
        </Alert>
      )}

      {result.status === 'success' && (
        <div className="space-y-2">
          <MetaRow label="Predicted Label" value={result.predicted_label ?? '—'} />
          <MetaRow label="Score" value={result.score != null ? result.score.toFixed(4) : '—'} />
          <MetaRow label="Real Score" value={result.real_score != null ? result.real_score.toFixed(4) : '—'} />
          <MetaRow label="Fake Score" value={result.fake_score != null ? result.fake_score.toFixed(4) : '—'} />
          <MetaRow label="Inference Time" value={result.inference_time_ms != null ? `${result.inference_time_ms} ms` : '—'} />
        </div>
      )}

      <div className="pt-2 border-t border-gray-800">
        <p className="text-xs text-gray-600">Model: {result.model_id}</p>
      </div>
    </div>
  )
}

import { useState, useCallback, useRef } from 'react'
import { Music, RefreshCw, Play, Pause } from 'lucide-react'
import { predictAudio } from '../api/client'
import type { AudioPredictionResponse } from '../types/api'
import { FileDropzone } from '../components/upload/FileDropzone'
import { Alert } from '../components/ui/Alert'
import { Spinner } from '../components/ui/Spinner'
import { MetaRow } from '../components/ui/MetaRow'
import { Badge } from '../components/ui/Badge'
import { formatBytes, formatDuration, predictionStatusVariant } from '../utils/format'

const MAX_AUDIO_BYTES = 100 * 1024 * 1024
const ACCEPT = {
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/mpeg': ['.mp3'],
  'audio/flac': ['.flac'],
  'audio/ogg': ['.ogg'],
  'audio/aac': ['.aac'],
  'audio/mp4': ['.m4a'],
  'audio/x-m4a': ['.m4a'],
}

export function AudioDetectionPage() {
  const [file, setFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AudioPredictionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handleFileAccepted = useCallback((f: File) => {
    setFile(f)
    setAudioUrl(URL.createObjectURL(f))
    setResult(null)
    setError(null)
    setPlaying(false)
  }, [])

  const handleClear = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setFile(null)
    setAudioUrl(null)
    setResult(null)
    setError(null)
    setPlaying(false)
  }, [audioUrl])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }

  const handleAnalyse = async () => {
    if (!file) return
    setLoading(true); setError(null); setResult(null)
    try {
      setResult(await predictAudio(file))
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Audio Detection</h1>
        <p className="page-subtitle">Upload an audio file to check for synthetic or spoofed speech.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="card">
            <p className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <Music className="w-4 h-4 text-sky-400" /> Upload Audio
            </p>
            <FileDropzone
              accept={ACCEPT}
              maxSize={MAX_AUDIO_BYTES}
              label="Drop an audio file here, or click to browse"
              hint="WAV, MP3, FLAC, OGG, AAC, M4A"
              file={file}
              onFileAccepted={handleFileAccepted}
              onClear={handleClear}
              disabled={loading}
            />

            {file && audioUrl && (
              <>
                <div className="mt-4 bg-gray-800/60 rounded-lg p-3 flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="p-2 rounded-full bg-brand-600 hover:bg-brand-500 text-white transition-colors"
                    aria-label={playing ? 'Pause' : 'Play'}
                  >
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 truncate">{file.name}</p>
                    <p className="text-xs text-gray-600">{formatBytes(file.size)}</p>
                  </div>
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    onEnded={() => setPlaying(false)}
                    className="hidden"
                  />
                </div>
                <div className="mt-3 space-y-1">
                  <MetaRow label="Filename" value={file.name} />
                  <MetaRow label="Size" value={formatBytes(file.size)} />
                  <MetaRow label="Type" value={file.type} />
                </div>
              </>
            )}

            {file && (
              <>
                <button
                  onClick={handleAnalyse}
                  disabled={loading}
                  className="btn-primary w-full mt-4 justify-center"
                >
                  {loading ? <><Spinner size="sm" /> Analysing…</> : 'Run Analysis'}
                </button>
                <button
                  onClick={handleClear}
                  disabled={loading}
                  className="btn-secondary w-full mt-2 justify-center"
                >
                  <RefreshCw className="w-4 h-4" /> Reset
                </button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {error && <Alert variant="error" title="Error">{error}</Alert>}
          {result && <AudioResultCard result={result} />}
          {!file && !result && (
            <div className="card text-center py-12 text-gray-600">
              <Music className="mx-auto w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Upload an audio file to begin analysis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AudioResultCard({ result }: { result: AudioPredictionResponse }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-300">Analysis Result</p>
        <Badge variant={predictionStatusVariant(result.status)}>{result.status}</Badge>
      </div>

      {result.status === 'unavailable' && (
        <Alert variant="warning" title="Model Not Configured">
          {result.unavailable_reason ?? 'The SSL Anti-Spoofing audio model is not yet configured.'}
          <span className="block mt-2">
            See <a href="/models" className="underline">Models &amp; Config</a> for setup instructions.
          </span>
        </Alert>
      )}

      {result.status === 'error' && (
        <Alert variant="error" title="Analysis Error">{result.error}</Alert>
      )}

      {result.status === 'success' && (
        <div className="space-y-2">
          <MetaRow label="Predicted Label" value={result.predicted_label} />
          <MetaRow label="Score" value={result.score?.toFixed(4)} />
          <MetaRow label="Score Type" value={result.score_type} />
          <MetaRow label="Inference Time" value={result.inference_time_ms != null ? `${result.inference_time_ms} ms` : null} />
        </div>
      )}

      {result.metadata && (
        <div className="border-t border-gray-800 pt-3 space-y-1">
          <p className="text-xs text-gray-500 mb-2">Audio Metadata</p>
          <MetaRow label="Duration" value={formatDuration(result.metadata.duration_sec)} />
          <MetaRow label="Sample Rate" value={result.metadata.sample_rate != null ? `${result.metadata.sample_rate} Hz` : null} />
          <MetaRow label="Channels" value={result.metadata.channels} />
          <MetaRow label="Codec" value={result.metadata.codec} />
        </div>
      )}

      <p className="text-xs text-gray-600 pt-2 border-t border-gray-800">Model: {result.model_id}</p>
    </div>
  )
}

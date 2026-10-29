import { useState, useCallback, useRef } from 'react'
import { Video as VideoIcon, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { predictVideo } from '../api/client'
import type { VideoPredictionResponse, ExtractedFrame, FramePrediction } from '../types/api'
import { FileDropzone } from '../components/upload/FileDropzone'
import { Alert } from '../components/ui/Alert'
import { Spinner } from '../components/ui/Spinner'
import { MetaRow } from '../components/ui/MetaRow'
import { Badge } from '../components/ui/Badge'
import { formatBytes, formatDuration, predictionStatusVariant } from '../utils/format'

const MAX_VIDEO_BYTES = 500 * 1024 * 1024
const ACCEPT = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/webm': ['.webm'],
}

export function VideoDetectionPage() {
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [maxFrames, setMaxFrames] = useState(16)
  const [analyzeAudio, setAnalyzeAudio] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VideoPredictionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileAccepted = useCallback((f: File) => {
    setFile(f); setVideoUrl(URL.createObjectURL(f)); setResult(null); setError(null)
  }, [])

  const handleClear = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setFile(null); setVideoUrl(null); setResult(null); setError(null)
  }, [videoUrl])

  const handleRun = async () => {
    if (!file) return
    setLoading(true); setError(null); setResult(null)
    try {
      setResult(await predictVideo(file, maxFrames, undefined, analyzeAudio))
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Video Detection</h1>
        <p className="page-subtitle">Upload a video to extract frames and analyse for deepfake content.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: Upload + config */}
        <div className="space-y-4">
          <div className="card">
            <p className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <VideoIcon className="w-4 h-4 text-emerald-400" /> Upload Video
            </p>
            <FileDropzone
              accept={ACCEPT}
              maxSize={MAX_VIDEO_BYTES}
              label="Drop a video here, or click to browse"
              hint="MP4, MOV, AVI, MKV, WebM"
              file={file}
              onFileAccepted={handleFileAccepted}
              onClear={handleClear}
              disabled={loading}
            />

            {videoUrl && (
              <div className="mt-4 rounded-lg overflow-hidden bg-black">
                <video
                  src={videoUrl}
                  controls
                  className="w-full max-h-48 object-contain"
                  preload="metadata"
                />
              </div>
            )}

            {file && (
              <div className="mt-4 space-y-1">
                <MetaRow label="Filename" value={file.name} />
                <MetaRow label="Size" value={formatBytes(file.size)} />
              </div>
            )}

            {/* Options */}
            <div className="mt-4 space-y-3 pt-4 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">Max frames to sample</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={maxFrames}
                  onChange={(e) => setMaxFrames(Number(e.target.value))}
                  className="input w-20 text-center text-sm"
                  disabled={loading}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={analyzeAudio}
                  onChange={(e) => setAnalyzeAudio(e.target.checked)}
                  className="w-4 h-4 rounded accent-brand-500"
                  disabled={loading}
                />
                <span className="text-xs text-gray-400">
                  Analyse audio track (requires audio model)
                </span>
              </label>
            </div>

            {file && (
              <>
                <button
                  onClick={handleRun}
                  disabled={loading}
                  className="btn-primary w-full mt-4 justify-center"
                >
                  {loading ? <><Spinner size="sm" /> Processing Video…</> : 'Run Analysis'}
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

        {/* Right: Results */}
        <div className="space-y-4">
          {error && <Alert variant="error" title="Error">{error}</Alert>}
          {loading && (
            <div className="card text-center py-10 space-y-3">
              <Spinner size="lg" className="mx-auto" />
              <p className="text-sm text-gray-400">Extracting frames and running analysis…</p>
            </div>
          )}
          {result && <VideoResultPanel result={result} />}
          {!file && !result && !loading && (
            <div className="card text-center py-12 text-gray-600">
              <VideoIcon className="mx-auto w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Upload a video to see metadata, frames, and results.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function VideoResultPanel({ result }: { result: VideoPredictionResponse }) {
  const [showFrames, setShowFrames] = useState(true)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-300">Summary</p>
          <Badge variant={predictionStatusVariant(result.status)}>{result.status}</Badge>
        </div>

        {result.summary?.unavailable_reason && (
          <Alert variant="warning" title="Detection Unavailable">
            {result.summary.unavailable_reason}
            <span className="block mt-1">
              See <a href="/models" className="underline">Models &amp; Config</a> to set up the visual detector.
            </span>
          </Alert>
        )}

        {result.summary?.verdict && (
          <div className={`rounded-lg p-3 text-center font-bold text-lg
            ${result.summary.verdict.includes('FAKE')
              ? 'bg-red-950/40 text-red-400 border border-red-800/40'
              : 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
            }`}>
            {result.summary.verdict}
          </div>
        )}

        {result.summary && result.summary.frames_analyzed > 0 && (
          <div className="space-y-1">
            <MetaRow label="Frames Analysed" value={result.summary.frames_analyzed} />
            <MetaRow label="Mean Fake Score" value={result.summary.mean_fake_score?.toFixed(4)} />
            <MetaRow label="Fake Frames" value={result.summary.fake_frame_count} />
            <MetaRow label="Real Frames" value={result.summary.real_frame_count} />
          </div>
        )}
      </div>

      {/* Metadata */}
      {result.metadata && (
        <div className="card space-y-1">
          <p className="text-xs text-gray-500 mb-2">Video Metadata</p>
          <MetaRow label="Duration" value={formatDuration(result.metadata.duration_sec)} />
          <MetaRow label="Dimensions" value={
            result.metadata.width
              ? `${result.metadata.width} × ${result.metadata.height}`
              : null
          } />
          <MetaRow label="FPS" value={result.metadata.fps?.toFixed(2)} />
          <MetaRow label="Total Frames" value={result.metadata.total_frames} />
          <MetaRow label="Has Audio" value={result.metadata.has_audio ? 'Yes' : 'No'} />
        </div>
      )}

      {/* Frame gallery */}
      {result.extracted_frames.length > 0 && (
        <div className="card">
          <button
            className="flex items-center justify-between w-full text-sm font-semibold text-gray-300 mb-3"
            onClick={() => setShowFrames(!showFrames)}
          >
            <span>Extracted Frames ({result.extracted_frames.length})</span>
            {showFrames ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showFrames && (
            <div className="grid grid-cols-3 gap-2">
              {result.extracted_frames.map((frame) => {
                const pred = result.frame_predictions.find(
                  (fp) => fp.frame_index === frame.frame_index,
                )
                return <FrameCard key={frame.frame_index} frame={frame} prediction={pred} />
              })}
            </div>
          )}
        </div>
      )}

      {/* Audio result */}
      {result.audio_result && (
        <div className="card space-y-2">
          <p className="text-sm font-semibold text-gray-300">Audio Analysis</p>
          {result.audio_result.status === 'unavailable' ? (
            <Alert variant="warning">
              {result.audio_result.unavailable_reason ?? 'Audio model not configured.'}
            </Alert>
          ) : (
            <div className="space-y-1">
              <MetaRow label="Label" value={result.audio_result.predicted_label} />
              <MetaRow label="Score" value={result.audio_result.score?.toFixed(4)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FrameCard({
  frame,
  prediction,
}: {
  frame: ExtractedFrame
  prediction?: FramePrediction
}) {
  return (
    <div className="rounded-lg overflow-hidden bg-gray-800 border border-gray-700">
      {frame.frame_url ? (
        <img
          src={frame.frame_url}
          alt={`Frame ${frame.frame_index}`}
          className="w-full aspect-video object-cover"
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <div className="w-full aspect-video bg-gray-800 flex items-center justify-center text-xs text-gray-600">
          No preview
        </div>
      )}
      <div className="px-2 py-1.5">
        <p className="text-xs text-gray-500">{frame.timestamp_sec.toFixed(2)}s</p>
        {prediction && prediction.status !== 'unavailable' && (
          <Badge
            variant={prediction.predicted_label === 'fake' ? 'error' : 'success'}
            className="mt-0.5"
          >
            {prediction.predicted_label ?? prediction.status}
          </Badge>
        )}
        {prediction?.status === 'unavailable' && (
          <span className="text-xs text-gray-600">—</span>
        )}
      </div>
    </div>
  )
}

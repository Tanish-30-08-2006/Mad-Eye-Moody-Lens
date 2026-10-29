import { Shield, Github, BookOpen, AlertTriangle } from 'lucide-react'

export function AboutPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="page-title">About / Help</h1>
        <p className="page-subtitle">Documentation, acknowledgements, and usage notes.</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-brand-400" />
          <p className="text-base font-semibold text-white">Multimodal Deepfake Detection Studio</p>
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">
          A locally-runnable research tool for analysing images, audio, and video for deepfake
          artifacts using state-of-the-art detection models. This application is designed to be
          used by researchers and developers who supply their own pretrained model checkpoints.
        </p>
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" /> Important Disclaimers
        </p>
        <ul className="text-sm text-gray-400 space-y-2 list-disc list-inside">
          <li>
            No predictions are fabricated. When a model is not configured, the application
            explicitly reports "unavailable" — it never invents real/fake labels or scores.
          </li>
          <li>
            Detection results depend entirely on the pretrained model quality. This tool
            does not guarantee accuracy; always validate model outputs independently.
          </li>
          <li>
            Uploaded media is processed in memory and stored only as temporary files
            that are deleted after each request. No media is permanently retained.
          </li>
          <li>
            This tool is intended for local research use only. Do not expose it to the
            public internet without appropriate authentication and hardening.
          </li>
        </ul>
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-400" /> Intended Models
        </p>
        <div className="space-y-3">
          <div className="bg-gray-800/60 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-300">Audio: SSL Anti-Spoofing</p>
            <p className="text-xs text-gray-500 mt-1">
              wav2vec 2.0 XLSR-300M fine-tuned for anti-spoofing. Detects synthetic or
              replayed speech. Repository: TakHemlata/SSL_Anti-spoofing
            </p>
          </div>
          <div className="bg-gray-800/60 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-300">Image / Video: Hybrid Xception-ViT</p>
            <p className="text-xs text-gray-500 mt-1">
              Hybrid architecture combining Xception and Vision Transformer for image-level
              deepfake detection. Also used for per-frame video analysis.
              Repository: tahangz/Hybrid-Xception-Vision-Transformer-Deepfake-Detection
            </p>
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-semibold text-gray-300">Quick-Start</p>
        <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
          <li>Install backend: <code className="font-mono text-xs bg-gray-800 px-1 rounded">pip install -r backend/requirements.txt</code></li>
          <li>Copy <code className="font-mono text-xs bg-gray-800 px-1 rounded">.env.example</code> → <code className="font-mono text-xs bg-gray-800 px-1 rounded">.env</code> and configure paths</li>
          <li>Start backend: <code className="font-mono text-xs bg-gray-800 px-1 rounded">uvicorn app.main:app --reload</code> (in backend/)</li>
          <li>Install frontend: <code className="font-mono text-xs bg-gray-800 px-1 rounded">pnpm install</code> (in frontend/)</li>
          <li>Start frontend: <code className="font-mono text-xs bg-gray-800 px-1 rounded">pnpm dev</code> (in frontend/)</li>
          <li>Open <code className="font-mono text-xs bg-gray-800 px-1 rounded">http://localhost:5173</code></li>
        </ol>
      </div>

      <div className="card">
        <p className="text-sm font-semibold text-gray-300 mb-2">Technology Stack</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <span>React 18 + Vite + TypeScript</span>
          <span>Tailwind CSS</span>
          <span>FastAPI + Uvicorn</span>
          <span>Pydantic v2</span>
          <span>Pillow + OpenCV</span>
          <span>MoviePy (frame extraction)</span>
          <span>Mutagen (audio metadata)</span>
          <span>Python 3.10+</span>
        </div>
      </div>
    </div>
  )
}

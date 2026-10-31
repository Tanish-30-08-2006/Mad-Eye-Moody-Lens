"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  ArrowRight, Check, ChevronDown, CircleAlert, Clock3, Cpu,
  ExternalLink, Fingerprint, LoaderCircle, ScanSearch, ShieldCheck,
  Sparkles, Upload, X,
} from "lucide-react";

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

type Model = {
  id: string; name: string; short_name: string; task: string; description: string;
  version: string; status: string; selectable: boolean; setup_message?: string | null;
  score_semantics?: string | null; positive_label: string; negative_label: string;
  paper_title?: string | null; paper_url?: string | null; code_url?: string | null;
  weights_url?: string | null; license_note?: string | null;
};

type Result = {
  model_id: string; model_name: string; model_version: string; task: string;
  predicted_label: string; score: number; score_semantics: string;
  model_load_time_ms: number; inference_time_ms: number; total_time_ms: number;
  disclaimer: string; metadata: Record<string, unknown>;
};

const taskName: Record<string, string> = {
  ai_generated_image: "AI-generated image detection",
  diffusion_generated_image: "Diffusion image detection",
  manipulated_face: "Face manipulation detection",
};

function timeLabel(ms: number) {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}

function Status({ value }: { value: string }) {
  const label: Record<string, string> = {
    ready: "Ready", setup_required: "Setup required", disabled: "Disabled",
    planned: "Planned", invalid: "Invalid manifest",
  };
  return <span className={`status status-${value}`}>{label[value] || value.replaceAll("_", " ")}</span>;
}

export default function Home() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => models.find((m) => m.id === selectedId) || null, [models, selectedId]);
  const readyCount = models.filter((m) => m.selectable).length;

  useEffect(() => {
    let live = true;
    fetch(`${API}/api/models`, { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(`API returned ${r.status}`); return r.json() as Promise<Model[]>; })
      .then((data) => {
        if (!live) return;
        setModels(data);
        setSelectedId(data.find((m) => m.selectable)?.id || "");
      })
      .catch((e: unknown) => live && setModelsError(e instanceof Error ? e.message : "Could not load model catalogue."))
      .finally(() => live && setModelsLoading(false));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!busy) { setSeconds(0); return; }
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  function chooseFile(next?: File) {
    setError(""); setResult(null);
    if (!next) return;
    setPreview(null);
    if (!next.type.startsWith("image/")) { setFile(null); setError("Choose a supported image file."); return; }
    if (next.size > 10 * 1024 * 1024) { setFile(null); setError("The upload limit is 10 MB."); return; }
    setFile(next);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    chooseFile(e.target.files?.[0]);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0]);
  }

  async function analyze() {
    if (!file || !selected?.selectable || busy) return;
    setBusy(true); setError(""); setResult(null);
    const body = new FormData();
    body.append("model_id", selected.id);
    body.append("image", file);
    try {
      const response = await fetch(`${API}/api/detect`, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Detection failed (${response.status}).`);
      setResult(data as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed. Check that the backend is running.");
    } finally { setBusy(false); }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark"><Fingerprint size={18} /></span><span>DETECT<span className="brand-light">/STUDIO</span></span></a>
        <nav><a href="#workspace">Studio</a><a href="#library">Models</a></nav>
        <span className="local-tag"><span /> LOCAL WORKSPACE</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><Sparkles size={13} /> RESEARCH MODEL WORKSPACE</div>
        <h1>Inspect an image.<br /><em>Choose the detector.</em></h1>
        <p>Run established image-forensics models through one consistent interface. Each model keeps its own weights, preprocessing and research provenance.</p>
        <div className="hero-meta"><span><Check size={14} /> Model-selectable</span><span><Check size={14} /> Local inference</span><span><Check size={14} /> Research provenance</span></div>
      </section>

      <section className="workspace" id="workspace">
        <div className="section-head"><div><div className="eyebrow">01 — DETECTION WORKSPACE</div><h2>Run an analysis</h2></div><span className="model-count">{readyCount} model{readyCount === 1 ? "" : "s"} ready</span></div>
        <div className="work-grid">
          <section className="panel input-panel">
            <div className="panel-heading"><span className="step">01</span><div><h3>Select a model</h3><p>Choose the detector for this image.</p></div></div>
            <label className="field-label" htmlFor="model-select">DETECTION MODEL</label>
            <div className="select-wrap">
              <select id="model-select" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setResult(null); }} disabled={!readyCount || busy}>
                {models.filter((m) => m.selectable).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                {!readyCount && <option value="">No models ready</option>}
              </select><ChevronDown size={16} />
            </div>
            {selected ? <div className="model-summary"><div className="model-avatar">{selected.short_name.slice(0, 2).toUpperCase()}</div><div className="model-summary-copy"><strong>{selected.name}</strong><span>{taskName[selected.task] || selected.task} · v{selected.version}</span></div><Status value={selected.status} /></div> : <p className="muted-note">{modelsLoading ? "Loading model folders…" : "Add a detector folder under /models to make it available."}</p>}
            {selected?.description && <p className="model-description">{selected.description}</p>}
            {selected?.paper_url && <a className="paper-link" href={selected.paper_url} target="_blank" rel="noreferrer">Research paper <ExternalLink size={13} /></a>}

            <div className="panel-heading upload-heading"><span className="step">02</span><div><h3>Upload an image</h3><p>JPEG, PNG, WEBP, BMP or TIFF · max 10 MB</p></div></div>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff" hidden onChange={onFileChange} />
            {!file ? (
              <div className={`dropzone ${dragging ? "dropzone-active" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && input.current?.click()}>
                <div className="upload-icon"><Upload size={21} /></div><strong>Drop an image here</strong><span>or <u>browse files</u></span>
              </div>
            ) : (
              <div className="file-card">{preview ? <Image src={preview} alt="Selected image preview" width={62} height={62} unoptimized /> : <div className="file-preview-placeholder" aria-hidden="true"><ScanSearch size={20} /></div>}<div className="file-copy"><strong>{file.name}</strong><span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span></div><button className="icon-button" onClick={() => { setFile(null); setResult(null); }} aria-label="Remove image"><X size={17} /></button></div>
            )}

            {error && <div className="error-box"><CircleAlert size={16} />{error}</div>}
            {modelsError && <div className="error-box"><CircleAlert size={16} />Backend unavailable: {modelsError}. Start the API and reload.</div>}
            {selected && !selected.selectable && selected.setup_message && <div className="info-box">{selected.setup_message}</div>}
            <button className="primary-button" onClick={analyze} disabled={!file || !selected?.selectable || busy}>
              {busy ? <><LoaderCircle className="spin" size={17} /> Analyzing · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</> : <>Run detection <ArrowRight size={17} /></>}
            </button>
            <p className="hint"><ShieldCheck size={13} /> Images are processed in memory and are not intentionally saved.</p>
          </section>

          <section className="panel result-panel" aria-live="polite">
            <div className="panel-heading"><span className="step">03</span><div><h3>Detection result</h3><p>Output from the selected model.</p></div></div>
            {!result && !busy && <div className="empty-state"><div className="empty-icon"><ScanSearch size={28} /></div><strong>Awaiting an image</strong><span>Your model prediction will appear here.</span></div>}
            {busy && <div className="loading-state"><LoaderCircle className="spin loader-icon" size={30} /><strong>Running {selected?.short_name || "detector"}</strong><span>Research inference can take several minutes on CPU, especially during the first run.</span><div className="progress-track"><i /></div><small>Elapsed {Math.floor(seconds / 60)}m {seconds % 60}s</small></div>}
            {result && <div className="result-content">
              <div className={`verdict ${result.score >= 0.5 ? "verdict-fake" : "verdict-real"}`}><span className="verdict-icon">{result.score >= 0.5 ? <ScanSearch size={21} /> : <Check size={21} />}</span><div><small>MODEL PREDICTION</small><h4>{result.predicted_label}</h4><span>{result.model_name} · {result.model_version}</span></div></div>
              <div className="score-block"><div className="score-top"><span>Model score</span><strong>{(result.score * 100).toFixed(1)}%</strong></div><div className="score-track"><i style={{ width: `${result.score * 100}%` }} /></div><p>{result.score_semantics}</p></div>
              <div className="metrics"><div><span><Clock3 size={14} /> Model load</span><strong>{timeLabel(result.model_load_time_ms)}</strong></div><div><span><Cpu size={14} /> Inference</span><strong>{timeLabel(result.inference_time_ms)}</strong></div></div>
              <details className="technical"><summary>Technical details <ChevronDown size={14} /></summary><pre>{JSON.stringify(result.metadata, null, 2)}</pre></details>
              <p className="disclaimer"><ShieldCheck size={15} /> {result.disclaimer}</p>
              <button className="secondary-button" onClick={() => { setResult(null); setFile(null); }}>Analyze another image <ArrowRight size={15} /></button>
            </div>}
          </section>
        </div>
      </section>

      <section className="library" id="library">
        <div className="section-head"><div><div className="eyebrow">02 — MODEL DIRECTORY</div><h2>Installed detectors</h2></div><span className="directory-hint">Add or remove models in the <code>/models</code> folder</span></div>
        <div className="model-list">
          {models.map((model) => <article className="model-row" key={model.id}>
            <div className="model-avatar">{model.short_name.slice(0, 2).toUpperCase()}</div>
            <div className="model-row-main"><strong>{model.name}</strong><span>{taskName[model.task] || model.task} · v{model.version}</span>{model.setup_message && !model.selectable && <small>{model.setup_message}</small>}</div>
            <Status value={model.status} />
            {model.paper_url && <a className="row-link" href={model.paper_url} target="_blank" rel="noreferrer" aria-label={`Open paper for ${model.name}`}><ExternalLink size={16} /></a>}
            {model.selectable && <button className="text-button" onClick={() => { setSelectedId(model.id); document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" }); }}>Select <ArrowRight size={14} /></button>}
          </article>)}
          {!modelsLoading && !models.length && <div className="empty-directory">No model folders found. See <code>models/_template</code> to add your first detector.</div>}
        </div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark"><Fingerprint size={16} /></span><span>DETECT<span className="brand-light">/STUDIO</span></span></a><span>Research workspace · Results are model-specific estimates.</span><a href="#top">Back to top ↑</a></footer>
    </main>
  );
}

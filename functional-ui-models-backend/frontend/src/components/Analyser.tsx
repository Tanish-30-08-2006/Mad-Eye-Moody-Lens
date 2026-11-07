import { DragEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import type { JobStatus, MediaType, ModelInfo } from "../api/client";
import { MEDIA, MODELS, VIDEO_FRAMES } from "../config/models";
import { MEDIA_ICON } from "./Icons";
import { ScanLine } from "./ScanLine";

export type Phase =
  | { stage: "idle" }
  | { stage: "uploading"; fraction: number }
  | { stage: "analysing" }
  | { stage: "job"; job: JobStatus | null };

interface Props {
  phase: Phase;
  error: string | null;
  byKey: (key: string) => ModelInfo | undefined;
  onSubmit: (type: MediaType, file: File) => void;
  /** Result card, rendered under the analyser. */
  children?: ReactNode;
}

const TYPES: MediaType[] = ["image", "audio", "video"];

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

/** Client-side mirror of the backend limits — instant feedback only; the server still enforces them. */
function validate(type: MediaType, f: File): string | null {
  const spec = MEDIA[type];
  if (f.size > spec.maxMb * 1024 * 1024) {
    return `This file is ${fmtSize(f.size)}. ${spec.label} uploads are limited to ${spec.maxMb} MB.`;
  }
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeOk = f.type ? f.type.startsWith(`${type}/`) : false;
  if (!mimeOk && !spec.extensions.includes(ext)) {
    return `That doesn't look like ${type === "image" ? "an" : "a"} ${type} file. Accepted: ${spec.formatsLabel}.`;
  }
  return null;
}

function statusText(phase: Phase, type: MediaType): string {
  switch (phase.stage) {
    case "uploading":
      return `Uploading · ${Math.round(phase.fraction * 100)}%`;
    case "analysing":
      return type === "image"
        ? "Running SDXL detector and face check"
        : "Scoring 4-second windows with the speech model";
    case "job": {
      const j = phase.job;
      if (!j || j.status === "queued") return "Queued · waiting for a worker";
      if (j.status === "running" && j.progress < 1) {
        const frames = Math.round(j.progress * VIDEO_FRAMES);
        return `Scoring frames · ${frames}/${VIDEO_FRAMES}`;
      }
      if (j.status === "running" && j.stage === "finalising") return "Frames done · building Grad-CAM heatmaps";
      if (j.status === "running") return "Frames done · checking the audio track";
      return j.status === "done" ? "Done" : "Failed";
    }
    default:
      return "";
  }
}

export function Analyser({ phase, error, byKey, onSubmit, children }: Props) {
  const [type, setType] = useState<MediaType>("image");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const busy = phase.stage !== "idle";
  const spec = MEDIA[type];
  const Icon = MEDIA_ICON[type];

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const switchType = (t: MediaType) => {
    if (busy) return;
    setType(t);
    setFile(null);
    setLocalError(null);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : TYPES.length - 1)) % TYPES.length;
    switchType(TYPES[next]);
    tabRefs.current[next]?.focus();
  };

  const choose = (f: File | undefined) => {
    setLocalError(null);
    if (!f) return;
    const problem = validate(type, f);
    if (problem) {
      setFile(null);
      setLocalError(problem);
      return;
    }
    setFile(f);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDrag(false);
    if (!busy) choose(e.dataTransfer.files?.[0]);
  };

  const shownError = localError ?? error;
  const progressValue =
    phase.stage === "uploading" ? phase.fraction : phase.stage === "job" ? phase.job?.progress ?? 0 : undefined;

  return (
    <section className="section" id="analyse" aria-labelledby="analyse-h">
      <div className="container">
        <div className="section-head">
          <h2 id="analyse-h">Analyse a file</h2>
          <p>Files are deleted from the server as soon as the analysis finishes. Results are kept only in this browser.</p>
        </div>

        <div className="tabs" role="tablist" aria-label="Media type">
          {TYPES.map((t, i) => (
            <button
              key={t}
              ref={(el) => (tabRefs.current[i] = el)}
              className="tab"
              role="tab"
              id={`tab-${t}`}
              aria-selected={t === type}
              aria-controls="analyser-panel"
              tabIndex={t === type ? 0 : -1}
              disabled={busy && t !== type}
              onClick={() => switchType(t)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {MEDIA[t].label}
            </button>
          ))}
        </div>

        <div className="analyser" id="analyser-panel" role="tabpanel" aria-labelledby={`tab-${type}`}>
          <div className="analyser__ghost" aria-hidden="true">
            <Icon />
          </div>

          <div className="analyser__main">
            <div className="analyser__drop">
              <label
                className={`dropzone ${drag ? "is-drag" : ""} ${busy ? "is-disabled" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
              >
                <input
                  className="sr-only"
                  type="file"
                  accept={spec.accept}
                  disabled={busy}
                  onChange={(e) => {
                    choose(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <div className="icon-box" aria-hidden="true">
                  <Icon />
                </div>
                <span className="dropzone__title">
                  {file ? "Replace file" : `Drop ${type === "image" ? "an" : "a"} ${type} here`}
                </span>
                <span className="label">
                  or click to browse · {spec.formatsLabel} · max {spec.maxMb} MB
                </span>
              </label>

              {file && url && (
                <figure className="preview" style={{ margin: 0 }}>
                  {type === "image" && <img src={url} alt="Preview of the selected image" />}
                  {type === "audio" && <audio src={url} controls preload="metadata" />}
                  {type === "video" && <video src={url} controls muted preload="metadata" />}
                  <figcaption className="preview__meta">
                    <span>{file.name}</span>
                    <span>{fmtSize(file.size)}</span>
                  </figcaption>
                </figure>
              )}

              {shownError && (
                <div className="alert" role="alert">
                  <strong>Could not analyse</strong>
                  {shownError}
                </div>
              )}

              {busy && (
                <div className="status-line" aria-live="polite">
                  <div className="status-line__row">
                    <span className="label">{statusText(phase, type)}</span>
                    {typeof progressValue === "number" && (
                      <span className="mono" style={{ fontSize: 11 }}>
                        {Math.round(progressValue * 100)}%
                      </span>
                    )}
                  </div>
                  <ScanLine running value={progressValue} label="Analysis progress" />
                </div>
              )}

              <button
                className="btn btn--block"
                disabled={!file || busy}
                onClick={() => file && onSubmit(type, file)}
              >
                <span>{busy ? "Analysing" : `Analyse ${type}`}</span>
              </button>
            </div>

            <div className="analyser__side">
              <span className="label">What runs on {type === "image" ? "an" : "a"} {type}</span>
              <ol className="pipeline">
                {spec.pipeline.map((k, i) => {
                  const m = MODELS[k];
                  const live = byKey(k);
                  return (
                    <li key={k}>
                      <span className="pipeline__idx">{String(i + 1).padStart(2, "0")}</span>
                      <div>
                        <div className="pipeline__name">{live?.name ?? m.id}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          <span className={`tag ${m.family === "CNN" ? "tag--cnn" : ""}`}>{m.architecture}</span>
                          <span className="tag">
                            <span
                              className={`dot ${live?.loaded ? "dot--online" : live ? "dot--warming" : ""}`}
                              aria-hidden="true"
                            />
                            {live?.loaded ? "Loaded" : live ? "Loading" : "Unknown"}
                          </span>
                        </div>
                        <div className="pipeline__desc">{m.input}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="note">{spec.pipelineNote}</p>
            </div>
          </div>

          <div className="benefits">
            <div className="benefit">
              <span className="label">Checks</span>
              <span className="benefit__value">
                {spec.pipeline.map((k) => MODELS[k].checkName.replace(" check", "")).join(" + ")}
              </span>
              <p>
                {type === "image"
                  ? "Face check runs only when a face is detected."
                  : type === "video"
                    ? "Audio check is skipped if the video has no sound."
                    : "Clips shorter than 0.5 s are rejected."}
              </p>
            </div>
            <div className="benefit">
              <span className="label">Output</span>
              <span className="benefit__value">
                {type === "image" ? "Score per check" : type === "audio" ? "Timeline per 4 s window" : `Timeline over ${VIDEO_FRAMES} frames`}
              </span>
              <p>Overall score is the highest individual check.</p>
            </div>
            <div className="benefit">
              <span className="label">Speed</span>
              <span className="benefit__value">{spec.mode === "job" ? "Background job" : "Seconds"}</span>
              <p>
                {spec.mode === "job"
                  ? "Video runs on the server while this page polls for progress."
                  : "Returned in a single request."}
              </p>
            </div>
          </div>
        </div>

        {children}
      </div>
    </section>
  );
}

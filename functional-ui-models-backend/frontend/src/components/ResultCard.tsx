import type { AnalysisResult } from "../api/client";
import { BANDS, MEDIA, MODELS, TASK_TO_MODEL, VERDICT_TEXT, VIDEO_FRAMES, verdictFor } from "../config/models";
import type { Task } from "../api/client";
import { HeatmapPanel } from "./HeatmapPanel";
import { SegmentChart } from "./SegmentChart";

const pct = (p: number) => `${Math.round(p * 100)}%`;

function detailRows(r: AnalysisResult): [string, string][] {
  const d = r.details ?? {};
  const rows: [string, string][] = [];
  if (r.media_type === "image") {
    rows.push(["Faces found", String(d.faces_found ?? 0)]);
  }
  if (r.media_type === "audio") {
    if (typeof d.duration_s === "number") rows.push(["Duration", `${d.duration_s.toFixed(1)} s`]);
    rows.push(["Windows scored", String(r.segments.length)]);
  }
  if (r.media_type === "video") {
    if (typeof d.frames_sampled === "number") rows.push(["Frames sampled", `${d.frames_sampled} / ${VIDEO_FRAMES}`]);
    if (typeof d.frames_with_face === "number") rows.push(["Frames with a face", String(d.frames_with_face)]);
    if (typeof d.max_frame_probability === "number") rows.push(["Most suspicious frame", pct(d.max_frame_probability)]);
    if (typeof d.fraction_flagged === "number") rows.push(["Frames above 50%", pct(d.fraction_flagged)]);
    rows.push([
      "Audio track",
      d.audio_checked === true
        ? "Checked"
        : d.audio_checked === false
          ? "Check failed — visual result still valid"
          : "No audio track found",
    ]);
  }
  rows.push(["Analysis ID", r.analysis_id.slice(0, 12)]);
  return rows;
}

function notes(r: AnalysisResult): string[] {
  const out: string[] = [];
  const d = r.details ?? {};
  if (r.media_type === "image" && !d.faces_found) {
    out.push("No face was detected, so only the AI-generated image check ran. Face swaps cannot be assessed on this image.");
  }
  if (r.media_type === "video" && typeof d.frames_with_face === "number" && typeof d.frames_sampled === "number") {
    if (d.frames_with_face < d.frames_sampled / 2) {
      out.push(
        `Only ${d.frames_with_face} of ${d.frames_sampled} sampled frames showed a detectable face, so the visual score rests on few frames.`,
      );
    }
  }
  if (r.verdict === "uncertain") {
    out.push("The score sits in the uncertain band. Look for visual or audio artefacts yourself before drawing a conclusion.");
  }
  return out;
}

export function ResultCard({
  result,
  fileName,
  file = null,
}: {
  result: AnalysisResult;
  fileName?: string;
  /** Original file, if still in this tab: lets the heatmaps sit over the real face. */
  file?: File | null;
}) {
  const v = VERDICT_TEXT[result.verdict];
  const rows = detailRows(result);
  const extra = notes(result);

  return (
    <article className="result" aria-live="polite" aria-labelledby="result-title">
      <header className="result__head">
        <span className="label">
          Result · {MEDIA[result.media_type].label}
          {fileName ? ` · ${fileName}` : ""}
        </span>
        <span className="label">Processed in {(result.processing_ms / 1000).toFixed(1)} s</span>
      </header>

      <div className="result__hero">
        <div className="result__verdict">
          <span className={`verdict-chip v-${result.verdict}`}>
            <span className="vmark" aria-hidden="true" />
            {v.short}
          </span>
          <h3 id="result-title" className="result__title">
            {v.title}
          </h3>
          {extra.map((n) => (
            <p className="note" key={n}>
              {n}
            </p>
          ))}
        </div>

        <div className="result__prob">
          <span className="label">Estimated probability of manipulation</span>
          <div className="big-num">
            {Math.round(result.fake_probability * 100)}
            <small>%</small>
          </div>
          <div className="scale" aria-hidden="true">
            <span className="scale__tick" style={{ left: pct(BANDS.low) }}>
              {pct(BANDS.low)}
            </span>
            <span className="scale__tick" style={{ left: pct(BANDS.high) }}>
              {pct(BANDS.high)}
            </span>
            <div className="scale__track">
              <div
                className="scale__band"
                style={{ left: pct(BANDS.low), width: pct(BANDS.high - BANDS.low) }}
              />
              <div className={`scale__fill v-${result.verdict}`} style={{ width: pct(result.fake_probability) }} />
            </div>
            <div className="scale__legend">
              <span>Authentic</span>
              <span>Uncertain</span>
              <span>Manipulated</span>
            </div>
          </div>
        </div>
      </div>

      <div className="result__block" style={{ paddingBottom: 0, borderBottom: 0 }}>
        <span className="label">Individual checks · overall = highest score</span>
      </div>
      <ul className="checks">
        {result.scores.map((s) => {
          const key = TASK_TO_MODEL[s.task as Task];
          const spec = key ? MODELS[key] : undefined;
          const sv = verdictFor(s.fake_probability);
          return (
            <li className="check" key={`${s.task}-${s.model}`}>
              <div>
                <div className="check__name">{spec?.checkName ?? s.task}</div>
                <div className="check__model">
                  <span>{s.model}</span>
                  {spec && <span className={`tag ${spec.family === "CNN" ? "tag--cnn" : ""}`}>{spec.architecture}</span>}
                </div>
              </div>
              <div className="mini-bar" aria-hidden="true">
                <div className={`v-${sv}`} style={{ width: pct(s.fake_probability) }} />
              </div>
              <div className="check__pct">
                <span className="sr-only">{VERDICT_TEXT[sv].short}: </span>
                {pct(s.fake_probability)}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="result__grid">
        {result.segments.length > 1 && (
          <div className="result__block">
            <span className="label">
              Over time · {result.media_type === "audio" ? "4 s windows" : "sampled frames with a face"}
            </span>
            <SegmentChart segments={result.segments} mediaType={result.media_type} />
          </div>
        )}
        <div className="result__block" style={result.segments.length > 1 ? undefined : { gridColumn: "1 / -1" }}>
          <span className="label">Details</span>
          <dl className="kv">
            {rows.map(([k, val]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {result.explanation_available && <HeatmapPanel result={result} file={file} />}

      <p className="disclaimer">
        <strong>Read this</strong>
        {result.disclaimer}
      </p>

      <footer className="result__foot">
        <span className="label">Scores are model confidence, not calibrated probability</span>
        <a className="link-btn" href="#limitations">
          Known limitations
        </a>
      </footer>
    </article>
  );
}

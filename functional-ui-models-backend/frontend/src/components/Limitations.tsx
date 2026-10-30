import type { ModelInfo } from "../api/client";
import { BANDS, MODELS } from "../config/models";

const pct = (p: number) => `${Math.round(p * 100)}%`;

const KNOWN_FAILURES = [
  "Cross-dataset generalisation is the known weak point of deepfake detectors: scores on content unlike the training data are less reliable than the model cards suggest.",
  "Heavy compression, resizing, screenshots and filters can push real media towards “manipulated” and hide real artefacts.",
  "A face swap is only checked when the face is visible and mostly frontal; side profiles and very small faces may be missed.",
  "Scores are softmax confidence, not calibrated probabilities. Treat the band edges as rough cut-offs, not exact thresholds.",
];

/** About / Limitations — two-column layout (left serif heading, right bottom-bordered rows). */
export function Limitations({ byKey }: { byKey: (key: string) => ModelInfo | undefined }) {
  return (
    <section className="section" id="limitations" aria-labelledby="limits-h">
      <div className="container limits">
        <div className="limits__head">
          <h2 id="limits-h">Read before you trust</h2>
          <p>
            Which models run, what their licences allow and where they fail. This is a coursework system built on
            pretrained research models — not a forensic tool.
          </p>
        </div>

        <div>
          <span className="label">Models</span>
          {Object.values(MODELS).map((m) => {
            const live = byKey(m.key);
            return (
              <div className="field" key={m.key}>
                <div className="field__label">
                  <h3>{m.checkName}</h3>
                  <span className={`tag ${m.family === "CNN" ? "tag--cnn" : ""}`}>{m.architecture}</span>
                </div>
                <a href={m.url} target="_blank" rel="noreferrer">
                  {live?.name ?? m.id}
                </a>
                <dl className="kv" style={{ marginTop: 8 }}>
                  <dt>Input</dt>
                  <dd>{m.input}</dd>
                  <dt>Trained on</dt>
                  <dd>{m.trainedOn}</dd>
                  <dt>Licence</dt>
                  <dd>{m.licence}</dd>
                </dl>
                <p>{m.weakness}</p>
              </div>
            );
          })}

          <div className="field">
            <span className="label">What the verdicts mean</span>
            <div className="bands">
              <div>
                <span className="verdict-chip v-likely_real"><span className="vmark" aria-hidden="true" />Authentic</span>
                <span className="mono">score ≤ {pct(BANDS.low)}</span>
              </div>
              <div>
                <span className="verdict-chip v-uncertain"><span className="vmark" aria-hidden="true" />Uncertain</span>
                <span className="mono">
                  {pct(BANDS.low)} – {pct(BANDS.high)}
                </span>
              </div>
              <div>
                <span className="verdict-chip v-likely_fake"><span className="vmark" aria-hidden="true" />Manipulated</span>
                <span className="mono">score ≥ {pct(BANDS.high)}</span>
              </div>
            </div>
            <p>The overall score is the highest of the individual checks, so one suspicious detector is enough to raise a flag.</p>
          </div>

          <div className="field">
            <span className="label">Known failure cases</span>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--subtle)", display: "grid", gap: 8 }}>
              {KNOWN_FAILURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>

          <div className="field">
            <span className="label">Licence notice</span>
            <p>
              The image detector is licensed CC BY-NC 3.0 and the face model is published for research and education.
              This deployment is non-commercial coursework and must not be offered as a commercial service.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useState } from "react";
import { AUDIO_WINDOW_S, BANDS, MEDIA, MODELS, VIDEO_FRAMES } from "../config/models";
import { ScanLine } from "./ScanLine";

interface Step {
  num: string;
  title: string;
  body: string;
  tags: string[];
  rows: [string, string][];
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

const STEPS: Step[] = [
  {
    num: "01",
    title: "Validate the upload",
    body: "The server never trusts the file name or the browser's type. It streams the upload with a hard size limit and sniffs the bytes to confirm the format before anything runs.",
    tags: ["Size limit", "Byte sniffing"],
    rows: [
      ["Image", `${MEDIA.image.maxMb} MB · ${MEDIA.image.formatsLabel}`],
      ["Audio", `${MEDIA.audio.maxMb} MB · ${MEDIA.audio.formatsLabel}`],
      ["Video", `${MEDIA.video.maxMb} MB · ${MEDIA.video.formatsLabel}`],
      ["Storage", "Random name, deleted after analysis"],
    ],
  },
  {
    num: "02",
    title: "Run the right detectors",
    body: "Each media type is routed to the models trained for it. Faces are cropped before the face model sees them; audio is resampled and windowed; video is sampled frame by frame.",
    tags: ["Face crops", "16 kHz mono", `${VIDEO_FRAMES} frames`],
    rows: [
      ["Image", `${MODELS.image.id} + face CNN if a face is found`],
      ["Faces", `${MODELS.face.id} · 224 × 224 crops`],
      ["Audio", `${MODELS.audio.id} · ${AUDIO_WINDOW_S} s windows`],
      ["Video", `${VIDEO_FRAMES} frames → face CNN, audio track → speech model`],
    ],
  },
  {
    num: "03",
    title: "Return an honest verdict",
    body: "The overall score is the highest individual check — flag it if any detector is suspicious. Scores inside the middle band are reported as uncertain rather than forced into real or fake.",
    tags: ["Max across checks", "Three-way verdict"],
    rows: [
      ["Authentic", `score ≤ ${pct(BANDS.low)}`],
      ["Uncertain", `${pct(BANDS.low)} – ${pct(BANDS.high)}`],
      ["Manipulated", `score ≥ ${pct(BANDS.high)}`],
      ["Always", "Disclaimer shown with every result"],
    ],
  },
];

function LensIllustration() {
  return (
    <svg viewBox="0 0 400 300" role="img" aria-label="Face crop being scanned">
      <rect width="400" height="300" fill="#d8d6cf" />
      {Array.from({ length: 9 }).map((_, i) => (
        <ellipse
          key={i}
          cx="200"
          cy="150"
          rx={40 + i * 9}
          ry={56 + i * 11}
          fill="none"
          stroke="#1c1c1c"
          strokeWidth="0.8"
          opacity={0.9 - i * 0.08}
        />
      ))}
      <ellipse cx="178" cy="138" rx="9" ry="5" fill="#1c1c1c" />
      <ellipse cx="222" cy="138" rx="9" ry="5" fill="#1c1c1c" />
      <path d="M200 146 L194 172 L206 172" fill="none" stroke="#1c1c1c" strokeWidth="1.2" />
      <path d="M184 190 Q200 200 216 190" fill="none" stroke="#1c1c1c" strokeWidth="1.2" />
      <rect x="128" y="62" width="144" height="176" fill="none" stroke="#1c1c1c" strokeWidth="1" strokeDasharray="6 5" />
      {Array.from({ length: 13 }).map((_, i) => (
        <line key={i} x1="0" x2="400" y1={i * 25} y2={i * 25} stroke="#1c1c1c" strokeWidth="0.4" opacity="0.35" />
      ))}
    </svg>
  );
}

export function Workflow() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];

  return (
    <section className="section" id="how" aria-labelledby="how-h">
      <div className="container">
        <div className="section-head">
          <h2 id="how-h">From upload to verdict</h2>
          <p>Select a step to see exactly what the backend does with your file.</p>
        </div>

        <div className="workflow">
          <ol className="steps has-active">
            {STEPS.map((s, i) => {
              const isActive = i === active;
              return (
                <li key={s.num} className={`step ${isActive ? "is-active" : ""}`}>
                  <button
                    className="step__btn"
                    aria-expanded={isActive}
                    aria-controls={`step-${s.num}`}
                    onClick={() => setActive(i)}
                  >
                    <span className="step__num">{s.num}</span>
                    <span className="step__title">{s.title}</span>
                    <span className="step__toggle" aria-hidden="true">
                      +
                    </span>
                  </button>
                  <div className="step__body" id={`step-${s.num}`} role="region">
                    <div>
                      <p>{s.body}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <aside className="sticky-card" aria-label={`Step ${step.num} details`}>
            <div className="sticky-card__media">
              <LensIllustration />
              <div className="sticky-card__overlay">
                {step.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <ScanLine running />
            <div className="sticky-card__body">
              <span className="label">
                Step {step.num} / {String(STEPS.length).padStart(2, "0")}
              </span>
              <dl className="kv">
                {step.rows.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

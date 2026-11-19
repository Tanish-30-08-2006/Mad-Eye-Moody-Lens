import { ExternalAnalysisResult } from "../services/externalProvider";

interface Props {
  result: ExternalAnalysisResult;
  fileName?: string;
  onAnalyseNative?: () => void;
}

const VERDICT_DETAILS = {
  likely_ai: {
    chipClass: "v-fake",
    short: "LIKELY AI",
    title: "Likely AI-generated or manipulated",
    description: "The external AI model detected synthetic patterns, diffusion artifacts, or manipulation signatures.",
  },
  likely_not_ai: {
    chipClass: "v-real",
    short: "LIKELY REAL",
    title: "Likely authentic image",
    description: "The external AI model detected photographic sensor patterns consistent with camera-captured media.",
  },
  uncertain: {
    chipClass: "v-uncertain",
    short: "UNCERTAIN",
    title: "Inconclusive / borderline score",
    description: "The external model returned a low-confidence score in the uncertain threshold band.",
  },
  inconclusive: {
    chipClass: "v-inconclusive",
    short: "NO VERDICT",
    title: "Inconclusive: unmapped provider response",
    description: "The external API returned a response, but it did not contain a recognized Boolean verdict or mapped label.",
  },
};

export function ExternalResultCard({ result, fileName, onAnalyseNative }: Props) {
  const v = VERDICT_DETAILS[result.verdict];
  let endpointDomain = "External API";
  try {
    endpointDomain = new URL(result.endpoint).hostname;
  } catch {
    // Keep fallback
  }

  return (
    <article className="result result--external" aria-live="polite" aria-labelledby="external-result-title">
      <header className="result__head">
        <span className="label">
          External Analysis · {result.providerName}
          {fileName ? ` · ${fileName}` : ""}
        </span>
        <span className="label">Processed in {(result.processingMs / 1000).toFixed(1)} s</span>
      </header>

      <div className="result__hero">
        <div className="result__verdict">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <span className={`verdict-chip ${v.chipClass}`}>
              <span className="vmark" aria-hidden="true" />
              {v.short}
            </span>
            <span className="tag" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              {result.model}
            </span>
          </div>

          <h3 id="external-result-title" className="result__title">
            {v.title}
          </h3>
          <p className="note" style={{ marginTop: 8 }}>
            {v.description}
          </p>

          {result.explanation && (
            <div className="external-explanation" style={{ marginTop: 16 }}>
              <span className="label" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
                Provider Reasoning / Label
              </span>
              <p style={{ margin: 0, fontStyle: "italic" }}>"{result.explanation}"</p>
            </div>
          )}
        </div>

        <div className="result__prob">
          <span className="label">External confidence score</span>
          {result.confidence !== null ? (
            <div className="big-num">
              {Math.round(result.confidence * 100)}
              <small>%</small>
            </div>
          ) : (
            <div className="big-num" style={{ fontSize: 32 }}>
              N/A
            </div>
          )}
          {result.similarity !== null && (
            <div className="label" style={{ marginTop: 8 }}>
              Similarity: {typeof result.similarity === "number" ? (result.similarity * 100).toFixed(1) + "%" : String(result.similarity)}
            </div>
          )}
        </div>
      </div>

      <div className="result__meta">
        <div className="result__meta-grid">
          <div className="meta-item">
            <span className="label">Provider</span>
            <span className="meta-item__val">{result.providerName}</span>
          </div>
          <div className="meta-item">
            <span className="label">Model</span>
            <span className="meta-item__val">{result.model}</span>
          </div>
          <div className="meta-item">
            <span className="label">Host Domain</span>
            <span className="meta-item__val">{endpointDomain}</span>
          </div>
          <div className="meta-item">
            <span className="label">Timestamp</span>
            <span className="meta-item__val">{new Date(result.analyzedAt).toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="external-disclaimer" style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <p className="note" style={{ fontSize: 12, margin: 0 }}>
            <strong>Third-Party Model Disclaimer:</strong> This score was obtained directly from your configured external endpoint
            ({endpointDomain}). Scores, classifications, and explanations reflect the third-party model and are not verified
            by the Mad-Eye Moody Lens detector pipeline.
          </p>
        </div>

        {onAnalyseNative && (
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn--ghost" onClick={onAnalyseNative}>
              <span>Run Native Backend Analysis Instead</span>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

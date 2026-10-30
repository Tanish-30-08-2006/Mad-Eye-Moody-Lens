import type { HistoryEntry } from "../hooks/useHistory";
import { MEDIA, VERDICT_TEXT } from "../config/models";

interface Props {
  entries: HistoryEntry[];
  onOpen: (e: HistoryEntry) => void;
  onClear: () => void;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function History({ entries, onOpen, onClear }: Props) {
  return (
    <section className="section" id="history" aria-labelledby="history-h">
      <div className="container">
        <div className="section-head">
          <h2 id="history-h">Previous results</h2>
          <div style={{ display: "grid", gap: 12, justifyItems: "end" }}>
            <p>Stored only in this browser — the last 20 analyses. No media is kept anywhere.</p>
            {entries.length > 0 && (
              <button className="link-btn" onClick={onClear}>
                Clear history
              </button>
            )}
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="empty label">No analyses yet</p>
        ) : (
          <ul className="history">
            {entries.map((e) => {
              const v = VERDICT_TEXT[e.result.verdict];
              return (
                <li key={e.result.analysis_id + e.at}>
                  <button onClick={() => onOpen(e)} aria-label={`Open result for ${e.fileName}: ${v.title}`}>
                    <span className="label">{MEDIA[e.result.media_type].label}</span>
                    <span className="history__file">{e.fileName}</span>
                    <span className={`verdict-chip v-${e.result.verdict}`}>
                      <span className="vmark" aria-hidden="true" />
                      {v.short}
                    </span>
                    <span className="history__pct">
                      {Math.round(e.result.fake_probability * 100)}%
                      <br />
                      <span className="label" style={{ letterSpacing: "0.1em" }}>
                        {fmt(e.at)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

import type { ModelInfo } from "../api/client";
import { MEDIA, MODELS } from "../config/models";
import { useReveal } from "../hooks/useReveal";
import { MEDIA_ICON } from "./Icons";

interface Props {
  byKey: (key: string) => ModelInfo | undefined;
}

/** One cell per media type: upload limit + the detectors that actually run on it. */
export function ModelStats({ byKey }: Props) {
  const { ref, shown } = useReveal<HTMLDivElement>();

  return (
    <section className="section" id="models" aria-labelledby="models-h">
      <div className="container">
        <div className="section-head">
          <h2 id="models-h">Three detectors, one per problem</h2>
          <p>
            AI-generated images, swapped faces and cloned voices leave different traces, so each is checked by a model
            trained for that problem. Video reuses the face and speech models.
          </p>
        </div>

        <div ref={ref} className={`stats reveal ${shown ? "is-in" : ""}`}>
          {(Object.values(MEDIA)).map((m) => {
            const Icon = MEDIA_ICON[m.type];
            return (
              <article className="stat" key={m.type}>
                <div className="icon-box">
                  <Icon />
                </div>
                <div className="stat__num">
                  {m.maxMb}
                  <small>MB MAX</small>
                </div>
                <span className="label">
                  {m.label} · {m.mode === "job" ? "background job" : "instant"}
                </span>
                <ul className="stat__models">
                  {m.pipeline.map((k) => {
                    const live = byKey(k);
                    const spec = MODELS[k];
                    return (
                      <li key={k}>
                        <span
                          className={`dot ${live?.loaded ? "dot--online" : live ? "dot--warming" : ""}`}
                          title={live?.loaded ? "Loaded" : live ? "Loading" : "Status unknown"}
                          aria-hidden="true"
                        />
                        <span>{live?.name ?? spec.id}</span>
                        <span className={`tag ${spec.family === "CNN" ? "tag--cnn" : ""}`}>{spec.family}</span>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

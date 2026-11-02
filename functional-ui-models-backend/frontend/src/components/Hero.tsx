import type { BackendState } from "../hooks/useModels";
import type { ModelInfo } from "../api/client";
import { StatusDot } from "./Chrome";

interface Props {
  state: BackendState;
  models: ModelInfo[];
}

export function Hero({ state, models }: Props) {
  // Registry has image, face, audio + a composite "video" detector built on face.
  const core = models.filter((m) => m.key !== "video");
  const loaded = core.filter((m) => m.loaded).length;
  const badge =
    state === "offline"
      ? "Backend offline — start the API on :8000"
      : state === "connecting"
        ? "Connecting to detectors"
        : `${loaded}/${core.length || 3} pretrained detectors loaded`;

  return (
    <section className="hero" id="top">
      <div className="container hero__inner">
        <div className="badge" role="status">
          <StatusDot state={state} />
          <span className="label">{badge}</span>
        </div>
        <h1>
          Constant <em>vigilance</em>
          <br />
          for <em>synthetic</em> media
        </h1>
        <p className="hero__lede">
          Upload an image, a voice clip or a video. Three pretrained detectors estimate whether it was generated or
          manipulated — and say <em>uncertain</em> when they cannot tell.
        </p>
        <div className="hero__actions">
          <a className="btn" href="#analyse">
            <span>Analyse media</span>
          </a>
          <a className="btn btn--ghost" href="#models">
            <span>See the models</span>
          </a>
        </div>
      </div>
    </section>
  );
}

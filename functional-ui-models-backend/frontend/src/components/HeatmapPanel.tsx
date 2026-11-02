import { useEffect, useRef, useState } from "react";
import { AnalysisResult, Explanation, FaceHeatmap, getExplanation } from "../api/client";
import { MODELS } from "../config/models";

/**
 * Grad-CAM heatmaps from the EfficientNet-B0 face model (Sprint 3).
 *
 * The server returns attention maps and face boxes only — it never keeps or
 * sends image pixels. When the user's own file is still in this browser tab,
 * we cut the face out of it (images directly, video by seeking to the frame
 * time) and lay the attention over it. Re-opened from History, the file is
 * gone, so the map is drawn on its own.
 */

// Muted brick from the design system (--fake); alpha carries the intensity.
const TINT: [number, number, number] = [155, 68, 52];
const SIZE = 224;

const pct = (p: number) => `${Math.round(p * 100)}%`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

/** Greyscale attention PNG -> tinted RGBA canvas (weak attention fully transparent). */
async function tintedHeatmap(item: FaceHeatmap): Promise<HTMLCanvasElement> {
  const img = await loadImage(`data:image/png;base64,${item.heatmap_png}`);
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const data = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = data.data[i] / 255; // greyscale: R = G = B
    data.data[i] = TINT[0];
    data.data[i + 1] = TINT[1];
    data.data[i + 2] = TINT[2];
    data.data[i + 3] = v < 0.2 ? 0 : Math.round(v * 0.75 * 255);
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

/** Seek a <video> to a time and resolve once that frame is decodable. */
function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = Math.max(0, t);
  });
}

async function videoElement(url: string): Promise<HTMLVideoElement> {
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.src = url;
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => reject(new Error("Could not decode video"));
  });
  return v;
}

interface Tile {
  item: FaceHeatmap;
  dataUrl: string;
  withSource: boolean;
}

/** Compose one 224×224 tile: the face crop (if available) + tinted attention. */
async function composeTiles(items: FaceHeatmap[], file: File | null, mediaType: string): Promise<Tile[]> {
  const url = file ? URL.createObjectURL(file) : null;
  try {
    let source: CanvasImageSource | null = null;
    let video: HTMLVideoElement | null = null;
    if (url && mediaType === "image") source = await loadImage(url).catch(() => null);
    if (url && mediaType === "video") video = await videoElement(url).catch(() => null);

    const tiles: Tile[] = [];
    for (const item of items) {
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#f7f6f2";
      ctx.fillRect(0, 0, SIZE, SIZE);

      let drawn = false;
      if (video && typeof item.time_s === "number") {
        await seek(video, item.time_s);
        source = video;
      }
      if (source) {
        const [x0, y0, x1, y1] = item.box;
        ctx.filter = "grayscale(1)"; // design: source imagery in greyscale, attention in colour
        ctx.drawImage(source, x0, y0, x1 - x0, y1 - y0, 0, 0, SIZE, SIZE);
        ctx.filter = "none";
        drawn = true;
      }
      ctx.drawImage(await tintedHeatmap(item), 0, 0);
      tiles.push({ item, dataUrl: canvas.toDataURL("image/png"), withSource: drawn });
    }
    return tiles;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

interface Props {
  result: AnalysisResult;
  /** The user's original file, when still in this tab (not after reload/History). */
  file: File | null;
}

export function HeatmapPanel({ result, file }: Props) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [message, setMessage] = useState("");
  const run = useRef(0);

  useEffect(() => {
    const id = ++run.current;
    setState("loading");
    setTiles([]);
    getExplanation(result.analysis_id)
      .then((ex: Explanation) => composeTiles(ex.items, file, result.media_type))
      .then((t) => {
        if (run.current !== id) return;
        setTiles(t);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (run.current !== id) return;
        setMessage(e instanceof Error ? e.message : String(e));
        setState("error");
      });
  }, [result.analysis_id, result.media_type, file]);

  const onlyMaps = tiles.length > 0 && tiles.every((t) => !t.withSource);

  return (
    <section className="heatmaps" aria-labelledby={`hm-${result.analysis_id}`}>
      <div className="heatmaps__head">
        <span className="label" id={`hm-${result.analysis_id}`}>
          Where the face model looked · Grad-CAM
        </span>
        <span className="label">{MODELS.face.architecture}</span>
      </div>

      {state === "loading" && <p className="note">Loading heatmaps…</p>}
      {state === "error" && (
        <p className="note" role="alert">
          Heatmaps unavailable: {message}
        </p>
      )}

      {state === "ready" && (
        <>
          <ul className="heatmaps__grid">
            {tiles.map(({ item, dataUrl }) => (
              <li key={`${item.time_s ?? "img"}-${item.face_index}`}>
                <figure>
                  <img
                    src={dataUrl}
                    width={SIZE}
                    height={SIZE}
                    alt={`Attention map for ${item.source === "frame" ? `the face at ${item.time_s?.toFixed(1)} seconds` : `face ${item.face_index + 1}`}, face score ${pct(item.fake_probability)}`}
                  />
                  <figcaption>
                    <span>
                      {item.source === "frame" ? `Frame ${item.time_s?.toFixed(1)} s` : `Face ${item.face_index + 1}`}
                    </span>
                    <span>{pct(item.fake_probability)}</span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
          <p className="note">
            Shaded areas pushed the face model towards “manipulated”; darker means stronger.
            {onlyMaps && " The original file is not kept, so only the attention map is shown."} Grad-CAM shows
            where the model looked, not proof of what was edited.
          </p>
        </>
      )}
    </section>
  );
}

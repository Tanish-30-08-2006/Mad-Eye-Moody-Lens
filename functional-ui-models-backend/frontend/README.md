# Mad-Eye Moody Lens — frontend

React + Vite + TypeScript single-page app for the Sprint 2 detection API.
Editorial design system: Playfair Display / Space Grotesk / Space Mono, `#f7f6f2` background,
`#3d7068` accent, 1px `#e5e4de` borders, radius ≤ 2px, `cubic-bezier(0.16, 1, 0.3, 1)` motion.

## Run

```bash
cp .env.example .env.local      # VITE_API_URL=http://localhost:8000
npm install
npm run dev                     # http://localhost:5173
```

The backend must allow this origin (`MML_CORS_ORIGINS`, default `["http://localhost:5173"]`).
In Docker Compose the frontend is served on `:8080`, so the compose file sets
`MML_CORS_ORIGINS='["http://localhost:8080"]'`.

## Model alignment (Sprint 2 selection)

| Registry key | Model | Architecture | Used for |
|---|---|---|---|
| `image` | `Organika/sdxl-detector` | Swin Transformer | Whole-image AI-generation check |
| `face` | `Xicor9/efficientnet-b0-ffpp-c23` | EfficientNet-B0 **CNN** | Face crops in images and every sampled video frame |
| `audio` | `MelodyMachine/Deepfake-audio-detection-V2` | wav2vec2-family | 4 s windows of 16 kHz mono audio, and the video's audio track |
| `video` | composite (face + audio) | — | 24 sampled frames + extracted audio, background job |

All of this lives in `src/config/models.ts`. It must match `backend/app/core/config.py`:
model IDs, upload limits (10 / 25 / 100 MB), `video_frames = 24`, `audio_window_s = 4.0`,
`video_check_audio = true`, and bands `0.35 / 0.65` (`VITE_BAND_LOW` / `VITE_BAND_HIGH`).
The **backend** decides every verdict; the frontend only draws the band markers and labels
individual checks. Live model names and load state come from `GET /api/v1/models`.

If you swap a model with an `MML_*` env var after benchmarking, update the matching entry in
`src/config/models.ts` (description, architecture, licence) so the About section stays truthful.

> SRS note: only the face model is a CNN. Image and audio are transformers — log the
> wording change ("pretrained deep-learning models") as a requirements change.

## Contract

`src/api/client.ts` mirrors `backend/app/schemas.py` field for field, including the
`details` keys each analyser emits (`faces_found`, `duration_s`, `frames_sampled`,
`frames_with_face`, `max_frame_probability`, `fraction_flagged`, `audio_checked`).
Error bodies are read from `{error}` (AnalysisError) and `{detail}` (HTTPException).

Uploads use XHR rather than fetch so the UI shows real upload progress for large videos.

## Sections → Sprint 2 screens

| Design section | App purpose |
|---|---|
| Nav + pulse badge | Backend / model load state (polls `/models` while warming or offline) |
| Statistics grid | One cell per media type: limit + the models that run on it |
| Use-case tabs | **Analyse** screen — image / audio / video upload, preview, pipeline, progress |
| Result card | Verdict (colour + glyph + text), probability scale with bands, per-check scores, timeline, details, disclaimer |
| Text reveal | Honesty statement |
| Interactive workflow | Validate → detect → verdict, with the real limits and models |
| History | Last 20 results in `localStorage` (no server-side media) |
| Contact-form layout | **About / Limitations** — models, licences, bands, failure cases |

The design brief's pill-shaped tabs conflict with its own "radius ≤ 2px" rule; the rule wins.

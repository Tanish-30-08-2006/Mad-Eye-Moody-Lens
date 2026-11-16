# Connect the Reddit extension to the Sprint 2 detectors

The [extension API contract](../../frontend/docs/API-CONTRACT.md) is the source of truth for routes, schemas, cache keys, and job behavior. The model boundary is [DetectionBrain](../moody_lens_ext/brain/interface.py). The API accepts validated files and calls this interface; there is no second set of model endpoints.

## Use the demo locally

From reddit_extension/backend, with FastAPI, Uvicorn and python-multipart installed, set MML_BRAIN=stub and run `python -m uvicorn moody_lens_ext.standalone:app --port 8000`. In PowerShell set it with `$env:MML_BRAIN='stub'`. Point the unpacked extension at http://localhost:8000. Brain status should report healthy true and is_mock true; every result is demo data and cannot supply sharing or moderation evidence. For video/audio mux or duration tests, put ffmpeg and ffprobe on PATH. For Tier-2 testing only, enable FEATURE_DETECT_URL and install yt-dlp; Reddit may block the server request.

## Connect the selected models

Run the existing host with MML_BRAIN=host, MML_DETECTOR_BACKEND=real and MML_ALLOW_MOCK=false. The host adapter calls the shared fast and video dispatchers. Ensure the fast and video workers publish readiness and share the host's configured Redis, database, and storage. The API and workers must use matching model revisions and pipeline settings. The browser polls the extension job ID; the API retains that mapping in memory even when the underlying host job is durable (see the contract).

For a custom implementation, register a class implementing DetectionBrain via set_brain() at startup. Set capabilities and readiness accurately. Return None for a check that did not run. Use the detector's class mapping to report a manipulation score from 0 to 1, true model IDs and revisions, and mock true for demo results. The shared host's legacy confidence field is derived from distance from 0.5; it is not a calibrated confidence interval. Set a new brain version whenever weights, normalization, sampling, aggregation, or other result-affecting settings change. Return valid measured start/end seconds only when localization exists. Use the existing BrainUnsupported or BrainError for unsupported or failed inference and BrainUnavailable for a deployment that cannot run it. Advertise explain only when the implementation supports it; the existing explain route retains at most 20 short-lived file copies for ten minutes.

The local **Sprint 2 Implementation Guide** was read: §4.3 defines the common detector interface; §§4.4–4.9 cover image generation, face cropping/manipulation, windowed audio, sampled video and optional video-audio analysis; §§6.2–6.5 cover validated upload and background video work; §7 calls for stubbed tests; §§8.2–8.5 cover polling and timelines; §9 covers container integration; §12 describes optional explanations. The Reddit API preserves its own existing route shapes.

Guide §2.2 candidate names, for the team's benchmark and license review only:

| Check | Candidates from the guide |
|---|---|
| Generated images | Organika/sdxl-detector; umm-maybe/AI-image-detector |
| Face/video | Xicor9/efficientnet-b0-ffpp-c23; dima806/deepfake_vs_real_image_detection; GPU stretch: HoopitAI/video-deepfake-detection-GenD_DINOv3_L_FF |
| Synthetic speech | MelodyMachine/Deepfake-audio-detection-V2; nii-yamagishilab/wav2vec-large-anti-deepfake-nda |

## Deployment smoke test after model selection

1. Package reddit_extension/backend on the host application's Python import path. The current host Docker build copies its own app, not the extension. Inspect the deployed OpenAPI document for /api/v1/detect, /detect/batch and /brain/status with their full prefix, and look for reddit_extension_router_unavailable in the host logs. Keep the existing extension host/CORS policy. Because extension job IDs are process-local, use a single API process or a deployment configuration that consistently routes submit and poll to the same process.
2. Check /api/v1/health for liveness and /api/v1/brain/status for healthy true and is_mock false. Confirm the host's readiness shows both inference queues and model revisions match the validated selection.
3. Submit consented test samples through the extension: an image with and without a face, standalone audio via the API, one silent video, one video with a separate audio track, and a gallery. Verify the video ID is returned before inference completes; poll each to completion and confirm actual model revisions, mock false, and absent scores for checks not run. Confirm measured time bounds only on the samples whose detectors produce them.
4. Use the same video with two different tracks and without a separate track; verify three distinct cache identities. Stop the workers while leaving the API up: readiness or scan should show unavailable while source, rules, sharing and review still work. Use a signed-in Reddit browser to verify native controls, current community rules/flair, and available repost data without submitting anything.

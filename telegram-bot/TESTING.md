# Telegram Bot — Testing and Acceptance

Recorded 21–22 November 2026 on macOS arm64 against `main` at `156aca2`. The bot downloads Telegram media into memory, submits it to the shared `/api/v1` backend, and formats the response. Detection runs on the backend.

## Run the automated checks

| Check | Prerequisites |
| --- | --- |
| Bot unit tests | Python 3.11 or newer per [pyproject.toml](pyproject.toml). In a Python test environment, run `python -m pip install -r requirements.txt -r requirements-dev.txt` from `telegram-bot`. |
| In-process host contract | Use the same environment for the bot and the backend's [runtime](../functional-ui-models-backend/backend/requirements.txt) and [test](../functional-ui-models-backend/backend/requirements-dev.txt) dependencies, including `fakeredis`, `sqlalchemy`, `soundfile`, and `celery`. Put `ffprobe` on `PATH` for WAV validation. The fixture uses FastAPI in process, stub detectors, eager Celery, SQLite, and fake Redis. It needs no model weights or running services. |

From the repository root, run these in a test checkout without `telegram-bot/.env`. The host settings can read that file during collection. The pytest commands clear inherited credentials and disable pytest and bytecode caches in the checkout.

```bash
cd telegram-bot
test ! -e .env && env -i PATH="$PATH" PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
  python -m pytest -ra -p no:cacheprovider

# Contract only, with bot and backend dependencies in the active environment
test ! -e .env && env -i PATH="$PATH" PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
  python -m pytest -ra -p no:cacheprovider tests/test_against_host.py

ruff check --no-cache mml_bot tests
```

### Recorded results

The initial run used the existing `.venv` with Python 3.9.6 and reported `7 passed, 1 skipped in 0.31s`. The repeat used Python 3.11.14 with the existing bot test packages. The exact repeat and lint commands below ran from `telegram-bot` and both exited 0.

```bash
test ! -e .env && env -i PATH="$PATH" PYTHONPATH="$PWD/.venv/lib/python3.9/site-packages" \
  PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3.11 -m pytest -ra -v -p no:cacheprovider
.venv/bin/ruff check --no-cache mml_bot tests
```

```text
platform darwin -- Python 3.11.14, pytest-8.4.2, pluggy-1.6.0
collected 7 items / 1 skipped
tests/test_units.py .......                                              [100%]
SKIPPED [1] tests/test_against_host.py:35: could not import 'fakeredis': No module named 'fakeredis'
========================= 7 passed, 1 skipped in 0.62s =========================
```

Ruff output was `All checks passed!`. On the initial runs, the contract module skipped during collection and `ffprobe` was unavailable on the test `PATH`.

On 21 November, the full suite was rerun in a temporary environment with Python 3.11.14, pytest 9.2.0, the bot and host test dependencies, and FFprobe n4.4.1. From `telegram-bot`, with that environment and FFprobe on `PATH`, the command was:

```bash
test ! -e .env && env -i PATH="$PATH" PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
  python -m pytest -ra -v -p no:cacheprovider
```

```text
collected 8 items
tests/test_against_host.py .                                             [ 12%]
tests/test_units.py .......                                              [100%]
============================== 8 passed in 3.13s ===============================
```

### What the existing tests assert

| Test | Expected assertion | Actual |
| --- | --- | --- |
| `test_api_error_message_is_passed_through_verbatim` | The mocked 429 preserves the message, status, and `Retry-After: 12`. The request uses the test `X-API-Key` and `upload.img`. | Pass |
| `test_unreachable_api_is_a_plain_message` | A mocked `httpx.ConnectError` raises an `ApiError` with an unreachable message. | Pass |
| `test_video_timeout_cancels_the_job` | A running job at a zero-second deadline produces GET then DELETE and raises an error containing “cancelled.” | Pass |
| `test_format_result_escapes_and_reports_missing_audio` | The fixture renders the likely-fake label, 80%, 20/24 frames, and the missing/silent soundtrack line. Model and disclaimer text are HTML-escaped. | Pass |
| `test_format_progress_and_gauge` | Frames show 50%, the audio stage mentions the soundtrack, and 0.34 renders three filled gauge squares. | Pass |
| `test_limiter_window_and_one_video_per_user` | With a test quota of two, the third hit is blocked. A second user is unaffected, the first can retry at 61 s, the video slot can be released, and pruning removes expired entries. | Pass |
| `test_pick_media_routes_by_attachment_type` | The largest photo routes to image, voice to audio, a `video/webm` document to video, and a PDF returns no media. | Pass |
| `test_image_audio_and_status_through_the_real_api` | The client gets an image verdict for a synthetic PNG, a five-second WAV result with segments, readiness and model keys, and a 415 with a message for unrecognised bytes. | Pass on rerun with host dependencies |

The seven [unit tests](tests/test_units.py) use local fixtures and mock HTTP. The [host contract test](tests/test_against_host.py) exercises image, audio, readiness and model listing through an in-process API.

### Local HTTP smoke

The bot's HTTP client also ran against the shared API over localhost with stub detectors, eager Celery, fake Redis, and a temporary SQLite database. These checks used generated media.

| Check | Observed |
| --- | --- |
| Readiness and models | `/ready` returned 200 and ready status. `/models` listed audio, face, image, and video. |
| Image and audio | PNG and WAV uploads returned 200 with formatted checks. The five-second WAV returned “Likely real” at 20%, with a highest-scoring window of 0.0–4.0 s. |
| Video | Both five-second clips returned 202 and a completed result on polling. The clip with audio returned “Uncertain” at 54%, a 20% synthetic-speech score, 24/24 frames with a face, and 62% flagged. The silent clip showed the “none (or silent)” soundtrack note. |
| Invalid media | Unrecognised image bytes returned 415. An empty upload returned 422. |
| Storage after the run | No original uploads or temporary files remained. The four results had 168-hour expiry timestamps and the two video jobs had 24-hour expiry timestamps. Expiry enforcement and cleanup after cancellation remain pending. |

Eager execution can finish video analysis before the first poll, so progress and worker cancellation require a separate run.

#### Recorded local audio and video replies

The bot formatter rendered these replies from the local HTTP smoke results. The WAV contains a five-second tone. The MP4 combines a static test image with that tone.

**Audio (`qa-audio.wav`)**

```text
🟢 Likely real
Fake probability: 20%
🟥🟥⬜⬜⬜⬜⬜⬜⬜⬜

Checks
• Synthetic speech: 20% (MelodyMachine/Deepfake-audio-detection-V2)

Duration: 5.0 s
Most suspicious window: 0.0–4.0 s (20%)
```

**Video with audio (`qa-video.mp4`)**

```text
🟡 Uncertain
Fake probability: 54%
🟥🟥🟥🟥🟥⬜⬜⬜⬜⬜

Checks
• Face manipulation: 54% (Xicor9/efficientnet-b0-ffpp-c23)
• Synthetic speech: 20% (MelodyMachine/Deepfake-audio-detection-V2)

Frames with a face: 24/24
Frames flagged: 62%
Face heatmaps are available in the web app for this analysis.
```

Both replies included the bot’s disclaimer.

> This is a probabilistic estimate from pretrained models, not forensic proof. Results can be wrong, especially on content unlike the models' training data.

## Manual Telegram acceptance

The QA bot used the local stub backend throughout the Telegram for macOS run. The command replies appeared at 20:26–20:29 IST on 21 November 2026 and the photo reply at 20:45 IST. The tester's audio and video uploads received their replies at 00:22 IST on 22 November 2026. The replies were confirmed in the QA chat.

1. Use a team-approved test bot, an isolated backend, and two authorised Telegram test accounts. Use synthetic or consented JPEG/PNG, voice/WAV, and short MP4 fixtures, including a clip with faces and audio and a silent clip. Record whether the backend is using stub or real detectors.
2. Follow the [backend setup](../functional-ui-models-backend/README.md) for a local stub stack or use the approved test service. For a local API on port 8000, check `curl -fsS http://localhost:8000/api/v1/ready`. In the bot environment, supply the test `TELEGRAM_BOT_TOKEN`, set `MML_API_BASE_URL` to the approved URL ending in `/api/v1`, and supply a test `MML_API_KEY` only if configured. Start one polling process with `python -m mml_bot.bot` from `telegram-bot`. [Bot setup](README.md#run-it-locally)
3. Run the cases from authorised chats. Record the bot and backend revisions, Telegram client version, input, actual response, and redacted evidence next to the case ID. Mark Pass or Fail only after execution against the expected result. Record the blocker for any case that cannot run.

### Commands and media

| ID | Test steps | Expected result | Actual |
| --- | --- | --- | --- |
| TG-FN-001 | Send `/start`. | A personalised greeting, supported inputs and the configured download cap. | Pass. Telegram displayed the greeting, image, audio and video instructions, and a 20 MB download cap. |
| TG-FN-002 | Send `/help`. | Help text without the greeting. | Pass. Telegram displayed the supported inputs, download cap and probability disclaimer. |
| TG-FN-003 | Send `/privacy`. | A message describing forwarding, cleanup and seven-day score retention. | Pass. Telegram displayed all three statements. Storage and log checks are tracked below. |
| TG-FN-004 | Send `/status` with a ready backend. | Readiness, available worker counts and model load state. | Pass. The reply showed “Detection service ready”, one worker for `inference.fast` and one for `inference.video`, and loaded indicators for image, face, audio and video. |
| TG-FN-010 | Send a PNG or JPEG as a photo. | The bot shows an image verdict, probability gauge, model checks and disclaimer. Face details appear when supplied by the backend. | Pass. Telegram showed “Likely AI-generated or manipulated” at 90%, an 80% face-manipulation check, one face, a note about web heatmaps, and the disclaimer. |
| TG-FN-011 | Send the original image as a file. | The bot routes the document to image analysis and returns a formatted result. | Pending |
| TG-FN-012 | Send a Telegram voice note. | A formatted audio result with duration and the highest-scoring window when segments are returned. | Pending |
| TG-FN-013 | Send a supported audio file through Telegram. | A formatted audio result with a synthetic-speech score, duration and the highest-scoring window when segments are returned. | Pass. The uploaded audio file returned “Likely real” at 20%, a displayed duration of 10.1 s and a highest-scoring window of 0.0–4.0 s at 20%. |
| TG-FN-014 | Send a video with no usable soundtrack as a Telegram video. | A completed video result with frame details and a note that the soundtrack was absent or silent. | Pass. The clip returned “Uncertain” at 54%, with 24/24 frames reported as containing a face and 62% flagged. The reply showed that the soundtrack was none or silent and had been skipped. |
| TG-FN-015 | Send a round video message. | The bot routes it to video analysis and returns a result. | Pending |
| TG-FN-016 | Send a Telegram animation. | The bot routes it to video analysis and returns a result. | Pending |
| TG-FN-017 | Send a supported video as a file. | The bot routes the document to video analysis and returns a result. | Pending |
| TG-FN-018 | Send a video with usable speech as a Telegram video. | The video result includes the synthetic-speech score after the soundtrack check. | Pending in Telegram. Exercised in the local HTTP run. |

Telegram document routing uses MIME prefixes. The backend checks the bytes independently. A Telegram animation goes through the video path. A raw GIF submitted as an `image/gif` document is outside the backend image allowlist. [Handlers](mml_bot/bot.py#L56) · [API client](mml_bot/client.py#L82) · [Result formatting](mml_bot/format.py#L43) · [Upload validation](../functional-ui-models-backend/backend/app/core/uploads.py#L35)

### Negative cases, limits and recovery

Bot defaults are 20 MiB per download (displayed as 20 MB), six media attempts per user in a rolling 60-second window, and a 360-second video polling budget. The API independently defaults to 10/25/100 MiB for image/audio/video, 40 million pixels per image, 600 s for each audio/video file, and 2160 pixels of video height. Use the active test settings for acceptance. [Bot settings](mml_bot/config.py#L17) · [Limiter](mml_bot/limits.py#L15) · [Backend settings](../functional-ui-models-backend/backend/app/core/config.py#L57)

| ID | Test steps | Expected result | Actual |
| --- | --- | --- | --- |
| TG-NEG-001 / 002 | 1. Send a PDF. 2. Send plain text and an unknown command. | The PDF receives the supported-media prompt. Plain text and the unknown command have no matching handler. | Pending |
| TG-NEG-003 | 1. Send bogus bytes named `broken.png` as a document. 2. If Telegram refuses it or assigns a non-media MIME type, send the fixture directly to the isolated image API. 3. Try a damaged image whose header still identifies its format, then a zero-byte upload. | The API returns 415 for unrecognised bytes or 422 for a recognised container that fails validation or an empty upload. The bot displays the API's error when the request reaches the API. | Pending |
| TG-BND-001 | 1. Set a small `BOT_MAX_DOWNLOAD_MB` in the test bot. 2. Send valid media as documents at the configured size and one byte above it. | With a known `file_size`, the exact limit clears the bot's size check. One byte above is rejected before download or API upload. A Telegram download error containing “too big” also shows the size warning. | Pending |
| TG-BND-002 | 1. Send six small supported files from one user within 60 s. 2. Send a seventh, try from a second user, and retry from the first after the oldest attempt expires. | The seventh hits the bot's wait message. The second user has an independent allowance. The first user can retry when the window frees a slot. The backend may apply its separate shared quota. | Pending |
| TG-BND-003 / TG-CON-001 | 1. Keep a video running and send a second video from the same user. 2. Submit media from another chat while it runs. 3. Retry after the first video finishes or fails. | The overlapping video is refused. Replies go to the originating chat, the other user can submit within backend capacity, and the first user's video slot is released. | Pending |
| TG-BND-005 | 1. Send a valid image above the API cap but below the bot cap. 2. In the isolated API, check valid samples at and above the applicable size, duration, pixel or height limit. | API byte-cap failures return 413. Resolution and duration violations return 422. Values exactly at a limit clear that check when all other validations pass. API caps above the bot cap require direct test API requests. | Pending |
| TG-FN-005 / TG-INT-003 | 1. Send `/status` with the API reachable but `/ready` returning 503 and `/models` working. 2. Stop the isolated API and retry `/status` and a media upload. 3. Restore it and retry. | Status changes from “not ready yet” to “unreachable.” A refused media connection produces a plain service error. A new submission works after service recovery. | Pending |
| TG-INT-002 / 004 | 1. Use a controlled test API response for 429 with a numeric `Retry-After`, 503, and 504. 2. Simulate an HTTP timeout. | The bot shows the backend message or its fallback, adds a retry delay when supplied, and reports that the service did not answer in time on an HTTP timeout. | Pending |
| TG-BND-004 / TG-INT-009 | 1. Hold a test video job in a nonterminal state past a shortened `BOT_VIDEO_TIMEOUT_S`. 2. Observe the DELETE request and check the worker outcome. 3. Return a failed job on a new submission. | The bot polls about every two seconds between responses, requests cancellation at its deadline, and replaces the progress message with the timeout or job failure. Cancellation is best-effort. Verify worker cleanup separately. | Pending |
| TG-INT-010 | 1. Return a 200 response with invalid JSON from the controlled API. 2. Submit valid media after restoring the response. | The generic handler can reply “Something went wrong while analysing this file.” A later valid request can complete. Separately record any well-formed but incomplete JSON that renders “No verdict” and 0%. | Pending |

The client defaults to a five-second HTTP connect timeout and 45 seconds for the other HTTP operations. Progress edits are throttled to at least four seconds apart. A video submit error can leave the initial upload message alongside a separate error reply. The video polling deadline is checked after a nonterminal poll returns. [Media and video handlers](mml_bot/bot.py#L143) · [Client errors and polling](mml_bot/client.py#L32)

### Security and privacy

| ID | Test steps | Expected result or source evidence | Actual |
| --- | --- | --- | --- |
| TG-SEC-001 / 003 / 005 | 1. Inspect test-only upload metadata and success and error logs with disposable credentials. 2. Check a model or error message containing harmless HTML characters. | Generic names `upload.img`, `upload.audio`, and `upload.video` replace the Telegram filename. No chat identity is added to the API request. Dynamic display text should be literal. Verify that logs and error replies omit tokens, keys, chat IDs and original filenames. Inspect tracebacks as well as normal logs because `on_error` includes exception details. | Pending. Unit tests cover `upload.img` and selected HTML escaping. |
| TG-SEC-010 | 1. Set `BOT_ALLOWED_CHAT_IDS` to one authorised test chat. 2. Send media and `/status` from both chats. | Media from the excluded chat gets “This bot is private.” The current allowlist applies to media. Command handlers remain callable from a chat whose messages reach the bot. | Pending |
| TG-SEC-012 | 1. Inspect the test bot's local storage and backend upload storage before and after completion, final failure and cancellation. 2. Verify result and job expiry with the test settings and worker maintenance. | The bot holds media in memory and forwards the original bytes, which can contain embedded metadata. Workers clean up on terminal paths. A revoked queued job may depend on the stale-upload sweep. Backend defaults retain results and any heatmaps for seven days and jobs for 24 hours. | Pending |

The bot excludes `.env` in [Git](.gitignore) and its [Docker build context](.dockerignore). The [container runs as a non-root user](Dockerfile#L14). [Upload names and headers](mml_bot/client.py#L18) · [Logging](mml_bot/bot.py#L218) · [Worker cleanup](../functional-ui-models-backend/backend/app/worker/tasks.py#L49) · [Retention](../functional-ui-models-backend/backend/app/core/config.py#L80)

## CI coverage and open checks

- The Ubuntu `telegram-bot-ci` job installs bot dependencies on Python 3.11 and runs `pytest tests/test_units.py -v`. The host contract, bot Ruff check, Telegram acceptance, and bot container build are outside that job. The root Docker check builds the backend image. [CI workflow](../.github/workflows/ci.yml#L97) · [Root Dockerfile](../Dockerfile)
- Pending sign-off includes the remaining Telegram input and failure cases, overlapping users, progress and cancellation with a separate worker, expiry enforcement, and log checks. The stub contract checks API compatibility. Model accuracy and deployment behaviour remain unverified in this run.
- Confirm the approved test bot and backend, deployed limit and retention overrides, intended group-chat and command access policy, and how an incomplete API result should be presented.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Wrong Python or `mml_bot` import fails | Activate a Python 3.11+ test environment, install the bot requirements, and start pytest from `telegram-bot`. |
| Contract module skips or the valid WAV is rejected | Install host runtime and test requirements alongside the bot's in an isolated test environment. Check the import named in the skip and run `ffprobe -version` before repeating the contract. |
| Bot cannot start or replies “This bot is private.” | Check that the approved test token is set, one process is polling, and the test chat ID is included when the allowlist is enabled. |
| Status is unreachable or analyses time out | Check the test API URL and `/api/v1` suffix, then `/ready` and worker state. On a stalled video, verify the job and cancellation outcome before retrying. |
| Media is rejected as too large or invalid | Check both the bot download cap and the backend modality limits. Send the original as a document when checking exact bytes and compare the API response with the actual fixture format. |

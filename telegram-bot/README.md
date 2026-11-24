# Mad-Eye Moody Lens: Telegram bot

A Telegram front end for the shared Mad-Eye Moody Lens backend (`functional-ui-models-backend`). The bot runs no model. It forwards each file to `/api/v1`, so Telegram users get the same pretrained models, verdict bands, limits and privacy rules as the web app and the browser extensions.

| You send | API call | Checks |
| --- | --- | --- |
| Photo, or an image sent as a file | `POST /analyze/image` | AI-generated image (`Organika/sdxl-detector`), plus face manipulation when a face is found |
| Voice note, or an audio file | `POST /analyze/audio` | Synthetic speech (`MelodyMachine/Deepfake-audio-detection-V2`) in 4 s windows |
| Video, round video, GIF, or a video sent as a file | `POST /analyze/video`, then poll `/jobs/{id}` | Face manipulation on 24 frames, plus the soundtrack |

Commands: `/start`, `/help`, `/status` (API readiness and loaded models) and `/privacy`.

## Deploy to Render (always-on, no local server)

The bot is a lightweight worker (no models, no GPU, ~50 MB RAM) that connects to the already-deployed backend at `madeye-moody-backend.onrender.com`. Once deployed it stays running — just message your bot on Telegram anytime.

### One-time setup

1. **Create a bot** — open Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, follow the prompts, copy the token.
2. **Deploy on Render**:
   - Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → connect this repo.
   - Render reads [`telegram-bot/render.yaml`](render.yaml) and creates a **Background Worker** called `mml-telegram-bot`.
   - In the service's **Environment** tab, paste your `TELEGRAM_BOT_TOKEN`.
   - Click **Manual Deploy** → **Deploy latest commit**.
3. **Message your bot** on Telegram — send `/start`, then send a photo, voice note or video.

The [`render.yaml`](render.yaml) file configures everything. The bot calls the production API at `https://madeye-moody-backend.onrender.com/api/v1` — no local backend needed.

> **Tip:** Render's free-tier workers stay running 24/7 (workers are not suspended like free web services). The bot uses long polling, so it needs no inbound port.

## Run it with the full stack (Docker)

The bot is an optional service in `functional-ui-models-backend/docker-compose.prod.yml`, under the `telegram` profile:

```bash
cd functional-ui-models-backend
# In .env: set TELEGRAM_BOT_TOKEN, and put the same random key in MML_BOT_API_KEY and in MML_API_KEYS.
docker compose -f docker-compose.prod.yml --profile telegram up -d
```

## Run it locally

Start the backend first (`./dev.sh redis | worker | api` in `functional-ui-models-backend`). Then:

```bash
cd telegram-bot
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set TELEGRAM_BOT_TOKEN; MML_API_BASE_URL=http://localhost:8000/api/v1
python -m mml_bot.bot
```

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | (required) | Token from @BotFather |
| `MML_API_BASE_URL` | `http://api:8000/api/v1` | Backend API base URL |
| `MML_API_KEY` | none | Sent as `X-API-Key`. If the key is in the API's `MML_API_KEYS`, the bot gets the higher rate limits. Recommended, because all users share the bot's one address. |
| `BOT_REQUESTS_PER_MIN` | 6 | Files per user per minute |
| `BOT_VIDEO_TIMEOUT_S` | 360 | Give up and cancel a video job after this long |
| `BOT_MAX_DOWNLOAD_MB` | 20 | Telegram's download cap for bots |
| `BOT_ALLOWED_CHAT_IDS` | empty (everyone) | Comma-separated chat ids, for a private demo bot |

## Privacy

- Files are downloaded into memory and sent to the API as `upload.img`, `upload.audio` or `upload.video`. The original file name never leaves Telegram.
- The bot stores nothing. The API deletes the upload when the analysis ends and keeps only the scores, for 7 days.
- Logs record only the media kind and the API status code. There are no chat ids, user names, file names or file contents. `httpx` request logging is turned down because Telegram URLs contain the bot token.

## What changed from the first version

The first bot shipped its own FastAPI service (`app/api.py`, `app/detector.py`), which loaded `Organika/sdxl-detector` in-process. That gave a second copy of the image model, with no upload validation and no rate limits. It also had a `custom_pt` mode for a team-trained CIFAKE ResNet-18. The project's fixed decisions say pretrained models only, so that mode was removed along with the in-process service. The bot now uses the shared backend, which also adds audio and video. The package was renamed from `app` to `mml_bot` so it no longer clashes with the backend's `app` package.

## Tests

```bash
pytest   # unit tests; with the backend's venv, also a contract test against the real API in-process
```

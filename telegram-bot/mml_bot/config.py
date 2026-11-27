"""Bot settings from environment variables (a local .env is loaded in development)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _ids(raw: str) -> frozenset[int]:
    return frozenset(int(x) for x in raw.replace(" ", "").split(",") if x)


def _normalize_api_url(raw: str) -> str:
    url = raw.strip().rstrip("/")
    if not url.endswith("/api/v1"):
        url = f"{url}/api/v1"
    return url


def _model_mode(raw: str) -> str:
    mode = raw.strip().lower()
    if mode in ("", "real", "lightweight", "local"):
        return "real"
    if mode in ("backend", "api", "remote"):
        return "backend"
    if mode == "stub":
        return "stub"
    raise SystemExit(f"Invalid MODEL_MODE={raw!r}. Expected 'real', 'backend', or 'stub'.")


@dataclass(frozen=True)
class BotSettings:
    token: str
    # Inside docker compose the API is http://api:8000; locally http://localhost:8000.
    api_base_url: str = "http://api:8000/api/v1"
    api_key: str | None = None
    model_mode: str = "real"
    requests_per_min: int = 6
    video_timeout_s: int = 360  # worker hard limit 300 s + queue headroom
    # Telegram's Bot API lets bots download files up to 20 MB.
    max_download_mb: int = 20
    # Empty = anyone may use the bot. For a demo, list the team's chat ids.
    allowed_chat_ids: frozenset[int] = field(default_factory=frozenset)
    # Optional HTTP port for PaaS health checks (e.g. Render Web Service free tier).
    port: int | None = None


def load_settings() -> BotSettings:
    try:
        from dotenv import load_dotenv  # optional, development only

        load_dotenv()
    except ImportError:
        pass
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("BOT_TOKEN") or "").strip()
    if not token or token.startswith("YOUR_"):
        raise SystemExit(
            "TELEGRAM_BOT_TOKEN (or BOT_TOKEN) is not set. Create a bot with @BotFather and put its token in .env."
        )
    raw_url = os.getenv("MML_API_BASE_URL") or os.getenv("BACKEND_URL") or BotSettings.api_base_url
    raw_port = os.getenv("PORT", "").strip()
    port = int(raw_port) if raw_port.isdigit() else None
    return BotSettings(
        token=token,
        api_base_url=_normalize_api_url(raw_url),
        api_key=os.getenv("MML_API_KEY") or None,
        model_mode=_model_mode(os.getenv("MODEL_MODE", BotSettings.model_mode)),
        requests_per_min=_int("BOT_REQUESTS_PER_MIN", BotSettings.requests_per_min),
        video_timeout_s=_int("BOT_VIDEO_TIMEOUT_S", BotSettings.video_timeout_s),
        max_download_mb=_int("BOT_MAX_DOWNLOAD_MB", BotSettings.max_download_mb),
        allowed_chat_ids=_ids(os.getenv("BOT_ALLOWED_CHAT_IDS", "")),
        port=port,
    )

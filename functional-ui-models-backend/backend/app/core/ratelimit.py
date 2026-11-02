"""Fixed-window rate limiting in Redis (design doc Section 8).

Clients are identified by an HMAC of their IP (or of their API key), never
the raw value, and counters expire with their window, so nothing about a
client outlives a few minutes.

| bucket | anonymous    | with X-API-Key |
| fast   | 30 / minute  | 120 / minute   |
| video  | 5 / 10 min   | 30 / 10 min    |
| poll   | 120 / minute | 600 / minute   |
"""

from __future__ import annotations

import hashlib
import hmac
import math
import time
from dataclasses import dataclass

from fastapi import Request

from app.core.config import settings
from app.core.errors import RateLimited
from app.core.metrics import RATE_LIMITED
from app.core.redis import get_redis


@dataclass(frozen=True)
class Limit:
    anonymous: int
    with_key: int
    window_s: int


def _limits() -> dict[str, Limit]:
    return {
        "fast": Limit(settings.rl_fast_per_min, settings.rl_fast_per_min_key, 60),
        "video": Limit(settings.rl_video_per_10min, settings.rl_video_per_10min_key, 600),
        "poll": Limit(settings.rl_poll_per_min, settings.rl_poll_per_min_key, 60),
    }


def _digest(value: str) -> str:
    return hmac.new(settings.client_hash_secret.encode(), value.encode(), hashlib.sha256).hexdigest()[:24]


def client_identity(request: Request) -> tuple[str, bool]:
    """Return (hashed client id, has_valid_api_key)."""
    key = request.headers.get("x-api-key")
    if key and key in settings.api_keys:
        return "k:" + _digest(key), True
    # Behind nginx the real client is the first X-Forwarded-For hop.
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    return "ip:" + _digest(ip), False


def check_rate_limit(request: Request, bucket: str) -> None:
    """Raise RateLimited (429 + Retry-After) when the client exceeds its window."""
    if not settings.rate_limit_enabled:
        return
    limit = _limits()[bucket]
    client, keyed = client_identity(request)
    allowed = limit.with_key if keyed else limit.anonymous
    now = time.time()
    window = int(now // limit.window_s)
    redis_key = f"rl:{bucket}:{client}:{window}"
    r = get_redis()
    pipe = r.pipeline()
    pipe.incr(redis_key)
    pipe.expire(redis_key, limit.window_s + 5)
    count, _ = pipe.execute()
    if int(count) > allowed:
        RATE_LIMITED.labels(bucket).inc()
        retry_after = max(1, math.ceil((window + 1) * limit.window_s - now))
        raise RateLimited(retry_after)

"""Shared Redis connection (live job progress, heartbeats, rate limits)."""

from __future__ import annotations

import redis

from app.core.config import settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.redis_url, decode_responses=True, socket_timeout=5)
    return _client


def set_redis(client: redis.Redis | None) -> None:
    """Test hook (fakeredis)."""
    global _client
    _client = client

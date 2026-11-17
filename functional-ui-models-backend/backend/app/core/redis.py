"""Shared Redis connection (live job progress, heartbeats, rate limits)."""

from __future__ import annotations

import ssl
from urllib.parse import parse_qs, urlencode, urlparse

import redis

from app.core.config import settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        url = settings.redis_url
        kwargs: dict = {"decode_responses": True, "socket_timeout": 5}
        if "ssl_cert_reqs" in url:
            u = urlparse(url)
            qs = parse_qs(u.query)
            cert_req = qs.pop("ssl_cert_reqs", [None])[0]
            if cert_req:
                c = cert_req.upper()
                if c in ("CERT_NONE", "NONE"):
                    kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
                elif c in ("CERT_REQUIRED", "REQUIRED"):
                    kwargs["ssl_cert_reqs"] = ssl.CERT_REQUIRED
                elif c in ("CERT_OPTIONAL", "OPTIONAL"):
                    kwargs["ssl_cert_reqs"] = ssl.CERT_OPTIONAL
            url = u._replace(query=urlencode(qs, doseq=True)).geturl()
        _client = redis.Redis.from_url(url, **kwargs)
    return _client


def set_redis(client: redis.Redis | None) -> None:
    """Test hook (fakeredis)."""
    global _client
    _client = client

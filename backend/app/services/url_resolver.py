"""
backend/app/services/url_resolver.py – Tier-2 fallback URL ingestion using yt-dlp.

Runs yt-dlp in an isolated subprocess behind a feature flag (ENABLE_URL_RESOLVER)
to resolve and download media from links when client-side acquisition fails.

TODO: Implement subprocess execution, sandboxing, and format filtering in Phase 6.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Feature flag check (defaults to disabled)
ENABLE_URL_RESOLVER = os.getenv("MOODY_LENS_ENABLE_URL_RESOLVER", "false").lower() in ("1", "true")


class UrlResolverService:
    """Service to safely download media from URLs using yt-dlp."""

    def __init__(self, temp_dir: Optional[Path] = None):
        self.temp_dir = temp_dir or Path("/tmp/moody_lens_downloads")
        self.enabled = ENABLE_URL_RESOLVER

    def resolve_and_download(self, url: str) -> Path:
        """
        Download media from URL to temporary file using yt-dlp.

        TODO: Implement in Phase 6 with impersonation and duration caps.
        """
        logger.info("resolve_and_download requested for %s (stub)", url)

        if not self.enabled:
            raise RuntimeError("Tier-2 URL resolver is disabled by feature flag.")

        # TODO: Phase 6 – Run yt-dlp in restricted subprocess
        # TODO: Phase 6 – Enforce 360p/480p format selection
        # TODO: Phase 6 – Extract separate audio stream if present
        raise NotImplementedError("Phase 6: UrlResolverService.resolve_and_download")


url_resolver = UrlResolverService()

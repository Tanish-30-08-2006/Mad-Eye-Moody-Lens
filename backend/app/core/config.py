"""Application configuration loaded from environment / .env file."""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_log_level: str = "info"

    # ── CORS ──────────────────────────────────────────────
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _parse_origins(cls, v: str) -> str:
        return v  # kept as comma-separated string; parsed by property below

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    # ── Upload limits ─────────────────────────────────────
    max_image_size_mb: int = 20
    max_audio_size_mb: int = 100
    max_video_size_mb: int = 500
    max_video_duration_sec: int = 300
    max_video_frames: int = 60

    @property
    def max_image_bytes(self) -> int:
        return self.max_image_size_mb * 1024 * 1024

    @property
    def max_audio_bytes(self) -> int:
        return self.max_audio_size_mb * 1024 * 1024

    @property
    def max_video_bytes(self) -> int:
        return self.max_video_size_mb * 1024 * 1024

    # ── Temp directory ────────────────────────────────────
    temp_dir: str = ""

    @property
    def resolved_temp_dir(self) -> Path:
        if self.temp_dir:
            p = Path(self.temp_dir)
            p.mkdir(parents=True, exist_ok=True)
            return p
        return Path(tempfile.gettempdir())

    # ── Model flags ───────────────────────────────────────
    audio_model_enabled: bool = False
    image_model_enabled: bool = False

    ssl_antispoof_checkpoint: str = ""
    hybrid_vit_checkpoint: str = ""


settings = Settings()

"""Runtime configuration.

Every behaviour of the backend is driven by ``MML_*`` environment variables
(design doc Section 11). Values marked *frontend parity* must equal the
constants in ``frontend/src/config/models.ts``; ``scripts/check_parity.py``
fails CI when they drift apart.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="MML_", extra="ignore")

    # ------------------------------------------------------------------ runtime
    env: Literal["development", "test", "production"] = "production"
    log_level: str = "INFO"

    # ------------------------------------------------------------------- models
    # "real" loads the pretrained weights; "stub" returns fixed scores so CI and
    # integration tests never download or import PyTorch.
    detector_backend: Literal["real", "stub"] = "real"
    image_model_id: str = "Organika/sdxl-detector"
    image_model_revision: str | None = None  # pin to a HF commit hash in production
    face_model_id: str = "Xicor9/efficientnet-b0-ffpp-c23"
    face_model_url: str = (
        "https://huggingface.co/Xicor9/efficientnet-b0-ffpp-c23/resolve/main/efficientnet_b0_ffpp_c23.pth"
    )
    face_model_sha256: str | None = None  # verified at load when set
    face_model_normalize: bool = False  # ImageNet normalisation; chosen by the benchmark
    audio_model_id: str = "MelodyMachine/Deepfake-audio-detection-V2"
    audio_model_revision: str | None = None

    # No GPU is available for the demo or deployment (design doc Section 9).
    device: Literal["cpu", "cuda"] = "cpu"
    torch_threads: int = 2

    # ------------------------------------------------- verdicts (frontend parity)
    band_low: float = 0.35
    band_high: float = 0.65
    aggregation: Literal["max", "weighted"] = "max"
    # Only used when aggregation == "weighted": task -> weight.
    aggregation_weights: dict[str, float] = Field(
        default_factory=lambda: {
            "ai_generated_image": 1.0,
            "face_manipulation": 1.0,
            "synthetic_speech": 1.0,
        }
    )

    # --------------------------------------------- limits (frontend parity: MB)
    max_image_mb: int = 10
    max_audio_mb: int = 25
    max_video_mb: int = 100
    max_audio_s: float = 600.0
    max_video_s: float = 600.0
    max_image_pixels: int = 40_000_000
    max_video_height: int = 2160  # 4K

    # ------------------------------------------- pipelines (frontend parity)
    video_frames: int = 24
    video_flag_threshold: float = 0.5
    video_check_audio: bool = True
    audio_window_s: float = 4.0
    face_max: int = 4
    face_margin: float = 0.25

    # ----------------------------------------------------------- explanations
    explain_enabled: bool = True
    explain_max_frames: int = 3

    # ------------------------------------------------------------- queueing
    sync_timeout_s: float = 30.0
    max_queue_depth: int = 50
    job_ttl_h: int = 24
    result_retention_days: int = 7
    video_soft_time_limit_s: int = 240
    video_time_limit_s: int = 300
    fast_soft_time_limit_s: int = 25
    fast_time_limit_s: int = 30
    heartbeat_interval_s: float = 10.0
    heartbeat_ttl_s: int = 30
    # Comma-separated queues this worker container consumes; decides which models it loads.
    worker_queues: str = "inference.fast"
    worker_metrics_port: int | None = None  # Prometheus endpoint inside a worker container

    # ---------------------------------------------------------- rate limits
    rate_limit_enabled: bool = True
    rl_fast_per_min: int = 30
    rl_fast_per_min_key: int = 120
    rl_video_per_10min: int = 5
    rl_video_per_10min_key: int = 30
    rl_poll_per_min: int = 120
    rl_poll_per_min_key: int = 600
    api_keys: list[str] = Field(default_factory=list)
    # Secret used to HMAC client IPs for rate limiting; IPs are never stored raw.
    client_hash_secret: str = "change-me-in-production"

    # ---------------------------------------------------------- infrastructure
    database_url: str = "postgresql+psycopg://mml:mml@postgres:5432/mml"
    redis_url: str = "redis://redis:6379/0"
    broker_url: str | None = None  # defaults to redis_url

    storage_backend: Literal["local", "s3"] = "local"
    storage_root: str = "/data/uploads"  # local backend: shared Docker volume
    s3_endpoint_url: str | None = None
    s3_bucket: str = "mml"
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str = "us-east-1"

    tmp_dir: str = "/tmp/mml"
    cors_origins: list[str] = Field(default_factory=list)
    otel_endpoint: str | None = None

    # ------------------------------------------------------------- helpers
    @field_validator("band_high")
    @classmethod
    def _bands_ordered(cls, v: float, info) -> float:  # type: ignore[no-untyped-def]
        low = info.data.get("band_low", 0.0)
        if not 0.0 <= low < v <= 1.0:
            raise ValueError("require 0 <= band_low < band_high <= 1")
        return v

    @property
    def effective_broker_url(self) -> str:
        return self.broker_url or self.redis_url

    def max_mb(self, kind: str) -> int:
        return {"image": self.max_image_mb, "audio": self.max_audio_mb, "video": self.max_video_mb}[kind]

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    """Process-wide settings singleton (tests clear the cache to override)."""
    return Settings()


settings = get_settings()

"""Pydantic schemas for API request and response bodies."""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────────────────

class ModelStatus(str, Enum):
    NOT_CONFIGURED = "not_configured"
    MISSING_WEIGHTS = "missing_weights"
    MISSING_DEPENDENCIES = "missing_dependencies"
    READY = "ready"
    ERROR = "error"


class PredictionStatus(str, Enum):
    SUCCESS = "success"
    UNAVAILABLE = "unavailable"
    ERROR = "error"


class Modality(str, Enum):
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"


# ── Model registry schemas ────────────────────────────────────────────────────

class ModelInfo(BaseModel):
    model_id: str
    name: str
    modality: Modality
    framework: Optional[str] = None
    status: ModelStatus
    weight_available: bool
    runtime_available: bool
    expected_input: str
    configuration_notes: str
    integration_instructions: str


class ModelListResponse(BaseModel):
    models: List[ModelInfo]
    configured_count: int
    unavailable_count: int


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    models_configured: int
    models_unavailable: int
    detail: Optional[str] = None


# ── Image schemas ─────────────────────────────────────────────────────────────

class ImageMetadata(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    width: Optional[int] = None
    height: Optional[int] = None
    mode: Optional[str] = None


class ImagePredictionResponse(BaseModel):
    model_id: str
    status: PredictionStatus
    predicted_label: Optional[str] = None
    score: Optional[float] = None
    score_type: Optional[str] = None
    real_score: Optional[float] = None
    fake_score: Optional[float] = None
    inference_time_ms: Optional[float] = None
    visualization_url: Optional[str] = None
    metadata: Optional[ImageMetadata] = None
    error: Optional[str] = None
    unavailable_reason: Optional[str] = None


# ── Audio schemas ─────────────────────────────────────────────────────────────

class AudioMetadata(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    duration_sec: Optional[float] = None
    sample_rate: Optional[int] = None
    channels: Optional[int] = None
    bit_depth: Optional[int] = None
    codec: Optional[str] = None


class AudioPredictionResponse(BaseModel):
    model_id: str
    status: PredictionStatus
    predicted_label: Optional[str] = None
    score: Optional[float] = None
    score_type: Optional[str] = None
    inference_time_ms: Optional[float] = None
    metadata: Optional[AudioMetadata] = None
    error: Optional[str] = None
    unavailable_reason: Optional[str] = None


# ── Video schemas ─────────────────────────────────────────────────────────────

class VideoMetadata(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    duration_sec: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    total_frames: Optional[int] = None
    has_audio: bool = False
    codec: Optional[str] = None


class ExtractedFrame(BaseModel):
    frame_index: int
    timestamp_sec: float
    frame_url: Optional[str] = None  # served from /api/frames/{id}
    width: Optional[int] = None
    height: Optional[int] = None


class FramePrediction(BaseModel):
    frame_index: int
    timestamp_sec: float
    model_id: str
    status: PredictionStatus
    predicted_label: Optional[str] = None
    score: Optional[float] = None
    real_score: Optional[float] = None
    fake_score: Optional[float] = None
    inference_time_ms: Optional[float] = None
    error: Optional[str] = None
    unavailable_reason: Optional[str] = None


class VideoSummary(BaseModel):
    overall_status: PredictionStatus
    frames_analyzed: int
    fake_frame_count: Optional[int] = None
    real_frame_count: Optional[int] = None
    mean_fake_score: Optional[float] = None
    verdict: Optional[str] = None
    unavailable_reason: Optional[str] = None


class VideoPredictionResponse(BaseModel):
    model_id: str
    status: PredictionStatus
    metadata: Optional[VideoMetadata] = None
    extracted_frames: List[ExtractedFrame] = Field(default_factory=list)
    frame_predictions: List[FramePrediction] = Field(default_factory=list)
    audio_result: Optional[AudioPredictionResponse] = None
    summary: Optional[VideoSummary] = None
    error: Optional[str] = None
    unavailable_reason: Optional[str] = None


# ── Error response ────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    model_id: Optional[str] = None


# ── History ───────────────────────────────────────────────────────────────────

class AnalysisHistoryItem(BaseModel):
    id: str
    modality: Modality
    filename: str
    timestamp: str
    status: PredictionStatus
    model_id: str
    summary: Optional[str] = None


class HistoryResponse(BaseModel):
    items: List[AnalysisHistoryItem]
    total: int

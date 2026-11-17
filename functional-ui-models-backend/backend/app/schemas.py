"""API contract (design doc Section 4).

These Pydantic models ARE the contract with ``frontend/src/api/client.ts``.
Field names, verdict strings, task strings and job statuses must never change
inside ``/api/v1``; only optional fields may be added (and ``API_VERSION`` bumped).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

API_VERSION = "1.1"

Verdict = Literal["likely_real", "uncertain", "likely_fake"]
MediaType = Literal["image", "audio", "video"]
Task = Literal["ai_generated_image", "face_manipulation", "synthetic_speech"]
JobState = Literal["queued", "running", "done", "failed"]
JobStage = Literal["queued", "frames", "audio", "finalising"]

DISCLAIMER = (
    "This is a probabilistic estimate from pretrained models, not forensic proof. "
    "Results can be wrong, especially on content unlike the models' training data."
)


class Segment(BaseModel):
    start: float
    end: float
    fake_probability: float


class ModelScore(BaseModel):
    model: str
    task: Task
    fake_probability: float


class AnalysisResult(BaseModel):
    analysis_id: str
    media_type: MediaType
    verdict: Verdict
    fake_probability: float
    scores: list[ModelScore]
    segments: list[Segment] = []
    # Per-media keys: image faces_found; audio duration_s; video frames_sampled,
    # frames_with_face, max_frame_probability, fraction_flagged, audio_checked
    # (absent = the video has no audio track).
    details: dict = {}
    processing_ms: int
    disclaimer: str = DISCLAIMER
    # --- additive in 1.1 (ignored by older clients) ---
    model_versions: dict[str, str] = {}
    explanation_available: bool = False
    api_version: str = API_VERSION


class JobStatus(BaseModel):
    job_id: str
    status: JobState
    progress: float = 0.0  # video: 0-1 over sampled frames; holds at 1.0 during audio + finalising
    result: AnalysisResult | None = None
    error: str | None = None
    stage: JobStage | None = None  # additive in 1.1


class ModelInfo(BaseModel):
    key: Literal["image", "face", "audio", "video"]
    name: str
    media_type: str
    loaded: bool


class FaceHeatmap(BaseModel):
    source: Literal["image", "frame"]
    time_s: float | None = None
    face_index: int
    box: tuple[int, int, int, int] = Field(description="x0, y0, x1, y1 in original pixels (crop incl. margin)")
    fake_probability: float
    heatmap_png: str = Field(description="base64 PNG, 224x224 8-bit greyscale attention; no image pixels")


class Explanation(BaseModel):
    analysis_id: str
    model: str
    method: Literal["grad-cam"] = "grad-cam"
    target_class: Literal["fake"] = "fake"
    layer: str = "features[-1]"
    items: list[FaceHeatmap]


class ErrorBody(BaseModel):
    error: str

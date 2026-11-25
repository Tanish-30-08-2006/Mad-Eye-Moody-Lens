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


# ------------------------------------------------ duplicate image detection
class DuplicateGroup(BaseModel):
    group_id: str
    sha256: str
    files: list[str]
    count: int


class SimilarMatch(BaseModel):
    file_a: str
    file_b: str
    hamming_distance: int
    similarity_percent: float
    classification: Literal["very_similar", "potentially_similar"]


class NoStrongMatch(BaseModel):
    file_a: str
    file_b: str
    hamming_distance: int
    similarity_percent: float


class FailedFile(BaseModel):
    filename: str
    error: str


class DuplicateSummary(BaseModel):
    total_images: int
    valid_images: int
    failed_images: int
    total_comparisons: int
    exact_duplicate_groups: int
    exact_duplicate_pairs: int
    very_similar_pairs: int
    potentially_similar_pairs: int
    no_match_pairs: int


class DuplicateCompareResponse(BaseModel):
    success: bool
    total_images: int
    valid_images: int
    failed_images: int
    total_comparisons: int
    exact_duplicate_groups: list[DuplicateGroup] = []
    similar_matches: list[SimilarMatch] = []
    no_strong_matches: list[NoStrongMatch] = []
    failed_files: list[FailedFile] = []
    summary: DuplicateSummary
    disclaimer: str = (
        "Perceptual hash similarity and SHA-256 byte fingerprints are mathematical "
        "comparisons, not forensic proof of common origin or image authenticity."
    )


# ------------------------------------------------ multi-stakeholder auth & RBAC
UserRoleType = Literal["public", "journalist", "enterprise_admin", "govt_officer"]
SubscriptionTierType = Literal["community", "journalist_pro", "enterprise_suite", "sovereign_govtech"]


class UserProfile(BaseModel):
    user_id: str | None = None
    email: str
    role: UserRoleType
    org_name: str | None = None
    subscription_tier: SubscriptionTierType
    permissions: list[str] = []
    is_anonymous: bool = False


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserProfile


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: UserRoleType = "public"
    org_name: str | None = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class DemoAccountInfo(BaseModel):
    stakeholder_name: str
    role: UserRoleType
    tier: SubscriptionTierType
    email: str
    password: str
    description: str
    unlocked_features: list[str]


class OAuthProviderInfo(BaseModel):
    provider_id: str
    name: str
    auth_url: str
    enabled: bool = True


class OAuthCallbackRequest(BaseModel):
    provider: str
    code: str
    role: UserRoleType | None = None
    redirect_uri: str | None = None


class GoogleOAuthRequest(BaseModel):
    code: str
    redirect_uri: str
    role: str = "public"

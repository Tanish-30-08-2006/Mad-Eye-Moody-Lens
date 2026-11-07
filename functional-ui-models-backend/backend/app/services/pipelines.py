"""Analysis pipelines (design doc Section 5). Run inside workers only.

Each pipeline takes a local file path and a pre-allocated ``analysis_id`` and
returns a :class:`PipelineOutput`: the ``AnalysisResult`` exactly as the
frontend expects it, plus Grad-CAM heatmaps (attention values only, never
pixels) for the face crops it scored. Heatmaps are produced here, in the same
task, because the upload is deleted as soon as the task ends.
"""

from __future__ import annotations

import io
import os
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.core.metrics import ANALYSIS_SECONDS
from app.detectors.base import FaceScore
from app.detectors.registry import get_registry
from app.preprocessing.media import extract_audio
from app.schemas import DISCLAIMER, AnalysisResult, MediaType, ModelScore, Segment
from app.services.verdict import aggregate, verdict_for

log = get_logger(__name__)

StageFn = Callable[[str], None]


@dataclass
class HeatmapItem:
    """One explained face: metadata for meta.json + the greyscale PNG bytes."""

    source: str  # "image" | "frame"
    time_s: float | None
    face_index: int
    box: tuple[int, int, int, int]
    fake_probability: float
    png: bytes


@dataclass
class PipelineOutput:
    result: AnalysisResult
    heatmaps: list[HeatmapItem] = field(default_factory=list)


# --------------------------------------------------------------------- helpers
def heatmap_to_png(cam: Any) -> bytes:
    """[0, 1] float array -> 8-bit greyscale PNG (0 = no attention, 255 = most)."""
    import numpy as np  # noqa: PLC0415
    from PIL import Image  # noqa: PLC0415

    arr = (np.clip(np.asarray(cam, dtype="float32"), 0.0, 1.0) * 255.0).round().astype("uint8")
    buf = io.BytesIO()
    Image.fromarray(arr, mode="L").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _versions(*keys: str) -> dict[str, str]:
    reg = get_registry()
    return {reg[k].name: reg[k].revision for k in keys}


def _build(
    analysis_id: str,
    media_type: MediaType,
    scores: list[ModelScore],
    t0: float,
    segments: list[Any] = (),  # type: ignore[assignment]
    details: dict[str, Any] | None = None,
    versions: dict[str, str] | None = None,
    explanation_available: bool = False,
) -> AnalysisResult:
    overall = aggregate(scores)
    return AnalysisResult(
        analysis_id=analysis_id,
        media_type=media_type,
        verdict=verdict_for(overall),
        fake_probability=overall,
        scores=[s.model_copy(update={"fake_probability": round(s.fake_probability, 4)}) for s in scores],
        segments=[
            Segment(start=round(s.start, 3), end=round(s.end, 3), fake_probability=round(s.fake_probability, 4))
            for s in segments
        ],
        details=details or {},
        processing_ms=int((time.perf_counter() - t0) * 1000),
        disclaimer=DISCLAIMER,
        model_versions=versions or {},
        explanation_available=explanation_available,
    )


def _explain(faces: list[FaceScore], source: str, time_s: float | None, start_index: int = 0) -> list[HeatmapItem]:
    """Grad-CAM for the given faces; failures are logged and never fail the analysis."""
    if not faces or not settings.explain_enabled:
        return []
    try:
        cams = get_registry()["face"].explain(faces)
    except Exception:  # noqa: BLE001 – the verdict must survive an explanation failure
        log.exception("gradcam_failed")
        return []
    return [
        HeatmapItem(
            source=source,
            time_s=time_s,
            face_index=start_index + i,
            box=f.box,
            fake_probability=round(f.fake_probability, 4),
            png=heatmap_to_png(cam),
        )
        for i, (f, cam) in enumerate(zip(faces, cams, strict=True))
    ]


# ---------------------------------------------------------------------- image
def run_image(path: str, analysis_id: str) -> PipelineOutput:
    from PIL import Image  # noqa: PLC0415

    t0, reg = time.perf_counter(), get_registry()
    with Image.open(path) as raw:
        img = raw.convert("RGB")  # EXIF and other metadata are never read

    scores = [
        ModelScore(model=reg["image"].name, task="ai_generated_image", fake_probability=reg["image"].predict_pil(img))
    ]
    faces = reg["face"].detect(img)
    if faces:
        scores.append(
            ModelScore(
                model=reg["face"].name,
                task="face_manipulation",
                fake_probability=max(f.fake_probability for f in faces),
            )
        )
    ANALYSIS_SECONDS.labels("image", "detect").observe(time.perf_counter() - t0)

    t1 = time.perf_counter()
    heatmaps = _explain(faces, "image", None)
    ANALYSIS_SECONDS.labels("image", "explain").observe(time.perf_counter() - t1)

    keys = ("image", "face") if faces else ("image",)
    return PipelineOutput(
        result=_build(
            analysis_id,
            "image",
            scores,
            t0,
            details={"faces_found": len(faces)},
            versions=_versions(*keys),
            explanation_available=bool(heatmaps),
        ),
        heatmaps=heatmaps,
    )


# ---------------------------------------------------------------------- audio
def run_audio(path: str, analysis_id: str) -> PipelineOutput:
    t0, det = time.perf_counter(), get_registry()["audio"]
    r = det.predict(path)
    ANALYSIS_SECONDS.labels("audio", "detect").observe(time.perf_counter() - t0)
    scores = [ModelScore(model=r.model_name, task="synthetic_speech", fake_probability=r.fake_probability)]
    return PipelineOutput(
        result=_build(analysis_id, "audio", scores, t0, r.segments, r.extra, versions=_versions("audio"))
    )


# ---------------------------------------------------------------------- video
def run_video(
    path: str,
    analysis_id: str,
    progress: Callable[[float], None] | None = None,
    stage: StageFn | None = None,
    cancelled: Callable[[], bool] | None = None,
) -> PipelineOutput:
    """Frames (progress 0 -> 1), then audio track and Grad-CAM with progress held at 1.0."""
    t0, reg = time.perf_counter(), get_registry()
    if stage:
        stage("frames")
    va = reg["video"].analyse(path, progress=progress, cancelled=cancelled)
    ANALYSIS_SECONDS.labels("video", "frames").observe(time.perf_counter() - t0)

    scores = [
        ModelScore(model=va.result.model_name, task="face_manipulation", fake_probability=va.result.fake_probability)
    ]
    details: dict[str, Any] = dict(va.result.extra)
    keys = ["face"]

    # Audio track: absent key = no track; False = check failed (visual result still valid).
    if settings.video_check_audio:
        if stage:
            stage("audio")
        t1 = time.perf_counter()
        wav = path + ".wav"
        try:
            has_audio = settings.detector_backend == "stub" or extract_audio(path, wav)
            if has_audio:
                a = reg["audio"].predict(wav if os.path.exists(wav) else path)
                scores.append(
                    ModelScore(model=a.model_name, task="synthetic_speech", fake_probability=a.fake_probability)
                )
                details["audio_checked"] = True
                keys.append("audio")
        except Exception:  # noqa: BLE001
            log.warning("video_audio_check_failed", exc_info=True)
            details["audio_checked"] = False
        finally:
            if os.path.exists(wav):
                os.remove(wav)
        ANALYSIS_SECONDS.labels("video", "audio").observe(time.perf_counter() - t1)

    # Grad-CAM on the most suspicious frames only (CPU budget, design doc Section 5).
    if stage:
        stage("finalising")
    t2 = time.perf_counter()
    heatmaps: list[HeatmapItem] = []
    top = sorted(va.frames, key=lambda f: f.max_probability, reverse=True)[: settings.explain_max_frames]
    for frame in sorted(top, key=lambda f: f.time_s):
        heatmaps.extend(_explain(frame.faces, "frame", round(frame.time_s, 3)))
    ANALYSIS_SECONDS.labels("video", "explain").observe(time.perf_counter() - t2)

    return PipelineOutput(
        result=_build(
            analysis_id,
            "video",
            scores,
            t0,
            va.result.segments,
            details,
            versions=_versions(*keys),
            explanation_available=bool(heatmaps),
        ),
        heatmaps=heatmaps,
    )


RUNNERS: dict[str, Callable[..., PipelineOutput]] = {"image": run_image, "audio": run_audio, "video": run_video}

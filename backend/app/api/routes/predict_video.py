"""Video prediction route."""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse, FileResponse

from app.core.exceptions import (
    FileTooLargeError,
    ModelNotConfiguredError,
    UnsupportedFormatError,
)
from app.models.registry import registry
from app.models.schemas import (
    AudioPredictionResponse,
    ExtractedFrame,
    FramePrediction,
    Modality,
    PredictionStatus,
    VideoPredictionResponse,
    VideoSummary,
)
from app.services.audio import audio_service
from app.services.history import history_store
from app.services.video import video_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["predict"])

IMAGE_MODEL_ID = "hybrid_xception_vit"
AUDIO_MODEL_ID = "ssl_antispoof_audio"
VIDEO_ADAPTER_ID = "video_frame_analysis"


@router.post("/predict/video", response_model=VideoPredictionResponse)
async def predict_video(
    file: UploadFile = File(...),
    max_frames: int = Form(default=16),
    interval_sec: Optional[float] = Form(default=None),
    analyze_audio: bool = Form(default=False),
):
    data = await file.read()
    filename = file.filename or "upload"
    content_type = (file.content_type or "video/mp4").split(";")[0].strip()

    # ── Validate ──────────────────────────────────────────────────────────────
    try:
        video_service.validate_upload(file, data)
    except FileTooLargeError as exc:
        return JSONResponse(status_code=413, content={"error": str(exc)})
    except UnsupportedFormatError as exc:
        return JSONResponse(status_code=415, content={"error": str(exc)})

    suffix = "." + filename.rsplit(".", 1)[-1] if "." in filename else ".mp4"
    video_path: Optional[Path] = None
    audio_path: Optional[Path] = None
    frame_paths: List[Path] = []

    try:
        video_path = video_service.save_temp_video(data, suffix)

        # ── Metadata ──────────────────────────────────────────────────────
        metadata = video_service.extract_metadata(
            video_path, filename, content_type, len(data)
        )

        # ── Frame extraction ──────────────────────────────────────────────
        frame_result = video_service.extract_frames(
            video_path,
            max_frames=max_frames,
            interval_sec=interval_sec,
        )
        frame_paths = frame_result.frame_paths
        extracted_frames = frame_result.frames

        # ── Frame predictions ─────────────────────────────────────────────
        frame_predictions: List[FramePrediction] = []
        try:
            video_adapter = registry.require(VIDEO_ADAPTER_ID)
            for ef in extracted_frames:
                fp = frame_paths[ef.frame_index] if ef.frame_index < len(frame_paths) else None
                if fp is None or not fp.exists():
                    continue
                try:
                    t0 = time.monotonic()
                    pre = video_adapter.preprocess(fp)
                    raw = video_adapter.predict(pre)
                    post = video_adapter.postprocess(raw)
                    elapsed_ms = (time.monotonic() - t0) * 1000
                    frame_predictions.append(
                        FramePrediction(
                            frame_index=ef.frame_index,
                            timestamp_sec=ef.timestamp_sec,
                            model_id=IMAGE_MODEL_ID,
                            status=PredictionStatus.SUCCESS,
                            predicted_label=post.get("predicted_label"),
                            score=post.get("score"),
                            real_score=post.get("real_score"),
                            fake_score=post.get("fake_score"),
                            inference_time_ms=round(elapsed_ms, 2),
                        )
                    )
                except ModelNotConfiguredError as exc:
                    frame_predictions.append(
                        FramePrediction(
                            frame_index=ef.frame_index,
                            timestamp_sec=ef.timestamp_sec,
                            model_id=IMAGE_MODEL_ID,
                            status=PredictionStatus.UNAVAILABLE,
                            unavailable_reason=exc.message,
                        )
                    )
        except KeyError:
            # Video adapter not registered
            pass

        # ── Summary ───────────────────────────────────────────────────────
        summary = _build_summary(frame_predictions)

        # ── Optional audio ────────────────────────────────────────────────
        audio_result: Optional[AudioPredictionResponse] = None
        if analyze_audio and metadata.has_audio:
            audio_path = video_service.extract_audio_track(video_path)
            if audio_path:
                audio_result = await _run_audio_analysis(audio_path, filename)

        overall_status = (
            PredictionStatus.SUCCESS
            if summary and summary.overall_status == PredictionStatus.SUCCESS
            else PredictionStatus.UNAVAILABLE
        )

        response = VideoPredictionResponse(
            model_id=VIDEO_ADAPTER_ID,
            status=overall_status,
            metadata=metadata,
            extracted_frames=extracted_frames,
            frame_predictions=frame_predictions,
            audio_result=audio_result,
            summary=summary,
        )
        history_store.add(
            modality=Modality.VIDEO,
            filename=filename,
            status=overall_status,
            model_id=VIDEO_ADAPTER_ID,
            summary=f"{len(extracted_frames)} frames extracted",
        )
        return response

    except Exception as exc:
        logger.exception("Video processing error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": f"Video processing failed: {exc}"},
        )
    finally:
        video_service.cleanup(video_path, audio_path)
        video_service.cleanup_frames(frame_paths)


def _build_summary(frame_predictions: List[FramePrediction]) -> Optional[VideoSummary]:
    if not frame_predictions:
        return VideoSummary(
            overall_status=PredictionStatus.UNAVAILABLE,
            frames_analyzed=0,
            unavailable_reason="No frames analyzed – model not configured.",
        )

    success_preds = [fp for fp in frame_predictions if fp.status == PredictionStatus.SUCCESS]
    if not success_preds:
        return VideoSummary(
            overall_status=PredictionStatus.UNAVAILABLE,
            frames_analyzed=len(frame_predictions),
            unavailable_reason="Visual detector not configured – no frame predictions available.",
        )

    fake_scores = [fp.fake_score for fp in success_preds if fp.fake_score is not None]
    mean_fake = sum(fake_scores) / len(fake_scores) if fake_scores else None
    fake_count = sum(1 for fp in success_preds if fp.predicted_label == "fake")
    real_count = len(success_preds) - fake_count

    verdict = None
    if mean_fake is not None:
        verdict = "LIKELY FAKE" if mean_fake > 0.5 else "LIKELY REAL"

    return VideoSummary(
        overall_status=PredictionStatus.SUCCESS,
        frames_analyzed=len(success_preds),
        fake_frame_count=fake_count,
        real_frame_count=real_count,
        mean_fake_score=round(mean_fake, 4) if mean_fake is not None else None,
        verdict=verdict,
    )


async def _run_audio_analysis(
    audio_path: Path,
    video_filename: str,
) -> AudioPredictionResponse:
    """Run the audio adapter on the extracted audio track."""
    metadata = audio_service.extract_metadata(
        audio_path.read_bytes(), audio_path.name, "audio/wav"
    )
    try:
        adapter = registry.require(AUDIO_MODEL_ID)
        t0 = time.monotonic()
        pre = adapter.preprocess(audio_path)
        raw = adapter.predict(pre)
        post = adapter.postprocess(raw)
        elapsed_ms = (time.monotonic() - t0) * 1000
        return AudioPredictionResponse(
            model_id=AUDIO_MODEL_ID,
            status=PredictionStatus.SUCCESS,
            predicted_label=post.get("predicted_label"),
            score=post.get("score"),
            score_type=post.get("score_type"),
            inference_time_ms=round(elapsed_ms, 2),
            metadata=metadata,
        )
    except ModelNotConfiguredError as exc:
        return AudioPredictionResponse(
            model_id=AUDIO_MODEL_ID,
            status=PredictionStatus.UNAVAILABLE,
            metadata=metadata,
            unavailable_reason=exc.message,
        )
    except KeyError:
        return AudioPredictionResponse(
            model_id=AUDIO_MODEL_ID,
            status=PredictionStatus.UNAVAILABLE,
            metadata=metadata,
            unavailable_reason="Audio model adapter not registered.",
        )


# ── Frame serving ─────────────────────────────────────────────────────────────

@router.get("/frames/{frame_name}")
async def serve_frame(frame_name: str):
    """Serve a temporarily extracted video frame."""
    from app.core.config import settings

    # Security: only serve files from the temp directory, no path traversal
    frame_path = settings.resolved_temp_dir / Path(frame_name).name
    if not frame_path.exists() or not frame_path.is_file():
        return JSONResponse(status_code=404, content={"error": "Frame not found."})
    return FileResponse(str(frame_path), media_type="image/jpeg")

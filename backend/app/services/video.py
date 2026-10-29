"""
Video processing service.

Handles upload validation, metadata extraction, bounded frame sampling,
optional audio-track extraction, and temporary file cleanup.

Frame extraction is entirely independent of deepfake inference.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import (
    FileTooLargeError,
    MediaProcessingError,
    UnsupportedFormatError,
)
from app.models.schemas import ExtractedFrame, VideoMetadata

logger = logging.getLogger(__name__)

SUPPORTED_VIDEO_TYPES = {
    "video/mp4": [".mp4"],
    "video/quicktime": [".mov"],
    "video/x-msvideo": [".avi"],
    "video/x-matroska": [".mkv"],
    "video/webm": [".webm"],
    "video/mpeg": [".mpeg", ".mpg"],
    "video/3gpp": [".3gp"],
}

SUPPORTED_EXTENSIONS = {
    ext for exts in SUPPORTED_VIDEO_TYPES.values() for ext in exts
}


@dataclass
class FrameExtractionResult:
    frames: List[ExtractedFrame] = field(default_factory=list)
    frame_paths: List[Path] = field(default_factory=list)  # for cleanup
    error: Optional[str] = None


class VideoService:
    """Service for video validation, metadata, and frame extraction."""

    def validate_upload(self, file: UploadFile, data: bytes) -> None:
        if len(data) > settings.max_video_bytes:
            raise FileTooLargeError(len(data), settings.max_video_bytes)

        content_type = (file.content_type or "").lower().split(";")[0].strip()
        suffix = Path(file.filename or "").suffix.lower()

        if content_type not in SUPPORTED_VIDEO_TYPES and suffix not in SUPPORTED_EXTENSIONS:
            raise UnsupportedFormatError(
                received=content_type or suffix,
                supported=list(SUPPORTED_VIDEO_TYPES.keys()),
            )

    def save_temp_video(self, data: bytes, suffix: str = ".mp4") -> Path:
        name = f"video_{uuid.uuid4().hex}{suffix}"
        path = settings.resolved_temp_dir / name
        path.write_bytes(data)
        logger.debug("Saved temp video: %s", path)
        return path

    def extract_metadata(self, video_path: Path, filename: str, content_type: str, size_bytes: int) -> VideoMetadata:
        """Extract video metadata using moviepy (no ML deps)."""
        duration_sec: Optional[float] = None
        width: Optional[int] = None
        height: Optional[int] = None
        fps: Optional[float] = None
        total_frames: Optional[int] = None
        has_audio = False
        codec: Optional[str] = None

        try:
            from moviepy.editor import VideoFileClip
            clip = VideoFileClip(str(video_path), audio=True)
            try:
                duration_sec = clip.duration
                width = clip.w
                height = clip.h
                fps = clip.fps
                if duration_sec and fps:
                    total_frames = int(duration_sec * fps)
                has_audio = clip.audio is not None
            finally:
                clip.close()
        except Exception as exc:
            logger.warning("moviepy metadata extraction failed: %s", exc)
            # Fall back to basic metadata only
        
        return VideoMetadata(
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            duration_sec=duration_sec,
            width=width,
            height=height,
            fps=fps,
            total_frames=total_frames,
            has_audio=has_audio,
            codec=codec,
        )

    def extract_frames(
        self,
        video_path: Path,
        max_frames: Optional[int] = None,
        interval_sec: Optional[float] = None,
    ) -> FrameExtractionResult:
        """
        Sample frames from the video at the given interval or up to max_frames.

        Returns ExtractedFrame objects with timestamps. Frame images are saved
        to temporary JPEG files; the caller is responsible for cleanup.
        """
        limit = min(max_frames or settings.max_video_frames, settings.max_video_frames)
        result = FrameExtractionResult()

        try:
            from moviepy.editor import VideoFileClip
            clip = VideoFileClip(str(video_path))
            try:
                duration = clip.duration or 0.0
                video_fps = clip.fps or 25.0

                if not duration:
                    result.error = "Could not determine video duration."
                    return result

                # Determine sample timestamps
                if interval_sec and interval_sec > 0:
                    timestamps = []
                    t = 0.0
                    while t < duration and len(timestamps) < limit:
                        timestamps.append(t)
                        t += interval_sec
                else:
                    # Evenly distribute `limit` frames across duration
                    count = min(limit, max(1, int(duration * video_fps)))
                    step = duration / count
                    timestamps = [i * step for i in range(count)]

                timestamps = timestamps[:limit]

                for idx, ts in enumerate(timestamps):
                    ts = min(ts, duration - 0.01)
                    frame_arr = clip.get_frame(ts)  # numpy HxWx3

                    # Save frame as JPEG
                    frame_name = f"frame_{uuid.uuid4().hex}.jpg"
                    frame_path = settings.resolved_temp_dir / frame_name
                    self._save_frame_image(frame_arr, frame_path)

                    result.frame_paths.append(frame_path)
                    result.frames.append(
                        ExtractedFrame(
                            frame_index=idx,
                            timestamp_sec=round(ts, 3),
                            frame_url=f"/api/frames/{frame_path.name}",
                            width=frame_arr.shape[1],
                            height=frame_arr.shape[0],
                        )
                    )
            finally:
                clip.close()

        except ImportError:
            result.error = (
                "Frame extraction requires moviepy. "
                "Install it with: pip install moviepy"
            )
        except Exception as exc:
            logger.exception("Frame extraction failed: %s", exc)
            result.error = f"Frame extraction failed: {exc}"

        return result

    def _save_frame_image(self, frame_arr, path: Path) -> None:
        """Save a numpy RGB array as JPEG using Pillow."""
        from PIL import Image
        import numpy as np

        img = Image.fromarray(np.uint8(frame_arr))
        img.save(str(path), "JPEG", quality=85)

    def extract_audio_track(self, video_path: Path) -> Optional[Path]:
        """Extract audio from video to a temporary WAV file. Returns None on failure."""
        try:
            from moviepy.editor import VideoFileClip
            clip = VideoFileClip(str(video_path))
            try:
                if clip.audio is None:
                    return None
                audio_name = f"audio_{uuid.uuid4().hex}.wav"
                audio_path = settings.resolved_temp_dir / audio_name
                clip.audio.write_audiofile(str(audio_path), verbose=False, logger=None)
                return audio_path
            finally:
                clip.close()
        except Exception as exc:
            logger.warning("Audio extraction from video failed: %s", exc)
            return None

    def cleanup(self, *paths: Optional[Path]) -> None:
        for path in paths:
            if path and path.exists():
                try:
                    path.unlink()
                    logger.debug("Cleaned up: %s", path)
                except OSError as exc:
                    logger.warning("Could not delete %s: %s", path, exc)

    def cleanup_frames(self, paths: List[Path]) -> None:
        for p in paths:
            self.cleanup(p)


video_service = VideoService()

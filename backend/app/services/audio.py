"""
Audio processing service.

Handles upload validation, metadata extraction, and temporary file management.
Waveform resampling and normalisation are intentionally left to the model
adapter, since these depend on the model's expected input format.
"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import (
    FileTooLargeError,
    MediaProcessingError,
    UnsupportedFormatError,
)
from app.models.schemas import AudioMetadata

logger = logging.getLogger(__name__)

SUPPORTED_AUDIO_TYPES = {
    "audio/wav": [".wav"],
    "audio/x-wav": [".wav"],
    "audio/wave": [".wav"],
    "audio/mpeg": [".mp3"],
    "audio/mp3": [".mp3"],
    "audio/flac": [".flac"],
    "audio/x-flac": [".flac"],
    "audio/ogg": [".ogg"],
    "audio/aac": [".aac"],
    "audio/mp4": [".m4a"],
    "audio/x-m4a": [".m4a"],
}

SUPPORTED_EXTENSIONS = {
    ext for exts in SUPPORTED_AUDIO_TYPES.values() for ext in exts
}


class AudioService:
    """Service for audio upload validation, metadata inspection, and temp management."""

    def validate_upload(self, file: UploadFile, data: bytes) -> None:
        if len(data) > settings.max_audio_bytes:
            raise FileTooLargeError(len(data), settings.max_audio_bytes)

        content_type = (file.content_type or "").lower().split(";")[0].strip()
        suffix = Path(file.filename or "").suffix.lower()

        if content_type not in SUPPORTED_AUDIO_TYPES and suffix not in SUPPORTED_EXTENSIONS:
            raise UnsupportedFormatError(
                received=content_type or suffix,
                supported=list(SUPPORTED_AUDIO_TYPES.keys()),
            )

    def extract_metadata(
        self,
        data: bytes,
        filename: str,
        content_type: str,
    ) -> AudioMetadata:
        """Extract audio metadata using mutagen (lightweight, no ML deps)."""
        duration_sec: Optional[float] = None
        sample_rate: Optional[int] = None
        channels: Optional[int] = None
        bit_depth: Optional[int] = None
        codec: Optional[str] = None

        try:
            from mutagen import File as MutagenFile
            from io import BytesIO

            mf = MutagenFile(BytesIO(data))
            if mf is not None:
                info = getattr(mf, "info", None)
                if info:
                    duration_sec = getattr(info, "length", None)
                    sample_rate = getattr(info, "sample_rate", None)
                    channels = getattr(info, "channels", None)
                    bit_depth = getattr(info, "bits_per_sample", None)
                    codec = type(info).__name__
        except Exception as exc:
            # Metadata extraction is best-effort; do not fail the upload.
            logger.debug("Audio metadata extraction failed: %s", exc)

        return AudioMetadata(
            filename=filename,
            content_type=content_type,
            size_bytes=len(data),
            duration_sec=duration_sec,
            sample_rate=sample_rate,
            channels=channels,
            bit_depth=bit_depth,
            codec=codec,
        )

    def save_temp(self, data: bytes, suffix: str = ".wav") -> Path:
        """Write audio bytes to a secure temporary file."""
        name = f"audio_{uuid.uuid4().hex}{suffix}"
        path = settings.resolved_temp_dir / name
        path.write_bytes(data)
        logger.debug("Saved temp audio: %s", path)
        return path

    def cleanup(self, path: Optional[Path]) -> None:
        if path and path.exists():
            try:
                path.unlink()
                logger.debug("Cleaned up temp audio: %s", path)
            except OSError as exc:
                logger.warning("Could not delete temp audio %s: %s", path, exc)


audio_service = AudioService()

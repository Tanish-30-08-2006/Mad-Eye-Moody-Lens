"""
Image processing service.

Handles upload validation, metadata extraction, and temporary file management.
All deepfake-specific inference is delegated to the model adapter.
"""
from __future__ import annotations

import logging
import uuid
from io import BytesIO
from pathlib import Path
from typing import Optional, Tuple

from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import (
    FileTooLargeError,
    MediaProcessingError,
    UnsupportedFormatError,
)
from app.models.schemas import ImageMetadata

logger = logging.getLogger(__name__)

SUPPORTED_IMAGE_TYPES = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/bmp": [".bmp"],
    "image/tiff": [".tiff", ".tif"],
}

SUPPORTED_EXTENSIONS = {
    ext for exts in SUPPORTED_IMAGE_TYPES.values() for ext in exts
}


class ImageService:
    """Service for image upload validation, decoding, and metadata extraction."""

    def validate_upload(self, file: UploadFile, data: bytes) -> None:
        """Validate size, MIME type, and extension."""
        if len(data) > settings.max_image_bytes:
            raise FileTooLargeError(len(data), settings.max_image_bytes)

        content_type = (file.content_type or "").lower().split(";")[0].strip()
        suffix = Path(file.filename or "").suffix.lower()

        if content_type not in SUPPORTED_IMAGE_TYPES and suffix not in SUPPORTED_EXTENSIONS:
            raise UnsupportedFormatError(
                received=content_type or suffix,
                supported=list(SUPPORTED_IMAGE_TYPES.keys()),
            )

    def extract_metadata(
        self,
        data: bytes,
        filename: str,
        content_type: str,
    ) -> ImageMetadata:
        """Decode image and extract metadata. Raises MediaProcessingError on failure."""
        from PIL import Image, UnidentifiedImageError

        try:
            img = Image.open(BytesIO(data))
            img.verify()  # structural check
            img = Image.open(BytesIO(data))  # reopen after verify
            width, height = img.size
            mode = img.mode
        except UnidentifiedImageError as exc:
            raise MediaProcessingError(f"Cannot decode image: {exc}") from exc
        except Exception as exc:
            raise MediaProcessingError(f"Image processing error: {exc}") from exc

        return ImageMetadata(
            filename=filename,
            content_type=content_type,
            size_bytes=len(data),
            width=width,
            height=height,
            mode=mode,
        )

    def save_temp(self, data: bytes, suffix: str = ".jpg") -> Path:
        """Write image bytes to a secure temporary file. Caller must delete it."""
        name = f"img_{uuid.uuid4().hex}{suffix}"
        path = settings.resolved_temp_dir / name
        path.write_bytes(data)
        logger.debug("Saved temp image: %s", path)
        return path

    def cleanup(self, path: Optional[Path]) -> None:
        if path and path.exists():
            try:
                path.unlink()
                logger.debug("Cleaned up temp image: %s", path)
            except OSError as exc:
                logger.warning("Could not delete temp image %s: %s", path, exc)


image_service = ImageService()

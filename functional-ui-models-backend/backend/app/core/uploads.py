"""Safe upload handling (design doc Sections 5 and 8).

Order of checks, cheapest first:

1. Stream to a temp file in 1 MB chunks; abort with 413 the moment the
   per-type limit is passed (a 5 GB upload never fills the disk).
2. Sniff the magic bytes; the file name and browser MIME type are ignored (415).
3. Deep-check the container: Pillow ``verify()`` with a pixel cap for images,
   ``ffprobe`` for audio/video (streams present, duration and resolution caps) (422).

The validated file is then moved into storage under a random key.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass

import filetype
from fastapi import UploadFile
from PIL import Image

from app.core.config import settings
from app.core.errors import AnalysisError, FileTooLarge, UnsupportedFormat
from app.preprocessing.media import probe

CHUNK = 1024 * 1024

# Decompression-bomb guard for every Pillow decode in this process, set once at
# import (never per request: it is process-global). deep_validate() also checks
# width x height explicitly against the current setting before verify().
Image.MAX_IMAGE_PIXELS = settings.max_image_pixels

# Mirrors frontend/src/config/models.ts (accept lists) – keep them in step.
ALLOWED: dict[str, set[str]] = {
    "image": {"image/jpeg", "image/png", "image/webp"},
    "audio": {
        "audio/x-wav",
        "audio/wav",
        "audio/mpeg",
        "audio/x-flac",
        "audio/flac",
        "audio/ogg",
        "audio/mp4",
        "audio/x-m4a",
        "video/mp4",  # .m4a sniffs as MP4
    },
    "video": {"video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo"},
}


@dataclass(frozen=True)
class SavedUpload:
    path: str
    kind: str
    mime: str
    size: int


async def save_upload(file: UploadFile, kind: str) -> SavedUpload:
    """Stream, size-limit, sniff and deep-validate an upload; return its temp path."""
    max_mb = settings.max_mb(kind)
    os.makedirs(settings.tmp_dir, exist_ok=True)
    path = os.path.join(settings.tmp_dir, uuid.uuid4().hex)
    limit, size = max_mb * CHUNK, 0
    try:
        with open(path, "wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise FileTooLarge(max_mb)
                out.write(chunk)
        if size == 0:
            raise AnalysisError(f"The {kind} file is empty.", 422)

        guess = filetype.guess(path)
        mime = guess.mime if guess else ""
        if mime not in ALLOWED[kind]:
            raise UnsupportedFormat(kind)

        deep_validate(path, kind)
        return SavedUpload(path=path, kind=kind, mime=mime, size=size)
    except BaseException:
        if os.path.exists(path):
            os.remove(path)
        raise


def deep_validate(path: str, kind: str) -> None:
    """Reject files that sniff correctly but are malformed or abusive."""
    if kind == "image":
        try:
            with Image.open(path) as im:
                if im.width * im.height > settings.max_image_pixels:
                    raise AnalysisError("Image resolution is too large.", 422)
                im.verify()  # structural check without decoding all pixels
        except AnalysisError:
            raise
        except Exception as exc:  # noqa: BLE001 – Pillow raises many types
            raise AnalysisError("Could not decode the image.", 422) from exc
        return

    info = probe(path)
    if info is None:
        raise AnalysisError(f"Could not decode the {kind} file.", 422)
    if kind == "audio":
        if not info.has_audio:
            raise AnalysisError("The file has no audio stream.", 422)
        if info.duration_s is not None and info.duration_s > settings.max_audio_s:
            raise AnalysisError(f"Audio is longer than {int(settings.max_audio_s // 60)} minutes.", 422)
    elif kind == "video":
        if not info.has_video:
            raise AnalysisError("The file has no video stream.", 422)
        if info.duration_s is not None and info.duration_s > settings.max_video_s:
            raise AnalysisError(f"Video is longer than {int(settings.max_video_s // 60)} minutes.", 422)
        if info.height and info.height > settings.max_video_height:
            raise AnalysisError("Video resolution above 4K is not supported.", 422)

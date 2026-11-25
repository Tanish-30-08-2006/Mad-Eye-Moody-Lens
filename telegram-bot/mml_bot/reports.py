"""Telegram report buttons and structured exports from completed API results."""

from __future__ import annotations

import hmac
import json
import math
import re
from collections.abc import Container, Iterator
from typing import Any

from mml_bot.format import TASKS, VERDICTS

REPORT_FILENAME = "moody-lens-scan-report.json"
REPORT_PREFIX = "report:"
_ANALYSIS_ID = re.compile(r"[0-9a-f]{32}")
_SIGNATURE = re.compile(r"[0-9a-f]{24}")
_MEDIA_TYPES = frozenset({"image", "audio", "video"})
_SEGMENT_TYPES = {"audio": "speech_window", "video": "video_segment"}


def _signature(analysis_id: str, token: str, chat_id: int, user_id: int) -> str:
    scope = f"moody-lens/report/v1:{chat_id}:{user_id}:{analysis_id}".encode("ascii")
    return hmac.digest(token.encode("utf-8"), scope, "sha256")[:12].hex()


def report_button_data(analysis_id: object, *, token: str, chat_id: int, user_id: int) -> str | None:
    if not isinstance(analysis_id, str) or not _ANALYSIS_ID.fullmatch(analysis_id):
        return None
    # The prefix, ID, separator and truncated tag fit Telegram's 64-byte limit.
    return f"{REPORT_PREFIX}{analysis_id}:{_signature(analysis_id, token, chat_id, user_id)}"


def report_analysis_id(data: object, *, token: str, chat_id: int, user_id: int) -> str | None:
    if not isinstance(data, str) or len(data) != 64 or not data.startswith(REPORT_PREFIX):
        return None
    analysis_id, _, supplied = data[len(REPORT_PREFIX):].partition(":")
    if not _ANALYSIS_ID.fullmatch(analysis_id) or not _SIGNATURE.fullmatch(supplied):
        return None
    expected = _signature(analysis_id, token, chat_id, user_id)
    return analysis_id if hmac.compare_digest(supplied, expected) else None


def _known(value: object, choices: Container[str]) -> str | None:
    return value if isinstance(value, str) and value in choices else None


def _count(value: object) -> int | None:
    return value if type(value) is int and value >= 0 else None


def _number(value: object) -> float | int | None:
    if type(value) is int:
        return _count(value)
    if isinstance(value, float) and math.isfinite(value) and value >= 0:
        return value
    return None


def _probability(value: object) -> float | int | None:
    number = _number(value)
    return number if number is not None and number <= 1 else None


def _rows(value: object) -> Iterator[dict[str, Any]]:
    if isinstance(value, list):
        yield from (row for row in value if isinstance(row, dict))


def _scores(value: object) -> list[dict[str, str | float | int]]:
    scores = []
    for row in _rows(value):
        task = _known(row.get("task"), TASKS)
        probability = _probability(row.get("fake_probability"))
        if task is not None and probability is not None:
            scores.append({"task": task, "fake_probability": probability})
    return scores


def _segments(value: object) -> list[dict[str, float | int]]:
    segments = []
    for row in _rows(value):
        start, end = _number(row.get("start")), _number(row.get("end"))
        probability = _probability(row.get("fake_probability"))
        if start is not None and end is not None and end >= start and probability is not None:
            segments.append({"start_s": start, "end_s": end, "fake_probability": probability})
    return segments


def _coverage(value: object, media_type: str | None) -> dict[str, object]:
    if not isinstance(value, dict):
        return {}
    coverage: dict[str, object]
    if media_type == "image":
        coverage = {"faces_found": _count(value.get("faces_found"))}
    elif media_type == "audio":
        coverage = {"duration_s": _number(value.get("duration_s"))}
    elif media_type == "video":
        checked = value.get("audio_checked")
        coverage = {
            "frames_sampled": _count(value.get("frames_sampled")),
            "frames_with_face": _count(value.get("frames_with_face")),
            "fraction_flagged": _probability(value.get("fraction_flagged")),
            "max_frame_probability": _probability(value.get("max_frame_probability")),
            "audio_checked": checked if isinstance(checked, bool) else None,
        }
    else:
        return {}
    return {key: field for key, field in coverage.items() if field is not None}


def scan_report_json(result: dict[str, Any]) -> bytes:
    """Export typed evidence fields with a fixed vocabulary for textual values."""
    media_type = _known(result.get("media_type"), _MEDIA_TYPES)
    segment_type = _SEGMENT_TYPES.get(media_type) if media_type is not None else None
    segments = _segments(result.get("segments")) if segment_type else []
    report = {
        "schema_version": 1,
        "media_type": media_type,
        "verdict": _known(result.get("verdict"), VERDICTS),
        "fake_probability": _probability(result.get("fake_probability")),
        "processing_ms": _count(result.get("processing_ms")),
        "scores": _scores(result.get("scores")),
        "segment_type": segment_type if segments else None,
        "segments": segments,
        "coverage": _coverage(result.get("details"), media_type),
        "interpretation": "Scores are probabilistic estimates from pretrained models.",
    }
    return (json.dumps(report, indent=2, allow_nan=False) + "\n").encode("utf-8")

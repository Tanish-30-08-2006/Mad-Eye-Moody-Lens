"""
functional-ui-models-backend/backend/app/services/video_prep.py – Video preprocessing service using ffmpeg.

Extracts keyframes at fixed framerates for facial/visual deepfake detection
and isolates or muxes audio streams for speech anti-spoofing analysis.

TODO: Implement ffmpeg bindings and temp file cleanup in Phase 6.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)


class VideoPrepService:
    """Handles keyframe extraction and audio demuxing from video inputs."""

    def __init__(self, target_fps: float = 1.0, max_frames: int = 60):
        self.target_fps = target_fps
        self.max_frames = max_frames

    def extract_keyframes(self, video_path: Path) -> List[Path]:
        """
        Extract representative keyframes from video at target framerate.

        TODO: Implement in Phase 6 using ffmpeg.
        """
        logger.info("extract_keyframes requested for %s (stub)", video_path)
        # TODO: Phase 6 – Run ffmpeg -vf fps=... and save frames to temp directory
        raise NotImplementedError("Phase 6: VideoPrepService.extract_keyframes")

    def extract_audio(self, video_path: Path) -> Optional[Path]:
        """
        Extract audio track from video as 16kHz 16-bit mono WAV.

        TODO: Implement in Phase 6 using ffmpeg.
        """
        logger.info("extract_audio requested for %s (stub)", video_path)
        # TODO: Phase 6 – Run ffmpeg -vn -acodec pcm_s16le -ar 16000 -ac 1 ...
        raise NotImplementedError("Phase 6: VideoPrepService.extract_audio")

    def mux_video_and_audio(self, video_path: Path, audio_path: Path) -> Path:
        """
        Mux separate video and audio streams into single MP4 file.

        TODO: Implement in Phase 6.
        """
        logger.info("mux_video_and_audio requested for %s + %s (stub)", video_path, audio_path)
        # TODO: Phase 6 – Run ffmpeg -i video -i audio -c copy ...
        raise NotImplementedError("Phase 6: VideoPrepService.mux_video_and_audio")


video_prep_service = VideoPrepService()

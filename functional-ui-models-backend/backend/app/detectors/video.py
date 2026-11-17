"""Video face-manipulation detector (composite over the face detector).

Samples N frames evenly, crops and scores faces in each, and reports progress
after every frame. Progress covers the frames only (0 -> 1): the frontend turns
it into "Scoring frames n/24" and the audio check runs afterwards at 1.0.
Per-frame faces are returned so the pipeline can pick frames for Grad-CAM.
"""

from __future__ import annotations

from app.core.errors import AnalysisError, Cancelled, NoFaceFound
from app.detectors.base import (
    CancelFn,
    DetectionResult,
    Detector,
    FrameFaces,
    ProgressFn,
    SegmentScore,
    VideoAnalysis,
)
from app.detectors.face import EfficientNetFaceDetector


class VideoDetector(Detector):
    media_type = "video"

    def __init__(self, face: EfficientNetFaceDetector, n_frames: int = 24, threshold: float = 0.5):
        super().__init__()
        self.face = face
        self.name = face.name
        self.revision = face.revision
        self.n_frames = n_frames
        self.threshold = threshold

    def load(self) -> None:
        self.face.ensure_loaded()

    def _sample_frames(self, path: str):  # type: ignore[no-untyped-def]
        import cv2  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415
        from PIL import Image  # noqa: PLC0415

        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise AnalysisError("Could not open the video file.", 422)
        try:
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            if total <= 0:
                raise AnalysisError("Could not read the frame count; please upload an MP4 (H.264).", 422)
            idxs = np.linspace(0, total - 1, num=min(self.n_frames, total), dtype=int)
            for i in idxs:
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
                ok, bgr = cap.read()
                if ok:
                    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)  # OpenCV decodes BGR
                    yield float(i / fps), Image.fromarray(rgb), len(idxs), fps
        finally:
            cap.release()

    def analyse(
        self, path: str, progress: ProgressFn | None = None, cancelled: CancelFn | None = None
    ) -> VideoAnalysis:
        import numpy as np  # noqa: PLC0415

        self.ensure_loaded()
        frames: list[FrameFaces] = []
        segments: list[SegmentScore] = []
        sampled = 0
        for t, img, n, fps in self._sample_frames(path):
            if cancelled and cancelled():
                raise Cancelled()
            sampled += 1
            faces = self.face.detect(img)
            if faces:
                ff = FrameFaces(time_s=t, faces=faces)
                frames.append(ff)
                segments.append(SegmentScore(t, t + 1 / fps, ff.max_probability))
            if progress:
                progress(sampled / max(n, 1))
        if not segments:
            raise NoFaceFound()

        probs = np.array([s.fake_probability for s in segments])
        result = DetectionResult(
            float(probs.mean()),
            self.name,
            segments,
            extra={
                "frames_sampled": sampled,
                "frames_with_face": len(segments),
                "max_frame_probability": round(float(probs.max()), 4),
                "fraction_flagged": round(float((probs >= self.threshold).mean()), 4),
            },
        )
        return VideoAnalysis(result=result, frames=frames)

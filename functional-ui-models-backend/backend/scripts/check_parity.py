"""Fail CI when backend settings and the frontend contract drift apart (design doc Section 12).

    python -m scripts.check_parity ../frontend

Checks
  * model IDs, upload limits, video frames, audio window and verdict bands in
    frontend/src/config/models.ts equal the backend Settings defaults;
  * every field of the backend AnalysisResult / JobStatus / Explanation schemas
    appears in frontend/src/api/client.ts (the frontend types the contract).
"""

from __future__ import annotations

import pathlib
import re
import sys


def main(frontend_dir: str) -> int:
    from app.core.config import Settings
    from app.schemas import AnalysisResult, Explanation, FaceHeatmap, JobStatus

    s = Settings()
    root = pathlib.Path(frontend_dir)
    models_ts = (root / "src/config/models.ts").read_text()
    client_ts = (root / "src/api/client.ts").read_text()
    errors: list[str] = []

    def expect(pattern: str, value: object, what: str) -> None:
        m = re.search(pattern, models_ts, re.S)
        if not m:
            errors.append(f"{what}: not found in models.ts")
            return
        found = m.group(1)
        if isinstance(value, (int, float)):
            same = float(found) == float(value)  # "4" and "4.0" are the same number
        else:
            same = found == value
        if not same:
            errors.append(f"{what}: frontend {found} != backend {value}")

    expect(r'image:\s*\{\s*key: "image",\s*id: "([^"]+)"', s.image_model_id, "image model id")
    expect(r'face:\s*\{\s*key: "face",\s*id: "([^"]+)"', s.face_model_id, "face model id")
    expect(r'audio:\s*\{\s*key: "audio",\s*id: "([^"]+)"', s.audio_model_id, "audio model id")
    expect(r'image:\s*\{\s*type: "image",.*?maxMb: (\d+)', s.max_image_mb, "image max MB")
    expect(r'audio:\s*\{\s*type: "audio",.*?maxMb: (\d+)', s.max_audio_mb, "audio max MB")
    expect(r'video:\s*\{\s*type: "video",.*?maxMb: (\d+)', s.max_video_mb, "video max MB")
    expect(r"VIDEO_FRAMES = (\d+)", s.video_frames, "video frames")
    expect(r"AUDIO_WINDOW_S = ([\d.]+)", s.audio_window_s, "audio window")
    expect(r"FRAME_FLAG_THRESHOLD = ([\d.]+)", s.video_flag_threshold, "frame flag threshold")
    expect(r"VITE_BAND_LOW, ([\d.]+)\)", s.band_low, "band low")
    expect(r"VITE_BAND_HIGH, ([\d.]+)\)", s.band_high, "band high")

    for model in (AnalysisResult, JobStatus, Explanation, FaceHeatmap):
        for field in model.model_fields:
            if not re.search(rf"\b{field}\??:", client_ts):
                errors.append(f"client.ts is missing {model.__name__}.{field}")

    if errors:
        print("Contract drift between backend and frontend:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("Backend and frontend agree on models, limits, bands and schemas.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "../frontend"))

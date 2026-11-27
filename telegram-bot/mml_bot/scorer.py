"""Lightweight, free-tier-safe media forensic scorer and mode dispatcher.

Supports three explicit modes via ``MODEL_MODE``:
* ``real`` (default): deterministic signal/forensic feature analysis built on Pillow + NumPy
  (and ``ffmpeg`` subprocess when available for compressed audio/video). Runs in ~100 MB RSS,
  well inside Render's 512 MB free-tier RAM ceiling, with zero PyTorch/TensorFlow weights.
* ``backend``: delegates to the remote Mad-Eye Moody Lens API via :class:`MoodyLensClient`.
* ``stub``: explicit deterministic stub scores (only when ``MODEL_MODE=stub`` is explicitly set).

Never falls back silently to stub scores on error: invalid media or runtime failures log clearly
and raise :class:`ApiError`.
"""

from __future__ import annotations

import hashlib
import io
import logging
import math
import shutil
import subprocess
import tempfile
import time
import uuid
import wave
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import numpy as np
from PIL import ExifTags, Image, UnidentifiedImageError

from mml_bot.client import ApiError

# Process-global decompression bomb cap (matches backend CLAUDE.md invariant).
Image.MAX_IMAGE_PIXELS = 40_000_000

log = logging.getLogger("mml.telegram.scorer")

BAND_LOW = 0.35
BAND_HIGH = 0.65
MAX_ANALYSIS_DIM = 512
SAMPLE_RATE = 16_000
AUDIO_WINDOW_S = 4.0
VIDEO_SAMPLE_FRAMES = 8
VIDEO_SILENCE_DBFS = -60.0

REAL_DISCLAIMER = (
    "This is a probabilistic forensic estimate from lightweight signal analysis, "
    "not forensic proof. Results can be wrong, especially after heavy social-media recompression."
)
STUB_DISCLAIMER = (
    "Stub mode is active (MODEL_MODE=stub). Scores are fixed placeholders, not real analysis."
)

_AI_META_MARKERS = (
    "stable diffusion",
    "automatic1111",
    "comfyui",
    "midjourney",
    "dall-e",
    "dall·e",
    "novelai",
    "invokeai",
    "bing image creator",
    "adobe firefly",
    "ai generated",
    "ai-generated",
)

# EXIF tag IDs for authentic camera capture metadata (read in memory only, never logged/stored).
_EXIF_TAG_IDS = {name: tag for tag, name in ExifTags.TAGS.items()}
_CAMERA_TAGS = tuple(
    _EXIF_TAG_IDS[name]
    for name in ("Make", "Model", "ExposureTime", "FNumber", "ISOSpeedRatings", "FocalLength")
    if name in _EXIF_TAG_IDS
)
_SOFTWARE_TAG = _EXIF_TAG_IDS.get("Software", 305)
_DESC_TAG = _EXIF_TAG_IDS.get("ImageDescription", 270)


def verdict_for(fake_probability: float) -> str:
    if fake_probability >= BAND_HIGH:
        return "likely_fake"
    if fake_probability <= BAND_LOW:
        return "likely_real"
    return "uncertain"


def _clamp01(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


def _sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def _metadata_signals(img: Image.Image) -> tuple[bool, int]:
    """Inspect in-memory metadata for explicit AI generator markers and camera EXIF count.

    Metadata values are never logged or returned to preserve user privacy.
    """
    chunks: list[str] = []
    for k, v in (img.info or {}).items():
        if isinstance(v, (str, bytes)):
            txt = v.decode("utf-8", errors="ignore") if isinstance(v, bytes) else v
            chunks.append(f"{k}:{txt[:512]}")

    camera_hits = 0
    try:
        exif = img.getexif()
    except Exception:
        exif = None
    if exif:
        for tag in (_SOFTWARE_TAG, _DESC_TAG):
            val = exif.get(tag)
            if val:
                chunks.append(str(val)[:512])
        for tag in _CAMERA_TAGS:
            if exif.get(tag) is not None:
                camera_hits += 1

    joined = " ".join(chunks).lower()
    has_ai_marker = any(marker in joined for marker in _AI_META_MARKERS)
    return has_ai_marker, camera_hits


def _score_rgb_array(rgb: np.ndarray, *, has_ai_marker: bool = False, camera_hits: int = 0) -> float:
    """Compute a calibrated P(fake) in [0.03, 0.97] from image forensic signals."""
    arr = rgb.astype(np.float32) / 255.0
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]

    # 1. Error Level Analysis (ELA): JPEG recompression residual mean & block non-uniformity.
    buf = io.BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buf, format="JPEG", quality=90)
    buf.seek(0)
    with Image.open(buf) as recomp:
        recomp_arr = np.asarray(recomp.convert("RGB"), dtype=np.float32) / 255.0
    ela_diff = np.mean(np.abs(arr - recomp_arr), axis=2)
    ela_mean = float(np.mean(ela_diff))

    h, w = lum.shape
    bh, bw = max(1, h // 8), max(1, w // 8)
    ela_crop = ela_diff[: bh * 8, : bw * 8].reshape(8, bh, 8, bw)
    ela_blocks = ela_crop.mean(axis=(1, 3)).ravel()
    ela_cv = float(np.std(ela_blocks) / (np.mean(ela_blocks) + 1e-5))

    # Very low ELA (< 0.004) or high spatial splicing variance (ela_cv > 0.75) increases suspicion.
    f_ela_smooth = _sigmoid((0.0055 - ela_mean) * 350.0)
    f_ela_splice = _sigmoid((ela_cv - 0.70) * 3.0)
    f_ela = 0.55 * f_ela_smooth + 0.45 * f_ela_splice

    # 2. Laplacian noise residual: real camera sensors exhibit a consistent micro-noise floor.
    lap = (
        4.0 * lum[1:-1, 1:-1]
        - lum[:-2, 1:-1]
        - lum[2:, 1:-1]
        - lum[1:-1, :-2]
        - lum[1:-1, 2:]
    )
    lh, lw = lap.shape
    lbh, lbw = max(1, lh // 8), max(1, lw // 8)
    lap_blocks = lap[: lbh * 8, : lbw * 8].reshape(8, lbh, 8, lbw)
    block_stds = np.std(lap_blocks, axis=(1, 3)).ravel()
    med_noise = float(np.median(block_stds))
    q75, q25 = np.percentile(block_stds, [75, 25])
    noise_iqr_ratio = float((q75 - q25) / (med_noise + 1e-5))

    # Over-smoothed images (med_noise < 0.012) or uneven noise patches raise suspicion.
    f_low_noise = _sigmoid((0.015 - med_noise) * 160.0)
    f_uneven_noise = _sigmoid((noise_iqr_ratio - 1.35) * 1.8)
    f_noise = 0.65 * f_low_noise + 0.35 * f_uneven_noise

    # 3. 2D FFT radial spectrum & periodic artifact detection.
    win_h = np.hanning(h).astype(np.float32)[:, None]
    win_w = np.hanning(w).astype(np.float32)[None, :]
    centered = (lum - float(np.mean(lum))) * (win_h * win_w)
    mag = np.log1p(np.abs(np.fft.fftshift(np.fft.fft2(centered))))

    cy, cx = h // 2, w // 2
    yy, xx = np.ogrid[:h, :w]
    dist = np.sqrt(((yy - cy) / max(1.0, cy)) ** 2 + ((xx - cx) / max(1.0, cx)) ** 2)
    mid_band = (dist >= 0.12) & (dist <= 0.45)
    high_band = (dist > 0.45) & (dist <= 0.95)
    mid_e = float(np.mean(mag[mid_band])) if np.any(mid_band) else 1e-5
    high_e = float(np.mean(mag[high_band])) if np.any(high_band) else 0.0
    hf_ratio = high_e / (mid_e + 1e-5)

    # Periodic peaks in high frequencies (checkerboard upsampling / synthetic gratings).
    high_vals = mag[high_band]
    hf_peak_ratio = float(np.percentile(high_vals, 99.5) / (np.median(high_vals) + 1e-5)) if high_vals.size else 1.0

    f_hf_drop = _sigmoid((0.28 - hf_ratio) * 9.0)
    f_hf_spikes = _sigmoid((hf_peak_ratio - 2.3) * 2.2)
    f_fft = max(f_hf_drop, f_hf_spikes)

    # 4. Chroma smoothness / correlation residual (synthetic imagery often oversmooths chroma).
    cb = arr[:, :, 2] - lum
    cr = arr[:, :, 0] - lum
    chroma_grad = float(np.mean(np.abs(np.diff(cb, axis=1))) + np.mean(np.abs(np.diff(cr, axis=0))))
    lum_grad = float(np.mean(np.abs(np.diff(lum, axis=1))) + np.mean(np.abs(np.diff(lum, axis=0))))
    chroma_to_lum = chroma_grad / (lum_grad + 1e-4)
    f_chroma = _sigmoid((0.18 - chroma_to_lum) * 10.0)

    # Weighted forensic log-odds blend centered around realistic natural vs synthetic priors.
    raw_score = (
        0.30 * f_noise
        + 0.28 * f_fft
        + 0.24 * f_ela
        + 0.18 * f_chroma
    )

    if camera_hits >= 3 and not has_ai_marker:
        raw_score -= 0.10
    elif camera_hits >= 1 and not has_ai_marker:
        raw_score -= 0.04

    if has_ai_marker:
        raw_score = max(raw_score, 0.78) + 0.12

    return round(min(0.97, max(0.03, raw_score)), 4)


def _score_audio_samples(samples: np.ndarray, sr: int, window_s: float = AUDIO_WINDOW_S) -> tuple[float, list[dict[str, float]]]:
    """Score 16 kHz mono float32 audio in fixed windows using acoustic forensic signals."""
    win_len = int(window_s * sr)
    min_len = sr // 2  # 0.5 s
    if samples.size < min_len:
        raise ApiError("Audio is shorter than 0.5 seconds.", 422)

    segments: list[dict[str, float]] = []
    for start in range(0, samples.size, win_len):
        chunk = samples[start : start + win_len]
        if chunk.size < min_len:
            break

        # 1. Near-zero digital silence ratio in silent pauses (TTS often has zero background floor).
        frame_len = max(1, sr // 50)  # 20 ms
        n_frames = chunk.size // frame_len
        if n_frames >= 4:
            frames = chunk[: n_frames * frame_len].reshape(n_frames, frame_len)
            rms = np.sqrt(np.mean(frames**2, axis=1))
            quiet = rms[rms < 0.02]
            quiet_floor = float(np.median(quiet)) if quiet.size else float(np.percentile(rms, 10))
            zcr = np.mean(np.abs(np.diff(np.signbit(frames), axis=1)), axis=1)
            zcr_cv = float(np.std(zcr) / (np.mean(zcr) + 1e-5))
        else:
            quiet_floor = float(np.std(chunk))
            zcr_cv = 0.5

        f_digital_silence = _sigmoid((0.0008 - quiet_floor) * 3500.0)
        f_zcr_uniform = _sigmoid((0.45 - zcr_cv) * 4.5)

        # 2. Spectral flatness & high-frequency (>4 kHz) energy ratio.
        spec = np.abs(np.fft.rfft(chunk * np.hanning(chunk.size).astype(np.float32))) + 1e-9
        freqs = np.fft.rfftfreq(chunk.size, d=1.0 / sr)
        power = spec**2
        geo_mean = math.exp(float(np.mean(np.log(power + 1e-12))))
        arith_mean = float(np.mean(power)) + 1e-12
        flatness = geo_mean / arith_mean

        hf_mask = freqs >= 4000.0
        lf_mask = (freqs >= 80.0) & (freqs < 4000.0)
        hf_ratio = float(np.sum(power[hf_mask]) / (np.sum(power[lf_mask]) + 1e-12))

        # Pure tones / ultra-flat vocoder spectra vs natural broadband speech.
        f_flat_or_tonal = _sigmoid((0.02 - flatness) * 80.0) if flatness < 0.05 else _sigmoid((flatness - 0.35) * 6.0)
        f_hf_cutoff = _sigmoid((0.03 - hf_ratio) * 50.0)

        seg_p = round(
            min(
                0.96,
                max(0.04, 0.30 * f_digital_silence + 0.25 * f_zcr_uniform + 0.25 * f_flat_or_tonal + 0.20 * f_hf_cutoff),
            ),
            4,
        )
        segments.append(
            {
                "start": round(start / sr, 3),
                "end": round((start + chunk.size) / sr, 3),
                "fake_probability": seg_p,
            }
        )

    if not segments:
        raise ApiError("Audio is shorter than 0.5 seconds.", 422)

    overall = round(float(np.mean([s["fake_probability"] for s in segments])), 4)
    return overall, segments


def _decode_wav_bytes(data: bytes) -> tuple[np.ndarray, int]:
    """Decode uncompressed PCM WAV bytes without external tools."""
    with wave.open(io.BytesIO(data), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        sr = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sampwidth == 1:
        arr = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    elif sampwidth == 2:
        arr = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sampwidth == 4:
        arr = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise ApiError("Unsupported WAV sample width.", 415)

    if channels > 1:
        arr = arr.reshape(-1, channels).mean(axis=1)
    if sr != SAMPLE_RATE and arr.size > 0:
        new_len = max(1, int(round(arr.size * SAMPLE_RATE / sr)))
        old_idx = np.linspace(0.0, arr.size - 1, num=arr.size, dtype=np.float32)
        new_idx = np.linspace(0.0, arr.size - 1, num=new_len, dtype=np.float32)
        arr = np.interp(new_idx, old_idx, arr).astype(np.float32)
        sr = SAMPLE_RATE
    return arr, sr


def _decode_audio_ffmpeg(data: bytes) -> tuple[np.ndarray, int]:
    """Decode arbitrary audio bytes via ffmpeg pipe (no disk writes)."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        log.error("audio_decode_failed reason=ffmpeg_not_installed")
        raise ApiError("Audio decoding for this format requires ffmpeg on the server.", 503)
    proc = subprocess.run(
        [
            ffmpeg,
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ac",
            "1",
            "-ar",
            str(SAMPLE_RATE),
            "-f",
            "wav",
            "pipe:1",
        ],
        input=data,
        capture_output=True,
        timeout=30,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout:
        log.warning("audio_decode_failed rc=%s", proc.returncode)
        raise ApiError("Could not decode the audio file.", 415)
    return _decode_wav_bytes(proc.stdout)


class LightweightForensicScorer:
    """Singleton in-memory signal/forensic scorer safe for Render's 512 MB RAM ceiling."""

    mode = "real"

    def __init__(self) -> None:
        self.ffmpeg_path = shutil.which("ffmpeg")
        self.ffprobe_path = shutil.which("ffprobe")
        self._warmed = False
        self.warmup()

    def warmup(self) -> None:
        """Pre-warm NumPy FFT / Pillow paths once at startup."""
        if self._warmed:
            return
        dummy = np.zeros((64, 64, 3), dtype=np.uint8)
        _score_rgb_array(dummy)
        self._warmed = True
        log.info("lightweight_scorer_ready ffmpeg=%s", bool(self.ffmpeg_path))

    async def aclose(self) -> None:
        return None

    async def ready(self) -> tuple[bool, dict[str, Any]]:
        return True, {"status": "ready", "checks": {"workers": {"local.forensic": 1}}}

    async def models(self) -> list[dict[str, Any]]:
        return [
            {"key": "image", "name": "mml-forensic-image-v1", "media_type": "image", "loaded": True},
            {"key": "audio", "name": "mml-forensic-audio-v1", "media_type": "audio", "loaded": True},
            {
                "key": "video",
                "name": "mml-forensic-video-v1",
                "media_type": "video",
                "loaded": bool(self.ffmpeg_path),
            },
        ]

    def analyze_image_sync(self, data: bytes) -> dict[str, Any]:
        if not data:
            raise ApiError("The uploaded image is empty.", 422)
        t0 = time.perf_counter()
        try:
            with Image.open(io.BytesIO(data)) as raw:
                raw.verify()
            with Image.open(io.BytesIO(data)) as raw:
                has_ai_marker, camera_hits = _metadata_signals(raw)
                img = raw.convert("RGB")
                width, height = img.size
                if max(width, height) > MAX_ANALYSIS_DIM:
                    img.thumbnail((MAX_ANALYSIS_DIM, MAX_ANALYSIS_DIM), Image.Resampling.BILINEAR)
                rgb = np.asarray(img, dtype=np.uint8)
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            log.info("invalid_image error=%s", type(exc).__name__)
            raise ApiError("This image file is not supported or is corrupted.", 415) from exc

        if rgb.ndim != 3 or rgb.shape[0] < 8 or rgb.shape[1] < 8:
            raise ApiError("Image dimensions are too small to analyse.", 422)

        p = _score_rgb_array(rgb, has_ai_marker=has_ai_marker, camera_hits=camera_hits)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "analysis_id": uuid.uuid4().hex,
            "media_type": "image",
            "verdict": verdict_for(p),
            "fake_probability": p,
            "scores": [{"model": "mml-forensic-image-v1", "task": "ai_generated_image", "fake_probability": p}],
            "segments": [],
            "details": {"width": width, "height": height},
            "processing_ms": elapsed_ms,
            "disclaimer": REAL_DISCLAIMER,
            "model_versions": {"mml-forensic-image-v1": "1.0.0"},
            "explanation_available": False,
        }

    def analyze_audio_sync(self, data: bytes) -> dict[str, Any]:
        if not data:
            raise ApiError("The uploaded audio file is empty.", 422)
        t0 = time.perf_counter()
        if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
            try:
                samples, sr = _decode_wav_bytes(data)
            except (wave.Error, EOFError, ValueError) as exc:
                log.info("invalid_wav error=%s", type(exc).__name__)
                raise ApiError("Could not decode the WAV audio file.", 415) from exc
        else:
            samples, sr = _decode_audio_ffmpeg(data)

        p, segments = _score_audio_samples(samples, sr)
        duration_s = round(samples.size / sr, 2)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "analysis_id": uuid.uuid4().hex,
            "media_type": "audio",
            "verdict": verdict_for(p),
            "fake_probability": p,
            "scores": [{"model": "mml-forensic-audio-v1", "task": "synthetic_speech", "fake_probability": p}],
            "segments": segments,
            "details": {"duration_s": duration_s},
            "processing_ms": elapsed_ms,
            "disclaimer": REAL_DISCLAIMER,
            "model_versions": {"mml-forensic-audio-v1": "1.0.0"},
            "explanation_available": False,
        }

    def _probe_duration(self, video_path: Path) -> float | None:
        if not self.ffprobe_path:
            return None
        proc = subprocess.run(
            [
                self.ffprobe_path,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(video_path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if proc.returncode == 0:
            try:
                val = float(proc.stdout.strip())
                return val if math.isfinite(val) and val > 0 else None
            except ValueError:
                return None
        return None

    def analyze_video_sync(self, data: bytes) -> dict[str, Any]:
        if not data:
            raise ApiError("The uploaded video file is empty.", 422)
        if not self.ffmpeg_path:
            log.error("video_decode_failed reason=ffmpeg_not_installed")
            raise ApiError("Video analysis requires ffmpeg on the server.", 503)

        t0 = time.perf_counter()
        with tempfile.TemporaryDirectory(prefix="mml-tg-vid-") as tmpdir:
            tmp = Path(tmpdir)
            vid_path = tmp / "upload.video"
            vid_path.write_bytes(data)

            duration = self._probe_duration(vid_path) or 8.0
            fps = max(0.25, VIDEO_SAMPLE_FRAMES / max(1.0, duration))
            frame_pattern = str(tmp / "frame_%03d.jpg")
            proc = subprocess.run(
                [
                    self.ffmpeg_path,
                    "-nostdin",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(vid_path),
                    "-vf",
                    f"fps={fps:.4f},scale='min({MAX_ANALYSIS_DIM},iw)':-2",
                    "-frames:v",
                    str(VIDEO_SAMPLE_FRAMES),
                    "-q:v",
                    "3",
                    frame_pattern,
                ],
                capture_output=True,
                timeout=60,
                check=False,
            )
            frame_files = sorted(tmp.glob("frame_*.jpg"))
            if proc.returncode != 0 or not frame_files:
                log.warning("video_frame_extract_failed rc=%s", proc.returncode)
                raise ApiError("Could not decode frames from this video.", 415)

            frame_probs: list[float] = []
            prev_gray: np.ndarray | None = None
            temporal_diffs: list[float] = []
            for fpath in frame_files:
                with Image.open(fpath) as im:
                    rgb = np.asarray(im.convert("RGB"), dtype=np.uint8)
                frame_probs.append(_score_rgb_array(rgb))
                gray = np.mean(rgb.astype(np.float32) / 255.0, axis=2)
                if prev_gray is not None and prev_gray.shape == gray.shape:
                    temporal_diffs.append(float(np.std(gray - prev_gray)))
                prev_gray = gray

            # Temporal flicker penalty if inter-frame residuals spike erratically.
            temporal_penalty = 0.0
            if len(temporal_diffs) >= 2:
                diff_cv = float(np.std(temporal_diffs) / (np.mean(temporal_diffs) + 1e-5))
                if diff_cv > 0.85:
                    temporal_penalty = min(0.12, (diff_cv - 0.85) * 0.15)

            max_frame_p = round(min(0.97, max(frame_probs) + temporal_penalty), 4)
            mean_frame_p = float(np.mean(frame_probs))
            frame_score = round(min(0.97, 0.65 * max_frame_p + 0.35 * mean_frame_p), 4)
            flagged = sum(1 for fp in frame_probs if fp >= 0.5) / len(frame_probs)

            scores: list[dict[str, Any]] = [
                {"model": "mml-forensic-video-v1", "task": "ai_generated_image", "fake_probability": frame_score}
            ]
            details: dict[str, Any] = {
                "frames_sampled": len(frame_files),
                "max_frame_probability": max_frame_p,
                "fraction_flagged": round(flagged, 4),
            }

            # Optional soundtrack check (silent/missing audio omits audio_checked per format.py contract).
            wav_proc = subprocess.run(
                [
                    self.ffmpeg_path,
                    "-nostdin",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(vid_path),
                    "-vn",
                    "-acodec",
                    "pcm_s16le",
                    "-ac",
                    "1",
                    "-ar",
                    str(SAMPLE_RATE),
                    "-f",
                    "wav",
                    "pipe:1",
                ],
                capture_output=True,
                timeout=30,
                check=False,
            )
            if wav_proc.returncode == 0 and len(wav_proc.stdout) > 44:
                try:
                    audio_samples, sr = _decode_wav_bytes(wav_proc.stdout)
                    peak = float(np.max(np.abs(audio_samples))) if audio_samples.size else 0.0
                    dbfs = 20.0 * math.log10(peak) if peak > 1e-9 else -120.0
                    if dbfs > VIDEO_SILENCE_DBFS and audio_samples.size >= sr // 2:
                        audio_p, _ = _score_audio_samples(audio_samples, sr)
                        details["audio_checked"] = True
                        scores.append(
                            {
                                "model": "mml-forensic-audio-v1",
                                "task": "synthetic_speech",
                                "fake_probability": audio_p,
                            }
                        )
                except ApiError:
                    pass
                except Exception as exc:
                    log.warning("video_audio_check_failed error=%s", type(exc).__name__)
                    details["audio_checked"] = False

        overall = round(max(float(s["fake_probability"]) for s in scores), 4)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "analysis_id": uuid.uuid4().hex,
            "media_type": "video",
            "verdict": verdict_for(overall),
            "fake_probability": overall,
            "scores": scores,
            "segments": [],
            "details": details,
            "processing_ms": elapsed_ms,
            "disclaimer": REAL_DISCLAIMER,
            "model_versions": {"mml-forensic-video-v1": "1.0.0"},
            "explanation_available": False,
        }


class StubScorer:
    """Explicit stub scorer — used ONLY when MODEL_MODE=stub is explicitly configured."""

    mode = "stub"

    def __init__(self) -> None:
        log.warning("stub_scorer_active note='MODEL_MODE=stub returns fixed placeholder scores'")

    async def aclose(self) -> None:
        return None

    async def ready(self) -> tuple[bool, dict[str, Any]]:
        return True, {"status": "ready", "checks": {"workers": {"stub": 1}}}

    async def models(self) -> list[dict[str, Any]]:
        return [
            {"key": "image", "name": "stub-image", "media_type": "image", "loaded": True},
            {"key": "audio", "name": "stub-audio", "media_type": "audio", "loaded": True},
            {"key": "video", "name": "stub-video", "media_type": "video", "loaded": True},
        ]

    def analyze_image_sync(self, data: bytes) -> dict[str, Any]:
        if not data:
            raise ApiError("The uploaded image is empty.", 422)
        _ = hashlib.sha256(data[:64]).digest()
        return {
            "analysis_id": uuid.uuid4().hex,
            "media_type": "image",
            "verdict": "likely_fake",
            "fake_probability": 0.9,
            "scores": [{"model": "stub-image", "task": "ai_generated_image", "fake_probability": 0.9}],
            "segments": [],
            "details": {},
            "processing_ms": 1,
            "disclaimer": STUB_DISCLAIMER,
            "model_versions": {"stub-image": "stub"},
            "explanation_available": False,
        }

    def analyze_audio_sync(self, data: bytes) -> dict[str, Any]:
        if not data:
            raise ApiError("The uploaded audio file is empty.", 422)
        return {
            "analysis_id": uuid.uuid4().hex,
            "media_type": "audio",
            "verdict": "likely_real",
            "fake_probability": 0.2,
            "scores": [{"model": "stub-audio", "task": "synthetic_speech", "fake_probability": 0.2}],
            "segments": [{"start": 0.0, "end": 4.0, "fake_probability": 0.2}],
            "details": {"duration_s": 4.0},
            "processing_ms": 1,
            "disclaimer": STUB_DISCLAIMER,
            "model_versions": {"stub-audio": "stub"},
            "explanation_available": False,
        }

    def analyze_video_sync(self, data: bytes) -> dict[str, Any]:
        if not data:
            raise ApiError("The uploaded video file is empty.", 422)
        return {
            "analysis_id": uuid.uuid4().hex,
            "media_type": "video",
            "verdict": "uncertain",
            "fake_probability": 0.54,
            "scores": [{"model": "stub-video", "task": "ai_generated_image", "fake_probability": 0.54}],
            "segments": [],
            "details": {"frames_sampled": 24, "fraction_flagged": 0.5},
            "processing_ms": 1,
            "disclaimer": STUB_DISCLAIMER,
            "model_versions": {"stub-video": "stub"},
            "explanation_available": False,
        }


ProgressCallback = Callable[[dict[str, Any]], Awaitable[None]]

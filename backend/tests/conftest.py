"""Shared test fixtures and configuration."""
from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

# Import the app
import sys
sys.path.insert(0, str(Path(__file__).parents[1]))

from app.main import app


@pytest.fixture(scope="session")
def client():
    """FastAPI test client (all routes, no model checkpoints)."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def tiny_jpeg_bytes() -> bytes:
    """Minimal valid JPEG image bytes (10×10 px)."""
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(128, 64, 32)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def tiny_png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(0, 128, 255)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def corrupt_bytes() -> bytes:
    """Bytes that look like an image but are not decodable."""
    return b"\xff\xd8\xff\xe0" + b"\x00" * 50  # Truncated JPEG


@pytest.fixture
def wav_bytes() -> bytes:
    """
    Minimal valid WAV file: 44-byte PCM header with 0 data bytes.
    Sufficient for upload/validation tests; not actual audio.
    """
    import struct
    num_channels = 1
    sample_rate = 16000
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_chunk_size = 0
    riff_size = 36 + data_chunk_size

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", riff_size, b"WAVE",
        b"fmt ", 16, 1,
        num_channels, sample_rate, byte_rate, block_align, bits_per_sample,
        b"data", data_chunk_size,
    )
    return header


@pytest.fixture
def text_file_bytes() -> bytes:
    return b"This is not a valid image, audio, or video file."

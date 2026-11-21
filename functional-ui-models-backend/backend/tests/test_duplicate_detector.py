"""Automated tests for Batch Image Duplicate Detection.

Covers Test Sets A through H (Phase 13), threshold calculations,
grouping logic, validation, limits, and FastAPI endpoint tests (Phase 14).
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageEnhance

from app.main import app
from app.services.duplicate_detector import (
    DISTANCE_POTENTIALLY_SIMILAR,
    DISTANCE_VERY_SIMILAR,
    calculate_similarity_percent,
    classify_similarity,
    sanitize_filename,
)


# ------------------------------------------------------------------- fixtures
def make_image_bytes(
    fmt: str = "PNG",
    color: tuple[int, int, int] = (120, 180, 240),
    size: tuple[int, int] = (100, 100),
    pattern: str = "flat",
) -> bytes:
    """Generate deterministic dummy image bytes using Pillow."""
    im = Image.new("RGB", size, color)
    if pattern == "checker":
        # Draw a high-contrast pattern
        pixels = im.load()
        for x in range(size[0]):
            for y in range(size[1]):
                if (x // 10 + y // 10) % 2 == 0:
                    pixels[x, y] = (0, 0, 0)
                else:
                    pixels[x, y] = (255, 255, 255)
    elif pattern == "gradient":
        pixels = im.load()
        for x in range(size[0]):
            for y in range(size[1]):
                pixels[x, y] = ((x * 2) % 256, (y * 2) % 256, ((x + y) * 2) % 256)

    buf = io.BytesIO()
    im.save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture
def test_client() -> TestClient:
    return TestClient(app)


# ------------------------------------------------------- unit helper tests
def test_hamming_and_similarity_math():
    """Verify bitwise Hamming distance math and classification thresholds."""
    assert calculate_similarity_percent(0) == 100.0
    assert calculate_similarity_percent(64) == 0.0
    # 3 bits diff in 64-bit: (1 - 3/64)*100 = 95.3125% -> 95.31%
    assert calculate_similarity_percent(3) == 95.31
    assert calculate_similarity_percent(6) == 90.62

    # Threshold checks
    assert classify_similarity(0) == "very_similar"
    assert classify_similarity(DISTANCE_VERY_SIMILAR) == "very_similar"
    assert classify_similarity(DISTANCE_VERY_SIMILAR + 1) == "potentially_similar"
    assert classify_similarity(DISTANCE_POTENTIALLY_SIMILAR) == "potentially_similar"
    assert classify_similarity(DISTANCE_POTENTIALLY_SIMILAR + 1) == "no_match"
    assert classify_similarity(30) == "no_match"


def test_sanitize_filename():
    """Verify path traversal prevention and name disambiguation."""
    seen: set[str] = set()
    f1 = sanitize_filename("../../etc/passwd.png", 0, seen)
    assert f1 == "passwd.png"
    assert "passwd.png" in seen

    # Disambiguate duplicate name
    f2 = sanitize_filename("passwd.png", 1, seen)
    assert f2 == "passwd_1.png"
    assert "passwd_1.png" in seen

    # Empty name fallback
    f3 = sanitize_filename("", 2, seen)
    assert f3 == "image_3.jpg"


# ------------------------------------------------------- Phase 13 Test Sets
def test_set_a_exact_duplicates(test_client: TestClient):
    """Test set A: Byte-for-byte identical images must match SHA-256 and form an exact group."""
    raw = make_image_bytes(fmt="PNG", pattern="checker")
    files = [
        ("files", ("original.png", raw, "image/png")),
        ("files", ("exact_copy.png", raw, "image/png")),
    ]
    res = test_client.post("/api/v1/duplicate-detection/compare", files=files)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    assert body["total_images"] == 2
    assert body["valid_images"] == 2
    assert body["total_comparisons"] == 1
    assert len(body["exact_duplicate_groups"]) == 1
    assert body["summary"]["exact_duplicate_groups"] == 1
    assert body["summary"]["exact_duplicate_pairs"] == 1
    assert set(body["exact_duplicate_groups"][0]["files"]) == {"original.png", "exact_copy.png"}
    # Exact duplicate should not be redundantly present in similar_matches
    assert len(body["similar_matches"]) == 0
    assert len(body["no_strong_matches"]) == 0


def test_set_b_resized_recompressed(test_client: TestClient):
    """Test set B: Resized or recompressed copy should have different SHA-256 but similar pHash."""
    im = Image.new("RGB", (200, 200), (100, 150, 200))
    # Draw simple shapes for perceptual stability
    pixels = im.load()
    for x in range(200):
        for y in range(200):
            if (x - 100) ** 2 + (y - 100) ** 2 < 40 ** 2:
                pixels[x, y] = (255, 0, 0)

    buf_orig = io.BytesIO()
    im.save(buf_orig, format="PNG")
    orig_bytes = buf_orig.getvalue()

    # Resize to 100x100 and save as JPEG
    im_resized = im.resize((100, 100), Image.Resampling.LANCZOS)
    buf_resized = io.BytesIO()
    im_resized.save(buf_resized, format="JPEG", quality=85)
    resized_bytes = buf_resized.getvalue()

    files = [
        ("files", ("original.png", orig_bytes, "image/png")),
        ("files", ("resized_copy.jpg", resized_bytes, "image/jpeg")),
    ]
    res = test_client.post("/api/v1/duplicate-detection/compare", files=files)
    assert res.status_code == 200
    body = res.json()
    assert len(body["exact_duplicate_groups"]) == 0
    assert len(body["similar_matches"]) == 1
    match = body["similar_matches"][0]
    assert match["classification"] in ("very_similar", "potentially_similar")
    assert match["hamming_distance"] <= DISTANCE_POTENTIALLY_SIMILAR


def test_set_c_slight_brightness_modified(test_client: TestClient):
    """Test set C: Moderate brightness adjustment should retain high perceptual similarity."""
    im = Image.new("RGB", (120, 120), (100, 150, 200))
    pixels = im.load()
    for x in range(120):
        for y in range(120):
            if (x // 15 + y // 15) % 2 == 0:
                pixels[x, y] = (30, 30, 30)

    buf_orig = io.BytesIO()
    im.save(buf_orig, format="PNG")
    orig_bytes = buf_orig.getvalue()

    # Brighten by 10%
    enhancer = ImageEnhance.Brightness(im)
    im_bright = enhancer.enhance(1.1)
    buf_bright = io.BytesIO()
    im_bright.save(buf_bright, format="PNG")
    bright_bytes = buf_bright.getvalue()

    files = [
        ("files", ("original.png", orig_bytes, "image/png")),
        ("files", ("brightness_modified.png", bright_bytes, "image/png")),
    ]
    res = test_client.post("/api/v1/duplicate-detection/compare", files=files)
    assert res.status_code == 200
    body = res.json()
    assert len(body["exact_duplicate_groups"]) == 0
    assert len(body["similar_matches"]) == 1
    match = body["similar_matches"][0]
    assert match["hamming_distance"] <= DISTANCE_VERY_SIMILAR
    assert match["classification"] == "very_similar"


def test_set_d_unrelated_images(test_client: TestClient):
    """Test set D: Visually unrelated images should be classified as no strong match."""
    # Pattern 1: checkerboard
    im1 = make_image_bytes(fmt="PNG", pattern="checker", size=(100, 100))
    # Pattern 2: diagonal gradient
    im2 = make_image_bytes(fmt="PNG", pattern="gradient", size=(100, 100))

    files = [
        ("files", ("checker.png", im1, "image/png")),
        ("files", ("gradient.png", im2, "image/png")),
    ]
    res = test_client.post("/api/v1/duplicate-detection/compare", files=files)
    assert res.status_code == 200
    body = res.json()
    assert len(body["exact_duplicate_groups"]) == 0
    assert len(body["similar_matches"]) == 0
    assert len(body["no_strong_matches"]) == 1
    assert body["summary"]["no_match_pairs"] == 1


def test_set_e_invalid_and_corrupt_files(test_client: TestClient):
    """Test set E: Empty files, corrupt bytes, text files, unsupported formats."""
    valid1 = make_image_bytes(fmt="PNG", color=(50, 100, 150))
    valid2 = make_image_bytes(fmt="JPEG", color=(50, 100, 150))

    files = [
        ("files", ("valid1.png", valid1, "image/png")),
        ("files", ("valid2.jpg", valid2, "image/jpeg")),
        ("files", ("empty.png", b"", "image/png")),
        ("files", ("corrupt.jpg", b"\xff\xd8\xffcorruptedgarbage12345", "image/jpeg")),
        ("files", ("fake.jpg", b"This is just plain text content.", "image/jpeg")),
    ]
    res = test_client.post("/api/v1/duplicate-detection/compare", files=files)
    assert res.status_code == 200
    body = res.json()
    assert body["valid_images"] == 2
    assert body["failed_images"] == 3
    assert len(body["failed_files"]) == 3
    failed_names = {f["filename"] for f in body["failed_files"]}
    assert "empty.png" in failed_names
    assert "corrupt.jpg" in failed_names
    assert "fake.jpg" in failed_names


def test_set_f_mixed_extensions(test_client: TestClient):
    """Test set F: Mixed JPG, PNG, WEBP files in one batch."""
    png = make_image_bytes(fmt="PNG", color=(200, 50, 50))
    jpg = make_image_bytes(fmt="JPEG", color=(50, 200, 50))
    webp = make_image_bytes(fmt="WEBP", color=(50, 50, 200))

    files = [
        ("files", ("image1.png", png, "image/png")),
        ("files", ("image2.jpg", jpg, "image/jpeg")),
        ("files", ("image3.webp", webp, "image/webp")),
    ]
    res = test_client.post("/api/v1/duplicate-detection/compare", files=files)
    assert res.status_code == 200
    body = res.json()
    assert body["valid_images"] == 3
    assert body["total_comparisons"] == 3


def test_set_g_boundary_limits(test_client: TestClient):
    """Test set G: 0, 1, 2, 20, 21 files."""
    valid_img = make_image_bytes(fmt="PNG")

    # 0 files: 422 or 400
    res0 = test_client.post("/api/v1/duplicate-detection/compare", files=[])
    assert res0.status_code in (400, 422)

    # 1 file: 400
    res1 = test_client.post(
        "/api/v1/duplicate-detection/compare",
        files=[("files", ("single.png", valid_img, "image/png"))],
    )
    assert res1.status_code == 400

    # 2 files: 200
    res2 = test_client.post(
        "/api/v1/duplicate-detection/compare",
        files=[
            ("files", ("img1.png", valid_img, "image/png")),
            ("files", ("img2.png", valid_img, "image/png")),
        ],
    )
    assert res2.status_code == 200

    # 20 files: 200
    files_20 = [("files", (f"img_{i}.png", valid_img, "image/png")) for i in range(20)]
    res20 = test_client.post("/api/v1/duplicate-detection/compare", files=files_20)
    assert res20.status_code == 200
    assert res20.json()["valid_images"] == 20
    assert res20.json()["total_comparisons"] == 190  # 20 * 19 / 2

    # 21 files: 400 rejected
    files_21 = [("files", (f"img_{i}.png", valid_img, "image/png")) for i in range(21)]
    res21 = test_client.post("/api/v1/duplicate-detection/compare", files=files_21)
    assert res21.status_code == 400


def test_set_h_duplicate_groups_and_consistency(test_client: TestClient):
    """Test set H: 3 byte-identical + 2 visually similar + 2 unrelated images.

    Validates:
    - 7 total valid images -> 7*6/2 = 21 total comparisons.
    - Exact duplicate group of 3 -> 3*2/2 = 3 exact duplicate pairs.
    - No redundant pHash reporting of exact pairs.
    - Exact pairs + similar pairs + no-match pairs == total_comparisons.
    """
    # 3 identical images
    raw_ident = make_image_bytes(fmt="PNG", pattern="checker")

    # 2 visually similar images (structured pattern + slight resize)
    im_struct = Image.new("RGB", (120, 120), (100, 150, 200))
    p = im_struct.load()
    for x in range(120):
        for y in range(120):
            if (x // 15 + y // 15) % 2 == 0:
                p[x, y] = (30, 30, 30)
    buf_struct1 = io.BytesIO()
    im_struct.save(buf_struct1, format="PNG")
    grad1_bytes = buf_struct1.getvalue()

    im_struct2 = im_struct.resize((110, 110))
    buf_struct2 = io.BytesIO()
    im_struct2.save(buf_struct2, format="PNG")
    grad2_bytes = buf_struct2.getvalue()

    # 2 distinct solid color images
    im_blue = make_image_bytes(fmt="PNG", color=(0, 0, 255))
    im_green = make_image_bytes(fmt="PNG", color=(0, 255, 0))

    files = [
        ("files", ("ident_1.png", raw_ident, "image/png")),
        ("files", ("ident_2.png", raw_ident, "image/png")),
        ("files", ("ident_3.png", raw_ident, "image/png")),
        ("files", ("grad_1.png", grad1_bytes, "image/png")),
        ("files", ("grad_2.png", grad2_bytes, "image/png")),
        ("files", ("blue.png", im_blue, "image/png")),
        ("files", ("green.png", im_green, "image/png")),
    ]

    res = test_client.post("/api/v1/duplicate-detection/compare", files=files)
    assert res.status_code == 200
    body = res.json()
    assert body["valid_images"] == 7
    assert body["total_comparisons"] == 21

    # Exact group of 3
    assert len(body["exact_duplicate_groups"]) == 1
    assert body["exact_duplicate_groups"][0]["count"] == 3
    assert body["summary"]["exact_duplicate_pairs"] == 3

    # Similar matches should contain grad_1 vs grad_2
    grad_matches = [
        m
        for m in body["similar_matches"]
        if {"grad_1.png", "grad_2.png"} == {m["file_a"], m["file_b"]}
    ]
    assert len(grad_matches) == 1

    # Check mathematical consistency
    s = body["summary"]
    computed_sum = (
        s["exact_duplicate_pairs"]
        + s["very_similar_pairs"]
        + s["potentially_similar_pairs"]
        + s["no_match_pairs"]
    )
    assert computed_sum == body["total_comparisons"]


def test_alias_endpoint(test_client: TestClient):
    """Verify POST /api/duplicate-detection/compare alias works identically."""
    raw = make_image_bytes(fmt="PNG", pattern="flat")
    files = [
        ("files", ("a.png", raw, "image/png")),
        ("files", ("b.png", raw, "image/png")),
    ]
    res = test_client.post("/api/duplicate-detection/compare", files=files)
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["total_images"] == 2

"""Batch Image Duplicate Detection service.

Identifies exact duplicates using SHA-256 byte hashing and visually similar
images using perceptual hashing (pHash) with 64-bit Hamming distance.
Operates completely in-memory with zero persistent database or storage.
"""

from __future__ import annotations

import hashlib
import io
import os
from collections import defaultdict
from dataclasses import dataclass

import filetype
import imagehash
from fastapi import UploadFile
from PIL import Image

from app.core.config import settings
from app.core.errors import AnalysisError, FileTooLarge
from app.schemas import (
    DuplicateCompareResponse,
    DuplicateGroup,
    DuplicateSummary,
    FailedFile,
    NoStrongMatch,
    SimilarMatch,
)

# ------------------------------------------------------------- thresholds & limits
DISTANCE_VERY_SIMILAR: int = 5
DISTANCE_POTENTIALLY_SIMILAR: int = 10
HASH_BITS: int = 64

MIN_IMAGES: int = 2
MAX_IMAGES: int = 20
MAX_FILE_BYTES: int = 10 * 1024 * 1024  # 10 MB per file
MAX_TOTAL_BYTES: int = 200 * 1024 * 1024  # 200 MB total request size

ALLOWED_MIMES: set[str] = {"image/jpeg", "image/png", "image/webp"}

# Apply decompression bomb guard
Image.MAX_IMAGE_PIXELS = settings.max_image_pixels


@dataclass(frozen=True)
class ValidatedImage:
    filename: str
    sha256: str
    phash: imagehash.ImageHash


def calculate_hamming_distance(h1: imagehash.ImageHash, h2: imagehash.ImageHash) -> int:
    """Calculate the Hamming distance (number of differing bits) between two 64-bit hashes."""
    return int(h1 - h2)


def calculate_similarity_percent(distance: int) -> float:
    """Calculate the mathematical bit similarity percentage from Hamming distance.

    Note: This is a bit-level similarity metric, not a forensic probability.
    """
    pct = (1.0 - (distance / float(HASH_BITS))) * 100.0
    return round(float(pct), 2)


def classify_similarity(distance: int) -> str:
    """Classify Hamming distance into very_similar, potentially_similar, or no_match."""
    if distance <= DISTANCE_VERY_SIMILAR:
        return "very_similar"
    if distance <= DISTANCE_POTENTIALLY_SIMILAR:
        return "potentially_similar"
    return "no_match"


def sanitize_filename(filename: str | None, index: int, seen: set[str]) -> str:
    """Sanitize filename to prevent path traversal and disambiguate collisions."""
    raw = filename or f"image_{index + 1}.jpg"
    name = os.path.basename(raw.replace("\\", "/")).strip()
    if not name:
        name = f"image_{index + 1}.jpg"
    final_name = name
    counter = 1
    while final_name in seen:
        base, ext = os.path.splitext(name)
        final_name = f"{base}_{counter}{ext}"
        counter += 1
    seen.add(final_name)
    return final_name


def compare_batch(files: list[UploadFile]) -> DuplicateCompareResponse:
    """Validate, fingerprint, and compare a batch of images for exact and visual duplicates."""
    if not files or len(files) < MIN_IMAGES:
        raise AnalysisError(f"At least {MIN_IMAGES} images are required for duplicate comparison.", 400)
    if len(files) > MAX_IMAGES:
        raise AnalysisError(f"A maximum of {MAX_IMAGES} images can be compared in a single batch.", 400)

    total_bytes = 0
    seen_names: set[str] = set()
    valid_images: list[ValidatedImage] = []
    failed_files: list[FailedFile] = []

    for idx, upload in enumerate(files):
        fname = sanitize_filename(upload.filename, idx, seen_names)
        try:
            # Read content safely in memory
            content = upload.file.read()
        except Exception:
            failed_files.append(FailedFile(filename=fname, error="Failed to read uploaded file bytes."))
            continue

        file_len = len(content)
        total_bytes += file_len

        if total_bytes > MAX_TOTAL_BYTES:
            raise FileTooLarge(200)

        if file_len == 0:
            failed_files.append(FailedFile(filename=fname, error="File is empty."))
            continue

        if file_len > MAX_FILE_BYTES:
            failed_files.append(
                FailedFile(
                    filename=fname,
                    error=f"File size ({file_len / (1024 * 1024):.1f} MB) exceeds 10 MB limit.",
                )
            )
            continue

        guess = filetype.guess(content)
        mime = guess.mime if guess else ""
        if mime not in ALLOWED_MIMES:
            failed_files.append(
                FailedFile(
                    filename=fname,
                    error="Unsupported file format. Only JPG, PNG, and WEBP images are supported.",
                )
            )
            continue

        # Safe Pillow validation and perceptual hash computation
        try:
            with Image.open(io.BytesIO(content)) as img:
                if img.width * img.height > settings.max_image_pixels:
                    failed_files.append(
                        FailedFile(
                            filename=fname,
                            error=f"Image resolution ({img.width}x{img.height}) exceeds max allowed pixels.",
                        )
                    )
                    continue
                img.verify()

            # Second decode for pHash generation
            with Image.open(io.BytesIO(content)) as img:
                rgb = img.convert("RGB")
                phash_val = imagehash.phash(rgb)
        except Exception:
            failed_files.append(
                FailedFile(
                    filename=fname,
                    error="Corrupted or malformed image could not be decoded safely.",
                )
            )
            continue

        sha256_val = hashlib.sha256(content).hexdigest()
        valid_images.append(ValidatedImage(filename=fname, sha256=sha256_val, phash=phash_val))

    if len(valid_images) < MIN_IMAGES:
        fail_msg = f"{len(failed_files)} file(s) failed validation." if failed_files else ""
        raise AnalysisError(
            f"At least {MIN_IMAGES} valid images are required to perform comparison. {fail_msg}".strip(),
            400,
        )

    # 1. Group exact duplicates by SHA-256
    hash_to_files: dict[str, list[str]] = defaultdict(list)
    for v_img in valid_images:
        hash_to_files[v_img.sha256].append(v_img.filename)

    exact_groups: list[DuplicateGroup] = []
    exact_pairs_set: set[tuple[str, str]] = set()
    group_counter = 1
    exact_duplicate_pairs = 0

    for sha, fnames in hash_to_files.items():
        if len(fnames) > 1:
            exact_groups.append(
                DuplicateGroup(
                    group_id=f"group-{group_counter}",
                    sha256=sha,
                    files=fnames,
                    count=len(fnames),
                )
            )
            group_counter += 1
            pairs_in_group = len(fnames) * (len(fnames) - 1) // 2
            exact_duplicate_pairs += pairs_in_group
            for i in range(len(fnames)):
                for j in range(i + 1, len(fnames)):
                    name_a, name_b = fnames[i], fnames[j]
                    pair: tuple[str, str] = (name_a, name_b) if name_a < name_b else (name_b, name_a)
                    exact_pairs_set.add(pair)

    # 2. Pairwise comparison engine (reuses fingerprints, excludes exact matches)
    similar_matches: list[SimilarMatch] = []
    no_strong_matches: list[NoStrongMatch] = []

    n = len(valid_images)
    total_comparisons = n * (n - 1) // 2

    for i in range(n):
        for j in range(i + 1, n):
            img_a = valid_images[i]
            img_b = valid_images[j]
            pair_key: tuple[str, str] = (
                (img_a.filename, img_b.filename)
                if img_a.filename < img_b.filename
                else (img_b.filename, img_a.filename)
            )

            # If identical bytes, handled in Section 1 (not redundantly reported in pHash)
            if pair_key in exact_pairs_set:
                continue

            dist = calculate_hamming_distance(img_a.phash, img_b.phash)
            sim_pct = calculate_similarity_percent(dist)
            classification = classify_similarity(dist)

            if classification == "very_similar":
                similar_matches.append(
                    SimilarMatch(
                        file_a=img_a.filename,
                        file_b=img_b.filename,
                        hamming_distance=dist,
                        similarity_percent=sim_pct,
                        classification="very_similar",
                    )
                )
            elif classification == "potentially_similar":
                similar_matches.append(
                    SimilarMatch(
                        file_a=img_a.filename,
                        file_b=img_b.filename,
                        hamming_distance=dist,
                        similarity_percent=sim_pct,
                        classification="potentially_similar",
                    )
                )
            else:
                no_strong_matches.append(
                    NoStrongMatch(
                        file_a=img_a.filename,
                        file_b=img_b.filename,
                        hamming_distance=dist,
                        similarity_percent=sim_pct,
                    )
                )

    very_similar_pairs = sum(1 for m in similar_matches if m.classification == "very_similar")
    potentially_similar_pairs = sum(1 for m in similar_matches if m.classification == "potentially_similar")
    no_match_pairs = len(no_strong_matches)

    summary = DuplicateSummary(
        total_images=len(files),
        valid_images=len(valid_images),
        failed_images=len(failed_files),
        total_comparisons=total_comparisons,
        exact_duplicate_groups=len(exact_groups),
        exact_duplicate_pairs=exact_duplicate_pairs,
        very_similar_pairs=very_similar_pairs,
        potentially_similar_pairs=potentially_similar_pairs,
        no_match_pairs=no_match_pairs,
    )

    return DuplicateCompareResponse(
        success=True,
        total_images=len(files),
        valid_images=len(valid_images),
        failed_images=len(failed_files),
        total_comparisons=total_comparisons,
        exact_duplicate_groups=exact_groups,
        similar_matches=similar_matches,
        no_strong_matches=no_strong_matches,
        failed_files=failed_files,
        summary=summary,
    )

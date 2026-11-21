import test from "node:test";
import assert from "node:assert/strict";

// Validation rules mirrored from DuplicateDetector and backend specifications
const MAX_FILES = 20;
const MIN_FILES = 2;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const ALLOWED_MIME_PREFIXES = ["image/jpeg", "image/png", "image/webp"];

function validateFile(name, size, type = "") {
  const ext = "." + name.split(".").pop()?.toLowerCase();
  const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);
  const isAllowedMime = ALLOWED_MIME_PREFIXES.includes(type);

  if (!isAllowedExt && !isAllowedMime) {
    return "Unsupported format (only JPG, PNG, WEBP allowed)";
  }
  if (size === 0) {
    return "File is empty";
  }
  if (size > MAX_FILE_SIZE) {
    return `Exceeds 10 MB limit`;
  }
  return null;
}

function validateBatch(files) {
  if (files.length < MIN_FILES) {
    return { valid: false, error: `At least ${MIN_FILES} images required.` };
  }
  if (files.length > MAX_FILES) {
    return { valid: false, error: `Maximum ${MAX_FILES} images allowed.` };
  }
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return { valid: false, error: "Total batch size exceeds 200 MB limit." };
  }
  const validFiles = files.filter((f) => !validateFile(f.name, f.size, f.type));
  if (validFiles.length < MIN_FILES) {
    return { valid: false, error: `Fewer than ${MIN_FILES} valid images in batch.` };
  }
  return { valid: true, validCount: validFiles.length };
}

// ------------------------------------------------------------- Tests
test("File validation: accepts valid PNG, JPG, JPEG, and WEBP formats", () => {
  assert.equal(validateFile("sample.png", 1024, "image/png"), null);
  assert.equal(validateFile("sample.jpg", 1024, "image/jpeg"), null);
  assert.equal(validateFile("sample.jpeg", 1024, "image/jpeg"), null);
  assert.equal(validateFile("sample.webp", 1024, "image/webp"), null);
});

test("File validation: rejects invalid extensions and mime types", () => {
  assert.match(validateFile("document.pdf", 1024, "application/pdf"), /Unsupported format/i);
  assert.match(validateFile("animation.gif", 1024, "image/gif"), /Unsupported format/i);
  assert.match(validateFile("vector.svg", 1024, "image/svg+xml"), /Unsupported format/i);
  assert.match(validateFile("audio.mp3", 1024, "audio/mpeg"), /Unsupported format/i);
});

test("File validation: rejects empty files and oversized files", () => {
  assert.match(validateFile("empty.png", 0, "image/png"), /File is empty/i);
  assert.match(validateFile("huge.jpg", 11 * 1024 * 1024, "image/jpeg"), /Exceeds 10 MB limit/i);
  assert.equal(validateFile("borderline.jpg", 10 * 1024 * 1024, "image/jpeg"), null);
});

test("Batch validation: minimum 2 files required", () => {
  const zeroFiles = validateBatch([]);
  assert.equal(zeroFiles.valid, false);
  assert.match(zeroFiles.error, /At least 2 images/i);

  const oneFile = validateBatch([{ name: "a.png", size: 500, type: "image/png" }]);
  assert.equal(oneFile.valid, false);
  assert.match(oneFile.error, /At least 2 images/i);

  const twoFiles = validateBatch([
    { name: "a.png", size: 500, type: "image/png" },
    { name: "b.jpg", size: 600, type: "image/jpeg" },
  ]);
  assert.equal(twoFiles.valid, true);
  assert.equal(twoFiles.validCount, 2);
});

test("Batch validation: enforces maximum 20 files limit", () => {
  const files20 = Array.from({ length: 20 }, (_, i) => ({
    name: `img_${i}.png`,
    size: 500,
    type: "image/png",
  }));
  assert.equal(validateBatch(files20).valid, true);

  const files21 = Array.from({ length: 21 }, (_, i) => ({
    name: `img_${i}.png`,
    size: 500,
    type: "image/png",
  }));
  const res21 = validateBatch(files21);
  assert.equal(res21.valid, false);
  assert.match(res21.error, /Maximum 20 images/i);
});

test("Batch validation: allows mixed format combinations in single batch", () => {
  const mixed = [
    { name: "photo1.jpg", size: 12000, type: "image/jpeg" },
    { name: "photo2.png", size: 34000, type: "image/png" },
    { name: "photo3.webp", size: 21000, type: "image/webp" },
    { name: "photo4.jpeg", size: 15000, type: "image/jpeg" },
  ];
  const res = validateBatch(mixed);
  assert.equal(res.valid, true);
  assert.equal(res.validCount, 4);
});

test("Batch validation: rejects when total batch size exceeds 200 MB", () => {
  const oversizedBatch = [
    { name: "a.png", size: 105 * 1024 * 1024, type: "image/png" },
    { name: "b.png", size: 105 * 1024 * 1024, type: "image/png" },
  ];
  const res = validateBatch(oversizedBatch);
  assert.equal(res.valid, false);
  assert.match(res.error, /exceeds 200 MB limit/i);
});

test("Batch validation: continues when partial files fail if at least 2 valid remain", () => {
  const mixedWithErrors = [
    { name: "valid1.png", size: 1000, type: "image/png" },
    { name: "valid2.jpg", size: 2000, type: "image/jpeg" },
    { name: "corrupt.txt", size: 1000, type: "text/plain" },
    { name: "empty.webp", size: 0, type: "image/webp" },
  ];
  const res = validateBatch(mixedWithErrors);
  assert.equal(res.valid, true);
  assert.equal(res.validCount, 2);
});

test("Response structure & mathematical consistency verification", () => {
  // Simulating an actual API response payload
  const mockResponse = {
    success: true,
    total_images: 4,
    valid_images: 4,
    failed_images: 0,
    total_comparisons: 6,
    exact_duplicate_groups: [
      {
        group_id: "group-1",
        sha256: "abc1234567890",
        files: ["img1.png", "img4.png"],
        count: 2,
      },
    ],
    similar_matches: [
      {
        file_a: "img1.png",
        file_b: "img2.jpg",
        hamming_distance: 3,
        similarity_percent: 95.31,
        classification: "very_similar",
      },
    ],
    no_strong_matches: [
      { file_a: "img1.png", file_b: "img3.webp", hamming_distance: 25, similarity_percent: 60.94 },
      { file_a: "img2.jpg", file_b: "img3.webp", hamming_distance: 28, similarity_percent: 56.25 },
      { file_a: "img2.jpg", file_b: "img4.png", hamming_distance: 3, similarity_percent: 95.31 },
      { file_a: "img3.webp", file_b: "img4.png", hamming_distance: 25, similarity_percent: 60.94 },
    ],
    failed_files: [],
    summary: {
      total_images: 4,
      valid_images: 4,
      failed_images: 0,
      total_comparisons: 6,
      exact_duplicate_groups: 1,
      exact_duplicate_pairs: 1,
      very_similar_pairs: 1,
      potentially_similar_pairs: 0,
      no_match_pairs: 4,
    },
  };

  const s = mockResponse.summary;
  assert.equal(s.total_comparisons, (s.valid_images * (s.valid_images - 1)) / 2);
  assert.equal(
    s.exact_duplicate_pairs + s.very_similar_pairs + s.potentially_similar_pairs + s.no_match_pairs,
    s.total_comparisons
  );
  assert.equal(mockResponse.exact_duplicate_groups.length, s.exact_duplicate_groups);
  assert.equal(mockResponse.similar_matches.length, s.very_similar_pairs + s.potentially_similar_pairs);
  assert.equal(mockResponse.no_strong_matches.length, s.no_match_pairs);
});

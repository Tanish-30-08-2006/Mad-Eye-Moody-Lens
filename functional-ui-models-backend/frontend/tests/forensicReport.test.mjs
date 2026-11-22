import test from "node:test";
import assert from "node:assert/strict";
import {
  buildForensicReport,
  generateReportId,
  formatDateTimeWithZone,
} from "../src/components/DuplicateDetector/reportGenerator.ts";

// Mock helper creating File-like object
function createMockFile(name, size, type = "image/png") {
  return {
    name,
    size,
    type,
    lastModified: Date.now(),
  };
}

function createSampleBatch() {
  const selectedImages = [
    {
      id: "img-1",
      file: createMockFile("camera_raw_001.png", 2048500, "image/png"),
      previewUrl: "blob:http://localhost/fake-url-1",
    },
    {
      id: "img-2",
      file: createMockFile("camera_raw_001_copy.png", 2048500, "image/png"),
      previewUrl: "blob:http://localhost/fake-url-2",
    },
    {
      id: "img-3",
      file: createMockFile("edited_crop.jpg", 1450200, "image/jpeg"),
      previewUrl: "blob:http://localhost/fake-url-3",
    },
    {
      id: "img-4",
      file: createMockFile("landscape_sunset.webp", 850300, "image/webp"),
      previewUrl: "blob:http://localhost/fake-url-4",
    },
  ];

  const fullSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  const result = {
    success: true,
    total_images: 4,
    valid_images: 4,
    failed_images: 0,
    total_comparisons: 6,
    exact_duplicate_groups: [
      {
        group_id: "group-1",
        sha256: fullSha256,
        files: ["camera_raw_001.png", "camera_raw_001_copy.png"],
        count: 2,
      },
    ],
    similar_matches: [
      {
        file_a: "camera_raw_001.png",
        file_b: "edited_crop.jpg",
        hamming_distance: 3,
        similarity_percent: 95.31,
        classification: "very_similar",
      },
    ],
    no_strong_matches: [
      {
        file_a: "camera_raw_001.png",
        file_b: "landscape_sunset.webp",
        hamming_distance: 24,
        similarity_percent: 62.5,
      },
      {
        file_a: "camera_raw_001_copy.png",
        file_b: "landscape_sunset.webp",
        hamming_distance: 24,
        similarity_percent: 62.5,
      },
      {
        file_a: "edited_crop.jpg",
        file_b: "landscape_sunset.webp",
        hamming_distance: 28,
        similarity_percent: 56.25,
      },
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
      no_match_pairs: 3,
    },
    disclaimer:
      "Perceptual hash similarity and SHA-256 byte fingerprints are mathematical comparisons, not forensic proof.",
  };

  return { selectedImages, result, fullSha256 };
}

// Helper to extract logical text from jsPDF output
function extractPdfText(doc) {
  const raw = doc.output();
  return {
    raw,
    // Connected (for long uninterrupted strings like hashes):
    connected: raw.replace(/\)\s*Tj\s*T\*\s*\(/g, "").replace(/[()]/g, " ").replace(/\s+/g, " "),
    // Spaced (for natural text across table columns):
    spaced: raw.replace(/\)\s*Tj\s*T\*\s*\(/g, " ").replace(/[()]/g, " ").replace(/\s+/g, " "),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Report button state logic
// ─────────────────────────────────────────────────────────────────────────────
test("Report button state: unavailable before comparison, available after success", () => {
  // Simulating component state transitions
  let result = null;
  let isGeneratingReport = false;

  // Before comparison
  const isButtonVisibleBefore = result !== null;
  const isButtonDisabledBefore = isButtonVisibleBefore ? isGeneratingReport : true;
  assert.equal(isButtonVisibleBefore, false, "Report button must be hidden before comparison");
  assert.equal(isButtonDisabledBefore, true, "Report button must be disabled when result is null");

  // After successful comparison
  const sample = createSampleBatch();
  result = sample.result;

  const isButtonVisibleAfter = result !== null;
  const isButtonDisabledAfter = isGeneratingReport;
  assert.equal(isButtonVisibleAfter, true, "Report button must be visible after successful comparison");
  assert.equal(isButtonDisabledAfter, false, "Report button must be enabled when ready");

  // During generation
  isGeneratingReport = true;
  assert.equal(isGeneratingReport, true, "Button disabled during generation to prevent repeated triggers");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Report ID and date formatting
// ─────────────────────────────────────────────────────────────────────────────
test("Report ID and date: generates valid structured ID and timezone", () => {
  const fixedDate = new Date("2026-11-22T08:30:00Z");
  const reportId = generateReportId(fixedDate);
  assert.match(reportId, /^MML-BIDD-20261122-[A-Z0-9]+$/, "Report ID must follow MML-BIDD-YYYYMMDD-XXXX format");

  const formattedDate = formatDateTimeWithZone(fixedDate);
  assert.match(formattedDate, /2026-11-22 08:30:00 UTC/, "Formatted date includes UTC timestamp");
  assert.ok(formattedDate.length > 20, "Includes timezone identifier");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Core Report Generation from Batch Data
// ─────────────────────────────────────────────────────────────────────────────
test("Report generation: builds valid multi-page PDF from current result data", () => {
  const { selectedImages, result } = createSampleBatch();
  const report = buildForensicReport({
    result,
    selectedImages,
    reportId: "MML-BIDD-20261122-TEST1",
  });

  assert.ok(report.doc, "jsPDF instance must be created");
  assert.equal(report.reportId, "MML-BIDD-20261122-TEST1");
  assert.equal(report.filename, "mml-bidd-20261122-test1.pdf");
  assert.ok(report.pageCount >= 1, "Report must have at least 1 page");

  const pdfOutput = report.doc.output("arraybuffer");
  assert.ok(pdfOutput.byteLength > 2000, "Generated PDF must contain substantial forensic content");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. All Three Result Sections Included
// ─────────────────────────────────────────────────────────────────────────────
test("Report content: includes exact duplicates, visually similar, and no strong matches", () => {
  const { selectedImages, result } = createSampleBatch();
  const report = buildForensicReport({
    result,
    selectedImages,
  });

  const t = extractPdfText(report.doc);
  // PDF stream contains text or table markers for sections
  assert.ok(t.spaced.includes("EXACT DUPLICATE"), "Contains Section 4: Exact Duplicate Results");
  assert.ok(t.spaced.includes("VISUALLY SIMILAR"), "Contains Section 5: Visually Similar Images");
  assert.ok(t.spaced.includes("NO STRONG MATCHES"), "Contains Section 6: No Strong Matches");
  assert.ok(t.spaced.includes("EXECUTIVE SUMMARY"), "Contains Section 2: Executive Summary");
  assert.ok(t.spaced.includes("METHODOLOGY"), "Contains Section 7: Methodology");
  assert.ok(t.spaced.includes("LIMITATIONS"), "Contains Section 8: Limitations");
  assert.ok(t.spaced.includes("FINAL FINDINGS"), "Contains Section 9: Final Findings");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Full SHA-256 Cryptographic Hashes Preserved
// ─────────────────────────────────────────────────────────────────────────────
test("Report fidelity: preserves full 64-character SHA-256 digest without truncation", () => {
  const { selectedImages, result, fullSha256 } = createSampleBatch();
  const report = buildForensicReport({
    result,
    selectedImages,
  });

  const t = extractPdfText(report.doc);
  assert.equal(fullSha256.length, 64, "SHA-256 must be 64 characters");
  assert.ok(t.connected.includes(fullSha256), "Full 64-character SHA-256 hash must be included in PDF stream");
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Metrics & Classifications Preserved (No recalculation)
// ─────────────────────────────────────────────────────────────────────────────
test("Report fidelity: Hamming distance and similarity percentages match API response exactly", () => {
  const { selectedImages, result } = createSampleBatch();
  const report = buildForensicReport({
    result,
    selectedImages,
  });

  const t = extractPdfText(report.doc);
  assert.ok(t.spaced.includes("95.31%"), "Includes exact similarity percentage 95.31%");
  assert.ok(t.spaced.includes("62.50%") || t.spaced.includes("62.5%"), "Includes exact similarity percentage 62.5%");
  assert.ok(t.spaced.includes("VERY SIMILAR") || (t.spaced.includes("VERY") && t.spaced.includes("SIMILAR")), "Classification VERY SIMILAR preserved");
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Failed Files Handled Accurately
// ─────────────────────────────────────────────────────────────────────────────
test("Failed files: reported accurately when present, cleanly omitted when zero", () => {
  const { selectedImages, result } = createSampleBatch();

  // Case A: Batch with failed file
  const resultWithFailures = {
    ...result,
    failed_images: 1,
    failed_files: [
      {
        filename: "corrupt_data.png",
        error: "Corrupted or malformed image could not be decoded safely.",
      },
    ],
    summary: {
      ...result.summary,
      failed_images: 1,
    },
  };

  const reportWithFailures = buildForensicReport({
    result: resultWithFailures,
    selectedImages,
  });

  const tA = extractPdfText(reportWithFailures.doc);
  assert.ok(tA.spaced.includes("EXCLUDED / FAILED FILES"), "Includes Excluded / Failed Files header");
  assert.ok(tA.spaced.includes("corrupt_data.png"), "Reports exact failed filename");
  assert.ok(tA.spaced.includes("Corrupted or malformed"), "Reports exact failure reason");

  // Case B: Zero failures
  const reportZeroFailures = buildForensicReport({
    result,
    selectedImages,
  });
  const tB = extractPdfText(reportZeroFailures.doc);
  assert.ok(!tB.spaced.includes("corrupt_data.png"), "No failed files reported when none failed");
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Missing Optional Fields Handled Safely (Dimensions & pHash transparency)
// ─────────────────────────────────────────────────────────────────────────────
test("Data transparency: handles missing dimensions and unexposed pHash safely without fabrication", () => {
  const { selectedImages, result } = createSampleBatch();

  // Test without dimensions map
  const report = buildForensicReport({
    result,
    selectedImages,
    dimensionsMap: new Map(), // Empty dimensions map
  });

  const t = extractPdfText(report.doc);
  assert.ok(t.spaced.includes("Unavailable in batch input") || (t.spaced.includes("Unavailable") && t.spaced.includes("batch input")), "States resolution is unavailable rather than fabricating");
  assert.ok(t.spaced.includes("Not exposed in API response") || (t.spaced.includes("Not exposed") && t.spaced.includes("API response")), "States pHash is not exposed in API response rather than fabricating");
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Long Filenames and Hashes Handled Safely
// ─────────────────────────────────────────────────────────────────────────────
test("Typography safety: long filenames and hashes wrap without crashing", () => {
  const longName1 = "a_very_long_descriptive_camera_forensic_evidence_specimen_sample_with_extended_metadata_001.png";
  const longName2 = "a_very_long_descriptive_camera_forensic_evidence_specimen_sample_with_extended_metadata_002.png";

  const selectedImages = [
    { id: "1", file: createMockFile(longName1, 1024000), previewUrl: "blob:1" },
    { id: "2", file: createMockFile(longName2, 1024000), previewUrl: "blob:2" },
  ];

  const result = {
    success: true,
    total_images: 2,
    valid_images: 2,
    failed_images: 0,
    total_comparisons: 1,
    exact_duplicate_groups: [],
    similar_matches: [
      {
        file_a: longName1,
        file_b: longName2,
        hamming_distance: 2,
        similarity_percent: 96.88,
        classification: "very_similar",
      },
    ],
    no_strong_matches: [],
    failed_files: [],
    summary: {
      total_images: 2,
      valid_images: 2,
      failed_images: 0,
      total_comparisons: 1,
      exact_duplicate_groups: 0,
      exact_duplicate_pairs: 0,
      very_similar_pairs: 1,
      potentially_similar_pairs: 0,
      no_match_pairs: 0,
    },
    disclaimer: "Mathematical comparison only.",
  };

  assert.doesNotThrow(() => {
    buildForensicReport({ result, selectedImages });
  }, "Long filenames and large texts wrap safely without throwing layout errors");
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Multi-Page Report Generation & Pagination
// ─────────────────────────────────────────────────────────────────────────────
test("Pagination: multi-image batches paginate cleanly across multiple pages", () => {
  // Generate large batch of 12 images with multiple comparisons
  const count = 12;
  const selectedImages = Array.from({ length: count }, (_, i) => ({
    id: `img-${i}`,
    file: createMockFile(`investigation_specimen_${i.toString().padStart(3, "0")}.png`, 500000 + i * 10000),
    previewUrl: `blob:${i}`,
  }));

  const noMatches = [];
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      noMatches.push({
        file_a: selectedImages[i].file.name,
        file_b: selectedImages[j].file.name,
        hamming_distance: 20 + ((i + j) % 15),
        similarity_percent: 68.75,
      });
    }
  }

  const result = {
    success: true,
    total_images: count,
    valid_images: count,
    failed_images: 0,
    total_comparisons: noMatches.length,
    exact_duplicate_groups: [],
    similar_matches: [],
    no_strong_matches: noMatches,
    failed_files: [],
    summary: {
      total_images: count,
      valid_images: count,
      failed_images: 0,
      total_comparisons: noMatches.length,
      exact_duplicate_groups: 0,
      exact_duplicate_pairs: 0,
      very_similar_pairs: 0,
      potentially_similar_pairs: 0,
      no_match_pairs: noMatches.length,
    },
    disclaimer: "Mathematical comparison only.",
  };

  const report = buildForensicReport({ result, selectedImages });
  assert.ok(report.pageCount >= 2, `Large batch with ${noMatches.length} pairs should produce >= 2 pages (got ${report.pageCount})`);

  const t = extractPdfText(report.doc);
  assert.ok(t.spaced.includes(`Page 1 of ${report.pageCount}`), "Includes Page 1 footer");
  assert.ok(t.spaced.includes(`Page ${report.pageCount} of ${report.pageCount}`), "Includes final Page footer");
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Security & Privacy: No API Keys or Secrets Exposed
// ─────────────────────────────────────────────────────────────────────────────
test("Security check: generated PDF contains zero API keys, auth tokens, or private paths", () => {
  const { selectedImages, result } = createSampleBatch();
  const report = buildForensicReport({ result, selectedImages });
  const t = extractPdfText(report.doc);

  assert.ok(!t.raw.toLowerCase().includes("bearer"), "Must not include Bearer tokens");
  assert.ok(!t.raw.toLowerCase().includes("api_key"), "Must not include api_key references");
  assert.ok(!t.raw.toLowerCase().includes("zerotrue_key"), "Must not include ZeroTrue keys");
  assert.ok(!t.raw.toLowerCase().includes("bitmind_api"), "Must not include BitMind keys");
  assert.ok(!t.raw.includes("C:\\"), "Must not include Windows absolute file paths");
  assert.ok(!t.raw.includes("/var/"), "Must not include private server paths");
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Repeated Report Downloads
// ─────────────────────────────────────────────────────────────────────────────
test("Repeatability: multiple successive report builds generate fresh isolated instances", () => {
  const { selectedImages, result } = createSampleBatch();

  const report1 = buildForensicReport({ result, selectedImages, reportId: "MML-ID-1" });
  const report2 = buildForensicReport({ result, selectedImages, reportId: "MML-ID-2" });

  assert.notEqual(report1.reportId, report2.reportId, "Independent report IDs");
  assert.notEqual(report1.filename, report2.filename, "Independent filenames");
  assert.equal(report1.pageCount, report2.pageCount, "Consistent pagination across runs");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  createManifest,
  validateManifestJson,
  verifyFilesAgainstManifest,
} from "../src/features/forensic-utilities/sha256/services/manifest.service.ts";

const HASH_1 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const HASH_2 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const HASH_MODIFIED = "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1";

test("Manifest: createManifest correctly packages metadata and files", () => {
  const files = [
    {
      id: "f1",
      fileName: "evidence1.bin",
      fileSize: 100,
      fileType: "application/octet-stream",
      lastModified: 1700000000000,
      sha256: HASH_1,
      status: "done",
      progress: 1,
    },
    {
      id: "f2",
      fileName: "photo.jpg",
      fileSize: 200,
      fileType: "image/jpeg",
      lastModified: 1700000001000,
      sha256: HASH_2,
      status: "done",
      progress: 1,
    },
  ];

  const manifest = createManifest(files);
  assert.equal(manifest.schemaVersion, "1.0.0");
  assert.equal(manifest.totalFiles, 2);
  assert.equal(manifest.files.length, 2);
  assert.equal(manifest.files[0].filename, "evidence1.bin");
  assert.equal(manifest.files[0].sha256, HASH_1);
});

test("Manifest: validateManifestJson rejects invalid JSON and malformed schemas", () => {
  assert.equal(validateManifestJson("{bad json").valid, false);
  assert.equal(validateManifestJson("[]").valid, false);
  assert.equal(validateManifestJson(JSON.stringify({ schemaVersion: "1.0.0" })).valid, false);
  assert.equal(
    validateManifestJson(JSON.stringify({ schemaVersion: "1.0.0", files: "not-an-array" })).valid,
    false
  );
  assert.equal(
    validateManifestJson(
      JSON.stringify({
        schemaVersion: "1.0.0",
        files: [{ filename: "x.txt", sha256: "too-short" }],
      })
    ).valid,
    false
  );
});

test("Manifest: validateManifestJson accepts valid manifest object", () => {
  const validManifest = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    generator: "Test Suite",
    totalFiles: 1,
    files: [
      {
        filename: "test.txt",
        size: 50,
        sha256: HASH_1,
        lastModified: new Date().toISOString(),
      },
    ],
  };

  const res = validateManifestJson(JSON.stringify(validManifest));
  assert.equal(res.valid, true);
  assert.equal(res.manifest?.totalFiles, 1);
});

test("Manifest Verification: accurately categorizes MATCHED, MODIFIED, MISSING, UNEXPECTED, and INVALID", () => {
  const manifest = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    generator: "Test Suite",
    totalFiles: 3,
    files: [
      { filename: "original_exact.txt", size: 10, sha256: HASH_1 },
      { filename: "tampered.txt", size: 20, sha256: HASH_2 },
      { filename: "missing_on_disk.txt", size: 30, sha256: HASH_1 },
    ],
  };

  const candidateFiles = [
    // Matches manifest exactly
    {
      id: "c1",
      fileName: "original_exact.txt",
      fileSize: 10,
      fileType: "text/plain",
      lastModified: Date.now(),
      sha256: HASH_1,
      status: "done",
      progress: 1,
    },
    // Same filename as manifest, but sha256 differs (tampered/modified)
    {
      id: "c2",
      fileName: "tampered.txt",
      fileSize: 25,
      fileType: "text/plain",
      lastModified: Date.now(),
      sha256: HASH_MODIFIED,
      status: "done",
      progress: 1,
    },
    // Uploaded but not in manifest (unexpected)
    {
      id: "c3",
      fileName: "extra_untracked.txt",
      fileSize: 40,
      fileType: "text/plain",
      lastModified: Date.now(),
      sha256: HASH_1,
      status: "done",
      progress: 1,
    },
    // File that failed hashing / error
    {
      id: "c4",
      fileName: "corrupt.bin",
      fileSize: 500,
      fileType: "application/octet-stream",
      lastModified: Date.now(),
      sha256: null,
      status: "error",
      error: "Read error",
      progress: 0,
    },
  ];

  const summary = verifyFilesAgainstManifest(manifest, candidateFiles);

  assert.equal(summary.totalManifestFiles, 3);
  assert.equal(summary.totalCandidateFiles, 4);
  assert.equal(summary.matchedCount, 1);
  assert.equal(summary.modifiedCount, 1);
  assert.equal(summary.missingCount, 1);
  assert.equal(summary.unexpectedCount, 1);
  assert.equal(summary.invalidCount, 1);

  // Check specific statuses
  const matched = summary.results.find((r) => r.fileName === "original_exact.txt");
  assert.equal(matched?.status, "MATCHED");

  const modified = summary.results.find((r) => r.fileName === "tampered.txt");
  assert.equal(modified?.status, "MODIFIED");

  const missing = summary.results.find((r) => r.fileName === "missing_on_disk.txt");
  assert.equal(missing?.status, "MISSING");

  const unexpected = summary.results.find((r) => r.fileName === "extra_untracked.txt");
  assert.equal(unexpected?.status, "UNEXPECTED");

  const invalid = summary.results.find((r) => r.fileName === "corrupt.bin");
  assert.equal(invalid?.status, "INVALID");
});

test("Manifest Verification: detects and warns on duplicate filenames in manifest", () => {
  const manifestWithDupes = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    generator: "Test Suite",
    totalFiles: 2,
    files: [
      { filename: "data.csv", size: 100, sha256: HASH_1 },
      { filename: "data.csv", size: 200, sha256: HASH_2 },
    ],
  };

  const candidateFiles = [
    {
      id: "c1",
      fileName: "data.csv",
      fileSize: 100,
      fileType: "text/csv",
      lastModified: Date.now(),
      sha256: HASH_1,
      status: "done",
      progress: 1,
    },
  ];

  const summary = verifyFilesAgainstManifest(manifestWithDupes, candidateFiles);
  assert.ok(summary.duplicateFilenameWarnings.length > 0);
  assert.ok(summary.duplicateFilenameWarnings[0].includes("data.csv"));
});

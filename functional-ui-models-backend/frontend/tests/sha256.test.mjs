import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidSha256,
  normalizeHash,
  getHashValidationError,
} from "../src/features/forensic-utilities/sha256/utils/hash-validation.ts";
import {
  formatBytes,
  getFileExtension,
  exportHashesToCsv,
  exportHashesToJson,
} from "../src/features/forensic-utilities/sha256/utils/file-format.ts";
import {
  computeBufferHash,
  hashText,
} from "../src/features/forensic-utilities/sha256/services/sha256.service.ts";

const NIST_EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const NIST_ABC_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const NIST_LONG_HASH = "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1";

test("SHA-256 Service: produces NIST known hash for empty input", async () => {
  const hash = await computeBufferHash(new Uint8Array(0));
  assert.equal(hash, NIST_EMPTY_HASH);
});

test("SHA-256 Service: produces NIST known hash for 'abc'", async () => {
  const hash = await hashText("abc");
  assert.equal(hash, NIST_ABC_HASH);
});

test("SHA-256 Service: produces NIST known hash for long test string", async () => {
  const input = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
  const hash = await hashText(input);
  assert.equal(hash, NIST_LONG_HASH);
});

test("Validation: isValidSha256 recognizes valid and invalid 64-character hex strings", () => {
  assert.equal(isValidSha256(NIST_EMPTY_HASH), true);
  assert.equal(isValidSha256(NIST_EMPTY_HASH.toUpperCase()), true);
  // 63 characters
  assert.equal(isValidSha256(NIST_EMPTY_HASH.slice(1)), false);
  // 65 characters
  assert.equal(isValidSha256(NIST_EMPTY_HASH + "a"), false);
  // Non-hex character 'z'
  assert.equal(isValidSha256(NIST_EMPTY_HASH.replace("e", "z")), false);
  // Empty string
  assert.equal(isValidSha256(""), false);
  // Non-string
  assert.equal(isValidSha256(null), false);
});

test("Validation: normalizeHash trims whitespace, strips 0x prefix, and lowercases", () => {
  const withPrefix = "0x" + NIST_EMPTY_HASH.toUpperCase();
  assert.equal(normalizeHash(withPrefix), NIST_EMPTY_HASH);

  const withWhitespace = "  " + NIST_ABC_HASH + "   \n";
  assert.equal(normalizeHash(withWhitespace), NIST_ABC_HASH);
});

test("Validation: getHashValidationError provides actionable feedback", () => {
  assert.match(getHashValidationError(""), /cannot be empty/i);
  assert.match(getHashValidationError("abc"), /64 hexadecimal characters/i);
  assert.match(getHashValidationError("z".repeat(64)), /invalid characters/i);
  assert.equal(getHashValidationError(NIST_EMPTY_HASH), null);
});

test("Formatting: formatBytes formats accurately across scale tiers", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1048576), "1.00 MB");
  assert.equal(formatBytes(1073741824), "1.00 GB");
});

test("Formatting: getFileExtension extracts and normalizes extension", () => {
  assert.equal(getFileExtension("evidence.jpg"), "JPG");
  assert.equal(getFileExtension("FORENSIC.ARCHIVE.TAR.GZ"), "GZ");
  assert.equal(getFileExtension("README"), "UNKNOWN");
});

test("Export: CSV and JSON formatting produce valid structured output", () => {
  const items = [
    {
      id: "1",
      fileName: 'doc "sample".pdf',
      fileSize: 1024,
      fileType: "application/pdf",
      lastModified: 1700000000000,
      sha256: NIST_EMPTY_HASH,
      status: "done",
      progress: 1,
    },
  ];

  const csv = exportHashesToCsv(items);
  assert.ok(csv.includes("Filename,Size (Bytes)"));
  assert.ok(csv.includes('""sample""'));
  assert.ok(csv.includes(NIST_EMPTY_HASH));

  const jsonStr = exportHashesToJson(items);
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.schemaVersion, "1.0");
  assert.equal(parsed.totalFiles, 1);
  assert.equal(parsed.files[0].hash, NIST_EMPTY_HASH);
});

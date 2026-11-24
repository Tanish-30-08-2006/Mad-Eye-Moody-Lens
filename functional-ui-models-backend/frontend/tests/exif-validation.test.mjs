import test from "node:test";
import assert from "node:assert/strict";
import {
  detectFormatFromBytes,
  validateImageFile,
} from "../src/features/forensic-utilities/exif-viewer/utils/file-validation.ts";

test("File Validation: detects JPEG magic bytes", () => {
  const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x18, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  assert.equal(detectFormatFromBytes(jpegHeader), "JPEG");
});

test("File Validation: detects PNG magic bytes", () => {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  assert.equal(detectFormatFromBytes(pngHeader), "PNG");
});

test("File Validation: detects WebP magic bytes", () => {
  const webpHeader = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // 'RIFF'
    0x24, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, // 'WEBP'
  ]);
  assert.equal(detectFormatFromBytes(webpHeader), "WEBP");
});

test("File Validation: detects TIFF Little-Endian (II) and Big-Endian (MM) magic bytes", () => {
  const tiffLE = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  assert.equal(detectFormatFromBytes(tiffLE), "TIFF");

  const tiffBE = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
  assert.equal(detectFormatFromBytes(tiffBE), "TIFF");
});

test("File Validation: rejects unknown binary signatures", () => {
  const exeHeader = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // DOS MZ
  assert.equal(detectFormatFromBytes(exeHeader), "UNKNOWN");
});

test("File Validation: accepts valid JPEG, PNG, WebP, and TIFF files", () => {
  const jpegFile = { name: "photo.jpg", size: 1024 * 50, type: "image/jpeg" };
  const resJpeg = validateImageFile(jpegFile);
  assert.equal(resJpeg.valid, true);
  assert.equal(resJpeg.detectedFormat, "JPEG");

  const pngFile = { name: "diagram.png", size: 1024 * 100, type: "image/png" };
  const resPng = validateImageFile(pngFile);
  assert.equal(resPng.valid, true);
  assert.equal(resPng.detectedFormat, "PNG");

  const webpFile = { name: "banner.webp", size: 1024 * 80, type: "image/webp" };
  const resWebp = validateImageFile(webpFile);
  assert.equal(resWebp.valid, true);
  assert.equal(resWebp.detectedFormat, "WEBP");

  const tiffFile = { name: "scan.tiff", size: 1024 * 500, type: "image/tiff" };
  const resTiff = validateImageFile(tiffFile);
  assert.equal(resTiff.valid, true);
  assert.equal(resTiff.detectedFormat, "TIFF");
});

test("File Validation: rejects 0-byte empty files", () => {
  const emptyFile = { name: "empty.jpg", size: 0, type: "image/jpeg" };
  const res = validateImageFile(emptyFile);
  assert.equal(res.valid, false);
  assert.match(res.error || "", /empty/i);
});

test("File Validation: rejects oversized files exceeding 50 MB", () => {
  const largeFile = { name: "massive.jpg", size: 55 * 1024 * 1024, type: "image/jpeg" };
  const res = validateImageFile(largeFile);
  assert.equal(res.valid, false);
  assert.match(res.error || "", /exceeds the 50 MB safety limit/i);
});

test("File Validation: rejects unsupported file extensions", () => {
  const pdfFile = { name: "document.pdf", size: 1024 * 10, type: "application/pdf" };
  const resPdf = validateImageFile(pdfFile);
  assert.equal(resPdf.valid, false);
  assert.match(resPdf.error || "", /unsupported file extension/i);

  const exeFile = { name: "program.exe", size: 1024 * 10, type: "application/octet-stream" };
  const resExe = validateImageFile(exeFile);
  assert.equal(resExe.valid, false);
  assert.match(resExe.error || "", /unsupported file extension/i);
});

test("File Validation: detects renamed non-image files with mismatched headers", () => {
  // A text file renamed to .jpg containing "HELLO WORLD"
  const fakeHeader = new TextEncoder().encode("HELLO WORLD THIS IS TEXT");
  const fakeFile = { name: "fake_photo.jpg", size: 1024, type: "image/jpeg" };
  const res = validateImageFile(fakeFile, fakeHeader);
  assert.equal(res.valid, false);
  assert.match(res.error || "", /corrupted or is not a valid/i);
});

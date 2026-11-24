import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAspectRatio,
  formatAperture,
  formatBytes,
  formatExposureTime,
  formatFocalLength,
  getExposureProgramDescription,
  getFlashDescription,
  getMeteringDescription,
  getOrientationDescription,
  getWhiteBalanceDescription,
  normalizeDateMetadata,
} from "../src/features/forensic-utilities/exif-viewer/utils/metadata-normalizer.ts";
import { exportMetadataToJson } from "../src/features/forensic-utilities/exif-viewer/utils/metadata-export.ts";
import { extractMetadataFromFile } from "../src/features/forensic-utilities/exif-viewer/services/metadata-extractor.service.ts";

test("Metadata Normalizer: formatExposureTime formats fractions and whole seconds accurately", () => {
  assert.equal(formatExposureTime(0.004), "1/250 s");
  assert.equal(formatExposureTime(0.001), "1/1000 s");
  assert.equal(formatExposureTime(0.5), "1/2 s");
  assert.equal(formatExposureTime(1.5), "1.5 s");
  assert.equal(formatExposureTime(30), "30 s");
  assert.equal(formatExposureTime(undefined), null);
  assert.equal(formatExposureTime(-1), null);
});

test("Metadata Normalizer: formatAperture formats F-number", () => {
  assert.equal(formatAperture(1.4), "f/1.4");
  assert.equal(formatAperture(2.8), "f/2.8");
  assert.equal(formatAperture(8.0), "f/8");
  assert.equal(formatAperture(undefined), null);
});

test("Metadata Normalizer: formatFocalLength formats millimeters", () => {
  assert.equal(formatFocalLength(50), "50 mm");
  assert.equal(formatFocalLength(24.5), "24.5 mm");
  assert.equal(formatFocalLength(undefined), null);
});

test("Metadata Normalizer: calculateAspectRatio detects standard and portrait ratios", () => {
  assert.equal(calculateAspectRatio(1920, 1080), "16:9");
  assert.equal(calculateAspectRatio(1080, 1920), "9:16 (Portrait)");
  assert.equal(calculateAspectRatio(4000, 3000), "4:3");
  assert.equal(calculateAspectRatio(3000, 4000), "3:4 (Portrait)");
  assert.equal(calculateAspectRatio(3000, 2000), "3:2");
  assert.equal(calculateAspectRatio(1000, 1000), "1:1");
});

test("Metadata Normalizer: tag descriptions return correct human-friendly names", () => {
  assert.equal(getOrientationDescription(1), "Horizontal (normal)");
  assert.equal(getOrientationDescription(6), "Rotated 90° CW");
  assert.equal(getMeteringDescription(5), "Multi-segment (Pattern)");
  assert.equal(getMeteringDescription(3), "Spot");
  assert.equal(getExposureProgramDescription(3), "Aperture priority");
  assert.equal(getExposureProgramDescription(1), "Manual");
  assert.equal(getWhiteBalanceDescription(0), "Auto");
  assert.equal(getFlashDescription(1), "Flash fired");
  assert.equal(getFlashDescription(0), "Flash did not fire");
});

test("Metadata Normalizer: normalizeDateMetadata preserves raw dates and detects timezone offset", () => {
  // Case A: With timezone offset
  const withOffset = normalizeDateMetadata({
    DateTimeOriginal: "2026:10:15 14:30:00",
    OffsetTimeOriginal: "+05:30",
  });
  assert.equal(withOffset.dateTimeOriginal, "2026:10:15 14:30:00");
  assert.equal(withOffset.hasTimezoneInfo, true);
  assert.match(withOffset.timezoneNotice, /\+05:30/);

  // Case B: Without timezone offset
  const withoutOffset = normalizeDateMetadata({
    DateTimeOriginal: "2026:10:15 14:30:00",
  });
  assert.equal(withoutOffset.hasTimezoneInfo, false);
  assert.match(withoutOffset.timezoneNotice, /No timezone offset recorded/i);
});

test("Metadata Export: exportMetadataToJson serializes complete structured report", () => {
  const sampleMeta = {
    basic: {
      filename: "sample.jpg",
      fileSize: 204800,
      formattedFileSize: "200.0 KB",
      mimeType: "image/jpeg",
      detectedFormat: "JPEG",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      colorSpace: "sRGB",
      orientation: 1,
      orientationDescription: "Horizontal (normal)",
      bitDepth: "8 bits",
    },
    camera: {
      make: "Sony",
      model: "ILCE-7RM4",
      lensMake: "Sony",
      lensModel: "FE 24-70mm F2.8 GM",
      software: "v1.20",
      exposureTime: 0.005,
      formattedExposureTime: "1/200 s",
      fNumber: 2.8,
      formattedAperture: "f/2.8",
      iso: 100,
      focalLength: 50,
      formattedFocalLength: "50 mm",
      focalLengthIn35mm: 50,
      flash: 0,
      flashDescription: "Flash did not fire",
      whiteBalance: "0",
      whiteBalanceDescription: "Auto",
      meteringMode: "5",
      meteringModeDescription: "Multi-segment (Pattern)",
      exposureProgram: "3",
      exposureProgramDescription: "Aperture priority",
    },
    dateTime: {
      dateTimeOriginal: "2026:10:15 14:30:00",
      dateTimeDigitized: "2026:10:15 14:30:00",
      modifyDate: "2026:10:15 14:30:00",
      subSecTimeOriginal: "450",
      offsetTimeOriginal: "+00:00",
      rawDateStrings: { DateTimeOriginal: "2026:10:15 14:30:00" },
      hasTimezoneInfo: true,
      timezoneNotice: "Recorded timezone offset: +00:00",
    },
    gps: {
      hasGps: true,
      gpsNotice: "GPS coordinates extracted from embedded EXIF tags.",
      gpsData: {
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeRef: "N",
        longitudeRef: "W",
        altitude: 25.0,
        altitudeRef: "0",
        humanReadable: '37° 46\' 29.64" N, 122° 25\' 9.84" W',
        googleMapsUrl: "https://www.google.com/maps?q=37.7749,-122.4194",
        openStreetMapUrl: "https://www.openstreetmap.org/?mlat=37.7749&mlon=-122.4194",
      },
    },
    software: {
      software: "Adobe Photoshop Lightroom Classic",
      processingSoftware: null,
      xmpSoftware: "Adobe Photoshop",
      iptcCreator: "Investigator A",
      iptcDescription: "Forensic photo",
      isEditingSoftwarePresent: true,
      editingSoftwareNotice: "Editing software detected.",
    },
    rawExif: { Make: "Sony", Model: "ILCE-7RM4" },
    warnings: [],
    limitations: ["Metadata can be modified or stripped."],
    extractedAt: "2026-11-24T00:00:00.000Z",
    hasExifData: true,
  };

  const jsonStr = exportMetadataToJson(sampleMeta);
  const parsed = JSON.parse(jsonStr);

  assert.equal(parsed.schemaVersion, "1.0");
  assert.equal(parsed.file.filename, "sample.jpg");
  assert.equal(parsed.camera.make, "Sony");
  assert.equal(parsed.camera.exposureTime, "1/200 s");
  assert.equal(parsed.gps.present, true);
  assert.equal(parsed.gps.latitude, 37.7749);
  assert.equal(parsed.software.isEditingSoftwarePresent, true);
});

test("Metadata Extraction: extractMetadataFromFile handles clean file with zero EXIF without crashing", async () => {
  // Create a minimal synthetic buffer
  const emptyJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); // SOI + EOI
  const blob = new Blob([emptyJpeg], { type: "image/jpeg" });

  const result = await extractMetadataFromFile(blob, "clean.jpg", "JPEG", 800, 600, "4:3");
  assert.equal(result.basic.filename, "clean.jpg");
  assert.equal(result.basic.width, 800);
  assert.equal(result.basic.height, 600);
  assert.equal(result.basic.aspectRatio, "4:3");
  assert.equal(result.hasExifData, false);
  assert.equal(result.gps.hasGps, false);
  assert.equal(result.software.isEditingSoftwarePresent, false);
});

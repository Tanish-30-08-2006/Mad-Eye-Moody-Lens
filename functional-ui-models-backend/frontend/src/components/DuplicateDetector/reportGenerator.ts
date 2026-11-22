/**
 * Forensic Analysis PDF Report Generator for Batch Image Duplicate Detection.
 * Strictly frontend-side execution using jsPDF and jspdf-autotable.
 *
 * Adheres strictly to the Mad-Eye-Moody-Lens professional forensic theme:
 * - Clean white background (#ffffff)
 * - Near-black headings and body typography (#0f172a, #334155)
 * - Subtle light-grey table headers and minimal dividers (#f8fafc, #e2e8f0)
 * - Exact mathematical values from the batch analysis response without fabrication
 * - Reusable header and footer branding with the neural investigation eye logo
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const BRAND_LOGO_BASE64 = "data:image/png;base64,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";


export interface DuplicateGroup {
  group_id: string;
  sha256: string;
  files: string[];
  count: number;
}

export interface SimilarMatch {
  file_a: string;
  file_b: string;
  hamming_distance: number;
  similarity_percent: number;
  classification: "very_similar" | "potentially_similar";
}

export interface NoStrongMatch {
  file_a: string;
  file_b: string;
  hamming_distance: number;
  similarity_percent: number;
}

export interface FailedFile {
  filename: string;
  error: string;
}

export interface DuplicateSummary {
  total_images: number;
  valid_images: number;
  failed_images: number;
  total_comparisons: number;
  exact_duplicate_groups: number;
  exact_duplicate_pairs: number;
  very_similar_pairs: number;
  potentially_similar_pairs: number;
  no_match_pairs: number;
}

export interface DuplicateCompareResponse {
  success: boolean;
  total_images: number;
  valid_images: number;
  failed_images: number;
  total_comparisons: number;
  exact_duplicate_groups: DuplicateGroup[];
  similar_matches: SimilarMatch[];
  no_strong_matches: NoStrongMatch[];
  failed_files: FailedFile[];
  summary: DuplicateSummary;
  disclaimer: string;
}

export interface SelectedImageItem {
  id: string;
  file: File;
  previewUrl: string;
  error?: string;
}

export interface ImageDimension {
  width: number;
  height: number;
}

export interface ReportGenerationOptions {
  result: DuplicateCompareResponse;
  selectedImages: SelectedImageItem[];
  dimensionsMap?: Map<string, ImageDimension>;
  reportId?: string;
  generatedAt?: Date;
}

export interface ReportGenerationResult {
  doc: jsPDF;
  reportId: string;
  filename: string;
  pageCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFormat(file: File): string {
  const ext = file.name.split(".").pop()?.toUpperCase();
  if (ext) return ext;
  if (file.type) return file.type.replace("image/", "").toUpperCase();
  return "IMG";
}

export function generateReportId(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `MML-BIDD-${y}${m}${d}-${rand}`;
}

export function formatDateTimeWithZone(date: Date = new Date()): string {
  let timeZone = "UTC";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    timeZone = "UTC";
  }
  const iso = date.toISOString().replace("T", " ").substring(0, 19);
  return `${iso} UTC (${timeZone})`;
}

/**
 * Build the full forensic PDF document according to the 9-section specification.
 */
export function buildForensicReport(options: ReportGenerationOptions): ReportGenerationResult {
  const {
    result,
    selectedImages,
    dimensionsMap = new Map<string, ImageDimension>(),
    reportId = generateReportId(),
    generatedAt = new Date(),
  } = options;

  // Initialize jsPDF A4 in Portrait mode
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const leftMargin = 14;
  const rightMargin = 14;
  const contentWidth = pageWidth - leftMargin - rightMargin; // 182mm

  let currentY = 16;

  // Helper for checking page overflow before adding a section
  function ensureVerticalSpace(requiredSpace: number) {
    if (currentY + requiredSpace > 270) {
      doc.addPage();
      currentY = 30; // Below header
    }
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SECTION 1 â€” COVER AND REPORT IDENTIFICATION
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Draw Logo
  try {
    doc.addImage(BRAND_LOGO_BASE64, "PNG", leftMargin, currentY, 14, 14);
  } catch {
    // Graceful fallback if image decoding fails in headless environments
  }

  // Brand Name & Subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // #0f172a
  doc.text("MAD-EYE MOODY LENS", leftMargin + 18, currentY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // #64748b
  doc.text("FORENSIC INVESTIGATION SYSTEM Â· TECHNICAL EVIDENCE REPORT", leftMargin + 18, currentY + 11);

  currentY += 22;

  // Title Box (Clean White with subtle border)
  doc.setDrawColor(226, 232, 240); // #e2e8f0
  doc.setFillColor(248, 250, 252); // #f8fafc
  doc.roundedRect(leftMargin, currentY, contentWidth, 34, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text("FORENSIC IMAGE COMPARISON REPORT", leftMargin + 6, currentY + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Batch Image Duplicate Detection & Perceptual Similarity Telemetry", leftMargin + 6, currentY + 16);

  // Metadata Grid inside Title Box
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("REPORT REFERENCE ID:", leftMargin + 6, currentY + 24);
  doc.setFont("courier", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(reportId, leftMargin + 44, currentY + 24);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("DATE & TIME:", leftMargin + 6, currentY + 29);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(formatDateTimeWithZone(generatedAt), leftMargin + 44, currentY + 29);

  currentY += 40;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SECTION 2 â€” EXECUTIVE SUMMARY
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("1. EXECUTIVE SUMMARY & BATCH TELEMETRY", leftMargin, currentY);

  currentY += 4;

  const s = result.summary;

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 8,
    },
    head: [["Metric Category", "Count / Value", "Forensic Interpretation"]],
    body: [
      ["Total Images Uploaded", String(s.total_images), "Total files supplied in the batch"],
      ["Valid Images Analyzed", String(s.valid_images), "Successfully decoded, dimensioned & fingerprinted"],
      ["Failed / Invalid Files", String(s.failed_images), s.failed_images > 0 ? "Excluded due to format, corruption, or size constraints" : "Zero errors encountered during file parsing"],
      ["Total Pairwise Comparisons", String(s.total_comparisons), "Computed as n(n - 1) / 2 unique pairings"],
      ["Exact Duplicate Groups", String(s.exact_duplicate_groups), `${s.exact_duplicate_pairs} total duplicate pair(s) sharing identical SHA-256 byte fingerprints`],
      ["Very Similar Pairs", String(s.very_similar_pairs), "Hamming distance 0 to 5 bits (similarity â‰¥ 92.19%)"],
      ["Potentially Similar Pairs", String(s.potentially_similar_pairs), "Hamming distance 6 to 10 bits (similarity 84.38% to 90.62%)"],
      ["No Strong Match Pairs", String(s.no_match_pairs), "Hamming distance > 10 bits (similarity < 84.38%)"],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SECTION 3 â€” FILE INFORMATION AND HASH IDENTIFICATION
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  ensureVerticalSpace(35);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("2. FILE INFORMATION & HASH IDENTIFICATION", leftMargin, currentY);

  currentY += 4;

  // Build exact hash lookup from exact duplicate groups
  const exactHashMap = new Map<string, string>();
  for (const group of result.exact_duplicate_groups) {
    for (const f of group.files) {
      exactHashMap.set(f, group.sha256);
    }
  }

  const validImages = selectedImages.filter((img) => !img.error);

  const fileRows = validImages.map((img, idx) => {
    const fname = img.file.name;
    const format = getFormat(img.file);
    const size = formatBytes(img.file.size);
    const dim = dimensionsMap.get(fname);
    const resStr = dim ? `${dim.width} Ã— ${dim.height} px` : "Unavailable in batch input";
    const sha = exactHashMap.get(fname) || "Not exposed in API response (only duplicate groups exposed)";
    const phash = "Not exposed in API response (64-bit distances provided)";
    return [`#${idx + 1}`, fname, format, size, resStr, sha, phash];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 32, fontStyle: "bold" },
      2: { cellWidth: 14 },
      3: { cellWidth: 16 },
      4: { cellWidth: 26 },
      5: { cellWidth: 46, font: "courier", fontSize: 6.5 },
      6: { cellWidth: 38, font: "helvetica", fontSize: 6.5, textColor: [100, 116, 139] },
    },
    head: [["#", "Filename", "Format", "Size", "Resolution", "SHA-256 Hash", "Perceptual Hash (pHash)"]],
    body: fileRows,
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SECTION 4 â€” EXACT DUPLICATE RESULTS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  ensureVerticalSpace(35);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("3. EXACT DUPLICATE RESULTS (CRYPTOGRAPHIC SHA-256)", leftMargin, currentY);

  currentY += 4;

  if (result.exact_duplicate_groups.length === 0) {
    autoTable(doc, {
      startY: currentY,
      margin: { left: leftMargin, right: rightMargin },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3, textColor: [100, 116, 139] },
      body: [["No byte-for-byte exact duplicate files were detected in this batch comparison."]],
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
  } else {
    for (let g = 0; g < result.exact_duplicate_groups.length; g++) {
      const group = result.exact_duplicate_groups[g];
      ensureVerticalSpace(25);

      const groupRows = group.files.map((fname, fIdx) => {
        const item = selectedImages.find((img) => img.file.name === fname);
        const format = item ? getFormat(item.file) : "IMG";
        const size = item ? formatBytes(item.file.size) : "â€”";
        return [
          `File ${fIdx + 1}`,
          fname,
          format,
          size,
          group.sha256,
          "EXACT MATCH (Byte-for-byte identical content)",
        ];
      });

      autoTable(doc, {
        startY: currentY,
        margin: { left: leftMargin, right: rightMargin },
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 7.5,
          cellPadding: 2,
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [236, 253, 245], // light emerald
          textColor: [4, 120, 87],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 36, fontStyle: "bold" },
          2: { cellWidth: 16 },
          3: { cellWidth: 18 },
          4: { cellWidth: 50, font: "courier", fontSize: 6.5 },
          5: { cellWidth: 46, textColor: [4, 120, 87], fontStyle: "bold" },
        },
        head: [[`Duplicate Group ${g + 1} (${group.count} files)`, "Filename", "Format", "Size", "SHA-256 Digest", "Classification"]],
        body: groupRows,
      });

      currentY = (doc as any).lastAutoTable.finalY + 6;
    }

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Note: Identical SHA-256 cryptographic hashes indicate byte-for-byte identical file content, subject to negligible theoretical collision risk (p < 10^-77).",
      leftMargin,
      currentY
    );
    currentY += 8;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SECTION 5 â€” VISUALLY SIMILAR IMAGES
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  ensureVerticalSpace(35);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("4. VISUALLY SIMILAR IMAGES (PERCEPTUAL HASHING - pHASH)", leftMargin, currentY);

  currentY += 4;

  if (result.similar_matches.length === 0) {
    autoTable(doc, {
      startY: currentY,
      margin: { left: leftMargin, right: rightMargin },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3, textColor: [100, 116, 139] },
      body: [["No visually similar image pairs were detected within the similarity threshold (Hamming distance â‰¤ 10)."]],
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
  } else {
    const similarRows = result.similar_matches.map((m, idx) => {
      const clsLabel = m.classification === "very_similar" ? "VERY SIMILAR" : "POTENTIALLY SIMILAR";
      return [
        `#${idx + 1}`,
        m.file_a,
        m.file_b,
        `${m.hamming_distance} / 64 bits`,
        `${m.similarity_percent.toFixed(2)}%`,
        "Not exposed in API",
        clsLabel,
      ];
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: leftMargin, right: rightMargin },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 2,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [254, 243, 199], // amber light
        textColor: [180, 83, 9],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 38, fontStyle: "bold" },
        2: { cellWidth: 38, fontStyle: "bold" },
        3: { cellWidth: 26 },
        4: { cellWidth: 24, fontStyle: "bold" },
        5: { cellWidth: 24, textColor: [100, 116, 139] },
        6: { cellWidth: 22, fontStyle: "bold" },
      },
      head: [["#", "First Image (A)", "Second Image (B)", "Hamming Dist.", "Similarity", "pHash Strings", "Classification"]],
      body: similarRows,
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Formula: Similarity = (1 - Hamming Distance / 64) Ã— 100", leftMargin, currentY);
    currentY += 4;
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Note: Lower Hamming distance means greater hash similarity. Percentage is a bit agreement score, not calibrated forensic authenticity or provenance proof.",
      leftMargin,
      currentY
    );
    currentY += 8;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SECTION 6 â€” NO STRONG MATCHES
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  ensureVerticalSpace(35);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("5. NO STRONG MATCHES (PAIRS EXCEEDING SIMILARITY THRESHOLD)", leftMargin, currentY);

  currentY += 4;

  if (result.no_strong_matches.length === 0) {
    autoTable(doc, {
      startY: currentY,
      margin: { left: leftMargin, right: rightMargin },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3, textColor: [100, 116, 139] },
      body: [["All evaluated image pairs met duplicate or similarity criteria; zero dissimilar pairs in batch."]],
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
  } else {
    const noMatchRows = result.no_strong_matches.map((p, idx) => [
      `#${idx + 1}`,
      p.file_a,
      p.file_b,
      `${p.hamming_distance} / 64 bits`,
      `${p.similarity_percent.toFixed(2)}%`,
      "Not exposed in API",
      "NO STRONG MATCH",
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: leftMargin, right: rightMargin },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7.2,
        cellPadding: 2,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [71, 85, 105],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 38 },
        2: { cellWidth: 38 },
        3: { cellWidth: 26 },
        4: { cellWidth: 24 },
        5: { cellWidth: 24, textColor: [100, 116, 139] },
        6: { cellWidth: 22, textColor: [100, 116, 139] },
      },
      head: [["#", "First Image (A)", "Second Image (B)", "Hamming Dist.", "Similarity", "pHash Strings", "Status"]],
      body: noMatchRows,
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Note: A 'No Strong Match' classification indicates only that the pair exceeded distance threshold (> 10 bits); it does not prove images are completely unrelated.",
      leftMargin,
      currentY
    );
    currentY += 8;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // FAILED FILES SECTION (IF ANY)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (result.failed_files.length > 0) {
    ensureVerticalSpace(25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(220, 38, 38); // red
    doc.text("EXCLUDED / FAILED FILES", leftMargin, currentY);
    currentY += 4;

    const failedRows = result.failed_files.map((ff, idx) => [`#${idx + 1}`, ff.filename, ff.error]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: leftMargin, right: rightMargin },
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 2, textColor: [153, 27, 27] },
      headStyles: { fillColor: [254, 242, 242], textColor: [153, 27, 27], fontStyle: "bold" },
      head: [["#", "Filename", "Rejection Reason"]],
      body: failedRows,
    });
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SECTION 7 â€” METHODOLOGY AND TECHNICAL EXPLANATION
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  ensureVerticalSpace(40);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("6. METHODOLOGY & TECHNICAL EXPLANATION", leftMargin, currentY);

  currentY += 5;

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.5, textColor: [51, 65, 85], lineColor: [226, 232, 240] },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    head: [["Forensic Methodology", "Implementation & Technical Definition"]],
    body: [
      [
        "Cryptographic Hash (SHA-256)",
        "Secure Hash Algorithm producing a deterministic 256-bit (64 hex character) digest. Operates on raw byte bitstreams. Identical SHA-256 digests mathematically guarantee identical byte content across files, independent of image presentation.",
      ],
      [
        "Perceptual Hashing (pHash)",
        "Transforms image spatial data to the frequency domain via Discrete Cosine Transform (DCT), extracting low-frequency luminance distributions into a 64-bit fingerprint. Robust against minor compression, format re-encoding, and scaling.",
      ],
      [
        "Hamming Distance",
        "The number of bit positions where two 64-bit binary hashes disagree (0 to 64 bits). 0 represents identical perceptual hashes; 32 represents orthogonal random distribution.",
      ],
      [
        "Similarity Metric",
        "Standardized mathematical bit similarity percentage: Similarity = (1 - Distance / 64) Ã— 100. Reflects bit agreement, not probabilistic authenticity.",
      ],
      [
        "Operational Thresholds",
        "â€¢ Very Similar: Distance â‰¤ 5 bits (Similarity â‰¥ 92.19%)\nâ€¢ Potentially Similar: Distance 6 to 10 bits (Similarity 84.38% to 90.62%)\nâ€¢ No Strong Match: Distance > 10 bits (Similarity < 84.38%)",
      ],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SECTION 8 â€” LIMITATIONS AND DISCLAIMER
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  ensureVerticalSpace(35);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("7. LIMITATIONS & FORENSIC DISCLAIMER", leftMargin, currentY);

  currentY += 5;

  const disclaimerPoints = [
    ["1", "Perceptual hashing can be affected by non-uniform cropping, rotation, significant aspect-ratio changes, and major visual alterations."],
    ["2", "Visually similar unrelated images (e.g. solid backgrounds, stock textures, common layouts) may occasionally produce similar hashes."],
    ["3", "Recompression, format transcoding, metadata stripping, or resizing will alter cryptographic SHA-256 digests while preserving perceptual hashes."],
    ["4", "A 'No Strong Match' result confirms only that perceptual distance exceeded configured thresholds; it is not proof of mutual independence."],
    ["5", "Perceptual hash similarity does not establish common origin, legal copyright infringement, deepfake manipulation, or chain of custody."],
    ["6", "This report documents computational comparison results and is not a certified legal affidavit or conclusive forensic determination."],
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.2, cellPadding: 2, textColor: [71, 85, 105], lineColor: [226, 232, 240] },
    columnStyles: { 0: { cellWidth: 8, fontStyle: "bold", textColor: [15, 23, 42] }, 1: { cellWidth: 174 } },
    body: disclaimerPoints,
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SECTION 9 â€” FINAL FINDINGS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  ensureVerticalSpace(25);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("8. FINAL FINDINGS SYNTHESIS", leftMargin, currentY);

  currentY += 4;

  const findingsText =
    `The forensic batch duplicate analysis successfully evaluated ${s.valid_images} valid image(s) from ` +
    `${s.total_images} uploaded file(s), calculating ${s.total_comparisons} distinct pairwise comparisons. ` +
    `Cryptographic SHA-256 analysis identified ${s.exact_duplicate_groups} exact duplicate group(s) ` +
    `comprising ${s.exact_duplicate_pairs} identical pair(s). Perceptual hash comparison identified ` +
    `${s.very_similar_pairs} very similar pair(s) and ${s.potentially_similar_pairs} potentially similar pair(s) ` +
    `within the configured similarity envelope. ${s.no_match_pairs} pair(s) exhibited Hamming distances above ` +
    `the similarity threshold (> 10 bits). All temporary analysis buffers have been purged in-memory in accordance ` +
    `with privacy assurance protocols.`;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  const splitFindings = doc.splitTextToSize(findingsText, contentWidth);
  doc.text(splitFindings, leftMargin, currentY);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // GLOBAL HEADER & FOOTER SYSTEM ACROSS EVERY PAGE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const totalPages = doc.getNumberOfPages();

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Header on pages 2..N (page 1 already has the cover header)
    if (p > 1) {
      try {
        doc.addImage(BRAND_LOGO_BASE64, "PNG", leftMargin, 8, 8, 8);
      } catch {}

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("MAD-EYE MOODY LENS", leftMargin + 11, 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text("FORENSIC IMAGE COMPARISON REPORT", leftMargin + 11, 15.5);

      doc.setFont("courier", "normal");
      doc.setFontSize(7);
      doc.text(reportId, pageWidth - rightMargin - 40, 14);

      // Header Separator line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(leftMargin, 18, pageWidth - rightMargin, 18);
    }

    // Footer on ALL pages
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(leftMargin, pageHeight - 14, pageWidth - rightMargin, pageHeight - 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(148, 163, 184); // #94a3b8
    doc.text("CONFIDENTIAL Â· BATCH FORENSIC IMAGE ANALYSIS TELEMETRY", leftMargin, pageHeight - 9);

    const pageStr = `Page ${p} of ${totalPages}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(pageStr, pageWidth - rightMargin - 18, pageHeight - 9);
  }

  const filename = `${reportId.toLowerCase()}.pdf`;

  return {
    doc,
    reportId,
    filename,
    pageCount: totalPages,
  };
}

/**
 * Trigger download in the user's browser.
 */
export async function downloadForensicReport(options: ReportGenerationOptions): Promise<ReportGenerationResult> {
  const result = buildForensicReport(options);
  result.doc.save(result.filename);
  return result;
}

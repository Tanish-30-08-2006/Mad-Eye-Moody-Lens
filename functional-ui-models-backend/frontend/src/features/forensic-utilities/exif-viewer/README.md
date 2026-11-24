# Image Metadata & EXIF Viewer

## Overview
The **Image Metadata & EXIF Viewer** is an independent, 100% browser-side forensic utility built for **Mad-Eye-Moody-Lens**. It extracts, decodes, and presents embedded photographic EXIF, IPTC, XMP, ICC, and JFIF metadata from image files without transmitting byte data to external servers or AI services.

The feature is accessible via the navigation group **Forensic Utilities → Image Metadata & EXIF Viewer** and route `/exif-viewer` (or `#exif-viewer`).

---

## Directory Structure

```
functional-ui-models-backend/frontend/src/features/forensic-utilities/exif-viewer/
├── ExifViewer.css                                # Bonsai-inspired clean white theme styling
├── index.ts                                      # Feature barrel export
├── README.md                                     # Feature documentation
├── components/
│   ├── BasicImageMetadata.tsx                    # File properties, dimensions, aspect ratio table
│   ├── CameraMetadata.tsx                        # Device, lens, and optical settings table
│   ├── DateMetadata.tsx                          # Timestamps and timezone verification table
│   ├── ExifViewerHeader.tsx                      # Page header, breadcrumb navigation, privacy banner
│   ├── ExifViewerPage.tsx                        # Root feature layout and tab switcher
│   ├── GpsMapLink.tsx                            # Coordinates visualizer & safe external map links
│   ├── GpsMetadata.tsx                           # Geolocation table & coordinate copy action
│   ├── ImageUpload.tsx                           # Drag-and-drop dropzone & browse button
│   ├── MetadataEmptyState.tsx                    # Clean placeholder before file selection
│   ├── MetadataErrorState.tsx                    # Actionable error presentation card
│   ├── MetadataExport.tsx                        # JSON export and clipboard copy actions
│   ├── MetadataLoadingState.tsx                  # Subtle loading spinner during decoding
│   ├── MetadataOverview.tsx                      # Forensic summary metric cards
│   ├── MetadataSection.tsx                       # Collapsible section wrapper
│   ├── MetadataWarnings.tsx                      # Forensic limitations & parsing notes
│   ├── SoftwareMetadata.tsx                      # Editing software and author signatures
│   └── UploadedImagePreview.tsx                  # Selected file thumbnail, badges, & actions
├── constants/
│   ├── metadata-fields.ts                        # Field registries & dictionary tags
│   └── supported-formats.ts                      # Format definitions, MIME types, & size limits
├── hooks/
│   ├── useExifMetadata.ts                        # Extraction lifecycle, loading, and error states
│   └── useImageUpload.ts                         # File selection, magic byte sniffing, URL cleanup
├── services/
│   ├── gps-converter.service.ts                  # DMS to decimal conversion, validation, formatting
│   ├── image-inspector.service.ts                # Binary header inspector and dimension decoding
│   └── metadata-extractor.service.ts             # exifr integration, tag normalization, warning collation
├── types/
│   ├── exif.types.ts                             # Raw EXIF interface definitions
│   ├── gps.types.ts                              # GPS coordinates and conversion result contracts
│   └── metadata.types.ts                         # Normalized CompleteImageMetadata contracts
└── utils/
    ├── file-validation.ts                        # Magic byte sniffing and size/format validator
    ├── metadata-export.ts                        # JSON report serializer and clipboard actions
    └── metadata-normalizer.ts                    # Exposure, aperture, orientation, & date formatters
```

---

## Supported Formats

- **JPEG / JPG**: Full EXIF, IPTC, XMP, ICC, JFIF, and GPS tag parsing.
- **PNG**: eXIf chunk and XMP metadata parsing.
- **WebP**: EXIF and XMP chunk parsing.
- **TIFF / TIF**: Native tag directories and baseline EXIF parsing.

File validation sniffs magic header bytes (`FF D8 FF` for JPEG, `89 50 4E 47` for PNG, `RIFF...WEBP` for WebP, `49 49 2A 00` / `4D 4D 00 2A` for TIFF) to prevent mislabeled or malicious file extension spoofs. Files exceeding the 50 MB safety cap or empty files (0 bytes) are cleanly rejected with friendly feedback.

---

## Metadata Fields Extracted

1. **Basic File & Container Information**:
   - File name, file size (bytes and formatted MB/KB), MIME type, detected format.
   - Natural width, height, aspect ratio (e.g., 16:9, 4:3, 1:1, 3:2).
   - Color space (sRGB, Adobe RGB, Uncalibrated), bit depth, EXIF orientation description.
2. **Camera, Optics & Exposure**:
   - Camera make and model, lens make and model.
   - Shutter speed / exposure time (formatted as fractions, e.g., 1/250 s), aperture (F-number, e.g., f/2.8).
   - ISO sensitivity, focal length (mm), 35mm equivalent focal length.
   - Flash status, white balance mode, metering mode, exposure program.
3. **Date & Time Records**:
   - `DateTimeOriginal` (capture time), `DateTimeDigitized`, `ModifyDate`.
   - Sub-second fractional timestamps (`SubSecTimeOriginal`).
   - Timezone offset identification (`OffsetTimeOriginal`) — raw values are preserved and never silently converted to local device time.
4. **Geolocation (GPS)**:
   - Latitude, longitude, altitude, altitude reference (above/below sea level).
   - Degrees, minutes, seconds formatted notation (`37° 46' 29.64" N, 122° 25' 9.84" W`).
   - Decimal degrees (`37.7749000, -122.4194000`).
   - Safe external map visualization links (OpenStreetMap and Google Maps).
5. **Software & Post-Processing Signatures**:
   - Software / firmware, processing software, XMP creator tool.
   - IPTC author/artist and description tags.
   - Neutral forensic indication if third-party photo editors (Photoshop, Lightroom, GIMP, Canva, Snapseed, etc.) are recorded in headers.
6. **Raw EXIF Inspection**:
   - Full dictionary of all unparsed raw tags for advanced forensic investigation.

---

## GPS Conversion Logic

GPS coordinates in EXIF are commonly recorded as three rational numbers `[degrees, minutes, seconds]` with an orientation reference (`N`, `S`, `E`, `W`).

### Conversion Formula
$$\text{Decimal Degrees} = \text{Degrees} + \frac{\text{Minutes}}{60} + \frac{\text{Seconds}}{3600}$$

- If `Ref == 'S'` or `Ref == 'W'`, the resulting decimal coordinate is multiplied by $-1$.
- If `Ref == 'N'` or `Ref == 'E'`, the coordinate remains positive.

### Validation Rules
- Degrees, minutes, and seconds must be non-negative finite numbers with minutes $< 60$ and seconds $< 60$.
- Latitude decimal degrees must be within $[-90, +90]$.
- Longitude decimal degrees must be within $[-180, +180]$.
- Direction references must never be guessed if missing from the file.
- Coordinates are never fabricated or defaulted to $(0,0)$.

---

## Library Selection

- **Library**: `exifr` (`v7.1.3`)
- **Reason**: `exifr` is the fastest, zero-dependency browser-compatible EXIF reader. It leverages chunked reading (slicing only necessary binary segments) rather than buffering the entire image into RAM, and has zero external dependencies (`dependencies: {}`).

---

## Browser Requirements & Privacy Guarantees

- **Browser Requirements**: Any modern ECMAScript 2020+ browser with Web APIs (`Blob`, `File`, `FileReader`, `URL.createObjectURL`, `URL.revokeObjectURL`).
- **Privacy Guarantees**:
  - All parsing occurs entirely on the client side in the user's browser.
  - No image bytes or extracted metadata are sent to the FastAPI backend or third-party APIs.
  - No reverse geocoding or external telemetry requests are executed during extraction.
  - Temporary object URLs are revoked upon image replacement or component unmount to prevent memory retention.

---

## Forensic Limitations

- Embedded metadata can be stripped, forged, or edited with basic metadata editing tools; metadata presence or absence alone does not establish legal proof of authenticity.
- Most modern social media platforms (Twitter/X, Facebook, Instagram, Reddit, WhatsApp) strip EXIF and GPS tags automatically upon upload to protect user privacy.
- Camera timestamps reflect internal hardware clocks, which may be unsynchronized or incorrect.

---

## How to Run Tests

From the repository root:
```bash
npm test --prefix functional-ui-models-backend/frontend
```

To run TypeScript verification and production build:
```bash
npm run build --prefix functional-ui-models-backend/frontend
```

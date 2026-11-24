/**
 * Supported image formats and validation constants.
 */

export {
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_MIME_TYPES,
  type SupportedImageFormat,
} from "../utils/file-validation";

export const FORMAT_DESCRIPTIONS: Record<string, string> = {
  JPEG: "Joint Photographic Experts Group (Full EXIF, IPTC, XMP, GPS supported)",
  PNG: "Portable Network Graphics (eXIf chunk & XMP metadata supported)",
  WEBP: "WebP (EXIF and XMP chunks supported)",
  TIFF: "Tagged Image File Format (Native tag directory & EXIF supported)",
  UNKNOWN: "Unrecognized or unsupported image container",
};

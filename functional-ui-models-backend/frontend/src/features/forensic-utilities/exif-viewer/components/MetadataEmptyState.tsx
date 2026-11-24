/**
 * Empty state component shown before an image is selected.
 */

export function MetadataEmptyState() {
  return (
    <div className="exif-empty-state">
      <div className="exif-empty-icon-wrap" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
      <h3 className="exif-empty-title">No image selected</h3>
      <p className="exif-empty-desc">
        Select or drop a JPEG, PNG, WebP, or TIFF image above to inspect embedded EXIF, IPTC, XMP, and GPS metadata.
      </p>
    </div>
  );
}

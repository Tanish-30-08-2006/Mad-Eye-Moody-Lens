/**
 * Loading state component shown while extracting metadata.
 */

export function MetadataLoadingState() {
  return (
    <div className="exif-loading-state" role="status" aria-live="polite">
      <div className="exif-spinner" aria-hidden="true" />
      <h3 className="exif-loading-title">Parsing image metadata...</h3>
      <p className="exif-loading-desc">
        Reading binary headers and decoding EXIF tags locally in browser memory.
      </p>
    </div>
  );
}

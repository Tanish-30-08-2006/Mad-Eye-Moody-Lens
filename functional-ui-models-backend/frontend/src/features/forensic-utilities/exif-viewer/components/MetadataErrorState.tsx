/**
 * Error state component shown when file validation or extraction fails.
 */

interface MetadataErrorStateProps {
  error: string;
  onClear?: () => void;
}

export function MetadataErrorState({ error, onClear }: MetadataErrorStateProps) {
  return (
    <div className="exif-error-card" role="alert">
      <div className="exif-error-header">
        <div className="exif-error-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div>
          <h4 className="exif-error-title">Metadata Extraction Failed</h4>
          <p className="exif-error-desc">{error}</p>
        </div>
      </div>

      {onClear && (
        <button type="button" className="bonsai-btn-secondary exif-btn-sm" onClick={onClear}>
          Select Another Image
        </button>
      )}
    </div>
  );
}

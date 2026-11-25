/**
 * Header and breadcrumb component for Image Metadata & EXIF Viewer.
 */

interface ExifViewerHeaderProps {
  onNavigateHome?: () => void;
  onNavigateDuplicate?: () => void;
  onNavigateSha256?: () => void;
}

export function ExifViewerHeader(_props: ExifViewerHeaderProps = {}) {
  return (
    <div className="exif-header-wrap">
      {/* Main Title & Description */}
      <div className="exif-title-section">
        <div className="exif-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Forensic Utilities · Metadata Inspection
        </div>

        <h1 className="exif-title">Image Metadata &amp; EXIF Viewer</h1>
        <p className="exif-desc">
          Extract, decode, and verify embedded camera tags, GPS coordinates, capture dates, and editing software
          signatures with forensic precision.
        </p>

        {/* Local Processing Privacy Notice */}
        <div className="exif-privacy-notice" role="note">
          <div className="exif-privacy-notice__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <strong>100% Client-Side Privacy:</strong> Your image is processed locally in your browser. The original
            image and its metadata are never uploaded to our servers or any third-party AI service.
          </div>
        </div>
      </div>
    </div>
  );
}

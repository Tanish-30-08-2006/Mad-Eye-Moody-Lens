/**
 * Header and breadcrumb component for Image Metadata & EXIF Viewer.
 */

interface ExifViewerHeaderProps {
  onNavigateHome?: () => void;
  onNavigateDuplicate?: () => void;
  onNavigateSha256?: () => void;
}

export function ExifViewerHeader({
  onNavigateHome,
  onNavigateDuplicate,
  onNavigateSha256,
}: ExifViewerHeaderProps) {
  return (
    <div className="exif-header-wrap">
      {/* Navigation Breadcrumb Bar */}
      <div className="exif-nav-bar">
        <a
          href="#analyse"
          className="exif-back-link"
          onClick={(e) => {
            e.preventDefault();
            if (onNavigateHome) onNavigateHome();
            else {
              window.location.hash = "";
              window.history.pushState(null, "", "/");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }
          }}
        >
          ← Back to Deepfake Analyser
        </a>

        <a
          href="#duplicate-detection"
          className="exif-back-link"
          onClick={(e) => {
            e.preventDefault();
            if (onNavigateDuplicate) onNavigateDuplicate();
            else {
              window.location.hash = "#duplicate-detection";
              window.history.pushState(null, "", "/duplicate-detection");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }
          }}
        >
          Duplicate Image Detector
        </a>

        <a
          href="#sha256-generator"
          className="exif-back-link"
          onClick={(e) => {
            e.preventDefault();
            if (onNavigateSha256) onNavigateSha256();
            else {
              window.location.hash = "#sha256-generator";
              window.history.pushState(null, "", "/sha256-generator");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }
          }}
        >
          SHA-256 Generator &amp; Comparator
        </a>
      </div>

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

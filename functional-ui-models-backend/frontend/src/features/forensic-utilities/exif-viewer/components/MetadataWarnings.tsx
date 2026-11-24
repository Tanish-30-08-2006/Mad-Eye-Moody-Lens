/**
 * Forensic metadata limitations and investigative guidance card.
 */

interface MetadataWarningsProps {
  warnings: string[];
  limitations: string[];
}

export function MetadataWarnings({ warnings, limitations }: MetadataWarningsProps) {
  return (
    <div className="exif-warnings-wrap">
      {warnings.length > 0 && (
        <div className="exif-warning-banner">
          <h4 className="exif-warning-title">Parsing Notes &amp; Observations</h4>
          <ul className="exif-warning-list">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="exif-limitations-box">
        <h4 className="exif-limitations-title">Forensic Metadata Limitations</h4>
        <ul className="exif-limitations-list">
          {limitations.map((lim) => (
            <li key={lim}>{lim}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { HashComparisonResult } from "../types/sha256.types";

interface ComparisonResultProps {
  result: HashComparisonResult | null;
}

export function ComparisonResult({ result }: ComparisonResultProps) {
  if (!result || result.type === "idle") return null;

  if (result.type === "invalid_hash") {
    return (
      <div className="sha256-compare-banner sha256-compare-banner--invalid">
        <div className="sha256-compare-banner__icon">⚠️</div>
        <div>
          <div className="sha256-compare-banner__title">Invalid SHA-256 Input</div>
          <div className="sha256-compare-banner__desc">{result.message}</div>
        </div>
      </div>
    );
  }

  if (result.isMatch) {
    return (
      <div className="sha256-compare-banner sha256-compare-banner--match">
        <div className="sha256-compare-banner__icon">✓</div>
        <div>
          <div className="sha256-compare-banner__title">MATCH: Cryptographic Fingerprints Identical</div>
          <div className="sha256-compare-banner__desc">
            Both inputs resolve to the exact same 64-character SHA-256 digest. The source bytes are bit-for-bit
            identical. (Theoretical SHA-256 collision probability is less than 2<sup>-256</sup>).
          </div>
          <div className="sha256-compare-banner__code">
            <code>{result.hashA}</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sha256-compare-banner sha256-compare-banner--mismatch">
      <div className="sha256-compare-banner__icon">≠</div>
      <div>
        <div className="sha256-compare-banner__title">NO MATCH: Fingerprints Differ</div>
        <div className="sha256-compare-banner__desc">
          The cryptographic hashes do not match. At least one byte of data differs between the two inputs.
          Note: In digital media, different SHA-256 hashes do not prove that two images depict different scenes
          (even a 1-pixel or metadata change completely changes the SHA-256 digest).
        </div>
        <div className="sha256-compare-banner__diff-table">
          <div>
            <span className="sha256-compare-label">Hash A:</span>
            <code>{result.hashA}</code>
          </div>
          <div>
            <span className="sha256-compare-label">Hash B:</span>
            <code>{result.hashB}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

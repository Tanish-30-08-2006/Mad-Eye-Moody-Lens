import { useState } from "react";
import { HashedFile } from "../types/sha256.types";
import { formatBytes, getFileExtension } from "../utils/file-format";

interface HashResultCardProps {
  item: HashedFile;
  onRemove: (id: string) => void;
  onHashSingle: (id: string) => void;
  disabled?: boolean;
}

export function HashResultCard({ item, onRemove, onHashSingle, disabled }: HashResultCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!item.hash) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(item.hash);
      } else {
        // Fallback for non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = item.hash;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div className="sha256-file-card">
      <div className="sha256-file-card__header">
        <div className="sha256-file-card__meta">
          <span className="sha256-format-tag">{getFileExtension(item.file.name)}</span>
          <span className="sha256-filename" title={item.file.name}>
            {item.file.name}
          </span>
          <span className="sha256-filesize">({formatBytes(item.file.size)})</span>
        </div>

        <div className="sha256-file-card__actions">
          {item.status === "idle" && (
            <button
              type="button"
              className="bonsai-btn-secondary sha256-btn-sm"
              onClick={() => onHashSingle(item.id)}
              disabled={disabled}
            >
              Generate Hash
            </button>
          )}

          {item.status === "done" && item.durationMs !== undefined && (
            <span className="sha256-duration">{item.durationMs} ms</span>
          )}

          <button
            type="button"
            className="sha256-btn-icon"
            onClick={() => onRemove(item.id)}
            disabled={disabled}
            title="Remove file from list"
            aria-label={`Remove ${item.file.name}`}
          >
            ✕
          </button>
        </div>
      </div>

      {item.status === "hashing" && (
        <div className="sha256-progress-wrapper">
          <div className="sha256-progress-bar">
            <div
              className="sha256-progress-bar__fill"
              style={{ width: `${Math.round((item.progress || 0) * 100)}%` }}
            />
          </div>
          <span className="sha256-progress-text">
            Hashing... {Math.round((item.progress || 0) * 100)}%
          </span>
        </div>
      )}

      {item.status === "error" && (
        <div className="sha256-error-badge">
          ⚠️ {item.error || "Failed to generate SHA-256 hash."}
        </div>
      )}

      {item.status === "done" && item.hash && (
        <div className="sha256-hash-box">
          <code className="sha256-hash-code">{item.hash}</code>
          <button
            type="button"
            className="bonsai-btn-secondary sha256-copy-btn"
            onClick={handleCopy}
            title="Copy full 64-character SHA-256 digest"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

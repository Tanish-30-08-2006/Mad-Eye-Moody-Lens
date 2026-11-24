/**
 * Reusable structured section card with clean Bonsai borders.
 */

import React, { useState } from "react";

interface MetadataSectionProps {
  title: string;
  badge?: string;
  badgeType?: "default" | "success" | "warning";
  description?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function MetadataSection({
  title,
  badge,
  badgeType = "default",
  description,
  children,
  defaultExpanded = true,
}: MetadataSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <section className="exif-section-card">
      <header
        className="exif-section-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
      >
        <div className="exif-section-header-left">
          <h3 className="exif-section-title">{title}</h3>
          {badge && (
            <span className={`exif-section-badge exif-section-badge--${badgeType}`}>
              {badge}
            </span>
          )}
        </div>

        <button
          type="button"
          className="exif-collapse-toggle"
          aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </header>

      {description && <p className="exif-section-desc">{description}</p>}

      {isExpanded && <div className="exif-section-body">{children}</div>}
    </section>
  );
}

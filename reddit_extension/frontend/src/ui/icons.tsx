/**
 * ui/icons.tsx – The small inline-SVG icon set (no icon library). Every icon draws with currentColor.
 */

import React from 'react';

export interface IconProps {
  size?: number;
  className?: string;
}

/** Shared 24x24 stroked icon frame; decorative by default (buttons carry their own labels). */
const Svg: React.FC<IconProps & { children: React.ReactNode; filled?: boolean }> = ({ size = 18, className, children, filled }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const LensIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3.2" />
  </Svg>
);
export const CheckIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const AlertIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17.2v.1" />
  </Svg>
);
export const InfoIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.8v.1" />
  </Svg>
);
export const CopyIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 012-2h9" />
  </Svg>
);
export const ShareIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M4 12v6a2 2 0 002 2h12a2 2 0 002-2v-6" />
    <path d="M12 15V4M8 8l4-4 4 4" />
  </Svg>
);
export const CardIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M7 15l3-3 3 3 2-2 2 2" />
  </Svg>
);
export const FlagIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);
export const SearchIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
);
export const ThumbUpIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.7 10H19a2 2 0 012 2.3l-1.3 6A2 2 0 0117.7 20H7" />
  </Svg>
);
export const ThumbDownIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M7 13V4H4v9zM7 13l4 7c1.5 0 2.5-1 2.2-2.6L12.7 14H19a2 2 0 002-2.3l-1.3-6A2 2 0 0017.7 4H7" />
  </Svg>
);
export const CloseIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const HistoryIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v4h4" />
    <path d="M12 8v4.5l3 1.8" />
  </Svg>
);
export const ChevronIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M7 10l5 5 5-5" />
  </Svg>
);
export const SettingsIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Svg>
);

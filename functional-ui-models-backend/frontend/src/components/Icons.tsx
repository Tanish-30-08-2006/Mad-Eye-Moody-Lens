import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1,
  strokeLinecap: "square",
  "aria-hidden": true,
};

export const ImageIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="16" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="M3 17l5-5 4 4 3-3 6 6" />
  </svg>
);

export const AudioIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3 12h1M6 8v8M9 5v14M12 9v6M15 6v12M18 10v4M21 12h0" />
  </svg>
);

export const VideoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="14" />
    <path d="M10 9.5v5l4.5-2.5z" />
    <path d="M3 8h18M3 16h18" strokeDasharray="1.5 2" />
  </svg>
);

export const FaceIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
    <circle cx="12" cy="11" r="4.5" />
    <path d="M9.5 16.5c1.5.9 3.5.9 5 0" />
  </svg>
);

export const MEDIA_ICON = { image: ImageIcon, audio: AudioIcon, video: VideoIcon } as const;

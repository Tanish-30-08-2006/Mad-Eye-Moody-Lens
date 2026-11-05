/**
 * adapters/types.ts – Interface definitions for site adapters.
 *
 * The SiteAdapter pattern decouples platform-specific DOM interaction from
 * the extension core. Each supported site (Reddit, future: Twitter, etc.)
 * implements SiteAdapter. The content script delegates all DOM queries and
 * media extraction to the active adapter.
 */

/** A reference to a piece of media found in a post. */
export interface MediaRef {
  /** Discriminant for the media type. */
  kind: 'image' | 'gallery' | 'video' | 'gif' | 'audio';
  /** Primary media URL(s). For galleries, multiple URLs; for videos, candidate renditions. */
  urls: string[];
  /** Separate audio track URL (Reddit splits video and audio). Absent for silent videos. */
  audioUrl?: string;
  /** Post permalink (relative path, e.g. /r/sub/comments/abc/title/). */
  permalink: string;
  /** Unique post identifier. */
  postId: string;
  /** Human-readable post title. */
  title?: string;
}

/** A point in the DOM where the lens button should be mounted. */
export interface MountPoint {
  /** The post element (e.g. <shreddit-post>). */
  postElement: HTMLElement;
  /** The container (top-right of the media) where the button host is appended. */
  anchorElement: HTMLElement;
  /** Post ID for deduplication. */
  postId: string;
}

/** Called once per visible post; may return a disposer that removes whatever it added. */
export type PostCallback = (post: HTMLElement) => void | (() => void);

/**
 * SiteAdapter – interface for site-specific DOM interaction.
 */
export interface SiteAdapter {
  /** Human-readable name of the site. */
  readonly siteName: string;

  /** URL match patterns this adapter applies to. */
  readonly matchPatterns: string[];

  /** Find all post elements currently in the DOM. */
  findPosts(): HTMLElement[];

  /** True when the post is a media post (image, gallery or video), whatever the extraction outcome. */
  isMediaPost(post: HTMLElement): boolean;

  /** Extract media references from a single post element; null for text/link/no-media. */
  extractMedia(post: HTMLElement): MediaRef | null;

  /** Find the mount point for the lens button in a post. */
  getMountPoint(post: HTMLElement): MountPoint | null;

  /** Debug-only: describe what the extractors see in a post. */
  describe(post: HTMLElement): unknown;

  /**
   * Start observing: `onPost` runs once per visible post; `onNavigate` runs after an SPA
   * navigation, once everything has been stopped and cleared and just before observing restarts.
   */
  observe(onPost: PostCallback, onNavigate?: () => void): void;

  /** Stop observing and remove everything this adapter added. Idempotent. */
  disconnect(): void;
}

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
  /** Primary media URL(s). For galleries, multiple URLs. */
  urls: string[];
  /** Separate audio track URL (Reddit splits video and audio). */
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
  /** The container where the button shadow root should be appended. */
  anchorElement: HTMLElement;
  /** Post ID for deduplication. */
  postId: string;
}

/**
 * SiteAdapter – interface for site-specific DOM interaction.
 *
 * Each adapter knows how to:
 * 1. Find posts in the current page
 * 2. Extract media references from a post
 * 3. Identify where to mount the lens button
 * 4. Observe for new posts (infinite scroll, SPA navigation)
 */
export interface SiteAdapter {
  /** Human-readable name of the site. */
  readonly siteName: string;

  /** URL match patterns this adapter applies to. */
  readonly matchPatterns: string[];

  /**
   * Find all post elements currently in the DOM.
   * TODO: Implement in Phase 4.
   */
  findPosts(): HTMLElement[];

  /**
   * Extract media references from a single post element.
   * TODO: Implement in Phase 4.
   */
  extractMedia(post: HTMLElement): MediaRef | null;

  /**
   * Find the mount point for the lens button in a post.
   * TODO: Implement in Phase 5.
   */
  getMountPoint(post: HTMLElement): MountPoint | null;

  /**
   * Start observing the DOM for new posts.
   * Calls `onNewPosts` when posts are added (scroll, navigation).
   * TODO: Implement in Phase 4.
   */
  observe(onNewPosts: (posts: HTMLElement[]) => void): void;

  /**
   * Stop observing the DOM. Clean up observers.
   * TODO: Implement in Phase 4.
   */
  disconnect(): void;
}

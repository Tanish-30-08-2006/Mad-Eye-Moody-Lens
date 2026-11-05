/**
 * adapters/reddit/selectors.ts – CSS selectors and attribute names for Reddit.
 *
 * ALL Reddit DOM selectors live here. No other file should contain hardcoded
 * Reddit selectors. This makes selector-drift updates a single-file change.
 *
 * Known verified selectors (from PLAN.md):
 * - Post element: <shreddit-post> (NOT <sh-post>)
 * - Feed container: <shreddit-feed>
 * - Posts sit inside <article> elements
 *
 * Known attributes on <shreddit-post>:
 * - post-type: "image" | "gallery" | "video" | "link" | "text" | etc.
 * - content-href: URL to the media content
 * - permalink: relative URL to the post
 * - id: unique post identifier
 * - post-title: title text of the post
 *
 * VERIFY IN PHASE 0: Everything below marked with [UNVERIFIED] must be
 * confirmed in DevTools on live Reddit before relying on it.
 */

// ── Verified selectors ──────────────────────────────────────────────────────

/** The custom element tag for Reddit posts. */
export const POST_TAG = 'shreddit-post';

/** Selector for all post elements in the feed. */
export const POST_SELECTOR = 'shreddit-post';

/** The feed container element. */
export const FEED_SELECTOR = 'shreddit-feed';

/** Posts are wrapped in article elements. */
export const ARTICLE_SELECTOR = 'article';

// ── Known post attributes ───────────────────────────────────────────────────

/** Attribute indicating the post type (image, gallery, video, link, text). */
export const ATTR_POST_TYPE = 'post-type';

/** Attribute with the URL to the post's media content. */
export const ATTR_CONTENT_HREF = 'content-href';

/** Attribute with the post's relative permalink. */
export const ATTR_PERMALINK = 'permalink';

/** Attribute with the unique post ID. */
export const ATTR_POST_ID = 'id';

/** Attribute with the post's title text. */
export const ATTR_POST_TITLE = 'post-title';

// ── [UNVERIFIED] selectors – VERIFY IN PHASE 0 ─────────────────────────────

/**
 * [UNVERIFIED] Selector for image elements within a post.
 * The actual tag/attribute hosting the full-size image URL is unknown.
 */
export const IMAGE_SELECTOR = '[slot="post-media-container"] img';

/**
 * [UNVERIFIED] Selector for gallery navigation/slides within a gallery post.
 * Reddit galleries may use a carousel or <ul> with <li> items.
 */
export const GALLERY_SELECTOR = '[slot="post-media-container"] gallery-carousel';

/**
 * [UNVERIFIED] Selector for video elements within a post.
 * Reddit uses shreddit-player or a <video> tag inside a shadow root.
 */
export const VIDEO_SELECTOR = 'shreddit-player';

/**
 * [UNVERIFIED] Data attribute on search result post units (different markup).
 * v1 does not cover search results.
 */
export const SEARCH_RESULT_SELECTOR = '[data-testid="sdui-post-unit"]';

/**
 * [UNVERIFIED] Selector for the action bar area where the lens button
 * should be mounted (near upvote/comment buttons).
 */
export const ACTION_BAR_SELECTOR = 'shreddit-post-overflow-menu';

/**
 * Marker attribute set on posts that have already been processed.
 * Prevents duplicate lens button injection.
 */
export const PROCESSED_MARKER = 'data-moody-lens';

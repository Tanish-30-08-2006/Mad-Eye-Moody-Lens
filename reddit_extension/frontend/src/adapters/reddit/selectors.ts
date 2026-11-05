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
 * Everything below marked `// UNVERIFIED: confirm in DevTools` is a guess. The
 * extractors parse these defensively and return null on doubt; never rely on them
 * without checking live Reddit.
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

// ── Unverified guesses ──────────────────────────────────────────────────────

// UNVERIFIED: confirm in DevTools
/** Post types we treat as media posts (values of the verified `post-type` attribute). */
export const MEDIA_POST_TYPES = ['image', 'gallery', 'video', 'gif'] as const;

// UNVERIFIED: confirm in DevTools
/** Container that holds the post's media; the lens button is anchored to its top-right. */
export const MEDIA_CONTAINER_SELECTOR = '[slot="post-media-container"]';

// UNVERIFIED: confirm in DevTools
/** Generic image fallback inside a post. */
export const IMAGE_SELECTOR = 'img';

// UNVERIFIED: confirm in DevTools
/** Gallery carousel container; falls back to all <img> in the post when absent. */
export const GALLERY_SELECTOR = 'gallery-carousel';

// UNVERIFIED: confirm in DevTools
/** Custom video player elements. */
export const PLAYER_SELECTOR = 'shreddit-player, shreddit-player-2';

// UNVERIFIED: confirm in DevTools
/** Plain <video> fallback (also matches <video> inside the player). */
export const VIDEO_SELECTOR = 'video';

// UNVERIFIED: confirm in DevTools
/** Attributes on the player element that may hold a media URL. */
export const PLAYER_URL_ATTRS = ['src', 'data-src', 'preview'] as const;

// UNVERIFIED: confirm in DevTools
/** Attribute on the player element that may hold a JSON blob with MP4 renditions. */
export const ATTR_PACKAGED_MEDIA = 'packaged-media-json';

// UNVERIFIED: confirm in DevTools
/** Attributes on <img> that may hold the (lazy-loaded) full image URL, in priority order. */
export const IMG_URL_ATTRS = ['src', 'data-lazy-src', 'data-src'] as const;

// UNVERIFIED: confirm in DevTools
/** Image URL path fragments that mark avatars/emoji/icons rather than post media. */
export const DECORATIVE_IMAGE_PATTERN = /snoovatar|avatar|emoji|icon|award/i;

// UNVERIFIED: confirm in DevTools
/** Comment elements; images inside them get a lens too. */
export const COMMENT_SELECTOR = 'shreddit-comment';

// UNVERIFIED: confirm in DevTools
/** Attributes on a comment that identify it (id and relative permalink). */
export const ATTR_COMMENT_ID = 'thingid';
export const ATTR_COMMENT_PERMALINK = 'permalink';

// UNVERIFIED: confirm in DevTools
/** Images in a comment's own body (nested replies are filtered out in code). */
export const COMMENT_IMAGE_SELECTOR = '[slot="comment"] img, shreddit-comment-media img, faceplate-img img';

// UNVERIFIED: confirm in DevTools
/** Element that holds a post's flair text (used to read "AI" disclosures). */
export const FLAIR_SELECTOR = 'shreddit-post-flair, [slot="post-flair"], faceplate-tracker[source="post_flair"]';

// UNVERIFIED: confirm in DevTools
/** The `post-type` value of a crosspost; its original media is found in the DOM or via the post JSON. */
export const CROSSPOST_TYPE = 'crosspost';

/** Everything the observer watches: posts and comments. */
export const OBSERVED_SELECTOR = `${POST_SELECTOR}, ${COMMENT_SELECTOR}`;

// UNVERIFIED: confirm in DevTools
/** Elements blurred by "blur likely manipulated until clicked" (never the lens itself). */
export const BLUR_TARGET_SELECTOR = 'img, video, shreddit-player, shreddit-player-2';

// UNVERIFIED: confirm in DevTools
/** Search result post markup (different from the feed). v1 does not cover search. */
export const SEARCH_RESULT_SELECTOR = '[data-testid="sdui-post-unit"]';

// UNVERIFIED: confirm in DevTools
/** Pathname pattern of feed-like pages, used only by the markup-drift canary. */
export const FEED_PATH_PATTERN = /^\/(?:(?:hot|new|top|rising|best|popular|all)\/?)?$|^\/r\/[^/]+\/?(?:hot|new|top|rising|best)?\/?$/i;

/**
 * Marker attribute set on posts that have already been processed.
 * Prevents duplicate lens button injection.
 */
export const PROCESSED_MARKER = 'data-moody-lens';

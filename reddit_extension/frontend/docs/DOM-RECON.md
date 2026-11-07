# Moody Lens — Reddit DOM Reconnaissance

> **Version:** 0.1.0-template · **Last updated:** 2026-11-02  
> **Status:** 🔴 TEMPLATE — All DOM fields require manual verification in DevTools  
> **Branch:** `darshan-dev`

---

> [!CAUTION]
> This document is a **template**. The extension agent cannot browse Reddit.  
> Every field marked with `<!-- TODO: fill from DevTools -->` **must** be filled in manually during **Phase 0 recon** using Chrome DevTools on a live Reddit page.  
> **Do NOT fabricate DOM findings.** Incorrect selectors will break the adapter.

---

## How to Use This Template

1. Open Chrome DevTools on `https://www.reddit.com` (logged in and logged out)
2. For each post type section below, find a real example post
3. Right-click the post → Inspect → copy the relevant HTML
4. Fill in every `<!-- TODO -->` placeholder with actual findings
5. Take screenshots and save them to `tests/fixtures/reddit/screenshots/`
6. Save raw HTML fixtures via `scripts/record-fixture.mjs` into `tests/fixtures/reddit/`
7. Mark each section as ✅ Verified when complete

---

## Table of Contents

- [1. Feed Container Structure](#1-feed-container-structure)
- [2. Post Type: Image](#2-post-type-image)
- [3. Post Type: Gallery (Multiple Images)](#3-post-type-gallery-multiple-images)
- [4. Post Type: Video with Audio](#4-post-type-video-with-audio)
- [5. Post Type: Silent Video / GIF](#5-post-type-silent-video--gif)
- [6. Post Type: Crosspost](#6-post-type-crosspost)
- [7. Post Type: Text-Only](#7-post-type-text-only)
- [8. Post Type: Link / Embed](#8-post-type-link--embed)
- [9. Post Type: Removed / Deleted](#9-post-type-removed--deleted)
- [10. Post Type: NSFW (Logged Out)](#10-post-type-nsfw-logged-out)
- [11. SPA Navigation Behavior](#11-spa-navigation-behavior)
- [12. Infinite Scroll Mechanism](#12-infinite-scroll-mechanism)
- [13. Dark Mode](#13-dark-mode)
- [14. Search Results Page](#14-search-results-page)
- [15. Fixture Manifest](#15-fixture-manifest)

---

## 1. Feed Container Structure

> **VERIFY IN PHASE 0**

### Feed Wrapper Element

```html
<!-- TODO: fill from DevTools -->
<!-- Expected: <shreddit-feed> wrapping <article> elements -->
<!-- Paste the outerHTML of the feed container (truncated, first 2 posts) -->
```

**Tag name:** `<shreddit-feed>` (assumed)  
**Selector used:** <!-- TODO: fill from DevTools -->  
**Is it a custom element (web component)?** <!-- TODO: fill from DevTools -->  
**Does it have a shadow root?** <!-- TODO: fill from DevTools -->  

### Article Wrapper

Each post is expected inside an `<article>` element containing a `<shreddit-post>`:

```
<shreddit-feed>
  <article>
    <shreddit-post ...attributes>
      ...
    </shreddit-post>
  </article>
  <article>
    <shreddit-post ...attributes>
      ...
    </shreddit-post>
  </article>
</shreddit-feed>
```

**Verified structure:** <!-- TODO: fill from DevTools -->  
**Any intermediate wrappers between `<article>` and `<shreddit-post>`?** <!-- TODO: fill from DevTools -->

### Attributes on `<shreddit-feed>`

| Attribute | Example Value | Notes |
|-----------|--------------|-------|
| <!-- TODO: fill from DevTools --> | <!-- TODO --> | <!-- TODO --> |

---

## 2. Post Type: Image

> **VERIFY IN PHASE 0**

### Sample outerHTML

```html
<!-- TODO: fill from DevTools -->
<!-- Right-click an image post → Inspect → Copy outerHTML of <shreddit-post> -->
<!-- Truncate very long content but keep all attributes and media elements -->
```

### Attributes on `<shreddit-post>`

| Attribute | Value (example) | Always present? |
|-----------|----------------|-----------------|
| `post-type` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `content-href` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `permalink` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `id` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `post-title` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| <!-- TODO: any other attributes --> | <!-- TODO --> | <!-- TODO --> |

### Media URL Location

- **Where is the image `src`?** <!-- TODO: fill from DevTools -->
- **Tag:** `<img>` / `<picture>` / `<source>` / other? <!-- TODO: fill from DevTools -->
- **Full selector path from `<shreddit-post>` to the image element:** <!-- TODO: fill from DevTools -->
- **Is the URL in an attribute?** `src` / `srcset` / `data-*` / `style` background? <!-- TODO: fill from DevTools -->
- **CDN domain:** `i.redd.it` / `preview.redd.it` / other? <!-- TODO: fill from DevTools -->
- **URL pattern:** <!-- TODO: fill from DevTools -->

### Shadow Root

- **Does `<shreddit-post>` have a shadow root?** <!-- TODO: fill from DevTools -->
- **If yes, is it `open` or `closed`?** <!-- TODO: fill from DevTools -->
- **Is the media element inside the shadow root?** <!-- TODO: fill from DevTools -->

### Child Element Structure

```
<shreddit-post>
  <!-- TODO: fill from DevTools -->
  <!-- Document the DOM tree from shreddit-post down to the media element -->
  <!-- Include class names and notable attributes -->
</shreddit-post>
```

### Media Loading Behavior

- **Lazy loaded?** <!-- TODO: fill from DevTools -->
- **Uses IntersectionObserver?** <!-- TODO: fill from DevTools -->
- **Placeholder/skeleton shown first?** <!-- TODO: fill from DevTools -->
- **Does the `src` attribute exist on initial render or is it set later?** <!-- TODO: fill from DevTools -->

### SPA Navigation Behavior

- **When navigating to/from this post via SPA, is the element replaced or mutated?** <!-- TODO: fill from DevTools -->
- **Is the element removed and re-added to the DOM?** <!-- TODO: fill from DevTools -->

### Screenshots

<!-- TODO: Add screenshots to tests/fixtures/reddit/screenshots/image-post-*.png -->
- Feed view: <!-- TODO -->
- Expanded view: <!-- TODO -->
- DevTools Elements panel: <!-- TODO -->

---

## 3. Post Type: Gallery (Multiple Images)

> **VERIFY IN PHASE 0**

### Sample outerHTML

```html
<!-- TODO: fill from DevTools -->
```

### Attributes on `<shreddit-post>`

| Attribute | Value (example) | Always present? |
|-----------|----------------|-----------------|
| `post-type` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `content-href` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `permalink` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `id` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `post-title` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| <!-- TODO: any other attributes --> | <!-- TODO --> | <!-- TODO --> |

### Media URL Location

- **How are multiple images represented?** <!-- TODO: fill from DevTools -->
  - Carousel / swiper component? <!-- TODO -->
  - Separate `<img>` tags? <!-- TODO -->
  - Data attribute with JSON array? <!-- TODO -->
- **Are all images loaded at once or on-demand (carousel swipe)?** <!-- TODO: fill from DevTools -->
- **Tag and selector for each image:** <!-- TODO: fill from DevTools -->
- **Gallery navigation element (dots, arrows):** <!-- TODO: fill from DevTools -->
- **CDN domain for gallery images:** <!-- TODO: fill from DevTools -->

### Shadow Root

- **Does `<shreddit-post>` have a shadow root?** <!-- TODO: fill from DevTools -->
- **If yes, is it `open` or `closed`?** <!-- TODO: fill from DevTools -->
- **Is the gallery component inside the shadow root?** <!-- TODO: fill from DevTools -->

### Child Element Structure

```
<shreddit-post>
  <!-- TODO: fill from DevTools -->
</shreddit-post>
```

### Media Loading Behavior

- **Are non-visible gallery images lazy loaded?** <!-- TODO: fill from DevTools -->
- **How to get all image URLs without swiping?** <!-- TODO: fill from DevTools -->

### SPA Navigation Behavior

- **Element replaced or mutated?** <!-- TODO: fill from DevTools -->

### Screenshots

<!-- TODO: Add screenshots to tests/fixtures/reddit/screenshots/gallery-post-*.png -->

---

## 4. Post Type: Video with Audio

> **VERIFY IN PHASE 0**

### Sample outerHTML

```html
<!-- TODO: fill from DevTools -->
```

### Attributes on `<shreddit-post>`

| Attribute | Value (example) | Always present? |
|-----------|----------------|-----------------|
| `post-type` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `content-href` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `permalink` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `id` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `post-title` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| <!-- TODO: any other attributes --> | <!-- TODO --> | <!-- TODO --> |

### Media URL Location

- **Video element tag:** `<video>` / `<shreddit-player>` / other? <!-- TODO: fill from DevTools -->
- **Video source type:** Direct MP4 / HLS (.m3u8) / DASH (.mpd) / other? <!-- TODO: fill from DevTools -->
- **Video `src` or `<source>` element selector:** <!-- TODO: fill from DevTools -->
- **Audio track:** Separate URL or combined with video? <!-- TODO: fill from DevTools -->
- **If separate audio URL, where is it?** <!-- TODO: fill from DevTools -->
- **CDN domain:** `v.redd.it` / other? <!-- TODO: fill from DevTools -->
- **URL pattern (e.g., `v.redd.it/{id}/DASH_{resolution}.mp4`):** <!-- TODO: fill from DevTools -->
- **Are multiple resolutions available? How are they listed?** <!-- TODO: fill from DevTools -->

### Shadow Root

- **Does `<shreddit-post>` have a shadow root?** <!-- TODO: fill from DevTools -->
- **Is the video player inside a shadow root?** <!-- TODO: fill from DevTools -->
- **Does the video player itself (`<shreddit-player>`) have its own shadow root?** <!-- TODO: fill from DevTools -->

### Child Element Structure

```
<shreddit-post>
  <!-- TODO: fill from DevTools -->
  <!-- Document path from shreddit-post → video element -->
  <!-- Include any custom player elements -->
</shreddit-post>
```

### Media Loading Behavior

- **Autoplay on scroll?** <!-- TODO: fill from DevTools -->
- **Uses HLS.js or native HLS?** <!-- TODO: fill from DevTools -->
- **Network tab: what requests are made when video plays?** <!-- TODO: fill from DevTools -->
- **Can we get the full video URL without playing it?** <!-- TODO: fill from DevTools -->

### SPA Navigation Behavior

- **Element replaced or mutated?** <!-- TODO: fill from DevTools -->
- **Does video stop/restart on SPA nav?** <!-- TODO: fill from DevTools -->

### Screenshots

<!-- TODO: Add screenshots to tests/fixtures/reddit/screenshots/video-audio-post-*.png -->

---

## 5. Post Type: Silent Video / GIF

> **VERIFY IN PHASE 0**

### Sample outerHTML

```html
<!-- TODO: fill from DevTools -->
```

### Attributes on `<shreddit-post>`

| Attribute | Value (example) | Always present? |
|-----------|----------------|-----------------|
| `post-type` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `content-href` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `permalink` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `id` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `post-title` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| <!-- TODO: any other attributes --> | <!-- TODO --> | <!-- TODO --> |

### Media URL Location

- **Is it a real `.gif` or a silent video (MP4)?** <!-- TODO: fill from DevTools -->
- **Tag:** `<img>` / `<video>` / `<picture>` / other? <!-- TODO: fill from DevTools -->
- **Selector path:** <!-- TODO: fill from DevTools -->
- **Does the `post-type` attribute differ from video-with-audio?** <!-- TODO: fill from DevTools -->
- **Is there an audio track (empty/silent)?** <!-- TODO: fill from DevTools -->

### Shadow Root

- **Does `<shreddit-post>` have a shadow root?** <!-- TODO: fill from DevTools -->

### Child Element Structure

```
<shreddit-post>
  <!-- TODO: fill from DevTools -->
</shreddit-post>
```

### Media Loading Behavior

- **Autoplay + loop?** <!-- TODO: fill from DevTools -->
- **Muted by default?** <!-- TODO: fill from DevTools -->

### SPA Navigation Behavior

- **Element replaced or mutated?** <!-- TODO: fill from DevTools -->

### Screenshots

<!-- TODO: Add screenshots to tests/fixtures/reddit/screenshots/gif-post-*.png -->

---

## 6. Post Type: Crosspost

> **VERIFY IN PHASE 0**

### Sample outerHTML

```html
<!-- TODO: fill from DevTools -->
```

### Attributes on `<shreddit-post>`

| Attribute | Value (example) | Always present? |
|-----------|----------------|-----------------|
| `post-type` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `content-href` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `permalink` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `id` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `post-title` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `crosspost-*` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |

### Crosspost-Specific Questions

- **Is the original post embedded as a nested `<shreddit-post>`?** <!-- TODO: fill from DevTools -->
- **Does the crosspost have its own ID or use the original's?** <!-- TODO: fill from DevTools -->
- **Where is the media — in the outer or inner post element?** <!-- TODO: fill from DevTools -->
- **Are there additional attributes (e.g., `crosspost-id`, `source-*`)?** <!-- TODO: fill from DevTools -->
- **Can we detect it's a crosspost from attributes alone?** <!-- TODO: fill from DevTools -->

### Shadow Root

- **Does `<shreddit-post>` have a shadow root?** <!-- TODO: fill from DevTools -->
- **Does the nested crosspost element have its own shadow root?** <!-- TODO: fill from DevTools -->

### Child Element Structure

```
<shreddit-post>    <!-- outer: crosspost wrapper -->
  <!-- TODO: fill from DevTools -->
  <shreddit-post>  <!-- inner: original post (if nested) -->
    <!-- TODO: fill from DevTools -->
  </shreddit-post>
</shreddit-post>
```

### SPA Navigation Behavior

- **Element replaced or mutated?** <!-- TODO: fill from DevTools -->

### Screenshots

<!-- TODO: Add screenshots to tests/fixtures/reddit/screenshots/crosspost-*.png -->

---

## 7. Post Type: Text-Only

> **VERIFY IN PHASE 0**

### Sample outerHTML

```html
<!-- TODO: fill from DevTools -->
```

### Attributes on `<shreddit-post>`

| Attribute | Value (example) | Always present? |
|-----------|----------------|-----------------|
| `post-type` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `content-href` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `permalink` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `id` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `post-title` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |

### Key Questions

- **What is the `post-type` value for text posts?** <!-- TODO: fill from DevTools -->
- **Can we reliably skip text-only posts using `post-type`?** <!-- TODO: fill from DevTools -->
- **Can a text post contain inline images?** <!-- TODO: fill from DevTools -->
  - If yes, where are they in the DOM? <!-- TODO: fill from DevTools -->

### Shadow Root

- **Does `<shreddit-post>` have a shadow root?** <!-- TODO: fill from DevTools -->

### Child Element Structure

```
<shreddit-post>
  <!-- TODO: fill from DevTools -->
</shreddit-post>
```

### Screenshots

<!-- TODO: Add screenshots to tests/fixtures/reddit/screenshots/text-post-*.png -->

---

## 8. Post Type: Link / Embed

> **VERIFY IN PHASE 0**

### Sample outerHTML

```html
<!-- TODO: fill from DevTools -->
```

### Attributes on `<shreddit-post>`

| Attribute | Value (example) | Always present? |
|-----------|----------------|-----------------|
| `post-type` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `content-href` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `permalink` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `id` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |
| `post-title` | <!-- TODO: fill from DevTools --> | <!-- TODO --> |

### Link/Embed-Specific Questions

- **What `post-type` value is used for link posts?** <!-- TODO: fill from DevTools -->
- **Is there a thumbnail image?** <!-- TODO: fill from DevTools -->
  - If yes, where and what selector? <!-- TODO: fill from DevTools -->
- **Does the link post embed content (e.g., YouTube iframe)?** <!-- TODO: fill from DevTools -->
  - If yes, what container/tag? <!-- TODO: fill from DevTools -->
- **Can we extract the linked URL from attributes?** <!-- TODO: fill from DevTools -->

### Shadow Root

- **Does `<shreddit-post>` have a shadow root?** <!-- TODO: fill from DevTools -->

### Child Element Structure

```
<shreddit-post>
  <!-- TODO: fill from DevTools -->
</shreddit-post>
```

### Screenshots

<!-- TODO: Add screenshots to tests/fixtures/reddit/screenshots/link-post-*.png -->

---

## 9. Post Type: Removed / Deleted

> **VERIFY IN PHASE 0**

### Sample outerHTML

```html
<!-- TODO: fill from DevTools -->
```

### Key Questions

- **Is the `<shreddit-post>` element still in the DOM?** <!-- TODO: fill from DevTools -->
- **What does the element look like?** <!-- TODO: fill from DevTools -->
- **Are attributes still present?** <!-- TODO: fill from DevTools -->
- **Is there a "[removed]" or "[deleted]" text node?** <!-- TODO: fill from DevTools -->
- **Does `post-type` change for removed posts?** <!-- TODO: fill from DevTools -->
- **Can we detect removed/deleted from attributes alone?** <!-- TODO: fill from DevTools -->
- **Is media still accessible via CDN URL even after removal?** <!-- TODO: fill from DevTools -->

### Shadow Root

- **Does `<shreddit-post>` have a shadow root?** <!-- TODO: fill from DevTools -->

### Child Element Structure

```
<shreddit-post>
  <!-- TODO: fill from DevTools -->
</shreddit-post>
```

### Screenshots

<!-- TODO: Add screenshots to tests/fixtures/reddit/screenshots/removed-post-*.png -->

---

## 10. Post Type: NSFW (Logged Out)

> **VERIFY IN PHASE 0**

### Sample outerHTML

```html
<!-- TODO: fill from DevTools -->
```

### Key Questions

- **Is the `<shreddit-post>` element rendered?** <!-- TODO: fill from DevTools -->
- **Is media hidden behind a blur/overlay?** <!-- TODO: fill from DevTools -->
  - If yes, what element creates the overlay? <!-- TODO: fill from DevTools -->
- **Is the media URL still in the DOM (just visually hidden)?** <!-- TODO: fill from DevTools -->
- **Is there an `nsfw` or `over-18` attribute?** <!-- TODO: fill from DevTools -->
- **Is there an interstitial page blocking access?** <!-- TODO: fill from DevTools -->
- **Can the extension bypass the blur (since we're in the content script context)?** <!-- TODO: fill from DevTools -->
- **Is the `content-href` attribute still present?** <!-- TODO: fill from DevTools -->
- **Does `post-type` change for NSFW posts?** <!-- TODO: fill from DevTools -->
- **Does the media load at all (or is it blocked server-side for logged-out users)?** <!-- TODO: fill from DevTools -->

### Shadow Root

- **Does `<shreddit-post>` have a shadow root?** <!-- TODO: fill from DevTools -->

### Child Element Structure

```
<shreddit-post>
  <!-- TODO: fill from DevTools -->
</shreddit-post>
```

### Screenshots

<!-- TODO: Add screenshots to tests/fixtures/reddit/screenshots/nsfw-post-*.png -->

---

## 11. SPA Navigation Behavior

> **VERIFY IN PHASE 0**

### Navigation Events

- **What event fires on SPA navigation?** <!-- TODO: fill from DevTools -->
  - `popstate` / `pushState` / `replaceState` / custom event? <!-- TODO -->
- **How to detect URL change?** <!-- TODO: fill from DevTools -->

### DOM Mutation on Navigation

- **When navigating from feed to single post view:**
  - Is `<shreddit-feed>` removed? <!-- TODO: fill from DevTools -->
  - Is `<shreddit-post>` removed and re-created? <!-- TODO: fill from DevTools -->
  - Or is the same element reused/mutated? <!-- TODO: fill from DevTools -->

- **When navigating back to feed:**
  - Are previous posts re-rendered from scratch? <!-- TODO: fill from DevTools -->
  - Are they cached in DOM? <!-- TODO: fill from DevTools -->

### Tab / Sort Switching

- **When switching between Hot/New/Top/Rising:**
  - Is `<shreddit-feed>` replaced? <!-- TODO: fill from DevTools -->
  - Are individual `<article>` elements removed/added? <!-- TODO: fill from DevTools -->
  - Does the URL change? <!-- TODO: fill from DevTools -->

### Subreddit Navigation

- **When navigating to a different subreddit via SPA:**
  - Full page reload or SPA transition? <!-- TODO: fill from DevTools -->
  - How does the feed element change? <!-- TODO: fill from DevTools -->

### Implications for MutationObserver

- **What `MutationObserver` config is needed?** <!-- TODO: fill from DevTools -->
  - `childList` on what element? <!-- TODO -->
  - `subtree` needed? <!-- TODO -->
  - `attributes` needed for what? <!-- TODO -->

---

## 12. Infinite Scroll Mechanism

> **VERIFY IN PHASE 0**

- **How does Reddit load more posts?** <!-- TODO: fill from DevTools -->
  - IntersectionObserver on a sentinel element? <!-- TODO -->
  - Scroll event listener? <!-- TODO -->
  - `<shreddit-feed>` custom element handles it internally? <!-- TODO -->
- **What element is the scroll sentinel (if any)?** <!-- TODO: fill from DevTools -->
- **Are new `<article>` elements appended to `<shreddit-feed>`?** <!-- TODO: fill from DevTools -->
- **Is there a "page" boundary in the DOM?** <!-- TODO: fill from DevTools -->
- **How many posts are loaded per batch?** <!-- TODO: fill from DevTools -->
- **Can we detect when new posts are loaded?** <!-- TODO: fill from DevTools -->
  - MutationObserver on `<shreddit-feed>` childList? <!-- TODO -->

---

## 13. Dark Mode

> **VERIFY IN PHASE 0**

- **How is dark mode toggled?**
  - Class on `<html>` or `<body>`? <!-- TODO: fill from DevTools -->
  - `data-*` attribute? <!-- TODO: fill from DevTools -->
  - CSS custom properties? <!-- TODO: fill from DevTools -->
  - Media query `prefers-color-scheme`? <!-- TODO: fill from DevTools -->
- **Specific class name or attribute value for dark mode:** <!-- TODO: fill from DevTools -->
- **Does the class/attribute change dynamically (without page reload)?** <!-- TODO: fill from DevTools -->
- **CSS custom property names for background/text colors:** <!-- TODO: fill from DevTools -->

### Implications for Moody Lens UI

- Our shadow root styles need to adapt to dark mode. How will we detect it?
  - Option A: Read the class/attribute from `:host` context
  - Option B: Use `prefers-color-scheme` media query
  - Option C: Both (attribute for Reddit's manual toggle, media query for system)
  - **Selected approach:** <!-- TODO: decide after Phase 0 -->

---

## 14. Search Results Page

> **VERIFY IN PHASE 0**

- **URL pattern for search:** <!-- TODO: fill from DevTools -->
- **Does the search results page use `<shreddit-feed>` and `<shreddit-post>`?** <!-- TODO: fill from DevTools -->
- **Are there any structural differences from the main feed?** <!-- TODO: fill from DevTools -->
- **Are search results rendered with the same attributes?** <!-- TODO: fill from DevTools -->
- **Any additional wrapper elements?** <!-- TODO: fill from DevTools -->

---

## 15. Fixture Manifest

Track which HTML fixtures have been saved for testing:

| Fixture File | Post Type | Source URL | Date Captured | Notes |
|-------------|-----------|-----------|---------------|-------|
| <!-- TODO --> | Image | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| <!-- TODO --> | Gallery | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| <!-- TODO --> | Video (audio) | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| <!-- TODO --> | Video (silent) | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| <!-- TODO --> | GIF | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| <!-- TODO --> | Crosspost | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| <!-- TODO --> | Text-only | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| <!-- TODO --> | Link/Embed | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| <!-- TODO --> | Removed | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| <!-- TODO --> | NSFW (logged out) | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |

### Fixture Recording Script

Use `scripts/record-fixture.mjs` to capture fixtures:

```bash
# Usage (from reddit_extension/frontend/ directory):
node scripts/record-fixture.mjs <reddit-url> <output-name>

# Example:
node scripts/record-fixture.mjs "https://www.reddit.com/r/pics/comments/abc123" image-post-01
```

<!-- TODO: verify record-fixture.mjs exists and works -->

---

## Checklist

- [ ] Section 1: Feed container — verified
- [ ] Section 2: Image post — verified
- [ ] Section 3: Gallery post — verified
- [ ] Section 4: Video with audio — verified
- [ ] Section 5: Silent video / GIF — verified
- [ ] Section 6: Crosspost — verified
- [ ] Section 7: Text-only post — verified
- [ ] Section 8: Link / embed post — verified
- [ ] Section 9: Removed / deleted post — verified
- [ ] Section 10: NSFW post (logged out) — verified
- [ ] Section 11: SPA navigation — verified
- [ ] Section 12: Infinite scroll — verified
- [ ] Section 13: Dark mode — verified
- [ ] Section 14: Search results — verified
- [ ] Section 15: Fixture manifest — all fixtures captured
- [ ] All screenshots captured
- [ ] `record-fixture.mjs` tested and working

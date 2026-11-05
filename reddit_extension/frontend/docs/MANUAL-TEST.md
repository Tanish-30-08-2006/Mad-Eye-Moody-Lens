# Manual test: what to check in real Chrome on real Reddit

Everything below could NOT be verified from the build sandbox. Reddit's inner markup is unverified, so this page is how you confirm it. Budget: about 15 minutes.

**Setup:** `cd frontend && pnpm install && pnpm build`, open `chrome://extensions`, enable Developer mode, **Load unpacked** and choose `frontend/.output/chrome-mv3`. Start a backend (`pnpm mock-server` for demo data, or the real backend). Open the extension **Options**, turn **Debug** on, and keep DevTools Console open on reddit.com.

1. **Lens placement.** Open `https://www.reddit.com/r/pics/` (or any image subreddit). Image posts show a small lens at the top-right of the image; text and link posts show none. If nothing appears, wait 10 s: the console should warn about markup drift. Click a post that is missing its lens and read the Debug dump (see step 11).
2. **Click doesn't navigate.** Click and Tab+Enter on a lens: the post must not open. Check Space too.
3. **First scan and consent.** Click a lens: the popover asks for consent. Click "I agree": spinner, then a verdict. With `pnpm mock-server` the popover and chip must say DEMO DATA / DEMO.
4. **Popover behavior.** Esc, an outside click, and scrolling away then clicking elsewhere all close it. Click a finished lens again: it reopens with no new request (Network tab on the service worker).
5. **Gallery.** Scan a gallery post. Only the first image is scanned (v1 limit). Confirm a verdict appears.
6. **Video with audio.** Scan a v.redd.it video. In the service worker console check the request: a `media` and an `audio` part. With the real backend and ffmpeg the verdict's audio row shows a score; without audio it says "not run".
7. **Silent video / GIF-style post.** Scan one: it must complete, audio "not run".
8. **HLS-only video.** If you find a video with no MP4 candidate, the popover says "Video format not supported yet." (turn on Server fallback and `FEATURE_DETECT_URL` to try Tier 2; Reddit may answer "blocked").
9. **Infinite scroll and navigation.** Scroll 100+ posts: no post gets two lenses, scrolling stays smooth. Click into a post, press Back, switch Hot/New: no duplicate lenses, no stale popover.
10. **Context menu.** Right-click an image and choose "Scan image with Moody Lens": the result shows in the popover. On a tab where the content script isn't running, the toolbar icon shows a short FAKE/REAL badge.
11. **Selector debugging.** With Debug on, clicking a lens logs the post's attribute names, every image/video/audio candidate it found, and the extraction result. Copy that output when a selector needs fixing in `src/adapters/reddit/selectors.ts`.
12. **Options, popup, auto-scan.** Popup shows backend Connected (or Unreachable with a message), DEMO DATA for a mock backend, consent state, and "N posts checked, M with a lens". In Options: a bad URL (`ftp://x`) is rejected; Auto-scan ON makes visible images scan themselves (chip appears with no click, never on video); Clear cache works; stop the backend and confirm a friendly "Can't reach the backend" error with Retry.

**Pass criteria:** steps 1 to 4 and 9 are required; the others depend on what Reddit serves you. Report anything that fails with the Debug output from step 11.

## Phases 8+ checks (new features)

All selectors marked `// UNVERIFIED` must be confirmed in DevTools on a real Reddit page first.

1. Gallery post: lens scans up to 10 images in one request; the popover shows a chip grid.
2. v.redd.it video with sound: the result is not marked "audio not scanned". Silent or failed audio shows that note.
3. Post with no DOM media (e.g. crosspost): the lens still works via the post JSON fallback.
4. Options: change thresholds; labels in the popover change without rescanning.
5. Local-only mode: nothing leaves the browser (check the Network tab); the popover lists metadata hints only.
6. Share row: copy summary, copy as Reddit comment, copy report to mods, download card, "Find source" (note that the image URL is sent).
7. History page (popup, History): search, sort, export CSV/JSON, Clear all.
8. Blur option: likely manipulated real results blur until the lens is clicked; demo data is never blurred.
9. Popup: "Scan visible images" respects the per-minute cap; Brain name and MOCK/REAL show.
10. Keyboard: Alt+Shift+L scans the post nearest the middle of the screen.
11. UI self-check: open docs/ui-preview.html in light and dark mode.

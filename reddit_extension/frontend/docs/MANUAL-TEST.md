# Manual test: what to check in real Chrome on real Reddit

Everything below could NOT be verified from the build sandbox. Reddit's inner markup is unverified, so this page is how you confirm it. Budget: about 15 minutes.

**Setup:** `cd frontend && pnpm install && pnpm build`, open `chrome://extensions`, enable Developer mode, **Load unpacked** and choose `frontend/.output/chrome-mv3`. Start a backend (`pnpm mock-server` for demo data, or the real backend). Open the extension **Options**, turn **Debug** on, and keep DevTools Console open on reddit.com.

1. **Lens placement.** Open `https://www.reddit.com/r/pics/` (or any image subreddit). Image posts show a small lens at the top-right of the image; text and link posts show none. If nothing appears, wait 10 s: the console should warn about markup drift. Click a post that is missing its lens and read the Debug dump (see step 11).
2. **Click doesn't navigate.** Click and Tab+Enter on a lens: the post must not open. Check Space too.
3. **First scan and consent.** Click a lens: the popover asks for consent. Click "I agree": spinner, then a verdict. With `pnpm mock-server` the popover and chip must say DEMO DATA / DEMO.
4. **Popover behavior.** Esc, an outside click, and scrolling away then clicking elsewhere all close it. Click a finished lens again: it reopens with no new request (Network tab on the service worker).
5. **Gallery.** Scan a gallery post. Up to ten available images go through one batch. Confirm the item labels and reverse-search links match the scanned attachments.
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
6. Share row: copy summary, copy as Reddit comment, download card, and "Find source" (the image URL is sent only after clicking a provider).
7. History page (popup, History): search, sort, export CSV/JSON, Clear all.
8. Blur option: likely manipulated real results blur until the lens is clicked; demo data is never blurred.
9. Popup: "Scan visible images" respects the per-minute cap; Brain name and MOCK/REAL show.
10. Keyboard: Alt+Shift+L scans the post nearest the middle of the screen.
11. UI self-check: open docs/ui-preview.html in light and dark mode.

## Reddit verification walkthrough

1. Find a public explicit repost that has a changed title and original flair. Open the Lens before uploading anything; check the source links, attribution and dates against Reddit. Try a removed original, and a normal post linking to Reddit in its body. Scroll or navigate while context loads.
2. In **Copy with context**, check the excerpt and independently copy the permalink. Try the button beside native Share if present; verify native Share and Repost still open. If a write fails, select the preview manually. A recognized repost composer shows an excerpt to paste; do not submit any post.
3. Open an image, then a different Reddit post displaying the identical image bytes. Check **Possible earlier match** identifies the earlier observation, and use an unrelated image as a control. Try **Find source** for a compressed reupload if you are comfortable sharing that image URL with the selected search provider.
4. Open the composer and switch between two communities with different rules. Confirm the panel follows the active selection and that native flair choices stay intact. Select a supported attachment, decline upload once, then optionally confirm an upload to the displayed local backend. Replace the attachment and verify the result disappears. Prepare, edit and copy a disclosure without altering the Reddit draft.
5. In Options, add a participating community. Open a scan result there and choose **Prepare review note**. Review the correct gallery number or measured video range, edit the note, and copy it. No submission should appear in Reddit. Compare against a demo or unavailable scan; the note should keep useful source and community context, with no detector finding.
6. Shut down inference or configure a test backend that returns 503. Repeat source, sharing, rule and review steps. Use Tab/Shift+Tab, visible focus, Escape, and outside click. Check the popover and composer at phone width in light and dark themes.

Use the built-extension Playwright fixture walkthrough for repeatable local coverage. Fixture results with a real-shaped contract exercise presentation only. Live Reddit can change account access, custom elements and which JSON is readable. A signed-out challenge page does not verify a composer, native control, or Reddit Data API response.

The 2026-11-16 run loaded the built MV3 extension in Chromium and exercised these flows with intercepted Reddit pages, a demo server, and a separate real-shaped gallery response. The fixture also tested unavailable inference, draft preservation, keyboard focus, Escape, outside-click dismissal, both color schemes, and a narrow viewport. The live signed-out Reddit attempt reached a human verification page, so the current live Reddit selectors and session JSON access still need a signed-in smoke test.

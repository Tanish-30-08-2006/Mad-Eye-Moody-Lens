(() => {
  const CONTROLLER_KEY = "__detectionStudioScannerV113";
  try {
    globalThis[CONTROLLER_KEY]?.dispose?.();
    document.querySelectorAll('.ds-video-badge, .ds-image-badge').forEach(b => b.remove());
  } catch (_) {}

  const PRESETS = {
    standard: { width: 220, height: 140, area: 28000, minNatural: 80, label: "Standard · 220 × 140" },
    large: { width: 320, height: 200, area: 64000, minNatural: 120, label: "Large · 320 × 200" },
    xlarge: { width: 480, height: 300, area: 144000, minNatural: 180, label: "Extra large · 480 × 300" }
  };
  const MAX_CONCURRENT = 2;
  const MAX_BADGES = 60;
  const MIN_VISIBLE_WIDTH = 120;
  const MIN_VISIBLE_HEIGHT = 72;
  const MIN_VISIBLE_FRACTION = 0.06;
  const X_MEDIA_SELECTOR = '[data-testid="tweetPhoto"], [data-testid="card.wrapper"]';
  const isX = /(^|\.)((x\.com)|(twitter\.com))$/i.test(location.hostname);
  const isTikTok = /(^|\.)tiktok\.com$/i.test(location.hostname);
  const isFacebook = /(^|\.)(facebook\.com|fb\.watch)$/i.test(location.hostname);

  let thresholdName = "standard";
  let activeProviderName = "bitmind";
  let activeVideoProviderName = "bitmind";
  let activeProviderVersion = "0";
  let imageProviderConfigured = true;
  let videoProviderConfigured = true;
  let imageReadinessState = "unverified";
  let videoReadinessState = "unverified";
  let imageScanEnabled = false;
  let videoScanEnabled = true;
  let enabled = false;
  let scanGeneration = 0;
  let intersectionObserver = null;
  let mutationObserver = null;
  let resizeObserver = null;
  let observed = new WeakSet();
  let observedVideos = new WeakSet();
  let scanRoots = new Set();
  let scanScheduled = false;
  let activeRequests = 0;
  let activeVideoRequests = 0;
  const MAX_CONCURRENT_VIDEOS = 1;
  const MIN_VIDEO_WIDTH = 140;
  const MIN_VIDEO_HEIGHT = 80;
  let positionFrame = 0;
  let statsTimer = null;
  const queue = [];
  const videoQueue = [];
  const jobsByUrl = new Map();
  const videoJobsBySource = new Map();
  let states = new WeakMap();
  let videoStates = new WeakMap();
  const overlays = new Map();
  const videoOverlays = new Map();

  // Precise single-indicator tracking per video element & player container
  let videoSeq = 0;
  const permanentlyObservedVideos = new WeakSet();
  const videoToBadge = new WeakMap();
  const containerToVideo = new WeakMap();

  const stats = {
    platform: isX ? "X/Twitter" : location.hostname,
    found: 0,
    tweetImagesFound: 0,
    postMediaCandidates: 0,
    sizePassed: 0,
    eligible: 0,
    visibilityRejected: 0,
    skippedBySize: 0,
    skippedByContext: 0,
    missingSource: 0,
    queued: 0,
    submitted: 0,
    completed: 0,
    cachedOrDeduped: 0,
    errors: 0,
    lastError: "",
    lastScanAt: 0,
    sample: "",
    rejectReasons: { renderedTooSmall: 0, sourceTooSmall: 0, aspectRatio: 0, hidden: 0, noGeometry: 0, imageNotReady: 0 }
  };

  const preset = () => PRESETS[thresholdName] || PRESETS.standard;

  // Frame-bounded layout cache: caches getBoundingClientRect() queries within a single animation
  // frame or tick to avoid repeated synchronous reflows across candidates and video player trees.
  let layoutRectCache = new WeakMap();
  let cachedConnectedVideos = null;
  let layoutCacheFrameScheduled = false;

  function clearLayoutCache() {
    layoutRectCache = new WeakMap();
    cachedConnectedVideos = null;
    layoutCacheFrameScheduled = false;
  }

  function scheduleLayoutCacheClear() {
    if (layoutCacheFrameScheduled) return;
    layoutCacheFrameScheduled = true;
    const clear = () => clearLayoutCache();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(clear);
    } else {
      setTimeout(clear, 16);
    }
  }

  function getCachedRect(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    let r = layoutRectCache.get(el);
    if (r) return r;
    const raw = el.getBoundingClientRect();
    r = { left: raw.left, top: raw.top, right: raw.right, bottom: raw.bottom, width: raw.width, height: raw.height };
    layoutRectCache.set(el, r);
    scheduleLayoutCacheClear();
    return r;
  }

  function getConnectedVideos() {
    if (cachedConnectedVideos !== null) return cachedConnectedVideos;
    cachedConnectedVideos = typeof document !== 'undefined' && document.querySelectorAll
      ? Array.from(document.querySelectorAll('video')).filter(v => v.isConnected)
      : [];
    scheduleLayoutCacheClear();
    return cachedConnectedVideos;
  }

  function isVideoRelatedElement(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el instanceof HTMLVideoElement) return true;
    const videoSelectors = 'video, [data-testid*="video" i], [data-testid*="player" i], .video-player, .html5-video-player, video-player, .video-stream, ytd-player, ytd-thumbnail, ytd-video-preview, ytd-inline-preview-player, ytd-rich-grid-media, ytd-compact-video-renderer, ytd-reel-video-renderer, .ytp-cued-thumbnail-overlay, .ytp-videowall-still, [class*="video-player" i], [class*="media-player" i], [class*="videoplayer" i], [class*="video-container" i]';
    if (el.matches?.(videoSelectors)) return true;
    if (el.querySelector?.('video')) return true;
    if (el.closest?.(videoSelectors)) return true;

    // Geometric bounding rect check against connected videos using frame-cached geometry
    const videos = getConnectedVideos();
    if (videos.length) {
      const elRect = getCachedRect(el);
      if (elRect && elRect.width > 0 && elRect.height > 0) {
        for (const v of videos) {
          if (!v.isConnected) continue;
          const vRect = getCachedRect(v);
          if (!vRect || vRect.width <= 0 || vRect.height <= 0) continue;
          const left = Math.max(elRect.left, vRect.left);
          const top = Math.max(elRect.top, vRect.top);
          const right = Math.min(elRect.right, vRect.right);
          const bottom = Math.min(elRect.bottom, vRect.bottom);
          if (right > left && bottom > top) {
            const intersection = (right - left) * (bottom - top);
            const elArea = elRect.width * elRect.height;
            const vArea = vRect.width * vRect.height;
            if (elArea > 0 && (intersection / elArea > 0.25 || intersection / vArea > 0.25)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  const isMediaContainer = el => isX && el instanceof Element && el.matches(X_MEDIA_SELECTOR) && !el.querySelector('video');
  const mediaContainerFor = el => isX && el instanceof Element ? el.closest(X_MEDIA_SELECTOR) : null;
  const postRoot = el => el?.closest?.('article, [data-testid="tweet"]') || null;

  function getImageChild(container) {
    if (!(container instanceof Element)) return null;
    const images = [...container.querySelectorAll('img')];
    if (!images.length) return null;
    return images.find(img => imageSource(img)) || images[0];
  }

  function imageSource(img) {
    if (!(img instanceof HTMLImageElement)) return "";
    return img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || "";
  }

  function backgroundImageUrl(el) {
    if (!(el instanceof Element)) return "";
    const value = getComputedStyle(el).backgroundImage || "";
    const match = value.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/i);
    return match?.[1] || "";
  }

  function sourceOf(candidate) {
    if (candidate instanceof HTMLImageElement) return imageSource(candidate);
    const child = getImageChild(candidate);
    const childUrl = child ? imageSource(child) : "";
    if (childUrl) return childUrl;
    const ownBg = backgroundImageUrl(candidate);
    if (ownBg) return ownBg;
    for (const node of candidate.querySelectorAll('*')) {
      const bg = backgroundImageUrl(node);
      if (bg) return bg;
    }
    return "";
  }

  function rectOf(el) {
    const r = getCachedRect(el);
    return r || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  // X sometimes gives its child IMG a tiny/hidden layout box while the visible
  // tweetPhoto container owns the real rendered dimensions. Always compare both.
  function imageRect(candidate) {
    const own = rectOf(candidate);
    if (isX) {
      const media = isMediaContainer(candidate) ? candidate : mediaContainerFor(candidate);
      if (media) {
        const wrapper = rectOf(media);
        const ownArea = Math.max(0, own.width) * Math.max(0, own.height);
        const wrapperArea = Math.max(0, wrapper.width) * Math.max(0, wrapper.height);
        if (wrapper.width > 1 && wrapper.height > 1 && wrapperArea > ownArea * 1.05) return wrapper;
      }
    }
    return own;
  }

  function visibleRect(candidate) {
    if (!candidate?.isConnected) return null;
    const r = imageRect(candidate);
    if (r.width <= 0 || r.height <= 0) return null;
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    const right = Math.min(innerWidth, r.right);
    const bottom = Math.min(innerHeight, r.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    if (!width || !height) return null;
    return { left, top, right, bottom, width, height, fraction: (width * height) / (r.width * r.height), full: r };
  }

  function hasHiddenLayout(candidate) {
    // Don't reject opacity:0 on the child IMG. X uses fade/placeholder layers;
    // the tweetPhoto parent can still be the visible media surface.
    let node = candidate;
    const media = mediaContainerFor(candidate);
    if (media) node = media;
    while (node && node instanceof Element) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden') return true;
      if (node === document.body) break;
      node = node.parentElement;
    }
    return false;
  }

  function sampleFor(candidate, reason) {
    const r = imageRect(candidate);
    const media = mediaContainerFor(candidate) || (isMediaContainer(candidate) ? candidate : null);
    const mr = media ? rectOf(media) : null;
    const child = candidate instanceof HTMLImageElement ? candidate : getImageChild(candidate);
    const natural = child ? `${child.naturalWidth}×${child.naturalHeight}` : 'n/a';
    const own = rectOf(candidate);
    const url = sourceOf(candidate);
    let host = '';
    try { host = url ? new URL(url).hostname : 'no image URL'; } catch (_) {}
    return `${reason}; node=${candidate.tagName.toLowerCase()}; box=${Math.round(r.width)}×${Math.round(r.height)}; own=${Math.round(own.width)}×${Math.round(own.height)}; media=${mr ? `${Math.round(mr.width)}×${Math.round(mr.height)}` : 'n/a'}; natural=${natural}; ${host}`;
  }

  function sizeCheck(candidate) {
    const p = preset();
    const r = imageRect(candidate);
    if (!r.width || !r.height) return { ok: false, reason: 'noGeometry' };
    if (r.width < p.width || r.height < p.height || r.width * r.height < p.area) {
      return { ok: false, reason: 'renderedTooSmall', detail: `rendered ${Math.round(r.width)}×${Math.round(r.height)}` };
    }
    const child = candidate instanceof HTMLImageElement ? candidate : getImageChild(candidate);
    // A CSS-sized placeholder can look large even while its underlying image is
    // still loading (or has failed). Do not send those zero-dimension sources to
    // an API; the registered load handler will queue the candidate after decode.
    if (child && (!child.complete || child.naturalWidth <= 0 || child.naturalHeight <= 0)) {
      return { ok: false, reason: 'imageNotReady', detail: `image not loaded (${child.naturalWidth}×${child.naturalHeight})` };
    }
    if (child && Math.min(child.naturalWidth, child.naturalHeight) < p.minNatural) {
      return { ok: false, reason: 'sourceTooSmall', detail: `source ${child.naturalWidth}×${child.naturalHeight}` };
    }
    const ratio = r.width / r.height;
    if (ratio < 0.18 || ratio > 5.0) return { ok: false, reason: 'aspectRatio', detail: `aspect ${ratio.toFixed(2)}` };
    if (hasHiddenLayout(candidate)) return { ok: false, reason: 'hidden', detail: 'hidden layout' };
    return { ok: true, rect: r };
  }

  function visibleCheck(candidate) {
    const v = visibleRect(candidate);
    if (!v) return { ok: false, reason: 'outside viewport' };
    if (v.width < MIN_VISIBLE_WIDTH || v.height < MIN_VISIBLE_HEIGHT || v.fraction < MIN_VISIBLE_FRACTION) {
      return { ok: false, reason: `visible ${Math.round(v.width)}×${Math.round(v.height)} (${Math.round(v.fraction * 100)}%)` };
    }
    return { ok: true, rect: v };
  }

  function reportStats() {
    if (statsTimer) return;
    statsTimer = setTimeout(() => {
      statsTimer = null;
      chrome.runtime.sendMessage({ type: 'SCAN_DIAGNOSTICS', stats: { ...stats, rejectReasons: { ...stats.rejectReasons }, threshold: preset().label, thresholdName } }).catch(() => {});
    }, 300);
  }

  function makeBadge() {
    const badge = document.createElement('div');
    badge.className = 'ds-image-badge ds-loading';
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = '<span class="ds-spinner"></span><span>Checking</span>';
    (document.documentElement || document.body).appendChild(badge);
    return badge;
  }

  function getBadge(candidate) {
    let badge = overlays.get(candidate);
    if (!badge) {
      badge = makeBadge();
      overlays.set(candidate, badge);
      while (overlays.size > MAX_BADGES) {
        const oldest = overlays.keys().next().value;
        overlays.get(oldest)?.remove();
        overlays.delete(oldest);
        states.delete(oldest);
      }
    }
    return badge;
  }

  function positionBadge(candidate, badge) {
    if (isVideoRelatedElement(candidate)) {
      badge.remove();
      overlays.delete(candidate);
      states.delete(candidate);
      return;
    }
    const v = visibleRect(candidate);
    if (!v || v.width < MIN_VISIBLE_WIDTH || v.height < 28) { badge.style.display = 'none'; return; }
    const width = badge.offsetWidth;
    const height = badge.offsetHeight;
    if (v.width < width + 8 || v.height < height + 8) { badge.style.display = 'none'; return; }
    const targetLeft = Math.round(v.right - width - 6);
    const targetTop = Math.round(v.top + 6);

    // Suppress image badge if a video badge is already in the same vicinity
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      for (const vb of document.querySelectorAll('.ds-video-badge')) {
        if (vb.style.display === 'none') continue;
        const vbRect = getCachedRect(vb);
        if (vbRect && Math.abs(targetLeft - vbRect.left) < 70 && Math.abs(targetTop - vbRect.top) < 35) {
          badge.style.display = 'none';
          return;
        }
      }
    }

    badge.style.display = 'inline-flex';
    badge.style.left = `${targetLeft}px`;
    badge.style.top = `${targetTop}px`;
  }

  function setBadge(candidate, kind, label, tooltip) {
    const badge = getBadge(candidate);
    badge.className = `ds-image-badge ds-${kind}`;
    badge.replaceChildren();
    if (kind === 'loading') {
      const spinner = document.createElement('span');
      spinner.className = 'ds-spinner';
      badge.appendChild(spinner);
    }
    const text = document.createElement('span');
    text.textContent = label;
    badge.appendChild(text);
    badge.title = tooltip || label;
    positionBadge(candidate, badge);
  }

  function removeBadge(candidate) { overlays.get(candidate)?.remove(); overlays.delete(candidate); }

  function isBitMindSupportedVideoUrl(urlStr) {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();
      if (/(^|\.)((x\.com)|(twitter\.com))$/i.test(host)) return true;
      if (/(^|\.)tiktok\.com$/i.test(host)) return true;
      if (/(^|\.)(facebook\.com|fb\.watch)$/i.test(host)) return true;
      const path = parsed.pathname.toLowerCase();
      if (/\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/i.test(path)) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function videoSourceOf(video) {
    if (!(video instanceof HTMLVideoElement)) return "";
    const src = video.currentSrc || video.src || video.querySelector("source")?.src || video.getAttribute("data-src") || "";
    if (src && !src.startsWith("blob:") && !src.startsWith("data:")) return src;
    if (isX) {
      const tweet = postRoot(video);
      const link = tweet?.querySelector('a[href*="/status/"]')?.href;
      if (link) return link;
    }
    return src || location.href;
  }

  function videoVisibleRect(video) {
    if (!video?.isConnected) return null;
    const r = rectOf(video);
    if (r.width <= 0 || r.height <= 0) return null;
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    const right = Math.min(innerWidth, r.right);
    const bottom = Math.min(innerHeight, r.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    if (!width || !height) return null;
    return { left, top, right, bottom, width, height, fraction: (width * height) / (r.width * r.height), full: r };
  }

  function videoCheck(video) {
    if (!(video instanceof HTMLVideoElement)) return { ok: false, reason: "notVideo" };
    const r = rectOf(video);
    if (r.width < MIN_VIDEO_WIDTH || r.height < MIN_VIDEO_HEIGHT) {
      return { ok: false, reason: "renderedTooSmall", detail: `video rendered ${Math.round(r.width)}×${Math.round(r.height)}` };
    }
    if (hasHiddenLayout(video)) return { ok: false, reason: "hidden", detail: "hidden video" };
    const v = videoVisibleRect(video);
    if (!v || v.fraction < MIN_VISIBLE_FRACTION) return { ok: false, reason: "outsideViewport" };
    return { ok: true, rect: r, visible: v };
  }

  function videoContainerFor(video) {
    if (!video || !(video instanceof Element)) return null;
    const player = video.closest('[data-testid="videoComponent"], [data-testid="videoPlayer"], [data-testid="card.wrapper"], .html5-video-player, video-player, .player-container, .video-container');
    if (player && player !== document.body && player !== document.documentElement) return player;
    return null;
  }

  function removeConflictingImageBadges(video) {
    if (!video) return;
    const vRect = getCachedRect(video);
    const container = videoContainerFor(video) || video.parentElement;
    for (const [candidate, badge] of overlays) {
      let conflict = false;
      if (
        candidate === video ||
        candidate.contains(video) ||
        video.contains(candidate) ||
        (container && (candidate === container || container.contains(candidate) || candidate.contains(container))) ||
        isVideoRelatedElement(candidate)
      ) {
        conflict = true;
      } else if (vRect) {
        const cRect = getCachedRect(candidate);
        if (cRect) {
          const left = Math.max(cRect.left, vRect.left);
          const top = Math.max(cRect.top, vRect.top);
          const right = Math.min(cRect.right, vRect.right);
          const bottom = Math.min(cRect.bottom, vRect.bottom);
          if (right > left && bottom > top) {
            const area = (right - left) * (bottom - top);
            const cArea = cRect.width * cRect.height;
            if (cArea > 0 && area / cArea > 0.2) conflict = true;
          }
        }
      }
      if (conflict) {
        badge.remove();
        overlays.delete(candidate);
        states.delete(candidate);
      }
    }
  }

  function makeVideoBadge(videoId) {
    const badge = document.createElement("div");
    badge.className = "ds-video-badge ds-loading";
    badge.setAttribute("aria-hidden", "true");
    badge.dataset.dsBadge = "true";
    if (videoId) badge.dataset.dsTargetVideoId = videoId;
    badge.innerHTML = '<span class="ds-spinner"></span><span class="ds-text">Checking Video</span>';
    (document.documentElement || document.body).appendChild(badge);
    return badge;
  }

  function getVideoBadge(video) {
    if (!video || !(video instanceof HTMLVideoElement)) return null;

    // 1. WeakMap lookup for instantaneous memory-safe access
    let badge = videoToBadge.get(video);
    if (badge && badge.isConnected) {
      return badge;
    }

    // 2. Map lookup
    badge = videoOverlays.get(video);
    if (badge && badge.isConnected) {
      videoToBadge.set(video, badge);
      return badge;
    }

    // 3. Ensure a persistent unique tracking ID on the video element
    if (!video.dataset.dsVideoId) {
      video.dataset.dsVideoId = `vid-${++videoSeq}-${Date.now().toString(36)}`;
    }
    const videoId = video.dataset.dsVideoId;

    // 4. Query DOM to check if a banner already exists for this video
    const existingDomBadge = document.querySelector(`.ds-video-badge[data-ds-target-video-id="${videoId}"]`);
    if (existingDomBadge && existingDomBadge.isConnected) {
      videoToBadge.set(video, existingDomBadge);
      videoOverlays.set(video, existingDomBadge);
      return existingDomBadge;
    }

    // 5. Container-level single banner enforcement:
    // If a parent video player container already has an active badge, reuse it for this video
    const container = videoContainerFor(video);
    if (container) {
      const activeVideo = containerToVideo.get(container);
      if (activeVideo && activeVideo !== video) {
        const existingBadge = videoToBadge.get(activeVideo) || videoOverlays.get(activeVideo);
        if (existingBadge && existingBadge.isConnected) {
          videoToBadge.delete(activeVideo);
          videoOverlays.delete(activeVideo);
          videoToBadge.set(video, existingBadge);
          videoOverlays.set(video, existingBadge);
          containerToVideo.set(container, video);
          existingBadge.dataset.dsTargetVideoId = videoId;
          return existingBadge;
        }
      }
    }

    // 6. Purge any stray/orphan badges matching this video ID in the DOM before creating one
    document.querySelectorAll(`.ds-video-badge[data-ds-target-video-id="${videoId}"]`).forEach(b => b.remove());

    // 7. Create exactly one new badge
    badge = makeVideoBadge(videoId);
    videoToBadge.set(video, badge);
    videoOverlays.set(video, badge);
    if (container) containerToVideo.set(container, video);

    // 8. Clean up oldest entries if exceeding MAX_BADGES
    while (videoOverlays.size > MAX_BADGES) {
      const oldest = videoOverlays.keys().next().value;
      removeVideoBadge(oldest);
    }

    // 9. Remove any conflicting image badges on this video's container
    removeConflictingImageBadges(video);

    return badge;
  }

  function positionVideoBadge(video, badge) {
    const v = videoVisibleRect(video);
    if (!v || v.width < MIN_VIDEO_WIDTH || v.height < MIN_VIDEO_HEIGHT) {
      badge.style.display = "none";
      return;
    }
    badge.style.display = "inline-flex";
    const width = badge.offsetWidth;
    const height = badge.offsetHeight;
    if (v.width < width + 8 || v.height < height + 8) {
      badge.style.display = "none";
      return;
    }
    const targetLeft = Math.round(v.right - width - 8);
    const targetTop = Math.round(v.top + 8);
    badge.style.left = `${targetLeft}px`;
    badge.style.top = `${targetTop}px`;

    // Purge any conflicting image badges in the top-right corner of this video
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      for (const ib of document.querySelectorAll('.ds-image-badge')) {
        const ibRect = getCachedRect(ib);
        if (ibRect && Math.abs(targetLeft - ibRect.left) < 90 && Math.abs(targetTop - ibRect.top) < 45) {
          ib.remove();
        }
      }
    }
  }

  function setVideoBadge(video, kind, label, tooltip) {
    if (!video || !video.isConnected) return;
    const badge = getVideoBadge(video);
    if (!badge) return;

    badge.className = `ds-video-badge ds-${kind}`;
    badge.title = tooltip || label;

    let spinner = badge.querySelector('.ds-spinner');
    let text = badge.querySelector('.ds-text');

    if (!text) {
      badge.replaceChildren();
      if (kind === 'loading') {
        spinner = document.createElement('span');
        spinner.className = 'ds-spinner';
        badge.appendChild(spinner);
      }
      text = document.createElement('span');
      text.className = 'ds-text';
      text.textContent = label;
      badge.appendChild(text);
    } else {
      if (kind === 'loading') {
        if (!spinner) {
          spinner = document.createElement('span');
          spinner.className = 'ds-spinner';
          badge.insertBefore(spinner, text);
        }
      } else if (spinner) {
        spinner.remove();
      }
      text.textContent = label;
    }

    removeConflictingImageBadges(video);
    positionVideoBadge(video, badge);
  }

  function removeVideoBadge(video) {
    if (!video) return;
    const badge = videoToBadge.get(video) || videoOverlays.get(video);
    if (badge) {
      badge.remove();
    }
    if (video.dataset?.dsVideoId) {
      document.querySelectorAll(`.ds-video-badge[data-ds-target-video-id="${video.dataset.dsVideoId}"]`).forEach(b => b.remove());
    }
    videoToBadge.delete(video);
    videoOverlays.delete(video);
    videoStates.delete(video);
    const container = videoContainerFor(video);
    if (container && containerToVideo.get(container) === video) {
      containerToVideo.delete(container);
    }
  }

  function captureVideoFrame(video) {
    if (!(video instanceof HTMLVideoElement) || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(video.videoWidth, 640);
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * canvas.width);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch (_) {
      return null;
    }
  }

  function queueVideoCandidate(video) {
    if (!enabled || !videoScanEnabled || !video?.isConnected) return;
    const check = videoCheck(video);
    if (!check.ok) return;

    const source = videoSourceOf(video);
    if (!source) return;

    if (videoReadinessState === "not_configured") {
      setVideoBadge(video, "not-configured", "Provider Not Configured", "Configure your video provider API key in Settings → Providers to enable video detection.");
      videoStates.set(video, { source, status: "not-configured" });
      return;
    }
    if (videoReadinessState === "invalid") {
      setVideoBadge(video, "not-configured", "Invalid API Key", "Video provider credentials failed validation. Update in Settings → Providers.");
      videoStates.set(video, { source, status: "invalid-key" });
      return;
    }

    if (activeVideoProviderName === "bitmind") {
      const supported = isBitMindSupportedVideoUrl(source) || isX || isTikTok || isFacebook;
      if (!supported) {
        setVideoBadge(video, "unsupported", "BitMind Unsupported", "BitMind video detection only supports X/Twitter, TikTok, Facebook URLs, and uploaded files. Switch provider to ZeroTrue.");
        videoStates.set(video, { source, status: "unsupported" });
        return;
      }
    }

    const current = videoStates.get(video);
    if (current && ["queued", "running", "done"].includes(current.status)) {
      if (current.source === source) return;
      if (current.status === "running") return;
    }

    let job = videoJobsBySource.get(source);
    if (job) {
      job.targets.add(video);
      videoStates.set(video, { source, status: job.status });
      if (job.status === "queued") setVideoBadge(video, "queued", "Queued", "Waiting for video detection slot.");
      else if (job.status === "running") setVideoBadge(video, "loading", "Checking Video", "Analyzing video for deepfake artifacts.");
      else if (job.result) applyVideoResult(video, source, job.result);
      return;
    }

    job = { source, targets: new Set([video]), status: "queued", result: null };
    videoJobsBySource.set(source, job);
    videoQueue.push(job);
    videoStates.set(video, { source, status: "queued" });
    setVideoBadge(video, "queued", "Queued", "Waiting for video detection slot.");
    pumpVideoQueue();
  }

  function applyVideoResult(video, source, result) {
    if (!enabled || !videoScanEnabled || !video.isConnected) return;
    const check = videoCheck(video);
    if (!check.ok) { removeVideoBadge(video); return; }
    if (!result?.ok) {
      const message = result?.error || "Video detection failed.";
      setVideoBadge(video, "error", "Error", message);
      videoStates.set(video, { source, status: "error", error: message });
      return;
    }
    const data = result.data;
    const rawConf = data?.confidence;
    const conf = Number.isFinite(Number(rawConf)) ? (Number(rawConf) <= 1 ? Number(rawConf) : Number(rawConf) / 100) : NaN;
    const pct = Number.isFinite(conf) ? `${Math.round(conf * 100)}%` : "";

    if (data?.isAI === true) {
      setVideoBadge(video, "ai", `AI VIDEO ${pct}`, `The selected provider classified this video as likely AI-generated (${pct}).`);
    } else if (data?.isAI === false && (data?.verdict === "uncertain" || (Number.isFinite(conf) && conf < 0.60))) {
      setVideoBadge(video, "uncertain", `UNCERTAIN ${pct}`, "Low-confidence video verdict. Open Mad-Eye Moody Lens for detailed inspection.");
    } else if (data?.isAI === false) {
      setVideoBadge(video, "real", `NOT AI ${pct}`, `The selected provider did not find deepfake signatures (${pct}).`);
    } else {
      setVideoBadge(video, "uncertain", `INCONCLUSIVE`, "Video verdict inconclusive. Open side panel for details.");
    }
    videoStates.set(video, { source, status: "done", result: data });
  }

  async function processVideoJob(job) {
    const generation = scanGeneration;
    const targets = [...job.targets].filter(v => v.isConnected && videoCheck(v).ok);
    if (!enabled || !videoScanEnabled || !targets.length) {
      for (const v of job.targets) {
        const s = videoStates.get(v);
        if (s?.source === job.source && s.status === "queued") videoStates.delete(v);
        removeVideoBadge(v);
      }
      videoJobsBySource.delete(job.source);
      return;
    }

    job.status = "running";
    for (const v of targets) {
      videoStates.set(v, { source: job.source, status: "running" });
      setVideoBadge(v, "loading", "Checking Video", "Analyzing video for deepfake artifacts.");
    }

    try {
      const videoEl = targets[0];
      const capturedFrame = captureVideoFrame(videoEl);
      const frames = capturedFrame ? [{ timestamp: videoEl.currentTime || 0, dataUri: capturedFrame }] : [];
      const payload = {
        videoUrl: job.source.startsWith("http") ? job.source : location.href,
        frames,
        scanType: "auto_scan",
        provider: activeVideoProviderName
      };

      const result = await chrome.runtime.sendMessage({ type: "SCAN_VIDEO", payload });
      if (!result?.ok) throw new Error(result?.error || "Video detection failed.");

      job.result = result;
      job.status = "done";
      if (enabled && generation === scanGeneration) {
        for (const v of job.targets) applyVideoResult(v, job.source, result);
      }
    } catch (err) {
      const msg = err?.message || "Unknown video detection error.";
      if (enabled && generation === scanGeneration) {
        for (const v of job.targets) {
          if (!v.isConnected) continue;
          setVideoBadge(v, "error", "Error", msg);
          videoStates.set(v, { source: job.source, status: "error", error: msg });
        }
      }
    } finally {
      if (videoJobsBySource.get(job.source) === job) videoJobsBySource.delete(job.source);
    }
  }

  function pumpVideoQueue() {
    while (enabled && videoScanEnabled && activeVideoRequests < MAX_CONCURRENT_VIDEOS && videoQueue.length) {
      const job = videoQueue.shift();
      if (!job || videoJobsBySource.get(job.source) !== job) continue;
      activeVideoRequests++;
      processVideoJob(job).finally(() => {
        activeVideoRequests--;
        pumpVideoQueue();
      });
    }
  }

  function onVideoDataLoaded(e) {
    if (e.target instanceof HTMLVideoElement) queueVideoCandidate(e.target);
  }
  function onVideoPlay(e) {
    if (e.target instanceof HTMLVideoElement) queueVideoCandidate(e.target);
  }
  function onVideoError(e) {
    if (e.target instanceof HTMLVideoElement) removeVideoBadge(e.target);
  }

  function observeVideoCandidate(video) {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) return;

    if (!permanentlyObservedVideos.has(video)) {
      permanentlyObservedVideos.add(video);
      video.addEventListener("loadeddata", onVideoDataLoaded, { passive: true });
      video.addEventListener("play", onVideoPlay, { passive: true });
      video.addEventListener("error", onVideoError, { passive: true });
    }

    if (!observedVideos.has(video)) {
      observedVideos.add(video);
      intersectionObserver?.observe(video);
      resizeObserver?.observe(video);
    }

    const check = videoCheck(video);
    if (check.ok) queueVideoCandidate(video);
  }

  function schedulePositionUpdate() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      for (const [candidate, badge] of overlays) {
        if (!candidate.isConnected) { badge.remove(); overlays.delete(candidate); }
        else positionBadge(candidate, badge);
      }
      for (const [video, badge] of videoOverlays) {
        if (!video.isConnected) {
          removeVideoBadge(video);
        } else {
          positionVideoBadge(video, badge);
        }
      }
    });
  }

  function isLikelyUiImage(candidate) {
    if (isVideoRelatedElement(candidate)) return true; // Exclude video players from image detection
    if (isMediaContainer(candidate)) return false;
    const description = [
      candidate.alt || '', candidate.getAttribute?.('aria-label') || '',
      typeof candidate.className === 'string' ? candidate.className : '', candidate.id || ''
    ].join(' ').toLowerCase();
    if (/\b(avatar|profile[-_ ]?pic|emoji|award|flair|site[-_ ]?icon)\b/.test(description)) return true;
    const inPost = Boolean(postRoot(candidate));
    if (!inPost) {
      const context = candidate.closest?.('header, nav, footer, aside, [role="navigation"], [data-testid*="avatar"], [aria-label*="avatar" i], [class*="avatar" i], [class*="profile" i], [class*="community-icon" i], [class*="subreddit-icon" i]');
      if (context || /\b(logo|icon)\b/.test(description)) return true;
    }
    return false;
  }

  function queueCandidate(candidate) {
    if (!enabled || !candidate?.isConnected) return;

    if (imageReadinessState === "not_configured") {
      setBadge(candidate, 'not-configured', 'Provider Not Configured', 'Configure your API key in Settings → Providers to enable detection.');
      states.set(candidate, { url: '', status: 'not-configured' });
      return;
    }
    if (imageReadinessState === "invalid") {
      setBadge(candidate, 'not-configured', 'Invalid API Key', 'Selected provider credentials failed validation. Update in Settings → Providers.');
      states.set(candidate, { url: '', status: 'invalid-key' });
      return;
    }

    const url = sourceOf(candidate);
    if (!url || !/^https?:\/\//i.test(url)) {
      if (!states.get(candidate)?.missingCounted) { stats.missingSource++; states.set(candidate, { url: '', status: 'no-source', missingCounted: true }); reportStats(); }
      return;
    }
    const current = states.get(candidate);
    if (current?.url === url && ['queued', 'running', 'done', 'error', 'skipped-size', 'skipped-ui'].includes(current.status)) return;

    if (isLikelyUiImage(candidate)) {
      stats.skippedByContext++;
      states.set(candidate, { url, status: 'skipped-ui' });
      reportStats();
      return;
    }

    const size = sizeCheck(candidate);
    if (!size.ok) {
      stats.skippedBySize++;
      stats.rejectReasons[size.reason] = (stats.rejectReasons[size.reason] || 0) + 1;
      stats.sample = sampleFor(candidate, size.detail || size.reason);
      states.set(candidate, { url, status: 'skipped-size', reason: size.reason });
      reportStats();
      return;
    }
    stats.sizePassed++;

    const visible = visibleCheck(candidate);
    if (!visible.ok) {
      stats.visibilityRejected++;
      stats.sample = sampleFor(candidate, visible.reason);
      reportStats();
      return;
    }

    stats.eligible++;
    let job = jobsByUrl.get(url);
    if (job) {
      job.targets.add(candidate);
      states.set(candidate, { url, status: job.status });
      stats.cachedOrDeduped++;
      if (job.status === 'queued') setBadge(candidate, 'queued', 'Queued', 'Waiting for an available detection request slot.');
      else if (job.status === 'running') setBadge(candidate, 'loading', 'Checking', 'The selected provider is analyzing this image.');
      else if (job.result) applyResult(candidate, url, job.result);
      reportStats();
      return;
    }

    job = { url, targets: new Set([candidate]), status: 'queued', result: null };
    jobsByUrl.set(url, job);
    queue.push(job);
    states.set(candidate, { url, status: 'queued' });
    stats.queued++;
    setBadge(candidate, 'queued', 'Queued', 'Waiting for an available detection request slot.');
    reportStats();
    pumpQueue();
  }

  function applyResult(candidate, url, result) {
    if (!enabled || !candidate.isConnected || sourceOf(candidate) !== url) return;
    const size = sizeCheck(candidate);
    const visible = visibleCheck(candidate);
    if (!size.ok || !visible.ok) { removeBadge(candidate); return; }
    if (!result?.ok) {
      const message = result?.error || 'Detection request failed.';
      setBadge(candidate, 'error', 'Error', message);
      states.set(candidate, { url, status: 'error', error: message });
      return;
    }
    const data = result.response;
    const rawConfidence = data.confidence === null || data.confidence === undefined || data.confidence === '' ? NaN : Number(data.confidence);
    const confidence = Number.isFinite(rawConfidence) ? (rawConfidence <= 1 ? rawConfidence : rawConfidence / 100) : NaN;
    const percent = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '';
    if (data.isAI !== true && data.isAI !== false) {
      setBadge(candidate, 'uncertain', 'INCONCLUSIVE', 'The selected provider did not return a recognized AI/real verdict. Open Mad Eye Moody Lens for details.');
    } else if (data.verdict === 'uncertain' || (Number.isFinite(confidence) && confidence < 0.60)) {
      setBadge(candidate, 'uncertain', `UNCERTAIN ${percent}`, 'Low-confidence provider prediction. Open Mad Eye Moody Lens for details.');
    } else if (data.isAI === true) {
      setBadge(candidate, 'ai', `AI ${percent}`, 'The selected provider classified this image as likely AI-generated. This is an estimate, not proof.');
    } else {
      setBadge(candidate, 'real', `NOT AI ${percent}`, 'The selected provider did not classify this image as AI-generated. This is not proof of authenticity.');
    }
    states.set(candidate, { url, status: 'done', result: data });
  }

  async function processJob(job) {
    const generation = scanGeneration;
    const targets = [...job.targets].filter(candidate => candidate.isConnected && sourceOf(candidate) === job.url && sizeCheck(candidate).ok && visibleCheck(candidate).ok);
    if (!enabled || !targets.length) {
      for (const candidate of job.targets) {
        const state = states.get(candidate);
        if (state?.url === job.url && state.status === 'queued') states.delete(candidate);
        removeBadge(candidate);
      }
      jobsByUrl.delete(job.url);
      return;
    }
    job.status = 'running';
    for (const candidate of targets) {
      states.set(candidate, { url: job.url, status: 'running' });
      setBadge(candidate, 'loading', 'Checking', 'The selected provider is analyzing this image.');
    }
    stats.submitted++;
    reportStats();
    try {
      let result = await chrome.runtime.sendMessage({ type: 'ANALYZE_IMAGE', image: job.url, source: isX ? 'automatic X/Twitter media scan' : 'automatic webpage scan' });
      if (!result?.ok && targets.length > 0) {
        const candidate = targets[0];
        if (candidate instanceof HTMLImageElement && candidate.naturalWidth > 0 && candidate.complete) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(candidate.naturalWidth, 1280);
            canvas.height = Math.round(((candidate.naturalHeight || 1) / (candidate.naturalWidth || 1)) * canvas.width);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(candidate, 0, 0, canvas.width, canvas.height);
            const dataUri = canvas.toDataURL('image/jpeg', 0.9);
            result = await chrome.runtime.sendMessage({ type: 'ANALYZE_IMAGE', image: dataUri, source: isX ? 'automatic X/Twitter media scan' : 'automatic webpage scan' });
          } catch (canvasErr) {
            // Tainted canvas or draw failure - keep original error
          }
        }
      }
      if (!result?.ok) throw new Error(result?.error || 'Detection request failed.');
      job.result = result;
      job.status = 'done';
      stats.completed++;
      if (result.cached) stats.cachedOrDeduped++;
      if (enabled && generation === scanGeneration) {
        for (const candidate of job.targets) applyResult(candidate, job.url, result);
      }
    } catch (error) {
      const message = error?.message || 'Unknown image-analysis error.';
      if (enabled && generation === scanGeneration) {
        stats.errors++;
        stats.lastError = message;
        for (const candidate of job.targets) {
          if (!candidate.isConnected || sourceOf(candidate) !== job.url) continue;
          setBadge(candidate, 'error', 'Error', message);
          states.set(candidate, { url: job.url, status: 'error', error: message });
        }
      }
    } finally {
      if (jobsByUrl.get(job.url) === job) jobsByUrl.delete(job.url);
      reportStats();
    }
  }

  function pumpQueue() {
    while (enabled && activeRequests < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      if (!job || jobsByUrl.get(job.url) !== job) continue;
      activeRequests++;
      processJob(job).finally(() => { activeRequests--; pumpQueue(); });
    }
  }

  function onIntersection(entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        if (entry.target instanceof HTMLVideoElement) queueVideoCandidate(entry.target);
        else queueCandidate(entry.target);
      }
    }
    schedulePositionUpdate();
  }

  function observeCandidate(candidate) {
    if (!(candidate instanceof Element) || observed.has(candidate)) return;
    observed.add(candidate);
    stats.found++;
    if (isX && postRoot(candidate)) stats.tweetImagesFound++;
    if (isMediaContainer(candidate)) stats.postMediaCandidates++;

    if (candidate instanceof HTMLImageElement) {
      candidate.addEventListener('load', () => candidateChanged(candidate), { passive: true });
      candidate.addEventListener('error', () => removeBadge(candidate), { passive: true });
    } else {
      candidate.querySelectorAll('img').forEach(img => {
        img.addEventListener('load', () => candidateChanged(candidate), { passive: true });
        img.addEventListener('error', () => removeBadge(candidate), { passive: true });
      });
    }
    intersectionObserver?.observe(candidate);
    resizeObserver?.observe(candidate);
  }

  function candidateForElement(el) {
    if (!(el instanceof Element)) return null;
    if (isVideoRelatedElement(el)) return null;
    if (isMediaContainer(el)) return el;
    if (el instanceof HTMLImageElement) return mediaContainerFor(el) || el;
    return null;
  }

  function candidateChanged(candidate) {
    states.delete(candidate);
    removeBadge(candidate);
    if (candidate?.isConnected && observed.has(candidate)) {
      intersectionObserver?.unobserve(candidate);
      intersectionObserver?.observe(candidate);
      const v = visibleRect(candidate);
      if (v && v.fraction >= MIN_VISIBLE_FRACTION) queueCandidate(candidate);
    } else if (candidate?.isConnected) observeCandidate(candidate);
  }

  function collectCandidates(root) {
    const found = new Set();
    if (!(root instanceof Element) && root !== document) return found;
    if (root instanceof Element) {
      if (videoScanEnabled && root instanceof HTMLVideoElement) observeVideoCandidate(root);
      else if (imageScanEnabled && isMediaContainer(root) && !root.querySelector('video') && !isVideoRelatedElement(root)) found.add(root);
      else if (imageScanEnabled && root instanceof HTMLImageElement && !isVideoRelatedElement(root)) found.add(candidateForElement(root));
    }
    if (root.querySelectorAll) {
      if (imageScanEnabled) {
        if (isX) {
          root.querySelectorAll('[data-testid="tweetPhoto"], [data-testid="card.wrapper"]').forEach(el => {
            if (!el.querySelector('video') && !isVideoRelatedElement(el)) found.add(el);
          });
        }
        root.querySelectorAll('img').forEach(img => {
          if (!isVideoRelatedElement(img)) {
            const candidate = candidateForElement(img);
            if (candidate && !isVideoRelatedElement(candidate)) found.add(candidate);
          }
        });
      }
      if (videoScanEnabled) {
        root.querySelectorAll('video').forEach(video => {
          observeVideoCandidate(video);
        });
      }
    }
    found.delete(null);
    return found;
  }

  function scanRoot(root) {
    if (!enabled || !root) return;
    for (const candidate of collectCandidates(root)) observeCandidate(candidate);
    stats.lastScanAt = Date.now();
    reportStats();
  }

  function scheduleScan(root) {
    if (!root) return;
    scanRoots.add(root);
    if (scanScheduled) return;
    scanScheduled = true;
    const run = () => {
      scanScheduled = false;
      const roots = [...scanRoots];
      scanRoots.clear();
      for (const item of roots) if (item === document || item.isConnected) scanRoot(item);
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 700 });
    else setTimeout(run, 70);
  }

  function resetAndReobserve(candidate) {
    if (!candidate) return;
    candidateChanged(candidate);
  }

  function buildObservers() {
    intersectionObserver = new IntersectionObserver(onIntersection, { root: null, rootMargin: '0px', threshold: [0, 0.02, 0.06, 0.15, 0.4, 0.7, 1] });
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const candidate = entry.target;
        if (candidate instanceof HTMLVideoElement) {
          const check = videoCheck(candidate);
          if (check.ok) queueVideoCandidate(candidate);
        } else {
          const state = states.get(candidate);
          if (state?.status === 'skipped-size') states.delete(candidate);
          const v = visibleRect(candidate);
          if (v && v.fraction >= MIN_VISIBLE_FRACTION) queueCandidate(candidate);
        }
      }
      schedulePositionUpdate();
    });
    mutationObserver = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') {
          const target = record.target;
          if (target.classList?.contains('ds-video-badge') || target.classList?.contains('ds-image-badge') || target.dataset?.dsBadge) {
            continue;
          }
          if (target instanceof HTMLVideoElement) {
            queueVideoCandidate(target);
          } else {
            const candidate = candidateForElement(target);
            if (candidate && !isVideoRelatedElement(candidate)) resetAndReobserve(candidate);
          }
        }
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList?.contains('ds-video-badge') || node.classList?.contains('ds-image-badge') || node.dataset?.dsBadge) {
              continue;
            }
            scheduleScan(node);
          }
        }
        for (const node of record.removedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node instanceof HTMLVideoElement) {
              removeVideoBadge(node);
            } else if (node.querySelectorAll) {
              node.querySelectorAll('video').forEach(removeVideoBadge);
              node.querySelectorAll('img').forEach(removeBadge);
            }
          }
        }
      }
    });
    mutationObserver.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['src', 'srcset', 'data-src', 'data-original', 'poster']
    });
  }

  function start() {
    enabled = true;
    if (intersectionObserver) { scheduleScan(document); return; }
    buildObservers();
    scanRoot(document);
    addEventListener('scroll', schedulePositionUpdate, { capture: true, passive: true });
    addEventListener('resize', schedulePositionUpdate, { passive: true });
  }

  function stop() {
    enabled = false;
    scanGeneration++;
    clearLayoutCache();
    mutationObserver?.disconnect(); intersectionObserver?.disconnect(); resizeObserver?.disconnect();
    mutationObserver = intersectionObserver = resizeObserver = null;
    observed = new WeakSet();
    observedVideos = new WeakSet();
    states = new WeakMap();
    videoStates = new WeakMap();
    queue.length = 0; jobsByUrl.clear();
    videoQueue.length = 0; videoJobsBySource.clear();
    removeEventListener('scroll', schedulePositionUpdate, true);
    removeEventListener('resize', schedulePositionUpdate);
    if (positionFrame) cancelAnimationFrame(positionFrame);
    positionFrame = 0;
    for (const badge of overlays.values()) badge.remove();
    overlays.clear();
    for (const badge of videoOverlays.values()) badge.remove();
    videoOverlays.clear();
    document.querySelectorAll('.ds-video-badge, .ds-image-badge').forEach(b => b.remove());
  }

  function rescan() {
    scanGeneration++;
    clearLayoutCache();
    queue.length = 0;
    jobsByUrl.clear();
    videoQueue.length = 0;
    videoJobsBySource.clear();
    observed = new WeakSet();
    observedVideos = new WeakSet();
    states = new WeakMap();
    videoStates = new WeakMap();
    for (const badge of overlays.values()) badge.remove();
    overlays.clear();
    for (const badge of videoOverlays.values()) badge.remove();
    videoOverlays.clear();
    document.querySelectorAll('.ds-video-badge, .ds-image-badge').forEach(b => b.remove());
    intersectionObserver?.disconnect(); resizeObserver?.disconnect(); mutationObserver?.disconnect();
    intersectionObserver = resizeObserver = mutationObserver = null;
    if (enabled) { buildObservers(); scanRoot(document); }
    return { ...stats, rejectReasons: { ...stats.rejectReasons }, threshold: preset().label };
  }

  function applyScannerSettings(settings = {}) {
    const nextThreshold = PRESETS[settings.scanThreshold] ? settings.scanThreshold : "standard";
    const thresholdChanged = nextThreshold !== thresholdName;
    const providerChanged = settings.activeProvider && settings.activeProvider !== activeProviderName;
    const videoProviderChanged = settings.videoActiveProvider && settings.videoActiveProvider !== activeVideoProviderName;
    const nextProviderVersion = String(settings.providerVersion ?? activeProviderVersion);
    const providerConfigChanged = nextProviderVersion !== activeProviderVersion;

    thresholdName = nextThreshold;
    activeProviderName = settings.activeProvider || activeProviderName;
    activeVideoProviderName = settings.videoActiveProvider || activeVideoProviderName;
    activeProviderVersion = nextProviderVersion;

    const prevImageScan = imageScanEnabled;
    const prevVideoScan = videoScanEnabled;

    imageScanEnabled = Boolean(settings.scanEnabled);
    videoScanEnabled = settings.videoScanEnabled !== false;

    const imageScanChanged = prevImageScan !== imageScanEnabled;
    const videoScanChanged = prevVideoScan !== videoScanEnabled;

    const prevImageReadiness = imageReadinessState;
    const prevVideoReadiness = videoReadinessState;

    imageReadinessState = settings.imageReadiness?.state || (settings.providerConfigured ? "unverified" : "not_configured");
    videoReadinessState = settings.videoReadiness?.state || (settings.videoProviderConfigured ? "unverified" : "not_configured");
    imageProviderConfigured = imageReadinessState !== "not_configured" && imageReadinessState !== "invalid";
    videoProviderConfigured = videoReadinessState !== "not_configured" && videoReadinessState !== "invalid";

    const readinessChanged = prevImageReadiness !== imageReadinessState || prevVideoReadiness !== videoReadinessState;

    if (!imageScanEnabled) {
      queue.length = 0;
      jobsByUrl.clear();
      for (const badge of overlays.values()) badge.remove();
      overlays.clear();
      states = new WeakMap();
      if (typeof document !== 'undefined' && document.querySelectorAll) {
        document.querySelectorAll('.ds-image-badge').forEach(b => b.remove());
      }
    }

    if (!videoScanEnabled) {
      videoQueue.length = 0;
      videoJobsBySource.clear();
      for (const badge of videoOverlays.values()) badge.remove();
      videoOverlays.clear();
      videoStates = new WeakMap();
      if (typeof document !== 'undefined' && document.querySelectorAll) {
        document.querySelectorAll('.ds-video-badge').forEach(b => b.remove());
      }
    }

    const shouldRun = imageScanEnabled || videoScanEnabled;
    if (shouldRun) {
      if (!enabled) {
        start();
      } else if (thresholdChanged || providerChanged || videoProviderChanged || providerConfigChanged || readinessChanged || imageScanChanged || videoScanChanged) {
        rescan();
      }
    } else {
      if (enabled) stop();
    }
  }

  function onRuntimeMessage(message, _sender, sendResponse) {
    if (message?.type === 'DS_PING' || message?.type === 'DS_GET_STATS') {
      sendResponse({ alive: true, stats: { ...stats, rejectReasons: { ...stats.rejectReasons }, threshold: preset().label, thresholdName } });
      return false;
    }
    if (message?.type === 'DS_SETTINGS_CHANGED') {
      applyScannerSettings(message.settings || {});
      sendResponse({ alive: true, stats: { ...stats, rejectReasons: { ...stats.rejectReasons }, threshold: preset().label, thresholdName } });
      return false;
    }
    if (message?.type === 'DS_SCAN_NOW' || message?.type === 'DS_PROVIDER_CHANGED') {
      const current = rescan();
      sendResponse({ alive: true, stats: current });
      return false;
    }
    if (message?.type === 'DS_STOP') { stop(); sendResponse({ alive: true, stopped: true }); return false; }
    if (message?.type === 'DS_STOP_IMAGE') {
      imageScanEnabled = false;
      queue.length = 0; jobsByUrl.clear();
      for (const badge of overlays.values()) badge.remove();
      overlays.clear();
      states = new WeakMap();
      if (typeof document !== 'undefined' && document.querySelectorAll) {
        document.querySelectorAll('.ds-image-badge').forEach(b => b.remove());
      }
      if (!videoScanEnabled && enabled) stop();
      sendResponse({ alive: true, imageStopped: true });
      return false;
    }
    if (message?.type === 'DS_STOP_VIDEO') {
      videoScanEnabled = false;
      videoQueue.length = 0; videoJobsBySource.clear();
      for (const badge of videoOverlays.values()) badge.remove();
      videoOverlays.clear();
      videoStates = new WeakMap();
      if (typeof document !== 'undefined' && document.querySelectorAll) {
        document.querySelectorAll('.ds-video-badge').forEach(b => b.remove());
      }
      if (!imageScanEnabled && enabled) stop();
      sendResponse({ alive: true, videoStopped: true });
      return false;
    }
  }

  const controller = {
    start, stop, rescan, applyScannerSettings,
    dispose() {
      stop();
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    },
    getStats() { return { ...stats, rejectReasons: { ...stats.rejectReasons }, threshold: preset().label, thresholdName }; }
  };
  globalThis[CONTROLLER_KEY] = controller;
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  chrome.runtime.sendMessage({ type: 'GET_SCANNER_SETTINGS' })
    .then(applyScannerSettings)
    .catch(() => { enabled = false; });
})();
(() => {
  const CONTROLLER_KEY = "__detectionStudioScannerV113";
  try { globalThis[CONTROLLER_KEY]?.dispose?.(); } catch (_) {}

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

  let thresholdName = "standard";
  let enabled = true;
  let intersectionObserver = null;
  let mutationObserver = null;
  let resizeObserver = null;
  let observed = new WeakSet();
  let scanRoots = new Set();
  let scanScheduled = false;
  let activeRequests = 0;
  let positionFrame = 0;
  let statsTimer = null;
  const queue = [];
  const jobsByUrl = new Map();
  let states = new WeakMap();
  const overlays = new Map();

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
    rejectReasons: { renderedTooSmall: 0, sourceTooSmall: 0, aspectRatio: 0, hidden: 0, noGeometry: 0 }
  };

  const preset = () => PRESETS[thresholdName] || PRESETS.standard;
  const isMediaContainer = el => isX && el instanceof Element && el.matches(X_MEDIA_SELECTOR);
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
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
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
    if (child && child.naturalWidth > 0 && child.naturalHeight > 0 &&
        Math.min(child.naturalWidth, child.naturalHeight) < p.minNatural) {
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
    const v = visibleRect(candidate);
    if (!v || v.width < MIN_VISIBLE_WIDTH || v.height < 28) { badge.style.display = 'none'; return; }
    badge.style.display = 'inline-flex';
    const width = badge.offsetWidth;
    const height = badge.offsetHeight;
    if (v.width < width + 8 || v.height < height + 8) { badge.style.display = 'none'; return; }
    badge.style.left = `${Math.round(v.right - width - 6)}px`;
    badge.style.top = `${Math.round(v.top + 6)}px`;
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

  function schedulePositionUpdate() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      for (const [candidate, badge] of overlays) {
        if (!candidate.isConnected) { badge.remove(); overlays.delete(candidate); }
        else positionBadge(candidate, badge);
      }
    });
  }

  function isLikelyUiImage(candidate) {
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
      if (job.status === 'queued') setBadge(candidate, 'queued', 'Queued', 'Waiting for an available BitMind request slot.');
      else if (job.status === 'running') setBadge(candidate, 'loading', 'Checking', 'BitMind is analyzing this image.');
      else if (job.result) applyResult(candidate, url, job.result);
      reportStats();
      return;
    }

    job = { url, targets: new Set([candidate]), status: 'queued', result: null };
    jobsByUrl.set(url, job);
    queue.push(job);
    states.set(candidate, { url, status: 'queued' });
    stats.queued++;
    setBadge(candidate, 'queued', 'Queued', 'Waiting for an available BitMind request slot.');
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
    const rawConfidence = Number(data.confidence);
    const confidence = Number.isFinite(rawConfidence) ? (rawConfidence <= 1 ? rawConfidence : rawConfidence / 100) : NaN;
    const percent = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '';
    if (Number.isFinite(confidence) && confidence < 0.60) {
      setBadge(candidate, 'uncertain', `UNCERTAIN ${percent}`, 'Low-confidence BitMind prediction. Open Mad Eye Moody Lens for details.');
    } else if (data.isAI) {
      setBadge(candidate, 'ai', `AI ${percent}`, 'BitMind classified this image as likely AI-generated. This is an estimate, not proof.');
    } else {
      setBadge(candidate, 'real', `NOT AI ${percent}`, 'BitMind did not classify this image as AI-generated. This is not proof of authenticity.');
    }
    states.set(candidate, { url, status: 'done', result: data });
  }

  async function processJob(job) {
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
      setBadge(candidate, 'loading', 'Checking', 'BitMind is analyzing this image.');
    }
    stats.submitted++;
    reportStats();
    try {
      const result = await chrome.runtime.sendMessage({ type: 'ANALYZE_IMAGE', image: job.url, source: isX ? 'automatic X/Twitter media scan' : 'automatic webpage scan' });
      if (!result?.ok) throw new Error(result?.error || 'Detection request failed.');
      job.result = result;
      job.status = 'done';
      stats.completed++;
      if (result.cached) stats.cachedOrDeduped++;
      if (enabled) for (const candidate of job.targets) applyResult(candidate, job.url, result);
    } catch (error) {
      const message = error?.message || 'Unknown image-analysis error.';
      if (enabled) {
        stats.errors++;
        stats.lastError = message;
        for (const candidate of job.targets) {
          if (!candidate.isConnected || sourceOf(candidate) !== job.url) continue;
          setBadge(candidate, 'error', 'Error', message);
          states.set(candidate, { url: job.url, status: 'error', error: message });
        }
      }
    } finally {
      jobsByUrl.delete(job.url);
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
    for (const entry of entries) if (entry.isIntersecting) queueCandidate(entry.target);
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
      if (isMediaContainer(root)) found.add(root);
      else if (root instanceof HTMLImageElement) found.add(candidateForElement(root));
    }
    if (root.querySelectorAll) {
      if (isX) {
        root.querySelectorAll('[data-testid="tweetPhoto"], [data-testid="card.wrapper"]').forEach(el => found.add(el));
      }
      root.querySelectorAll('img').forEach(img => {
        const candidate = candidateForElement(img);
        if (candidate) found.add(candidate);
      });
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
        const state = states.get(candidate);
        if (state?.status === 'skipped-size') states.delete(candidate);
        const v = visibleRect(candidate);
        if (v && v.fraction >= MIN_VISIBLE_FRACTION) queueCandidate(candidate);
      }
      schedulePositionUpdate();
    });
    mutationObserver = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') {
          const candidate = candidateForElement(record.target);
          if (candidate) resetAndReobserve(candidate);
        }
        for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) scheduleScan(node);
      }
    });
    mutationObserver.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['src', 'srcset', 'data-src', 'data-original']
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
    mutationObserver?.disconnect(); intersectionObserver?.disconnect(); resizeObserver?.disconnect();
    mutationObserver = intersectionObserver = resizeObserver = null;
    observed = new WeakSet();
    states = new WeakMap();
    queue.length = 0; jobsByUrl.clear();
    removeEventListener('scroll', schedulePositionUpdate, true);
    removeEventListener('resize', schedulePositionUpdate);
    if (positionFrame) cancelAnimationFrame(positionFrame);
    positionFrame = 0;
    for (const badge of overlays.values()) badge.remove();
    overlays.clear();
  }

  function rescan() {
    observed = new WeakSet();
    states = new WeakMap();
    intersectionObserver?.disconnect(); resizeObserver?.disconnect(); mutationObserver?.disconnect();
    intersectionObserver = resizeObserver = mutationObserver = null;
    if (enabled) { buildObservers(); scanRoot(document); }
    return { ...stats, rejectReasons: { ...stats.rejectReasons }, threshold: preset().label };
  }

  function onStorageChange(changes, area) {
    if (area !== 'local') return;
    if (changes.scanEnabled) { if (changes.scanEnabled.newValue) start(); else stop(); }
    if (changes.scanThreshold) {
      thresholdName = PRESETS[changes.scanThreshold.newValue] ? changes.scanThreshold.newValue : 'standard';
      rescan();
    }
  }

  function onRuntimeMessage(message, _sender, sendResponse) {
    if (message?.type === 'DS_PING' || message?.type === 'DS_GET_STATS') {
      sendResponse({ alive: true, stats: { ...stats, rejectReasons: { ...stats.rejectReasons }, threshold: preset().label, thresholdName } });
      return false;
    }
    if (message?.type === 'DS_SCAN_NOW') {
      const current = rescan();
      sendResponse({ alive: true, stats: current });
      return false;
    }
    if (message?.type === 'DS_STOP') { stop(); sendResponse({ alive: true, stopped: true }); return false; }
  }

  const controller = {
    start, stop, rescan,
    dispose() {
      stop();
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      chrome.storage.onChanged.removeListener(onStorageChange);
    },
    getStats() { return { ...stats, rejectReasons: { ...stats.rejectReasons }, threshold: preset().label, thresholdName }; }
  };
  globalThis[CONTROLLER_KEY] = controller;
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  chrome.storage.onChanged.addListener(onStorageChange);
  chrome.storage.local.get({ scanThreshold: 'standard' }).then(value => {
    thresholdName = PRESETS[value.scanThreshold] ? value.scanThreshold : 'standard';
    start();
  }).catch(start);
})();
(() => {
  const CONTROLLER_ID = "__bitmindVideoDetectorV1__";
  if (window[CONTROLLER_ID]) {
    try { window[CONTROLLER_ID].destroy(); } catch (_) {}
  }

  // Configuration & state
  let enabled = true;
  let autoScanOnHover = true;
  let hoverDelayMs = 400;
  let hasApiKey = false;
  let activeBadge = null;
  let currentTargetVideo = null;
  let hoverTimer = null;
  let hideTimer = null;

  // WeakMap to store scan states per video element: { status, result, error, keyframe }
  const videoScanStates = new WeakMap();

  // Guard against extension context invalidation (e.g. extension reloaded while tab is open)
  function isExtensionAlive() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch (_) {
      return false;
    }
  }

  function teardown() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("scroll", onScroll);
    if (hoverTimer) clearTimeout(hoverTimer);
    if (hideTimer) clearTimeout(hideTimer);
    if (activeBadge) {
      try { activeBadge.remove(); } catch (_) {}
      activeBadge = null;
    }
  }

  function safeSendMessage(message, callback) {
    if (!isExtensionAlive()) {
      teardown();
      return;
    }
    try {
      chrome.runtime.sendMessage(message, response => {
        if (!isExtensionAlive()) {
          teardown();
          return;
        }
        if (chrome.runtime.lastError) {
          const err = chrome.runtime.lastError.message || "";
          if (err.includes("Extension context invalidated")) {
            teardown();
            return;
          }
        }
        if (typeof callback === "function") {
          callback(response);
        }
      });
    } catch (err) {
      if (String(err?.message || err).includes("Extension context invalidated")) {
        teardown();
      }
    }
  }

  // Query background for settings
  function syncSettings() {
    safeSendMessage({ type: "PING" }, response => {
      if (!response?.ok) return;
      const data = response.data;
      enabled = data.hoverScanEnabled ?? true;
      autoScanOnHover = data.autoScanOnHover ?? true;
      hoverDelayMs = data.hoverDelayMs ?? 400;
      hasApiKey = data.hasKey;
    });
  }
  syncSettings();

  // Extract a high quality frame from an HTML5 video element
  function captureVideoFrame(video) {
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }
    try {
      const canvas = document.createElement("canvas");
      // Scale down large 4K/1080p frames to reasonable detection size (max 720px width)
      const maxDim = 720;
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > maxDim) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      }
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch (err) {
      // Typically occurs if crossOrigin is blocked on canvas
      console.debug("Canvas frame extraction not permitted (CORS); falling back to source URL.");
      return null;
    }
  }

  // Get accessible source URL of video
  function getVideoSourceUrl(video) {
    if (video.currentSrc && !video.currentSrc.startsWith("blob:") && !video.currentSrc.startsWith("data:")) {
      return video.currentSrc;
    }
    if (video.src && !video.src.startsWith("blob:") && !video.src.startsWith("data:")) {
      return video.src;
    }
    const sourceEl = video.querySelector("source[src]");
    if (sourceEl?.src && !sourceEl.src.startsWith("blob:")) {
      return sourceEl.src;
    }
    return video.currentSrc || video.src || "";
  }

  // Find video element at or near point
  function findVideoAtPoint(x, y) {
    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
      if (el instanceof HTMLVideoElement) return el;
      if (el.shadowRoot) {
        const shadowVideo = el.shadowRoot.querySelector("video");
        if (shadowVideo) return shadowVideo;
      }
      const childVideo = el.querySelector("video");
      if (childVideo) {
        const rect = childVideo.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return childVideo;
        }
      }
    }
    return null;
  }

  // Create or get badge element
  function getOrCreateBadge() {
    if (activeBadge && activeBadge.isConnected) {
      // Ensure key elements exist inside activeBadge
      if (activeBadge.querySelector("#bmLabel") && activeBadge.querySelector("#bmPill")) {
        return activeBadge;
      }
    }
    if (activeBadge) {
      try { activeBadge.remove(); } catch (_) {}
      activeBadge = null;
    }

    const badge = document.createElement("div");
    badge.className = "bm-video-detector-badge bm-hidden";
    badge.innerHTML = `
      <div class="bm-pill bm-pill-idle" id="bmPill">
        <span class="bm-pill-icon" id="bmPillIcon"><span class="bm-logo-icon"></span></span>
        <span class="bm-label" id="bmLabel">BitMind: Scan</span>
      </div>
      <div class="bm-card" id="bmCard">
        <div class="bm-card-header">
          <span class="bm-card-title">Video Authenticity</span>
          <span class="bm-card-badge" id="bmCardBadge">Scanning...</span>
        </div>
        <div class="bm-bar-track">
          <div class="bm-bar-fill" id="bmBarFill" style="width: 0%;"></div>
        </div>
        <div class="bm-metric-row">
          <span>Confidence:</span>
          <span class="bm-metric-val" id="bmConfidence">—</span>
        </div>
        <div class="bm-metric-row">
          <span>Detector:</span>
          <span class="bm-metric-val" id="bmModel">—</span>
        </div>
        <p class="bm-card-explanation" id="bmExplanation">Hover to inspect deepfake probability.</p>
        <div class="bm-card-actions">
          <button class="bm-btn-mini" id="bmRescan">Rescan Video</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(badge);
    activeBadge = badge;

    // Events on badge
    const pill = badge.querySelector("#bmPill");
    const card = badge.querySelector("#bmCard");
    const rescanBtn = badge.querySelector("#bmRescan");

    if (pill) {
      pill.addEventListener("click", e => {
        e.stopPropagation();
        if (!currentTargetVideo) return;
        const state = videoScanStates.get(currentTargetVideo);
        if (!state || state.status === "idle" || state.status === "error") {
          scanVideo(currentTargetVideo);
        } else if (card) {
          card.classList.toggle("bm-open");
        }
      });
    }

    badge.addEventListener("mouseenter", () => {
      clearTimeout(hideTimer);
    });

    badge.addEventListener("mouseleave", () => {
      hideTimer = setTimeout(() => {
        if (card) card.classList.remove("bm-open");
        badge.classList.add("bm-hidden");
      }, 1200);
    });

    if (rescanBtn) {
      rescanBtn.addEventListener("click", e => {
        e.stopPropagation();
        if (currentTargetVideo) {
          videoScanStates.delete(currentTargetVideo);
          scanVideo(currentTargetVideo);
        }
      });
    }

    return badge;
  }

  // Position badge over video
  function positionBadge(video) {
    if (!video || !video.isConnected) return;
    const badge = getOrCreateBadge();
    const rect = video.getBoundingClientRect();

    if (rect.width < 120 || rect.height < 80) {
      badge.classList.add("bm-hidden");
      return;
    }

    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    // Place in top-right of video inside viewport
    const top = rect.top + scrollY + 12;
    const right = (document.documentElement.clientWidth - (rect.right + scrollX)) + 12;

    badge.style.top = `${Math.max(top, 10)}px`;
    badge.style.right = `${Math.max(right, 10)}px`;
    badge.classList.remove("bm-hidden");
  }

  // Update badge UI to reflect state
  function updateBadgeUI(state) {
    const badge = getOrCreateBadge();
    const pill = badge.querySelector("#bmPill");
    const pillIcon = badge.querySelector("#bmPillIcon");
    const label = badge.querySelector("#bmLabel");
    const cardBadge = badge.querySelector("#bmCardBadge");
    const barFill = badge.querySelector("#bmBarFill");
    const confVal = badge.querySelector("#bmConfidence");
    const modelVal = badge.querySelector("#bmModel");
    const explanation = badge.querySelector("#bmExplanation");

    if (!pill) return;
    pill.className = "bm-pill";

    if (!state || state.status === "idle") {
      pill.classList.add("bm-pill-idle");
      if (pillIcon) pillIcon.innerHTML = `<span class="bm-logo-icon"></span>`;
      if (label) label.textContent = "BitMind: Scan";
      if (cardBadge) {
        cardBadge.textContent = "Idle";
        cardBadge.className = "bm-card-badge";
      }
      if (barFill) barFill.style.width = "0%";
      if (confVal) confVal.textContent = "—";
      if (modelVal) modelVal.textContent = "BitMind Video Oracle";
      if (explanation) explanation.textContent = "Click to scan this video for deepfake manipulation.";
      return;
    }

    if (state.status === "scanning") {
      pill.classList.add("bm-pill-scanning");
      if (pillIcon) pillIcon.innerHTML = `<span class="bm-spinner"></span>`;
      if (label) label.textContent = "Analyzing video...";
      if (cardBadge) {
        cardBadge.textContent = "Analyzing";
        cardBadge.className = "bm-card-badge";
      }
      if (explanation) explanation.textContent = "Sampling keyframes and querying BitMind detection API...";
      return;
    }

    if (state.status === "error") {
      pill.classList.add("bm-pill-uncertain");
      if (pillIcon) pillIcon.innerHTML = `<span class="bm-dot"></span>`;
      if (label) label.textContent = "Scan Failed";
      if (cardBadge) {
        cardBadge.textContent = "Error";
        cardBadge.className = "bm-card-badge bm-badge-uncertain";
      }
      if (explanation) explanation.textContent = state.error || "Unable to analyze video.";
      return;
    }

    if (state.status === "done" && state.result) {
      const res = state.result;
      const pct = res.confidence ? Math.round(res.confidence * 100) : 95;

      if (res.verdict === "likely_ai") {
        pill.classList.add("bm-pill-fake");
        if (pillIcon) pillIcon.innerHTML = `<span class="bm-dot"></span>`;
        if (label) label.textContent = `🚨 DEEPFAKE ${pct}%`;
        if (cardBadge) {
          cardBadge.textContent = "AI Deepfake";
          cardBadge.className = "bm-card-badge bm-badge-fake";
        }
        if (barFill) {
          barFill.className = "bm-bar-fill bm-bar-fake";
          barFill.style.width = `${pct}%`;
        }
        if (confVal) confVal.textContent = `${pct}% Synthetic`;
        if (modelVal) modelVal.textContent = res.model || "BitMind Oracle";
        if (explanation) explanation.textContent = res.explanation || "Synthetic artifacts identified in video frames.";
      } else if (res.verdict === "likely_not_ai") {
        pill.classList.add("bm-pill-real");
        if (pillIcon) pillIcon.innerHTML = `<span class="bm-dot"></span>`;
        if (label) label.textContent = `✅ AUTHENTIC ${pct}%`;
        if (cardBadge) {
          cardBadge.textContent = "Authentic";
          cardBadge.className = "bm-card-badge bm-badge-real";
        }
        if (barFill) {
          barFill.className = "bm-bar-fill bm-bar-real";
          barFill.style.width = `${pct}%`;
        }
        if (confVal) confVal.textContent = `${pct}% Real`;
        if (modelVal) modelVal.textContent = res.model || "BitMind Oracle";
        if (explanation) explanation.textContent = res.explanation || "Video evaluated as genuine recording.";
      } else {
        pill.classList.add("bm-pill-uncertain");
        if (pillIcon) pillIcon.innerHTML = `<span class="bm-dot"></span>`;
        if (label) label.textContent = `⚠️ UNCERTAIN ${pct}%`;
        if (cardBadge) {
          cardBadge.textContent = "Uncertain";
          cardBadge.className = "bm-card-badge bm-badge-uncertain";
        }
        if (barFill) {
          barFill.className = "bm-bar-fill";
          barFill.style.width = `${pct}%`;
        }
        if (confVal) confVal.textContent = `${pct}% Inconclusive`;
        if (modelVal) modelVal.textContent = res.model || "BitMind Oracle";
        if (explanation) explanation.textContent = "Detection confidence was inconclusive.";
      }
    }
  }

  // Scan a given video element
  function scanVideo(video) {
    if (!video || !isExtensionAlive()) return;
    const existing = videoScanStates.get(video);
    if (existing && (existing.status === "scanning" || existing.status === "done")) {
      updateBadgeUI(existing);
      return;
    }

    const state = { status: "scanning", result: null, error: null };
    videoScanStates.set(video, state);
    updateBadgeUI(state);

    const frameDataUri = captureVideoFrame(video);
    const videoUrl = getVideoSourceUrl(video);

    if (!frameDataUri && !videoUrl) {
      state.status = "error";
      state.error = "Could not capture frame or retrieve video URL.";
      updateBadgeUI(state);
      return;
    }

    const payload = {
      frameDataUri,
      videoUrl,
      title: document.title || "Web Video",
      videoDuration: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
      scanType: "hover_scan"
    };

    safeSendMessage({ type: "SCAN_VIDEO", payload }, response => {
      if (!response?.ok) {
        state.status = "error";
        state.error = response?.error || "Detection request failed.";
        updateBadgeUI(state);
        return;
      }

      state.status = "done";
      state.result = response.data;
      updateBadgeUI(state);
    });
  }

  // Pointer & mouseover listeners
  function onPointerMove(e) {
    if (!isExtensionAlive()) {
      teardown();
      return;
    }
    if (!enabled) return;

    // Ignore if cursor is directly over our badge
    if (activeBadge && (activeBadge === e.target || activeBadge.contains(e.target))) {
      clearTimeout(hideTimer);
      return;
    }

    const video = findVideoAtPoint(e.clientX, e.clientY);
    if (video) {
      clearTimeout(hideTimer);
      if (currentTargetVideo !== video) {
        currentTargetVideo = video;
        positionBadge(video);

        let state = videoScanStates.get(video);
        if (!state) {
          state = { status: "idle", result: null };
          videoScanStates.set(video, state);
        }
        updateBadgeUI(state);

        if (autoScanOnHover && state.status === "idle") {
          clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => {
            if (currentTargetVideo === video) {
              scanVideo(video);
            }
          }, hoverDelayMs);
        }
      } else {
        positionBadge(video);
      }
    } else {
      clearTimeout(hoverTimer);
      if (activeBadge && !activeBadge.classList.contains("bm-hidden")) {
        hideTimer = setTimeout(() => {
          if (activeBadge) activeBadge.classList.add("bm-hidden");
          currentTargetVideo = null;
        }, 1200);
      }
    }
  }

  function onScroll() {
    if (!isExtensionAlive()) {
      teardown();
      return;
    }
    if (currentTargetVideo && activeBadge && !activeBadge.classList.contains("bm-hidden")) {
      positionBadge(currentTargetVideo);
    }
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });

  // Expose controller for cleanup
  window[CONTROLLER_ID] = {
    destroy: () => {
      teardown();
    }
  };
})();

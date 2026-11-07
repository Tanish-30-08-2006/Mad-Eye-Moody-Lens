/**
 * Mad-Eye Moody Lens - Live Deepfake Tracking Content Script
 * Triggers live CNN analysis on image long press (>1.0s) and renders
 * real-time verdicts, Grad-CAM heatmaps, and whole-vs-partial segmentation.
 */

(function () {
  if (window.__MOODY_LENS_INITIALIZED__) return;
  window.__MOODY_LENS_INITIALIZED__ = true;

  const HOLD_THRESHOLD_MS = 1000; // 1.0 second hold threshold
  let holdTimer = null;
  let animationFrameId = null;
  let holdStartTime = 0;
  let activeImageTarget = null;
  let activeRingElem = null;
  let startCoords = { x: 0, y: 0 };
  let activeFloatingBadge = null;

  // ---------------------------------------------------------------------------
  // Helper: Find valid image target from DOM event
  // ---------------------------------------------------------------------------
  function getImageFromElement(el) {
    if (!el) return null;
    if (el.tagName === "IMG") return el;
    if (el.tagName === "PICTURE") return el.querySelector("img");
    if (el.tagName === "CANVAS") return el;

    // Check parent tree (e.g. wrapper anchor or div)
    const childImg = el.querySelector("img");
    if (childImg && childImg.offsetWidth > 40 && childImg.offsetHeight > 40) {
      return childImg;
    }

    // Check CSS background-image
    const bg = window.getComputedStyle(el).backgroundImage;
    if (bg && bg.startsWith("url(") && el.offsetWidth > 40 && el.offsetHeight > 40) {
      return el;
    }

    return null;
  }

  function getImageUrl(el) {
    if (!el) return null;
    if (el.tagName === "IMG") {
      return el.currentSrc || el.src;
    }
    if (el.tagName === "CANVAS") {
      try {
        return el.toDataURL("image/png");
      } catch (e) {
        return null;
      }
    }
    const bg = window.getComputedStyle(el).backgroundImage;
    if (bg && bg.startsWith("url(")) {
      const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
      return match ? match[1] : null;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // HUD Circular Progress Ring (Hold-to-scan visualizer)
  // ---------------------------------------------------------------------------
  function showHoldRing(x, y) {
    removeHoldRing();

    const ring = document.createElement("div");
    ring.className = "mml-hold-ring-container";
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;

    ring.innerHTML = `
      <div style="position: relative; width: 72px; height: 72px;">
        <svg class="mml-hold-ring-svg" viewBox="0 0 72 72">
          <circle class="mml-hold-ring-bg" cx="36" cy="36" r="30" />
          <circle class="mml-hold-ring-progress" id="mml-ring-stroke" cx="36" cy="36" r="30" />
        </svg>
        <span class="mml-hold-ring-icon">👁️</span>
      </div>
      <div class="mml-hold-ring-label" id="mml-ring-text">HOLD FOR LIVE SCAN (1.0s)</div>
    `;

    document.body.appendChild(ring);
    activeRingElem = ring;
  }

  function updateHoldProgress(progress) {
    if (!activeRingElem) return;
    const stroke = activeRingElem.querySelector("#mml-ring-stroke");
    const label = activeRingElem.querySelector("#mml-ring-text");
    if (stroke) {
      const circumference = 188.5; // 2 * pi * 30
      const offset = circumference * (1 - Math.min(1.0, progress));
      stroke.style.strokeDashoffset = offset;
    }
    if (label) {
      const pct = Math.round(progress * 100);
      label.textContent = `ANALYZING... ${pct}%`;
    }
  }

  function removeHoldRing() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (activeRingElem) {
      activeRingElem.remove();
      activeRingElem = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Event Handlers for Long Press (>1.0s)
  // ---------------------------------------------------------------------------
  function handlePointerDown(e) {
    // Only primary mouse button or touch
    if (e.type === "mousedown" && e.button !== 0) return;

    const target = getImageFromElement(e.target);
    if (!target) return;

    // Reject tiny icons/avatars < 50px
    const rect = target.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) return;

    activeImageTarget = target;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startCoords = { x: clientX, y: clientY };

    holdStartTime = performance.now();
    showHoldRing(clientX, clientY);

    function step() {
      const elapsed = performance.now() - holdStartTime;
      const progress = Math.min(1.0, elapsed / HOLD_THRESHOLD_MS);
      updateHoldProgress(progress);

      if (progress < 1.0) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        // Triggered! User successfully held for >= 1.0 second
        triggerScan(activeImageTarget);
        removeHoldRing();
      }
    }

    animationFrameId = requestAnimationFrame(step);
  }

  function handlePointerMove(e) {
    if (!activeImageTarget) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // If cursor moved more than 15px, treat as scroll or drag and abort hold
    const dist = Math.hypot(clientX - startCoords.x, clientY - startCoords.y);
    if (dist > 15) {
      cancelHold();
    }
  }

  function cancelHold() {
    activeImageTarget = null;
    removeHoldRing();
  }

  // ---------------------------------------------------------------------------
  // Live Analysis Trigger & API Communication
  // ---------------------------------------------------------------------------
  async function triggerScan(target) {
    const imageUrl = getImageUrl(target);
    if (!imageUrl) return;

    // Show loading badge near image
    showFloatingLoadingBadge(target);

    try {
      const response = await chrome.runtime.sendMessage({
        action: "ANALYZE_IMAGE",
        imageUrl: imageUrl,
        isAdvanced: false,
      });

      if (response && response.status === "success") {
        showFloatingVerdictBadge(target, response.data, imageUrl);
      } else {
        showFloatingErrorBadge(target, response?.error || "Analysis failed");
      }
    } catch (err) {
      console.error("[MoodyLens] Scan error:", err);
      showFloatingErrorBadge(target, "Backend offline or unreachable (Check localhost:8000)");
    }
  }

  // ---------------------------------------------------------------------------
  // Floating Verdict Badge Pinned to Target Image
  // ---------------------------------------------------------------------------
  function removeFloatingBadge() {
    if (activeFloatingBadge) {
      activeFloatingBadge.remove();
      activeFloatingBadge = null;
    }
  }

  function positionBadge(badge, target) {
    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // Position near the top-left corner of the image
    const top = Math.max(10, rect.top + scrollY + 10);
    const left = Math.max(10, rect.left + scrollX + 10);

    badge.style.top = `${top}px`;
    badge.style.left = `${left}px`;
  }

  function showFloatingLoadingBadge(target) {
    removeFloatingBadge();

    const badge = document.createElement("div");
    badge.className = "mml-floating-badge";
    badge.innerHTML = `
      <span style="font-size: 14px;">🔮</span>
      <span style="font-size: 12px; font-weight: 600; color: #00d2ff;">Analyzing with Moody Lens CNN...</span>
    `;

    document.body.appendChild(badge);
    positionBadge(badge, target);
    activeFloatingBadge = badge;
  }

  function showFloatingErrorBadge(target, errorMsg) {
    removeFloatingBadge();

    const badge = document.createElement("div");
    badge.className = "mml-floating-badge";
    badge.innerHTML = `
      <span style="font-size: 14px;">⚠️</span>
      <span style="font-size: 11px; color: #ff5277;">${errorMsg}</span>
      <button class="mml-badge-close" title="Dismiss">✕</button>
    `;

    badge.querySelector(".mml-badge-close").onclick = () => removeFloatingBadge();
    document.body.appendChild(badge);
    positionBadge(badge, target);
    activeFloatingBadge = badge;

    setTimeout(() => {
      if (activeFloatingBadge === badge) removeFloatingBadge();
    }, 5000);
  }

  function showFloatingVerdictBadge(target, result, imageUrl) {
    removeFloatingBadge();

    const badge = document.createElement("div");
    badge.className = "mml-floating-badge";

    let pillClass = "real";
    let icon = "🌿";
    if (result.verdict === "AI-GENERATED") {
      pillClass = "fake";
      icon = "🤖";
    } else if (result.verdict === "PARTIALLY MANIPULATED" || result.verdict === "UNCERTAIN") {
      pillClass = "partial";
      icon = "⚠️";
    }

    badge.innerHTML = `
      <span class="mml-badge-pill ${pillClass}">
        ${icon} ${result.confidence_score} ${result.verdict}
      </span>
      <button class="mml-badge-btn" id="mml-btn-open-heatmap">
        🔍 Heatmap & Details
      </button>
      <button class="mml-badge-close" title="Dismiss">✕</button>
    `;

    badge.querySelector(".mml-badge-close").onclick = () => removeFloatingBadge();

    badge.querySelector("#mml-btn-open-heatmap").onclick = async () => {
      // Fetch advanced analysis with Grad-CAM heatmap
      badge.querySelector("#mml-btn-open-heatmap").textContent = "Loading Heatmap...";
      try {
        const advResp = await chrome.runtime.sendMessage({
          action: "ANALYZE_IMAGE",
          imageUrl: imageUrl,
          isAdvanced: true,
        });

        if (advResp && advResp.status === "success") {
          openAdvancedHeatmapModal(imageUrl, advResp.data);
        } else {
          alert(`Failed to load heatmap: ${advResp?.error || "Unknown error"}`);
        }
      } catch (e) {
        alert("Error requesting advanced heatmap.");
      } finally {
        if (badge.isConnected) {
          badge.querySelector("#mml-btn-open-heatmap").textContent = "🔍 Heatmap & Details";
        }
      }
    };

    document.body.appendChild(badge);
    positionBadge(badge, target);
    activeFloatingBadge = badge;
  }

  // ---------------------------------------------------------------------------
  // Advanced Heatmap & Whole-vs-Partial Modal
  // ---------------------------------------------------------------------------
  function openAdvancedHeatmapModal(imageUrl, data) {
    // Remove existing modal if any
    const existing = document.getElementById("mml-advanced-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "mml-advanced-modal";
    overlay.className = "mml-modal-overlay";

    let bannerClass = "authentic";
    let bannerIcon = "✅";
    if (data.manipulation_scope === "entire_image") {
      bannerClass = "entire";
      bannerIcon = "🚨";
    } else if (data.manipulation_scope === "partial") {
      bannerClass = "partial";
      bannerIcon = "⚠️";
    }

    overlay.innerHTML = `
      <div class="mml-modal-card">
        <!-- Header -->
        <div class="mml-modal-header">
          <div class="mml-modal-title-wrap">
            <span class="mml-logo-icon">👁️</span>
            <div>
              <h2 class="mml-modal-title">Mad-Eye Moody Lens: Advanced Deepfake Analysis</h2>
              <p class="mml-modal-subtitle">${data.model_used}</p>
            </div>
          </div>
          <button class="mml-modal-close-btn" id="mml-modal-close" title="Close (ESC)">✕</button>
        </div>

        <!-- Body -->
        <div class="mml-modal-body">
          <!-- Scope Banner -->
          <div class="mml-scope-banner ${bannerClass}">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">${bannerIcon}</span>
              <span class="mml-scope-badge">${data.scope_verdict}</span>
            </div>
            <div class="mml-scope-stats">
              AI Manipulation Area: <strong>${data.ai_area_percentage}%</strong> | Fake Confidence: <strong>${data.confidence_score}</strong>
            </div>
          </div>

          <!-- Heatmap Viewer Section -->
          <div class="mml-viewer-section">
            <div class="mml-viewer-toolbar">
              <div class="mml-slider-wrap">
                <span>Heatmap Opacity:</span>
                <input type="range" id="mml-opacity-slider" min="0" max="100" value="80" />
                <span id="mml-opacity-val">80%</span>
              </div>
              <div class="mml-toggle-wrap">
                <button class="mml-view-btn active" id="mml-view-overlay">Thermal Overlay</button>
                <button class="mml-view-btn" id="mml-view-side">Side-by-Side</button>
              </div>
            </div>

            <!-- Stage 1: Overlay View -->
            <div class="mml-canvas-stage" id="mml-stage-overlay">
              <div class="mml-stage-wrapper" id="mml-stage-wrapper">
                <img class="mml-orig-img" id="mml-img-base" src="${imageUrl}" alt="Analyzed Target" />
                <img class="mml-heat-overlay" id="mml-img-overlay" src="${data.heatmap_overlay_base64}" style="opacity: 0.8;" alt="Grad-CAM Heatmap" />
                <div id="mml-regions-container"></div>
              </div>
            </div>

            <!-- Stage 2: Side-by-Side View (hidden initially) -->
            <div class="mml-side-by-side" id="mml-stage-side" style="display: none;">
              <div class="mml-side-pane">
                <span>ORIGINAL IMAGE</span>
                <img src="${imageUrl}" alt="Original" />
              </div>
              <div class="mml-side-pane">
                <span>GRAD-CAM HEATMAP ACTIVATION</span>
                <img src="${data.blended_image_base64}" alt="Heatmap Blend" />
              </div>
            </div>
          </div>

          <!-- Metrics Grid -->
          <div class="mml-metrics-grid">
            <div class="mml-metric-card">
              <span class="mml-metric-title">Manipulation Scope</span>
              <span class="mml-metric-value ${bannerClass === 'entire' ? 'warn' : (bannerClass === 'partial' ? 'notice' : 'good')}">
                ${data.manipulation_scope.toUpperCase().replace('_', ' ')}
              </span>
            </div>
            <div class="mml-metric-card">
              <span class="mml-metric-title">AI Area Coverage</span>
              <span class="mml-metric-value ${data.ai_area_percentage > 50 ? 'warn' : 'good'}">
                ${data.ai_area_percentage}%
              </span>
            </div>
            <div class="mml-metric-card">
              <span class="mml-metric-title">Overall Probability</span>
              <span class="mml-metric-value ${data.fake_probability > 0.5 ? 'warn' : 'good'}">
                ${data.confidence_score}
              </span>
            </div>
            <div class="mml-metric-card">
              <span class="mml-metric-title">CNN Inference Time</span>
              <span class="mml-metric-value" style="color: #00d2ff;">
                ${data.processing_time_ms} ms
              </span>
            </div>
          </div>

          <!-- Technical Explanation & Legend -->
          <div class="mml-info-row">
            <div class="mml-explanation-box">
              <div class="mml-explanation-title">Technical Findings</div>
              <p class="mml-explanation-text">${data.detailed_explanation}</p>
            </div>
            <div class="mml-legend-box">
              <span class="mml-legend-title">Grad-CAM Heatmap Scale</span>
              <div class="mml-legend-bar"></div>
              <div class="mml-legend-labels">
                <span>Authentic (0%)</span>
                <span>Uncertain</span>
                <span>AI Fake (100%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Render Highlight Bounding Boxes over AI-manipulated regions
    const baseImg = overlay.querySelector("#mml-img-base");
    const regionsContainer = overlay.querySelector("#mml-regions-container");

    function renderBoundingBoxes() {
      if (!baseImg || !regionsContainer) return;
      regionsContainer.innerHTML = "";

      const displayedW = baseImg.clientWidth;
      const displayedH = baseImg.clientHeight;
      const naturalW = baseImg.naturalWidth || displayedW;
      const naturalH = baseImg.naturalHeight || displayedH;

      const scaleX = displayedW / naturalW;
      const scaleY = displayedH / naturalH;

      if (data.highlighted_regions && data.highlighted_regions.length > 0) {
        data.highlighted_regions.forEach((region) => {
          const [bx, by, bw, bh] = region.box;
          const boxElem = document.createElement("div");
          boxElem.className = "mml-region-box";
          boxElem.style.left = `${bx * scaleX}px`;
          boxElem.style.top = `${by * scaleY}px`;
          boxElem.style.width = `${bw * scaleX}px`;
          boxElem.style.height = `${bh * scaleY}px`;

          boxElem.innerHTML = `
            <div class="mml-region-label">${region.label} (${Math.round(region.fake_probability * 100)}%)</div>
          `;

          boxElem.title = region.description;
          regionsContainer.appendChild(boxElem);
        });
      }
    }

    if (baseImg.complete) {
      renderBoundingBoxes();
    } else {
      baseImg.onload = renderBoundingBoxes;
    }

    // Modal Interaction Handlers
    const slider = overlay.querySelector("#mml-opacity-slider");
    const overlayImg = overlay.querySelector("#mml-img-overlay");
    const opacityVal = overlay.querySelector("#mml-opacity-val");

    slider.oninput = (e) => {
      const val = e.target.value;
      overlayImg.style.opacity = val / 100.0;
      opacityVal.textContent = `${val}%`;
    };

    // Toggle views (Overlay vs Side-by-Side)
    const btnOverlay = overlay.querySelector("#mml-view-overlay");
    const btnSide = overlay.querySelector("#mml-view-side");
    const stageOverlay = overlay.querySelector("#mml-stage-overlay");
    const stageSide = overlay.querySelector("#mml-stage-side");

    btnOverlay.onclick = () => {
      btnOverlay.classList.add("active");
      btnSide.classList.remove("active");
      stageOverlay.style.display = "flex";
      stageSide.style.display = "none";
      renderBoundingBoxes();
    };

    btnSide.onclick = () => {
      btnSide.classList.add("active");
      btnOverlay.classList.remove("active");
      stageOverlay.style.display = "none";
      stageSide.style.display = "grid";
    };

    // Close Modal
    function closeModal() {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") closeModal();
    }

    overlay.querySelector("#mml-modal-close").onclick = closeModal;
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };
    document.addEventListener("keydown", onKeyDown);
  }

  // ---------------------------------------------------------------------------
  // Context Menu Trigger Listener
  // ---------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "TRIGGER_CONTEXT_ANALYSIS" && message.srcUrl) {
      // Find matching img on page or trigger directly
      const imgs = Array.from(document.querySelectorAll("img"));
      const match = imgs.find((img) => (img.currentSrc || img.src) === message.srcUrl) || imgs[0];
      if (match) {
        triggerScan(match);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Register Listeners on Page
  // ---------------------------------------------------------------------------
  document.addEventListener("mousedown", handlePointerDown, { passive: true });
  document.addEventListener("mousemove", handlePointerMove, { passive: true });
  document.addEventListener("mouseup", cancelHold, { passive: true });

  document.addEventListener("touchstart", handlePointerDown, { passive: true });
  document.addEventListener("touchmove", handlePointerMove, { passive: true });
  document.addEventListener("touchend", cancelHold, { passive: true });
  document.addEventListener("touchcancel", cancelHold, { passive: true });

  console.log("👁️ [Mad-Eye Moody Lens] Live deepfake tracking active. Long press (>1.0s) on any image to analyze.");
})();

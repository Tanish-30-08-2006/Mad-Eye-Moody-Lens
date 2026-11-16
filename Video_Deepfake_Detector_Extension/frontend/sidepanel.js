document.addEventListener("DOMContentLoaded", async () => {
  // Elements - Tabs
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  const historyCountBadge = document.getElementById("historyCountBadge");

  // Elements - Analysis
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const videoUrlInput = document.getElementById("videoUrlInput");
  const loadUrlBtn = document.getElementById("loadUrlBtn");
  const playerSection = document.getElementById("playerSection");
  const videoPreview = document.getElementById("videoPreview");
  const metaRes = document.getElementById("metaRes");
  const metaDuration = document.getElementById("metaDuration");
  const metaSize = document.getElementById("metaSize");
  const filmstripSection = document.getElementById("filmstripSection");
  const filmstripList = document.getElementById("filmstripList");
  const runAnalysisBtn = document.getElementById("runAnalysisBtn");
  const clearBtn = document.getElementById("clearBtn");

  // Elements - Results
  const verdictPill = document.getElementById("verdictPill");
  const verdictBanner = document.getElementById("verdictBanner");
  const confidenceVal = document.getElementById("confidenceVal");
  const fakeScoreVal = document.getElementById("fakeScoreVal");
  const modelNameVal = document.getElementById("modelNameVal");
  const latencyVal = document.getElementById("latencyVal");
  const explanationText = document.getElementById("explanationText");
  const rawResponseText = document.getElementById("rawResponseText");
  const copyReportBtn = document.getElementById("copyReportBtn");

  // Elements - History
  const historySearchInput = document.getElementById("historySearchInput");
  const filterButtons = document.querySelectorAll(".filter-btn");
  const historyList = document.getElementById("historyList");
  const countAll = document.getElementById("countAll");
  const countFake = document.getElementById("countFake");
  const countReal = document.getElementById("countReal");
  const countUncertain = document.getElementById("countUncertain");
  const exportHistoryBtn = document.getElementById("exportHistoryBtn");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  // Elements - Settings
  const settingsApiKey = document.getElementById("settingsApiKey");
  const toggleSettingsKeyVis = document.getElementById("toggleSettingsKeyVis");
  const saveSettingsKeyBtn = document.getElementById("saveSettingsKeyBtn");
  const testSettingsKeyBtn = document.getElementById("testSettingsKeyBtn");
  const settingsMsg = document.getElementById("settingsMsg");
  const activeProviderSelect = document.getElementById("activeProviderSelect");
  const openAdvancedOptionsBtn = document.getElementById("openAdvancedOptionsBtn");
  const settingsHoverToggle = document.getElementById("settingsHoverToggle");
  const settingsAutoHoverToggle = document.getElementById("settingsAutoHoverToggle");
  const globalProviderBadge = document.getElementById("globalProviderBadge");

  // Internal state
  let currentFile = null;
  let currentVideoUrl = "";
  let extractedFrames = []; // [{ timestamp, dataUri }]
  let currentReport = null;
  let allHistoryItems = [];
  let currentFilter = "all";

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      tabButtons.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(target).classList.add("active");
      if (target === "tab-history") renderHistory();
    });
  });

  // Load Settings
  async function loadSettings() {
    const s = await chrome.storage.local.get([
      "apiKey", "activeProvider", "hoverScanEnabled", "autoScanOnHover",
      "pendingReviewVideo"
    ]);

    if (s.apiKey) settingsApiKey.value = s.apiKey;
    if (s.activeProvider) {
      activeProviderSelect.value = s.activeProvider;
      globalProviderBadge.textContent = s.activeProvider === "custom" ? "Custom REST" : "BitMind Subnet 34";
    }
    settingsHoverToggle.checked = s.hoverScanEnabled ?? true;
    settingsAutoHoverToggle.checked = s.autoScanOnHover ?? true;

    // Check if opened from context menu
    if (s.pendingReviewVideo) {
      videoUrlInput.value = s.pendingReviewVideo;
      await chrome.storage.local.remove("pendingReviewVideo");
      loadVideoFromUrl(s.pendingReviewVideo);
    }
  }
  await loadSettings();

  // Drag and drop handlers
  ["dragenter", "dragover"].forEach(name => {
    dropzone.addEventListener(name, e => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(name => {
    dropzone.addEventListener(name, e => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", e => {
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      handleVideoFile(file);
    }
  });
  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", e => {
    if (e.target.files[0]) handleVideoFile(e.target.files[0]);
  });

  // Handle local video file
  async function handleVideoFile(file) {
    currentFile = file;
    currentVideoUrl = "";
    videoUrlInput.value = "";
    metaSize.textContent = `Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    const blobUrl = URL.createObjectURL(file);
    videoPreview.src = blobUrl;
    playerSection.classList.remove("hidden");

    await processLoadedVideo(file.name);
  }

  // Load video from public URL
  loadUrlBtn.addEventListener("click", () => {
    const url = videoUrlInput.value.trim();
    if (url) loadVideoFromUrl(url);
  });

  async function loadVideoFromUrl(url) {
    currentFile = null;
    currentVideoUrl = url;
    metaSize.textContent = "Source: Remote URL";

    videoPreview.crossOrigin = "anonymous";
    videoPreview.src = url;
    playerSection.classList.remove("hidden");

    await processLoadedVideo(url.split("/").pop() || "Remote Video");
  }

  // Extract frames and metadata
  async function processLoadedVideo(title) {
    runAnalysisBtn.disabled = true;
    runAnalysisBtn.innerHTML = `<span>Extracting Keyframes...</span>`;
    extractedFrames = [];
    filmstripList.innerHTML = "";

    await new Promise(resolve => {
      if (videoPreview.readyState >= 1) resolve();
      else videoPreview.onloadedmetadata = resolve;
    });

    const duration = videoPreview.duration || 5;
    metaDuration.textContent = `Duration: ${Math.round(duration)}s`;
    metaRes.textContent = `${videoPreview.videoWidth} × ${videoPreview.videoHeight}`;

    // Sample 5 timestamps across video (10%, 25%, 50%, 75%, 90%)
    const samplePoints = [0.1, 0.25, 0.5, 0.75, 0.9].map(p => Number((duration * p).toFixed(2)));

    const canvas = document.createElement("canvas");
    const maxDim = 640;
    let w = videoPreview.videoWidth || 640;
    let h = videoPreview.videoHeight || 360;
    if (w > maxDim) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    for (const time of samplePoints) {
      try {
        videoPreview.currentTime = time;
        await new Promise(r => { videoPreview.onseeked = r; });
        ctx.drawImage(videoPreview, 0, 0, w, h);
        const dataUri = canvas.toDataURL("image/jpeg", 0.85);
        extractedFrames.push({ timestamp: time, dataUri });

        // Add to filmstrip
        const thumb = document.createElement("div");
        thumb.className = "filmstrip-thumb";
        thumb.innerHTML = `
          <img src="${dataUri}" alt="Frame at ${time}s">
          <span class="filmstrip-time">${time}s</span>
        `;
        filmstripList.appendChild(thumb);
      } catch (err) {
        console.warn("Could not capture frame at", time, err);
      }
    }

    if (extractedFrames.length > 0) {
      filmstripSection.classList.remove("hidden");
    }

    videoPreview.currentTime = 0;
    runAnalysisBtn.disabled = false;
    runAnalysisBtn.innerHTML = `<span>Analyze Video with BitMind</span>`;
  }

  // Clear analysis
  clearBtn.addEventListener("click", () => {
    currentFile = null;
    currentVideoUrl = "";
    extractedFrames = [];
    currentReport = null;
    videoPreview.src = "";
    playerSection.classList.add("hidden");
    filmstripSection.classList.add("hidden");
    runAnalysisBtn.disabled = true;

    verdictPill.textContent = "Not analyzed";
    verdictPill.className = "pill muted";
    verdictBanner.className = "verdict-banner empty";
    verdictBanner.textContent = "Upload or select a video to evaluate authenticity with BitMind deepfake models.";
    confidenceVal.textContent = "—";
    fakeScoreVal.textContent = "—";
    modelNameVal.textContent = "—";
    latencyVal.textContent = "—";
    explanationText.textContent = "Analysis signals and frame artifacts will be detailed here.";
    rawResponseText.textContent = "{ }";
  });

  // Run BitMind Analysis
  runAnalysisBtn.addEventListener("click", async () => {
    runAnalysisBtn.disabled = true;
    runAnalysisBtn.innerHTML = `<span class="spinner"></span> Analyzing with BitMind...`;
    verdictBanner.className = "verdict-banner";
    verdictBanner.textContent = "Querying BitMind Oracle Subnet 34 models...";

    const payload = {
      videoUrl: currentVideoUrl,
      frameDataUri: extractedFrames[0]?.dataUri || "",
      frames: extractedFrames,
      title: currentFile?.name || currentVideoUrl.split("/").pop() || "Uploaded Video",
      videoDuration: Math.round(videoPreview.duration || 0),
      scanType: currentFile ? "upload" : "url_scan"
    };

    chrome.runtime.sendMessage({ type: "SCAN_VIDEO", payload }, response => {
      runAnalysisBtn.disabled = false;
      runAnalysisBtn.innerHTML = `<span>Analyze Video with BitMind</span>`;

      if (!response?.ok) {
        verdictBanner.className = "verdict-banner empty";
        verdictBanner.textContent = "Error: " + (response?.error || "Detection failed.");
        verdictPill.textContent = "Failed";
        verdictPill.className = "pill muted";
        return;
      }

      displayResult(response.data);
      renderHistory();
    });
  });

  // Display results in UI
  function displayResult(res) {
    currentReport = res;
    const isFake = res.verdict === "likely_ai";
    const isReal = res.verdict === "likely_not_ai";
    const pct = Math.round((res.confidence || 0.95) * 100);

    if (isFake) {
      verdictPill.textContent = "DEEPFAKE";
      verdictPill.className = "pill fake";
      verdictBanner.className = "verdict-banner fake";
      verdictBanner.textContent = `🚨 AI DEEPFAKE DETECTED (${pct}% Synthetic Confidence)`;
      fakeScoreVal.textContent = `${pct}% Synthetic`;
      fakeScoreVal.style.color = "#f87171";
    } else if (isReal) {
      verdictPill.textContent = "AUTHENTIC";
      verdictPill.className = "pill real";
      verdictBanner.className = "verdict-banner real";
      verdictBanner.textContent = `✅ AUTHENTIC VIDEO VERIFIED (${pct}% Human/Real)`;
      fakeScoreVal.textContent = `${100 - pct}% Synthetic`;
      fakeScoreVal.style.color = "#34d399";
    } else {
      verdictPill.textContent = "UNCERTAIN";
      verdictPill.className = "pill uncertain";
      verdictBanner.className = "verdict-banner uncertain";
      verdictBanner.textContent = `⚠️ INCONCLUSIVE CONFIDENCE (${pct}%)`;
      fakeScoreVal.textContent = `${pct}%`;
      fakeScoreVal.style.color = "#fbbf24";
    }

    confidenceVal.textContent = `${pct}%`;
    modelNameVal.textContent = res.model || "BitMind Oracle 34";
    latencyVal.textContent = res.durationMs ? `${res.durationMs}ms` : "Fast";
    explanationText.textContent = res.explanation || "Detection completed.";
    rawResponseText.textContent = JSON.stringify(res.rawResponse || res, null, 2);
  }

  // Copy report
  copyReportBtn.addEventListener("click", () => {
    if (!currentReport) return;
    const summary = `--- BitMind Deepfake Detection Report ---\n` +
      `Target: ${currentReport.title || "Video"}\n` +
      `Verdict: ${currentReport.verdict.toUpperCase()}\n` +
      `Confidence: ${Math.round((currentReport.confidence || 0) * 100)}%\n` +
      `Detector: ${currentReport.model}\n` +
      `Explanation: ${currentReport.explanation}\n` +
      `Timestamp: ${new Date().toISOString()}`;

    navigator.clipboard.writeText(summary);
    copyReportBtn.textContent = "✓ Report Copied to Clipboard";
    setTimeout(() => { copyReportBtn.textContent = "Copy Forensic Report"; }, 2000);
  });

  // History System
  async function renderHistory() {
    const history = await chrome.runtime.sendMessage({ type: "GET_HISTORY" });
    allHistoryItems = history?.data || [];
    historyCountBadge.textContent = allHistoryItems.length;

    // Update counts
    countAll.textContent = allHistoryItems.length;
    countFake.textContent = allHistoryItems.filter(h => h.verdict === "likely_ai").length;
    countReal.textContent = allHistoryItems.filter(h => h.verdict === "likely_not_ai").length;
    countUncertain.textContent = allHistoryItems.filter(h => h.verdict === "uncertain").length;

    applyHistoryFilters();
  }

  function applyHistoryFilters() {
    const q = historySearchInput.value.trim().toLowerCase();
    let filtered = allHistoryItems;

    if (currentFilter === "fake") filtered = filtered.filter(h => h.verdict === "likely_ai");
    else if (currentFilter === "real") filtered = filtered.filter(h => h.verdict === "likely_not_ai");
    else if (currentFilter === "uncertain") filtered = filtered.filter(h => h.verdict === "uncertain");

    if (q) {
      filtered = filtered.filter(h =>
        (h.title && h.title.toLowerCase().includes(q)) ||
        (h.sourceUrl && h.sourceUrl.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      historyList.innerHTML = `<div class="empty-history">No matching tested videos found.</div>`;
      return;
    }

    historyList.innerHTML = "";
    filtered.forEach(item => {
      const isFake = item.verdict === "likely_ai";
      const isReal = item.verdict === "likely_not_ai";
      const pct = Math.round((item.confidence || 0.95) * 100);

      const el = document.createElement("div");
      el.className = "history-item";
      el.innerHTML = `
        <div class="history-thumb">
          ${item.thumbnail ? `<img src="${item.thumbnail}">` : "🎬"}
        </div>
        <div class="history-body">
          <div class="history-title" title="${item.title || "Video"}">${item.title || "Video Scan"}</div>
          <div class="history-meta">
            <span>${item.dateFormatted || new Date(item.timestamp).toLocaleDateString()}</span>
            <span>•</span>
            <span>${item.type === "upload" ? "Upload" : "Hover Scan"}</span>
          </div>
          <div class="history-verdict-row">
            <span class="pill ${isFake ? "fake" : isReal ? "real" : "uncertain"}">
              ${isFake ? "Deepfake" : isReal ? "Authentic" : "Uncertain"} (${pct}%)
            </span>
            <button class="btn-icon-delete delete-item-btn" data-id="${item.id}" title="Delete record" aria-label="Delete record">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
      `;

      el.querySelector(".delete-item-btn").addEventListener("click", async e => {
        e.stopPropagation();
        await chrome.runtime.sendMessage({ type: "DELETE_HISTORY_ITEM", id: item.id });
        renderHistory();
      });

      // Clicking an item inspects it
      el.addEventListener("click", () => {
        displayResult(item);
        tabButtons[0].click(); // switch to analysis tab
      });

      historyList.appendChild(el);
    });
  }

  historySearchInput.addEventListener("input", applyHistoryFilters);
  filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      filterButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      applyHistoryFilters();
    });
  });

  // Export history JSON
  exportHistoryBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(allHistoryItems, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bitmind_video_history_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Clear history
  clearHistoryBtn.addEventListener("click", async () => {
    if (confirm("Are you sure you want to clear all tested video history?")) {
      await chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" });
      renderHistory();
    }
  });

  // Settings Handlers
  toggleSettingsKeyVis.addEventListener("click", () => {
    settingsApiKey.type = settingsApiKey.type === "password" ? "text" : "password";
  });

  saveSettingsKeyBtn.addEventListener("click", async () => {
    const key = settingsApiKey.value.trim();
    await chrome.storage.local.set({ apiKey: key, apiKeyUpdatedAt: Date.now() });
    settingsMsg.textContent = "✓ BitMind API Key saved!";
    settingsMsg.style.color = "#34d399";
  });

  testSettingsKeyBtn.addEventListener("click", () => {
    const key = settingsApiKey.value.trim();
    if (!key) {
      settingsMsg.textContent = "Please enter an API key first.";
      settingsMsg.style.color = "#f87171";
      return;
    }
    testSettingsKeyBtn.disabled = true;
    testSettingsKeyBtn.textContent = "Testing...";

    chrome.runtime.sendMessage({ type: "TEST_PROVIDER_KEY", apiKey: key }, response => {
      testSettingsKeyBtn.disabled = false;
      testSettingsKeyBtn.textContent = "Test Connection";
      if (response?.ok && response.data?.success) {
        settingsMsg.textContent = "✓ Connected to BitMind API successfully!";
        settingsMsg.style.color = "#34d399";
      } else {
        settingsMsg.textContent = "✕ " + (response?.error || "Connection failed.");
        settingsMsg.style.color = "#f87171";
      }
    });
  });

  activeProviderSelect.addEventListener("change", async () => {
    const val = activeProviderSelect.value;
    await chrome.storage.local.set({ activeProvider: val });
    globalProviderBadge.textContent = val === "custom" ? "Custom REST" : "BitMind Subnet 34";
  });

  settingsHoverToggle.addEventListener("change", async () => {
    await chrome.storage.local.set({ hoverScanEnabled: settingsHoverToggle.checked });
  });

  settingsAutoHoverToggle.addEventListener("change", async () => {
    await chrome.storage.local.set({ autoScanOnHover: settingsAutoHoverToggle.checked });
  });

  openAdvancedOptionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Initial history load
  renderHistory();
});

document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("apiKeyInput");
  const toggleKeyVisibility = document.getElementById("toggleKeyVisibility");
  const saveKeyBtn = document.getElementById("saveKeyBtn");
  const testKeyBtn = document.getElementById("testKeyBtn");
  const keyStatusBadge = document.getElementById("keyStatusBadge");
  const keyMsg = document.getElementById("keyMsg");

  const hoverScanBadge = document.getElementById("hoverScanBadge");
  const toggleHoverScanBtn = document.getElementById("toggleHoverScanBtn");
  const autoHoverToggle = document.getElementById("autoHoverToggle");
  const hoverDelaySelect = document.getElementById("hoverDelaySelect");

  const quickVideoInput = document.getElementById("quickVideoInput");
  const quickUploadLabel = document.getElementById("quickUploadLabel");
  const quickScanResult = document.getElementById("quickScanResult");
  const openSidePanelBtn = document.getElementById("openSidePanelBtn");

  // Load existing settings
  const settings = await chrome.storage.local.get([
    "apiKey", "hoverScanEnabled", "autoScanOnHover", "hoverDelayMs"
  ]);

  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
    keyStatusBadge.textContent = "Saved";
    keyStatusBadge.className = "pill active";
  } else {
    keyStatusBadge.textContent = "Missing";
    keyStatusBadge.className = "pill muted";
  }

  updateHoverUi(settings.hoverScanEnabled ?? true);
  autoHoverToggle.checked = settings.autoScanOnHover ?? true;
  if (settings.hoverDelayMs) {
    hoverDelaySelect.value = String(settings.hoverDelayMs);
  }

  function updateHoverUi(isEnabled) {
    if (isEnabled) {
      hoverScanBadge.textContent = "Active";
      hoverScanBadge.className = "pill active";
      toggleHoverScanBtn.textContent = "Disable Hover Detection";
      toggleHoverScanBtn.className = "secondary full mt-12";
    } else {
      hoverScanBadge.textContent = "Disabled";
      hoverScanBadge.className = "pill muted";
      toggleHoverScanBtn.textContent = "Enable Hover Detection";
      toggleHoverScanBtn.className = "primary full mt-12";
    }
  }

  // Toggle API Key visibility
  toggleKeyVisibility.addEventListener("click", () => {
    apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
  });

  // Save API Key
  saveKeyBtn.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    await chrome.storage.local.set({
      apiKey: key,
      apiKeyUpdatedAt: Date.now()
    });
    keyStatusBadge.textContent = key ? "Saved" : "Missing";
    keyStatusBadge.className = key ? "pill active" : "pill muted";
    keyMsg.textContent = key ? "API key successfully saved." : "API key removed.";
    keyMsg.style.color = "#34d399";
  });

  // Test API Key
  testKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      keyMsg.textContent = "Please enter an API key first.";
      keyMsg.style.color = "#f87171";
      return;
    }
    testKeyBtn.textContent = "Testing...";
    testKeyBtn.disabled = true;

    chrome.runtime.sendMessage({ type: "TEST_PROVIDER_KEY", apiKey: key }, response => {
      testKeyBtn.disabled = false;
      testKeyBtn.textContent = "Test Key";
      if (response?.ok && response.data?.success) {
        keyMsg.textContent = "✓ BitMind API verified successfully!";
        keyMsg.style.color = "#34d399";
      } else {
        keyMsg.textContent = "✕ Error: " + (response?.error || "Key validation failed.");
        keyMsg.style.color = "#f87171";
      }
    });
  });

  // Hover detection toggle
  toggleHoverScanBtn.addEventListener("click", async () => {
    const current = (await chrome.storage.local.get("hoverScanEnabled")).hoverScanEnabled ?? true;
    const updated = !current;
    await chrome.storage.local.set({ hoverScanEnabled: updated });
    updateHoverUi(updated);
  });

  autoHoverToggle.addEventListener("change", async () => {
    await chrome.storage.local.set({ autoScanOnHover: autoHoverToggle.checked });
  });

  hoverDelaySelect.addEventListener("change", async () => {
    await chrome.storage.local.set({ hoverDelayMs: Number(hoverDelaySelect.value) });
  });

  // Quick video file upload & scan
  quickVideoInput.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;

    quickUploadLabel.textContent = `Analyzing: ${file.name.slice(0, 20)}...`;
    quickScanResult.classList.remove("hidden");
    quickScanResult.innerHTML = `<span style="color: #06b6d4;">⏳ Extracting keyframe & running BitMind scan...</span>`;

    try {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = URL.createObjectURL(file);
      video.muted = true;

      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;
      });

      // Seek to middle
      video.currentTime = Math.min(1.0, video.duration / 2);
      await new Promise(resolve => { video.onseeked = resolve; });

      const canvas = document.createElement("canvas");
      canvas.width = Math.min(640, video.videoWidth || 640);
      canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth) || 360);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameDataUri = canvas.toDataURL("image/jpeg", 0.85);

      URL.revokeObjectURL(video.src);

      const payload = {
        frameDataUri,
        title: file.name,
        videoDuration: Math.round(video.duration),
        scanType: "upload"
      };

      chrome.runtime.sendMessage({ type: "SCAN_VIDEO", payload }, response => {
        if (!response?.ok) {
          quickScanResult.innerHTML = `<span style="color: #ef4444;">✕ ${response?.error || "Analysis failed"}</span>`;
          quickUploadLabel.textContent = "Choose another video";
          return;
        }

        const res = response.data;
        const pct = Math.round((res.confidence || 0.9) * 100);
        const isFake = res.verdict === "likely_ai";

        quickScanResult.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong>${isFake ? "🚨 DEEPFAKE DETECTED" : "✅ AUTHENTIC"}</strong>
            <span style="font-weight:700; color:${isFake ? "#ef4444" : "#10b981"}">${pct}%</span>
          </div>
          <p style="font-size:11.5px; color:#cbd5e1;">${res.explanation || ""}</p>
        `;
        quickUploadLabel.textContent = `Completed: ${file.name.slice(0, 18)}`;
      });
    } catch (err) {
      quickScanResult.innerHTML = `<span style="color: #ef4444;">Error processing video: ${err.message}</span>`;
      quickUploadLabel.textContent = "Choose or drag video";
    }
  });

  // Open Side Panel
  openSidePanelBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (chrome.sidePanel?.open && tab?.id) {
      chrome.sidePanel.open({ tabId: tab.id });
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL("frontend/sidepanel.html") });
    }
  });
});

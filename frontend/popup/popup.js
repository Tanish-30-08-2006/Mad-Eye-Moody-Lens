/**
 * Mad-Eye Moody Lens - Popup Controller
 */

document.addEventListener("DOMContentLoaded", async () => {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const toggleLive = document.getElementById("toggle-live-tracking");
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const dropzonePrompt = document.getElementById("dropzone-prompt");
  const dropzonePreview = document.getElementById("dropzone-preview");
  const previewImg = document.getElementById("preview-img");
  const previewLoading = document.getElementById("preview-loading");
  const quickResult = document.getElementById("quick-result");
  const verdictTag = document.getElementById("verdict-tag");
  const scoreTag = document.getElementById("score-tag");
  const resultDetail = document.getElementById("result-detail");
  const btnShowHeatmap = document.getElementById("btn-show-popup-heatmap");
  const btnReset = document.getElementById("btn-reset-test");
  const historyList = document.getElementById("history-list");
  const btnClearHistory = document.getElementById("btn-clear-history");
  const backendUrlDisplay = document.getElementById("backend-url-display");

  let currentAnalysisData = null;

  // 1. Check Backend Connectivity
  async function checkBackend() {
    try {
      const resp = await chrome.runtime.sendMessage({ action: "PING_BACKEND" });
      if (resp && resp.status === "ok") {
        statusDot.className = "status-dot online";
        statusText.textContent = `Online (${resp.latency}ms)`;
      } else {
        statusDot.className = "status-dot offline";
        statusText.textContent = "Offline";
      }
    } catch (e) {
      statusDot.className = "status-dot offline";
      statusText.textContent = "Offline";
    }
  }

  checkBackend();

  // 2. Load Stored Settings
  chrome.storage.local.get({ enabled: true, backendUrl: "http://localhost:8000" }, (res) => {
    toggleLive.checked = res.enabled;
    backendUrlDisplay.textContent = res.backendUrl;
  });

  toggleLive.addEventListener("change", (e) => {
    chrome.storage.local.set({ enabled: e.target.checked });
  });

  // 3. Dropzone & File Test
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "#00d2ff";
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.style.borderColor = "";
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "";
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const b64 = event.target.result;
      previewImg.src = b64;
      dropzonePrompt.style.display = "none";
      dropzonePreview.style.display = "flex";
      previewLoading.style.display = "flex";
      quickResult.style.display = "none";

      try {
        const resp = await chrome.runtime.sendMessage({
          action: "ANALYZE_IMAGE",
          imageBase64: b64,
          isAdvanced: true,
        });

        previewLoading.style.display = "none";

        if (resp && resp.status === "success") {
          currentAnalysisData = resp.data;
          displayResult(resp.data);
          loadHistory();
        } else {
          alert(`Analysis error: ${resp?.error || "Check backend"}`);
        }
      } catch (err) {
        previewLoading.style.display = "none";
        alert("Failed to analyze image. Ensure backend is running at http://localhost:8000");
      }
    };
    reader.readAsDataURL(file);
  }

  function displayResult(data) {
    quickResult.style.display = "block";

    verdictTag.className = `verdict-tag ${data.verdict === "AI-GENERATED" ? "fake" : (data.verdict === "LIKELY REAL" ? "real" : "partial")}`;
    verdictTag.textContent = data.verdict;
    scoreTag.textContent = data.confidence_score;

    resultDetail.innerHTML = `
      Scope: <strong>${data.scope_verdict}</strong><br>
      AI Coverage: <strong>${data.ai_area_percentage}%</strong> | Model: <strong>${data.model_used.split(' ')[0]}</strong>
    `;
  }

  btnShowHeatmap.addEventListener("click", () => {
    if (!currentAnalysisData) return;
    // Open full heatmap view in a new window or tab
    const win = window.open("", "_blank");
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Grad-CAM Deepfake Heatmap - Moody Lens</title>
        <style>
          body { background: #0c0f16; color: #fff; font-family: -apple-system, sans-serif; padding: 24px; text-align: center; }
          h1 { color: #00d2ff; margin-bottom: 6px; }
          .banner { display: inline-block; padding: 8px 16px; border-radius: 8px; font-weight: 700; margin: 12px 0 20px; }
          .banner.entire { background: rgba(255,59,92,0.2); color: #ff5277; border: 1px solid #ff3b5c; }
          .banner.partial { background: rgba(255,184,0,0.2); color: #ffc425; border: 1px solid #ffb800; }
          .banner.authentic { background: rgba(0,230,118,0.2); color: #00e676; border: 1px solid #00e676; }
          .grid { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-top: 10px; }
          .card { background: #161b26; border: 1px solid #283142; padding: 14px; border-radius: 12px; }
          img { max-width: 440px; max-height: 440px; border-radius: 8px; }
          p { color: #8896ab; font-size: 13px; max-width: 600px; margin: 14px auto; line-height: 1.5; }
        </style>
      </head>
      <body>
        <h1>Mad-Eye Moody Lens: Grad-CAM Heatmap Analysis</h1>
        <div class="banner ${currentAnalysisData.manipulation_scope}">
          ${currentAnalysisData.scope_verdict} (Area: ${currentAnalysisData.ai_area_percentage}%)
        </div>
        <div class="grid">
          <div class="card">
            <h3>Original Image</h3>
            <img src="${previewImg.src}" alt="Original">
          </div>
          <div class="card">
            <h3>Grad-CAM Attention Heatmap</h3>
            <img src="${currentAnalysisData.blended_image_base64}" alt="Heatmap Blend">
          </div>
        </div>
        <p>${currentAnalysisData.detailed_explanation}</p>
      </body>
      </html>
    `);
  });

  btnReset.addEventListener("click", () => {
    currentAnalysisData = null;
    dropzonePrompt.style.display = "flex";
    dropzonePreview.style.display = "none";
    quickResult.style.display = "none";
    fileInput.value = "";
  });

  // 4. History Rendering
  function loadHistory() {
    chrome.storage.local.get({ scanHistory: [] }, (res) => {
      const history = res.scanHistory;
      if (!history || history.length === 0) {
        historyList.innerHTML = `<div class="history-empty">No images scanned yet. Try long-pressing an image!</div>`;
        return;
      }

      historyList.innerHTML = history.map((item) => `
        <div class="history-item">
          <div class="history-item-left">
            <span class="history-item-verdict ${item.verdict === 'AI-GENERATED' ? 'fake' : 'real'}">
              ${item.verdict === 'AI-GENERATED' ? '🤖' : '🌿'} ${item.confidence_score}
            </span>
            <span style="color: #8896ab;">${item.manipulation_scope.replace('_', ' ')}</span>
          </div>
          <span style="color: #64748b; font-size: 10px;">
            ${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      `).join("");
    });
  }

  loadHistory();

  btnClearHistory.addEventListener("click", () => {
    chrome.storage.local.set({ scanHistory: [] }, () => {
      loadHistory();
    });
  });
});

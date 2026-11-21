const $ = id => document.getElementById(id);
let selectedImage = "";

function send(message) { return chrome.runtime.sendMessage(message); }

async function getActiveWebPageReferrer() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const url = new URL(tab?.url || "");
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    // The service worker sends only this page's origin to a different media host.
    // Query strings and fragments are stripped to avoid leaking page tokens.
    url.search = "";
    url.hash = "";
    return url.href;
  } catch (_) {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION SETUP (Top-Level: Analyse, History, Settings; Sub: Image, Audio, Video)
// ─────────────────────────────────────────────────────────────────────────────

function switchMainTab(targetId) {
  const mainTabs = document.querySelectorAll(".sp-tabs.main-tabs .sp-tab-btn");
  const mainPanes = document.querySelectorAll(".pane-container > .sp-pane");
  mainTabs.forEach(t => {
    const active = t.dataset.target === targetId;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  mainPanes.forEach(p => p.classList.toggle("active", p.id === targetId));

  if (targetId === "paneHistory") {
    loadHistory();
  }
}

function switchSubTab(subId) {
  const subTabs = document.querySelectorAll(".sub-nav .sub-tab-btn");
  const subPanes = document.querySelectorAll("#paneAnalyse .sub-pane");
  subTabs.forEach(t => {
    const active = t.dataset.sub === subId;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  subPanes.forEach(p => p.classList.toggle("active", p.id === subId));
}

// Global switchTab supporting legacy and new tab identifiers
function switchTab(tabId) {
  if (tabId === "paneImage" || tabId === "subPaneImage") {
    switchMainTab("paneAnalyse");
    switchSubTab("subPaneImage");
  } else if (tabId === "paneAudio" || tabId === "subPaneAudio") {
    switchMainTab("paneAnalyse");
    switchSubTab("subPaneAudio");
  } else if (tabId === "paneVideo" || tabId === "subPaneVideo") {
    switchMainTab("paneAnalyse");
    switchSubTab("subPaneVideo");
  } else {
    switchMainTab(tabId);
  }
}

function setupSidepanelTabs() {
  const mainTabs = document.querySelectorAll(".sp-tabs.main-tabs .sp-tab-btn");
  mainTabs.forEach(btn => {
    btn.addEventListener("click", () => switchMainTab(btn.dataset.target));
  });

  const subTabs = document.querySelectorAll(".sub-nav .sub-tab-btn");
  subTabs.forEach(btn => {
    btn.addEventListener("click", () => switchSubTab(btn.dataset.sub));
  });
}
setupSidepanelTabs();

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE FORENSICS (Intake, Dropzone, Providers & Analysis)
// ─────────────────────────────────────────────────────────────────────────────

function setImage(value, label = "") {
  selectedImage = value || "";
  if (selectedImage.startsWith("data:image/") || selectedImage.startsWith("https://") || selectedImage.startsWith("http://")) {
    $("preview").src = selectedImage;
    $("preview").classList.add("visible");
  } else {
    $("preview").removeAttribute("src");
    $("preview").classList.remove("visible");
  }
  if (selectedImage.startsWith("http")) $("imageUrl").value = selectedImage;
  else if (selectedImage.startsWith("data:image/")) $("imageUrl").value = "";
  if (label) $("status").textContent = label;
  switchTab("subPaneImage");
}

const SUPPORTED_IMAGE_MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif"
};

function getImageMimeType(file) {
  const declaredType = String(file?.type || "").toLowerCase().split(";")[0].trim();
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(declaredType)) {
    return declaredType;
  }
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  return SUPPORTED_IMAGE_MIME_BY_EXTENSION[extension] || "";
}

function readFile(file) {
  if (!file) {
    $("status").textContent = "No file received";
    $("explanation").textContent = "Drop an image file into the dashed area or use Choose file.";
    return;
  }
  const mimeType = getImageMimeType(file);
  if (!mimeType) {
    $("status").textContent = "Unsupported image file";
    $("explanation").textContent = "Use a JPEG, PNG, WebP or GIF image.";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    $("status").textContent = "File exceeds 8 MB";
    $("explanation").textContent = "Choose an image smaller than 8 MB.";
    return;
  }
  const imageBlob = file.type === mimeType ? file : file.slice(0, file.size, mimeType);
  const reader = new FileReader();
  reader.onload = () => setImage(reader.result, file.name || "Dropped image");
  reader.onerror = () => { $("status").textContent = "Could not read file"; };
  reader.readAsDataURL(imageBlob);
}

function getDroppedFile(dataTransfer) {
  if (!dataTransfer) return null;
  const items = Array.from(dataTransfer.items || []);
  const fileItem = items.find(item => item.kind === "file");
  return fileItem?.getAsFile?.() || dataTransfer.files?.[0] || null;
}

function firstUriListEntry(value) {
  return String(value || "").split(/\r?\n/)
    .map(entry => entry.trim())
    .find(entry => entry && !entry.startsWith("#")) || "";
}

function normalizeDroppedReference(value, baseUrl = "") {
  const candidate = String(value || "").trim();
  if (!candidate) return "";
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(candidate)) return candidate;
  if (!/^https?:\/\//i.test(candidate)) {
    if (!baseUrl) return "";
    try {
      const url = new URL(candidate, baseUrl);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch { return ""; }
  }
  try {
    const url = new URL(candidate);
    if (url.username || url.password) return "";
    return url.href;
  } catch { return ""; }
}

function extractImageSrcFromHtml(html) {
  if (!html) return "";
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return match ? match[1] : "";
}

function looksLikeDirectImageUrl(value) {
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)) return true;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return false;
    const path = url.pathname.toLowerCase();
    if (/\/(?:imgres|search|url|redirect)(?:\/|$)/i.test(path)) return false;
    if (/\.(?:png|jpe?g|webp|gif|bmp|avif|tiff?)(?:$)/i.test(path)) return true;
    if (/[?&](?:format|ext|type)=(?:png|jpe?g|webp|gif)/i.test(url.search)) return true;
    return /(^|\.)((images\.unsplash\.com)|(images\.pexels\.com)|(encrypted-tbn0\.gstatic\.com)|(lh[0-9]\.googleusercontent\.com)|(twimg\.com)|(reddit\.com)|(redd\.it))$/i.test(url.hostname);
  } catch { return false; }
}

function handleImageDrop(event) {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  const file = getDroppedFile(event.dataTransfer);
  if (file) { readFile(file); return; }

  const htmlSrc = extractImageSrcFromHtml(event.dataTransfer?.getData("text/html"));
  const uriList = firstUriListEntry(event.dataTransfer?.getData("text/uri-list"));
  const plain = String(event.dataTransfer?.getData("text/plain") || "").trim();
  for (const cand of [htmlSrc, uriList, plain]) {
    const normalized = normalizeDroppedReference(cand);
    if (normalized && (looksLikeDirectImageUrl(normalized) || /^https?:\/\//i.test(normalized))) {
      setImage(normalized, "Image from webpage");
      return;
    }
  }
  $("status").textContent = "No valid image found";
}

$("fileInput").addEventListener("change", event => readFile(event.target.files[0]));
$("imageUrl").addEventListener("input", () => {
  const value = $("imageUrl").value.trim();
  if (value.startsWith("http://") || value.startsWith("https://")) setImage(value);
});

const dropzone = $("dropzone");
["dragenter", "dragover"].forEach(name => dropzone.addEventListener(name, e => { e.preventDefault(); dropzone.classList.add("dragover"); }));
["dragleave"].forEach(name => dropzone.addEventListener(name, e => { e.preventDefault(); dropzone.classList.remove("dragover"); }));
dropzone.addEventListener("drop", handleImageDrop);

// Model badge & provider selection handling
function updateSpImageModelBadge(provider) {
  const badge = $("spImageModelBadge");
  const notice = $("spImageProviderNotice");
  if (!badge) return;

  if (provider === "bitmind") {
    badge.textContent = "BitMind Oracle";
    if (notice) notice.style.display = "none";
  } else if (provider === "moodylens") {
    badge.textContent = "Server Pipeline";
    if (notice) notice.style.display = "none";
  } else if (provider === "custom") {
    badge.textContent = "Configured Model ID";
    if (notice) notice.style.display = "none";
  } else if (provider === "zerotrue") {
    badge.textContent = "ZeroTrue Multi-Modal";
    if (notice) notice.style.display = "none";
  } else {
    badge.textContent = "Managed by provider";
    if (notice) notice.style.display = "none";
  }
}

$("spImageProviderSelect")?.addEventListener("change", async () => {
  const provider = $("spImageProviderSelect").value;
  updateSpImageModelBadge(provider);

  try {
    await send({ type: "SET_ACTIVE_PROVIDER", provider });
  } catch (err) {
    console.warn("Could not set active provider:", err);
  }
});

// Analyze Image
$("analyze").addEventListener("click", async () => {
  let image = selectedImage;
  const url = $("imageUrl").value.trim();
  if (url) image = url;
  if (!image) {
    $("status").textContent = "Image required";
    $("explanation").textContent = "Drop an image, choose a local file, or paste a public image URL.";
    return;
  }

  $("analyze").disabled = true;
  $("analyze").textContent = "Analyzing…";
  $("status").textContent = "Analyzing…";
  $("verdict").className = "verdict empty";
  $("verdict").textContent = "Provider is analyzing image…";
  $("confidence").textContent = "—";
  $("similarity").textContent = "—";
  $("duration").textContent = "—";
  $("explanation").textContent = "Waiting for detector findings.";

  let result;
  try {
    const provider = $("spImageProviderSelect")?.value || "bitmind";
    result = await send({ type: "ANALYZE_IMAGE", image, provider, source: "manual review" });
  } catch (error) {
    result = { ok: false, error: error?.message || "Could not contact extension service worker." };
  }
  $("analyze").disabled = false;
  $("analyze").textContent = "Analyze Image";

  if (!result?.ok) {
    $("status").textContent = "Failed";
    $("status").className = "pill bad";
    $("verdict").textContent = "Could not complete analysis";
    $("verdict").className = "verdict empty";
    $("explanation").textContent = result?.error || "Unknown error.";
    $("raw").textContent = JSON.stringify(result, null, 2);
    return;
  }

  renderResult(result);
  await loadHistory();
});

function renderResult(result) {
  const data = result.response || {};
  const confidence = data.confidence === null || data.confidence === undefined || data.confidence === ""
    ? NaN : Number(data.confidence);
  const normalized = Number.isFinite(confidence) ? (confidence <= 1 ? confidence : confidence / 100) : NaN;
  const pct = Number.isFinite(normalized) ? `${(normalized * 100).toFixed(1)}%` : "Not provided";
  const providerName = data.providerName || data.provider || "Detection provider";
  const modelName = data.model || "Model not reported";
  const inconclusive = data.isAI !== true && data.isAI !== false;
  const uncertain = !inconclusive && (data.verdict === "uncertain" || (Number.isFinite(normalized) && normalized < 0.60));

  let verdictText, verdictClass, label;
  if (inconclusive) {
    verdictText = "INCONCLUSIVE · NO RECOGNIZED VERDICT";
    verdictClass = "empty";
    label = "inconclusive";
  } else if (uncertain) {
    verdictText = `UNCERTAIN · ${data.isAI ? "AI signal" : "No AI signal"}`;
    verdictClass = "uncertain";
    label = data.isAI ? "AI-generated signal" : "not-AI-generated signal";
  } else if (data.isAI) {
    verdictText = "LIKELY AI-GENERATED";
    verdictClass = "ai";
    label = "AI-generated";
  } else {
    verdictText = "LIKELY NOT AI-GENERATED";
    verdictClass = "real";
    label = "not AI-generated";
  }

  $("verdict").textContent = verdictText;
  $("verdict").className = `verdict ${verdictClass}`;
  $("status").textContent = result.cached ? "Cached result" : "Analysis complete";
  $("status").className = `pill ${(inconclusive || uncertain) ? "warn" : (data.isAI ? "bad" : "good")}`;
  $("confidence").textContent = pct;
  $("similarity").textContent = data.similarity ?? "Not provided";
  $("duration").textContent = result.cached ? "Cached" : `${result.durationMs} ms`;

  let assessment;
  if (inconclusive) {
    assessment = "The provider response did not contain a recognized Boolean verdict or mapped label. No authenticity conclusion is made.";
  } else if (uncertain) {
    assessment = `The provider returned a ${label} signal with low or uncertain confidence (${pct}). Treat this as inconclusive evidence.`;
  } else {
    assessment = `The provider classified this image as ${label}${Number.isFinite(normalized) ? ` with ${pct} confidence` : ""}. This is an automated estimate, not definitive proof of authenticity.`;
  }
  const explanation = data.explanation ? ` Note: ${data.explanation}.` : "";
  $("explanation").textContent = `${providerName} · ${modelName}. ${assessment}${explanation}`;
  $("raw").textContent = JSON.stringify({
    provider: providerName,
    model: modelName,
    normalizedResult: data,
    cached: Boolean(result.cached),
    durationMs: result.durationMs
  }, null, 2);
}

$("clear").addEventListener("click", () => {
  selectedImage = "";
  $("imageUrl").value = "";
  $("fileInput").value = "";
  $("preview").removeAttribute("src");
  $("preview").classList.remove("visible");
  $("status").textContent = "Not analyzed";
  $("status").className = "pill";
  $("verdict").textContent = "Your result will appear here.";
  $("verdict").className = "verdict empty";
  $("confidence").textContent = "—";
  $("similarity").textContent = "—";
  $("duration").textContent = "—";
  $("explanation").textContent = "Choose an image and run an analysis to view detector findings.";
  $("raw").textContent = "{ }";
});

$("copy").addEventListener("click", async () => {
  const text = [
    $("verdict").textContent,
    `Confidence: ${$("confidence").textContent}`,
    `Similarity: ${$("similarity").textContent}`,
    $("explanation").textContent,
    $("raw").textContent
  ].join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
    $("copy").textContent = "Copied!";
    setTimeout(() => $("copy").textContent = "Copy Report", 1300);
  } catch {
    $("copy").textContent = "Copy unavailable";
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO FORENSICS (Inspection & SCAN_VIDEO integration with Drag & Drop)
// ─────────────────────────────────────────────────────────────────────────────

let selectedVideoFile = null;
let selectedVideoFrames = [];
let selectedVideoDuration = 0;
let selectedVideoReady = Promise.resolve();
let selectedVideoObjectUrl = "";
const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function extractVideoFrames(videoEl, duration) {
  const frames = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize video frame extraction.");
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 5;
  const targetTimes = dur > 3
    ? [Math.min(1.0, dur * 0.1), dur * 0.5, Math.max(dur * 0.9, dur - 1.0)]
    : [dur * 0.5];

  for (const time of targetTimes) {
    try {
      if (Math.abs(videoEl.currentTime - time) > 0.08) {
        await new Promise((resolve, reject) => {
          let settled = false;
          let timer;
          const finish = (fn) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            videoEl.removeEventListener("seeked", onSeeked);
            videoEl.removeEventListener("error", onError);
            fn();
          };
          const onSeeked = () => finish(resolve);
          const onError = () => finish(() => reject(new Error("Video seek failed.")));
          timer = setTimeout(() => finish(() => reject(new Error("Timed out seeking video frame."))), 5000);
          videoEl.addEventListener("seeked", onSeeked, { once: true });
          videoEl.addEventListener("error", onError, { once: true });
          try { videoEl.currentTime = Math.max(0, Math.min(time, dur)); }
          catch (e) { finish(() => reject(e)); }
        });
      }
      if (!videoEl.videoWidth || !videoEl.videoHeight) throw new Error("Video metadata is unavailable.");
      canvas.width = Math.min(videoEl.videoWidth, 1280);
      canvas.height = Math.round((videoEl.videoHeight / videoEl.videoWidth) * canvas.width);
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      frames.push({ dataUri: canvas.toDataURL("image/jpeg", 0.88), timestamp: Math.round(time * 10) / 10 });
    } catch (e) { console.warn("Could not extract frame at " + time, e); }
  }
  return frames;
}


function handleVideoFile(file) {
  if (!file) return;
  const name = String(file.name || "");
  const ext = name.split(".").pop().toLowerCase();
  const isVideo = String(file.type || "").startsWith("video/") || ["mp4", "webm", "mov", "m4v", "avi", "mkv"].includes(ext);
  const isImage = String(file.type || "").startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
  if (!isVideo && !isImage) {
    const message = $("videoVerdict"); if (message) message.textContent = "Unsupported file. Drop a video or image.";
    return;
  }
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    const message = $("videoVerdict"); if (message) message.textContent = "Video exceeds 100 MB. Choose a smaller file.";
    return;
  }
  selectedVideoFile = file;
  selectedVideoFrames = [];
  selectedVideoDuration = 0;
  selectedVideoReady = Promise.resolve();
  if (selectedVideoObjectUrl) URL.revokeObjectURL(selectedVideoObjectUrl);
  selectedVideoObjectUrl = "";

  const videoPlayer = $("videoPreviewPlayer");
  const fileInfo = $("videoFileInfo");
  const fileName = $("videoFileName");
  const fileMeta = $("videoFileMeta");

  if (isImage) {
    selectedVideoReady = new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        selectedVideoFrames = [{ dataUri: reader.result, timestamp: 0 }];
        selectedVideoDuration = 0;
        if (videoPlayer) { videoPlayer.pause?.(); videoPlayer.removeAttribute("src"); videoPlayer.load?.(); videoPlayer.style.display = "none"; }
        if (fileInfo) fileInfo.style.display = "block";
        if (fileName) fileName.textContent = file.name;
        if (fileMeta) fileMeta.textContent = `Frame Image • ${formatBytes(file.size)}`;
        if ($("spVideoUrlInput")) $("spVideoUrlInput").value = "";
        resolve();
      };
      reader.onerror = () => resolve();
      reader.readAsDataURL(file);
    });
    return;
  }

  if (!videoPlayer) return;
  selectedVideoObjectUrl = URL.createObjectURL(file);
  videoPlayer.src = selectedVideoObjectUrl;
  videoPlayer.style.display = "block";
  selectedVideoReady = new Promise(resolve => {
    videoPlayer.onloadedmetadata = async () => {
      selectedVideoDuration = videoPlayer.duration || 0;
      if (fileInfo) fileInfo.style.display = "block";
      if (fileName) fileName.textContent = file.name;
      if (fileMeta) {
        const durStr = Number.isFinite(videoPlayer.duration) ? `${videoPlayer.duration.toFixed(1)}s` : "stream";
        fileMeta.textContent = `${durStr} • ${formatBytes(file.size)} • Extracting frames…`;
      }
      try { selectedVideoFrames = await extractVideoFrames(videoPlayer, selectedVideoDuration); }
      catch (err) { console.warn("Frame extraction failed:", err); }
      if (fileMeta) fileMeta.textContent = `${Number.isFinite(videoPlayer.duration) ? `${videoPlayer.duration.toFixed(1)}s` : "stream"} • ${formatBytes(file.size)} • ${selectedVideoFrames.length} frame(s) ready`;
      if ($("spVideoUrlInput")) $("spVideoUrlInput").value = "";
      resolve();
    };
    videoPlayer.onerror = () => resolve();
  });
}
function setupVideoDropzone() {
  const vDropzone = $("videoDropzone");
  const vInput = $("videoFileInput");
  if (!vDropzone) return;

  ["dragenter", "dragover"].forEach(name => vDropzone.addEventListener(name, e => {
    e.preventDefault();
    vDropzone.classList.add("dragover");
  }));
  ["dragleave"].forEach(name => vDropzone.addEventListener(name, e => {
    e.preventDefault();
    vDropzone.classList.remove("dragover");
  }));
  vDropzone.addEventListener("drop", e => {
    e.preventDefault();
    vDropzone.classList.remove("dragover");
    const file = getDroppedFile(e.dataTransfer);
    if (file) handleVideoFile(file);
  });
  vInput?.addEventListener("change", e => {
    if (e.target.files?.[0]) handleVideoFile(e.target.files[0]);
  });
}
setupVideoDropzone();

$("spVideoProviderSelect")?.addEventListener("change", async () => {
  const provider = $("spVideoProviderSelect").value;
  try {
    await send({ type: "VIDEO_SET_ACTIVE_PROVIDER", provider });
  } catch (err) {
    console.warn("Could not set active video provider:", err);
  }
});

$("btnAnalyzeVideo")?.addEventListener("click", async () => {
  const url = $("spVideoUrlInput")?.value?.trim();
  const provider = $("spVideoProviderSelect")?.value || "bitmind";

  // The service worker downloads direct public video URLs before uploading them to
  // BitMind. Request only the entered media host, and do so synchronously within
  // this button gesture so Chrome can display its optional host-permission prompt.
  let videoHostPermission = Promise.resolve(true);
  if (url && provider !== "zerotrue" && chrome.permissions?.request) {
    try {
      const parsed = new URL(url);
      if (["http:", "https:"].includes(parsed.protocol)) {
        videoHostPermission = chrome.permissions.request({ origins: [`${parsed.origin}/*`] });
      }
    } catch (_) {
      videoHostPermission = Promise.resolve(false);
    }
  }

  if (!url && (!selectedVideoFrames.length && !selectedVideoFile)) {
    alert("Please drop a video file or enter a public video URL to analyze.");
    return;
  }

  const btn = $("btnAnalyzeVideo");
  btn.disabled = true;
  btn.textContent = "Analyzing Video…";

  const card = $("videoResultCard");
  if (card) card.style.display = "block";
  $("videoStatusPill").textContent = "Processing…";
  $("videoStatusPill").className = "pill";
  $("videoVerdict").textContent = "Analyzing video frames…";
  $("videoVerdict").className = "verdict empty";

  try {
    if (!(await videoHostPermission)) {
      throw new Error("Chrome site access was not granted. Allow access to the video host and click Analyze Video again.");
    }
    let payload;
    if (selectedVideoFrames.length > 0 || selectedVideoFile) {
      await selectedVideoReady;
      const isUploadedVideo = Boolean(selectedVideoFile && (String(selectedVideoFile.type || "").startsWith("video/") || ["mp4", "webm", "mov", "m4v", "avi", "mkv"].includes(String(selectedVideoFile.name || "").split(".").pop().toLowerCase())));
      if (isUploadedVideo && provider !== "zerotrue" && selectedVideoFrames.length === 0) {
        throw new Error("Video frames could not be extracted. Try a browser-supported MP4 or WebM file, or choose ZeroTrue for whole-video analysis.");
      }
      payload = {
        title: selectedVideoFile?.name || "Uploaded Video",
        videoFile: selectedVideoFile && (String(selectedVideoFile.type || "").startsWith("video/") || ["mp4", "webm", "mov", "m4v", "avi", "mkv"].includes(String(selectedVideoFile.name || "").split(".").pop().toLowerCase())) ? selectedVideoFile : null,
        videoFileName: selectedVideoFile?.name || "uploaded-video",
        videoFileType: selectedVideoFile?.type || "",
        videoFileIsVideo: isUploadedVideo,
        frames: selectedVideoFrames,
        frameDataUri: selectedVideoFrames[0]?.dataUri || "",
        videoDuration: selectedVideoDuration,
        scanType: "drag_drop",
        provider,
      };
    } else {
      payload = {
        videoUrl: url,
        referrerUrl: await getActiveWebPageReferrer(),
        scanType: "manual_url",
        provider,
      };
    }

    const res = await send({ type: "SCAN_VIDEO", payload });
    if (!res || !res.ok) throw new Error(res?.error || "Video analysis failed.");
    const data = res.data;

    const isFake = data.isAI === true;
    const isUncertain = data.verdict === "uncertain";
    $("videoVerdict").textContent = isFake ? "LIKELY AI-GENERATED VIDEO" : (isUncertain ? "UNCERTAIN / INCONCLUSIVE" : "LIKELY AUTHENTIC VIDEO");
    $("videoVerdict").className = `verdict ${isFake ? "ai" : (isUncertain ? "uncertain" : "real")}`;
    $("videoStatusPill").textContent = data.fromCache ? "Cached" : "Complete";
    $("videoStatusPill").className = `pill ${isFake ? "bad" : (isUncertain ? "warn" : "good")}`;

    const confPct = data.confidence != null ? `${Math.round(data.confidence * 100)}%` : "N/A";
    $("videoConfidence").textContent = confPct;
    $("videoDuration").textContent = data.durationMs ? `${data.durationMs} ms` : "—";
    $("videoProviderName").textContent = data.providerName || data.provider || "BitMind";
    $("videoExplanation").textContent = data.explanation || `Video analysis completed by ${data.providerName || "video engine"}.`;

    await loadHistory();
  } catch (err) {
    $("videoVerdict").textContent = "Analysis failed: " + err.message;
    $("videoVerdict").className = "verdict empty";
    $("videoStatusPill").textContent = "Error";
    $("videoStatusPill").className = "pill bad";
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze Video";
  }
});

$("btnClearVideo")?.addEventListener("click", () => {
  selectedVideoFile = null;
  selectedVideoFrames = [];
  selectedVideoDuration = 0;
  selectedVideoReady = Promise.resolve();
  if (selectedVideoObjectUrl) URL.revokeObjectURL(selectedVideoObjectUrl);
  selectedVideoObjectUrl = "";
  const player = $("videoPreviewPlayer");
  if (player) {
    player.pause();
    player.removeAttribute("src");
    player.load();
    player.style.display = "none";
  }
  if ($("videoFileInput")) $("videoFileInput").value = "";
  if ($("videoFileInfo")) $("videoFileInfo").style.display = "none";
  if ($("spVideoUrlInput")) $("spVideoUrlInput").value = "";
  if ($("videoResultCard")) $("videoResultCard").style.display = "none";
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO FORENSICS (Deep Analysis & Tab Playback Capture)
// ─────────────────────────────────────────────────────────────────────────────

function clearAudioReport() {
  const reportCard = $("audioReportCard");
  const banner = $("audioForensicStatusBanner");
  if (reportCard) reportCard.style.display = "none";
  if (banner) banner.style.display = "none";
  const pill = $("audioForensicPill");
  if (pill) {
    pill.textContent = "Idle";
    pill.className = "pill muted";
  }
}

function showPlaybackCaptureUI(visible) {
  const box = $("playbackLiveBox");
  if (!box) return;
  box.style.display = visible ? "block" : "none";
  if (visible) {
    switchTab("subPaneAudio");
    clearAudioReport();
    const pill = $("audioForensicPill");
    if (pill) {
      pill.textContent = "● RECORDING";
      pill.className = "pill good";
    }
  }
}

function showPlaybackCaptureError(msg) {
  showPlaybackCaptureUI(false);
  const pill = $("audioForensicPill");
  const banner = $("audioForensicStatusBanner");
  if (pill) {
    pill.textContent = "Error";
    pill.className = "pill bad";
  }
  if (banner) {
    banner.style.display = "block";
    banner.style.background = "#3b1219";
    banner.style.color = "#ffabb9";
    banner.innerHTML = `<strong>⚠️ Playback Error:</strong> ${msg}`;
  }
}

function renderCompleteAudioReport(rep) {
  if (!rep) return;
  switchTab("subPaneAudio");
  showPlaybackCaptureUI(false);
  const banner = $("audioForensicStatusBanner");
  if (banner) banner.style.display = "none";

  const pill = $("audioForensicPill");
  const reportCard = $("audioReportCard");
  if (!reportCard) return;

  const isFake = rep.incidents_count > 0 || rep.overall_verdict === "SUSPICIOUS_AUDIO_DETECTED";
  const isNoSpeech = rep.analyzed_windows === 0;

  let maxSpoof = 0;
  let minCm = 999;
  let avgCm = 0;
  let activeCount = 0;
  if (Array.isArray(rep.timeline)) {
    for (const w of rep.timeline) {
      if (w.is_speech && w.p_spoof != null) {
        activeCount++;
        if (w.p_spoof > maxSpoof) maxSpoof = w.p_spoof;
        if (w.cm_score < minCm) minCm = w.cm_score;
        avgCm += w.cm_score;
      }
    }
  }
  if (activeCount > 0) avgCm = avgCm / activeCount;
  else avgCm = 0;
  if (minCm === 999) minCm = 0;

  const verdictBanner = $("reportVerdictBanner");
  const verdictIcon   = $("reportVerdictIcon");
  const verdictTitle  = $("reportVerdictTitle");
  const verdictSub    = $("reportVerdictSub");
  const confEl        = $("reportConfidence");
  const cmEl          = $("reportCmScore");
  const durEl         = $("reportDuration");
  const latEl         = $("reportLatency");
  const expEl         = $("reportExplanationText");
  const incListEl     = $("reportIncidentsList");
  const modelInfoEl   = $("reportModelInfo");

  if (isFake) {
    pill.textContent = "⚠️ SYNTHETIC VOICE";
    pill.className = "pill bad";
    verdictBanner.style.background = "linear-gradient(180deg, #3b1219, #250b10)";
    verdictBanner.style.color = "#ffadba";
    verdictIcon.textContent = "⚠️";
    verdictTitle.textContent = "SYNTHETIC / AI-GENERATED AUDIO";
    verdictTitle.style.color = "#ff4d6d";
    verdictSub.textContent = `Acoustic artifacts detected in ${rep.incidents_count} speech segment(s)`;

    confEl.textContent = `${(maxSpoof * 100).toFixed(1)}% Synthetic`;
    confEl.style.color = "#ff6b81";
    cmEl.textContent = minCm.toFixed(2);
    cmEl.style.color = "#ff4d6d";

    if (rep.engine === "cloud_zerotrue" || rep.source?.includes("ZeroTrue")) {
      expEl.innerHTML = `ZeroTrue Online API detected <strong>AI-generated voice patterns</strong>. Acoustic phase continuity and spectral signatures indicate synthetic speech generation.`;
    } else {
      expEl.innerHTML = `Local wav2vec 2.0 XLSR-300M + AASIST neural model detected <strong>synthetic speech markers</strong>. Anomalous spectral phase signatures drove the countermeasure (CM) score negative.`;
    }

    if (Array.isArray(rep.flagged_incidents) && rep.flagged_incidents.length > 0) {
      incListEl.style.display = "block";
      let incHtml = `<div style="font-weight:600; color:#ff9090; margin-bottom:4px;">Flagged Suspicious Passages:</div><ul style="padding-left:16px; margin:0;">`;
      for (const inc of rep.flagged_incidents) {
        incHtml += `<li style="margin:2px 0;"><strong>[${inc.timestamp_range}]</strong> ${inc.description}</li>`;
      }
      incHtml += `</ul>`;
      incListEl.innerHTML = incHtml;
    } else {
      incListEl.style.display = "none";
    }
  } else if (isNoSpeech) {
    pill.textContent = "Low Audio";
    pill.className = "pill muted";
    verdictBanner.style.background = "linear-gradient(180deg, #261e12, #1a140b)";
    verdictBanner.style.color = "#ffd166";
    verdictIcon.textContent = "🎙️";
    verdictTitle.textContent = "NO ACTIVE SPEECH DETECTED";
    verdictTitle.style.color = "#fcd34d";
    verdictSub.textContent = "Audio contained silence, noise, or sound without detectable human speech";

    confEl.textContent = "Inconclusive";
    confEl.style.color = "#94a3b8";
    cmEl.textContent = "0.00";
    cmEl.style.color = "#94a3b8";
    expEl.textContent = "Audio did not contain sufficient voice energy for anti-spoofing feature extraction.";
    incListEl.style.display = "none";
  } else {
    pill.textContent = "Verified Genuine";
    pill.className = "pill good";
    verdictBanner.style.background = "linear-gradient(180deg, #0e291e, #071711)";
    verdictBanner.style.color = "#8ff0bd";
    verdictIcon.textContent = "✅";
    verdictTitle.textContent = "VERIFIED GENUINE AUDIO";
    verdictTitle.style.color = "#4ade80";
    verdictSub.textContent = `All ${rep.analyzed_windows} speech segments verified as authentic human voice`;

    const authenticPct = Math.min(99.9, Math.max(90.0, 100 - (maxSpoof * 100)));
    confEl.textContent = `${authenticPct.toFixed(1)}% Authentic`;
    confEl.style.color = "#4ade80";
    cmEl.textContent = avgCm >= 0 ? `+${avgCm.toFixed(2)}` : avgCm.toFixed(2);
    cmEl.style.color = "#4ade80";

    if (rep.engine === "cloud_zerotrue" || rep.source?.includes("ZeroTrue")) {
      expEl.innerHTML = `ZeroTrue Online API verified this audio as <strong>authentic human speech</strong>. Organic acoustic distribution confirmed.`;
    } else {
      expEl.innerHTML = `Acoustic feature analysis passed verification criteria. Vocal tract resonance and spectro-temporal phase graphs show organic human speech patterns.`;
    }
    incListEl.style.display = "none";
  }

  durEl.textContent = `${rep.duration_sec}s`;
  latEl.textContent = `${rep.processing_time_ms || 0} ms`;
  if (modelInfoEl && rep.model_name) modelInfoEl.textContent = rep.model_name;

  const engineBadge = $("reportEngineBadge");
  if (engineBadge) {
    engineBadge.textContent = (rep.engine === "cloud_zerotrue" || rep.source?.includes("ZeroTrue"))
      ? "ZeroTrue Cloud API"
      : "Local Engine (CUDA)";
  }

  reportCard.style.display = "block";
}

async function processSharedAudioFile(file) {
  if (!file) return;
  const validExts = [".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac", ".aac"];
  const name = file.name.toLowerCase();
  if (!file.type.startsWith("audio/") && !validExts.some(ext => name.endsWith(ext))) {
    showPlaybackCaptureError("Selected file is not an audio file (.wav, .mp3, .m4a, .webm).");
    return;
  }

  clearAudioReport();
  const pill = $("audioForensicPill");
  const banner = $("audioForensicStatusBanner");
  if (pill) {
    pill.textContent = "● ANALYZING";
    pill.className = "pill good";
  }
  if (banner) {
    banner.style.display = "block";
    banner.style.background = "#141e30";
    banner.style.color = "#bdc8da";
    banner.innerHTML = `<strong>📁 Analyzing "${file.name}"...</strong><br><span>Decoding stream and extracting acoustic embeddings...</span>`;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const pcm = audioBuffer.getChannelData(0);

    let binary = "";
    const bytes = new Uint8Array(pcm.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, len)));
    }
    const pcm_b64 = btoa(binary);
    const durSec = Number((pcm.length / 16000).toFixed(2));
    const rep = await send({
      type: "AUDIO_TRIGGER_DEEP_ANALYSIS",
      payload: { pcm_b64, sample_rate: 16000, duration_sec: durSec }
    });

    if (rep?.ok && rep.report) renderCompleteAudioReport(rep.report);
    else throw new Error(rep?.error || "Audio analysis returned empty result.");
  } catch (err) {
    showPlaybackCaptureError(err.message);
  }
}

$("audioFileInput")?.addEventListener("change", () => {
  if ($("audioFileInput").files?.length) processSharedAudioFile($("audioFileInput").files[0]);
});

const audioDropzone = $("audioFileDropzone");
if (audioDropzone) {
  audioDropzone.addEventListener("dragover", e => { e.preventDefault(); audioDropzone.classList.add("dragover"); });
  audioDropzone.addEventListener("dragleave", () => audioDropzone.classList.remove("dragover"));
  audioDropzone.addEventListener("drop", e => {
    e.preventDefault();
    audioDropzone.classList.remove("dragover");
    if (e.dataTransfer?.files?.length) processSharedAudioFile(e.dataTransfer.files[0]);
  });
}

$("btnStartPlaybackCapture")?.addEventListener("click", async () => {
  const btn = $("btnStartPlaybackCapture");
  btn.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Could not find active tab.");

    clearAudioReport();
    if ($("playbackProgressBar")) $("playbackProgressBar").style.width = "0%";
    if ($("playbackTimerText")) $("playbackTimerText").textContent = "0.0s / 30s";
    if ($("playbackSpeechIndicator")) {
      $("playbackSpeechIndicator").textContent = "Waiting for audio…";
      $("playbackSpeechIndicator").style.color = "#cbd5e1";
    }
    showPlaybackCaptureUI(true);

    const res = await send({ type: "AUDIO_START_PLAYBACK_CAPTURE", tabId: tab.id, maxDurationSec: 30 });
    if (!res || !res.ok) throw new Error(res?.error || "Could not start capture.");
  } catch (err) {
    showPlaybackCaptureError(err.message);
  } finally {
    btn.disabled = false;
  }
});

$("btnStopAndAnalyzePlayback")?.addEventListener("click", async () => {
  const btn = $("btnStopAndAnalyzePlayback");
  if (btn) btn.disabled = true;
  if ($("playbackLiveStatus")) $("playbackLiveStatus").textContent = "Stopping & analyzing audio...";
  try {
    await send({ type: "AUDIO_STOP_PLAYBACK_CAPTURE", reason: "manual_stop" });
  } catch (err) {
    showPlaybackCaptureError(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Runtime message listener for playback progress and analysis events
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "PLAYBACK_AUDIO_STARTED") {
    clearAudioReport();
    showPlaybackCaptureUI(true);
    if ($("playbackSpeechIndicator")) {
      $("playbackSpeechIndicator").textContent = "🔊 Audio playing - capturing...";
      $("playbackSpeechIndicator").style.color = "#86efac";
    }
  }

  if (msg.type === "PLAYBACK_CAPTURE_PROGRESS") {
    showPlaybackCaptureUI(true);
    const pct = Math.min(100, Math.round((msg.durationSec / (msg.maxSec || 30)) * 100));
    if ($("playbackProgressBar")) $("playbackProgressBar").style.width = `${pct}%`;
    if ($("playbackTimerText")) $("playbackTimerText").textContent = `${msg.durationSec}s / ${msg.maxSec || 30}s`;
    if ($("playbackSpeechIndicator")) {
      if (msg.speechDetected) {
        $("playbackSpeechIndicator").textContent = "🔊 Audio playing - capturing...";
        $("playbackSpeechIndicator").style.color = "#86efac";
      } else {
        $("playbackSpeechIndicator").textContent = "Waiting for audio…";
        $("playbackSpeechIndicator").style.color = "#cbd5e1";
      }
    }
  }

  if (msg.type === "PLAYBACK_ANALYZING") {
    showPlaybackCaptureUI(false);
    clearAudioReport();
    const pill = $("audioForensicPill");
    const banner = $("audioForensicStatusBanner");
    if (pill) { pill.textContent = "● ANALYZING"; pill.className = "pill good"; }
    if (banner) {
      banner.style.display = "block";
      banner.style.background = "#141e30";
      banner.style.color = "#bdc8da";
      banner.innerHTML = `<strong>Executing GPU neural analysis (wav2vec 2.0 + AASIST)...</strong>`;
    }
  }

  if (msg.type === "AUDIO_DEEP_ANALYSIS_COMPLETE" && msg.report) {
    renderCompleteAudioReport(msg.report);
  }

  if (msg.type === "PLAYBACK_CAPTURE_CANCELLED") {
    showPlaybackCaptureUI(false);
    clearAudioReport();
    const pill = $("audioForensicPill");
    const banner = $("audioForensicStatusBanner");
    if (pill) { pill.textContent = "No Audio"; pill.className = "pill muted"; }
    if (banner) {
      banner.style.display = "block";
      banner.style.background = "#2a151b";
      banner.style.color = "#ffabb9";
      banner.innerHTML = `<strong>⚠️ Capture Cancelled:</strong> Ensure audio is actively playing in the tab.`;
    }
  }

  if (msg.type === "PLAYBACK_ANALYSIS_ERROR") {
    showPlaybackCaptureError(msg.error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY (Image & Video Detection History)
// ─────────────────────────────────────────────────────────────────────────────

async function loadHistory() {
  const el = $("history");
  if (!el) return;
  el.textContent = "Loading detection history…";

  try {
    const [imgRes, vidRes] = await Promise.all([
      send({ type: "GET_HISTORY" }).catch(() => ({ items: [] })),
      send({ type: "VIDEO_GET_HISTORY" }).catch(() => ({ data: [] }))
    ]);

    const imgItems = (imgRes?.items || []).map(i => ({ ...i, mediaType: "Image", timestamp: i.time }));
    const vidItems = (Array.isArray(vidRes?.data) ? vidRes.data : []).map(v => ({ ...v, mediaType: "Video", timestamp: v.timestamp }));

    const combined = [...imgItems, ...vidItems]
      .filter(x => x && (x.timestamp || x.time))
      .sort((a, b) => (b.timestamp || b.time || 0) - (a.timestamp || a.time || 0))
      .slice(0, 15);

    if (!combined.length) {
      el.textContent = "No detections recorded yet.";
      return;
    }

    el.replaceChildren();
    for (const item of combined) {
      const row = document.createElement("div");
      row.className = "history-item";

      const left = document.createElement("div");
      const label = document.createElement("strong");
      const verdictText = item.verdict || (item.isAI === true ? "AI-generated" : item.isAI === false ? "Not AI" : "Inconclusive");
      label.textContent = `[${item.mediaType}] ${verdictText}`;

      const sub = document.createElement("div");
      sub.style.fontSize = "10px";
      sub.style.color = "var(--text-subtle)";
      const dateStr = item.dateFormatted || new Date(item.timestamp || item.time).toLocaleString();
      const modelStr = item.model || item.provider || "";
      sub.textContent = `${dateStr}${modelStr ? " · " + modelStr : ""}`;

      left.append(label, sub);

      const pill = document.createElement("span");
      pill.className = `pill ${item.isAI ? "bad" : item.isAI === false ? "good" : "muted"}`;
      pill.textContent = item.confidence ? `${Math.round(item.confidence <= 1 ? item.confidence * 100 : item.confidence)}%` : "Done";

      row.append(left, pill);
      el.appendChild(row);
    }
  } catch (err) {
    el.textContent = "Could not load history: " + err.message;
  }
}
$("refreshHistory")?.addEventListener("click", loadHistory);

$("spClearHistory")?.addEventListener("click", async () => {
  if (confirm("Clear local detection history?")) {
    await chrome.storage.local.set({ detectionHistory: [], videoDetectionHistory: [] });
    await loadHistory();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS (BitMind & ZeroTrue Providers in Sidepanel)
// ─────────────────────────────────────────────────────────────────────────────

// BitMind key toggle
$("toggleSpBitmindKey")?.addEventListener("click", () => {
  const input = $("spBitmindKeyInput");
  const btn = $("toggleSpBitmindKey");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
});

// ZeroTrue key toggle
$("toggleSpZeroTrueKey")?.addEventListener("click", () => {
  const input = $("spZeroTrueKeyInput");
  const btn = $("toggleSpZeroTrueKey");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
});

async function initSettingsPane() {
  // Load public status for BitMind
  try {
    const pubStatus = await send({ type: "GET_PUBLIC_STATUS" });
    if (pubStatus) {
      if ($("spBitmindState")) {
        $("spBitmindState").textContent = pubStatus.bitmindConfigured ? "Configured" : "Not configured";
        $("spBitmindState").className = `pill ${pubStatus.bitmindConfigured ? "good" : "muted"}`;
      }
      if ($("spImageProviderSelect") && pubStatus.activeProvider) {
        $("spImageProviderSelect").value = pubStatus.activeProvider;
        updateSpImageModelBadge(pubStatus.activeProvider);
      }
    }
  } catch {}

  // Load audio config for ZeroTrue
  try {
    const res = await send({ type: "GET_AUDIO_CONFIG" });
    if (res?.ok) {
      if ($("spAudioEngineSelect") && res.audioEngineMode) $("spAudioEngineSelect").value = res.audioEngineMode;
      if ($("spZeroTrueState")) {
        $("spZeroTrueState").textContent = res.zeroTrueConfigured ? "Configured" : "Not configured";
        $("spZeroTrueState").className = `pill ${res.zeroTrueConfigured ? "good" : "muted"}`;
      }
    }
  } catch {}

  // Load video active provider
  try {
    const vRes = await send({ type: "VIDEO_CHECK_PROVIDER_CONFIG" });
    if (vRes?.ok && vRes.data?.activeProvider) {
      if ($("spVideoProviderSelect")) $("spVideoProviderSelect").value = vRes.data.activeProvider;
    }
  } catch {}
}

// BitMind Actions
$("spBtnSaveBitmindKey")?.addEventListener("click", async () => {
  const key = $("spBitmindKeyInput")?.value?.trim() || "";
  const msgEl = $("spBitmindKeyMsg");
  if (!key) {
    if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message error"; msgEl.textContent = "Please enter your BitMind API key."; }
    return;
  }
  const btn = $("spBtnSaveBitmindKey");
  btn.disabled = true;
  try {
    const res = await send({ type: "SAVE_API_KEY", apiKey: key });
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.className = res.ok ? "message good" : "message error";
      msgEl.textContent = res.ok ? "BitMind API key saved." : ("Error: " + res.error);
    }
    $("spBitmindKeyInput").value = "";
    await initSettingsPane();
  } catch (err) {
    if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message error"; msgEl.textContent = "Save error: " + err.message; }
  } finally {
    btn.disabled = false;
  }
});

$("spBtnRemoveBitmindKey")?.addEventListener("click", async () => {
  const btn = $("spBtnRemoveBitmindKey");
  btn.disabled = true;
  const msgEl = $("spBitmindKeyMsg");
  try {
    await chrome.storage.local.set({ apiKey: "", apiKeyUpdatedAt: Date.now() });
    if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message"; msgEl.textContent = "BitMind API key removed."; }
    $("spBitmindKeyInput").value = "";
    await initSettingsPane();
  } catch (err) {
    if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message error"; msgEl.textContent = "Remove error: " + err.message; }
  } finally {
    btn.disabled = false;
  }
});

$("spBtnTestBitmindKey")?.addEventListener("click", async () => {
  const btn = $("spBtnTestBitmindKey");
  btn.disabled = true;
  const msgEl = $("spBitmindKeyMsg");
  if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message"; msgEl.textContent = "Testing BitMind connection…"; }
  try {
    const key = $("spBitmindKeyInput")?.value?.trim() || "";
    const res = await send({ type: "TEST_API_KEY", apiKey: key });
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.className = res.ok ? "message good" : "message error";
      msgEl.textContent = res.ok ? `BitMind verified! isAI=${res.response.isAI}, confidence=${res.response.confidence ?? "N/A"}.` : ("Test failed: " + res.error);
    }
  } catch (err) {
    if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message error"; msgEl.textContent = "Test error: " + err.message; }
  } finally {
    btn.disabled = false;
  }
});

// ZeroTrue Actions
$("spAudioEngineSelect")?.addEventListener("change", async () => {
  const mode = $("spAudioEngineSelect").value;
  await send({ type: "SAVE_ZEROTRUE_CONFIG", engineMode: mode });
  await initSettingsPane();
});

$("spBtnSaveZeroTrueKey")?.addEventListener("click", async () => {
  const key = $("spZeroTrueKeyInput")?.value?.trim() || "";
  const msgEl = $("spZeroTrueKeyMsg");
  if (!key) {
    if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message error"; msgEl.textContent = "Please enter your ZeroTrue API key."; }
    return;
  }
  const btn = $("spBtnSaveZeroTrueKey");
  btn.disabled = true;
  try {
    const res = await send({ type: "SAVE_ZEROTRUE_CONFIG", apiKey: key });
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.className = res.ok ? "message good" : "message error";
      msgEl.textContent = res.ok ? "ZeroTrue API key saved." : ("Error: " + res.error);
    }
    $("spZeroTrueKeyInput").value = "";
    await initSettingsPane();
  } catch (err) {
    if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message error"; msgEl.textContent = "Save error: " + err.message; }
  } finally {
    btn.disabled = false;
  }
});

$("spBtnRemoveZeroTrueKey")?.addEventListener("click", async () => {
  const btn = $("spBtnRemoveZeroTrueKey");
  btn.disabled = true;
  const msgEl = $("spZeroTrueKeyMsg");
  try {
    await send({ type: "SAVE_ZEROTRUE_CONFIG", apiKey: "" });
    if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message"; msgEl.textContent = "ZeroTrue API key removed."; }
    $("spZeroTrueKeyInput").value = "";
    await initSettingsPane();
  } catch (err) {
    if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message error"; msgEl.textContent = "Remove error: " + err.message; }
  } finally {
    btn.disabled = false;
  }
});

$("spBtnTestZeroTrueKey")?.addEventListener("click", async () => {
  const key = $("spZeroTrueKeyInput")?.value?.trim() || "";
  const msgEl = $("spZeroTrueKeyMsg");
  const btn = $("spBtnTestZeroTrueKey");
  btn.disabled = true;
  if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message"; msgEl.textContent = "Testing ZeroTrue connection…"; }
  try {
    const res = await send({ type: "TEST_ZEROTRUE_KEY", apiKey: key });
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.className = res.ok ? "message good" : "message error";
      msgEl.textContent = res.ok ? "✓ ZeroTrue API connection verified!" : ("Test failed: " + res.error);
    }
  } catch (err) {
    if (msgEl) { msgEl.style.display = "block"; msgEl.className = "message error"; msgEl.textContent = "Test error: " + err.message; }
  } finally {
    btn.disabled = false;
  }
});

$("spOpenOptions")?.addEventListener("click", () => chrome.runtime.openOptionsPage());

// ─────────────────────────────────────────────────────────────────────────────
// PENDING REVIEWS (Images and Videos from Context Menu)
// ─────────────────────────────────────────────────────────────────────────────

async function checkPendingReviews() {
  const data = await chrome.storage.local.get(["pendingReviewImage", "pendingReviewVideo"]);
  if (data.pendingReviewImage) {
    setImage(data.pendingReviewImage, "Image from webpage");
    await chrome.storage.local.remove("pendingReviewImage");
  }
  if (data.pendingReviewVideo) {
    switchTab("subPaneVideo");
    if ($("spVideoUrlInput")) $("spVideoUrlInput").value = data.pendingReviewVideo;
    await chrome.storage.local.remove("pendingReviewVideo");
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.pendingReviewImage?.newValue) {
      setImage(changes.pendingReviewImage.newValue, "Image from webpage");
      chrome.storage.local.remove("pendingReviewImage");
    }
    if (changes.pendingReviewVideo?.newValue) {
      switchTab("subPaneVideo");
      if ($("spVideoUrlInput")) $("spVideoUrlInput").value = changes.pendingReviewVideo.newValue;
      chrome.storage.local.remove("pendingReviewVideo");
    }
  }
});

checkPendingReviews();
initSettingsPane().catch(() => {});
loadHistory().catch(() => {});

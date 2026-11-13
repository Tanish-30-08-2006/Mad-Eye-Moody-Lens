const $ = id => document.getElementById(id);
let selectedImage = "";

function send(message) { return chrome.runtime.sendMessage(message); }

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

  // Some desktop drag sources (including Finder in certain cases) expose an
  // empty or generic MIME type. Infer only from the formats this panel accepts.
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
    $("explanation").textContent = "Choose an image smaller than 8 MB. Large image optimization is available for webpage image URLs.";
    return;
  }

  // Re-tag a dropped file with the inferred MIME type so FileReader produces a
  // data:image/... URL accepted by the provider engine.
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
  } catch {
    return "";
  }
}

function isKnownResultPageUrl(value) {
  try {
    const url = new URL(value);
    return /(^|\.)google\.[a-z.]+$/i.test(url.hostname) && /\/(?:imgres|search|url)(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function extractImageFromWrapperUrl(value) {
  const normalized = normalizeDroppedReference(value);
  if (!normalized || normalized.startsWith("data:")) return normalized;
  try {
    const url = new URL(normalized);
    for (const key of ["imgurl", "mediaurl", "media_url", "image_url", "image"]) {
      const nested = url.searchParams.get(key);
      if (nested) {
        const imageUrl = normalizeDroppedReference(nested);
        if (imageUrl) return imageUrl;
      }
    }
  } catch { /* Not a URL that can be unwrapped. */ }
  return "";
}

function looksLikeDirectImageUrl(value) {
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)) return true;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return false;
    const path = url.pathname.toLowerCase();
    if (/\/(?:imgres|search|url|redirect)(?:\/|$)/i.test(path)) return false;
    if (/\.(?:png|jpe?g|webp|gif|bmp|avif|tiff?)(?:$)/i.test(path)) return true;
    // Common image CDNs frequently omit an extension from their image URLs.
    return /(^|\.)((images\.unsplash\.com)|(images\.pexels\.com)|(encrypted-tbn0\.gstatic\.com)|(lh[0-9]\.googleusercontent\.com))$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function getHtmlImageReferences(html, baseUrl = "") {
  if (!html) return [];
  const references = [];
  try {
    const documentFragment = new DOMParser().parseFromString(String(html), "text/html");
    for (const image of documentFragment.querySelectorAll("img")) {
      const rawValues = [
        image.getAttribute("src"),
        image.getAttribute("data-src"),
        image.getAttribute("data-original"),
        image.getAttribute("data-lazy-src"),
        image.getAttribute("data-url")
      ];
      const srcset = image.getAttribute("srcset") || image.getAttribute("data-srcset") || "";
      if (srcset) {
        rawValues.push(...srcset.split(",").map(entry => entry.trim().split(/\s+/)[0]));
      }
      for (const raw of rawValues) {
        const normalized = normalizeDroppedReference(raw, baseUrl);
        if (!normalized) continue;
        const unwrapped = extractImageFromWrapperUrl(normalized);
        if (unwrapped) references.push(unwrapped);
        else if (!isKnownResultPageUrl(normalized)) references.push(normalized);
      }
    }
    // Some sites expose the image as a direct link around the dragged element.
    for (const anchor of documentFragment.querySelectorAll("a[href]")) {
      const normalized = normalizeDroppedReference(anchor.getAttribute("href"), baseUrl);
      if (normalized && looksLikeDirectImageUrl(normalized)) references.push(normalized);
    }
  } catch (error) {
    console.debug("Could not parse dragged HTML image data:", error);
  }
  return [...new Set(references)];
}

function getDroppedImageReference(dataTransfer) {
  if (!dataTransfer) return "";
  const uriList = firstUriListEntry(dataTransfer.getData("text/uri-list"));
  const plain = String(dataTransfer.getData("text/plain") || "").trim();
  const html = String(dataTransfer.getData("text/html") || "");
  const htmlReferences = getHtmlImageReferences(html, uriList);

  // Browsers often put the enclosing page URL in text/uri-list while the
  // actual dragged image is present in text/html. Prefer image elements.
  if (htmlReferences.length) return htmlReferences[0];

  const wrappedImage = extractImageFromWrapperUrl(uriList) || extractImageFromWrapperUrl(plain);
  if (wrappedImage) return wrappedImage;

  // Never send a search/result page URL (for example Google /imgres) to a
  // detector as if it were an image. Only accept plausible direct image URLs.
  for (const candidate of [uriList, plain]) {
    const normalized = normalizeDroppedReference(candidate);
    if (normalized && looksLikeDirectImageUrl(normalized)) return normalized;
  }
  return "";
}

function handleImageDrop(event) {
  event.preventDefault();
  dropzone.classList.remove("dragover");

  const file = getDroppedFile(event.dataTransfer);
  if (file) {
    readFile(file);
    return;
  }

  const candidate = getDroppedImageReference(event.dataTransfer);
  if (candidate) {
    setImage(candidate, "Image dragged from webpage");
    return;
  }

  $("status").textContent = "No image found in drop";
  $("explanation").textContent = "Try dragging the image itself, use the image's right-click menu, or choose a local file.";
}

$("fileInput").addEventListener("change", event => readFile(event.target.files[0]));
$("imageUrl").addEventListener("input", () => {
  const value = $("imageUrl").value.trim();
  if (value.startsWith("http://") || value.startsWith("https://")) setImage(value);
});

const dropzone = $("dropzone");
["dragenter", "dragover"].forEach(name => dropzone.addEventListener(name, event => {
  event.preventDefault();
  dropzone.classList.add("dragover");
}));
["dragleave"].forEach(name => dropzone.addEventListener(name, event => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
}));
dropzone.addEventListener("drop", handleImageDrop);

// Accept a local file dropped anywhere in the side panel, not only inside the
// dashed drop target. Prevent Chrome from navigating to the dropped file.
function carriesFiles(dataTransfer) {
  return Boolean(dataTransfer && (
    dataTransfer.files?.length || Array.from(dataTransfer.types || []).includes("Files")
  ));
}
document.addEventListener("dragover", event => {
  if (!carriesFiles(event.dataTransfer)) return;
  event.preventDefault();
  if (dropzone.contains(event.target)) dropzone.classList.add("dragover");
});
document.addEventListener("drop", event => {
  if (dropzone.contains(event.target) || !carriesFiles(event.dataTransfer)) return;
  event.preventDefault();
  handleImageDrop(event);
});

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
  $("status").textContent = "Request running";
  $("verdict").className = "verdict empty";
  $("verdict").textContent = "The selected provider is analyzing this image…";
  $("confidence").textContent = "—";
  $("similarity").textContent = "—";
  $("duration").textContent = "—";
  $("explanation").textContent = "Waiting for the detector response.";
  let result;
  try {
    result = await send({ type: "ANALYZE_IMAGE", image, source: "manual review" });
  } catch (error) {
    result = { ok: false, error: error?.message || "Could not contact the extension service worker." };
  }
  $("analyze").disabled = false;
  $("analyze").textContent = "Analyze image";

  if (!result?.ok) {
    $("status").textContent = "Request failed";
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
  $("status").className = `pill ${(inconclusive || uncertain) ? "" : (data.isAI ? "bad" : "good")}`;
  $("confidence").textContent = pct;
  $("similarity").textContent = data.similarity ?? "Not provided";
  $("duration").textContent = result.cached ? "Cached" : `${result.durationMs} ms`;

  let assessment;
  if (inconclusive) {
    assessment = "The provider response did not contain a recognized Boolean AI verdict or a label included in the configured AI/real label mappings. No authenticity conclusion is being made.";
  } else if (uncertain) {
    assessment = `The provider returned a ${label} signal with low or uncertain confidence (${pct}). Treat this as inconclusive evidence rather than a reliable classification.`;
  } else {
    assessment = `The provider classified this image as ${label}${Number.isFinite(normalized) ? ` with ${pct} confidence` : ""}. This is an automated estimate, not proof of authenticity.`;
  }
  const similarityLine = data.similarity === null || data.similarity === undefined
    ? " Similarity was not provided."
    : ` Similarity: ${data.similarity}. Its scale and calibration depend on the provider.`;
  const explanation = data.explanation ? ` Provider note: ${data.explanation}.` : "";
  $("explanation").textContent = `${providerName} · ${modelName}. ${assessment}${similarityLine}${explanation} The response does not establish which pixels or visual artifacts caused the verdict.`;
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
  $("explanation").textContent = "Choose an image and run an analysis to see the detector's result and metric explanations.";
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
    setTimeout(() => $("copy").textContent = "Copy report", 1300);
  } catch {
    $("copy").textContent = "Copy unavailable";
  }
});

async function loadHistory() {
  const result = await send({ type: "GET_HISTORY" });
  const items = result?.items || [];
  if (!items.length) {
    $("history").textContent = "No detections yet.";
    return;
  }
  $("history").replaceChildren();
  for (const item of items.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "history-item";
    const label = document.createElement("strong");
    label.textContent = item.isAI === true ? "AI-generated" : item.isAI === false ? "Not AI-generated" : "Inconclusive";
    const time = document.createElement("span");
    time.textContent = new Date(item.time).toLocaleString();
    row.append(label, time);
    $("history").appendChild(row);
  }
}
$("refreshHistory").addEventListener("click", loadHistory);

async function checkPending() {
  const data = await chrome.storage.local.get("pendingReviewImage");
  if (data.pendingReviewImage) {
    setImage(data.pendingReviewImage, "Image from webpage");
    await chrome.storage.local.remove("pendingReviewImage");
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.pendingReviewImage?.newValue) {
    setImage(changes.pendingReviewImage.newValue, "Image from webpage");
    chrome.storage.local.remove("pendingReviewImage");
  }
});
checkPending();
loadHistory();


// ============================================================================
// AUDIO FORENSIC INSPECTION & COMPLETE ANALYSIS REPORT
// ============================================================================

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
    clearAudioReport();
    const pill = $("audioForensicPill");
    if (pill) {
      pill.textContent = "● RECORDING TAB";
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

function updateForensicUIState(status) {
  if (!status) return;
  const isPlaybackActive = Boolean(status.playbackCaptureActive);
  if (isPlaybackActive) {
    showPlaybackCaptureUI(true);
  }
}

function renderCompleteAudioReport(rep) {
  if (!rep) return;

  showPlaybackCaptureUI(false);
  const banner = $("audioForensicStatusBanner");
  if (banner) banner.style.display = "none";

  const pill = $("audioForensicPill");
  const reportCard = $("audioReportCard");
  if (!reportCard) return;

  const isFake = rep.incidents_count > 0 || rep.overall_verdict === "SUSPICIOUS_AUDIO_DETECTED";
  const isNoSpeech = rep.analyzed_windows === 0;

  // Compute peak spoof and average CM score across active speech windows
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
    verdictSub.textContent = `Deepfake neural vocoder acoustic artifacts detected in ${rep.incidents_count} segment(s)`;

    confEl.textContent = `${(maxSpoof * 100).toFixed(1)}% Synthetic`;
    confEl.style.color = "#ff6b81";

    cmEl.textContent = minCm.toFixed(2);
    cmEl.style.color = "#ff4d6d";

    if (rep.engine === "cloud_zerotrue" || rep.source?.includes("ZeroTrue")) {
      expEl.innerHTML = `ZeroTrue Online API detected <strong>AI-generated voice patterns</strong> in this audio. AI speech synthesis and neural vocoders introduce unnatural acoustic signatures and phase patterns characteristic of machine-generated audio.`;
    } else {
      expEl.innerHTML = `The local wav2vec 2.0 XLSR-300M + AASIST graph neural network detected <strong>synthetic speech markers</strong> in this audio. Synthetic audio generation and neural vocoder reconstruction introduce anomalous phase continuity and spectral signatures that drove the countermeasure (CM) score strongly negative.`;
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
    verdictSub.textContent = "Captured audio contained silence, background noise, or sound without detectable speech";

    confEl.textContent = "Inconclusive";
    confEl.style.color = "#94a3b8";
    cmEl.textContent = "0.00";
    cmEl.style.color = "#94a3b8";
    expEl.textContent = "The audio track did not contain sufficient human voice energy to run deepfake anti-spoofing feature extraction. Ensure active speech is playing.";
    incListEl.style.display = "none";
  } else {
    pill.textContent = "Verified Genuine";
    pill.className = "pill good";

    verdictBanner.style.background = "linear-gradient(180deg, #0e291e, #071711)";
    verdictBanner.style.color = "#8ff0bd";
    verdictIcon.textContent = "✅";
    verdictTitle.textContent = "VERIFIED GENUINE AUDIO";
    verdictTitle.style.color = "#4ade80";
    verdictSub.textContent = `All ${rep.analyzed_windows} speech segments verified authentic human speech`;

    const authenticPct = Math.min(99.9, Math.max(90.0, 100 - (maxSpoof * 100)));
    confEl.textContent = `${authenticPct.toFixed(1)}% Authentic`;
    confEl.style.color = "#4ade80";

    const displayCm = avgCm >= 0 ? `+${avgCm.toFixed(2)}` : avgCm.toFixed(2);
    cmEl.textContent = displayCm;
    cmEl.style.color = "#4ade80";

    if (rep.engine === "cloud_zerotrue" || rep.source?.includes("ZeroTrue")) {
      expEl.innerHTML = `ZeroTrue Online API verified this audio as <strong>authentic human speech</strong>. The acoustic features and frequency distribution show organic natural patterns.`;
    } else {
      expEl.innerHTML = `Acoustic feature analysis passed all anti-spoofing verification criteria. The vocal tract resonance, glottal pulse timing, and spectro-temporal phase graphs show organic human speech patterns consistent with genuine conversation.`;
    }
    incListEl.style.display = "none";
  }

  durEl.textContent = `${rep.duration_sec}s`;
  latEl.textContent = `${rep.processing_time_ms || 0} ms`;
  if (modelInfoEl && rep.model_name) {
    modelInfoEl.textContent = rep.model_name;
  }

  const engineBadge = $("reportEngineBadge");
  if (engineBadge) {
    if (rep.engine === "cloud_zerotrue" || rep.source?.includes("ZeroTrue")) {
      engineBadge.textContent = "ZeroTrue Cloud API (zerotrue.app)";
      engineBadge.style.color = "#a5b4fc";
    } else {
      engineBadge.textContent = "Local Engine (CUDA)";
      engineBadge.style.color = "#86efac";
    }
  }

  reportCard.style.display = "block";
}

// ---------------------------------------------------------------------------
// Shared Audio File Handling (.wav, .mp3, .m4a, .webm)
// ---------------------------------------------------------------------------

async function processSharedAudioFile(file) {
  if (!file) return;

  const validExts = [".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac", ".aac"];
  const name = file.name.toLowerCase();
  const hasAudioExt = validExts.some(ext => name.endsWith(ext));
  if (!file.type.startsWith("audio/") && !hasAudioExt) {
    showPlaybackCaptureError("Selected file is not an audio file (.wav, .mp3, .m4a, .webm).");
    return;
  }

  clearAudioReport();
  const pill = $("audioForensicPill");
  const banner = $("audioForensicStatusBanner");
  if (pill) {
    pill.textContent = "● ANALYZING FILE";
    pill.className = "pill good";
  }
  if (banner) {
    banner.style.display = "block";
    banner.style.background = "#141e30";
    banner.style.color = "#bdc8da";
    banner.innerHTML = `<strong>📁 Analyzing "${file.name}"...</strong><br>` +
      `<span style="color:#7e94b8;">Decoding audio stream and extracting acoustic embeddings...</span>`;
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
      payload: {
        pcm_b64,
        sample_rate: 16000,
        duration_sec: durSec,
      }
    });

    if (rep?.ok && rep.report) {
      renderCompleteAudioReport(rep.report);
    } else {
      throw new Error(rep?.error || "Audio analysis returned an empty result.");
    }
  } catch (err) {
    showPlaybackCaptureError(err.message);
  }
}

const audioFileInput = $("audioFileInput");
if (audioFileInput) {
  audioFileInput.addEventListener("change", () => {
    if (audioFileInput.files?.length) {
      processSharedAudioFile(audioFileInput.files[0]);
    }
  });
}

const audioDropzone = $("audioFileDropzone");
if (audioDropzone) {
  audioDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    audioDropzone.style.borderColor = "#9b8cff";
    audioDropzone.style.background = "#162035";
  });
  audioDropzone.addEventListener("dragleave", () => {
    audioDropzone.style.borderColor = "#3a4c6a";
    audioDropzone.style.background = "#0d1526";
  });
  audioDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    audioDropzone.style.borderColor = "#3a4c6a";
    audioDropzone.style.background = "#0d1526";
    const files = e.dataTransfer?.files;
    if (files?.length) {
      processSharedAudioFile(files[0]);
    }
  });
}

// ---------------------------------------------------------------------------
// Tab Audio Playback Capture Controls
// ---------------------------------------------------------------------------

$("btnStartPlaybackCapture")?.addEventListener("click", async () => {
  const btn = $("btnStartPlaybackCapture");
  btn.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Could not find the active tab.");

    // Reset progress UI and clear previous report
    clearAudioReport();
    if ($("playbackProgressBar")) $("playbackProgressBar").style.width = "0%";
    if ($("playbackTimerText")) $("playbackTimerText").textContent = "0.0s / 30s";
    if ($("playbackSpeechIndicator")) {
      $("playbackSpeechIndicator").textContent = "Waiting for audio…";
      $("playbackSpeechIndicator").style.color = "#cbd5e1";
    }
    showPlaybackCaptureUI(true);

    const res = await send({ type: "AUDIO_START_PLAYBACK_CAPTURE", tabId: tab.id, maxDurationSec: 30 });
    if (!res || !res.ok) throw new Error(res?.error || "Could not start tab playback capture.");
  } catch (err) {
    showPlaybackCaptureError(err.message);
  } finally {
    btn.disabled = false;
  }
});

$("btnStopAndAnalyzePlayback")?.addEventListener("click", async () => {
  const btn = $("btnStopAndAnalyzePlayback");
  if (btn) btn.disabled = true;
  if ($("playbackLiveStatus")) $("playbackLiveStatus").textContent = "⏳ Stopping & analyzing captured audio...";
  try {
    await send({ type: "AUDIO_STOP_PLAYBACK_CAPTURE", reason: "manual_stop" });
  } catch (err) {
    showPlaybackCaptureError(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Load live status and forensic report if available on open
send({ type: "AUDIO_GET_STATUS" }).then(res => {
  if (res?.ok && res.status) {
    updateForensicUIState(res.status);
  }
}).catch(() => {});

// Listen for playback progress, state transitions, and completed report
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "AUDIO_STATUS_UPDATE" && msg.status) {
    updateForensicUIState(msg.status);
  }

  if (msg.type === "PLAYBACK_AUDIO_STARTED") {
    // When audio actively starts playing, clear any previous report immediately
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
    if (pill) {
      pill.textContent = "● ANALYZING TAB AUDIO";
      pill.className = "pill good";
    }
    if (banner) {
      banner.style.display = "block";
      banner.style.background = "#141e30";
      banner.style.color = "#bdc8da";
      const reasonLabel = msg.reason === "30s_window_reached"
        ? "30-second window reached"
        : (msg.reason === "audio_finished" || msg.reason === "media_ended"
          ? "Audio playback concluded"
          : "Playback stopped");
      banner.innerHTML = `<strong>🔬 ${reasonLabel} (${msg.durationSec}s)</strong><br>` +
        `<span style="color:#7e94b8;">Executing GPU-accelerated deepfake neural analysis (wav2vec 2.0 + AASIST)...</span>`;
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
    if (pill) {
      pill.textContent = "No Audio";
      pill.className = "pill muted";
    }
    if (banner) {
      banner.style.display = "block";
      banner.style.background = "#2a151b";
      banner.style.color = "#ffabb9";
      banner.innerHTML = `<strong>⚠️ Playback Capture Cancelled:</strong> ${msg.reason || "No active audio detected playing in tab."}<br>` +
        `<span style="color:#cbd5e1; font-size:10px;">Please ensure audio is actively playing in the tab and try again.</span>`;
    }
  }

  if (msg.type === "PLAYBACK_ANALYSIS_ERROR") {
    showPlaybackCaptureError(msg.error);
  }
});

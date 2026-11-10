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

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

function readFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    $("status").textContent = "Choose an image file";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    $("status").textContent = "File exceeds 8 MB";
    $("explanation").textContent = "Choose an image smaller than 8 MB. Large image optimization is available for webpage image URLs.";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => setImage(reader.result, file.name);
  reader.onerror = () => { $("status").textContent = "Could not read file"; };
  reader.readAsDataURL(file);
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
["dragleave", "drop"].forEach(name => dropzone.addEventListener(name, event => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
}));
dropzone.addEventListener("drop", event => {
  const file = event.dataTransfer.files?.[0];
  if (file) {
    readFile(file);
    return;
  }
  const uriList = event.dataTransfer.getData("text/uri-list").split("\n").find(x => x && !x.startsWith("#"));
  const plain = event.dataTransfer.getData("text/plain").trim();
  const html = event.dataTransfer.getData("text/html");
  const htmlSrc = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  const candidate = uriList || htmlSrc || plain;
  if (candidate && /^(https?:\/\/|data:image\/)/i.test(candidate)) {
    setImage(candidate, "Image dragged from webpage");
  } else {
    $("status").textContent = "No image found in drop";
    $("explanation").textContent = "Try dragging the image itself, use the image's right-click menu, or choose a local file.";
  }
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
  $("verdict").textContent = "BitMind is analyzing this image…";
  $("explanation").textContent = "Waiting for the detector response.";
  const result = await send({ type: "ANALYZE_IMAGE", image, source: "manual review" });
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
  const data = result.response;
  const confidence = Number(data.confidence);
  const normalized = Number.isFinite(confidence) ? (confidence <= 1 ? confidence : confidence / 100) : NaN;
  const pct = Number.isFinite(normalized) ? `${(normalized * 100).toFixed(1)}%` : "Not provided";
  const uncertain = Number.isFinite(normalized) && normalized < 0.60;

  let verdictText, verdictClass;
  if (uncertain) {
    verdictText = `UNCERTAIN · ${data.isAI ? "AI signal" : "No AI signal"}`;
    verdictClass = "uncertain";
  } else if (data.isAI) {
    verdictText = "LIKELY AI-GENERATED";
    verdictClass = "ai";
  } else {
    verdictText = "LIKELY NOT AI-GENERATED";
    verdictClass = "real";
  }
  $("verdict").textContent = verdictText;
  $("verdict").className = `verdict ${verdictClass}`;
  $("status").textContent = result.cached ? "Cached result" : "Analysis complete";
  $("status").className = `pill ${uncertain ? "" : (data.isAI ? "bad" : "good")}`;
  $("confidence").textContent = pct;
  $("similarity").textContent = data.similarity ?? "Not provided";
  $("duration").textContent = result.cached ? "Cached" : `${result.durationMs} ms`;

  const label = data.isAI ? "AI-generated" : "not AI-generated";
  const confidenceLine = Number.isFinite(normalized)
    ? `BitMind classified this image as ${label}, reporting ${pct} confidence.`
    : `BitMind classified this image as ${label}.`;
  $("explanation").textContent =
    `${confidenceLine} The similarity field returned by the service is ${data.similarity ?? "not provided"}; the public response does not define its scale or calibration. ` +
    `This API response does not include a textual explanation of specific visual regions or artifacts, so this report does not claim to know which pixels caused the verdict. ` +
    `Treat the result as an automated signal, not proof of authenticity.`;
  $("raw").textContent = JSON.stringify({
    bitmind: data,
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
    label.textContent = item.isAI ? "AI-generated" : "Not AI-generated";
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

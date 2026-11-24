import { BATCH_IMAGE_LIMIT, checkImageProvider, createImageBatch, formatBatchCsv } from "./image-batch.mjs";

const statusLabels = {
  queued: "Queued",
  scanning: "Analyzing",
  complete: "Complete",
  failed: "Failed",
  invalid: "Invalid file",
};

function toDataUrl(file, mime) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reader.onabort = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file.slice(0, file.size, mime));
  });
}

function renderRow(row, busy, remove) {
  const item = document.createElement("li");
  item.className = "batch-file";
  const name = document.createElement("strong");
  name.className = "batch-file-name";
  name.textContent = row.name;
  const badge = document.createElement("span");
  badge.className = "pill " + (row.result?.tone || (row.error ? "bad" : "muted"));
  badge.textContent = row.result?.verdict || statusLabels[row.status];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button batch-remove";
  button.setAttribute("aria-label", "Remove " + row.name);
  button.textContent = "Remove";
  button.disabled = busy;
  button.addEventListener("click", () => remove(row.id));
  item.append(name, badge, button);

  const result = row.result;
  const details = [
    result?.provider || row.provider,
    result?.model,
    result?.confidence != null && result.confidence.toFixed(1) + "% confidence",
    result?.cached && "Cached",
  ].filter(Boolean).join(" · ");
  if (details || row.error) {
    const info = document.createElement("p");
    info.className = row.error ? "batch-file-error" : "batch-file-meta";
    info.textContent = row.error || details;
    item.append(info);
  }
  return item;
}

function statusText(counts, progress, busy) {
  const summary = [
    counts.queued && counts.queued + " queued",
    counts.complete && counts.complete + " complete",
    counts.failed && counts.failed + " failed",
    counts.invalid && counts.invalid + " invalid",
  ].filter(Boolean).join(" · ");
  if (!progress) return summary || "Add images to begin.";
  if (progress.phase === "checking" && !progress.stopRequested) return "Checking " + progress.provider + "…";
  if (busy && progress.stopRequested) return "Stopping after the current step.";
  if (busy) return progress.processed + " of " + progress.total + " processed · " + progress.provider;
  if (progress.phase === "stopped") return "Stopped after " + progress.processed + " of " + progress.total + " files. " + summary;
  return summary;
}

function downloadCsv(rows) {
  const csv = new Blob(["\ufeff", formatBatchCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(csv);
  const link = document.createElement("a");
  link.href = url;
  link.download = "moody-lens-image-batch.csv";
  try {
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const panel = document.getElementById("imageBatch");
const provider = document.getElementById("spImageProviderSelect");
if (panel && provider) {
  const get = id => panel.querySelector("#" + id);
  const choose = get("batchChoose");
  const input = get("batchInput");
  const dropzone = get("batchDropzone");
  const list = get("batchFiles");
  const status = get("batchStatus");
  const notice = get("batchNotice");
  const meter = get("batchProgress");
  const start = get("batchStart");
  const stop = get("batchStop");
  const retry = get("batchRetry");
  const exportButton = get("batchExport");
  const clear = get("batchClear");
  const send = message => chrome.runtime.sendMessage(message);

  function showNotice(message) {
    notice.textContent = message;
    notice.hidden = !message;
  }

  const batch = createImageBatch({
    checkProvider: id => checkImageProvider(send, id),
    analyzeFile: async (file, mime, id) => {
      const image = await toDataUrl(file, mime);
      return send({ type: "ANALYZE_IMAGE", image, provider: id, source: "manual batch review" });
    },
    onChange: render,
  });

  function render({ rows, busy, progress }) {
    const counts = { queued: 0, complete: 0, failed: 0, invalid: 0 };
    for (const row of rows) {
      if (Object.hasOwn(counts, row.status)) counts[row.status]++;
    }
    const restoreFocus = !busy && document.activeElement === stop;
    choose.disabled = input.disabled = busy || rows.length >= BATCH_IMAGE_LIMIT;
    start.disabled = busy || !counts.queued;
    stop.hidden = !busy;
    stop.disabled = Boolean(progress?.stopRequested);
    retry.hidden = !counts.failed;
    retry.disabled = busy;
    exportButton.disabled = busy || !(counts.complete || counts.failed || counts.invalid);
    clear.disabled = busy || !rows.length;
    meter.hidden = !busy;
    meter.max = progress?.total || 1;
    meter.value = progress?.processed || 0;
    const text = statusText(counts, progress, busy);
    if (status.textContent !== text) status.textContent = text;
    showNotice(progress?.error || "");
    list.hidden = !rows.length;
    list.replaceChildren(...rows.map(row => renderRow(row, busy, id => {
      if (batch.remove(id)) choose.focus();
    })));
    if (restoreFocus) (start.disabled ? clear : start).focus({ preventScroll: true });
  }

  function addFiles(files) {
    if (batch.snapshot().busy) return;
    if (!files?.length) {
      showNotice("Choose local image files to add to the batch.");
      return;
    }
    const { omitted } = batch.add(files);
    if (omitted) showNotice(omitted + " extra files skipped. A batch holds up to " + BATCH_IMAGE_LIMIT + " files.");
  }

  function selectedProvider() {
    const option = provider.selectedOptions[0];
    return option && { id: option.value, label: option.textContent.trim() };
  }

  choose.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    if (input.files?.length) addFiles(input.files);
    input.value = "";
  });
  dropzone.addEventListener("dragover", event => {
    event.preventDefault();
    if (!input.disabled) dropzone.classList.add("dragover");
    event.dataTransfer.dropEffect = input.disabled ? "none" : "copy";
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", event => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
    addFiles(event.dataTransfer.files);
  });
  start.addEventListener("click", () => batch.run(selectedProvider()));
  stop.addEventListener("click", () => batch.stop());
  retry.addEventListener("click", () => batch.run(selectedProvider(), "failed"));
  exportButton.addEventListener("click", () => downloadCsv(batch.snapshot().rows));
  clear.addEventListener("click", () => {
    if (batch.clear()) choose.focus();
  });
  window.addEventListener("pagehide", () => batch.stop());
  render(batch.snapshot());
}

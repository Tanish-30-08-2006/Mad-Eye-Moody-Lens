export const BATCH_IMAGE_LIMIT = 20;
export const BATCH_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const providerReadinessKeys = {
  bitmind: "bitmindReadiness",
  zerotrue: "zeroTrueReadiness",
  moodylens: "moodyLensReadiness",
  custom: "customReadiness",
};

export async function checkImageProvider(send, provider) {
  const status = await send({ type: "GET_PUBLIC_STATUS" });
  const readiness = status?.[providerReadinessKeys[provider]];
  if (!readiness?.state) throw new Error("Could not check the image provider. Try again.");
  if (readiness.state === "not_configured" || readiness.state === "invalid") {
    throw new Error("Set up the selected image provider under Settings before starting the batch.");
  }
}

async function detectImageType(file) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = signature => signature.every((byte, index) => header[index] === byte);
  if (matches([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  const text = new TextDecoder().decode(header);
  if (text.startsWith("GIF87a") || text.startsWith("GIF89a")) return "image/gif";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "image/webp";
  return "";
}

function confidencePercent(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) return null;
  return number <= 1 ? number * 100 : number;
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function summarizeResult(reply, provider) {
  const result = reply?.response;
  if (!reply?.ok || !result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(asText(reply?.error) || "The provider did not return a usable result.");
  }

  const confidence = confidencePercent(result.confidence);
  let verdict = "Inconclusive";
  let tone = "warn";
  if (typeof result.isAI === "boolean") {
    if (result.verdict === "uncertain" || (confidence !== null && confidence < 60)) {
      verdict = "Uncertain";
    } else {
      verdict = result.isAI ? "Likely AI-generated" : "Likely not AI-generated";
      tone = result.isAI ? "bad" : "good";
    }
  }
  return {
    verdict,
    tone,
    confidence,
    provider: asText(result.providerName) || asText(result.provider) || provider,
    model: asText(result.model),
    cached: reply.cached === true,
  };
}

export function createImageBatch({ checkProvider, analyzeFile, onChange = () => {} }) {
  const entries = [];
  let nextId = 1;
  let busy = false;
  let progress = null;

  function snapshot() {
    return {
      busy,
      progress: progress ? { ...progress } : null,
      rows: entries.map(({ file, ...row }) => ({ ...row, result: row.result ? { ...row.result } : null })),
    };
  }

  const notify = () => onChange(snapshot());

  function add(files) {
    const incoming = Array.from(files);
    if (busy) return { added: 0, omitted: incoming.length };
    const accepted = incoming.slice(0, BATCH_IMAGE_LIMIT - entries.length);
    for (const file of accepted) {
      let error = "";
      if (file.size === 0) error = "The file is empty.";
      else if (file.size > BATCH_IMAGE_MAX_BYTES) error = "The file exceeds 8 MB.";
      entries.push({
        id: nextId++,
        file,
        name: file.name || "Unnamed image",
        status: error ? "invalid" : "queued",
        error,
        provider: "",
        result: null,
      });
    }
    if (accepted.length) {
      progress = null;
      notify();
    }
    return { added: accepted.length, omitted: incoming.length - accepted.length };
  }

  function remove(id) {
    if (busy) return false;
    const index = entries.findIndex(entry => entry.id === id);
    if (index === -1) return false;
    entries.splice(index, 1);
    progress = null;
    notify();
    return true;
  }

  function clear() {
    if (busy) return false;
    entries.length = 0;
    progress = null;
    notify();
    return true;
  }

  async function run(provider, status = "queued") {
    if (busy || !provider?.id) return false;
    const targets = entries.filter(entry => entry.status === status);
    if (!targets.length) return false;
    const { id: providerId, label: providerLabel } = provider;

    busy = true;
    progress = {
      phase: "checking", total: targets.length, processed: 0, stopRequested: false, provider: providerLabel, error: "",
    };
    try {
      notify();
      await checkProvider(providerId);
      progress.phase = "scanning";
      for (const entry of targets) {
        if (progress.stopRequested) break;
        entry.status = "scanning";
        entry.error = "";
        entry.provider = "";
        notify();
        try {
          const mime = await detectImageType(entry.file);
          if (mime) {
            entry.provider = providerLabel;
            const reply = await analyzeFile(entry.file, mime, providerId);
            entry.result = summarizeResult(reply, providerLabel);
            entry.status = "complete";
          } else {
            entry.status = "invalid";
            entry.error = "Choose a JPEG, PNG, WebP, or GIF image.";
          }
        } catch (error) {
          entry.status = "failed";
          entry.error = asText(error?.message) || "Could not analyze this image.";
        }
        progress.processed++;
        notify();
      }
      progress.phase = progress.processed === progress.total ? "finished" : "stopped";
    } catch (error) {
      progress.phase = progress.stopRequested ? "stopped" : "failed";
      progress.error = progress.phase === "failed" ? asText(error?.message) || "Could not start the batch." : "";
    } finally {
      busy = false;
      notify();
    }
    return true;
  }

  function stop() {
    if (!busy || progress.stopRequested) return false;
    progress.stopRequested = true;
    notify();
    return true;
  }

  return { add, clear, remove, run, snapshot, stop };
}

function csvCell(value) {
  const text = String(value ?? "");
  // Protect spreadsheet users when a filename or provider field begins with a formula marker.
  const safe = /^[\t\r\n]|^\s*[=+\-@]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function formatBatchCsv(rows) {
  const header = ["File", "Status", "Verdict", "Confidence (%)", "Provider", "Model", "Cached"];
  const lines = rows.map(({ name, status, provider, result }) => [
    name, status, result?.verdict, result?.confidence?.toFixed(1), result?.provider || provider,
    result?.model, result ? (result.cached ? "yes" : "no") : "",
  ]);
  return [header, ...lines].map(line => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

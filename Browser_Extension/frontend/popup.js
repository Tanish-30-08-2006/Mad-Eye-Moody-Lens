const $ = id => document.getElementById(id);
const send = message => chrome.runtime.sendMessage(message);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderDiagnostics(stats) {
  if (!stats) {
    $("diagnostics").textContent = "Scanner is not active in this tab. Use ‘Scan this tab now’ or refresh the page.";
    return;
  }
  const rejects = stats.rejectReasons || {};
  $("diagnostics").textContent =
    `Scanner: active · ${stats.platform || "page"} · ${stats.threshold || "Standard"}\n` +
    `Candidates: ${stats.found ?? 0} · Post media: ${stats.postMediaCandidates ?? 0}\n` +
    `Size passed: ${stats.sizePassed ?? 0} · Eligible: ${stats.eligible ?? 0} · Visibility skipped: ${stats.visibilityRejected ?? 0}\n` +
    `Requests: ${stats.submitted ?? 0} · Completed: ${stats.completed ?? 0} · Errors: ${stats.errors ?? 0}\n` +
    `Skipped: small box ${rejects.renderedTooSmall ?? 0} · small source ${rejects.sourceTooSmall ?? 0} · hidden ${rejects.hidden ?? 0} · aspect ${rejects.aspectRatio ?? 0}\n` +
    `UI skipped: ${stats.skippedByContext ?? 0} · No URL: ${stats.missingSource ?? 0}` +
    (stats.lastError ? `\nLast API error: ${stats.lastError}` : "") +
    (stats.sample ? `\nLast rejected sample: ${stats.sample}` : "");
}

async function refresh() {
  const status = await send({ type: "GET_PUBLIC_STATUS" });
  $("keyState").textContent = status.keyConfigured ? "Key configured" : "Not configured";
  $("keyState").className = `pill ${status.keyConfigured ? "good" : "muted"}`;
  $("scanState").textContent = status.scanEnabled ? "On" : "Off";
  $("scanState").className = `pill ${status.scanEnabled ? "good" : "muted"}`;
  $("toggleScan").textContent = status.scanEnabled ? "Disable automatic scanning" : "Enable scanning on websites";
  $("toggleScan").className = status.scanEnabled ? "secondary full" : "primary full";
  $("thresholdSelect").value = status.scanThreshold || "standard";
  const tab = await activeTab();
  if (tab?.id) {
    try {
      const pong = await chrome.tabs.sendMessage(tab.id, { type: "DS_GET_STATS" });
      renderDiagnostics(pong?.stats);
    } catch { renderDiagnostics(null); }
  }
}

$("saveKey").addEventListener("click", async () => {
  const key = $("apiKey").value.trim();
  if (!key) { $("keyMessage").textContent = "Paste your API key first."; return; }
  $("saveKey").disabled = true;
  const result = await send({ type: "SAVE_API_KEY", apiKey: key });
  $("saveKey").disabled = false;
  $("keyMessage").textContent = result.ok ? "API key saved in this browser profile." : result.error;
  if (result.ok) { $("apiKey").value = ""; await refresh(); }
});

$("testKey").addEventListener("click", async () => {
  $("testKey").disabled = true;
  $("keyMessage").textContent = "Sending one test request to BitMind…";
  const result = await send({ type: "TEST_API_KEY" });
  $("testKey").disabled = false;
  $("keyMessage").textContent = result.ok
    ? `API key works. BitMind returned isAI=${result.response.isAI}, confidence=${result.response.confidence}.`
    : `Test failed: ${result.error}`;
});

$("thresholdSelect").addEventListener("change", async () => {
  const result = await send({ type: "SET_SCAN_THRESHOLD", value: $("thresholdSelect").value });
  $("keyMessage").textContent = result.ok ? "Minimum image size updated." : `Could not update threshold: ${result.error}`;
  await refresh();
});

$("toggleScan").addEventListener("click", async () => {
  $("toggleScan").disabled = true;
  const status = await send({ type: "GET_PUBLIC_STATUS" });
  if (status.scanEnabled) {
    const result = await send({ type: "DISABLE_SCANNING" });
    $("keyMessage").textContent = result.ok ? "Automatic scanning disabled." : result.error;
  } else {
    if (!status.keyConfigured) {
      $("keyMessage").textContent = "Save your BitMind API key before enabling automatic scanning.";
      $("toggleScan").disabled = false;
      return;
    }
    const granted = await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] });
    if (!granted) $("keyMessage").textContent = "Website permission was not granted. Automatic scanning remains off.";
    else {
      const result = await send({ type: "ENABLE_SCANNING" });
      $("keyMessage").textContent = result.ok ? "Automatic scanning enabled. Refresh the active page if needed." : `Could not enable scanning: ${result.error}`;
    }
  }
  $("toggleScan").disabled = false;
  await refresh();
});

$("scanNow").addEventListener("click", async () => {
  $("scanNow").disabled = true;
  $("diagnostics").textContent = "Starting scanner and re-evaluating current media containers…";
  try {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("Could not identify the active tab.");
    const result = await send({ type: "SCAN_CURRENT_TAB", tabId: tab.id });
    if (!result.ok) throw new Error(result.error);
    renderDiagnostics(result.ping?.stats || result.stats);
    $("keyMessage").textContent = `Scanner active. ${result.ping?.stats?.found ?? result.stats?.found ?? 0} image/media candidates discovered.`;
    await new Promise(resolve => setTimeout(resolve, 1200));
  } catch (error) { $("diagnostics").textContent = `Scan could not start: ${error.message}`; }
  $("scanNow").disabled = false;
  await refresh();
});

$("openReview").addEventListener("click", async () => {
  const tab = await activeTab();
  if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
  window.close();
});

refresh().catch(error => { $("keyMessage").textContent = error.message; });
setInterval(() => { refresh().catch(() => {}); }, 1800);

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
    (stats.lastError ? `\nLast provider error: ${stats.lastError}` : "") +
    (stats.sample ? `\nLast rejected sample: ${stats.sample}` : "");
}

async function refresh() {
  const status = await send({ type: "GET_PUBLIC_STATUS" });
  if (status?.error) throw new Error(status.error);
  $("providerSelect").value = status.activeProvider || "bitmind";
  $("providerState").textContent = status.activeProviderConfigured
    ? (status.activeProvider === "custom" ? status.customProviderName : "BitMind ready")
    : "Needs setup";
  $("providerState").className = `pill ${status.activeProviderConfigured ? "good" : "muted"}`;
  $("bitmindCard").hidden = status.activeProvider !== "bitmind";
  $("keyState").textContent = status.bitmindConfigured ? "Key configured" : "Not configured";
  $("keyState").className = `pill ${status.bitmindConfigured ? "good" : "muted"}`;
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

$("providerSelect").addEventListener("change", async () => {
  const provider = $("providerSelect").value;
  $("providerSelect").disabled = true;
  try {
    const result = await send({ type: "SET_ACTIVE_PROVIDER", provider });
    if (!result?.ok) throw new Error(result?.error || "Could not select provider.");
    $("keyMessage").textContent = `Active provider changed to ${provider === "custom" ? "Custom REST API" : "BitMind Oracle"}.`;
    await refresh();
  } catch (error) {
    $("keyMessage").textContent = error.message;
    await refresh();
  } finally {
    $("providerSelect").disabled = false;
  }
});

$("manageProviders").addEventListener("click", () => chrome.runtime.openOptionsPage());

$("saveKey").addEventListener("click", async () => {
  const key = $("apiKey").value.trim();
  if (!key) { $("keyMessage").textContent = "Paste your API key first."; return; }
  $("saveKey").disabled = true;
  try {
    const result = await send({ type: "SAVE_API_KEY", apiKey: key });
    if (!result?.ok) throw new Error(result?.error || "Could not save API key.");
    $("apiKey").value = "";
    $("keyMessage").textContent = "BitMind API key saved in this browser profile.";
    await refresh();
  } catch (error) { $("keyMessage").textContent = error.message; }
  finally { $("saveKey").disabled = false; }
});

$("testKey").addEventListener("click", async () => {
  $("testKey").disabled = true;
  $("keyMessage").textContent = "Sending one test request to BitMind…";
  try {
    const result = await send({ type: "TEST_API_KEY" });
    if (!result?.ok) throw new Error(result?.error || "BitMind test failed.");
    $("keyMessage").textContent = `BitMind connection succeeded. isAI=${result.response.isAI}, confidence=${result.response.confidence ?? "not provided"}.`;
  } catch (error) { $("keyMessage").textContent = `Test failed: ${error.message}`; }
  finally { $("testKey").disabled = false; }
});

$("thresholdSelect").addEventListener("change", async () => {
  const result = await send({ type: "SET_SCAN_THRESHOLD", value: $("thresholdSelect").value });
  $("keyMessage").textContent = result.ok ? "Minimum image size updated." : `Could not update image size: ${result.error}`;
  await refresh();
});

$("toggleScan").addEventListener("click", async () => {
  $("toggleScan").disabled = true;
  try {
    const status = await send({ type: "GET_PUBLIC_STATUS" });
    if (status.scanEnabled) {
      const result = await send({ type: "DISABLE_SCANNING" });
      if (!result?.ok) throw new Error(result?.error || "Could not disable scanning.");
      $("keyMessage").textContent = "Automatic scanning disabled.";
    } else {
      if (!status.activeProviderConfigured) {
        throw new Error("Configure the selected provider before enabling automatic scanning.");
      }
      const granted = await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] });
      if (!granted) throw new Error("Website permission was not granted. Automatic scanning remains off.");
      const result = await send({ type: "ENABLE_SCANNING" });
      if (!result?.ok) throw new Error(result?.error || "Could not enable scanning.");
      $("keyMessage").textContent = "Automatic scanning enabled. Refresh the active page if needed.";
    }
  } catch (error) { $("keyMessage").textContent = error.message; }
  finally { $("toggleScan").disabled = false; await refresh(); }
});

$("scanNow").addEventListener("click", async () => {
  $("scanNow").disabled = true;
  $("diagnostics").textContent = "Starting scanner and re-evaluating current media containers…";
  try {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("Could not identify the active tab.");
    const result = await send({ type: "SCAN_CURRENT_TAB", tabId: tab.id });
    if (!result?.ok) throw new Error(result.error);
    renderDiagnostics(result.ping?.stats || result.stats);
    $("keyMessage").textContent = `Scanner active. ${result.ping?.stats?.found ?? result.stats?.found ?? 0} image/media candidates discovered.`;
    await new Promise(resolve => setTimeout(resolve, 1200));
  } catch (error) { $("diagnostics").textContent = `Scan could not start: ${error.message}`; }
  finally { $("scanNow").disabled = false; await refresh(); }
});

$("openReview").addEventListener("click", async () => {
  const tab = await activeTab();
  if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
  window.close();
});

refresh().catch(error => { $("keyMessage").textContent = error.message; });
setInterval(() => { refresh().catch(() => {}); }, 1800);


// ===========================================================================
// AUDIO DETECTION (TAB PLAYBACK & ZERO TRUE CLOUD API)
// ===========================================================================

function renderAudioStatus(status) {
  if (!status) return;

  const { wsAuthenticated, wsConnected, wsConnecting, modelReady, device } = status;
  const isPlaybackActive = Boolean(status.playbackCaptureActive);
  const mode = status.audioEngineMode || "auto";
  const ztReady = Boolean(status.zeroTrueConfigured);

  // Monitoring pill
  const pill = $("audioMonitoringState");
  if (pill) {
    if (isPlaybackActive) {
      pill.textContent = "● RECORDING";
      pill.className   = "pill good";
    } else {
      pill.textContent = "Idle";
      pill.className   = "pill muted";
    }
  }

  // Engine Mode Badge
  const modeBadge = $("audioEngineModeBadge");
  if (modeBadge) {
    if (mode === "zerotrue") {
      modeBadge.textContent = "ZeroTrue Cloud API";
      modeBadge.className = "audio-stat-value good";
    } else if (mode === "local") {
      modeBadge.textContent = "Local Model Only";
      modeBadge.className = "audio-stat-value";
    } else {
      modeBadge.textContent = "Auto (Local/Cloud)";
      modeBadge.className = "audio-stat-value good";
    }
  }

  // Model status & Device
  if (mode === "zerotrue") {
    if ($("audioModelName")) $("audioModelName").textContent = "ZeroTrue Voice AI";
    if ($("audioDeviceStatus")) $("audioDeviceStatus").textContent = "CLOUD (https://zerotrue.app)";
    if (ztReady) {
      $("audioModelStatus").textContent = "READY (ZeroTrue API)";
      $("audioModelStatus").className   = "audio-stat-value good";
    } else {
      $("audioModelStatus").textContent = "Add ZeroTrue API Key";
      $("audioModelStatus").className   = "audio-stat-value bad";
    }
  } else if (mode === "auto" && !modelReady && !wsAuthenticated && ztReady) {
    if ($("audioModelName")) $("audioModelName").textContent = "ZeroTrue (Cloud Fallback)";
    if ($("audioDeviceStatus")) $("audioDeviceStatus").textContent = "CLOUD (ZeroTrue)";
    $("audioModelStatus").textContent = "READY (Cloud Fallback)";
    $("audioModelStatus").className   = "audio-stat-value good";
  } else {
    if ($("audioModelName")) $("audioModelName").textContent = status.modelName || "SSL Anti-Spoofing";
    if ($("audioDeviceStatus")) {
      $("audioDeviceStatus").textContent = status.device ? `LOCAL (${status.device.toUpperCase()})` : "LOCAL (CUDA)";
    }
    if (status.modelReady || wsAuthenticated) {
      $("audioModelStatus").textContent = "READY";
      $("audioModelStatus").className   = "audio-stat-value good";
    } else if (status.wsConnecting || wsConnected) {
      $("audioModelStatus").textContent = "Connecting…";
      $("audioModelStatus").className   = "audio-stat-value";
    } else if (ztReady) {
      $("audioModelStatus").textContent = "READY (ZeroTrue Fallback)";
      $("audioModelStatus").className   = "audio-stat-value good";
    } else {
      $("audioModelStatus").textContent = "UNAVAILABLE – local offline";
      $("audioModelStatus").className   = "audio-stat-value bad";
    }
  }

  // Current status banner
  const statusEl = $("audioCurrentStatus");
  if (statusEl) {
    if (isPlaybackActive) {
      statusEl.textContent = "🎙️ Recording tab audio playback...";
      statusEl.className   = "audio-current-status audio-status-ok";
      statusEl.style.display = "block";
    } else {
      statusEl.textContent = "";
      statusEl.className   = "audio-current-status";
      statusEl.style.display = "none";
    }
  }

  // Persistent service & ZeroTrue tip banner (fixed format, zero layout shift)
  const hint = $("audioServiceHint");
  if (hint) {
    if (mode === "local" && !wsAuthenticated && !wsConnected && !status.wsConnecting) {
      hint.innerHTML = `<span style="color:#fca5a5; font-weight:700; margin-right:4px;">⚙ Local Model:</span> Start Python engine (<code style="background:#1e293b; padding:1px 4px; border-radius:3px;">inference_server.py</code>) or switch to ZeroTrue above.`;
    } else if (mode === "zerotrue" && !ztReady) {
      hint.innerHTML = `<span style="color:#a5b4fc; font-weight:700; margin-right:4px;">💡 ZeroTrue Tip:</span> Enter and save your API key above from <a href="https://zerotrue.app" target="_blank" style="color:#818cf8; text-decoration:underline;">zerotrue.app</a> to run cloud analysis.`;
    } else if (mode === "auto" && !wsAuthenticated && !ztReady) {
      hint.innerHTML = `<span style="color:#a5b4fc; font-weight:700; margin-right:4px;">💡 ZeroTrue Tip:</span> Don't have local GPU? Enter your free ZeroTrue API key above to analyze audio online.`;
    } else if (mode === "zerotrue" || (mode === "auto" && !wsAuthenticated && ztReady)) {
      hint.innerHTML = `<span style="color:#86efac; font-weight:700; margin-right:4px;">✅ Cloud Ready:</span> ZeroTrue Online API is configured. Play tab audio to detect deepfakes.`;
    } else {
      hint.innerHTML = `<span style="color:#86efac; font-weight:700; margin-right:4px;">✅ Engine Ready:</span> Local AI inference engine is active on CUDA/GPU.`;
    }
    hint.style.display = "flex";
  }
}

// ---------------------------------------------------------------------------
// ZeroTrue API Key & Detection Engine Controls
// ---------------------------------------------------------------------------
async function initAudioEngineConfig() {
  try {
    const res = await send({ type: "GET_AUDIO_CONFIG" });
    if (res?.ok) {
      if ($("audioEngineSelect") && res.audioEngineMode) {
        $("audioEngineSelect").value = res.audioEngineMode;
      }
      if ($("zeroTrueKeyInput") && res.zeroTrueApiKey) {
        $("zeroTrueKeyInput").value = res.zeroTrueApiKey;
      }
    }
  } catch {}
}

$("audioEngineSelect")?.addEventListener("change", async () => {
  const mode = $("audioEngineSelect").value;
  await send({ type: "SAVE_ZEROTRUE_CONFIG", engineMode: mode });
  await refreshAudio();
});

$("btnSaveZeroTrueKey")?.addEventListener("click", async () => {
  const key = $("zeroTrueKeyInput")?.value?.trim() || "";
  const msgEl = $("zeroTrueKeyMsg");
  if (!key) {
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.style.color = "#ff9090";
      msgEl.textContent = "Paste your ZeroTrue API key first.";
    }
    return;
  }
  const btn = $("btnSaveZeroTrueKey");
  btn.disabled = true;
  try {
    const res = await send({ type: "SAVE_ZEROTRUE_CONFIG", apiKey: key });
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.style.color = res.ok ? "#86efac" : "#ff9090";
      msgEl.textContent = res.ok ? "ZeroTrue API key saved." : ("Error: " + res.error);
    }
    await refreshAudio();
  } catch (err) {
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.style.color = "#ff9090";
      msgEl.textContent = "Save error: " + err.message;
    }
  } finally {
    btn.disabled = false;
  }
});

$("btnTestZeroTrueKey")?.addEventListener("click", async () => {
  const key = $("zeroTrueKeyInput")?.value?.trim() || "";
  const msgEl = $("zeroTrueKeyMsg");
  if (!key) {
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.style.color = "#ff9090";
      msgEl.textContent = "Enter your ZeroTrue API key to test.";
    }
    return;
  }
  const btn = $("btnTestZeroTrueKey");
  btn.disabled = true;
  if (msgEl) {
    msgEl.style.display = "block";
    msgEl.style.color = "#cbd5e1";
    msgEl.textContent = "Testing ZeroTrue API connection...";
  }
  try {
    const res = await send({ type: "TEST_ZEROTRUE_KEY", apiKey: key });
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.style.color = res.ok ? "#86efac" : "#ff9090";
      msgEl.textContent = res.ok ? "✅ ZeroTrue API connection verified!" : ("Test failed: " + res.error);
    }
  } catch (err) {
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.style.color = "#ff9090";
      msgEl.textContent = "Test error: " + err.message;
    }
  } finally {
    btn.disabled = false;
  }
});

$("btnPlaybackCapture")?.addEventListener("click", async () => {
  const btn = $("btnPlaybackCapture");
  btn.disabled = true;

  try {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("Could not identify the active tab.");

    // Open detailed review slide directly
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});

    // Start timed tab playback capture (auto-detects end or 30s)
    const res = await send({ type: "AUDIO_START_PLAYBACK_CAPTURE", tabId: tab.id, maxDurationSec: 30 });
    if (!res || !res.ok) throw new Error(res?.error || "Could not start playback capture.");

    // Close popup so user interacts via sidepanel
    window.close();
  } catch (err) {
    const statusEl = $("audioCurrentStatus");
    if (statusEl) {
      statusEl.textContent = "Playback Error: " + err.message;
      statusEl.className = "audio-current-status audio-status-err";
    }
    btn.disabled = false;
  }
});

async function refreshAudio() {
  try {
    const result = await send({ type: "AUDIO_GET_STATUS" });
    if (result?.ok) renderAudioStatus(result.status);
  } catch {}
}

// Live status updates pushed from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "AUDIO_STATUS_UPDATE") {
    renderAudioStatus(message.status);
  }
});

initAudioEngineConfig().catch(() => {});
refreshAudio().catch(() => {});
setInterval(() => { refreshAudio().catch(() => {}); }, 2500);

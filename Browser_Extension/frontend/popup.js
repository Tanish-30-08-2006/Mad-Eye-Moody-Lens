const $ = id => document.getElementById(id);
const send = message => chrome.runtime.sendMessage(message);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION SETUP (Top-Level Tabs & Analyse Sub-Tabs)
// ─────────────────────────────────────────────────────────────────────────────

function setupNavigation() {
  // Main Top-Level Tabs (Analyse, History, Settings)
  const mainTabs = document.querySelectorAll(".tab-nav.main-tabs .tab-btn");
  const mainPanes = document.querySelectorAll(".tab-viewport > .tab-pane");
  mainTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      mainTabs.forEach(t => {
        const active = t === btn;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      mainPanes.forEach(p => p.classList.toggle("active", p.id === btn.dataset.target));
      if (btn.dataset.target === "tabHistory") {
        loadHistory();
      }
    });
  });

  // Sub-Navigation under Analyse (Image, Audio, Video)
  const subTabs = document.querySelectorAll(".sub-nav .sub-tab-btn");
  const subPanes = document.querySelectorAll("#tabAnalyse .sub-pane");
  subTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      subTabs.forEach(t => {
        const active = t === btn;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      subPanes.forEach(p => p.classList.toggle("active", p.id === btn.dataset.sub));
    });
  });
}
setupNavigation();

function switchToMainTab(tabId) {
  const mainTabs = document.querySelectorAll(".tab-nav.main-tabs .tab-btn");
  const mainPanes = document.querySelectorAll(".tab-viewport > .tab-pane");
  mainTabs.forEach(t => {
    const active = t.dataset.target === tabId;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  mainPanes.forEach(p => p.classList.toggle("active", p.id === tabId));
}

// Shortcut from Audio pane to Settings > Providers
$("goToAudioSettings")?.addEventListener("click", () => {
  switchToMainTab("tabSettings");
  $("zeroTrueSettingsCard")?.scrollIntoView({ behavior: "smooth" });
});

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTICS & STATUS
// ─────────────────────────────────────────────────────────────────────────────

function renderDiagnostics(stats) {
  if (!stats) {
    $("diagnostics").textContent = "Scanner is not active in this tab. Use 'Scan Active Tab' or refresh.";
    return;
  }
  const rejects = stats.rejectReasons || {};
  $("diagnostics").textContent =
    `Scanner: active · ${stats.platform || "page"} · ${stats.threshold || "Standard"}\n` +
    `Candidates: ${stats.found ?? 0} · Post media: ${stats.postMediaCandidates ?? 0}\n` +
    `Size passed: ${stats.sizePassed ?? 0} · Eligible: ${stats.eligible ?? 0}\n` +
    `Requests: ${stats.submitted ?? 0} · Completed: ${stats.completed ?? 0} · Errors: ${stats.errors ?? 0}\n` +
    `Filtered: small box ${rejects.renderedTooSmall ?? 0} · small source ${rejects.sourceTooSmall ?? 0} · not ready ${rejects.imageNotReady ?? 0} · hidden ${rejects.hidden ?? 0}\n` +
    `UI skipped: ${stats.skippedByContext ?? 0} · Missing URL: ${stats.missingSource ?? 0}` +
    (stats.lastError ? `\nLast error: ${stats.lastError}` : "") +
    (stats.sample ? `\nFilter sample: ${stats.sample}` : "");
}

function updateModelBadge(provider) {
  const badge = $("imageModelBadge");
  const notice = $("providerNotice");
  if (!badge) return;

  if (provider === "bitmind") {
    badge.textContent = "BitMind Oracle (Automatic)";
    if (notice) notice.style.display = "none";
  } else if (provider === "moodylens") {
    badge.textContent = "Moody Lens Server Ensemble";
    if (notice) notice.style.display = "none";
  } else if (provider === "custom") {
    badge.textContent = "Custom REST (Configured in settings)";
    if (notice) notice.style.display = "none";
  } else if (provider === "zerotrue") {
    badge.textContent = "ZeroTrue Multi-Modal AI";
    if (notice) notice.style.display = "none";
  } else {
    badge.textContent = "Managed by provider";
    if (notice) notice.style.display = "none";
  }
}

async function refresh() {
  const status = await send({ type: "GET_PUBLIC_STATUS" });
  if (status?.error) throw new Error(status.error);

  const active = status.activeProvider || "bitmind";
  if ($("providerSelect")) {
    $("providerSelect").value = active;
    updateModelBadge(active);
  }

  const providerLabel = active === "custom"
    ? (status.customProviderName || "Custom REST ready")
    : (active === "moodylens" ? "Moody Lens Server ready" : (active === "zerotrue" ? "ZeroTrue Cloud AI ready" : "BitMind ready"));

  $("providerState").textContent = status.activeProviderConfigured
    ? providerLabel
    : "Needs configuration";
  $("providerState").className = `pill ${status.activeProviderConfigured ? "good" : "muted"}`;

  $("keyState").textContent = status.bitmindConfigured ? "Configured" : "Not configured";
  $("keyState").className = `pill ${status.bitmindConfigured ? "good" : "muted"}`;

  $("scanState").textContent = status.scanEnabled ? "On" : "Off";
  $("scanState").className = `pill ${status.scanEnabled ? "good" : "muted"}`;
  $("toggleScan").textContent = status.scanEnabled ? "Disable auto-scan" : "Enable auto-scan";
  $("toggleScan").className = status.scanEnabled ? "secondary full" : "primary full";
  $("thresholdSelect").value = status.scanThreshold || "standard";

  const tab = await activeTab();
  if (tab?.id) {
    try {
      const pong = await chrome.tabs.sendMessage(tab.id, { type: "DS_GET_STATS" });
      renderDiagnostics(pong?.stats);
    } catch { renderDiagnostics(null); }
  }

  // Check Video status
  try {
    const videoStatus = await send({ type: "VIDEO_CHECK_PROVIDER_CONFIG" });
    if (videoStatus?.ok && videoStatus.data) {
      const vData = videoStatus.data;
      if ($("videoProviderSelect")) $("videoProviderSelect").value = vData.activeProvider || "bitmind";
      if ($("videoProviderState")) {
        $("videoProviderState").textContent = vData.isConfigured ? "Ready" : "Needs setup";
        $("videoProviderState").className = `pill ${vData.isConfigured ? "good" : "muted"}`;
      }
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE DETECTION PROVIDER SELECTION
// ─────────────────────────────────────────────────────────────────────────────

$("providerSelect").addEventListener("change", async () => {
  const provider = $("providerSelect").value;
  updateModelBadge(provider);

  $("providerSelect").disabled = true;
  try {
    const result = await send({ type: "SET_ACTIVE_PROVIDER", provider });
    if (!result?.ok) throw new Error(result?.error || "Could not select provider.");
    $("keyMessage").textContent = `Active provider set to ${provider}.`;
    await refresh();
  } catch (error) {
    $("keyMessage").textContent = error.message;
    await refresh();
  } finally {
    $("providerSelect").disabled = false;
  }
});

$("manageProviders").addEventListener("click", () => chrome.runtime.openOptionsPage());

// ─────────────────────────────────────────────────────────────────────────────
// BITMIND API KEY MANAGEMENT (Show/Hide, Save, Remove, Test)
// ─────────────────────────────────────────────────────────────────────────────

$("toggleBitmindKeyVisibility")?.addEventListener("click", () => {
  const input = $("apiKey");
  const btn = $("toggleBitmindKeyVisibility");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
});

$("saveKey").addEventListener("click", async () => {
  const key = $("apiKey").value.trim();
  if (!key) {
    $("keyMessage").textContent = "Please paste your BitMind API key.";
    $("keyMessage").className = "message error";
    return;
  }
  $("saveKey").disabled = true;
  try {
    const result = await send({ type: "SAVE_API_KEY", apiKey: key });
    if (!result?.ok) throw new Error(result?.error || "Could not save BitMind API key.");
    $("apiKey").value = "";
    $("keyMessage").textContent = "BitMind API key saved successfully.";
    $("keyMessage").className = "message good";
    await refresh();
  } catch (error) {
    $("keyMessage").textContent = error.message;
    $("keyMessage").className = "message error";
  } finally {
    $("saveKey").disabled = false;
  }
});

$("removeBitmindKey")?.addEventListener("click", async () => {
  $("removeBitmindKey").disabled = true;
  try {
    await chrome.storage.local.set({ apiKey: "", apiKeyUpdatedAt: Date.now() });
    $("apiKey").value = "";
    $("keyMessage").textContent = "BitMind API key removed.";
    $("keyMessage").className = "message";
    await refresh();
  } catch (error) {
    $("keyMessage").textContent = "Could not remove key: " + error.message;
    $("keyMessage").className = "message error";
  } finally {
    $("removeBitmindKey").disabled = false;
  }
});

$("testKey").addEventListener("click", async () => {
  $("testKey").disabled = true;
  $("keyMessage").textContent = "Testing BitMind connection…";
  $("keyMessage").className = "message";
  try {
    const result = await send({ type: "TEST_API_KEY" });
    if (!result?.ok) throw new Error(result?.error || "BitMind connection test failed.");
    $("keyMessage").textContent = `BitMind verified! isAI=${result.response.isAI}, confidence=${result.response.confidence ?? "N/A"}.`;
    $("keyMessage").className = "message good";
  } catch (error) {
    $("keyMessage").textContent = `Test failed: ${error.message}`;
    $("keyMessage").className = "message error";
  } finally {
    $("testKey").disabled = false;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SCANNER ACTIONS & THRESHOLD
// ─────────────────────────────────────────────────────────────────────────────

$("thresholdSelect").addEventListener("change", async () => {
  const result = await send({ type: "SET_SCAN_THRESHOLD", value: $("thresholdSelect").value });
  $("keyMessage").textContent = result.ok ? "Scan threshold updated." : `Could not update size: ${result.error}`;
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
        throw new Error("Configure the active provider in Settings > Providers first.");
      }
      const granted = await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] });
      if (!granted) throw new Error("Website permission was not granted.");
      const result = await send({ type: "ENABLE_SCANNING" });
      if (!result?.ok) throw new Error(result?.error || "Could not enable scanning.");
      $("keyMessage").textContent = "Automatic scanning enabled.";
    }
  } catch (error) {
    $("keyMessage").textContent = error.message;
    $("keyMessage").className = "message error";
  } finally {
    $("toggleScan").disabled = false;
    await refresh();
  }
});

$("scanNow").addEventListener("click", async () => {
  $("scanNow").disabled = true;
  $("diagnostics").textContent = "Scanning active tab for media candidates…";
  try {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("Could not find the active tab.");
    const result = await send({ type: "SCAN_CURRENT_TAB", tabId: tab.id });
    if (!result?.ok) throw new Error(result.error);
    renderDiagnostics(result.ping?.stats || result.stats);
    await new Promise(resolve => setTimeout(resolve, 800));
  } catch (error) {
    $("diagnostics").textContent = `Scan error: ${error.message}`;
  } finally {
    $("scanNow").disabled = false;
    await refresh();
  }
});

$("openReview").addEventListener("click", async () => {
  const tab = await activeTab();
  if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
  window.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO DETECTION (Active Provider & Sidepanel Launcher)
// ─────────────────────────────────────────────────────────────────────────────

$("videoProviderSelect")?.addEventListener("change", async () => {
  const provider = $("videoProviderSelect").value;
  try {
    await send({ type: "VIDEO_SET_ACTIVE_PROVIDER", provider });
    await refresh();
  } catch (err) {
    console.warn("Could not set video provider:", err);
  }
});

$("btnOpenVideoSidepanel")?.addEventListener("click", async () => {
  const tab = await activeTab();
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO DETECTION (Tab Playback & Status)
// ─────────────────────────────────────────────────────────────────────────────

function renderAudioStatus(status) {
  if (!status) return;
  const isPlaybackActive = Boolean(status.playbackCaptureActive);
  const mode = status.audioEngineMode || "auto";
  const ztReady = Boolean(status.zeroTrueConfigured);

  // Monitoring pill
  const pill = $("audioMonitoringState");
  if (pill) {
    if (isPlaybackActive) {
      pill.textContent = "● RECORDING";
      pill.className = "pill good";
    } else {
      pill.textContent = "Idle";
      pill.className = "pill muted";
    }
  }

  // Engine Mode Badge
  const modeBadge = $("audioEngineModeBadge");
  if (modeBadge) {
    if (mode === "zerotrue") {
      modeBadge.textContent = "ZeroTrue Cloud";
      modeBadge.className = "audio-stat-value good";
    } else if (mode === "local") {
      modeBadge.textContent = "Local Model Only";
      modeBadge.className = "audio-stat-value";
    } else {
      modeBadge.textContent = "Auto";
      modeBadge.className = "audio-stat-value good";
    }
  }

  // Model status & Device
  if (mode === "zerotrue") {
    if ($("audioModelName")) $("audioModelName").textContent = "ZeroTrue Voice AI";
    if ($("audioDeviceStatus")) $("audioDeviceStatus").textContent = "CLOUD (ZeroTrue)";
    if (ztReady) {
      $("audioModelStatus").textContent = "READY";
      $("audioModelStatus").className = "audio-stat-value good";
    } else {
      $("audioModelStatus").textContent = "Key Required";
      $("audioModelStatus").className = "audio-stat-value bad";
    }
  } else if (mode === "auto" && !status.modelReady && !status.wsAuthenticated && ztReady) {
    if ($("audioModelName")) $("audioModelName").textContent = "ZeroTrue (Fallback)";
    if ($("audioDeviceStatus")) $("audioDeviceStatus").textContent = "CLOUD (ZeroTrue)";
    $("audioModelStatus").textContent = "READY (Cloud)";
    $("audioModelStatus").className = "audio-stat-value good";
  } else {
    if ($("audioModelName")) $("audioModelName").textContent = status.modelName || "SSL Anti-Spoofing";
    if ($("audioDeviceStatus")) {
      $("audioDeviceStatus").textContent = status.device ? `LOCAL (${status.device.toUpperCase()})` : "LOCAL (CUDA)";
    }
    if (status.modelReady || status.wsAuthenticated) {
      $("audioModelStatus").textContent = "READY";
      $("audioModelStatus").className = "audio-stat-value good";
    } else if (status.wsConnecting || status.wsConnected) {
      $("audioModelStatus").textContent = "Connecting…";
      $("audioModelStatus").className = "audio-stat-value";
    } else if (ztReady) {
      $("audioModelStatus").textContent = "READY (ZeroTrue)";
      $("audioModelStatus").className = "audio-stat-value good";
    } else {
      $("audioModelStatus").textContent = "OFFLINE";
      $("audioModelStatus").className = "audio-stat-value bad";
    }
  }

  // Current status banner
  const statusEl = $("audioCurrentStatus");
  if (statusEl) {
    if (isPlaybackActive) {
      statusEl.textContent = "Recording tab audio playback...";
      statusEl.className = "audio-current-status audio-status-ok";
      statusEl.style.display = "block";
    } else {
      statusEl.textContent = "";
      statusEl.style.display = "none";
    }
  }
}

$("btnPlaybackCapture")?.addEventListener("click", async () => {
  const btn = $("btnPlaybackCapture");
  btn.disabled = true;

  try {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("Could not find the active tab.");

    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    const res = await send({ type: "AUDIO_START_PLAYBACK_CAPTURE", tabId: tab.id, maxDurationSec: 30 });
    if (!res || !res.ok) throw new Error(res?.error || "Could not start playback capture.");
    window.close();
  } catch (err) {
    const statusEl = $("audioCurrentStatus");
    if (statusEl) {
      statusEl.textContent = "Playback Error: " + err.message;
      statusEl.className = "audio-current-status audio-status-err";
      statusEl.style.display = "block";
    }
    btn.disabled = false;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ZEROTRUE API KEY MANAGEMENT (Show/Hide, Save, Remove, Test, Mode)
// ─────────────────────────────────────────────────────────────────────────────

$("toggleZeroTrueKeyVisibility")?.addEventListener("click", () => {
  const input = $("zeroTrueKeyInput");
  const btn = $("toggleZeroTrueKeyVisibility");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
});

async function initZeroTrueConfig() {
  try {
    const res = await send({ type: "GET_AUDIO_CONFIG" });
    if (res?.ok) {
      if ($("audioEngineSelect") && res.audioEngineMode) {
        $("audioEngineSelect").value = res.audioEngineMode;
      }
      if ($("zeroTrueState")) {
        $("zeroTrueState").textContent = res.zeroTrueConfigured ? "Configured" : "Not configured";
        $("zeroTrueState").className = `pill ${res.zeroTrueConfigured ? "good" : "muted"}`;
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
      msgEl.className = "message error";
      msgEl.textContent = "Please enter your ZeroTrue API key.";
    }
    return;
  }
  const btn = $("btnSaveZeroTrueKey");
  btn.disabled = true;
  try {
    const res = await send({ type: "SAVE_ZEROTRUE_CONFIG", apiKey: key });
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.className = res.ok ? "message good" : "message error";
      msgEl.textContent = res.ok ? "ZeroTrue API key saved." : ("Error: " + res.error);
    }
    $("zeroTrueKeyInput").value = "";
    await initZeroTrueConfig();
    await refreshAudio();
  } catch (err) {
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.className = "message error";
      msgEl.textContent = "Save error: " + err.message;
    }
  } finally {
    btn.disabled = false;
  }
});

$("btnRemoveZeroTrueKey")?.addEventListener("click", async () => {
  const btn = $("btnRemoveZeroTrueKey");
  btn.disabled = true;
  const msgEl = $("zeroTrueKeyMsg");
  try {
    await send({ type: "SAVE_ZEROTRUE_CONFIG", apiKey: "" });
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.className = "message";
      msgEl.textContent = "ZeroTrue API key removed.";
    }
    $("zeroTrueKeyInput").value = "";
    await initZeroTrueConfig();
    await refreshAudio();
  } catch (err) {
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.className = "message error";
      msgEl.textContent = "Remove error: " + err.message;
    }
  } finally {
    btn.disabled = false;
  }
});

$("btnTestZeroTrueKey")?.addEventListener("click", async () => {
  const key = $("zeroTrueKeyInput")?.value?.trim() || "";
  const msgEl = $("zeroTrueKeyMsg");
  const btn = $("btnTestZeroTrueKey");
  btn.disabled = true;
  if (msgEl) {
    msgEl.style.display = "block";
    msgEl.className = "message";
    msgEl.textContent = "Testing ZeroTrue connection…";
  }
  try {
    // Test with input key or stored key
    const res = await send({ type: "TEST_ZEROTRUE_KEY", apiKey: key });
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.className = res.ok ? "message good" : "message error";
      msgEl.textContent = res.ok ? "ZeroTrue API connection verified!" : ("Test failed: " + res.error);
    }
  } catch (err) {
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.className = "message error";
      msgEl.textContent = "Test error: " + err.message;
    }
  } finally {
    btn.disabled = false;
  }
});

async function refreshAudio() {
  try {
    const result = await send({ type: "AUDIO_GET_STATUS" });
    if (result?.ok) renderAudioStatus(result.status);
  } catch {}
}

chrome.runtime.onMessage.addListener(message => {
  if (message.type === "AUDIO_STATUS_UPDATE") {
    renderAudioStatus(message.status);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY (Image & Video History Records)
// ─────────────────────────────────────────────────────────────────────────────

async function loadHistory() {
  const listEl = $("popupHistoryList");
  if (!listEl) return;
  listEl.textContent = "Loading records…";

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
      .slice(0, 10);

    if (!combined.length) {
      listEl.textContent = "No detections recorded yet.";
      return;
    }

    listEl.replaceChildren();
    for (const item of combined) {
      const row = document.createElement("div");
      row.className = "history-item";

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "history-item-title";
      const verdictText = item.verdict || (item.isAI === true ? "AI-generated" : item.isAI === false ? "Not AI" : "Inconclusive");
      title.textContent = `[${item.mediaType}] ${verdictText}`;

      const sub = document.createElement("div");
      sub.className = "history-item-sub";
      const dateStr = item.dateFormatted || new Date(item.timestamp || item.time).toLocaleTimeString();
      const modelStr = item.model || item.provider || "";
      sub.textContent = `${dateStr}${modelStr ? " · " + modelStr : ""}`;

      left.append(title, sub);

      const pill = document.createElement("span");
      pill.className = `pill ${item.isAI ? "bad" : item.isAI === false ? "good" : "muted"}`;
      pill.textContent = item.confidence ? `${Math.round(item.confidence <= 1 ? item.confidence * 100 : item.confidence)}%` : "Done";

      row.append(left, pill);
      listEl.appendChild(row);
    }
  } catch (err) {
    listEl.textContent = "Could not load history: " + err.message;
  }
}

$("refreshHistory")?.addEventListener("click", loadHistory);

$("clearHistory")?.addEventListener("click", async () => {
  if (confirm("Clear local detection history?")) {
    await chrome.storage.local.set({ detectionHistory: [], videoDetectionHistory: [] });
    await loadHistory();
  }
});

// Initial loaders
refresh().catch(err => { $("keyMessage").textContent = err.message; });
initZeroTrueConfig().catch(() => {});
refreshAudio().catch(() => {});
setInterval(() => { refresh().catch(() => {}); }, 2500);

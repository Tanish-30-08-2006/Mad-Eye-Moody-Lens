const $ = id => document.getElementById(id);
const send = message => chrome.runtime.sendMessage(message);

// ─────────────────────────────────────────────────────────────────────────────
// BITMIND ORACLE CONFIGURATION (Show/Hide, Save, Remove, Test)
// ─────────────────────────────────────────────────────────────────────────────

$("optToggleBitmindKey")?.addEventListener("click", () => {
  const input = $("optBitmindKey");
  const btn = $("optToggleBitmindKey");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
});

function showBitmindMsg(msg, kind = "") {
  const el = $("optBitmindMsg");
  if (!el) return;
  el.style.display = "block";
  el.textContent = msg;
  el.className = kind ? `message ${kind}` : "message";
}

async function loadBitmindConfig() {
  try {
    const res = await send({ type: "GET_PUBLIC_STATUS" });
    if (res && $("optBitmindState")) {
      $("optBitmindState").textContent = res.bitmindConfigured ? "Configured" : "Not configured";
      $("optBitmindState").className = `pill ${res.bitmindConfigured ? "good" : "muted"}`;
    }
  } catch {}
}

$("optSaveBitmindKey")?.addEventListener("click", async () => {
  const key = $("optBitmindKey")?.value?.trim() || "";
  if (!key) { showBitmindMsg("Please paste your BitMind API key.", "error"); return; }
  const btn = $("optSaveBitmindKey");
  btn.disabled = true;
  showBitmindMsg("Saving BitMind key…");
  try {
    const res = await send({ type: "SAVE_API_KEY", apiKey: key });
    showBitmindMsg(res.ok ? "BitMind API key saved." : ("Error: " + res.error), res.ok ? "good" : "error");
    $("optBitmindKey").value = "";
    await loadBitmindConfig();
  } catch (err) {
    showBitmindMsg("Save error: " + err.message, "error");
  } finally { btn.disabled = false; }
});

$("optRemoveBitmindKey")?.addEventListener("click", async () => {
  const btn = $("optRemoveBitmindKey");
  btn.disabled = true;
  try {
    await chrome.storage.local.set({ apiKey: "", apiKeyUpdatedAt: Date.now() });
    showBitmindMsg("BitMind API key removed.", "good");
    $("optBitmindKey").value = "";
    await loadBitmindConfig();
  } catch (err) {
    showBitmindMsg("Remove error: " + err.message, "error");
  } finally { btn.disabled = false; }
});

$("optTestBitmindKey")?.addEventListener("click", async () => {
  const btn = $("optTestBitmindKey");
  btn.disabled = true;
  showBitmindMsg("Sending a test request to BitMind…");
  try {
    const res = await send({ type: "TEST_API_KEY" });
    if (!res?.ok) throw new Error(res?.error || "BitMind test failed.");
    showBitmindMsg(`BitMind connection verified! isAI=${res.response.isAI}, confidence=${res.response.confidence ?? "N/A"}.`, "good");
  } catch (err) {
    showBitmindMsg(`Test error: ${err.message}`, "error");
  } finally { btn.disabled = false; }
});

// ─────────────────────────────────────────────────────────────────────────────
// ZEROTRUE ONLINE API & AUDIO ENGINE (Show/Hide, Save, Remove, Test, Mode)
// ─────────────────────────────────────────────────────────────────────────────

$("optToggleZeroTrueKey")?.addEventListener("click", () => {
  const input = $("optZeroTrueKey");
  const btn = $("optToggleZeroTrueKey");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
});

function showZeroTrueMsg(msg, kind = "") {
  const el = $("optZeroTrueMsg");
  if (!el) return;
  el.style.display = "block";
  el.textContent = msg;
  el.className = kind ? `message ${kind}` : "message";
}

async function loadZeroTrueConfig() {
  try {
    const res = await send({ type: "GET_AUDIO_CONFIG" });
    if (res?.ok) {
      const modeEl = $("optAudioEngineSelect");
      if (modeEl && res.audioEngineMode) modeEl.value = res.audioEngineMode;
      if ($("optZeroTrueState")) {
        $("optZeroTrueState").textContent = res.zeroTrueConfigured ? "Configured" : "Not configured";
        $("optZeroTrueState").className = `pill ${res.zeroTrueConfigured ? "good" : "muted"}`;
      }
    }
  } catch {}
}

$("optAudioEngineSelect")?.addEventListener("change", async () => {
  const mode = $("optAudioEngineSelect").value;
  await send({ type: "SAVE_ZEROTRUE_CONFIG", engineMode: mode });
  await loadZeroTrueConfig();
});

$("optSaveZeroTrueKey")?.addEventListener("click", async () => {
  const key = $("optZeroTrueKey")?.value?.trim() || "";
  if (!key) { showZeroTrueMsg("Please paste your ZeroTrue API key.", "error"); return; }
  const btn = $("optSaveZeroTrueKey");
  btn.disabled = true;
  showZeroTrueMsg("Saving ZeroTrue key…");
  try {
    const res = await send({ type: "SAVE_ZEROTRUE_CONFIG", apiKey: key });
    showZeroTrueMsg(res.ok ? "ZeroTrue API key saved." : ("Error: " + res.error), res.ok ? "good" : "error");
    $("optZeroTrueKey").value = "";
    await loadZeroTrueConfig();
  } catch (err) {
    showZeroTrueMsg("Save error: " + err.message, "error");
  } finally { btn.disabled = false; }
});

$("optRemoveZeroTrueKey")?.addEventListener("click", async () => {
  const btn = $("optRemoveZeroTrueKey");
  btn.disabled = true;
  try {
    await send({ type: "SAVE_ZEROTRUE_CONFIG", apiKey: "" });
    showZeroTrueMsg("ZeroTrue API key removed.", "good");
    $("optZeroTrueKey").value = "";
    await loadZeroTrueConfig();
  } catch (err) {
    showZeroTrueMsg("Remove error: " + err.message, "error");
  } finally { btn.disabled = false; }
});

$("optTestZeroTrueKey")?.addEventListener("click", async () => {
  const key = $("optZeroTrueKey")?.value?.trim() || "";
  const btn = $("optTestZeroTrueKey");
  btn.disabled = true;
  showZeroTrueMsg("Testing ZeroTrue connection…");
  try {
    const res = await send({ type: "TEST_ZEROTRUE_KEY", apiKey: key });
    showZeroTrueMsg(res.ok ? "✓ ZeroTrue API connection verified!" : ("Test failed: " + res.error), res.ok ? "good" : "error");
  } catch (err) {
    showZeroTrueMsg("Test error: " + err.message, "error");
  } finally { btn.disabled = false; }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAD-EYE MOODY LENS SERVER
// ─────────────────────────────────────────────────────────────────────────────

function showMoodyMessage(msg, kind = "") {
  const el = $("moodyMessage");
  if (!el) return;
  el.style.display = "block";
  el.textContent = msg;
  el.className = kind ? `message ${kind}` : "message";
}

async function loadMoodyConfig() {
  try {
    const res = await send({ type: "GET_MOODYLENS_SERVER_CONFIG" });
    if (res?.ok) {
      if ($("moodyServerUrl") && res.url) $("moodyServerUrl").value = res.url;
      if (res.usable) {
        showMoodyMessage(`Connected to Moody Lens server at ${res.url}. Ready for analysis.`, "good");
      }
    }
  } catch (_) {}
}

$("saveMoodyConfig")?.addEventListener("click", async () => {
  const btn = $("saveMoodyConfig");
  btn.disabled = true;
  showMoodyMessage("Validating server address and requesting host permission…");
  try {
    const rawUrl = $("moodyServerUrl").value.trim();
    const apiKey = $("moodyApiKey")?.value?.trim() || "";
    let url;
    try { url = new URL(rawUrl); } catch { throw new Error("Enter a valid absolute server URL, e.g. http://127.0.0.1:8080"); }
    const originPattern = `${url.origin}/*`;
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) throw new Error("Server host access was not granted. Configuration not saved.");
    const res = await send({ type: "SAVE_MOODYLENS_SERVER_CONFIG", url: rawUrl, apiKey });
    if (!res?.ok) throw new Error(res?.error || "Could not save server settings.");
    showMoodyMessage(`Moody Lens server saved (${res.url}).`, "good");
  } catch (err) {
    showMoodyMessage(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

$("testMoodyConfig")?.addEventListener("click", async () => {
  const btn = $("testMoodyConfig");
  btn.disabled = true;
  showMoodyMessage("Testing connection to Moody Lens server…");
  try {
    const res = await send({ type: "TEST_MOODYLENS_SERVER" });
    if (!res?.ok) throw new Error(res?.error || "Server connection failed.");
    const modelNames = (res.models || []).map(m => m.name || m.id || m.model).filter(Boolean);
    const count = modelNames.length;
    showMoodyMessage(`Server ready! Discovered ${count} model(s): ${modelNames.join(", ") || "Active pipelines"}.`, "good");
  } catch (err) {
    showMoodyMessage(`Connection test failed: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM REST API CONNECTOR
// ─────────────────────────────────────────────────────────────────────────────

function readConfig() {
  return {
    name: $("providerName").value.trim() || "Custom REST API",
    endpoint: $("endpoint").value.trim(),
    authType: $("authType").value,
    apiKey: $("apiKey").value.trim(),
    authHeaderName: $("authHeaderName").value.trim() || "x-api-key",
    additionalHeaders: $("additionalHeaders").value.trim() || "{}",
    imageTransport: $("imageTransport").value,
    imageField: $("imageField").value.trim(),
    modelId: $("modelId").value.trim(),
    modelField: $("modelField").value.trim(),
    modelHeaderName: $("modelHeaderName").value.trim(),
    isAIPath: $("isAIPath").value.trim(),
    labelPath: $("labelPath").value.trim(),
    confidencePath: $("confidencePath").value.trim(),
    similarityPath: $("similarityPath").value.trim(),
    explanationPath: $("explanationPath").value.trim(),
    modelPath: $("modelPath").value.trim(),
    aiLabels: $("aiLabels").value,
    realLabels: $("realLabels").value
  };
}

function showMessage(message, kind = "") {
  $("message").textContent = message;
  $("message").className = `message ${kind}`;
}

function renderAuthFields() {
  const needsAuth = $("authType").value !== "none";
  $("authFields").hidden = !needsAuth;
  $("authHeaderWrap").hidden = $("authType").value !== "header";
}

function fillConfig(config) {
  const keys = {
    providerName: "name", endpoint: "endpoint", authType: "authType", apiKey: "apiKey",
    authHeaderName: "authHeaderName", additionalHeaders: "additionalHeaders", imageTransport: "imageTransport",
    imageField: "imageField", modelId: "modelId", modelField: "modelField", modelHeaderName: "modelHeaderName",
    isAIPath: "isAIPath", labelPath: "labelPath", confidencePath: "confidencePath",
    similarityPath: "similarityPath", explanationPath: "explanationPath", modelPath: "modelPath", aiLabels: "aiLabels", realLabels: "realLabels"
  };
  for (const [elementId, key] of Object.entries(keys)) {
    if (config[key] !== undefined && config[key] !== null) $(elementId).value = config[key];
  }
  renderAuthFields();
}

async function loadCustomConfig() {
  try {
    const result = await send({ type: "GET_CUSTOM_PROVIDER_CONFIG" });
    if (!result?.ok) throw new Error(result?.error || "Could not load provider settings.");
    fillConfig(result.config || {});
  } catch (error) { showMessage(error.message, "error"); }
}

$("authType").addEventListener("change", renderAuthFields);

$("providerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("saveConfig");
  button.disabled = true;
  showMessage("Validating configuration and requesting API host access…");
  try {
    const config = readConfig();
    let endpoint;
    try { endpoint = new URL(config.endpoint); }
    catch { throw new Error("Enter a valid absolute endpoint URL."); }
    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && localHost)) {
      throw new Error("Use HTTPS for remote APIs. HTTP is allowed only for localhost development servers.");
    }
    if (endpoint.username || endpoint.password || endpoint.hash) {
      throw new Error("Do not embed credentials or fragments in the endpoint URL.");
    }
    const originPattern = `${endpoint.origin}/*`;
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) throw new Error("API host access was not granted. The custom provider was not saved.");
    const result = await send({ type: "SAVE_CUSTOM_PROVIDER_CONFIG", config });
    if (!result?.ok) throw new Error(result?.error || "Could not save the custom provider.");
    showMessage("Custom provider saved successfully.", "good");
    await loadCustomConfig();
  } catch (error) { showMessage(error.message, "error"); }
  finally { button.disabled = false; }
});

$("testConfig").addEventListener("click", async () => {
  const button = $("testConfig");
  button.disabled = true;
  showMessage("Sending a test image to the custom provider…");
  try {
    const result = await send({ type: "TEST_CUSTOM_PROVIDER" });
    if (!result?.ok) throw new Error(result?.error || "Provider test failed.");
    const response = result.response || {};
    const verdict = response.isAI === true ? "likely AI-generated" : response.isAI === false ? "likely not AI-generated" : "inconclusive (label not recognized)";
    const confidence = Number.isFinite(response.confidence) ? `, confidence ${(response.confidence * 100).toFixed(1)}%` : "";
    showMessage(`Connection succeeded in ${result.durationMs} ms: ${verdict}${confidence}.`, "good");
  } catch (error) { showMessage(`Connection test failed: ${error.message}`, "error"); }
  finally { button.disabled = false; }
});

// Initialize all sections
loadBitmindConfig();
loadZeroTrueConfig();
loadMoodyConfig();
loadCustomConfig();

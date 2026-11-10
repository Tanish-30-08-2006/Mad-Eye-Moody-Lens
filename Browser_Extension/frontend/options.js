const $ = id => document.getElementById(id);
const send = message => chrome.runtime.sendMessage(message);

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

async function loadConfig() {
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
    showMessage("Custom provider saved. Select ‘Custom REST API’ in the extension popup to use it.", "good");
    await loadConfig();
  } catch (error) { showMessage(error.message, "error"); }
  finally { button.disabled = false; }
});

$("testConfig").addEventListener("click", async () => {
  const button = $("testConfig");
  button.disabled = true;
  showMessage("Sending a test image to the saved custom provider…");
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

loadConfig();

document.addEventListener("DOMContentLoaded", async () => {
  const engineSelect = document.getElementById("engineSelect");
  const bitmindKey = document.getElementById("bitmindKey");
  const toggleBitmindKey = document.getElementById("toggleBitmindKey");
  const bitmindEndpoint = document.getElementById("bitmindEndpoint");
  const saveBitmindBtn = document.getElementById("saveBitmindBtn");
  const testBitmindBtn = document.getElementById("testBitmindBtn");
  const bitmindStatus = document.getElementById("bitmindStatus");

  const customName = document.getElementById("customName");
  const customEndpoint = document.getElementById("customEndpoint");
  const customAuthType = document.getElementById("customAuthType");
  const customApiKey = document.getElementById("customApiKey");
  const customTransport = document.getElementById("customTransport");
  const customVideoField = document.getElementById("customVideoField");
  const customIsAIPath = document.getElementById("customIsAIPath");
  const customConfidencePath = document.getElementById("customConfidencePath");
  const customLabelPath = document.getElementById("customLabelPath");
  const saveCustomBtn = document.getElementById("saveCustomBtn");
  const testCustomBtn = document.getElementById("testCustomBtn");
  const customStatus = document.getElementById("customStatus");

  const optHoverScan = document.getElementById("optHoverScan");
  const optAutoScan = document.getElementById("optAutoScan");
  const optHoverDelay = document.getElementById("optHoverDelay");
  const saveHoverOptsBtn = document.getElementById("saveHoverOptsBtn");
  const hoverStatus = document.getElementById("hoverStatus");

  // Load existing options
  const settings = await chrome.storage.local.get([
    "activeProvider", "apiKey", "bitmindEndpoint", "customProviderConfig",
    "hoverScanEnabled", "autoScanOnHover", "hoverDelayMs"
  ]);

  if (settings.activeProvider) engineSelect.value = settings.activeProvider;
  if (settings.apiKey) bitmindKey.value = settings.apiKey;
  if (settings.bitmindEndpoint) bitmindEndpoint.value = settings.bitmindEndpoint;

  if (settings.customProviderConfig) {
    const c = settings.customProviderConfig;
    if (c.name) customName.value = c.name;
    if (c.endpoint) customEndpoint.value = c.endpoint;
    if (c.authType) customAuthType.value = c.authType;
    if (c.apiKey) customApiKey.value = c.apiKey;
    if (c.videoTransport) customTransport.value = c.videoTransport;
    if (c.videoField) customVideoField.value = c.videoField;
    if (c.isAIPath) customIsAIPath.value = c.isAIPath;
    if (c.confidencePath) customConfidencePath.value = c.confidencePath;
    if (c.labelPath) customLabelPath.value = c.labelPath;
  }

  optHoverScan.checked = settings.hoverScanEnabled ?? true;
  optAutoScan.checked = settings.autoScanOnHover ?? true;
  if (settings.hoverDelayMs) optHoverDelay.value = String(settings.hoverDelayMs);

  // Engine selection
  engineSelect.addEventListener("change", async () => {
    await chrome.storage.local.set({ activeProvider: engineSelect.value });
  });

  // Toggle BitMind Key visibility
  toggleBitmindKey.addEventListener("click", () => {
    bitmindKey.type = bitmindKey.type === "password" ? "text" : "password";
  });

  // Save BitMind Settings
  saveBitmindBtn.addEventListener("click", async () => {
    const key = bitmindKey.value.trim();
    const endpoint = bitmindEndpoint.value.trim();
    await chrome.storage.local.set({
      apiKey: key,
      apiKeyUpdatedAt: Date.now(),
      bitmindEndpoint: endpoint
    });
    bitmindStatus.textContent = "✓ BitMind credentials saved.";
    bitmindStatus.style.color = "#34d399";
  });

  // Test BitMind Connection
  testBitmindBtn.addEventListener("click", () => {
    const key = bitmindKey.value.trim();
    if (!key) {
      bitmindStatus.textContent = "Please enter an API key first.";
      bitmindStatus.style.color = "#f87171";
      return;
    }
    testBitmindBtn.disabled = true;
    testBitmindBtn.textContent = "Testing...";

    chrome.runtime.sendMessage({ type: "TEST_PROVIDER_KEY", apiKey: key }, res => {
      testBitmindBtn.disabled = false;
      testBitmindBtn.textContent = "Test Connection";
      if (res?.ok && res.data?.success) {
        bitmindStatus.textContent = "✓ Verified! BitMind API is operational.";
        bitmindStatus.style.color = "#34d399";
      } else {
        bitmindStatus.textContent = "✕ Error: " + (res?.error || "Validation failed.");
        bitmindStatus.style.color = "#f87171";
      }
    });
  });

  // Save Custom REST API
  saveCustomBtn.addEventListener("click", async () => {
    const config = {
      name: customName.value.trim() || "Custom Video API",
      endpoint: customEndpoint.value.trim(),
      authType: customAuthType.value,
      apiKey: customApiKey.value.trim(),
      videoTransport: customTransport.value,
      videoField: customVideoField.value.trim() || "video",
      isAIPath: customIsAIPath.value.trim() || "isAI",
      confidencePath: customConfidencePath.value.trim() || "confidence",
      labelPath: customLabelPath.value.trim() || "label",
      updatedAt: Date.now()
    };

    if (!config.endpoint) {
      customStatus.textContent = "Please provide an API endpoint URL.";
      customStatus.style.color = "#f87171";
      return;
    }

    await chrome.storage.local.set({ customProviderConfig: config });
    customStatus.textContent = "✓ Custom REST provider saved.";
    customStatus.style.color = "#34d399";
  });

  // Test Custom Provider
  testCustomBtn.addEventListener("click", async () => {
    customStatus.textContent = "Testing custom endpoint...";
    customStatus.style.color = "#38bdf8";
    const config = (await chrome.storage.local.get("customProviderConfig")).customProviderConfig;
    if (!config?.endpoint) {
      customStatus.textContent = "Save your custom configuration first.";
      customStatus.style.color = "#f87171";
      return;
    }

    try {
      const resp = await fetch(config.endpoint, { method: "OPTIONS" });
      customStatus.textContent = `Server responded with HTTP ${resp.status}`;
      customStatus.style.color = "#34d399";
    } catch (err) {
      customStatus.textContent = "Could not reach endpoint: " + err.message;
      customStatus.style.color = "#f87171";
    }
  });

  // Save Hover Settings
  saveHoverOptsBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({
      hoverScanEnabled: optHoverScan.checked,
      autoScanOnHover: optAutoScan.checked,
      hoverDelayMs: Number(optHoverDelay.value)
    });
    hoverStatus.textContent = "✓ Hover preferences updated.";
    hoverStatus.style.color = "#34d399";
  });
});

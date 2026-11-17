(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ProviderEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : self, function () {
  "use strict";

  const DEFAULT_CUSTOM_CONFIG = Object.freeze({
    name: "Custom REST API",
    endpoint: "",
    authType: "bearer",
    apiKey: "",
    authHeaderName: "x-api-key",
    additionalHeaders: "{}",
    imageTransport: "url_json",
    imageField: "image",
    modelId: "",
    modelField: "model",
    modelHeaderName: "X-Model-ID",
    isAIPath: "isAI",
    labelPath: "label",
    confidencePath: "confidence",
    similarityPath: "similarity",
    explanationPath: "explanation",
    modelPath: "model",
    aiLabels: "fake, ai, ai-generated, synthetic",
    realLabels: "real, human, authentic, not-ai, not ai"
  });

  const TRANSPORTS = new Set(["url_json", "base64_json", "multipart", "binary"]);
  const AUTH_TYPES = new Set(["none", "bearer", "header"]);
  const RESERVED_HEADERS = new Set(["authorization", "content-type", "content-length", "host", "origin"]);

  function getPath(value, path) {
    if (!path || typeof path !== "string") return undefined;
    return path.split(".").filter(Boolean).reduce((current, key) => {
      if (current == null) return undefined;
      return current[key];
    }, value);
  }

  function normalizeConfidence(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 100) return null;
    return number > 1 ? number / 100 : number;
  }

  function labelsFrom(value) {
    return String(value || "")
      .split(",")
      .map(label => label.trim().toLowerCase())
      .filter(Boolean);
  }

  function verdictFor(isAI, confidence) {
    if (typeof isAI !== "boolean") return "unknown";
    if (confidence !== null && confidence < 0.6) return "uncertain";
    return isAI ? "likely_ai" : "likely_not_ai";
  }

  function normalizeCustomResponse(raw, config) {
    const settings = { ...DEFAULT_CUSTOM_CONFIG, ...(config || {}) };
    const isAIValue = getPath(raw, settings.isAIPath);
    let isAI = typeof isAIValue === "boolean" ? isAIValue : null;
    let label = null;

    if (isAI === null && settings.labelPath) {
      const mappedLabel = getPath(raw, settings.labelPath);
      if (typeof mappedLabel === "string" || typeof mappedLabel === "number") {
        label = String(mappedLabel).trim().toLowerCase();
        if (labelsFrom(settings.aiLabels).includes(label)) isAI = true;
        else if (labelsFrom(settings.realLabels).includes(label)) isAI = false;
      }
    }

    const confidence = normalizeConfidence(getPath(raw, settings.confidencePath));
    const similarity = getPath(raw, settings.similarityPath);
    const explanationValue = getPath(raw, settings.explanationPath);
    const model = getPath(raw, settings.modelPath);

    return {
      provider: "custom",
      providerName: settings.name || "Custom REST API",
      model: typeof model === "string" && model.trim() ? model.trim() : (settings.modelId || "Custom model"),
      isAI,
      confidence,
      similarity: similarity ?? null,
      verdict: verdictFor(isAI, confidence),
      explanation: typeof explanationValue === "string" && explanationValue.trim()
        ? explanationValue.trim()
        : (label ? `Provider label: ${label}` : null),
      rawResponse: raw
    };
  }

  function normalizeBitMindResponse(raw) {
    const isAI = typeof raw?.isAI === "boolean" ? raw.isAI : null;
    const confidence = normalizeConfidence(raw?.confidence);
    return {
      ...raw,
      provider: "bitmind",
      providerName: "BitMind Oracle",
      model: typeof raw?.model === "string" && raw.model.trim() ? raw.model.trim() : "BitMind Oracle",
      isAI,
      confidence,
      similarity: raw?.similarity ?? null,
      verdict: verdictFor(isAI, confidence),
      rawResponse: raw
    };
  }

  function validateCustomConfig(config) {
    const settings = { ...DEFAULT_CUSTOM_CONFIG, ...(config || {}) };
    if (!settings.endpoint || typeof settings.endpoint !== "string") {
      throw new Error("Enter the custom API endpoint URL.");
    }

    let endpoint;
    try { endpoint = new URL(settings.endpoint); }
    catch { throw new Error("The custom API endpoint must be a valid absolute URL."); }

    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && localHost)) {
      throw new Error("Use an HTTPS endpoint. HTTP is allowed only for localhost development servers.");
    }
    if (endpoint.username || endpoint.password) throw new Error("Do not embed credentials in the endpoint URL; use the authentication fields.");
    if (endpoint.hash) throw new Error("The endpoint URL must not contain a fragment.");
    if (!AUTH_TYPES.has(settings.authType)) throw new Error("Choose a supported authentication method.");
    if (settings.authType !== "none" && !String(settings.apiKey || "").trim()) {
      throw new Error("Enter the API token or key for this provider.");
    }
    if (settings.authType === "header") {
      const headerName = String(settings.authHeaderName || "").trim();
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(headerName)) throw new Error("Enter a valid authentication header name.");
      if (RESERVED_HEADERS.has(headerName.toLowerCase())) throw new Error("That header cannot be used for API-key authentication.");
    }
    if (!TRANSPORTS.has(settings.imageTransport)) throw new Error("Choose a supported image transport format.");
    if (!String(settings.imageField || "").trim() && settings.imageTransport !== "binary") {
      throw new Error("Enter the request image field name.");
    }
    if (settings.imageTransport === "binary" && settings.modelId && settings.modelHeaderName) {
      const modelHeader = String(settings.modelHeaderName).trim();
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(modelHeader) || RESERVED_HEADERS.has(modelHeader.toLowerCase())) {
        throw new Error("Enter a valid non-reserved model header name.");
      }
    }
    if (settings.imageTransport !== "binary" && settings.modelId && settings.modelField && settings.imageField === settings.modelField) {
      throw new Error("The image field and model field must be different.");
    }
    if (!String(settings.isAIPath || "").trim() && !String(settings.labelPath || "").trim()) {
      throw new Error("Configure at least one response mapping: a Boolean AI field or a label field.");
    }

    let extraHeaders;
    try { extraHeaders = JSON.parse(settings.additionalHeaders || "{}"); }
    catch { throw new Error("Additional headers must be valid JSON."); }
    if (!extraHeaders || Array.isArray(extraHeaders) || typeof extraHeaders !== "object") {
      throw new Error("Additional headers must be a JSON object of header names and string values.");
    }
    for (const [name, value] of Object.entries(extraHeaders)) {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || typeof value !== "string" || /[\r\n]/.test(value)) {
        throw new Error("Additional headers must contain valid header names and string values.");
      }
      if (RESERVED_HEADERS.has(name.toLowerCase())) {
        throw new Error(`Do not set the reserved ${name} header in additional headers.`);
      }
      if (settings.authType === "header" && name.toLowerCase() === String(settings.authHeaderName).toLowerCase()) {
        throw new Error("The authentication header must not also be set in additional headers.");
      }
    }

    return {
      ...settings,
      name: String(settings.name || "Custom REST API").trim().slice(0, 60),
      endpoint: endpoint.toString(),
      additionalHeaders: JSON.stringify(extraHeaders)
    };
  }

  return {
    DEFAULT_CUSTOM_CONFIG,
    getPath,
    normalizeConfidence,
    normalizeCustomResponse,
    normalizeBitMindResponse,
    validateCustomConfig,
    verdictFor
  };
});

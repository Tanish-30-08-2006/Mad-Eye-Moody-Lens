(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VideoProviderEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : self, function () {
  "use strict";

  const DEFAULT_CUSTOM_CONFIG = Object.freeze({
    name: "Custom Video REST API",
    endpoint: "",
    authType: "bearer",
    apiKey: "",
    authHeaderName: "x-api-key",
    additionalHeaders: "{}",
    videoTransport: "multipart", // "multipart", "url_json", "base64_json", "binary"
    videoField: "video",
    modelId: "",
    modelField: "model",
    modelHeaderName: "X-Model-ID",
    isAIPath: "isAI",
    labelPath: "label",
    confidencePath: "confidence",
    similarityPath: "similarity",
    explanationPath: "explanation",
    modelPath: "model",
    framesPath: "frames",
    aiLabels: "fake, ai, ai-generated, deepfake, synthetic, manipulated",
    realLabels: "real, authentic, human, not-ai, not ai, genuine, original"
  });

  const BITMIND_DEFAULT_CONFIG = Object.freeze({
    name: "BitMind Video Oracle",
    endpoint: "https://api.bitmind.ai/oracle/v1/34/detect-video",
    fallbackFrameEndpoint: "https://api.bitmind.ai/oracle/v1/34/detect-image"
  });

  const TRANSPORTS = new Set(["multipart", "url_json", "base64_json", "binary"]);
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
    return number > 1 ? Number((number / 100).toFixed(4)) : Number(number.toFixed(4));
  }

  function labelsFrom(value) {
    return String(value || "")
      .split(",")
      .map(label => label.trim().toLowerCase())
      .filter(Boolean);
  }

  function verdictFor(isAI, confidence) {
    if (typeof isAI !== "boolean") return "unknown";
    if (confidence !== null && confidence < 0.58) return "uncertain";
    return isAI ? "likely_ai" : "likely_not_ai";
  }

  function normalizeBitMindResponse(raw) {
    // BitMind returns { isAI: boolean, confidence: number, similarity?: number, model?: string, frames?: array }
    let isAI = null;
    if (typeof raw?.isAI === "boolean") {
      isAI = raw.isAI;
    } else if (typeof raw?.prediction === "boolean") {
      isAI = raw.prediction;
    } else if (typeof raw?.label === "string") {
      const lower = raw.label.toLowerCase();
      if (lower.includes("ai") || lower.includes("fake") || lower.includes("synthetic")) isAI = true;
      else if (lower.includes("real") || lower.includes("human") || lower.includes("authentic")) isAI = false;
    }

    const confidence = normalizeConfidence(raw?.confidence ?? raw?.score ?? raw?.probability);
    const similarity = raw?.similarity ?? null;
    const model = typeof raw?.model === "string" && raw.model.trim() ? raw.model.trim() : "BitMind Video Oracle (Subnet 34)";
    const verdict = verdictFor(isAI, confidence);

    let frameBreakdown = null;
    if (Array.isArray(raw?.frames)) {
      frameBreakdown = raw.frames.map((f, idx) => ({
        index: idx,
        timestamp: f.timestamp ?? idx,
        isAI: typeof f.isAI === "boolean" ? f.isAI : (f.score > 0.5),
        confidence: normalizeConfidence(f.confidence ?? f.score)
      }));
    }

    return {
      provider: "bitmind",
      providerName: "BitMind Video Oracle",
      model,
      isAI,
      confidence,
      similarity,
      verdict,
      frameBreakdown,
      explanation: isAI === true
        ? `BitMind identified synthetic artifacts indicative of deepfake generation with ${(confidence ? (confidence * 100).toFixed(1) : "high")}% confidence.`
        : isAI === false
        ? `BitMind evaluated the video as likely authentic human recording (${(confidence ? (confidence * 100).toFixed(1) : "high")}% confidence).`
        : "Detection confidence was inconclusive.",
      rawResponse: raw
    };
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
    const verdict = verdictFor(isAI, confidence);

    let frameBreakdown = null;
    const rawFrames = getPath(raw, settings.framesPath);
    if (Array.isArray(rawFrames)) {
      frameBreakdown = rawFrames.map((f, idx) => ({
        index: idx,
        timestamp: f.timestamp ?? idx,
        isAI: typeof f.isAI === "boolean" ? f.isAI : (f.score > 0.5),
        confidence: normalizeConfidence(f.confidence ?? f.score)
      }));
    }

    return {
      provider: "custom",
      providerName: settings.name || "Custom Video REST API",
      model: typeof model === "string" && model.trim() ? model.trim() : (settings.modelId || "Custom Video Model"),
      isAI,
      confidence,
      similarity: similarity ?? null,
      verdict,
      frameBreakdown,
      explanation: typeof explanationValue === "string" && explanationValue.trim()
        ? explanationValue.trim()
        : (label ? `Provider verdict label: ${label}` : null),
      rawResponse: raw
    };
  }

  function validateCustomConfig(config) {
    const settings = { ...DEFAULT_CUSTOM_CONFIG, ...(config || {}) };
    if (!settings.endpoint || typeof settings.endpoint !== "string") {
      throw new Error("Enter the custom video API endpoint URL.");
    }

    let endpoint;
    try { endpoint = new URL(settings.endpoint); }
    catch { throw new Error("The custom API endpoint must be a valid absolute URL."); }

    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && localHost)) {
      throw new Error("Use an HTTPS endpoint. HTTP is allowed only for localhost development servers.");
    }
    if (endpoint.username || endpoint.password) throw new Error("Do not embed credentials in the endpoint URL; use authentication fields.");
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
    if (!TRANSPORTS.has(settings.videoTransport)) throw new Error("Choose a supported video transport format.");
    if (!String(settings.videoField || "").trim() && settings.videoTransport !== "binary") {
      throw new Error("Enter the request video field name.");
    }
    if (settings.additionalHeaders) {
      try {
        const parsed = JSON.parse(settings.additionalHeaders);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error();
        }
      } catch (_) {
        throw new Error("Additional headers must be a valid JSON object string.");
      }
    }
    return settings;
  }

  return {
    DEFAULT_CUSTOM_CONFIG,
    BITMIND_DEFAULT_CONFIG,
    normalizeConfidence,
    verdictFor,
    normalizeBitMindResponse,
    normalizeCustomResponse,
    validateCustomConfig,
    getPath
  };
});

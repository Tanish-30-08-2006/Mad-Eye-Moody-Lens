/**
 * External AI Provider Client & Response Normalizer
 *
 * Allows users to optionally analyze images against their own external AI APIs
 * (e.g. BitMind Oracle, HuggingFace inference, custom REST detectors).
 *
 * Security & Architecture:
 * - Requests are dispatched directly from the browser to the external endpoint.
 * - Credentials and API keys NEVER touch the Mad-Eye Moody Lens backend.
 * - If the remote endpoint does not permit browser CORS, a friendly, actionable error is shown.
 */

export type AuthType = "none" | "bearer" | "header";
export type ImageTransport = "multipart" | "base64_json" | "binary" | "url_json";
export type ExternalVerdict = "likely_ai" | "likely_not_ai" | "uncertain" | "inconclusive";

export interface ExternalProviderConfig {
  name: string;
  endpoint: string;
  authType: AuthType;
  apiKey: string;
  authHeaderName: string;
  additionalHeaders: string; // JSON string
  imageTransport: ImageTransport;
  imageField: string;
  modelId: string;
  modelField: string;
  modelHeaderName: string;
  // Response mapping
  isAIPath: string;
  labelPath: string;
  confidencePath: string;
  similarityPath: string;
  explanationPath: string;
  modelPath: string;
  aiLabels: string;
  realLabels: string;
  rememberKey?: boolean;
}

export interface ExternalAnalysisResult {
  providerName: string;
  endpoint: string;
  model: string;
  isAI: boolean | null;
  verdict: ExternalVerdict;
  confidence: number | null; // 0..1
  similarity: string | number | null;
  explanation: string | null;
  processingMs: number;
  analyzedAt: string;
  rawResponse?: Record<string, unknown>;
}

export const DEFAULT_EXTERNAL_CONFIG: Readonly<ExternalProviderConfig> = Object.freeze({
  name: "Custom AI Provider",
  endpoint: "",
  authType: "bearer",
  apiKey: "",
  authHeaderName: "x-api-key",
  additionalHeaders: "{}",
  imageTransport: "multipart",
  imageField: "file",
  modelId: "",
  modelField: "model",
  modelHeaderName: "X-Model-ID",
  isAIPath: "isAI",
  labelPath: "label",
  confidencePath: "confidence",
  similarityPath: "similarity",
  explanationPath: "explanation",
  modelPath: "model",
  aiLabels: "fake, ai, ai-generated, synthetic, deepfake, manipulated",
  realLabels: "real, human, authentic, not-ai, genuine, bonafide",
  rememberKey: false,
});

const AUTH_TYPES: ReadonlySet<string> = new Set(["none", "bearer", "header"]);
const TRANSPORTS: ReadonlySet<string> = new Set(["multipart", "base64_json", "binary", "url_json"]);
const RESERVED_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "content-type",
  "content-length",
  "host",
  "origin",
  "connection",
  "cookie",
]);

/**
 * Safely extracts a nested property using dot-notation.
 * Supports array indexing, e.g. "predictions.0.label".
 */
export function getPath(value: unknown, path: string): unknown {
  if (!path || typeof path !== "string") return undefined;
  return path.split(".").filter(Boolean).reduce<unknown>((current, key) => {
    if (current == null || typeof current !== "object") return undefined;
    const record = current as Record<string, unknown>;
    return record[key];
  }, value);
}

/**
 * Normalizes confidence scores from 0..1 or 0..100 into a clean 0..1 float.
 */
export function normalizeConfidence(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100) return null;
  return num > 1 ? Number((num / 100).toFixed(4)) : Number(num.toFixed(4));
}

/**
 * Splits comma-separated label list into lowercase trimmed tokens.
 */
export function labelsFrom(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Computes the unified verdict based on boolean classification and confidence.
 */
export function verdictForExternal(isAI: boolean | null, confidence: number | null): ExternalVerdict {
  if (isAI === null) return "inconclusive";
  if (confidence !== null && confidence < 0.55) return "uncertain";
  return isAI ? "likely_ai" : "likely_not_ai";
}

/**
 * Validates external provider configuration fields and throws helpful errors.
 */
export function validateExternalConfig(config: Partial<ExternalProviderConfig>): ExternalProviderConfig {
  const settings: ExternalProviderConfig = { ...DEFAULT_EXTERNAL_CONFIG, ...(config || {}) };

  if (!settings.endpoint || typeof settings.endpoint !== "string") {
    throw new Error("Please enter the external API endpoint URL.");
  }

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(settings.endpoint.trim());
  } catch {
    throw new Error("The external API endpoint must be a valid absolute URL (e.g. https://api.provider.com/v1/detect).");
  }

  const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(endpointUrl.hostname.toLowerCase());
  if (endpointUrl.protocol !== "https:" && !(endpointUrl.protocol === "http:" && isLocalHost)) {
    throw new Error("Use an HTTPS endpoint for security. HTTP is only permitted for localhost development.");
  }

  if (endpointUrl.username || endpointUrl.password) {
    throw new Error("Do not embed username/password in the endpoint URL. Use the authentication fields instead.");
  }

  if (endpointUrl.hash) {
    throw new Error("The endpoint URL must not contain a URL hash/fragment.");
  }

  if (!AUTH_TYPES.has(settings.authType)) {
    throw new Error("Select a valid authentication method (Bearer Token, Custom Header, or None).");
  }

  if (settings.authType !== "none" && !String(settings.apiKey || "").trim()) {
    throw new Error("Please enter your API key or token for this provider.");
  }

  if (settings.authType === "header") {
    const header = String(settings.authHeaderName || "").trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header)) {
      throw new Error("Please enter a valid HTTP header name for the API key.");
    }
    if (RESERVED_HEADERS.has(header.toLowerCase())) {
      throw new Error(`The header '${header}' is reserved and cannot be used as an auth header.`);
    }
  }

  if (!TRANSPORTS.has(settings.imageTransport)) {
    throw new Error("Please choose a supported image transport format.");
  }

  if (!String(settings.imageField || "").trim() && settings.imageTransport !== "binary") {
    throw new Error("Please specify the image field name expected by the external API.");
  }

  if (settings.imageTransport !== "binary" && settings.modelId && settings.modelField && settings.imageField === settings.modelField) {
    throw new Error("The image field and model field cannot share the same name.");
  }

  if (!String(settings.isAIPath || "").trim() && !String(settings.labelPath || "").trim()) {
    throw new Error("Please configure at least one response mapping: either a Boolean AI field or a label field.");
  }

  let parsedHeaders: Record<string, string> = {};
  try {
    const rawHeaders = settings.additionalHeaders ? JSON.parse(settings.additionalHeaders) : {};
    if (rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)) {
      parsedHeaders = rawHeaders as Record<string, string>;
    } else {
      throw new Error();
    }
  } catch {
    throw new Error("Additional headers must be a valid JSON object of key-value string pairs (e.g. {\"X-Custom\": \"value\"}).");
  }

  for (const [k, v] of Object.entries(parsedHeaders)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k) || typeof v !== "string" || /[\r\n]/.test(v)) {
      throw new Error(`Invalid header name or value in additional headers: '${k}'.`);
    }
    if (RESERVED_HEADERS.has(k.toLowerCase())) {
      throw new Error(`Header '${k}' in additional headers is reserved and cannot be overridden.`);
    }
  }

  return {
    ...settings,
    name: String(settings.name || "Custom AI Provider").trim().slice(0, 60),
    endpoint: endpointUrl.toString(),
    additionalHeaders: JSON.stringify(parsedHeaders),
  };
}

/**
 * Normalizes a raw external JSON response into our unified ExternalAnalysisResult.
 */
export function normalizeExternalResponse(
  raw: unknown,
  config: ExternalProviderConfig,
  processingMs: number
): ExternalAnalysisResult {
  const isAIVal = getPath(raw, config.isAIPath);
  let isAI: boolean | null = typeof isAIVal === "boolean" ? isAIVal : null;
  let detectedLabel: string | null = null;

  if (isAI === null && config.labelPath) {
    const labelVal = getPath(raw, config.labelPath);
    if (typeof labelVal === "string" || typeof labelVal === "number") {
      detectedLabel = String(labelVal).trim().toLowerCase();
      if (labelsFrom(config.aiLabels).includes(detectedLabel)) isAI = true;
      else if (labelsFrom(config.realLabels).includes(detectedLabel)) isAI = false;
    }
  }

  const confVal = getPath(raw, config.confidencePath);
  const confidence = normalizeConfidence(confVal);
  const similarityVal = getPath(raw, config.similarityPath);
  const explanationVal = getPath(raw, config.explanationPath);
  const modelVal = getPath(raw, config.modelPath);

  const model = typeof modelVal === "string" && modelVal.trim()
    ? modelVal.trim()
    : config.modelId.trim() || "External Model";

  let explanation: string | null = null;
  if (typeof explanationVal === "string" && explanationVal.trim()) {
    explanation = explanationVal.trim();
  } else if (detectedLabel) {
    explanation = `Model classified content with label: '${detectedLabel}'`;
  }

  return {
    providerName: config.name.trim() || "Custom AI Provider",
    endpoint: config.endpoint,
    model,
    isAI,
    verdict: verdictForExternal(isAI, confidence),
    confidence,
    similarity: similarityVal !== undefined && similarityVal !== null ? (similarityVal as string | number) : null,
    explanation,
    processingMs,
    analyzedAt: new Date().toISOString(),
    rawResponse: typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : undefined,
  };
}

/**
 * Helper to convert a File/Blob to a Base64 Data URL.
 */
export async function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image file into Base64 format."));
    reader.readAsDataURL(file);
  });
}

/**
 * Dispatches an image analysis request directly from the browser to the user's configured external API.
 */
export async function callExternalProvider(
  file: File,
  rawConfig: ExternalProviderConfig
): Promise<ExternalAnalysisResult> {
  const config = validateExternalConfig(rawConfig);
  const headers = new Headers();

  // Additional headers
  try {
    const additional = JSON.parse(config.additionalHeaders || "{}");
    for (const [k, v] of Object.entries(additional)) {
      headers.set(k, String(v));
    }
  } catch {
    // Already validated
  }

  // Authentication
  if (config.authType === "bearer" && config.apiKey.trim()) {
    headers.set("Authorization", `Bearer ${config.apiKey.trim()}`);
  } else if (config.authType === "header" && config.apiKey.trim()) {
    headers.set(config.authHeaderName.trim(), config.apiKey.trim());
  }

  const modelId = config.modelId.trim();
  let body: BodyInit;

  if (config.imageTransport === "base64_json") {
    const dataUri = await fileToDataUri(file);
    const payload: Record<string, unknown> = { [config.imageField]: dataUri };
    if (modelId && config.modelField) payload[config.modelField] = modelId;
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(payload);
  } else if (config.imageTransport === "multipart") {
    const form = new FormData();
    form.append(config.imageField, file, file.name);
    if (modelId && config.modelField) form.append(config.modelField, modelId);
    // Note: Do NOT set Content-Type header for FormData; the browser sets the boundary automatically!
    body = form;
  } else if (config.imageTransport === "binary") {
    headers.set("Content-Type", file.type || "application/octet-stream");
    if (modelId && config.modelHeaderName) headers.set(config.modelHeaderName, modelId);
    body = file;
  } else if (config.imageTransport === "url_json") {
    throw new Error(
      "JSON URL transport requires a public image URL. Since you uploaded a local file, please select 'Multipart form-data' or 'Base64 JSON' in provider settings."
    );
  } else {
    throw new Error(`Unsupported image transport: ${config.imageTransport}`);
  }

  const t0 = performance.now();
  let response: Response;

  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body,
      credentials: "omit",
      signal: AbortSignal.timeout(30000), // 30s timeout
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("timeout")) {
      throw new Error(`The external provider '${config.name}' timed out after 30 seconds. Please check the endpoint availability.`);
    }
    // Browser fetch throws TypeError on CORS or network failure
    throw new Error(
      `Could not reach '${config.name}'. This may be caused by a network failure or CORS restriction. Ensure the provider endpoint allows browser requests or has CORS enabled.`
    );
  }

  const durationMs = Math.round(performance.now() - t0);

  if (!response.ok) {
    let errBody = "";
    try {
      const errJson = await response.json();
      errBody = errJson?.error || errJson?.message || JSON.stringify(errJson);
    } catch {
      errBody = await response.text().catch(() => "");
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed (${response.status}) with '${config.name}'. Please check your API key.`);
    }
    if (response.status === 429) {
      throw new Error(`Rate limit exceeded (${response.status}) on '${config.name}'. Please try again shortly.`);
    }
    if (response.status >= 500) {
      throw new Error(`External provider error (${response.status}): ${errBody ? errBody.slice(0, 150) : "Internal Server Error"}`);
    }
    throw new Error(`External request failed with HTTP ${response.status}: ${errBody ? errBody.slice(0, 150) : response.statusText}`);
  }

  let rawData: unknown;
  try {
    rawData = await response.json();
  } catch {
    throw new Error(`The external provider '${config.name}' returned an unparseable response that was not valid JSON.`);
  }

  return normalizeExternalResponse(rawData, config, durationMs);
}

/**
 * Creates a minimal 1x1 test PNG file and performs a connectivity test against the provider.
 */
export async function testExternalProvider(
  config: ExternalProviderConfig
): Promise<{ ok: boolean; message: string; durationMs: number }> {
  // 1x1 transparent PNG bytes
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  const testFile = new File([pngBytes], "test-image.png", { type: "image/png" });
  const t0 = performance.now();
  const result = await callExternalProvider(testFile, config);
  const durationMs = Math.round(performance.now() - t0);

  return {
    ok: true,
    message: `Connected successfully! Provider returned verdict: '${result.verdict}' (latency: ${durationMs}ms).`,
    durationMs,
  };
}

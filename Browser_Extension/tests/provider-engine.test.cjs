const test = require("node:test");
const assert = require("node:assert/strict");
const ProviderEngine = require("../backend/providers/provider-engine.js");

const baseConfig = {
  ...ProviderEngine.DEFAULT_CUSTOM_CONFIG,
  endpoint: "https://detector.example.com/v1/detect",
  authType: "none"
};

test("maps an explicit Boolean AI field and normalizes fractional confidence", () => {
  const result = ProviderEngine.normalizeCustomResponse(
    { result: { is_ai: true, score: 0.92, model_name: "detector-v1" } },
    { ...baseConfig, isAIPath: "result.is_ai", labelPath: "", confidencePath: "result.score", modelPath: "result.model_name" }
  );
  assert.equal(result.isAI, true);
  assert.equal(result.confidence, 0.92);
  assert.equal(result.model, "detector-v1");
  assert.equal(result.verdict, "likely_ai");
});

test("maps percentage confidence and case-insensitive labels", () => {
  const result = ProviderEngine.normalizeCustomResponse(
    { predictions: [{ label: "FAKE", score: 94 }] },
    { ...baseConfig, isAIPath: "", labelPath: "predictions.0.label", confidencePath: "predictions.0.score" }
  );
  assert.equal(result.isAI, true);
  assert.equal(result.confidence, 0.94);
  assert.equal(result.verdict, "likely_ai");
});

test("does not silently classify an unknown label as real", () => {
  const result = ProviderEngine.normalizeCustomResponse(
    { prediction: { label: "maybe-generated", confidence: 0.99 } },
    { ...baseConfig, isAIPath: "", labelPath: "prediction.label", confidencePath: "prediction.confidence" }
  );
  assert.equal(result.isAI, null);
  assert.equal(result.verdict, "unknown");
});

test("marks a recognized low-confidence result uncertain", () => {
  const result = ProviderEngine.normalizeCustomResponse(
    { isAI: false, confidence: 0.51 },
    { ...baseConfig, isAIPath: "isAI", labelPath: "", confidencePath: "confidence" }
  );
  assert.equal(result.isAI, false);
  assert.equal(result.verdict, "uncertain");
});

test("supports no-auth HTTPS custom endpoint", () => {
  assert.equal(ProviderEngine.validateCustomConfig(baseConfig).endpoint, baseConfig.endpoint);
});

test("allows plain HTTP only for localhost development endpoints", () => {
  const config = ProviderEngine.validateCustomConfig({ ...baseConfig, endpoint: "http://127.0.0.1:8000/detect" });
  assert.equal(config.endpoint, "http://127.0.0.1:8000/detect");
  assert.throws(() => ProviderEngine.validateCustomConfig({ ...baseConfig, endpoint: "http://detector.example.com/detect" }), /HTTPS/);
});

test("requires credentials for authenticated endpoints", () => {
  assert.throws(() => ProviderEngine.validateCustomConfig({ ...baseConfig, authType: "bearer", apiKey: "" }), /token or key/);
});

test("requires at least one usable response mapping", () => {
  assert.throws(() => ProviderEngine.validateCustomConfig({ ...baseConfig, isAIPath: "", labelPath: "" }), /response mapping/);
});

test("validates transport and additional header JSON", () => {
  assert.throws(() => ProviderEngine.validateCustomConfig({ ...baseConfig, imageTransport: "xml" }), /transport/);
  assert.throws(() => ProviderEngine.validateCustomConfig({ ...baseConfig, additionalHeaders: "not-json" }), /valid JSON/);
  assert.throws(() => ProviderEngine.validateCustomConfig({ ...baseConfig, additionalHeaders: '{"Authorization":"oops"}' }), /reserved/);
});

test("normalizes BitMind output into the provider-independent result format", () => {
  const result = ProviderEngine.normalizeBitMindResponse({ isAI: false, confidence: 0.88, similarity: 0.12 });
  assert.equal(result.provider, "bitmind");
  assert.equal(result.providerName, "BitMind Oracle");
  assert.equal(result.isAI, false);
  assert.equal(result.confidence, 0.88);
  assert.equal(result.verdict, "likely_not_ai");
});

test("preserves inconclusive status when the provider omits a Boolean verdict and returns no mapped label", () => {
  const result = ProviderEngine.normalizeCustomResponse(
    { result: { score: 0.99 } },
    { ...baseConfig, isAIPath: "result.is_ai", labelPath: "result.label", confidencePath: "result.score" }
  );
  assert.equal(result.isAI, null);
  assert.equal(result.verdict, "unknown");
});

test("rejects colliding image/model fields and invalid raw-byte model headers", () => {
  assert.throws(() => ProviderEngine.validateCustomConfig({
    ...baseConfig, modelId: "detector-v1", modelField: "image", imageField: "image"
  }), /must be different/);
  assert.throws(() => ProviderEngine.validateCustomConfig({
    ...baseConfig, imageTransport: "binary", modelId: "detector-v1", modelHeaderName: "Content-Type"
  }), /non-reserved model header/);
});

test("maps an optional provider explanation field", () => {
  const result = ProviderEngine.normalizeCustomResponse(
    { result: { is_ai: true, reason: "Frequency pattern differs from the real-image set." } },
    { ...baseConfig, isAIPath: "result.is_ai", labelPath: "", explanationPath: "result.reason" }
  );
  assert.equal(result.explanation, "Frequency pattern differs from the real-image set.");
});

import test from "node:test";
import assert from "node:assert/strict";

// Import compiled or service functions
import {
  DEFAULT_EXTERNAL_CONFIG,
  getPath,
  normalizeConfidence,
  labelsFrom,
  verdictForExternal,
  validateExternalConfig,
  normalizeExternalResponse,
} from "../src/services/externalProvider.ts";

test("validateExternalConfig: valid default config", () => {
  const config = validateExternalConfig({
    endpoint: "https://api.example.com/v1/detect",
    authType: "bearer",
    apiKey: "secret-token-123",
  });
  assert.equal(config.endpoint, "https://api.example.com/v1/detect");
  assert.equal(config.authType, "bearer");
  assert.equal(config.apiKey, "secret-token-123");
});

test("validateExternalConfig: rejects missing endpoint", () => {
  assert.throws(
    () => validateExternalConfig({ endpoint: "" }),
    /enter the external API endpoint URL/i
  );
});

test("validateExternalConfig: rejects invalid URL", () => {
  assert.throws(
    () => validateExternalConfig({ endpoint: "not-a-valid-url" }),
    /valid absolute URL/i
  );
});

test("validateExternalConfig: enforces HTTPS for remote hosts", () => {
  assert.throws(
    () => validateExternalConfig({ endpoint: "http://remote-server.com/api" }),
    /Use an HTTPS endpoint/i
  );
});

test("validateExternalConfig: permits HTTP for localhost and 127.0.0.1", () => {
  const local1 = validateExternalConfig({
    endpoint: "http://localhost:8080/detect",
    authType: "none",
  });
  assert.equal(local1.endpoint, "http://localhost:8080/detect");

  const local2 = validateExternalConfig({
    endpoint: "http://127.0.0.1:5000/api",
    authType: "none",
  });
  assert.equal(local2.endpoint, "http://127.0.0.1:5000/api");
});

test("validateExternalConfig: rejects credentials embedded in URL", () => {
  assert.throws(
    () => validateExternalConfig({ endpoint: "https://user:pass@api.example.com/detect" }),
    /Do not embed username\/password/i
  );
});

test("validateExternalConfig: rejects URL fragments", () => {
  assert.throws(
    () => validateExternalConfig({ endpoint: "https://api.example.com/detect#section" }),
    /fragment/i
  );
});

test("validateExternalConfig: requires API key when authType is bearer or header", () => {
  assert.throws(
    () => validateExternalConfig({ endpoint: "https://api.example.com/detect", authType: "bearer", apiKey: "" }),
    /enter your API key/i
  );
  assert.throws(
    () => validateExternalConfig({ endpoint: "https://api.example.com/detect", authType: "header", apiKey: "   " }),
    /enter your API key/i
  );
});

test("validateExternalConfig: allows empty API key when authType is none", () => {
  const config = validateExternalConfig({
    endpoint: "https://api.example.com/detect",
    authType: "none",
    apiKey: "",
  });
  assert.equal(config.authType, "none");
});

test("validateExternalConfig: validates custom header name", () => {
  assert.throws(
    () => validateExternalConfig({
      endpoint: "https://api.example.com/detect",
      authType: "header",
      apiKey: "key",
      authHeaderName: "invalid header with spaces",
    }),
    /valid HTTP header name/i
  );

  assert.throws(
    () => validateExternalConfig({
      endpoint: "https://api.example.com/detect",
      authType: "header",
      apiKey: "key",
      authHeaderName: "Host",
    }),
    /reserved/i
  );
});

test("validateExternalConfig: rejects colliding imageField and modelField", () => {
  assert.throws(
    () => validateExternalConfig({
      endpoint: "https://api.example.com/detect",
      authType: "none",
      imageTransport: "multipart",
      imageField: "payload",
      modelId: "model-v1",
      modelField: "payload",
    }),
    /image field and model field cannot share the same name/i
  );
});

test("validateExternalConfig: validates additionalHeaders JSON", () => {
  assert.throws(
    () => validateExternalConfig({
      endpoint: "https://api.example.com/detect",
      authType: "none",
      additionalHeaders: "not-json",
    }),
    /valid JSON object/i
  );

  assert.throws(
    () => validateExternalConfig({
      endpoint: "https://api.example.com/detect",
      authType: "none",
      additionalHeaders: '{"Content-Length": "1234"}',
    }),
    /reserved/i
  );
});

test("getPath: extracts nested and array properties safely", () => {
  const data = {
    results: {
      items: [
        { score: 0.95, label: "ai_generated" },
        { score: 0.05, label: "real" },
      ],
    },
    meta: { version: "2.1" },
  };

  assert.equal(getPath(data, "results.items.0.score"), 0.95);
  assert.equal(getPath(data, "results.items.0.label"), "ai_generated");
  assert.equal(getPath(data, "meta.version"), "2.1");
  assert.equal(getPath(data, "nonexistent.path"), undefined);
  assert.equal(getPath(null, "any.path"), undefined);
});

test("normalizeConfidence: handles 0..1, 0..100, and invalid inputs", () => {
  assert.equal(normalizeConfidence(0.85), 0.85);
  assert.equal(normalizeConfidence(85), 0.85);
  assert.equal(normalizeConfidence("92.5"), 0.925);
  assert.equal(normalizeConfidence("0.45"), 0.45);
  assert.equal(normalizeConfidence(null), null);
  assert.equal(normalizeConfidence(""), null);
  assert.equal(normalizeConfidence(-5), null);
  assert.equal(normalizeConfidence(150), null);
});

test("verdictForExternal: computes correct verdict based on confidence threshold", () => {
  assert.equal(verdictForExternal(true, 0.9), "likely_ai");
  assert.equal(verdictForExternal(false, 0.9), "likely_not_ai");
  assert.equal(verdictForExternal(true, 0.45), "uncertain");
  assert.equal(verdictForExternal(false, 0.5), "uncertain");
  assert.equal(verdictForExternal(null, 0.9), "inconclusive");
});

test("normalizeExternalResponse: maps boolean isAI directly", () => {
  const config = validateExternalConfig({
    endpoint: "https://api.example.com/detect",
    authType: "none",
    isAIPath: "is_ai",
    confidencePath: "probability",
  });

  const raw = { is_ai: true, probability: 0.88, model: "detector-v1" };
  const res = normalizeExternalResponse(raw, config, 120);

  assert.equal(res.verdict, "likely_ai");
  assert.equal(res.isAI, true);
  assert.equal(res.confidence, 0.88);
  assert.equal(res.model, "detector-v1");
  assert.equal(res.processingMs, 120);
});

test("normalizeExternalResponse: maps label to AI or real", () => {
  const config = validateExternalConfig({
    endpoint: "https://api.example.com/detect",
    authType: "none",
    isAIPath: "",
    labelPath: "prediction.class",
    aiLabels: "synthetic, deepfake, manipulated",
    realLabels: "authentic, human",
    confidencePath: "prediction.confidence",
  });

  const rawAi = { prediction: { class: "DEEPFAKE", confidence: 94 } };
  const resAi = normalizeExternalResponse(rawAi, config, 85);
  assert.equal(resAi.verdict, "likely_ai");
  assert.equal(resAi.confidence, 0.94);

  const rawReal = { prediction: { class: "Human", confidence: 82 } };
  const resReal = normalizeExternalResponse(rawReal, config, 90);
  assert.equal(resReal.verdict, "likely_not_ai");
  assert.equal(resReal.confidence, 0.82);
});

test("normalizeExternalResponse: returns inconclusive for unknown labels", () => {
  const config = validateExternalConfig({
    endpoint: "https://api.example.com/detect",
    authType: "none",
    isAIPath: "unknown_path",
    labelPath: "prediction.class",
    aiLabels: "fake",
    realLabels: "real",
  });

  const raw = { prediction: { class: "unrecognized_category", confidence: 0.99 } };
  const res = normalizeExternalResponse(raw, config, 100);

  assert.equal(res.verdict, "inconclusive");
  assert.equal(res.isAI, null);
});

const assert = require("assert");
const engine = require("../backend/providers/video-provider-engine.js");

console.log("Running video provider engine tests...");

// Test 1: BitMind normalization - AI Deepfake
{
  const raw = {
    isAI: true,
    confidence: 0.942,
    similarity: 0.88,
    model: "BitMind Video Oracle 34",
    frames: [
      { timestamp: 0.5, score: 0.91, isAI: true },
      { timestamp: 1.5, score: 0.96, isAI: true }
    ]
  };
  const res = engine.normalizeBitMindResponse(raw);
  assert.strictEqual(res.isAI, true);
  assert.strictEqual(res.verdict, "likely_ai");
  assert.strictEqual(res.confidence, 0.942);
  assert.strictEqual(res.model, "BitMind Video Oracle 34");
  assert.strictEqual(res.frameBreakdown.length, 2);
  console.log("✓ Test 1: BitMind Deepfake normalization passed");
}

// Test 2: BitMind normalization - Authentic Video
{
  const raw = {
    isAI: false,
    confidence: 98.5, // test 0-100 scale normalization
    model: "BitMind Video Oracle"
  };
  const res = engine.normalizeBitMindResponse(raw);
  assert.strictEqual(res.isAI, false);
  assert.strictEqual(res.verdict, "likely_not_ai");
  assert.strictEqual(res.confidence, 0.985);
  console.log("✓ Test 2: BitMind Authentic normalization passed");
}

// Test 3: Uncertain verdict for low confidence
{
  const raw = {
    isAI: true,
    confidence: 0.52
  };
  const res = engine.normalizeBitMindResponse(raw);
  assert.strictEqual(res.verdict, "uncertain");
  console.log("✓ Test 3: Uncertain verdict logic passed");
}

// Test 4: Custom provider validation
{
  assert.throws(() => {
    engine.validateCustomConfig({ endpoint: "" });
  }, /Enter the custom video API endpoint URL/);

  assert.throws(() => {
    engine.validateCustomConfig({ endpoint: "ftp://invalid-url.com" });
  }, /Use an HTTPS endpoint/);

  const valid = engine.validateCustomConfig({
    endpoint: "https://api.example.com/deepfake-video",
    apiKey: "secret123",
    authType: "bearer",
    videoTransport: "multipart"
  });
  assert.strictEqual(valid.endpoint, "https://api.example.com/deepfake-video");
  console.log("✓ Test 4: Custom config validation passed");
}

// Test 5: Custom response mapping
{
  const raw = {
    prediction: {
      fake_probability: 0.98,
      verdict_label: "deepfake"
    },
    meta: {
      model_version: "DeepfakeDetector-v2"
    }
  };
  const config = {
    confidencePath: "prediction.fake_probability",
    labelPath: "prediction.verdict_label",
    modelPath: "meta.model_version",
    aiLabels: "deepfake, synthetic"
  };
  const res = engine.normalizeCustomResponse(raw, config);
  assert.strictEqual(res.isAI, true);
  assert.strictEqual(res.verdict, "likely_ai");
  assert.strictEqual(res.confidence, 0.98);
  assert.strictEqual(res.model, "DeepfakeDetector-v2");
  console.log("✓ Test 5: Custom nested response mapping passed");
}

console.log("All VideoProviderEngine tests passed successfully!");

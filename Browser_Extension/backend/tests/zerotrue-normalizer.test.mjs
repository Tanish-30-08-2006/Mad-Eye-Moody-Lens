import test from "node:test";
import assert from "node:assert/strict";
import { normalizeZeroTrueImageResponse, normalizeZeroTrueVideoResponse } from "../audio/zerotrue-client.js";

test("ZeroTrue image normalizer reads documented ai_probability response", () => {
  const result = normalizeZeroTrueImageResponse({ status: "completed", result: { ai_probability: 0.998, human_probability: 0.002, result_type: "ai_generated", ml_model: "ImageAIDetector" } });
  assert.equal(result.isAI, true);
  assert.equal(result.confidence, 0.998);
  assert.equal(result.verdict, "likely_ai");
});

test("ZeroTrue image normalizer reads human_created result without probability", () => {
  const result = normalizeZeroTrueImageResponse({ result: { result_type: "human_created" } });
  assert.equal(result.isAI, false);
  assert.equal(result.verdict, "likely_not_ai");
});

test("ZeroTrue image normalizer supports percentage details_summary", () => {
  const result = normalizeZeroTrueImageResponse({ data: { result: { details_summary: { ai_probability_pct: 93.5 }, result_type: "ai_generated" } } });
  assert.equal(result.isAI, true);
  assert.equal(result.confidence, 0.935);
});

test("ZeroTrue video normalizer supports documented human result envelope", () => {
  const result = normalizeZeroTrueVideoResponse({ data: { result: { ai_probability: 0.05, result_type: "human_created", feedback: "Human-like signals" } } });
  assert.equal(result.isAI, false);
  assert.equal(result.verdict, "likely_not_ai");
  assert.match(result.explanation, /Human-like signals/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeZeroTrueAudio } from "../src/services/zerotrueAudio.ts";

test("maps a completed ZeroTrue audio score without inventing timeline windows", () => {
  const result = normalizeZeroTrueAudio({ id: "scan-1", status: "completed", result: { ai_probability: 0.82, ml_model: "voice" } }, 200);
  assert.equal(result.verdict, "likely_fake");
  assert.equal(result.fake_probability, 0.82);
  assert.equal(result.details.provider, "ZeroTrue");
  assert.deepEqual(result.segments, []);
});

test("does not present pending or unrecognized responses as completed detections", () => {
  assert.throws(() => normalizeZeroTrueAudio({ status: "processing" }, 0), /processing/);
  assert.throws(() => normalizeZeroTrueAudio({ result: {} }, 0), /usable AI probability/);
  assert.throws(() => normalizeZeroTrueAudio({ result: { ai_probability: -1 } }, 0), /usable AI probability/);
});

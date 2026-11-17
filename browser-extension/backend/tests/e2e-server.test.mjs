// End-to-end: the extension's "moodylens" provider against a running Mad-Eye Moody Lens API.
// Skipped unless MML_E2E_URL is set, e.g. with the stub stack:
//   (functional-ui-models-backend) MML_DETECTOR_BACKEND=stub ./dev.sh redis | worker | api
//   MML_E2E_URL=http://127.0.0.1:8000 MML_E2E_VIDEO=/path/clip.mp4 node --test tests/

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, test } from "node:test";

import { installChromeMock } from "./chrome-mock.mjs";

const BASE = process.env.MML_E2E_URL;
const skip = BASE ? false : "set MML_E2E_URL to run against a live API";
const { store, send, runtime } = installChromeMock();
let MoodyLens;
let audio;

before(async () => {
  if (!BASE) return;
  await import("../background.js");
  for (const fn of runtime.onInstalled.fns) await fn({ reason: "install" });
  MoodyLens = await import("../providers/moodylens-client.js");
  audio = await import("../audio/audio-manager.js");
  const saved = await send({ type: "SAVE_MOODYLENS_SERVER_CONFIG", url: BASE });
  assert.equal(saved.ok, true, saved.error);
});

test("server check: ready + models", { skip }, async () => {
  const res = await send({ type: "TEST_MOODYLENS_SERVER" });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.ready, true);
  assert.ok(res.models.some(m => m.key === "image"));
});

test("image through the service worker (ANALYZE_IMAGE, provider moodylens)", { skip }, async () => {
  assert.equal((await send({ type: "SET_ACTIVE_PROVIDER", provider: "moodylens" })).ok, true);
  const png = process.env.MML_E2E_IMAGE ? await readFile(process.env.MML_E2E_IMAGE) : null;
  const tiny = png
    ? `data:image/png;base64,${png.toString("base64")}`
    : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP8z8DwnwEJMDGQCEY1DFUNAP7QAh8B4u8wAAAAAElFTkSuQmCC";
  const res = await send({ type: "ANALYZE_IMAGE", image: tiny, source: "manual" });
  assert.equal(res.ok, true, res.error);
  assert.ok(["likely_ai", "likely_not_ai", "uncertain"].includes(res.response.verdict));
  assert.ok(res.response.rawResponse.scores.some(s => s.task === "ai_generated_image"));
});

test("audio deep analysis with engine mode moodylens (PCM -> WAV -> /analyze/audio)", { skip }, async () => {
  store.audioEngineMode = "moodylens";
  const rate = 16000;
  const pcm = new Float32Array(rate * 5).map((_, i) => 0.1 * Math.sin((2 * Math.PI * 220 * i) / rate));
  const report = await audio.triggerDeepAnalysis({
    pcm_b64: Buffer.from(pcm.buffer).toString("base64"), sample_rate: rate, duration_sec: 5,
  });
  assert.equal(report.engine, "moodylens_server");
  assert.ok(report.timeline.length >= 1);
  assert.ok(["SUSPICIOUS_AUDIO_DETECTED", "CLEAN_SPEECH", "UNCERTAIN"].includes(report.overall_verdict));
  assert.equal(store.lastAudioForensicReport.engine, "moodylens_server");
});

test("video job: 202 + polling", { skip: skip || (!process.env.MML_E2E_VIDEO && "set MML_E2E_VIDEO") }, async () => {
  const blob = new Blob([await readFile(process.env.MML_E2E_VIDEO)], { type: "video/mp4" });
  const result = await MoodyLens.analyzeVideoBlob(blob, await MoodyLens.getServerConfig());
  const res = MoodyLens.toVideoResponse(result);
  assert.ok(res.frameBreakdown.length > 0);
  assert.equal(res.provider, "moodylens");
});

test("API errors come back as the server's plain-language message", { skip }, async () => {
  const bogus = new Blob([Buffer.from("definitely not an image")]);
  await assert.rejects(MoodyLens.analyzeBlob("image", bogus, await MoodyLens.getServerConfig()), err => {
    assert.equal(err.status, 415);
    assert.ok(err.message.length > 0 && !err.message.includes("Traceback"));
    return true;
  });
});

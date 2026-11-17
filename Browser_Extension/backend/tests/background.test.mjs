// Behaviour tests for the merged service worker (image + audio + video in one extension).
// Run: node --test tests/   (Node 20+; no npm packages needed)

import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

import { EXT_URL, installChromeMock } from "./chrome-mock.mjs";

const chromeMock = installChromeMock();
const { store, send, runtime } = chromeMock;
const CONTENT_SCRIPT = { url: "https://www.example.com/watch", tab: { id: 7, url: "https://www.example.com/watch", title: "Clip" } };

// ---- fetch router -----------------------------------------------------------------------
let routes = [];
const calls = [];
function route(match, handler) { routes.push({ match, handler }); }
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  calls.push({ url: href, init });
  const hit = routes.find(r => (typeof r.match === "string" ? href.startsWith(r.match) : r.match.test(href)));
  if (!hit) throw new TypeError(`unexpected fetch ${href}`);
  return hit.handler(href, init);
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Two JPEG-ish frames whose data URIs share the first 100+ characters (same "header" bytes).
const header = Buffer.alloc(120, 0xff);
const frame = tail => `data:image/jpeg;base64,${Buffer.concat([header, Buffer.from(tail)]).toString("base64")}`;

before(async () => {
  await import("../background.js");
  for (const fn of runtime.onInstalled.fns) await fn({ reason: "install" });
});

beforeEach(() => {
  routes = [];
  calls.length = 0;
});

test("install defaults keep the image and video engines apart", () => {
  assert.equal(store.activeProvider, "bitmind");
  assert.equal(store.videoActiveProvider, "bitmind");
  assert.deepEqual(store.videoDetectionHistory, []);
  assert.equal(store.moodyLensServerUrl, "http://127.0.0.1:8080");
  assert.equal(store.audioEngineMode, "auto");
});

test("a legacy video custom config migrates to the video engine", async () => {
  const saved = { ...store };
  store.customProviderConfig = { endpoint: "https://v.example/api", videoTransport: "multipart" };
  store.activeProvider = "custom";
  delete store.videoActiveProvider;
  delete store.videoCustomProviderConfig;
  for (const fn of runtime.onInstalled.fns) await fn({ reason: "update" });
  assert.equal(store.customProviderConfig, null);
  assert.equal(store.activeProvider, "bitmind");
  assert.equal(store.videoActiveProvider, "custom");
  assert.equal(store.videoCustomProviderConfig.videoTransport, "multipart");
  Object.keys(store).forEach(k => delete store[k]);
  Object.assign(store, saved);
});

test("unknown messages get no answer (other listeners may own them)", async () => {
  assert.equal(await send({ type: "SOMETHING_ELSE" }), undefined);
  assert.equal(await send({ type: "toString" }), undefined);
});

test("video scan: BitMind frames, real hashing, cache without thumbnails, history", async () => {
  store.apiKey = "bm-key";
  store.apiKeyUpdatedAt = 1;
  let frameCalls = 0;
  route("https://api.bitmind.ai/oracle/v1/34/detect-image", () => {
    frameCalls++;
    return json({ isAI: true, confidence: 0.9 });
  });

  const payload = { frames: [{ dataUri: frame("a1"), timestamp: 1 }, { dataUri: frame("a2"), timestamp: 2 }], title: "Clip A" };
  const first = await send({ type: "SCAN_VIDEO", payload }, CONTENT_SCRIPT);
  assert.equal(first.ok, true, first.error);
  assert.equal(first.data.isAI, true);
  assert.equal(first.data.frameBreakdown.length, 2);
  assert.equal(frameCalls, 2);

  const again = await send({ type: "SCAN_VIDEO", payload }, CONTENT_SCRIPT);
  assert.equal(again.data.fromCache, true);
  assert.equal(frameCalls, 2);

  // Same 100-char prefix, different frames: must NOT reuse the cached verdict.
  const other = { frames: [{ dataUri: frame("b1") }, { dataUri: frame("b2") }] };
  assert.equal(frame("a1").slice(0, 100), frame("b1").slice(0, 100));
  await send({ type: "SCAN_VIDEO", payload: other }, CONTENT_SCRIPT);
  assert.equal(frameCalls, 4);

  for (const entry of Object.values(store.videoDetectionCache)) {
    assert.equal(entry.data.thumbnail, undefined);
    assert.equal(entry.data.rawResponse, undefined);
  }
  const history = await send({ type: "VIDEO_GET_HISTORY" });
  assert.equal(history.ok, true);
  // One entry per source page (the video extension's dedupe): the newer scan replaced the older.
  assert.equal(history.data.length, 1);
  assert.equal(history.data[0].sourceUrl, "https://www.example.com/watch"); // tab URL, not a blob: URL
});

test("video scans are really limited to 3 concurrent provider calls", async () => {
  let active = 0;
  let peak = 0;
  route("https://api.bitmind.ai/oracle/v1/34/detect-image", async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 30));
    active--;
    return json({ isAI: false, confidence: 0.8 });
  });
  const scans = Array.from({ length: 6 }, (_, i) =>
    send({ type: "SCAN_VIDEO", payload: { frameDataUri: frame(`c${i}`) } }, CONTENT_SCRIPT));
  const results = await Promise.all(scans);
  assert.ok(results.every(r => r.ok), JSON.stringify(results.find(r => !r.ok)));
  assert.ok(peak <= 3, `peak concurrency ${peak}`);
});

test("private video URLs are never sent to BitMind", async () => {
  route("https://api.bitmind.ai/oracle/v1/34/detect-image", () => json({ isAI: false, confidence: 0.7 }));
  route("https://api.bitmind.ai/oracle/v1/34/detect-video", () => json({ isAI: true, confidence: 0.99 }));
  const res = await send({
    type: "SCAN_VIDEO", payload: { videoUrl: "http://192.168.1.10/cam.mp4", frameDataUri: frame("p1") },
  }, CONTENT_SCRIPT);
  assert.equal(res.ok, true, res.error);
  assert.ok(!calls.some(c => c.url.includes("detect-video")));
});

test("image and video histories stay separate; old video message names still work", async () => {
  const image = await send({ type: "GET_HISTORY" });
  assert.ok(Array.isArray(image.items)); // image envelope, unchanged
  const ping = await send({ type: "PING" }, CONTENT_SCRIPT);
  assert.equal(ping.ok, true);
  assert.equal(ping.data.status, "ready");
  const cleared = await send({ type: "CLEAR_HISTORY" });
  assert.deepEqual(cleared, { ok: true, data: { success: true } });
  assert.deepEqual(store.videoDetectionHistory, []);
});

test("Moody Lens server provider: image analysis through /api/v1/analyze/image", async () => {
  let form;
  route("http://127.0.0.1:8080/api/v1/analyze/image", async (url, init) => {
    form = init.body;
    assert.equal(init.credentials, "omit");
    return json({
      analysis_id: "a1", media_type: "image", verdict: "likely_fake", fake_probability: 0.9,
      scores: [{ model: "Organika/sdxl-detector", task: "ai_generated_image", fake_probability: 0.9 }],
      segments: [], details: { faces_found: 0 }, processing_ms: 50, disclaimer: "d",
    });
  });
  const set = await send({ type: "SET_ACTIVE_PROVIDER", provider: "moodylens" });
  assert.equal(set.ok, true, set.error);
  const tiny = `data:image/png;base64,${Buffer.from("\x89PNG fake bytes").toString("base64")}`;
  const res = await send({ type: "ANALYZE_IMAGE", image: tiny, source: "manual" });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.response.provider, "moodylens");
  assert.equal(res.response.verdict, "likely_ai");
  assert.equal(res.response.isAI, true);
  assert.equal(res.response.confidence, 0.9);
  assert.equal(form.get("file").name, "upload.image"); // generic upload name
  await send({ type: "SET_ACTIVE_PROVIDER", provider: "bitmind" });
});

test("Moody Lens server provider: whole video via 202 + job polling", async () => {
  store.videoActiveProvider = "moodylens";
  route("https://cdn.example.com/clip.mp4", () => new Response(new Blob([Buffer.alloc(2048)]), { headers: { "content-type": "video/mp4" } }));
  route("http://127.0.0.1:8080/api/v1/analyze/video", () => json({ job_id: "j1", status: "queued", progress: 0 }, 202));
  route("http://127.0.0.1:8080/api/v1/jobs/j1", () => json({
    job_id: "j1", status: "done", progress: 1,
    result: {
      analysis_id: "v1", media_type: "video", verdict: "uncertain", fake_probability: 0.5,
      scores: [{ model: "Xicor9/efficientnet-b0-ffpp-c23", task: "face_manipulation", fake_probability: 0.5 }],
      segments: [{ start: 0, end: 0.5, fake_probability: 0.7 }, { start: 0.5, end: 1, fake_probability: 0.3 }],
      details: { frames_sampled: 2, frames_with_face: 2 }, processing_ms: 900, disclaimer: "d",
    },
  }));
  const res = await send({ type: "SCAN_VIDEO", payload: { videoUrl: "https://cdn.example.com/clip.mp4" } }, CONTENT_SCRIPT);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.data.verdict, "uncertain");
  assert.deepEqual(res.data.frameBreakdown.map(f => f.isAI), [true, false]);
  assert.match(res.data.explanation, /No usable soundtrack/);
  store.videoActiveProvider = "bitmind";
});

test("secrets and the local audio stream are guarded", async () => {
  const fromPage = await send({ type: "GET_AUDIO_CONFIG" }, CONTENT_SCRIPT);
  assert.equal(fromPage.ok, false);
  const fromPopup = await send({ type: "GET_AUDIO_CONFIG" });
  assert.equal(fromPopup.ok, true);

  const remote = await send({ type: "AUDIO_SAVE_SERVER_CONFIG", url: "wss://collector.example.com/ingest" });
  assert.equal(remote.ok, false);
  const local = await send({ type: "AUDIO_SAVE_SERVER_CONFIG", url: "ws://127.0.0.1:9000" });
  assert.equal(local.ok, true);
  assert.equal(store.audioServerUrl, "ws://127.0.0.1:9000");

  const badMode = await send({ type: "SAVE_ZEROTRUE_CONFIG", engineMode: "everything" });
  assert.equal(badMode.ok, false);
  const serverMode = await send({ type: "SAVE_ZEROTRUE_CONFIG", engineMode: "moodylens" });
  assert.equal(serverMode.ok, true);

  const insecure = await send({ type: "SAVE_MOODYLENS_SERVER_CONFIG", url: "http://mml.example.com" });
  assert.equal(insecure.ok, false);
  const cfg = await send({ type: "GET_MOODYLENS_SERVER_CONFIG" });
  assert.equal(cfg.ok, true);
  assert.equal("apiKey" in cfg, false);
  assert.ok(EXT_URL); // sender URLs above are extension pages
});

// Behaviour tests for the merged service worker (image + audio + video in one extension).
// Run from the backend folder: node --test tests/*.test.mjs (Node 20+; no npm packages needed)

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

test("extension panels can clear saved image and video history without changing other storage", async () => {
  for (const page of ["popup.html", "sidepanel.html"]) {
    store.recentDetections = [{ time: 1, verdict: "likely_ai" }];
    store.videoDetectionHistory = [{ id: "video-scan", timestamp: 2 }];
    const expected = { ...structuredClone(store), recentDetections: [], videoDetectionHistory: [] };

    const response = await send({ type: "CLEAR_DETECTION_HISTORY" }, { url: EXT_URL + "frontend/" + page });

    assert.deepEqual(response, { ok: true });
    assert.deepEqual(await send({ type: "GET_HISTORY" }), { items: [] });
    assert.deepEqual((await send({ type: "VIDEO_GET_HISTORY" })).data, []);
    assert.deepEqual(store, expected);
  }
});

test("content scripts cannot clear saved history using the extension ID", async t => {
  const id = new URL(EXT_URL).hostname;
  const originalId = runtime.id;
  runtime.id = id;
  t.after(() => { runtime.id = originalId; });
  store.recentDetections = [{ time: 1 }];
  store.videoDetectionHistory = [{ id: "video-scan", timestamp: 2 }];
  const before = structuredClone(store);

  const response = await send({ type: "CLEAR_DETECTION_HISTORY" }, { ...CONTENT_SCRIPT, id });

  assert.equal(response?.ok, false);
  assert.deepEqual(store, before);
});

test("clearing history waits for an image history write already in progress", async t => {
  store.activeProvider = "bitmind";
  store.apiKey = "history-test-key";
  store.apiKeyUpdatedAt = 1;
  store.videoDetectionHistory = [{ id: "video-scan", timestamp: 2 }];
  route("https://api.bitmind.ai/oracle/v1/34/detect-image", () => json({ isAI: true, confidence: 0.9 }));

  let writeStarted;
  let finishWrite;
  const started = new Promise(resolve => { writeStarted = resolve; });
  const pending = new Promise(resolve => { finishWrite = resolve; });
  const originalSet = chrome.storage.local.set;
  chrome.storage.local.set = async values => {
    if (values.recentDetections?.length) {
      writeStarted();
      await pending;
    }
    return originalSet(values);
  };
  t.after(() => { finishWrite(); chrome.storage.local.set = originalSet; });

  const scan = send({ type: "ANALYZE_IMAGE", image: frame("clear-history"), source: "manual" });
  await Promise.race([started, scan.then(result => assert.fail(result?.error || "Image write did not start"))]);
  const clearing = send({ type: "CLEAR_DETECTION_HISTORY" });
  finishWrite();

  assert.equal((await scan).ok, true);
  assert.deepEqual(await clearing, { ok: true });
  assert.deepEqual(store.recentDetections, []);
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

test("BitMind side-panel image analysis uses the configured key and normalizes its result", async () => {
  store.apiKey = "bm-sidepanel-key";
  store.apiKeyUpdatedAt = Date.now();
  route("https://api.bitmind.ai/oracle/v1/34/detect-image", async (url, init) => {
    assert.equal(init.headers.Authorization, "Bearer bm-sidepanel-key");
    assert.equal(init.headers["x-bitmind-application"], "oracle-api");
    const body = JSON.parse(init.body);
    assert.match(body.image, /^data:image\//);
    return json({ isAI: true, confidence: 0.91, model: "Oracle-v34" });
  });
  const set = await send({ type: "SET_ACTIVE_PROVIDER", provider: "bitmind" });
  assert.equal(set.ok, true, set.error);
  const tiny = `data:image/png;base64,${Buffer.from("fake png bytes").toString("base64")}`;
  const res = await send({ type: "ANALYZE_IMAGE", image: tiny, source: "manual review", provider: "bitmind" });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.response.isAI, true);
  assert.equal(res.response.confidence, 0.91);
  assert.equal(res.response.provider, "bitmind");
});


test("ZeroTrue multi-modal provider: image analysis via /api/v1/analyze/file", async () => {
  store.zeroTrueApiKey = "zt_test_key_123";
  store.zeroTrueUpdatedAt = Date.now();
  let receivedForm = null;
  route("https://api.zerotrue.app/api/v1/analyze/file", async (url, init) => {
    receivedForm = init.body;
    return json({
      result: {
        ai_probability: 0.94,
        ml_model: "MultiModal-v2",
        verdict: "synthetic"
      }
    });
  });

  const set = await send({ type: "SET_ACTIVE_PROVIDER", provider: "zerotrue" });
  assert.equal(set.ok, true, set.error);
  assert.equal(store.activeProvider, "zerotrue");

  const tiny = `data:image/png;base64,${Buffer.from("\x89PNG fake bytes").toString("base64")}`;
  const res = await send({ type: "ANALYZE_IMAGE", image: tiny, source: "automatic webpage scan" });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.response.provider, "zerotrue");
  assert.equal(res.response.isAI, true);
  assert.equal(res.response.confidence, 0.94);
  assert.equal(res.response.verdict, "likely_ai");
  assert.match(res.response.model, /ZeroTrue/);

  // Restore active provider to bitmind
  await send({ type: "SET_ACTIVE_PROVIDER", provider: "bitmind" });
});


test("ZeroTrue automatic webpage scans upload the fetched image bytes to the documented file API", async () => {
  store.zeroTrueApiKey = "zt_auto_scan_key";
  store.zeroTrueUpdatedAt = Date.now();
  const pageImageUrl = "https://images.example.com/yahoo-result.jpg?width=640";
  route("https://images.example.com/yahoo-result.jpg", async () => new Response(
    new Blob([Buffer.from("jpeg image bytes")], { type: "image/jpeg" }),
    { headers: { "content-type": "image/jpeg" } }
  ));
  route("https://api.zerotrue.app/api/v1/analyze/file", async (url, init) => {
    assert.equal(init.method, "POST");
    assert.equal(init.body.get("api_key"), "zt_auto_scan_key");
    assert.equal(init.body.get("is_private_scan"), "false");
    assert.equal(init.body.get("is_deep_scan"), "false");
    assert.equal(init.body.get("file").name, "image.jpg");
    return json({ status: "completed", result: {
      ai_probability: 0.91, human_probability: 0.09, result_type: "ai_generated", ml_model: "ImageModel-v2"
    } });
  });

  const set = await send({ type: "SET_ACTIVE_PROVIDER", provider: "zerotrue" });
  assert.equal(set.ok, true, set.error);
  const res = await send({ type: "ANALYZE_IMAGE", image: pageImageUrl, source: "automatic webpage scan" }, CONTENT_SCRIPT);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.response.provider, "zerotrue");
  assert.equal(res.response.isAI, true);
  assert.equal(res.response.confidence, 0.91);
  assert.equal(calls.some(c => c.url.includes("/api/v1/check")), false);

  await send({ type: "SET_ACTIVE_PROVIDER", provider: "bitmind" });
  store.zeroTrueApiKey = "";
});

test("ZeroTrue side-panel video uploads the whole file instead of sampled frames", async () => {
  store.zeroTrueApiKey = "zt-test-key";
  store.videoActiveProvider = "zerotrue";
  let uploadedFile;
  let uploadedName;
  route("https://api.zerotrue.app/api/v1/analyze/file", async (url, init) => {
    uploadedFile = init.body.get("file");
    uploadedName = uploadedFile.name;
    assert.equal(init.body.get("api_key"), "zt-test-key");
    assert.equal(init.body.get("is_private_scan"), "false");
    return json({ status: "completed", result: { ai_probability: 0.87, result_type: "ai_generated", feedback: "Synthetic signals" } });
  });
  const clip = new Blob([Buffer.from("video bytes")], { type: "video/mp4" });
  const res = await send({ type: "SCAN_VIDEO", payload: {
    title: "uploaded.mp4", videoFile: clip, videoFileIsVideo: true, videoFileName: "uploaded.mp4",
    videoFileType: "video/mp4", frames: [], scanType: "drag_drop", provider: "zerotrue"
  } }, CONTENT_SCRIPT);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.data.isAI, true);
  assert.equal(res.data.provider, "zerotrue");
  assert.equal(uploadedName, "video.mp4");
  assert.ok(uploadedFile.size > 0);
  store.videoActiveProvider = "bitmind";
  store.zeroTrueApiKey = "";
});


test("ZeroTrue public video URLs use the documented multipart URL-analysis endpoint", async () => {
  store.zeroTrueApiKey = "zt_video_url_key";
  store.zeroTrueUpdatedAt = Date.now();
  store.videoActiveProvider = "zerotrue";
  const videoUrl = "https://media.example.com/clips/trailer.mp4";
  route("https://api.zerotrue.app/api/v1/analyze/url", async (url, init) => {
    assert.equal(init.method, "POST");
    assert.equal(init.body.get("url"), videoUrl);
    assert.equal(init.body.get("api_key"), "zt_video_url_key");
    assert.equal(init.body.get("is_private_scan"), "false");
    assert.equal(init.body.get("is_deep_scan"), "false");
    assert.equal(init.headers.Authorization, "Bearer zt_video_url_key");
    return json({ status: "completed", result: {
      ai_probability: 0.89, human_probability: 0.11,
      result_type: "ai_generated", ml_model: "VideoAIDetector", feedback: "Synthetic video signals"
    } });
  });

  const res = await send({ type: "SCAN_VIDEO", payload: { videoUrl, provider: "zerotrue" } }, CONTENT_SCRIPT);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.data.provider, "zerotrue");
  assert.equal(res.data.isAI, true);
  assert.equal(res.data.confidence, 0.89);
  assert.equal(calls.some(c => c.url === videoUrl), false); // ZeroTrue fetches the source URL itself.

  store.videoActiveProvider = "bitmind";
  store.zeroTrueApiKey = "";
});

test("ZeroTrue video URL falls back to file upload when the API cannot fetch the remote file", async () => {
  store.zeroTrueApiKey = "zt_video_fallback_key";
  store.zeroTrueUpdatedAt = Date.now();
  store.videoActiveProvider = "zerotrue";
  const videoUrl = "https://cdn.example.com/fallback-video.mp4";
  route("https://api.zerotrue.app/api/v1/analyze/url", async () => json({ error: { message: "Remote host temporarily unavailable" } }, 502));
  route("https://cdn.example.com/fallback-video.mp4", async () => new Response(
    new Blob([Buffer.alloc(2048)], { type: "video/mp4" }),
    { headers: { "content-type": "video/mp4", "content-length": "2048" } }
  ));
  route("https://api.zerotrue.app/api/v1/analyze/file", async (url, init) => {
    assert.equal(init.body.get("api_key"), "zt_video_fallback_key");
    assert.equal(init.body.get("file").name, "video.mp4");
    return json({ status: "completed", result: { ai_probability: 0.76, result_type: "ai_generated" } });
  });

  const res = await send({ type: "SCAN_VIDEO", payload: { videoUrl, provider: "zerotrue" } }, CONTENT_SCRIPT);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.data.isAI, true);
  assert.equal(calls.some(c => c.url === videoUrl), true);

  store.videoActiveProvider = "bitmind";
  store.zeroTrueApiKey = "";
});

test("ZeroTrue multi-modal provider: video analysis via /api/v1/analyze/file", async () => {
  store.zeroTrueApiKey = "zt_test_key_123";
  store.zeroTrueUpdatedAt = Date.now();
  route("https://api.zerotrue.app/api/v1/analyze/file", async () => {
    return json({
      result: {
        ai_probability: 0.08,
        ml_model: "MultiModal-v2",
        verdict: "human"
      }
    });
  });

  const set = await send({ type: "VIDEO_SET_ACTIVE_PROVIDER", provider: "zerotrue" });
  assert.equal(set.ok, true, set.error);
  assert.equal(store.videoActiveProvider, "zerotrue");

  const res = await send({
    type: "SCAN_VIDEO",
    payload: { frameDataUri: frame("zt_vid_1") }
  }, CONTENT_SCRIPT);

  assert.equal(res.ok, true, res.error);
  assert.equal(res.data.provider, "zerotrue");
  assert.equal(res.data.isAI, false);
  assert.equal(res.data.confidence, 0.92);
  assert.equal(res.data.verdict, "likely_not_ai");

  // Restore video provider to bitmind
  await send({ type: "VIDEO_SET_ACTIVE_PROVIDER", provider: "bitmind" });
});

test("BitMind direct video URL: downloads with browser session/referrer then uploads multipart bytes", async () => {
  store.apiKey = "bm-video-key";
  store.apiKeyUpdatedAt = Date.now();
  const videoUrl = "http://media.w3.org/2010/05/sintel/trailer.mp4";
  route(videoUrl, (_url, init) => {
    assert.equal(init.credentials, "include", "send cookies for a user-authorized media host");
    assert.equal(init.referrer, "https://www.example.com/watch", "pass the active page as the referrer");
    assert.equal(init.referrerPolicy, "strict-origin-when-cross-origin");
    return new Response(new Blob([Buffer.from("mp4 sample bytes")], { type: "video/mp4" }), {
      headers: { "content-type": "video/mp4" }
    });
  });
  route("https://api.bitmind.ai/oracle/v1/34/detect-video", async (_url, init) => {
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer bm-video-key");
    assert.equal(init.headers["x-bitmind-application"], "oracle-api");
    assert.equal(init.headers["Content-Type"], undefined, "fetch must generate the multipart boundary");
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get("rich"), "true");
    const uploaded = init.body.get("video");
    assert.ok(uploaded instanceof Blob);
    assert.equal(uploaded.type, "video/mp4");
    assert.match(uploaded.name, /trailer\.mp4$/);
    return json({ isAI: false, confidence: 0.84, model: "BitMind Video Test" });
  });

  const result = await send({ type: "SCAN_VIDEO", payload: { videoUrl, referrerUrl: "https://www.example.com/watch?auth=do-not-forward#frag", provider: "bitmind", scanType: "manual_url" } }, CONTENT_SCRIPT);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.data.isAI, false);
  assert.equal(result.data.provider, "bitmind");
  assert.equal(calls.filter(call => call.url === videoUrl).length, 1);
  assert.equal(calls.filter(call => call.url.endsWith("/detect-video")).length, 1);
});

test("BitMind URL 403 explains the source restriction and offers the file-upload fallback", async () => {
  store.apiKey = "bm-video-403-key";
  store.apiKeyUpdatedAt = Date.now();
  const videoUrl = "https://media.example.com/protected-video.mp4";
  route(videoUrl, () => new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain" } }));
  route("https://api.bitmind.ai/oracle/v1/34/detect-video", () => json({ detail: "Failed to download media: HTTP 403" }, 422));

  const result = await send({
    type: "SCAN_VIDEO",
    payload: { videoUrl, referrerUrl: "https://www.example.com/watch", provider: "bitmind" }
  }, CONTENT_SCRIPT);
  assert.equal(result.ok, false);
  assert.match(result.error, /video host denied the download \(HTTP 403\)/i);
  assert.match(result.error, /BitMind's server-side URL analysis also failed/i);
  assert.match(result.error, /download the video from the original website/i);
  assert.match(result.error, /drag the saved file into the Video tab/i);
  assert.equal(calls.filter(call => call.url === videoUrl).length, 1);
  assert.equal(calls.filter(call => call.url.endsWith("/detect-video")).length, 1);
});

test("BitMind videos above 10 MB use the documented presigned S3 workflow", async () => {
  store.apiKey = "bm-large-video-key";
  store.apiKeyUpdatedAt = Date.now();
  const videoUrl = "https://media.example.com/large-demo.mp4";
  const largeBlob = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "video/mp4" });
  route(videoUrl, () => new Response(largeBlob, { headers: { "content-type": "video/mp4" } }));
  const presigned = {
    url: "https://s3.example.com/presigned-upload",
    videoUrl: "https://s3.example.com/temp/test-video.mp4",
    fields: { key: "temp/test-video.mp4", "Content-Type": "video/mp4", Policy: "policy", "X-Amz-Signature": "signature" }
  };
  route("https://api.bitmind.ai/oracle/v1/34/get-video-upload-url", async (_url, init) => {
    assert.equal(init.headers.Authorization, "Bearer bm-large-video-key");
    assert.deepEqual(JSON.parse(init.body), { filename: "large-demo.mp4", contentType: "video/mp4" });
    return json(presigned);
  });
  route("https://s3.example.com/presigned-upload", async (_url, init) => {
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get("key"), "temp/test-video.mp4");
    assert.equal(init.body.get("Content-Type"), "video/mp4");
    assert.ok(init.body.get("file") instanceof Blob);
    return new Response(null, { status: 204 });
  });
  route("https://api.bitmind.ai/oracle/v1/34/detect-video", async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.video, presigned.videoUrl);
    assert.equal(body.rich, true);
    return json({ isAI: true, confidence: 0.91, model: "BitMind Video Test" });
  });

  const result = await send({ type: "SCAN_VIDEO", payload: { videoUrl, provider: "bitmind" } }, CONTENT_SCRIPT);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.data.isAI, true);
  assert.ok(calls.some(call => call.url.endsWith("/get-video-upload-url")));
  assert.ok(calls.some(call => call.url === "https://s3.example.com/presigned-upload"));
});

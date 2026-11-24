// Unit and regression tests for Provider Readiness states, BitMind video URL filtering,
// and automatic video scanner settings.
// Run with: node --test Browser_Extension/backend/tests/provider-readiness.test.mjs

import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

import { installChromeMock } from "./chrome-mock.mjs";

const chromeMock = installChromeMock();
const { store, send, runtime } = chromeMock;

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

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let bgModule = null;

before(async () => {
  bgModule = await import("../background.js");
  for (const fn of runtime.onInstalled.fns) await fn({ reason: "install" });
});

beforeEach(t => {
  routes = [];
  calls.length = 0;
  const previous = { ...store };
  t.after(() => {
    for (const key of Object.keys(store)) delete store[key];
    Object.assign(store, previous);
  });
});

test("isBitMindSupportedVideoUrl identifies supported platforms and media files", () => {
  const { isBitMindSupportedVideoUrl } = bgModule;
  assert.equal(typeof isBitMindSupportedVideoUrl, "function");

  // Supported platforms: X/Twitter, TikTok, Facebook
  assert.equal(isBitMindSupportedVideoUrl("https://x.com/user/status/123456789"), true);
  assert.equal(isBitMindSupportedVideoUrl("https://twitter.com/user/status/123456789"), true);
  assert.equal(isBitMindSupportedVideoUrl("https://www.tiktok.com/@creator/video/987654321"), true);
  assert.equal(isBitMindSupportedVideoUrl("https://tiktok.com/@creator/video/987654321"), true);
  assert.equal(isBitMindSupportedVideoUrl("https://www.facebook.com/watch/?v=11223344"), true);
  assert.equal(isBitMindSupportedVideoUrl("https://fb.watch/xyz123"), true);

  // Supported direct video file formats
  assert.equal(isBitMindSupportedVideoUrl("https://cdn.example.org/videos/clip.mp4"), true);
  assert.equal(isBitMindSupportedVideoUrl("https://cdn.example.org/videos/stream.webm"), true);
  assert.equal(isBitMindSupportedVideoUrl("https://cdn.example.org/videos/recording.mov"), true);
  assert.equal(isBitMindSupportedVideoUrl("https://cdn.example.org/videos/movie.mkv"), true);

  // Unsupported platforms and page URLs
  assert.equal(isBitMindSupportedVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), false);
  assert.equal(isBitMindSupportedVideoUrl("https://vimeo.com/12345678"), false);
  assert.equal(isBitMindSupportedVideoUrl("https://news.ycombinator.com/item?id=123"), false);
  assert.equal(isBitMindSupportedVideoUrl("https://arbitrary-blog.org/articles/post-1"), false);
  assert.equal(isBitMindSupportedVideoUrl("not a url"), false);
  assert.equal(isBitMindSupportedVideoUrl(""), false);
});

test("Provider readiness: BitMind transitions through not_configured, unverified, verified, invalid", async () => {
  const { getProviderVerificationState } = bgModule;

  // 1. Not configured (empty key)
  store.apiKey = "";
  store.bitmindVerificationState = "not_configured";
  store.bitmindVerificationError = null;
  let st = getProviderVerificationState(store, "bitmind");
  assert.equal(st.state, "not_configured");

  // 2. Unverified (saved key, not tested yet)
  store.apiKey = "bm_test_key_12345";
  store.bitmindVerificationState = "unverified";
  st = getProviderVerificationState(store, "bitmind");
  assert.equal(st.state, "unverified");

  // 3. Verified (explicit test succeeded)
  store.bitmindVerificationState = "verified";
  store.bitmindVerificationError = null;
  st = getProviderVerificationState(store, "bitmind");
  assert.equal(st.state, "verified");

  // 4. Invalid (validation failed)
  store.bitmindVerificationState = "invalid";
  store.bitmindVerificationError = "Invalid API key or 401 Unauthorized";
  st = getProviderVerificationState(store, "bitmind");
  assert.equal(st.state, "invalid");
  assert.match(st.error, /Invalid API key/);

  // 5. Remove key resets to not_configured
  store.apiKey = "";
  store.bitmindVerificationState = "not_configured";
  store.bitmindVerificationError = null;
  st = getProviderVerificationState(store, "bitmind");
  assert.equal(st.state, "not_configured");
});

test("Provider readiness: ZeroTrue transitions through not_configured, unverified, verified, invalid", async () => {
  const { getProviderVerificationState } = bgModule;

  // 1. Not configured (empty key)
  store.zeroTrueApiKey = "";
  store.zeroTrueVerificationState = "not_configured";
  store.zeroTrueVerificationError = null;
  let st = getProviderVerificationState(store, "zerotrue");
  assert.equal(st.state, "not_configured");

  // 2. Unverified (key saved, not verified)
  store.zeroTrueApiKey = "zt_key_abc_123";
  store.zeroTrueVerificationState = "unverified";
  st = getProviderVerificationState(store, "zerotrue");
  assert.equal(st.state, "unverified");

  // 3. Verified
  store.zeroTrueVerificationState = "verified";
  st = getProviderVerificationState(store, "zerotrue");
  assert.equal(st.state, "verified");

  // 4. Invalid
  store.zeroTrueVerificationState = "invalid";
  store.zeroTrueVerificationError = "ZeroTrue authorization rejected (403)";
  st = getProviderVerificationState(store, "zerotrue");
  assert.equal(st.state, "invalid");
});

test("Scanner settings and public status reflect 4-state provider readiness", async () => {
  store.activeProvider = "zerotrue";
  store.zeroTrueApiKey = "";
  store.zeroTrueVerificationState = "not_configured";
  store.zeroTrueVerificationError = null;

  // GET_PUBLIC_STATUS
  const pub = await send({ type: "GET_PUBLIC_STATUS" });
  assert.equal(pub.imageReadiness.state, "not_configured");
  assert.equal(pub.activeProviderConfigured, false);

  // GET_SCANNER_SETTINGS
  const scanner = await send({ type: "GET_SCANNER_SETTINGS" });
  assert.equal(scanner.imageReadiness.state, "not_configured");
  assert.equal(scanner.providerConfigured, false);

  // Now set a key (unverified)
  store.zeroTrueApiKey = "zt_configured_key";
  store.zeroTrueVerificationState = "unverified";
  const scanner2 = await send({ type: "GET_SCANNER_SETTINGS" });
  assert.equal(scanner2.imageReadiness.state, "unverified");
  assert.equal(scanner2.providerConfigured, true);

  // Now verify key
  store.zeroTrueVerificationState = "verified";
  const scanner3 = await send({ type: "GET_SCANNER_SETTINGS" });
  assert.equal(scanner3.imageReadiness.state, "verified");
  assert.equal(scanner3.providerConfigured, true);
  assert.equal(scanner3.providerVerified, true);
});

test("BitMind video call rejects unsupported arbitrary URLs without frames", async () => {
  store.videoActiveProvider = "bitmind";
  store.apiKey = "bm_valid_key";
  store.bitmindVerificationState = "verified";

  const res = await send({
    type: "SCAN_VIDEO",
    payload: {
      videoUrl: "https://some-unsupported-site.com/video-player/item-123",
      frames: [],
      provider: "bitmind"
    }
  });

  assert.equal(res.ok, false);
  assert.match(res.error, /BitMind video detection currently supports X\/Twitter, TikTok, Facebook/);
});

test("Custom Video REST uses its own settings for readiness and scans", async t => {
  store.activeProvider = "custom";
  store.videoScanEnabled = false;
  const endpoint = "https://video-provider.example.test/detect";
  const origin = "https://video-provider.example.test/*";
  const videoUrl = "https://media.example.test/clip.mp4";
  let hostGranted = true;
  t.mock.method(chrome.permissions, "contains", async ({ origins }) => !origins.includes(origin) || hostGranted);
  route(endpoint, (_url, init) => {
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), { video: videoUrl });
    return json({ isAI: true, confidence: 0.9 });
  });

  const saved = await send({
    type: "VIDEO_SAVE_CUSTOM_PROVIDER_CONFIG",
    config: { endpoint, authType: "none", videoTransport: "url_json" },
  });
  assert.equal(saved.ok, true, saved.error);
  const selected = await send({ type: "VIDEO_SET_ACTIVE_PROVIDER", provider: "custom" });
  assert.equal(selected.ok, true, selected.error);

  const configMessage = { type: "VIDEO_CHECK_PROVIDER_CONFIG" };
  const scanMessage = { type: "SCAN_VIDEO", payload: { videoUrl } };
  const status = await send({ type: "GET_PUBLIC_STATUS" });
  const settings = await send({ type: "GET_SCANNER_SETTINGS" });
  const config = await send(configMessage);
  const enable = await send({ type: "ENABLE_VIDEO_SCANNING" });
  const scan = await send(scanMessage);

  assert.deepEqual({
    image: status.imageReadiness.state,
    video: status.videoReadiness.state,
    scannerConfigured: settings.videoProviderConfigured,
    videoUsable: config.data.customConfigured,
    autoScanEnabled: enable.ok,
    scanSucceeded: scan.ok,
  }, {
    image: "not_configured",
    video: "unverified",
    scannerConfigured: true,
    videoUsable: true,
    autoScanEnabled: true,
    scanSucceeded: true,
  });
  assert.equal(scan.data.verdict, "likely_ai");

  hostGranted = false;
  assert.equal((await send(configMessage)).data.customConfigured, false);
  assert.equal((await send(scanMessage)).ok, false);
  assert.deepEqual(calls.map(call => call.url), [endpoint]);
});

const apiKeyProviders = [
  {
    provider: "bitmind", key: "apiKey", state: "bitmindVerificationState", error: "bitmindVerificationError",
    saveType: "SAVE_API_KEY", testType: "TEST_API_KEY",
    endpoint: "https://api.bitmind.ai/oracle/v1/34/detect-image",
  },
  {
    provider: "zerotrue", key: "zeroTrueApiKey", state: "zeroTrueVerificationState", error: "zeroTrueVerificationError",
    saveType: "SAVE_ZEROTRUE_CONFIG", testType: "TEST_ZEROTRUE_KEY",
    endpoint: "https://api.zerotrue.app/api/v1/analyze/file",
  },
];

for (const { provider, key, state, error, saveType, testType, endpoint } of apiKeyProviders) {
  test(`Video scans respect the saved ${provider} key validation`, async () => {
    Object.assign(store, {
      videoActiveProvider: provider, [key]: "rejected-key", [state]: "invalid", [error]: "Test key rejected",
    });
    const configMessage = { type: "VIDEO_CHECK_PROVIDER_CONFIG" };
    const config = await send(configMessage);
    const scan = await send({ type: "SCAN_VIDEO", payload: { videoUrl: "https://media.example.test/rejected.mp4" } });

    assert.equal(config.data.isConfigured, false);
    assert.equal(scan.ok, false);
    assert.match(scan.error, /key failed validation \(Test key rejected\)/);
    assert.deepEqual(calls, []);

    const saved = await send({ type: saveType, apiKey: "replacement-key" });
    assert.equal(saved.ok, true, saved.error);
    assert.equal((await send(configMessage)).data.isConfigured, true);
  });

  test(`Testing an unsaved ${provider} key preserves the saved key status`, async () => {
    Object.assign(store, { [key]: "saved-key", [state]: "verified", [error]: null });
    route(endpoint, () => json({ error: "Key rejected in test" }, 401));

    const result = await send({ type: testType, apiKey: "unsaved-key" });
    assert.equal(result.ok, false);
    assert.equal(calls[0].init.headers.Authorization, "Bearer unsaved-key");
    assert.equal(store[key], "saved-key");
    assert.equal(store[state], "verified");
    assert.equal(store[error], null);
  });

  test(`Saving a ${provider} key supersedes an in-flight check of the old key`, { timeout: 3000 }, async () => {
    Object.assign(store, { [key]: "saved-key", [state]: "unverified", [error]: null });
    let requestReceived;
    let respond;
    const started = new Promise(resolve => { requestReceived = resolve; });
    const pendingResponse = new Promise(resolve => { respond = resolve; });
    route(endpoint, (_url, init) => {
      if (init.headers.Authorization === "Bearer replacement-key") return json({ isAI: false, confidence: 0.9 });
      requestReceived();
      return pendingResponse;
    });

    const oldTest = send({ type: testType });
    await started;
    const saved = await send({ type: saveType, apiKey: "replacement-key" });
    respond(json({ error: "Old key rejected in test" }, 401));
    assert.equal(saved.ok, true, saved.error);
    assert.equal((await oldTest).ok, false);
    assert.equal(store[key], "replacement-key");
    assert.equal(store[state], "unverified");
    assert.equal(store[error], null);

    const verified = await send({ type: testType });
    assert.equal(verified.ok, true, verified.error);
    assert.equal(store[state], "verified");
  });
}

test("Selecting a video provider updates open scanner tabs", async t => {
  store.videoActiveProvider = "bitmind";
  store.activeProvider = "bitmind";
  store.zeroTrueApiKey = "configured-key";
  store.zeroTrueVerificationState = "verified";
  t.mock.method(chrome.tabs, "query", async () => [
    { id: 7, url: "https://media.example.test/" },
    { id: 8, url: "chrome://settings/" },
  ]);
  const sendToTab = t.mock.method(chrome.tabs, "sendMessage", async () => {});

  const selected = await send({ type: "VIDEO_SET_ACTIVE_PROVIDER", provider: "zerotrue" });
  assert.equal(selected.ok, true, selected.error);
  assert.equal(sendToTab.mock.callCount(), 1);
  const [tabId, message] = sendToTab.mock.calls[0].arguments;
  assert.equal(tabId, 7);
  assert.equal(message.type, "DS_SETTINGS_CHANGED");
  assert.equal(message.settings.videoActiveProvider, "zerotrue");
  assert.equal(message.settings.videoReadiness.state, "verified");
  assert.equal(message.settings.activeProvider, "bitmind");
});

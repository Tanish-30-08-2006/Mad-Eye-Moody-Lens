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

beforeEach(() => {
  routes = [];
  calls.length = 0;
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
  store.bitmindKeyVerified = true;

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

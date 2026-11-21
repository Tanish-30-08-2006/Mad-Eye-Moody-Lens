import test from "node:test";
import assert from "node:assert/strict";
import { callZeroTrueUrlApi } from "../audio/zerotrue-client.js";

const originalFetch = globalThis.fetch;

test("ZeroTrue URL analysis uses multipart form fields on the documented API route", async () => {
  let calledUrl = "";
  let requestInit;
  globalThis.fetch = async (url, init) => {
    calledUrl = String(url);
    requestInit = init;
    return new Response(JSON.stringify({
      id: "url-scan-1",
      status: "completed",
      result: { ai_probability: 0.86, human_probability: 0.14, result_type: "ai_generated" }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await callZeroTrueUrlApi("https://media.example.com/test.mp4", "zt-test-key", 1000);
    assert.equal(calledUrl, "https://api.zerotrue.app/api/v1/analyze/url");
    assert.equal(requestInit.method, "POST");
    assert.equal(requestInit.body.get("url"), "https://media.example.com/test.mp4");
    assert.equal(requestInit.body.get("api_key"), "zt-test-key");
    assert.equal(requestInit.body.get("is_private_scan"), "false");
    assert.equal(requestInit.body.get("is_deep_scan"), "false");
    assert.equal(requestInit.headers.Authorization, "Bearer zt-test-key");
    assert.equal(result.data.result.result_type, "ai_generated");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ZeroTrue URL analysis rejects invalid and private URLs before making a request", async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error("fetch should not run"); };
  try {
    await assert.rejects(() => callZeroTrueUrlApi("file:///tmp/video.mp4", "zt-test-key"), /public HTTP\(S\) media URLs/i);
    await assert.rejects(() => callZeroTrueUrlApi("http://127.0.0.1/video.mp4", "zt-test-key"), /public HTTP\(S\) media URLs/i);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

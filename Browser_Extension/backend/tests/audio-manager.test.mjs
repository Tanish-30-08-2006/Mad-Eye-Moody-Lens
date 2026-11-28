import assert from "node:assert/strict";
import { test } from "node:test";
import { installChromeMock } from "./chrome-mock.mjs";

const { store } = installChromeMock();
let captureResult = { ok: true };
let closed = 0;
chrome.offscreen = {
  hasDocument: async () => false,
  createDocument: async () => {},
  closeDocument: async () => { closed++; },
};
chrome.tabCapture = { getMediaStreamId: (_options, callback) => callback("stream") };
chrome.tabs.get = async id => ({ id, url: `https://site${id}.example/watch` });
chrome.scripting.executeScript = async () => {};
chrome.scripting.insertCSS = async () => {};
chrome.runtime.sendMessage = async message => message.type === "AUDIO_START" ? captureResult : { ok: true };

const audio = await import("../audio/audio-manager.js");

test("capture errors clean up and a later capture can start", async () => {
  captureResult = { ok: false, error: "device failed" };
  await assert.rejects(audio.startMonitoring(1), /device failed/);
  assert.equal(closed, 1);
  assert.equal((await audio.getStatus()).monitoring, false);
  captureResult = { ok: true };
  const started = await audio.startMonitoring(1);
  assert.equal(started.platform, "site1.example");
  await audio.stopMonitoring();
  assert.equal(store.audioCurrentSession, null);
  assert.equal(store.audioSessions.length, 1);
  assert.equal(store.audioSessions[0].platform, "site1.example");
  assert.ok(store.audioSessions[0].endTime);
});

test("missing tab invocation explains how to grant access and cleans up", async () => {
  chrome.tabCapture.getMediaStreamId = (_options, callback) => {
    chrome.runtime.lastError = { message: "Extension has not been invoked for the current page (see activeTab permission)." };
    callback();
    chrome.runtime.lastError = undefined;
  };
  await assert.rejects(audio.startMonitoring(1), /click the Mad Eye Moody Lens toolbar icon/);
  assert.equal((await audio.getStatus()).monitoring, false);
  chrome.tabCapture.getMediaStreamId = (_options, callback) => callback("stream");
});

test("starting playback on another tab closes the previous idle session", async () => {
  await audio.startMonitoring(1);
  await audio.startTabPlaybackCapture(2);
  assert.equal((await audio.getStatus()).tabId, 2);
  audio.handlePlaybackCaptureCancelled();
  assert.equal((await audio.getStatus()).playbackCaptureActive, false);
  await audio.stopMonitoring();
});

test("ZeroTrue file scans retain each result in audio history without audio or API keys", async () => {
  store.audioEngineMode = "zerotrue";
  store.zeroTrueApiKey = "test-secret";
  let probability = 0.9;
  globalThis.fetch = async () => new Response(JSON.stringify({ result: { ai_probability: probability } }), {
    status: 200, headers: { "content-type": "application/json" },
  });
  const pcm_b64 = Buffer.from(new Float32Array([0, 0.5, -0.5]).buffer).toString("base64");
  await audio.triggerDeepAnalysis({ pcm_b64, sample_rate: 16000, duration_sec: 1, fileName: "meeting clip.wav" });
  probability = 0.1;
  await audio.triggerDeepAnalysis({ pcm_b64, sample_rate: 16000, duration_sec: 1, audioSource: "Tab capture" });
  const { AudioStorage } = await import("../audio/audio-storage.js");
  const history = await AudioStorage.getDetections();
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(item => item.isAI), [false, true]);
  assert.equal(history[0].audioSource, "Tab capture");
  assert.equal(history[1].fileName, "meeting clip.wav");
  assert.ok(history.every(item => item.model.includes("ZeroTrue")));
  assert.ok(!JSON.stringify(history).includes("test-secret"));
  assert.ok(!JSON.stringify(history).includes(pcm_b64));
  await AudioStorage.clearDetections();
  assert.deepEqual(await AudioStorage.getDetections(), []);
});

test("tab capture history keeps the captured page URL, while file uploads have no link", async () => {
  store.audioEngineMode = "zerotrue";
  store.zeroTrueApiKey = "test-secret";
  globalThis.fetch = async () => new Response(JSON.stringify({ result: { ai_probability: 0.9 } }), {
    status: 200, headers: { "content-type": "application/json" },
  });
  const pcm_b64 = Buffer.from(new Float32Array([0, 0.5, -0.5]).buffer).toString("base64");
  await audio.startTabPlaybackCapture(3);
  chrome.tabs.get = async id => ({ id, url: "https://another.example/" });
  await audio.handlePlaybackCaptureFinished({ pcm_b64, sample_rate: 16000, duration_sec: 1 });
  await audio.triggerDeepAnalysis({ pcm_b64, sample_rate: 16000, fileName: "audio.wav" });
  const { AudioStorage } = await import("../audio/audio-storage.js");
  const history = await AudioStorage.getDetections();
  assert.equal(history[1].sourceUrl, "https://site3.example/watch");
  assert.equal(history[0].sourceUrl, "");
  await audio.stopMonitoring();
});

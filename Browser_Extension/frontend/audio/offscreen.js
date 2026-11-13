/**
 * offscreen.js
 * ============
 * Runs inside the offscreen document (Chrome MV3 Offscreen API).
 *
 * Responsibilities:
 *   1. Receive tab MediaStream ID from background worker.
 *   2. Capture audio at native 16,000 Hz using Web Audio API (ensuring clean sinc resampling).
 *   3. Maintain a rolling 30-second Float32 audio ring buffer for on-demand forensic inspection.
 *   4. Stream real-time chunks to background worker for passive ambient monitoring.
 *   5. Supply continuous 30s buffer snapshots upon request (AUDIO_GET_BUFFER) for deep forensic timeline analysis.
 */

"use strict";

const TARGET_SAMPLE_RATE = 16000; // Model target sample rate
const MAX_RING_SAMPLES   = 48000 * 30; // Rolling 30-second buffer (supports up to 48kHz native)

let audioContext = null;
let sourceNode   = null;
let workletNode  = null;
let mediaStream  = null;
let isActive     = false;

let ringChunks   = [];
let ringSamples  = 0;

// Playback Capture State (for playing tab audio until finished or 30s cap)
let playbackCaptureActive  = false;
let playbackChunks         = [];
let playbackSamples        = 0;
let playbackSpeechDetected = false;
let playbackSilenceFrames  = 0;
let playbackMaxSamples     = 48000 * 30;
let lastProgressTime       = 0;

function uint8ToBase64(bytes) {
  let binary = "";
  const len = bytes.byteLength;
  const chunkSz = 8192;
  for (let i = 0; i < len; i += chunkSz) {
    const slice = bytes.subarray(i, Math.min(i + chunkSz, len));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen-audio") return false;

  switch (message.type) {
    case "AUDIO_START":
      startCapture(message.streamId, message.tabSampleRate || TARGET_SAMPLE_RATE)
        .then(() => sendResponse({ ok: true, sampleRate: audioContext ? audioContext.sampleRate : TARGET_SAMPLE_RATE }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true; // async

    case "AUDIO_STOP":
      stopCapture();
      sendResponse({ ok: true });
      return false;

    case "AUDIO_GET_BUFFER":
      if (ringChunks.length === 0) {
        sendResponse({ ok: false, error: "Audio buffer empty. Start monitoring first." });
        return false;
      }
      // Merge all chunks in ring buffer
      const merged = new Float32Array(ringSamples);
      let offset = 0;
      for (const chunk of ringChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      const pcm_b64 = uint8ToBase64(new Uint8Array(merged.buffer));
      const sr = audioContext ? audioContext.sampleRate : TARGET_SAMPLE_RATE;
      sendResponse({
        ok:           true,
        pcm_b64,
        sample_rate:  sr,
        duration_sec: Number((ringSamples / sr).toFixed(2)),
        num_samples:  ringSamples,
      });
      return false;

    case "START_PLAYBACK_CAPTURE":
      startPlaybackCapture(message.maxDurationSec || 30);
      sendResponse({ ok: true });
      return false;

    case "STOP_PLAYBACK_CAPTURE":
      finishPlaybackCapture(message.reason || "user_stopped");
      sendResponse({ ok: true });
      return false;

    case "TAB_MEDIA_ENDED":
      if (playbackCaptureActive) {
        console.log("[offscreen] TAB_MEDIA_ENDED received. Concluding playback capture.");
        finishPlaybackCapture("media_ended");
      }
      sendResponse({ ok: true });
      return false;

    default:
      return false;
  }
});

// ---------------------------------------------------------------------------
// Start audio capture (Zoom Screen Share / Tab Audio Loopback)
// ---------------------------------------------------------------------------
async function startCapture(streamId, sampleRate) {
  if (isActive) {
    console.warn("[offscreen] Already capturing; ignoring duplicate start.");
    return;
  }

  // Tab audio capture (Zoom screen share, meeting sound, media playback)
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  // Create AudioContext at native hardware sample rate (e.g. 44100 or 48000 Hz)
  try {
    audioContext = new AudioContext();
  } catch (err) {
    console.warn("[offscreen] Could not query native sample rate, falling back to 16kHz:", err);
    audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  sourceNode = audioContext.createMediaStreamSource(mediaStream);

  await audioContext.audioWorklet.addModule(
    chrome.runtime.getURL("frontend/audio/audio-processor.js")
  );

  workletNode = new AudioWorkletNode(audioContext, "audio-chunk-processor", {
    numberOfInputs:  1,
    numberOfOutputs: 1,
    channelCount:    2,
    channelCountMode: "explicit",
  });

  // Handle PCM chunks from worklet
  workletNode.port.onmessage = (event) => {
    if (event.data.type !== "pcm_chunk") return;
    const pcm = event.data.pcm; // Float32Array

    // 1. Maintain rolling ring buffer
    ringChunks.push(pcm);
    ringSamples += pcm.length;
    while (ringSamples > MAX_RING_SAMPLES && ringChunks.length > 1) {
      const dropped = ringChunks.shift();
      ringSamples -= dropped.length;
    }

    // 2. Playback Capture Handler (Captures played tab audio until finished or 30s cap)
    if (playbackCaptureActive) {
      playbackChunks.push(pcm);
      playbackSamples += pcm.length;

      // Compute RMS energy of this chunk to detect voice/audio activity
      let sumSq = 0;
      for (let i = 0; i < pcm.length; i++) sumSq += pcm[i] * pcm[i];
      const rms = Math.sqrt(sumSq / pcm.length);

      const now = Date.now();
      const sr = audioContext ? audioContext.sampleRate : 48000;
      const durSec = Number((playbackSamples / sr).toFixed(1));

      if (rms >= 0.008) {
        if (!playbackSpeechDetected) {
          // Notify that audio has actively started playing (resets/starts new report)
          chrome.runtime.sendMessage({ type: "PLAYBACK_AUDIO_STARTED" }).catch(() => {});
        }
        playbackSpeechDetected = true;
        playbackSilenceFrames = 0;
      } else if (playbackSpeechDetected) {
        // Audio was actively playing and now went quiet
        playbackSilenceFrames++;
        // 2048 samples at ~48kHz ≈ 42.6ms. 30 frames ≈ 1.3 seconds of sustained silence
        if (playbackSilenceFrames >= 30 && durSec >= 1.5) {
          console.log("[offscreen] Audio playback ended (silence detected). Triggering deepfake analysis.");
          finishPlaybackCapture("audio_finished");
          return;
        }
      }

      // Broadcast progress every 350ms
      if (now - lastProgressTime > 350) {
        lastProgressTime = now;
        chrome.runtime.sendMessage({
          type: "PLAYBACK_CAPTURE_PROGRESS",
          durationSec: durSec,
          maxSec: 30,
          speechDetected: playbackSpeechDetected,
          rms: Number(rms.toFixed(4)),
        }).catch(() => {});
      }

      // Auto-cap at 30 seconds
      if (playbackSamples >= playbackMaxSamples) {
        console.log("[offscreen] 30-second audio capture window reached. Triggering deepfake analysis.");
        finishPlaybackCapture("30s_window_reached");
        return;
      }
    }
  };

  sourceNode.connect(workletNode);
  // Route tab audio to destination so playback in the browser tab remains audible to user
  workletNode.connect(audioContext.destination);

  isActive = true;
  console.log(`[offscreen] Tab audio capture started for screen share / media. Native sample rate: ${audioContext.sampleRate} Hz`);
}

// ---------------------------------------------------------------------------
// Timed Playback Capture Implementation (Finished or 30-sec window)
// ---------------------------------------------------------------------------
function startPlaybackCapture(maxDurationSec = 30) {
  playbackCaptureActive  = true;
  playbackChunks         = [];
  playbackSamples        = 0;
  playbackSpeechDetected = false;
  playbackSilenceFrames  = 0;
  lastProgressTime       = Date.now();
  const sr = audioContext ? audioContext.sampleRate : 48000;
  playbackMaxSamples     = Math.round(maxDurationSec * sr);
  console.log(`[offscreen] Tab playback capture started (max ${maxDurationSec}s @ ${sr}Hz).`);
}

function finishPlaybackCapture(reason = "completed") {
  if (!playbackCaptureActive && playbackChunks.length === 0) return;
  playbackCaptureActive = false;

  if (playbackChunks.length === 0 || playbackSamples < 1600) {
    console.warn("[offscreen] Playback capture has insufficient audio samples.");
    chrome.runtime.sendMessage({
      type: "PLAYBACK_CAPTURE_CANCELLED",
      reason: "No active audio detected playing in tab.",
    }).catch(() => {});
    playbackChunks = [];
    playbackSamples = 0;
    return;
  }

  // Merge all captured chunks into a continuous Float32Array
  const merged = new Float32Array(playbackSamples);
  let offset = 0;
  for (const chunk of playbackChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const sr = audioContext ? audioContext.sampleRate : TARGET_SAMPLE_RATE;
  const durSec = Number((playbackSamples / sr).toFixed(2));
  const pcm_b64 = uint8ToBase64(new Uint8Array(merged.buffer));

  console.log(`[offscreen] Tab playback capture complete (${reason}): ${durSec}s (${playbackSamples} samples). Dispatching for deepfake analysis.`);

  chrome.runtime.sendMessage({
    type: "PLAYBACK_CAPTURE_FINISHED",
    pcm_b64,
    sample_rate: sr,
    duration_sec: durSec,
    num_samples: playbackSamples,
    reason,
  }).catch(() => {});

  playbackChunks = [];
  playbackSamples = 0;
}

// ---------------------------------------------------------------------------
// Stop and release
// ---------------------------------------------------------------------------
function stopCapture() {
  if (playbackCaptureActive) {
    finishPlaybackCapture("capture_stopped");
  }
  isActive = false;

  if (workletNode) { workletNode.port.close(); workletNode.disconnect(); workletNode = null; }
  if (sourceNode)  { sourceNode.disconnect(); sourceNode = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  if (audioContext && audioContext.state !== "closed") {
    audioContext.close();
    audioContext = null;
  }

  ringChunks  = [];
  ringSamples = 0;
  console.log("[offscreen] Audio capture stopped; ring buffer cleared.");
}

/**
 * audio-alert.js
 * ==============
 * Injected into meeting tabs.  Shows a non-disruptive overlay when the
 * local model returns a suspicious result.
 *
 * Rules:
 *   - Only appears when category is POSSIBLE_SYNTHETIC_SPEECH or UNCERTAIN.
 *   - Dismissed alerts are not repeated for COOLDOWN_MS (default 2 min).
 *   - Alert never mutes, removes, or modifies meeting participants.
 *   - Displays actual model output only (no invented confidence).
 */

"use strict";

(function () {
  if (window.__madEyeAudioAlertLoaded) return;
  window.__madEyeAudioAlertLoaded = true;

  const COOLDOWN_MS = 120_000; // 2 minutes between repeated alerts
  let lastAlertTime = 0;
  let currentOverlay = null;

  // Link the CSS
  const link = document.createElement("link");
  link.rel  = "stylesheet";
  link.href = chrome.runtime.getURL("frontend/audio/audio-alert.css");
  document.head.appendChild(link);

  // ---------------------------------------------------------------------------
  // Listen for inference results forwarded by background.js
  // ---------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "AUDIO_INFERENCE_RESULT") {
      // Only display alert overlay if the multi-window risk engine confirmed an alert condition
      if (message.shouldAlert) {
        handleResult(message.result, message.reason);
      }
    }
    if (message.type === "AUDIO_MONITORING_STOPPED") {
      removeOverlay();
    }
  });

  function handleResult(result, alertReason) {
    const { category, p_spoof, p_bonafide, cm_score, latency_ms,
            model_name, model_version, verdict, ema_spoof } = result;

    if (
      category !== "POSSIBLE_SYNTHETIC_SPEECH" &&
      category !== "UNCERTAIN"
    ) return;

    const now = Date.now();
    if (now - lastAlertTime < COOLDOWN_MS) return; // respect cooldown
    lastAlertTime = now;

    showOverlay({
      category,
      p_spoof:    (p_spoof * 100).toFixed(1),
      p_bonafide: (p_bonafide * 100).toFixed(1),
      ema_spoof:  ema_spoof != null ? (ema_spoof * 100).toFixed(1) : (p_spoof * 100).toFixed(1),
      cm_score:   cm_score?.toFixed(4) ?? "N/A",
      latency_ms: latency_ms?.toFixed(0) ?? "?",
      model_name: model_name ?? "SSL Anti-Spoofing",
      verdict:    verdict ?? category,
      reason:          alertReason || "Multi-window temporal threshold exceeded",
      timestamp_range: result.timestamp_range || null,
      timestamp:       new Date().toLocaleTimeString(),
    });
  }

  function showOverlay(data) {
    removeOverlay();

    const isSuspicious = data.category === "POSSIBLE_SYNTHETIC_SPEECH";

    const el = document.createElement("div");
    el.id = "madeye-audio-alert";
    el.className = isSuspicious ? "madeye-alert suspicious" : "madeye-alert uncertain";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-live", "assertive");

    const intervalRow = data.timestamp_range
      ? `<tr><td>Speech interval</td><td><strong>${data.timestamp_range}</strong></td></tr>`
      : "";

    el.innerHTML = `
      <div class="madeye-alert-header">
        <span class="madeye-alert-icon">${isSuspicious ? "⚠️" : "⚡"}</span>
        <strong>${isSuspicious ? "POSSIBLE AUDIO DEEPFAKE DETECTED" : "UNCERTAIN AUDIO SIGNAL"}</strong>
        <button class="madeye-alert-close" aria-label="Dismiss alert">✕</button>
      </div>
      <div class="madeye-alert-body">
        <p><strong>Warning:</strong> ${data.reason}</p>
        <table class="madeye-alert-table">
          <tr><td>Detection category</td><td>${data.category.replace(/_/g, " ")}</td></tr>
          ${intervalRow}
          <tr><td>Smoothed Risk (EMA)</td><td>${data.ema_spoof}%</td></tr>
          <tr><td>Current P(Synthetic)</td><td>${data.p_spoof}%</td></tr>
          <tr><td>Model</td><td>${data.model_name}</td></tr>
          <tr><td>CM Score</td><td>${data.cm_score}</td></tr>
          <tr><td>Inference time</td><td>${data.latency_ms} ms</td></tr>
          <tr><td>Detected at</td><td>${data.timestamp}</td></tr>
        </table>
        <p class="madeye-alert-note">
          <em>Recommendation: Verify caller identity and critical instructions via an out-of-band communication channel.</em>
        </p>
      </div>
      <div class="madeye-alert-footer">
        <button class="madeye-btn-report">VIEW REPORT</button>
        <button class="madeye-btn-dismiss">DISMISS</button>
      </div>`;

    document.body.appendChild(el);
    currentOverlay = el;

    el.querySelector(".madeye-alert-close").onclick  = removeOverlay;
    el.querySelector(".madeye-btn-dismiss").onclick  = removeOverlay;
    el.querySelector(".madeye-btn-report").onclick   = () => {
      chrome.runtime.sendMessage({ type: "OPEN_AUDIO_REPORT" });
      removeOverlay();
    };

    // Auto-dismiss after 90 seconds
    setTimeout(removeOverlay, 90_000);
  }

  function removeOverlay() {
    if (currentOverlay) {
      currentOverlay.remove();
      currentOverlay = null;
    }
  }
})();

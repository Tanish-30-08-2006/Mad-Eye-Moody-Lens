/**
 * audio-storage.js
 * ================
 * Persists audio detection sessions separately from image detection history.
 *
 * Storage keys (chrome.storage.local):
 *   audioSessions     – array of session summary objects (max 50)
 *   audioCurrentSession – the in-progress session summary (may be null)
 */

"use strict";

const MAX_SESSIONS = 50;
const KEY_SESSIONS = "audioSessions";
const KEY_CURRENT  = "audioCurrentSession";

export const AudioStorage = {
  async saveSession(summary) {
    await chrome.storage.local.set({ [KEY_CURRENT]: summary });
  },

  async updateSession(summary) {
    await chrome.storage.local.set({ [KEY_CURRENT]: summary });
  },

  async finaliseSession(summary) {
    const { [KEY_SESSIONS]: existing = [] } = await chrome.storage.local.get(KEY_SESSIONS);
    const updated = [summary, ...existing].slice(0, MAX_SESSIONS);
    await chrome.storage.local.set({
      [KEY_SESSIONS]: updated,
      [KEY_CURRENT]:  null,
    });
  },

  async getSessions() {
    const data = await chrome.storage.local.get([KEY_SESSIONS, KEY_CURRENT]);
    return {
      sessions: data[KEY_SESSIONS] || [],
      current:  data[KEY_CURRENT]  || null,
    };
  },

  async clearSessions() {
    await chrome.storage.local.set({ [KEY_SESSIONS]: [], [KEY_CURRENT]: null });
  },

  exportJSON(sessions) {
    return JSON.stringify(sessions, null, 2);
  },

  exportReadable(sessions) {
    if (!sessions.length) return "No audio detection sessions recorded.";
    return sessions.map((s, i) => {
      const start = new Date(s.startTime).toLocaleString();
      const end   = s.endTime ? new Date(s.endTime).toLocaleString() : "ongoing";
      const lines = [
        `Session ${i + 1}  |  ${s.platform}  |  ${start} → ${end}`,
        `  Windows analyzed  : ${s.windowsAnalyzed}`,
        `  Suspicious windows: ${s.suspiciousWindows}`,
        `  Alerts generated  : ${s.alertsGenerated}`,
        `  Avg latency       : ${s.avgLatencyMs ? s.avgLatencyMs.toFixed(0) + " ms" : "N/A"}`,
        `  Error count       : ${s.errors}`,
        `  Categories        : ${JSON.stringify(s.categories)}`,
      ];
      return lines.join("\n");
    }).join("\n\n");
  },
};

/**
 * audio-session.js
 * ================
 * Tracks per-meeting audio detection session state and live continuous forensic timeline.
 */

"use strict";

let _sessionCounter = 0;

export class AudioSession {
  constructor({ tabId, platform, url }) {
    _sessionCounter++;
    this.id              = `audio-session-${Date.now()}-${_sessionCounter}`;
    this.tabId           = tabId;
    this.platform        = platform;
    this.url             = url;
    this.startTime       = Date.now();
    this.endTime         = null;

    this.windowsAnalyzed   = 0;
    this.suspiciousWindows = 0;
    this.alertsGenerated   = 0;
    this.errors            = 0;

    this.categories        = {};   // category → count
    this.latencies         = [];   // inference latencies in ms
    this.lastResult        = null;
    this.alerts            = [];   // last 20 alert records

    // Continuous Deep Forensic Timeline
    this.forensicTimeline  = [];   // running chronological array of timestamped window results
    this.forensicIncidents = [];   // flagged synthetic speech intervals with exact timestamps
  }

  recordWindow(result) {
    this.windowsAnalyzed++;
    const cat = result.category || "UNKNOWN";
    this.categories[cat] = (this.categories[cat] || 0) + 1;
    if (result.latency_ms) this.latencies.push(result.latency_ms);
    this.lastResult = result;
    if (cat === "POSSIBLE_SYNTHETIC_SPEECH" || cat === "UNCERTAIN") {
      this.suspiciousWindows++;
    }

    // Append to live continuous forensic timeline
    if (result.timestamp_range) {
      this.forensicTimeline.push({
        window_index:    result.window_index ?? this.windowsAnalyzed,
        start_sec:       result.start_sec ?? 0.0,
        end_sec:         result.end_sec ?? 4.0,
        timestamp_range: result.timestamp_range,
        is_speech:       result.category !== "INSUFFICIENT_AUDIO_QUALITY",
        category:        result.category,
        verdict:         result.verdict || cat,
        p_spoof:         result.p_spoof ?? 0.0,
        p_bonafide:      result.p_bonafide ?? 1.0,
        cm_score:        result.cm_score ?? 0.0,
        latency_ms:      result.latency_ms ?? 0.0,
      });

      // Retain last 500 windows in memory (~16 minutes of continuous monitoring)
      if (this.forensicTimeline.length > 500) {
        this.forensicTimeline.shift();
      }
    }
  }

  recordAlert(result) {
    this.alertsGenerated++;
    const inc = {
      timestamp:       Date.now(),
      category:        result.category,
      p_spoof:         result.p_spoof ?? 0.0,
      cm_score:        result.cm_score ?? 0.0,
      timestamp_range: result.timestamp_range || "Current interval",
      reason:          result.alert_reason || result.reason || "Suspicious audio detected",
    };
    this.forensicIncidents.push(inc);
    this.alerts = [inc, ...this.alerts].slice(0, 20);
  }

  recordError(msg) {
    this.errors++;
  }

  end() {
    this.endTime = Date.now();
  }

  get avgLatencyMs() {
    if (!this.latencies.length) return null;
    return this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  toSummary() {
    return {
      id:                   this.id,
      tabId:                this.tabId,
      platform:             this.platform,
      startTime:            this.startTime,
      endTime:              this.endTime,
      windowsAnalyzed:      this.windowsAnalyzed,
      suspiciousWindows:    this.suspiciousWindows,
      alertsGenerated:      this.alertsGenerated,
      errors:               this.errors,
      categories:           { ...this.categories },
      avgLatencyMs:         this.avgLatencyMs,
      lastResult:           this.lastResult,
      alerts:               this.alerts.slice(0, 10),
      forensicTimeline:     this.forensicTimeline.slice(-100), // last 100 windows for live UI display
      forensicIncidents:    this.forensicIncidents,
      totalForensicWindows: this.forensicTimeline.length,
    };
  }
}

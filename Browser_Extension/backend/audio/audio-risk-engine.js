/**
 * audio-risk-engine.js
 * ====================
 * Multi-window temporal decision & risk aggregation engine.
 *
 * Why temporal aggregation is necessary:
 *   - A single 4-second audio window can occasionally spike due to mic distortion,
 *     codec clipping, acoustic room reverb, or sudden background noise.
 *   - Conversely, voice cloning attacks in live meetings often span several phrases
 *     (e.g., 6–15 seconds of ongoing conversational speech).
 *   - Evaluating a sliding window of the last 5 speech windows (~10–12 seconds of
 *     speech with 50% overlap) prevents false positives while reliably catching
 *     sustained synthetic voice cloning.
 *
 * Decision Policy:
 *   1. Track the last WINDOW_SIZE (default: 5) active speech windows.
 *   2. Compute Exponential Moving Average (EMA) of P(spoof) with alpha = 0.35.
 *   3. Triggers an alert if ANY of these conditions are met:
 *      - Rule A (Immediate High-Confidence Threat): 2 consecutive windows with P(spoof) >= 0.85.
 *      - Rule B (Sustained Voting): At least 3 out of the last 5 windows are POSSIBLE_SYNTHETIC_SPEECH.
 *      - Rule C (Persistent Elevated Risk): Smoothed EMA >= 0.72 AND at least 2 windows are POSSIBLE_SYNTHETIC_SPEECH.
 *      - Rule D (Pervasive Ambiguity): At least 4 out of the last 5 windows are UNCERTAIN.
 *   4. Silence / low-energy windows (INSUFFICIENT_AUDIO_QUALITY) maintain history
 *      without resetting or falsely triggering.
 *   5. Consecutive clean genuine speech windows (P(bonafide) >= 0.90) smoothly
 *      decay the risk score and clear the threat history.
 */

"use strict";

const WINDOW_SIZE                = 5;     // Number of speech windows to track (~10-12s of speech)
const EMA_ALPHA                  = 0.35;  // Smoothing factor for running spoof probability
const STRONG_SPOOF_CONFIDENCE    = 0.85;  // P(spoof) threshold for immediate consecutive trigger
const VOTE_SYNTHETIC_THRESHOLD   = 3;     // Minimum synthetic windows out of WINDOW_SIZE
const VOTE_UNCERTAIN_THRESHOLD   = 4;     // Minimum uncertain windows out of WINDOW_SIZE
const EMA_ALERT_THRESHOLD        = 0.72;  // Smoothed EMA threshold when supported by >= 2 synthetic windows

export class AudioRiskEngine {
  constructor() {
    this._history = [];         // stores last WINDOW_SIZE evaluation objects
    this._emaSpoof = null;      // running exponential moving average of P(spoof)
    this._consecutiveClean = 0; // count of back-to-back genuine windows
  }

  /**
   * Evaluate a new window inference result.
   *
   * @param {object} result - Inference result from Python server
   *   Expected keys: category, p_spoof, p_bonafide, cm_score, latency_ms
   * @returns {object} Evaluation outcome:
   *   {
   *     shouldAlert: boolean,
   *     riskLevel: "HIGH" | "MEDIUM" | "LOW",
   *     reason: string,
   *     emaSpoof: number,
   *     syntheticCount: number,
   *     uncertainCount: number,
   *     historyLength: number
   *   }
   */
  evaluate(result) {
    if (!result) {
      return this._buildOutcome(false, "LOW", "No result data");
    }

    const cat = result.category || "UNKNOWN";
    const pSpoof = typeof result.p_spoof === "number" ? Math.max(0, Math.min(1, result.p_spoof)) : 0.0;
    const pBonafide = typeof result.p_bonafide === "number" ? Math.max(0, Math.min(1, result.p_bonafide)) : 1.0;

    // 1. Handle detector offline
    if (cat === "DETECTOR_UNAVAILABLE") {
      return this._buildOutcome(false, "LOW", "Detector unavailable");
    }

    // 2. Handle silence / pause (do not falsely trigger; gently decay EMA)
    if (cat === "INSUFFICIENT_AUDIO_QUALITY") {
      if (this._emaSpoof !== null) {
        // Slow decay towards 0 during extended silence
        this._emaSpoof = 0.90 * this._emaSpoof;
      }
      return this._buildOutcome(false, "LOW", "Speech pause or low audio energy");
    }

    // 3. Update Exponential Moving Average (EMA) of P(spoof)
    if (this._emaSpoof === null) {
      this._emaSpoof = pSpoof;
    } else {
      this._emaSpoof = EMA_ALPHA * pSpoof + (1 - EMA_ALPHA) * this._emaSpoof;
    }

    // 4. Update sliding window history
    this._history.push({
      timestamp: Date.now(),
      category:  cat,
      p_spoof:   pSpoof,
      p_bonafide: pBonafide,
      cm_score:  result.cm_score ?? 0,
    });
    if (this._history.length > WINDOW_SIZE) {
      this._history.shift();
    }

    // 5. Track consecutive clean genuine speech
    if (cat === "LIKELY_NATURAL" && pBonafide >= 0.85) {
      this._consecutiveClean++;
      if (this._consecutiveClean >= 3) {
        // 3 consecutive clean windows confirm natural conversation: clear suspicious history
        this._history = this._history.filter(w => w.category === "LIKELY_NATURAL");
        this._emaSpoof = Math.min(this._emaSpoof, 0.15);
      }
    } else {
      this._consecutiveClean = 0;
    }

    // 6. Aggregate vote counts in current window history
    const syntheticCount = this._history.filter(w => w.category === "POSSIBLE_SYNTHETIC_SPEECH").length;
    const uncertainCount = this._history.filter(w => w.category === "UNCERTAIN").length;

    // 7. Check Rule A: 2 consecutive strong synthetic windows with confirmed negative CM score
    if (this._history.length >= 2) {
      const lastTwo = this._history.slice(-2);
      if (lastTwo.every(w => w.category === "POSSIBLE_SYNTHETIC_SPEECH" && w.p_spoof >= STRONG_SPOOF_CONFIDENCE && w.cm_score < -0.3)) {
        const reason = `Immediate threat: 2 consecutive windows with verified synthetic acoustic profile (CM score: ${lastTwo[1].cm_score.toFixed(2)})`;
        this._onAlertTriggered();
        return this._buildOutcome(true, "HIGH", reason, syntheticCount, uncertainCount);
      }
    }

    // 8. Check Rule B: Sustained synthetic speech voting (e.g. 3 of last 5 windows with negative CM score)
    const confirmedSyntheticCount = this._history.filter(w => w.category === "POSSIBLE_SYNTHETIC_SPEECH" && w.cm_score < 0.0).length;
    if (confirmedSyntheticCount >= VOTE_SYNTHETIC_THRESHOLD) {
      const reason = `Sustained detection: ${confirmedSyntheticCount} of last ${this._history.length} speech windows confirmed as synthetic speech`;
      this._onAlertTriggered();
      return this._buildOutcome(true, "HIGH", reason, syntheticCount, uncertainCount);
    }

    // 9. Check Rule C: Smoothed EMA persistence with at least 2 synthetic windows
    if (this._emaSpoof >= EMA_ALERT_THRESHOLD && syntheticCount >= 2) {
      const reason = `Elevated cumulative spoof risk: smoothed probability ${(this._emaSpoof * 100).toFixed(1)}% across recent windows`;
      this._onAlertTriggered();
      return this._buildOutcome(true, "HIGH", reason, syntheticCount, uncertainCount);
    }

    // 10. Check Rule D: Persistent ambiguity (4 of last 5 windows uncertain or synthetic)
    if ((syntheticCount + uncertainCount) >= VOTE_UNCERTAIN_THRESHOLD && uncertainCount >= 3) {
      const reason = `Persistent anomalous signal: ${syntheticCount + uncertainCount} of last ${this._history.length} windows show acoustic manipulation markers`;
      this._onAlertTriggered();
      return this._buildOutcome(true, "MEDIUM", reason, syntheticCount, uncertainCount);
    }

    // Determine non-alerting risk level for UI feedback
    let riskLevel = "LOW";
    if (this._emaSpoof >= 0.50 || syntheticCount >= 1) {
      riskLevel = "MEDIUM";
    }

    return this._buildOutcome(false, riskLevel, "Signal within normal operating variance", syntheticCount, uncertainCount);
  }

  _buildOutcome(shouldAlert, riskLevel, reason, syntheticCount = 0, uncertainCount = 0) {
    return {
      shouldAlert,
      riskLevel,
      reason,
      emaSpoof:       this._emaSpoof !== null ? Number(this._emaSpoof.toFixed(4)) : 0.0,
      syntheticCount,
      uncertainCount,
      historyLength:  this._history.length,
    };
  }

  _onAlertTriggered() {
    // Retain only the most recent window to prevent immediate alert spam on the very next window
    this._history = this._history.slice(-1);
  }

  reset() {
    this._history = [];
    this._emaSpoof = null;
    this._consecutiveClean = 0;
  }

  get emaSpoof() {
    return this._emaSpoof;
  }

  get history() {
    return [...this._history];
  }
}

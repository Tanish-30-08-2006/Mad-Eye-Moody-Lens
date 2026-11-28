import type { AnalysisResult } from "../api/client";

/** Map only an actual provider score; never invent probabilities for unknown responses. */
export function normalizeZeroTrueAudio(raw: unknown, processingMs: number): AnalysisResult {
  if (!raw || typeof raw !== "object") throw new Error("ZeroTrue returned an invalid response.");
  const outer = raw as Record<string, unknown>;
  const envelope = outer.data && typeof outer.data === "object" ? outer.data as Record<string, unknown> : outer;
  const result = envelope.result && typeof envelope.result === "object" ? envelope.result as Record<string, unknown> : envelope;
  const status = String(envelope.status || result.status || "").toLowerCase();
  if (status && !["completed", "success"].includes(status)) {
    throw new Error(`ZeroTrue scan is ${status}. A completed result was not returned.`);
  }
  const value = result.ai_probability ?? result.combined_probability;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("ZeroTrue did not return a usable AI probability.");
  }
  const probability = value > 1 ? value / 100 : value;
  const model = typeof result.ml_model === "string" ? result.ml_model : "ZeroTrue voice detector";
  return {
    analysis_id: typeof envelope.id === "string" ? envelope.id : crypto.randomUUID(),
    media_type: "audio",
    verdict: probability < 0.35 ? "likely_real" : probability < 0.65 ? "uncertain" : "likely_fake",
    fake_probability: probability,
    scores: [{ model, task: "synthetic_speech", fake_probability: probability }],
    segments: [],
    details: { provider: "ZeroTrue" },
    processing_ms: processingMs,
    disclaimer: "ZeroTrue's score is an estimate, not proof of authenticity. The audio was sent to ZeroTrue for analysis.",
  };
}

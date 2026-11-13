/**
 * audio-processor.js  –  AudioWorklet processor
 *
 * Runs in the AudioWorkletGlobalScope (separate thread from the main page).
 * Collects Float32 PCM samples from the meeting tab's audio stream and
 * sends them in fixed-size chunks to the offscreen document main thread.
 *
 * Chunk size: 4096 samples at 48 kHz ≈ 85 ms.
 * The Python server accumulates these chunks in its AudioBuffer until
 * TARGET_LEN (64600) samples are ready, then runs inference.
 *
 * No audio data leaves this worklet except toward the local inference
 * service on 127.0.0.1.
 */

const CHUNK_SAMPLES = 2048; // 2048 samples at 16kHz ≈ 128 ms

class AudioChunkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._totalSamples = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    // Pass-through audio to output so tab audio playback remains audible to user
    if (output && output.length > 0) {
      for (let ch = 0; ch < input.length && ch < output.length; ch++) {
        output[ch].set(input[ch]);
      }
    }

    // Mix all input channels down to mono
    const channelCount = input.length;
    const frameCount   = input[0].length;
    const mono         = new Float32Array(frameCount);

    for (let ch = 0; ch < channelCount; ch++) {
      for (let i = 0; i < frameCount; i++) {
        mono[i] += input[ch][i];
      }
    }
    if (channelCount > 1) {
      for (let i = 0; i < frameCount; i++) mono[i] /= channelCount;
    }

    // Accumulate
    for (let i = 0; i < mono.length; i++) this._buffer.push(mono[i]);
    this._totalSamples += mono.length;

    // Flush when we have CHUNK_SAMPLES
    while (this._buffer.length >= CHUNK_SAMPLES) {
      const chunk = new Float32Array(this._buffer.splice(0, CHUNK_SAMPLES));
      // Transfer the underlying buffer (zero-copy)
      this.port.postMessage(
        { type: "pcm_chunk", pcm: chunk, numSamples: CHUNK_SAMPLES },
        [chunk.buffer]
      );
    }

    return true; // keep processor alive
  }
}

registerProcessor("audio-chunk-processor", AudioChunkProcessor);

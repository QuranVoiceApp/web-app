(function (factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const root = (typeof globalThis !== 'undefined') ? globalThis
      : (typeof self !== 'undefined') ? self
      : (typeof window !== 'undefined') ? window
      : {};
    root.DSP = Object.assign(root.DSP || {}, factory());
  }
})(function () {
  const HALF_BAND_COEFFS = new Float32Array([
    -0.0007441012, -0.0005142242, 0.0006726046, 0.0009714602, -0.0005095548, -0.0016590302,
    0.0000000000, 0.0024907689, 0.0011377751, -0.0031606154, -0.0030818069, 0.0031600647,
    0.0057704204, -0.0018698461, -0.0087992628, -0.0012898049, 0.0113813008, 0.0066852947,
    -0.0123769940, -0.0143181327, 0.0103636924, 0.0237402671, -0.0036459088, -0.0340669331,
    -0.0100650059, 0.0440943327, 0.0352963400, -0.0525027146, -0.0877946753, 0.0581024101,
    0.3122845237, 0.4404947113, 0.3122845237, 0.0581024101, -0.0877946753, -0.0525027146,
    0.0352963400, 0.0440943327, -0.0100650059, -0.0340669331, -0.0036459088, 0.0237402671,
    0.0103636924, -0.0143181327, -0.0123769940, 0.0066852947, 0.0113813008, -0.0012898049,
    -0.0087992628, -0.0018698461, 0.0057704204, 0.0031600647, -0.0030818069, -0.0031606154,
    0.0011377751, 0.0024907689, 0.0000000000, -0.0016590302, -0.0005095548, 0.0009714602,
    0.0006726046, -0.0005142242, -0.0007441012
  ]);

  class FirFilter {
    constructor(coeffs) {
      this.coeffs = Float32Array.from(coeffs);
      this.delay = new Float32Array(this.coeffs.length - 1);
      this._buffer = new Float32Array(0);
    }

    process(block) {
      const coeffs = this.coeffs;
      const taps = coeffs.length;
      const delay = this.delay;
      const combinedLength = delay.length + block.length;
      if (this._buffer.length !== combinedLength) {
        this._buffer = new Float32Array(combinedLength);
      }
      const buffer = this._buffer;
      buffer.set(delay, 0);
      buffer.set(block, delay.length);
      const out = new Float32Array(block.length);
      for (let i = 0; i < block.length; i++) {
        let acc = 0;
        for (let k = 0; k < taps; k++) {
          acc += coeffs[k] * buffer[i + taps - 1 - k];
        }
        out[i] = acc;
      }
      delay.set(buffer.subarray(block.length, buffer.length));
      return out;
    }

    reset() {
      this.delay.fill(0);
    }
  }

  class DriftTracker {
    constructor() {
      this.reset();
    }

    reset(startMs) {
      this.captureStartedAt = Number.isFinite(startMs) ? startMs : null;
      this.accumulator = 0;
      this.capturedSamples = 0;
      this.driftPpm = 0;
    }

    ingest(chunkLength, nowMs, targetHz) {
      if (!Number.isFinite(chunkLength) || chunkLength <= 0) return { adjust: 0, driftPpm: this.driftPpm };
      if (!Number.isFinite(targetHz) || targetHz <= 0) targetHz = 24000;
      if (!Number.isFinite(nowMs)) nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (this.captureStartedAt == null) this.captureStartedAt = nowMs;
      const elapsedMs = nowMs - this.captureStartedAt;
      const expected = (elapsedMs / 1000) * targetHz;
      const projected = this.capturedSamples + chunkLength;
      const error = projected - expected;
      const acc = this.accumulator + error;
      let adjust = 0;
      if (acc > 1) { adjust = -1; this.accumulator = acc - 1; }
      else if (acc < -1) { adjust = 1; this.accumulator = acc + 1; }
      else { this.accumulator = acc; }
      const finalLength = chunkLength + adjust;
      if (finalLength > 0) {
        this.capturedSamples += finalLength;
      }
      const denom = Math.max(expected, 1);
      this.driftPpm = ((this.capturedSamples - expected) / denom) * 1e6;
      return { adjust, driftPpm: this.driftPpm };
    }

    getState() {
      return {
        captureStartedAt: this.captureStartedAt,
        accumulator: this.accumulator,
        capturedSamples: this.capturedSamples,
        driftPpm: this.driftPpm,
      };
    }
  }

  return { HALF_BAND_COEFFS, FirFilter, DriftTracker };
});

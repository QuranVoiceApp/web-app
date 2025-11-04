(function (factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const root = (typeof globalThis !== 'undefined') ? globalThis
      : (typeof self !== 'undefined') ? self
      : (typeof window !== 'undefined') ? window
      : {};
    root.QVTWatchdog = Object.assign(root.QVTWatchdog || {}, factory());
  }
})(function () {
  class CaptureWatchdog {
    constructor(opts = {}) {
      this.stallMs = Number.isFinite(opts.stallMs) ? opts.stallMs : 600;
      this.recoveryDelayMs = Number.isFinite(opts.recoveryDelayMs) ? opts.recoveryDelayMs : 4000;
      this.retryDelayMs = Number.isFinite(opts.retryDelayMs) ? opts.retryDelayMs : 5000;
      this.reset(0);
    }

    reset(now = 0) {
      this.lastFrameAt = Number.isFinite(now) ? now : 0;
      this.recoveryAt = 0;
      this.stalls = 0;
      this.recovers = 0;
    }

    noteFrame(now) {
      if (Number.isFinite(now)) {
        this.lastFrameAt = now;
      }
    }

    shouldFallback(now) {
      if (!Number.isFinite(now)) return false;
      return (now - this.lastFrameAt) > this.stallMs;
    }

    registerFallback(now) {
      if (Number.isFinite(now)) {
        this.stalls += 1;
        this.recoveryAt = now + this.recoveryDelayMs;
      }
    }

    shouldRecover(now) {
      if (!this.recoveryAt || !Number.isFinite(now)) return false;
      return now >= this.recoveryAt;
    }

    registerRecoverySuccess(now) {
      if (Number.isFinite(now)) {
        this.recovers += 1;
        this.lastFrameAt = now;
        this.recoveryAt = 0;
      }
    }

    registerRecoveryFailure(now) {
      if (Number.isFinite(now)) {
        this.recoveryAt = now + this.retryDelayMs;
      }
    }

    getState() {
      return {
        lastFrameAt: this.lastFrameAt,
        recoveryAt: this.recoveryAt,
        stalls: this.stalls,
        recovers: this.recovers,
      };
    }
  }

  return { CaptureWatchdog };
});

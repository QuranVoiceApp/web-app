const assert = require('node:assert/strict');
const { DriftTracker } = require('../scripts/dsp_fir.js');
const { CaptureWatchdog } = require('../scripts/watchdog.js');

const TARGET_HZ = 24000;
const CHUNK_LEN = 2400; // 100 ms @24k
const BASE_CHUNK_MS = 100;

function simulateSession({ ppm = 30, durationMinutes = 10 }) {
  const tracker = new DriftTracker();
  tracker.reset(0);
  const watchdog = new CaptureWatchdog({ stallMs: 600, recoveryDelayMs: 4000, retryDelayMs: 5000 });
  watchdog.reset(0);

  const iterations = Math.ceil((durationMinutes * 60 * 1000) / BASE_CHUNK_MS);
  const ppmFactor = 1 + (ppm * 1e-6);
  const actualChunkMs = BASE_CHUNK_MS / ppmFactor;

  let now = 0;
  let fallbackCount = 0;
  let recoverCount = 0;

  for (let i = 0; i < iterations; i++) {
    let advanceMs = actualChunkMs;
    if (i === Math.floor(iterations / 2)) {
      advanceMs += 750; // introduce stall mid-run
    }
    now += advanceMs;

    if (i === Math.floor(iterations / 2) && watchdog.shouldFallback(now)) {
      watchdog.registerFallback(now);
      fallbackCount += 1;
      tracker.reset(now);
      continue;
    }

    if (watchdog.shouldRecover(now)) {
      watchdog.registerRecoverySuccess(now);
      recoverCount += 1;
      tracker.reset(now);
      continue;
    }

    watchdog.noteFrame(now);
    const { adjust, driftPpm } = tracker.ingest(CHUNK_LEN, now, TARGET_HZ);
    if (adjust !== 0) {
      assert.ok(Math.abs(adjust) <= 1, `slew adjust too large: ${adjust}`);
    }
    assert.ok(Math.abs(driftPpm) < 80, `drift ppm exceeded bounds: ${driftPpm}`);
  }

  const state = watchdog.getState();
  return { fallbackCount, recoverCount, watchdogState: state, drift: tracker.getState() };
}

(function testLongRun() {
  const { fallbackCount, recoverCount, watchdogState, drift } = simulateSession({ ppm: 30, durationMinutes: 10 });
  assert.ok(fallbackCount <= 1, `expected ≤1 fallback; saw ${fallbackCount}`);
  assert.ok(recoverCount <= 1, `expected ≤1 recovery; saw ${recoverCount}`);
  assert.ok(watchdogState.stalls <= 1, `watchdog stalls ${watchdogState.stalls}`);
  assert.ok(watchdogState.recovers <= 1, `watchdog recovers ${watchdogState.recovers}`);
  assert.ok(Math.abs(drift.driftPpm) < 60, `final drift too large ${drift.driftPpm}`);
})();

console.log('Phase 2 long-run simulation passed.');

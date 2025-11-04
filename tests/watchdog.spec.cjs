const assert = require('node:assert/strict');
const { CaptureWatchdog } = require('../scripts/watchdog.js');

(function testFallbackAndRecoveryCycle() {
  const wd = new CaptureWatchdog({ stallMs: 100, recoveryDelayMs: 200, retryDelayMs: 500 });
  wd.reset(0);
  assert.strictEqual(wd.shouldFallback(50), false, 'no fallback before stall window');
  assert.strictEqual(wd.shouldFallback(150), true, 'fallback expected after stall window');
  wd.registerFallback(150);
  let state = wd.getState();
  assert.strictEqual(state.stalls, 1, 'stall counter increments');
  assert.strictEqual(state.recoveryAt, 350, 'recovery scheduled');
  assert.strictEqual(wd.shouldRecover(340), false, 'recover not yet due');
  assert.strictEqual(wd.shouldRecover(360), true, 'recover due after delay');
  wd.registerRecoverySuccess(360);
  state = wd.getState();
  assert.strictEqual(state.recovers, 1, 'recovery counter increments');
  assert.strictEqual(state.recoveryAt, 0, 'recovery cleared after success');
  assert.strictEqual(state.lastFrameAt, 360, 'lastFrame updated on success');
})();

(function testRecoveryRetry() {
  const wd = new CaptureWatchdog({ stallMs: 80, recoveryDelayMs: 150, retryDelayMs: 400 });
  wd.reset(0);
  wd.registerFallback(100);
  const first = wd.getState();
  assert.strictEqual(first.recoveryAt, 250, 'initial recovery scheduled correctly');
  assert.strictEqual(wd.shouldRecover(240), false, 'not yet time to recover');
  assert.strictEqual(wd.shouldRecover(260), true, 'recovery due after delay');
  wd.registerRecoveryFailure(260);
  const state = wd.getState();
  assert.strictEqual(state.recoveryAt, 660, 'retry scheduled after failure');
  assert.strictEqual(state.recovers, 0, 'no successful recovery yet');
})();

console.log('Watchdog tests passed.');

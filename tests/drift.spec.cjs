const assert = require('node:assert/strict');
const { DriftTracker } = require('../scripts/dsp_fir.js');

function runSimulation(ppm, seconds = 180) {
  const tracker = new DriftTracker();
  tracker.reset(0);
  const targetHz = 24000;
  const chunkLen = 2400; // 100 ms
  const actualHz = targetHz * (1 + ppm * 1e-6);
  const chunkMs = (chunkLen / actualHz) * 1000;
  const totalChunks = Math.ceil((seconds * 1000) / chunkMs);
  let now = 0;
  let adjustEvents = 0;
  for (let i = 0; i < totalChunks; i++) {
    now += chunkMs;
    const { adjust, driftPpm } = tracker.ingest(chunkLen, now, targetHz);
    if (adjust !== 0) {
      assert.ok(Math.abs(adjust) <= 1, `unexpected adjust magnitude ${adjust}`);
      adjustEvents += 1;
    }
    assert.ok(Number.isFinite(driftPpm), 'drift ppm should be finite');
  }
  const final = tracker.getState();
  return { adjustEvents, final };
}

(function testZeroDrift() {
  const { adjustEvents, final } = runSimulation(0, 120);
  assert.equal(adjustEvents, 0, 'no adjustments expected when drift == 0');
  assert.ok(Math.abs(final.driftPpm) < 5, `unexpected drift ppm ${final.driftPpm}`);
})();

(function testPositiveDrift() {
  const { adjustEvents, final } = runSimulation(30, 180);
  assert.ok(adjustEvents > 0, 'expected drift compensation activity for +30ppm');
  assert.ok(Math.abs(final.driftPpm) < 50, `final drift ppm out of range ${final.driftPpm}`);
})();

(function testNegativeDrift() {
  const { adjustEvents, final } = runSimulation(-25, 180);
  assert.ok(adjustEvents > 0, 'expected drift compensation activity for -25ppm');
  assert.ok(Math.abs(final.driftPpm) < 50, `final drift ppm out of range ${final.driftPpm}`);
})();

console.log('Drift compensation tests passed.');

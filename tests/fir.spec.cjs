const assert = require('node:assert/strict');
const { FirFilter, HALF_BAND_COEFFS } = require('../scripts/dsp_fir.js');

function generateTone(freq, sr, lengthSec, amp = 1) {
  const samples = Math.floor(sr * lengthSec);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i / sr);
  return out;
}

function downsampleDecimate2(arr) {
  const out = new Float32Array(Math.floor(arr.length / 2));
  for (let i = 0, j = 0; j < out.length; j++, i += 2) out[j] = arr[i];
  return out;
}

function rms(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
  return Math.sqrt(sum / arr.length);
}

(function testHalfBand() {
  const filter = new FirFilter(HALF_BAND_COEFFS);
  const tone1k = generateTone(1000, 48000, 0.2, 0.5);
  const passOut = downsampleDecimate2(filter.process(tone1k));
  const passRatio = rms(passOut) / rms(tone1k);
  assert.ok(passRatio > 0.95 && passRatio < 1.05, `passband ratio out of range: ${passRatio}`);

  filter.reset();
  const tone15k = generateTone(15000, 48000, 0.2, 0.5);
  const stopOut = downsampleDecimate2(filter.process(tone15k));
  const stopRatio = rms(stopOut) / rms(tone15k);
  assert.ok(stopRatio < 0.05, `stopband ratio too high: ${stopRatio}`);

  filter.reset();
  const aliasOut = downsampleDecimate2(tone15k);
  const aliasRatio = rms(aliasOut) / rms(tone15k);
  assert.ok(aliasRatio > 0.8, 'expected unfiltered alias to be large');
})();

console.log('FIR decimator tests passed.');

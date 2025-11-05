import { test, expect } from '@playwright/test';
// @ts-ignore
import { attachLogTaps } from '../helpers/log-tap';

test('AEC proxy sanity (local only)', async ({ page }) => {
  test.skip(!!process.env.CI, 'Skip AEC sanity in CI');
  const taps = await attachLogTaps(page);
  const base = process.env.BASE_URL || 'https://app.asimo.io/index.html';
  await page.goto(`${base}?ff=seq_json&auto=0&diag=1&v=aec1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /connect/i }).click();
  await page.waitForTimeout(500);

  // With AEC on (rawMic off)
  const raw = page.locator('#rawMic');
  if (await raw.isChecked()) await raw.click();
  await page.locator('#btnLoopback').click();
  await page.waitForTimeout(1500);
  const joined1 = taps.app.join('\n');
  const m1 = joined1.match(/loopback analysis.*rms=(\d+\.\d+)/i);

  // With AEC off (rawMic on)
  await raw.click();
  await page.locator('#btnLoopback').click();
  await page.waitForTimeout(1500);
  const joined2 = taps.app.join('\n');
  const m2 = joined2.match(/loopback analysis.*rms=(\d+\.\d+)/i);

  expect(m1 && m2).toBeTruthy();
  const rmsOn = parseFloat(m1![1]);
  const rmsOff = parseFloat(m2![1]);
  // Expect some change; not a strict dB check, just sanity
  expect(Math.abs(rmsOff - rmsOn)).toBeGreaterThan(0.01);
});


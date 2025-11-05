import { test, expect } from '@playwright/test';
// @ts-ignore
import { attachLogTaps } from '../helpers/log-tap';
// @ts-ignore
import { findBadLogs } from '../helpers/expect-no-bad-logs';

const sha = process.env.SHORTSHA || process.env.PHASE1_SHA || process.env.GITHUB_SHA || 'dev';
const shortSha = sha.slice(0, 7);
const BASE_URL = process.env.BASE_URL || 'https://app.asimo.io/';
const TARGET_URL = process.env.PHASE1_URL || `${BASE_URL}?ff=seq_json,sim_input&diag=1&auto=1&v=${shortSha}`;

test('Phase 1 transport + sim playback sanity', async ({ page }) => {
  const taps = await attachLogTaps(page);

  const target = test.info().config.use?.baseURL || TARGET_URL;
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  // Connect explicitly to avoid SW autoStart edge cases
  await page.getByRole('button', { name: /connect/i }).click();

  await page.waitForFunction(() => {
    const testHooks = (window as any).__qvtTest;
    if (testHooks?.ready?.()) return true;
    return !!(window as any).__qvtSession?.negotiation;
  }, undefined, { timeout: 20_000 });

  await page.waitForSelector('[data-testid="commit-win"]', { timeout: 5_000 }).catch(() => {});

  const negotiation = await page.evaluate(() => (window as any).__qvtSession?.negotiation || null);
  const minCommit = negotiation?.minCommitMs ?? 100;
  const maxCommit = negotiation?.maxCommitMs ?? 150;
  if (negotiation) {
    expect(negotiation.minCommitMs).toBeGreaterThan(0);
    expect(negotiation.maxCommitMs).toBeGreaterThanOrEqual(negotiation.minCommitMs);
  }

  await page.waitForFunction((data: { minCommit: number; maxCommit: number }) => {
    const { minCommit, maxCommit } = data;
    const metrics = (window as any).__qvtMetrics;
    if (!metrics) return false;
    if (metrics.sentAppends < 4) return false;
    if (typeof metrics.commitWindowMs !== 'number') return false;
    return metrics.commitWindowMs >= minCommit && metrics.commitWindowMs <= maxCommit;
  }, { minCommit, maxCommit }, { timeout: 20_000 });

  const metrics = await page.evaluate(() => (window as any).__qvtMetrics);
  expect(metrics).toBeTruthy();
  expect(typeof metrics.rttMsEwma).toBe('number');
  expect(metrics.commitWindowMs).toBeGreaterThanOrEqual(minCommit);
  expect(metrics.commitWindowMs).toBeLessThanOrEqual(maxCommit);
  expect(metrics.sentAppends).toBeGreaterThanOrEqual(4);
  // Should be receiving audio in sim path
  expect(metrics.recvAudioChunks).toBeGreaterThan(0);

  // Audio element should be playing (currentTime advancing)
  const audioBefore = await page.evaluate(() => (document.getElementById('qvtOut') as HTMLAudioElement)?.currentTime ?? 0);
  await page.waitForTimeout(800);
  const audioAfter = await page.evaluate(() => (document.getElementById('qvtOut') as HTMLAudioElement)?.currentTime ?? 0);
  expect(audioAfter).toBeGreaterThan(audioBefore);

  // Fail on bad logs
  const failures = findBadLogs(taps.console, taps.app);
  expect(failures).toEqual([]);
});

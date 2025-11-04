import { test, expect } from '@playwright/test';

const sha = process.env.SHORTSHA || process.env.PHASE1_SHA || process.env.GITHUB_SHA || 'dev';
const shortSha = sha.slice(0, 7);
const BASE_URL = process.env.BASE_URL || 'https://app.asimo.io/';
const TARGET_URL = process.env.PHASE1_URL || `${BASE_URL}?ff=seq_json,sim_input&diag=1&auto=1&v=${shortSha}`;

test('Phase 1 transport sanity', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('frame-ancestors')) return;
      consoleErrors.push(text);
    }
  });

  const target = test.info().config.use?.baseURL || TARGET_URL;
  await page.goto(target, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => {
    const testHooks = (window as any).__qvtTest;
    if (testHooks?.ready?.()) return true;
    return !!(window as any).__qvtSession?.negotiation;
  }, undefined, { timeout: 20_000 });

  await page.waitForSelector('[data-testid="commit-win"]', { timeout: 5_000 }).catch(() => {});

  const negotiation = await page.evaluate(() => (window as any).__qvtSession?.negotiation);
  expect(negotiation).toBeTruthy();
  expect(negotiation.minCommitMs).toBeGreaterThan(0);
  expect(negotiation.maxCommitMs).toBeGreaterThanOrEqual(negotiation.minCommitMs);

  await page.waitForFunction((data: { minCommit: number; maxCommit: number }) => {
    const { minCommit, maxCommit } = data;
    const metrics = (window as any).__qvtMetrics;
    if (!metrics) return false;
    if (metrics.sentAppends < 4) return false;
    if (typeof metrics.commitWindowMs !== 'number') return false;
    return metrics.commitWindowMs >= minCommit && metrics.commitWindowMs <= maxCommit;
  }, { minCommit: negotiation.minCommitMs, maxCommit: negotiation.maxCommitMs }, { timeout: 20_000 });

  const metrics = await page.evaluate(() => (window as any).__qvtMetrics);
  expect(metrics).toBeTruthy();
  expect(typeof metrics.rttMsEwma).toBe('number');
  expect(metrics.commitWindowMs).toBeGreaterThanOrEqual(negotiation.minCommitMs);
  expect(metrics.commitWindowMs).toBeLessThanOrEqual(negotiation.maxCommitMs);
  expect(metrics.sentAppends).toBeGreaterThanOrEqual(4);
  expect(metrics.recvAudioChunks).toBeGreaterThanOrEqual(0);

  expect(consoleErrors).toEqual([]);
});

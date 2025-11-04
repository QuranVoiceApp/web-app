import { test, expect } from '@playwright/test';

const sha = process.env.SHORTSHA || process.env.PHASE2_SHA || process.env.GITHUB_SHA || 'dev';
const shortSha = sha.slice(0, 7);
const BASE_URL = process.env.BASE_URL || 'https://app.asimo.io/';
const defaultUrl = `${BASE_URL}?ff=seq_json,fir_halfband,drift_comp,watchdog,sim_input&diag=1&auto=1&v=${shortSha}`;
const TARGET_URL = process.env.PHASE2_URL || defaultUrl;

const jitterBounds = { min: 50, max: 90 };

const expectNoConsoleIssues = (messages: string[]) => {
  const failures = messages.filter((msg) => /error/i.test(msg) || /response\.create\.ignored/i.test(msg));
  expect(failures).toEqual([]);
};

test('Phase 2 simulated transport smoke', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' || /response\.create\.ignored/i.test(text)) {
      consoleMessages.push(text);
    }
  });

  const target = process.env.PHASE2_URL || TARGET_URL;
  await page.goto(target, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => {
    const hooks = (window as any).__qvtTest;
    if (hooks?.ready?.()) return true;
    return !!(window as any).__qvtSession?.negotiation;
  }, undefined, { timeout: 25_000 });

  await page.waitForSelector('[data-testid="commit-win"]', { timeout: 5_000 }).catch(() => {});

  const negotiation = await page.evaluate(() => (window as any).__qvtSession?.negotiation || null);
  const minCommit = negotiation?.minCommitMs ?? 100;
  const maxCommit = negotiation?.maxCommitMs ?? 150;
  if (negotiation) {
    expect(negotiation.minCommitMs).toBeGreaterThan(0);
    expect(negotiation.maxCommitMs).toBeGreaterThanOrEqual(negotiation.minCommitMs);
  }

  await page.waitForFunction((data: { minCommit: number; maxCommit: number; bounds: { min: number; max: number } }) => {
    const { minCommit, maxCommit, bounds } = data;
    const metrics = (window as any).__qvtMetrics;
    if (!metrics) return false;
    if (metrics.sentAppends < 6) return false;
    if (typeof metrics.commitWindowMs !== 'number') return false;
    if (metrics.commitWindowMs < minCommit || metrics.commitWindowMs > maxCommit) return false;
    const jitter = metrics.jitterDepthMs ?? metrics.jitterMs;
    if (typeof jitter === 'number' && (jitter < bounds.min || jitter > bounds.max)) return false;
    return true;
  }, { minCommit, maxCommit, bounds: jitterBounds }, { timeout: 30_000 });

  const metrics = await page.evaluate(() => (window as any).__qvtMetrics);
  expect(metrics).toBeTruthy();
  expect(metrics.commitWindowMs).toBeGreaterThanOrEqual(minCommit);
  expect(metrics.commitWindowMs).toBeLessThanOrEqual(maxCommit);
  expect(metrics.sentAppends).toBeGreaterThanOrEqual(6);

  expectNoConsoleIssues(consoleMessages);
});

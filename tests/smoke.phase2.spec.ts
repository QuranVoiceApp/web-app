import { test, expect } from '@playwright/test';

const sha = process.env.PHASE2_SHA || process.env.GITHUB_SHA || 'dev';
const shortSha = sha.slice(0, 8);
const defaultUrl = `https://app.asimo.io/?ff=seq_json,fir_halfband,drift_comp,watchdog,sim_input&diag=1&v=${shortSha}`;
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

  const search = await page.evaluate(() => window.location.search);
  console.log('phase2 target', search);
  await page.waitForFunction(() => Array.isArray((window as any).__qvtFlagTokens));
  const flags = await page.evaluate(() => (window as any).__qvtFlagTokens || []);
  expect(flags).toContain('sim_input');

  await page.getByRole('button', { name: /connect/i }).click();
  await expect(page.locator('#conn-pill')).toHaveText(/connected/i, { timeout: 15_000 });

  await page.getByRole('button', { name: /start mic/i }).click();

  await page.waitForFunction(() => {
    const negotiation = (window as any).__qvtSession?.negotiation;
    return negotiation && negotiation.minCommitMs && negotiation.maxCommitMs;
  }, null, { timeout: 25_000 });

  const negotiation = await page.evaluate(() => (window as any).__qvtSession?.negotiation);
  expect(negotiation.minCommitMs).toBeGreaterThan(0);
  expect(negotiation.maxCommitMs).toBeGreaterThanOrEqual(negotiation.minCommitMs);

  await page.waitForFunction((minCommit: number, maxCommit: number, bounds: { min: number; max: number }) => {
    const metrics = (window as any).__qvtMetrics;
    if (!metrics) return false;
    if (metrics.sentAppends < 6) return false;
    if (typeof metrics.commitWinMs !== 'number') return false;
    if (metrics.commitWinMs < minCommit || metrics.commitWinMs > maxCommit) return false;
    if (typeof metrics.jitterMs === 'number' && (metrics.jitterMs < bounds.min || metrics.jitterMs > bounds.max)) return false;
    return true;
  }, negotiation.minCommitMs, negotiation.maxCommitMs, jitterBounds, { timeout: 25_000 });

  const metrics = await page.evaluate(() => (window as any).__qvtMetrics);
  expect(metrics.commitWinMs).toBeGreaterThanOrEqual(negotiation.minCommitMs);
  expect(metrics.commitWinMs).toBeLessThanOrEqual(negotiation.maxCommitMs);
  expect(metrics.sentAppends).toBeGreaterThanOrEqual(6);

  expectNoConsoleIssues(consoleMessages);
});

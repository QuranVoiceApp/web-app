import { test, expect } from '@playwright/test';

const sha = process.env.PHASE1_SHA || process.env.GITHUB_SHA || 'dev';
const shortSha = sha.slice(0, 8);
const TARGET_URL = process.env.PHASE1_URL || `https://app.asimo.io/?ff=seq_json,sim_input&diag=1&v=${shortSha}`;

test('Phase 1 transport sanity', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const target = test.info().config.use?.baseURL || TARGET_URL;
  await page.goto(target, { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: /connect/i }).click();
  await expect(page.locator('#conn-pill')).toHaveText(/connected/i, { timeout: 15_000 });

  await page.getByRole('button', { name: /start mic/i }).click();

  await page.waitForFunction(() => {
    const session = (window as any).__qvtSession;
    return session && session.negotiation;
  }, null, { timeout: 15_000 });

  const negotiation = await page.evaluate(() => (window as any).__qvtSession?.negotiation);
  expect(negotiation).toBeTruthy();
  expect(negotiation.minCommitMs).toBeGreaterThan(0);
  expect(negotiation.maxCommitMs).toBeGreaterThanOrEqual(negotiation.minCommitMs);

  await page.waitForFunction((minCommit: number, maxCommit: number) => {
    const diag = (window as any).__qvtDiag;
    const metrics = (window as any).__qvtMetrics;
    if (!diag || !metrics) return false;
    if (metrics.sentAppends < 4) return false;
    if (diag.ingressChunks < 1) return false;
    if (typeof diag.commitWinMs !== 'number') return false;
    return diag.commitWinMs >= minCommit && diag.commitWinMs <= maxCommit;
  }, negotiation.minCommitMs, negotiation.maxCommitMs, { timeout: 20_000 });

  const diag = await page.evaluate(() => (window as any).__qvtDiag);
  expect(diag).toBeTruthy();
  expect(typeof diag.rttMs).toBe('number');
  expect(diag.commitWinMs).toBeGreaterThanOrEqual(negotiation.minCommitMs);
  expect(diag.commitWinMs).toBeLessThanOrEqual(negotiation.maxCommitMs);

  const metrics = await page.evaluate(() => (window as any).__qvtMetrics);
  expect(metrics.sentAppends).toBeGreaterThanOrEqual(4);
  expect(metrics.recvAudioChunks).toBeGreaterThanOrEqual(0);

  expect(consoleErrors).toEqual([]);
});

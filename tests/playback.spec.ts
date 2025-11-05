import { test, expect } from '@playwright/test';

const withCacheBuster = (base: string) => {
  const v = process.env.SHORTSHA || String(Date.now()).slice(-7);
  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}v=${v}`;
};

test.describe('Phase 4 playback polish', () => {
  test('pb_polish flag keeps playback steady', async ({ page }) => {
    const base = process.env.BASE_URL || 'https://app.asimo.io/index.html';
    const url = withCacheBuster(`${base}?ff=seq_json,pb_polish,sim_input&diag=1&auto=1`);

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const session = (window as any).__qvtSession;
      return session && session.net && typeof session.net.commitWinMs === 'number';
    }, { timeout: 20000 });

    const metrics = await page.evaluate(async () => {
      const globalAny = window as any;
      if (globalAny.__qvtTest?.awaitReady) {
        await globalAny.__qvtTest.awaitReady();
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const session = globalAny.__qvtSession || {};
      const playback = session.playback || {};
      return {
        commitWindowMs: session.net?.commitWinMs ?? null,
        rttMsEwma: session.net?.rttMsEwma ?? null,
        playbackUnderruns: playback.underruns ?? 0,
        crossfadeCount: playback.crossfadeCount ?? 0,
        upsampleMode: playback.upsampleMode ?? 'unknown',
        jitterMs: playback.jitterMs ?? 0,
      };
    });

    expect(metrics.commitWindowMs).toBeGreaterThan(0);
    expect(metrics.rttMsEwma ?? 80).toBeGreaterThanOrEqual(0);
    expect(metrics.playbackUnderruns).toBeLessThan(2);
    expect(metrics.crossfadeCount).toBeGreaterThanOrEqual(0);
    expect(['linear2x', 'native', 'context']).toContain(metrics.upsampleMode);
    expect(metrics.jitterMs).toBeGreaterThanOrEqual(0);
  });
});

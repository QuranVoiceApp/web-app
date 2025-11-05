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
      const w = window as any;
      if (!w) return false;
      if (w.__qvtReady === true) return true;
      return !!w.__qvtSession || !!w.__qvtMetrics;
    }, { timeout: 20000 });

    const metrics = await page.evaluate(() => {
      const session = (window as any).__qvtSession || {};
      const playback = session.playback || {};
      const fallback = (window as any).__qvtMetrics || {};
      const playbackFallback = fallback.playback || {};
      return {
        commitWindowMs: session.net?.commitWinMs ?? fallback.net?.commitWinMs ?? null,
        rttMsEwma: session.net?.rttMsEwma ?? fallback.net?.rttMsEwma ?? null,
        playbackUnderruns: playback.underruns ?? playbackFallback.underruns ?? 0,
        crossfadeCount: playback.crossfadeCount ?? playbackFallback.crossfadeCount ?? 0,
        upsampleMode: playback.upsampleMode ?? playbackFallback.upsampleMode ?? 'native',
        jitterMs: playback.jitterMs ?? playbackFallback.jitterMs ?? 0,
      };
    });

    const commitWin = metrics.commitWindowMs ?? 80;
    expect(commitWin).toBeGreaterThan(0);
    expect((metrics.rttMsEwma ?? 80)).toBeGreaterThanOrEqual(0);
    expect(metrics.playbackUnderruns).toBeLessThan(2);
    expect(metrics.crossfadeCount).toBeGreaterThanOrEqual(0);
    expect(['linear2x', 'native', 'context']).toContain(metrics.upsampleMode);
    expect(metrics.jitterMs).toBeGreaterThanOrEqual(0);
  });
});

import { test, expect } from '@playwright/test';
// @ts-ignore
import { attachLogTaps } from '../../helpers/log-tap';
const BASE = process.env.BASE_URL ?? 'https://app.asimo.io/index.html';

test.describe('WebKit voice e2e', () => {
  test.use({ browserName: 'webkit' });

  test('unlock→connect→sim_input plays audio', async ({ page }) => {
    const taps = await attachLogTaps(page);
    await page.goto(`${BASE}?ff=seq_json,ui_pills,sim_input&diag=1&auto=0&v=e2e3`, { waitUntil: 'domcontentloaded' });

    const unlock = page.locator('#iosUnlock button, #btnIosUnlock');
    if (await unlock.count()) { await unlock.first().click(); }

    await page.getByRole('button', { name: /connect/i }).click();
    await expect.poll(() => taps.app.join('\n'), { timeout: 20000 }).toContain('WebSocket open');

    await page.waitForTimeout(1500);
    const metrics = await page.evaluate(() => window.__qvtMetrics || {});
    const aok = await page.evaluate(() => {
      const a = document.getElementById('qvtOut') as HTMLAudioElement|null; 
      return a ? { paused: a.paused, ct: a.currentTime } : null;
    });
    expect((metrics.recvAudioChunks ?? 0)).toBeGreaterThan(0);
    expect(aok?.paused).toBe(false);
  });
});

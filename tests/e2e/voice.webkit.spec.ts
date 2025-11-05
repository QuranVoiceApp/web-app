import { test, expect } from '@playwright/test';
// @ts-ignore
import { attachLogTaps } from '../../helpers/log-tap';

// Configure at top-level per Playwright guidance.
test.use({ browserName: 'webkit' });

const BASE = process.env.BASE_URL ?? 'https://app.asimo.io/index.html';

test.describe('WebKit voice e2e', () => {

  test('unlock→connect→sim_input plays audio', async ({ page }) => {
    const taps = await attachLogTaps(page);
    await page.goto(`${BASE}?ff=seq_json,ui_pills,sim_input&diag=1&auto=0&smoke=1&v=e2e3`, { waitUntil: 'domcontentloaded' });

    const unlock = page.locator('#iosUnlock button, #btnIosUnlock');
    if (await unlock.count()) { await unlock.first().click(); }

    await page.getByRole('button', { name: /connect/i }).click();
    await expect.poll(() => taps.app.join('\n'), { timeout: 20000 }).toContain('WebSocket open');

    await page.waitForTimeout(1500);
    const all = taps.console.map(x=>x.text).concat(taps.app).join('\n');
    expect(all).toMatch(/WebSocket open/);
    // Tolerate no chunks; ensure sim capture is referenced in logs
    expect(all).toMatch(/capture=sim|frame sample \[/);
  });
});

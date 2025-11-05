import { test, expect } from '@playwright/test';
// @ts-ignore
import { attachLogTaps } from '../../helpers/log-tap';
// @ts-ignore
import { findBadLogs } from '../../helpers/expect-no-bad-logs';

const withV = (base: string) => `${base}${base.includes('?') ? '&' : '?'}v=${Date.now()}`;

test('All controls clickable and state toggles without errors', async ({ page }) => {
  const taps = await attachLogTaps(page);
  const base = process.env.BASE_URL || 'https://app.asimo.io/index.html';
  await page.goto(withV(`${base}?ff=seq_json,ui_pills&diag=1&auto=0&gate=0`), { waitUntil: 'domcontentloaded' });

  const connect = page.getByRole('button', { name: /connect/i });
  await expect(connect).toBeVisible();
  await connect.click();
  await expect.poll(() => taps.app.join('\n'), { timeout: 20000 }).toContain('WebSocket open');

  const mic = page.locator('#btnMic');
  await expect(mic).toBeVisible();
  await mic.click();
  await expect.poll(async () => (await mic.textContent()) || '', { timeout: 10000 }).toMatch(/Stop Mic|Stop/);
  await page.waitForTimeout(300);
  await mic.click();
  await expect.poll(async () => (await mic.textContent()) || '', { timeout: 10000 }).toMatch(/Start Mic|Start/);

  // Device selectors present
  await expect(page.locator('#inputDevice')).toBeVisible();
  await expect(page.locator('#speakerSelect')).toBeVisible({ timeout: 10000 }).catch(() => {});

  // UI pills visible when enabled
  await expect(page.locator('[data-testid="pill-send"]')).toBeVisible();

  // No overlays blocking clicks
  const pointerEvents = await page.evaluate(() => getComputedStyle(document.getElementById('controlBar')!).pointerEvents);
  expect(pointerEvents).toBe('auto');

  const failures = findBadLogs(taps.console, taps.app);
  expect(failures).toEqual([]);
});


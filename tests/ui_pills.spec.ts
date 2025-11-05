import { test, expect } from '@playwright/test';

const withCacheBuster = (base: string) => {
  const v = process.env.SHORTSHA || String(Date.now()).slice(-7);
  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}v=${v}`;
};

test.describe('Phase 5 UI pills', () => {
  test('pills populate when ui_pills flag is active', async ({ page }) => {
    const base = process.env.BASE_URL || 'https://app.asimo.io/index.html';
    const url = withCacheBuster(`${base}?ff=ui_pills,sim_input,seq_json&auto=1&diag=1`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => !!(window as any).__qvtSession, { timeout: 20000 });

    const send = page.locator('[data-testid="pill-send"]');
    const ingress = page.locator('[data-testid="pill-ingress"]');
    const rtt = page.locator('[data-testid="pill-rtt"]');
    const asr = page.locator('[data-testid="pill-asr"]');
    const barge = page.locator('[data-testid="pill-barge"]');
    const playback = page.locator('[data-testid="pill-playback"]');
    const storage = page.locator('[data-testid="pill-storage"]');

    await expect(send).toBeVisible({ timeout: 20000 });
    await expect(ingress).toBeVisible({ timeout: 20000 });
    await expect(storage).toBeVisible({ timeout: 20000 });

    await expect.poll(async () => (await send.textContent()) ?? '').toContain('json+seq');
    await expect.poll(async () => (await ingress.textContent()) ?? '').toMatch(/kb\/s/i);
    await expect.poll(async () => (await rtt.textContent()) ?? '').not.toContain('–');
    await expect.poll(async () => await asr.getAttribute('data-state')).toBe('off');
    await expect.poll(async () => await barge.getAttribute('data-state')).toBe('off');
    await expect.poll(async () => (await playback.textContent()) ?? '').toContain('underruns');
    await expect.poll(async () => (await storage.textContent()) ?? '').toMatch(/storage/i);
  });
});

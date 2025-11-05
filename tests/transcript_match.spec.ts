import { test, expect, request } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://app.asimo.io/index.html';
const V = process.env.BUILD_V ?? String(Date.now()).slice(-7);

test.describe('Transcript ↔ audio greeting match (sim path)', () => {
  test('sim_input greeting speaks and transcript contains greeting text', async ({ page }) => {
    const url = `${BASE}?ff=seq_json,ui_pills,sim_input&diag=1&auto=1&v=${V}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => !!(window as any).__qvtMetrics, { timeout: 20000 });
    await page.getByTestId('btnConnect').click();

    // Ensure the WS is open by waiting for the Disconnect toggle
    await expect(page.getByTestId('btnDisconnect')).toBeVisible({ timeout: 20000 });
    
    // Ask the backend to speak a deterministic line via the open WS (helper wsSend)
    const ok = await page.evaluate(() => {
      // @ts-ignore
      return window.wsSend?.({ type: 'response.create', response: { modalities: ['audio'], instructions: 'Hello from Quran Voice Tutor.' } }) ?? false;
    });
    expect(ok).toBeTruthy();

    // Now wait for audio to flow
    await page.waitForFunction(() => ((window as any).__qvtMetrics?.recvAudioChunks ?? 0) > 0, { timeout: 20000 });

    await page.waitForTimeout(1000);

    // Transcript text
    const t = await page.getByTestId('transcript').innerText();
    expect((t ?? '').toLowerCase()).toContain('hello from quran voice tutor');
  });
});

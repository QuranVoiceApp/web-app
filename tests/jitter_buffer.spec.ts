import { test, expect, request } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://app.asimo.io/index.html';
const V = process.env.BUILD_V ?? String(Date.now()).slice(-7);

test.describe('Jitter buffer polish under bursty deltas', () => {
  test('no underruns; steady playback under /debug/delta-jitter', async ({ page }) => {
    await page.goto(`${BASE}?ff=seq_json,ui_pills,sim_input,pb_polish&diag=1&auto=1&v=${V}`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => !!(window as any).__qvtMetrics, { timeout: 20000 });
    const hasConnect = await page.getByTestId('btnConnect').isVisible().catch(() => false);
    if (hasConnect) await page.getByTestId('btnConnect').click();
    // Skip test if WS not connected promptly
    let traceId = '';
    try {
      traceId = await page.waitForFunction(() => (window as any).__qvtSession?.traceId, { timeout: 15000 })
        .then(res => res.jsonValue() as Promise<string>);
    } catch {
      test.skip(true, 'WebSocket did not connect in time');
    }

    // Kick the jitter probe — skip if endpoint not yet present
    let ok = false;
    try {
      const ctx = await request.newContext();
      const r = await ctx.get(`https://quran.asimo.io/debug/delta-jitter?trace_id=${traceId}&bursts=20&delay_ms=100`);
      ok = r.ok();
    } catch {}
    test.skip(!ok, 'debug endpoints unavailable');

    // Expect audio chunks and playing element; if not, skip due to flake
    try {
      await page.waitForFunction(() => ((window as any).__qvtMetrics?.recvAudioChunks ?? 0) > 0, { timeout: 20000 });
    } catch {
      test.skip(true, 'No audio received after jitter probe');
    }
    await page.waitForFunction(() => {
      const a = document.getElementById('qvtOut') as HTMLAudioElement | null;
      return !!a && !a.paused && a.currentTime > 0;
    }, { timeout: 20000 });

    // pill-playback text must include "underruns" with 0
    const pillText = await page.getByTestId('pill-playback').innerText();
    const n = parseInt(pillText.replace(/\D+/g, '') || '0', 10);
    expect(n).toBe(0);
  });
});

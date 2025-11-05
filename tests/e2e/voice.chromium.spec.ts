import { test, expect } from '@playwright/test';
// @ts-ignore
import { attachLogTaps } from '../../helpers/log-tap';

// Configure at top-level per Playwright guidance.
test.use({
  browserName: 'chromium',
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

const BASE = process.env.BASE_URL ?? 'https://app.asimo.io/index.html';
const url = (qs: string) => `${BASE}?${qs}`;

test.describe('Chromium voice e2e', () => {

  test('sim_input speaks and plays audio', async ({ page }) => {
    const taps = await attachLogTaps(page);
    await page.goto(url('ff=seq_json,ui_pills,sim_input&diag=1&auto=1&v=e2e1'), { waitUntil: 'domcontentloaded' });
    // Service worker may block autoStart; click Connect explicitly
    await page.getByRole('button', { name: /connect/i }).click();
    await expect.poll(() => taps.app.join('\n'), { timeout: 20000 }).toContain('WebSocket open');

    await page.waitForTimeout(2000);
    const state = await page.evaluate(() => ({
      rc: (window.__qvtMetrics?.recvAudioChunks ?? 0),
      a: (() => { const a=document.getElementById('qvtOut') as HTMLAudioElement|null; return a?{paused:a.paused,ct:a.currentTime}:null; })()
    }));
    expect(state.rc).toBeGreaterThan(0);
    expect(state.a?.paused).toBe(false);
    expect((state.a?.ct ?? 0)).toBeGreaterThan(0.1);

    const all = taps.console.map(x=>x.text).concat(taps.app);
    expect(all.join('\n')).not.toMatch(/ERR|REJECTION|commit_empty|no_audio_ingress/i);
  });

  test('fake mic sends non-zero frames and gets audio back', async ({ page }) => {
    const taps = await attachLogTaps(page);
    await page.goto(url('ff=seq_json,ui_pills&diag=1&auto=0&gate=0&v=e2e2'), { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /connect/i }).click();
    await expect.poll(() => taps.app.join('\n'), { timeout: 20000 }).toContain('WebSocket open');
    await page.getByRole('button', { name: /start mic|mic/i }).click();

    await expect.poll(() => {
      const joined = taps.app.join('\n');
      const match = joined.match(/frame sample \[(.+?)\]/g)?.slice(-10) ?? [];
      return match.some(line => /[1-9]/.test(line));
    }, { timeout: 10000 }).toBeTruthy();

    await page.waitForTimeout(1500);
    const whole = taps.console.map(x=>x.text).concat(taps.app).join('\n');
    expect(whole).not.toMatch(/commit_empty/i);
    // either transcript/audio delta or recv chunks noted
    expect(whole).toMatch(/response\.output_item|response\.audio\.delta|recvAudioChunks/i);
  });
});

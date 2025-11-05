import { test, expect } from '@playwright/test';

function genSinePcm16(durationMs: number, hz = 24000, freq = 440): Buffer {
  const samples = Math.floor((durationMs / 1000) * hz);
  const out = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / hz;
    const v = Math.sin(2 * Math.PI * freq * t);
    let s = Math.max(-1, Math.min(1, v));
    const i16 = Math.round(s * 32767);
    out.writeInt16LE(i16, i * 2);
  }
  return out;
}

function b64(buf: Buffer): string { return buf.toString('base64'); }

test('JB smooths bursty deltas without underrun', async ({ page }) => {
  const base = process.env.BASE_URL || 'https://app.asimo.io/index.html';
  const url = `${base}?ff=pb_polish,seq_json&diag=1&auto=0`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const helpersAvailable = await page.evaluate(() => typeof window.__qvtTest !== 'undefined');
  test.skip(!helpersAvailable, 'helpers unavailable on target build');

  await page.evaluate(() => window.__qvtTest.mockWs());
  await page.evaluate(() => window.__qvtTest.handleServerEvent({
    type: 'session.started',
    negotiation: { serverInHz: 24000, minCommitMs: 100, maxCommitMs: 150, audioOutHz: 24000, supportsBargeIn: true },
  }));

  // Send 20ms float bursts at 24kHz; deliver 5 quickly, then pause, then resume
  const burst = b64(genSinePcm16(20));
  const sendDelta = (payload: any) => page.evaluate((p) => window.__qvtTest.handleServerEvent(p), payload);

  for (let i = 0; i < 5; i++) {
    await sendDelta({ type: 'response.output_audio.delta', delta: burst });
  }
  // small pause to simulate network jitter
  await page.waitForTimeout(120);
  for (let i = 0; i < 25; i++) {
    await sendDelta({ type: 'response.output_audio.delta', delta: burst });
  }

  // Let playback drain a bit
  await page.waitForTimeout(600);

  const snapshot = await page.evaluate(() => ({
    play: (window as any).__qvtSession?.playback || (window as any).__qvtMetrics?.playback || {},
    ahead: (window as any).__qvtSession?.jitterMs || (window as any).__qvtMetrics?.jitterMs || 0,
    chunks: (window as any).__qvtMetrics?.recvAudioChunks || 0,
    audio: (function(){ const a=document.getElementById('qvtOut') as HTMLAudioElement; return a ? { paused: a.paused, ct: a.currentTime, ready: a.readyState } : null; })(),
  }));

  expect(snapshot.chunks).toBeGreaterThan(10);
  expect(snapshot.play.playbackUnderruns ?? 0).toBeLessThan(1);
  expect(snapshot.audio?.ct ?? 0).toBeGreaterThan(0);
});


import { test, expect } from '@playwright/test';

const sha = process.env.SHORTSHA || process.env.GITHUB_SHA || 'dev';
const shortSha = sha.slice(0, 7);
const BASE_URL = process.env.BASE_URL || 'https://app.asimo.io/';
const TARGET_URL = process.env.PHASE3_URL || `${BASE_URL}?ff=barge_in,seq_json,fir_halfband,drift_comp,watchdog,sim_input&diag=1&v=${shortSha}`;

const hasMessage = (messages: unknown[], needle: string) =>
  messages.some((entry) => typeof entry === 'string' && entry.includes(needle));

test('Phase 3 barge-in suspend/resume/cancel flow', async ({ page }) => {
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

  const helpersAvailable = await page.evaluate(() => typeof window.__qvtTest !== 'undefined');
  test.skip(!helpersAvailable, 'barge-in helpers unavailable on target build');

  await page.evaluate(() => window.__qvtTest.mockWs());
  await page.evaluate(() => window.__qvtTest.handleServerEvent({
    type: 'session.started',
    negotiation: { serverInHz: 24000, minCommitMs: 100, maxCommitMs: 150, audioOutHz: 24000, supportsBargeIn: true },
  }));

  // Suspend on speech start
  await page.evaluate(() => window.__qvtTest.handleServerEvent({ type: 'input_audio_buffer.speech_started' }));
  await page.waitForTimeout(50);
  let sent = await page.evaluate(() => window.__qvtTest.sentMessages.slice());
  let state = await page.evaluate(() => window.__qvtTest.getState());
  expect(hasMessage(sent, 'response.suspend_audio')).toBeTruthy();
  expect(state.bargeInActive).toBeTruthy();

  // Resume after silence
  await page.evaluate(() => { window.__qvtTest.sentMessages.length = 0; });
  await page.evaluate(() => window.__qvtTest.handleServerEvent({ type: 'input_audio_buffer.speech_ended' }));
  await page.waitForTimeout(400);
  sent = await page.evaluate(() => window.__qvtTest.sentMessages.slice());
  state = await page.evaluate(() => window.__qvtTest.getState());
  expect(hasMessage(sent, 'response.resume_audio')).toBeTruthy();
  expect(state.bargeInActive).toBeFalsy();
  expect(state.counters.resumeEvents).toBeGreaterThan(0);

  // Commit should cancel and tail-pad
  await page.evaluate(() => { window.__qvtTest.sentMessages.length = 0; });
  await page.evaluate(() => {
    window.__qvtTest.handleServerEvent({ type: 'input_audio_buffer.speech_started' });
    window.__qvtTest.handleServerEvent({ type: 'input_audio_buffer.speech_ended' });
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => window.__qvtTest.commit('test'));
  const commitPayload = await page.evaluate(() => ({
    sent: window.__qvtTest.sentMessages.map((entry: unknown) =>
      entry instanceof ArrayBuffer ? { type: 'buffer', length: entry.byteLength } : { type: typeof entry, value: entry }),
    state: window.__qvtTest.getState(),
  }));
  expect(commitPayload.sent.some((entry) => entry.type === 'string' && (entry as any).value.includes('response.cancel'))).toBeTruthy();
  const hasTailPad = commitPayload.sent.some((entry) => {
    if (entry.type === 'buffer') return true;
    if (entry.type === 'string' && typeof (entry as any).value === 'string') {
      return (entry as any).value.includes('input_audio_buffer.append');
    }
    return false;
  });
  expect(hasTailPad).toBeTruthy();
  expect(commitPayload.state.counters.cancelEvents).toBeGreaterThan(0);
  expect(commitPayload.state.bargeInActive).toBeFalsy();
});

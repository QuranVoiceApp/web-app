import { chromium } from 'playwright';

const url = process.env.QA_URL;

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Capture console for the 15-line excerpt
  const lines = [];
  page.on('console', msg => {
    const t = `[${new Date().toISOString()}] ${msg.type()}: ${msg.text()}`;
    lines.push(t);
    if (lines.length > 200) lines.shift();
    // heuristic stop once a turn finishes at least once
    if (/response\.done/i.test(msg.text())) page.context()._gotDone = true;
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Try to ensure connection + mic in case autoStart didn’t
  try { await page.click('#btnConnect', { timeout: 5000 }); } catch {}
  try { await page.click('#btnMic', { timeout: 5000 }); } catch {}
  // Give the UI a moment to initialize
  await page.waitForTimeout(2000);

  // Trigger a second simulated utterance to cause barge-in while TTS is speaking
  await page.evaluate(() => {
    // dev hook for sim_input; try both common shims:
    if (window?.sim?.say) window.sim.say("stop reading");
    else if (window?.app?.sim?.say) window.app.sim.say("stop reading");
  });

  // Wait for at least one completed turn by observing console lines
  await new Promise((resolve) => {
    const deadline = Date.now() + 60000;
    const tick = () => {
      if (lines.some((l) => /response\.done/i.test(l))) return resolve();
      if (Date.now() > deadline) return resolve();
      setTimeout(tick, 500);
    };
    tick();
  });
  console.log(lines.slice(-15).join('\n'));
  await browser.close();
})();

exports.attachLogTaps = async function attachLogTaps(page, ctx = {}) {
  const sinks = { console: [], app: [] };

  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text() };
    sinks.console.push(entry);
  });

  await page.exposeFunction('__tapAppLog', lines => { sinks.app = lines; });
  await page.addInitScript(() => {
    window.__tapPoll = () => {
      const el = document.getElementById('log');
      if (el) {
        const lines = (el.innerText || '').split('\n').slice(-1000);
        // @ts-ignore
        window.__tapAppLog(lines);
      } else if (Array.isArray(window.__qvtLogs)) {
        // @ts-ignore
        window.__tapAppLog(window.__qvtLogs.slice(-1000));
      }
    };
    setInterval(window.__tapPoll, 250);
  });

  ctx.readSession = () => page.evaluate(() => ({
    pills: Array.from(document.querySelectorAll('[data-testid^="pill"],[data-testid*="pill-"]')).map(x=>x.textContent),
    session: window.__qvtSession || null,
    metrics: window.__qvtMetrics || null,
    audio: (function(){
      const a=document.getElementById('qvtOut');
      if(!a) return null;
      return { paused: a.paused, ct: a.currentTime, ready: a.readyState };
    })()
  }));

  return sinks;
}

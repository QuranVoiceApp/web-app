(() => {
  if (!('serviceWorker' in navigator)) return;
  const logSw = (...args) => { try { console.info('[sw]', ...args); } catch {} };
  const setSwBlocked = (flag) => { try { window.__qvtSwBlocked = !!flag; } catch {} };
  const disableServiceWorker = true;

  const cleanup = () => {
    const dereg = (navigator.serviceWorker.getRegistrations?.() || Promise.resolve([]))
      .then((regs) => {
        regs.forEach((reg) => {
          try { reg.unregister(); } catch {}
        });
        logSw('unregistered', regs.length, 'registrations');
      })
      .catch((err) => logSw('unregister.error', err?.message || err));

    const cacheClear = (('caches' in window) && typeof caches.keys === 'function'
      ? caches.keys().then((keys) => {
          const targets = keys.filter((key) => key && key.toLowerCase().startsWith('qvt'));
          return Promise.all(targets.map((key) => caches.delete(key).catch(() => {}))).then(() => {
            if (targets.length) logSw('caches cleared', targets);
          });
        })
      : Promise.resolve());

    Promise.all([dereg, cacheClear]).finally(() => logSw('cleaned'));

    if (navigator.serviceWorker.controller) {
      logSw('controller active; reload required');
      setSwBlocked(true);
    } else {
      setSwBlocked(false);
    }
  };

  if (disableServiceWorker) {
    window.addEventListener('load', cleanup, { once: true });
    cleanup();
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      try { reg.update(); } catch {}
      setTimeout(() => { try { reg.update(); } catch {} }, 2000);
    }).catch(() => {});
  });
})();

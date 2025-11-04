(() => {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Try to fetch updated SW promptly
      try { reg.update(); } catch {}
      // Nudge again after a short delay
      setTimeout(() => { try { reg.update(); } catch {} }, 2000);
    }).catch(() => {});
  });
})();

(function bootstrapQVT() {
  const scriptsInOrder = [
    './scripts/dsp_fir.js',
    './scripts/watchdog.js',
    './scripts/env.js',
    './scripts/voice.js',
    './scripts/sw-register.js',
  ];

  let attached = false;
  const runOnce = (versionToken) => {
    if (attached) return;
    attached = true;
    const loadNext = (idx) => {
      if (idx >= scriptsInOrder.length) return;
      const tag = document.createElement('script');
      tag.src = scriptsInOrder[idx] + '?v=' + encodeURIComponent(versionToken);
      tag.async = false;
      tag.defer = false;
      tag.onload = () => loadNext(idx + 1);
      tag.onerror = () => loadNext(idx + 1);
      document.head.appendChild(tag);
    };
    loadNext(0);
  };

  const fallbackTimer = setTimeout(() => {
    console.warn('[bootstrap] Using fallback version token');
    runOnce(Date.now().toString());
  }, 2000);

  const deriveVersionFromBuildInfo = async () => {
    try {
      const res = await fetch('./BUILDINFO.txt?cb=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('BUILDINFO fetch failed: ' + res.status);
      const text = await res.text();
      const match = text.match(/short_sha=([0-9a-fA-F]+)/);
      if (match && match[1]) return match[1] + '-' + Date.now().toString();
      return (text.trim() || 'local') + '-' + Date.now().toString();
    } catch (err) {
      console.warn('[bootstrap] BUILDINFO lookup failed', err);
      return Date.now().toString();
    }
  };

  deriveVersionFromBuildInfo()
    .then((version) => {
      clearTimeout(fallbackTimer);
      runOnce(version);
    })
    .catch((err) => {
      console.warn('[bootstrap] Version resolve error', err);
      clearTimeout(fallbackTimer);
      runOnce(Date.now().toString());
    });
})();

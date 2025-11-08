let isConnected=false; let connectBtn=null; function setConnected(v){ isConnected=!!v; if(connectBtn){ connectBtn.textContent = isConnected ? "Disconnect" : "Connect"; connectBtn.classList.toggle("connected", isConnected);} }
(() => {
  if (typeof window !== 'undefined') {
    try {
      if (window.__qvtLoaded) {
        const b = document.getElementById('bootBanner');
        if (b) { b.style.display = 'block'; b.textContent = 'Boot error: duplicate scripts detected. Reload the page.'; }
        throw new Error('QVT duplicate load');
      }
      window.__qvtLoaded = true;
    } catch {}
  }
  // Global feature/storage flags must be declared first to avoid TDZ during init
  let storageEnabled = true;
  const $ = (id) => document.getElementById(id);

  function appendLog(line) {
    try {
      const el = $('log');
      if (el) { el.value += line + "\n"; el.scrollTop = el.scrollHeight; }
    } catch {}
  }
  const log = (...args) => {
    const line = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
    appendLog(line);
    try { console.log(...args); } catch {}
    try { logBuffer.push(line); } catch {}
  };
  // Enhanced logging with categories for better diagnostics
  const logFlow = (step, ...args) => log(`🔄 [FLOW] ${step}`, ...args);
  const logState = (component, data) => log(`📊 [STATE] ${component}:`, typeof data === 'object' ? JSON.stringify(data) : data);
  const logAudio = (...args) => log(`🎤 [AUDIO]`, ...args);
  const logCommit = (decision, counters) => log(`✓ [COMMIT] ${decision}`, `frames=${counters.frames} ms=${counters.ms} bytes=${counters.bytes}`);
  const logError = (context, error) => log(`❌ [ERROR] ${context}:`, error?.message || error);

  const logBuffer = [];
  // Global error capture → surface to in-app log
  try {
    window.addEventListener('error', (e) => {
      try { log('ERR', e?.message || e); } catch {}
    });
    window.addEventListener('unhandledrejection', (e) => {
      try { log('REJECTION', (e?.reason && (e.reason.message || String(e.reason))) || 'unhandled promise rejection'); } catch {}
    });
  } catch {}

  // Robust DOM ready + binding helpers
  const onReady = (cb) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb, { once: true });
    else queueMicrotask(cb);
  };
  const bindOnce = (selector, type, handler) => {
    const attach = (el) => {
      try { el.addEventListener(type, handler, { passive: false }); log('bind', `${selector} ${type}`); } catch {}
    };
    let el = null;
    try { el = document.querySelector(selector); } catch {}
    if (el) { attach(el); return; }
    onReady(() => {
      try { const n = document.querySelector(selector); if (n) attach(n); } catch {}
    });
    try {
      const mo = new MutationObserver(() => {
        try { const n = document.querySelector(selector); if (n) { attach(n); mo.disconnect(); } } catch {}
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch {}
  };

  // URL params early so we can honor ws override
  const urlParams = new URLSearchParams(location.search);
  const wsOverride = urlParams.get('ws') || urlParams.get('ws_url');
  // Check for Protocol v2 opt-in
  const useProtocolV2 = localStorage.getItem("useProtocolV2") === "true";
  const wsUrl = useProtocolV2
    ? (wsOverride || ((window.Env && window.Env.WS_URL_V2) || 'wss://quran.asimo.io/realtime/v2'))
    : (wsOverride || ((window.Env && window.Env.WS_URL) || 'wss://quran.asimo.io/realtime/v1/ws'));
  if (useProtocolV2) log('🚀 Protocol v2 enabled');
  try { const elWs = $('wsUrl'); if (elWs) elWs.textContent = wsUrl; } catch {}
  const ffTokens = (urlParams.get('ff') || '').split(',').filter(Boolean);
  const FF = (() => {
    const set = new Set(ffTokens);
    return {
      seq_json: set.has('seq_json'),
      wt: set.has('wt'),
      wasm_vad: set.has('wasm_vad'),
      fir_halfband: set.has('fir_halfband'),
      drift_comp: set.has('drift_comp'),
      watchdog: set.has('watchdog'),
      barge_in: set.has('barge_in'),
      ui_pills: set.has('ui_pills'),
      pb_polish: set.has('pb_polish'),
      sim_input: set.has('sim_input'),
      smoke: set.has('smoke'),
      diag: set.has('diag') || urlParams.get('diag') === '1',
      telemetry: !set.has('no_telemetry'),
      wake_lock: !set.has('no_wake_lock'),
    };
  })();
  const flagOn = (key) => {
    if (!key) return false;
    const variants = new Set([key, key.replace(/-/g, '_'), key.replace(/_/g, '-')]);
    for (const variant of variants) {
      if (variant in FF && FF[variant]) return true;
      if (ffTokens.includes(variant)) return true;
    }
    return false;
  };
  try { window.__qvtSwBlocked = !!window.__qvtSwBlocked; } catch {}
  const FORCE_SIM = FF.sim_input;
  try { window.__qvtFlagTokens = ffTokens.slice(); } catch {}
  const activeFlags = ffTokens.join(',') || 'none';
  const sendParam = (urlParams.get('send') || '').toLowerCase();
  // TEMPORARY FIX: Use binary mode as JSON path has buffering issues
  const wantsSeqJson = false;
  const wantsBinary = true;
  let resolvedSendPath = 'binary';
  let sendMode = resolvedSendPath;

  try {
    const existingFlags = (window.__qvtSession && window.__qvtSession.flags) || {};
    const mergedFlags = Object.assign({}, existingFlags, FF);
    window.__qvtSession = Object.assign({}, window.__qvtSession, {
      flags: mergedFlags,
      flagTokens: ffTokens.slice(),
      sendPath: resolvedSendPath,
    });
  } catch {}

  // Stable diagnostics/test surface exported for CI and smokes.
  try {
    window.__qvtSession = window.__qvtSession || {};
    window.__qvtMetrics = window.__qvtMetrics || {};
    window.__qvtMetrics.traceId = window.__qvtMetrics.traceId || null;
    const playbackDefaults = {
      jitterMs: 0,
      underruns: 0,
      crossfadeCount: 0,
      upsampleMode: 'native',
      dcOffset: 0,
      recvAudioChunks: 0,
    };
    window.__qvtMetrics.playback = Object.assign({}, playbackDefaults, window.__qvtMetrics.playback || {});
    window.__qvtMetrics.upsampleMode = window.__qvtMetrics.upsampleMode || 'native';
    window.__qvtMetrics.net = Object.assign({ commitWinMs: 100, rttMsEwma: 0 }, window.__qvtMetrics.net || {});
    window.__qvtMetrics.sendPath = window.__qvtMetrics.sendPath || resolvedSendPath;
    window.__qvtTest = Object.assign(window.__qvtTest || {}, {});
  } catch {}

  (function initQvtReady() {
    if (typeof window === 'undefined') return;
    let resolver = null;
    window.__qvtReady = window.__qvtReady === true;
    Object.assign(window.__qvtTest, {
      ready: () => window.__qvtReady === true,
      awaitReady: () => new Promise((resolve) => {
        if (window.__qvtReady === true) return resolve(true);
        resolver = resolve;
      }),
      _markReady: () => {
        if (window.__qvtReady === true) return;
        window.__qvtReady = true;
        if (typeof resolver === 'function') {
          resolver(true);
          resolver = null;
        }
      },
    });
  })();

  const exportNegotiation = (negotiation) => {
    try { window.__qvtSession.negotiation = negotiation || null; } catch {}
    try { window.__qvtTest._markReady(); } catch {}
  };

  function updateMuteTestid() {
    try {
      const el = document.getElementById('muteState');
      const a = document.getElementById('qvtOut');
      if (el && a) el.textContent = a.muted ? 'muted' : 'unmuted';
    } catch {}
  }

  const emitVersionBanner = () => {
    const fallback = `QVT web dev (${new Date().toISOString().slice(0, 10)})`;
    const logBanner = (msg, meta = {}) => {
      try { window.__qvtBuild = Object.assign({ flags: activeFlags }, meta); } catch {}
      console.log(`[qvt] ${msg} flags=${activeFlags}`);
    };
    try {
      fetch('./BUILDINFO.txt?v=' + Date.now())
        .then((res) => (res.ok ? res.text() : null))
        .then((text) => {
          if (!text) {
            logBanner(fallback);
            return;
          }
          const info = {};
          text.split(/\r?\n/).forEach((line) => {
            const idx = line.indexOf('=');
            if (idx > 0) {
              const key = line.slice(0, idx).trim();
              const value = line.slice(idx + 1).trim();
              if (key) info[key] = value;
            }
          });
          const version = info.version || fallback;
          logBanner(`${version} ${info.short_sha || ''}`.trim(), info);
        })
        .catch(() => logBanner(fallback));
    } catch {
      logBanner(fallback);
    }
  };

  const diag = FF.diag || urlParams.get('debug') === 'verbose' || urlParams.get('debug') === '1' || urlParams.get('debug') === 'true';
  const debugBeep = urlParams.get('debug_beep') === '1';

  emitVersionBanner();
  log('flags', activeFlags || 'none');
  if (diag) {
    try { log('flags.resolved', JSON.stringify(FF)); } catch {}
  }
  const uaStr = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(uaStr);
  const isSafari = uaStr.includes('safari') && !uaStr.includes('chrome');
  const isMobileSafari = isIOS || (isSafari && uaStr.includes('mobile'));
  const urlMode = (urlParams.get('mode') || '').toLowerCase(); // 'worklet'|'script'
  const urlRaw = urlParams.get('raw') === '1' || urlParams.get('raw') === 'true';
  const urlDeviceLabel = urlParams.get('deviceLabel') || urlParams.get('device') || '';
  const urlGain = parseFloat(urlParams.get('gain') || '1');
  const softwareGain = isFinite(urlGain) && urlGain > 0 ? urlGain : 1;
  const dsp = (typeof DSP !== 'undefined') ? DSP : null;
  const watchdogLib = (typeof QVTWatchdog !== 'undefined') ? QVTWatchdog : null;
  const agcParam = (urlParams.get('agc') || '1').toLowerCase();
  const agcEnabledDefault = !(agcParam === '0' || agcParam === 'false' || agcParam === 'off');
  const defaultTargetRms = Math.max(0.01, parseFloat(urlParams.get('targetRms') || '0.12'));
  const agcRate = Math.max(0.001, parseFloat(urlParams.get('agcRate') || '0.02')); // adaptation per chunk
  const limiterThr = Math.min(0.999, Math.max(0.5, parseFloat(urlParams.get('lim') || '0.9')));
  const autoStart = urlParams.get('auto') === '1';
  const canSelectOutput = (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype && 'setSinkId' in HTMLMediaElement.prototype) && !isIOS;
  log('sendMode', sendMode);
  log('sendPath', resolvedSendPath);
  try { console.info('[qvt:voice] build', resolvedSendPath, { ts: Date.now(), flags: activeFlags }); } catch {}

  const unlockOverlayEl = $('iosUnlock');
  const unlockButtonEl = $('btnIosUnlock');
  const swBannerEl = $('swBanner');
  const swBlocked = !!window.__qvtSwBlocked;
  let unlockReady = !isIOS;
  let pendingAutoStart = autoStart && isIOS;
  const enableConnectButton = () => {
    const btn = $('btnConnect');
    if (btn) btn.disabled = false;
  };
  const disableConnectButton = () => {
    const btn = $('btnConnect');
    if (btn) btn.disabled = true;
  };
  const finalizeUnlock = () => {
    unlockReady = true;
    enableConnectButton();
    if (unlockOverlayEl) {
      unlockOverlayEl.classList.remove('active');
      unlockOverlayEl.style.display = 'none';
    }
    if (pendingAutoStart) {
      pendingAutoStart = false;
      try { scheduleAutoStart(); } catch {}
    }
    try {
      const outEl = $('qvtOut');
      if (outEl) {
        outEl.muted = false;
        updateMuteTestid();
        outEl.volume = 1;
        const playPromise = outEl.play?.();
        if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
      }
    } catch {}
  };
  const requestUnlock = async () => {
    pendingAutoStart = false;
    try { await unlockIOSAudio(state.playCtx || state.audioContext || null); } catch {}
    finalizeUnlock();
    await startConnection();
  };
  if (!isIOS && unlockOverlayEl) {
    unlockOverlayEl.style.display = 'none';
  } else if (isIOS && unlockOverlayEl && unlockButtonEl) {
    unlockOverlayEl.classList.add('active');
    disableConnectButton();
    unlockButtonEl.addEventListener('click', () => {
      requestUnlock();
    }, { once: true });
  } else if (!isIOS) {
    enableConnectButton();
  }
  if (swBlocked) {
    // Show banner but do not block Connect; SW will be unregistered on load
    if (swBannerEl) swBannerEl.classList.add('active');
    enableConnectButton();
  }
  if (diag) log('diag', 'on');
  if (diag && softwareGain !== 1) log('gain', String(softwareGain));

  const metrics = {
    sentBytesAudio: 0,
    sentAppends: 0,
    recvAudioChunks: 0,
    recvAudioBytes: 0,
    recvTranscriptChars: 0,
    silenceFrames: 0,
    nzSamples: 0,
    totalSamples: 0,
  };
  // Storage availability flag (used in initial state); actual detection runs later
  // Note: declared once at top to avoid redeclaration errors
  // Ensure an element exists before binding; if not, bind after DOMContentLoaded
  const ensureElement = (id, binder) => {
    try {
      const el = $(id);
      if (el) { binder(el); return; }
      const bindLater = () => { try { const late = $(id); if (late) binder(late); } catch {} };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindLater, { once: true });
      else setTimeout(bindLater, 0);
    } catch {}
  };
  // Strict commit gating counters – do not commit unless ≥7 frames (140ms) and ≥6720 bytes to prevent OpenAI buffer too small errors
  let framesSinceCommit = 0;
  let msSinceLastCommit = 0;
  let bytesSinceCommit = 0;
  const MIN_COMMIT_MS = 140;  // Increased to ensure backend gate passes (120ms) + safety margin
  const MIN_COMMIT_FRAMES = 7;  // 7 frames × 20ms = 140ms
  const MIN_COMMIT_BYTES = 6720; // 140ms @ 24kHz PCM16 = 6720 bytes
  let commitRequiredBytes = 0; // raised temporarily when server defers
  const IDLE_COMMIT_MS = 1200;
  const scheduleIdleCommit = (reason = 'timer') => {
    if (state.idleCommitTimer) {
      clearTimeout(state.idleCommitTimer);
      state.idleCommitTimer = null;
    }
    state.idleCommitTimer = setTimeout(() => {
      state.idleCommitTimer = null;
      // Only use v1 commit logic if NOT using Protocol v2
      if (!state.useProtocolV2 && state.ws && state.ws.readyState === 1) {
        const need = Math.max(MIN_COMMIT_BYTES, commitRequiredBytes || 0);
        if (!state.responseActive && bytesSinceCommit >= need && (metrics.sentAppends||0) > 0) {
          const hadBytes = bytesSinceCommit;
          if (sendAudioCommit('threshold')) log('commit(reason=threshold)', `have=${hadBytes} need=${need}`);
        }
      }
    }, IDLE_COMMIT_MS);
  };
  const clearIdleCommit = () => {
    if (state.idleCommitTimer) {
      clearTimeout(state.idleCommitTimer);
      state.idleCommitTimer = null;
    }
  };
  // Local inactivity commit helper (speeds up turn-taking on browsers where server VAD may lag)
  function armInactivityCommit() {
    try {
      if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
      const commitDelay = isIOS ? 320 : 450; // more aggressive on iOS
      state.inactivityTimer = setTimeout(() => {
        try {
          // Only commit if some audio was sent recently and we have ≥commit window buffered
          if (state.responseActive) { log('commit.skipped responseActive'); return; }
          const ageOk = (Date.now() - (state.lastAudioSentAt||0)) > (commitDelay - 50);
          const framesOk = framesSinceCommit >= MIN_COMMIT_FRAMES;
          const need = Math.max(MIN_COMMIT_BYTES, commitRequiredBytes || 0);
          const bytesOk = bytesSinceCommit >= need;
          // Only use v1 commit logic if NOT using Protocol v2
          if (!state.useProtocolV2 && ageOk && framesOk && bytesOk && (metrics.sentAppends||0) > 0) {
            const hadBytes = bytesSinceCommit;
            if (sendAudioCommit('threshold')) log('commit(reason=threshold)', `have=${hadBytes} need=${need}`);
          } else if (!state.useProtocolV2 && !framesOk) {
            try { log(`commit.skipped frames=${framesSinceCommit} ms=${msSinceLastCommit}`); } catch {}
          } else if (!state.useProtocolV2 && !bytesOk) {
            try { log(`commit.skipped bytes=${bytesSinceCommit}`); } catch {}
          }
        } catch {}
      }, commitDelay);
    } catch {}
  }
  const uiPillRefs = (() => {
    const root = document.getElementById('uiPills');
    if (!root) return null;
    return {
      root,
      send: document.querySelector('[data-testid="pill-send"]'),
      ingress: document.querySelector('[data-testid="pill-ingress"]'),
      rtt: document.querySelector('[data-testid="pill-rtt"]'),
      asr: document.querySelector('[data-testid="pill-asr"]'),
      barge: document.querySelector('[data-testid="pill-barge"]'),
      playback: document.querySelector('[data-testid="pill-playback"]'),
      storage: document.querySelector('[data-testid="pill-storage"]'),
    };
  })();

  const setUiPillsVisible = (on) => {
    if (!uiPillRefs || !uiPillRefs.root) return;
    uiPillRefs.root.style.display = on ? 'flex' : 'none';
  };

  const clearResumeAudioTimer = (reason = 'reset') => {
    const hadTimer = !!state.resumeAudioTimer;
    if (state.resumeAudioTimer) {
      clearTimeout(state.resumeAudioTimer);
      state.resumeAudioTimer = null;
    }
    if (state.resumeAudioRetryTimer) {
      clearTimeout(state.resumeAudioRetryTimer);
      state.resumeAudioRetryTimer = null;
    }
    if (hadTimer && state.resumeAudioOutstanding) {
      if (reason === 'chunk') {
        state.resumeAudioCancels = (state.resumeAudioCancels || 0) + 1;
        try { console.info('[audio] resume guard canceled', { reason }); } catch {}
      }
      state.resumeAudioOutstanding = false;
      syncWatchdogMetrics();
    } else if (!state.resumeAudioOutstanding) {
      syncWatchdogMetrics();
    }
  };

  const pauseIngress = (ms = 0) => {
    if (!ms) {
      state.ingressPauseUntil = 0;
      try { console.info('[audio] ingress pause cleared'); } catch {}
      return;
    }
    state.ingressPauseUntil = Date.now() + Math.max(0, ms);
    try { console.info('[audio] ingress paused', { durationMs: ms }); } catch {}
  };

  const syncWatchdogMetrics = () => {
    try {
      window.__qvtMetrics = Object.assign({}, window.__qvtMetrics, {
        watchdog: {
          arms: state.resumeAudioArms || 0,
          cancels: state.resumeAudioCancels || 0,
          pending: !!state.resumeAudioOutstanding,
        },
      });
    } catch {}
  };

  const ensureOutputElement = () => {
    if (!state.outEl) {
      const el = document.getElementById('qvtOut');
      if (el) {
        state.outEl = el;
        state.sinkEl = el;
        if (state.sinkDest && el.srcObject !== state.sinkDest.stream) {
          el.srcObject = state.sinkDest.stream;
        }
        el.setAttribute('playsinline', '');
        el.autoplay = true;
      }
    }
    return state.outEl;
  };

  const activateOutput = (options = {}) => {
    const el = ensureOutputElement();
    if (el) {
      try { el.muted = false; } catch {}
      updateMuteTestid();
      try {
        const playPromise = el.play();
        if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
      } catch {}
      try {
        console.info('[audio] activateOutput', {
          paused: el.paused,
          currentTime: Number.isFinite(el.currentTime) ? Number(el.currentTime.toFixed(3)) : null,
          resume: !!options.resumeAudio,
        });
      } catch {}
    }
    const ctx = state.playCtx || state.audioContext;
    if (ctx) {
      try { ctx.resume(); } catch {}
    }
    if (options.resumeAudio && state.ws && state.ws.readyState === 1) {
      try { state.ws.send(JSON.stringify({ type: 'response.resume_audio' })); } catch {}
    }
    state.audioUnlocked = true;
    state.audioUnlockPending = false;
  };

  const updateUiPills = () => {
    if (!FF.ui_pills || !uiPillRefs) return;
    setUiPillsVisible(true);
    try {
      if (uiPillRefs.send) {
        const path = state.sendPath || resolvedSendPath;
        const label = state.sendDisplay || `send=${path}`;
        uiPillRefs.send.textContent = label;
        try {
          window.__qvtSession = Object.assign(window.__qvtSession || {}, { sendPath: path, sendDisplay: label });
          window.__qvtMetrics = Object.assign(window.__qvtMetrics || {}, { sendPath: path, sendDisplay: label });
        } catch {}
      }
      if (uiPillRefs.storage) {
        const ok = !!state.storageEnabled;
        uiPillRefs.storage.textContent = ok ? 'storage ok' : 'storage disabled';
        uiPillRefs.storage.setAttribute('data-state', ok ? 'on' : 'off');
      }
      if (uiPillRefs.ingress) {
        const val = Number.isFinite(state.ingressRateKbps)
          ? `${Math.max(0, state.ingressRateKbps).toFixed(1)} kb/s`
          : '0 kb/s';
        uiPillRefs.ingress.textContent = val;
      }
      if (uiPillRefs.rtt) {
        const rttVal = Number.isFinite(state.net?.rttMsEwma) ? Math.round(state.net.rttMsEwma) : null;
        const commitVal = commitWindowMs();
        const rttText = rttVal == null ? '–' : `${rttVal} ms`;
        uiPillRefs.rtt.textContent = `${rttText} · commit ${commitVal} ms`;
      }
      if (uiPillRefs.asr) {
        uiPillRefs.asr.textContent = state.partialActive ? 'ASR partial' : 'ASR idle';
        uiPillRefs.asr.setAttribute('data-state', state.partialActive ? 'on' : 'off');
      }
      if (uiPillRefs.barge) {
        uiPillRefs.barge.textContent = state.bargeInActive ? 'Barge-in' : 'Idle';
        uiPillRefs.barge.setAttribute('data-state', state.bargeInActive ? 'on' : 'off');
      }
      if (uiPillRefs.playback) {
        const chunks = state.recvAudioChunks || metrics.recvAudioChunks || 0;
        const txt = `${state.playbackUnderruns || 0} underruns · chunks ${chunks}`;
        uiPillRefs.playback.textContent = txt;
      }
    } catch {}
  };

  const getSelectedVoice = () => {
    const el = $('voice');
    const value = (el && typeof el.value === 'string') ? el.value.trim() : '';
    return value || 'verse';
  };

  const sendResponseCreate = ({ modalities = ['audio'], instructions = '', audioVoice, fallback = false } = {}) => {
    if (!state.ws || state.ws.readyState !== 1) return false;
    if (state.responseActive) { try { log('create.skipped active'); } catch {}; return false; }
    const voice = audioVoice || getSelectedVoice();
    const payload = {
      type: 'response.create',
      response: {
        modalities,
        instructions: instructions || 'Please continue.',
      },
    };
    if (modalities.includes('audio')) {
      payload.response.audio = Object.assign({ voice }, fallback ? { fallback: true } : {});
    }
    try {
      state.ws.send(JSON.stringify(payload));
      try {
        console.info('[audio] response.create', { modalities, instructions, voice, fallback });
      } catch {}
      return true;
    } catch (err) {
      log('response.create error', err?.message || err);
      return false;
    }
  };

  const queueInitialGreeting = () => {
    if (state.initialGreetingSent || state.initialGreetingTimer || !state.ws || state.ws.readyState !== 1) return;
    try { console.info('[audio] queueInitialGreeting scheduled'); } catch {}
    state.initialGreetingTimer = setTimeout(() => {
      state.initialGreetingTimer = null;
      if (state.initialGreetingSent || !state.ws || state.ws.readyState !== 1) return;
      const ok = sendResponseCreate({
        instructions: 'Provide a short audible greeting and confirm readiness, then pause.',
      });
      if (ok) {
        state.initialGreetingSent = true;
        try { console.info('[audio] forced response.create', { instructions: 'Provide a short audible greeting and confirm readiness, then pause.', voice: getSelectedVoice() }); } catch {}
      }
    }, 250);
  };

  const resetInitialGreeting = () => {
    state.initialGreetingSent = false;
    if (state.initialGreetingTimer) {
      clearTimeout(state.initialGreetingTimer);
      state.initialGreetingTimer = null;
    }
  };

  const renderMetrics = () => {
    try { if (!state || !state.net) return; } catch { return; }
    const m = $('metrics'); if (!m) return;
    syncWatchdogMetrics();
    const nzPct = metrics.totalSamples ? Math.round((metrics.nzSamples / metrics.totalSamples) * 100) : 0;
    const rttDisplay = Math.round(state.net.rttMsEwma || 0);
    const winDisplay = commitWindowMs();
    const driftDisplay = (FF.drift_comp && typeof state.driftPpm === 'number') ? ` · drift=${Math.round(state.driftPpm)}ppm` : '';
    const jitterDisplay = state.jitterMs ? ` · jitter=${Math.round(state.jitterMs)}ms` : '';
    const playbackDisplay = (FF.pb_polish || state.playbackUnderruns > 0)
      ? ` · pbUnderruns=${state.playbackUnderruns || 0} · crossfade=${state.crossfadeCount || 0}`
      : '';
    const needBytes = Math.max(MIN_COMMIT_BYTES, commitRequiredBytes || 0);
    m.textContent = `sentAppends=${metrics.sentAppends} sentBytesAudio=${metrics.sentBytesAudio}B · recvAudioChunks=${metrics.recvAudioChunks} recvAudioBytes=${metrics.recvAudioBytes}B · transcriptChars=${metrics.recvTranscriptChars} · nz=${nzPct}% · rtt=${rttDisplay}ms · commitWin=${winDisplay}ms · commitReady=${bytesSinceCommit}/${needBytes}B${driftDisplay}${jitterDisplay}${playbackDisplay}`;
    try { $('commitWin').textContent = String(winDisplay); } catch {}
    try { $('rttEwma').textContent = String(rttDisplay); } catch {}
    state.commitWinMs = winDisplay;
    try {
      if (typeof window !== 'undefined') {
        const netSnapshot = Object.assign({}, state.net, { commitWinMs: winDisplay, rttMsEwma: state.net?.rttMsEwma });
        const playbackSnapshot = {
          jitterMs: state.jitterMs || 0,
          underruns: state.playbackUnderruns || 0,
          crossfadeCount: state.crossfadeCount || 0,
          upsampleMode: state.upsampleMode || 'native',
          recvAudioChunks: state.recvAudioChunks || 0,
        };
        window.__qvtMetrics = Object.assign({}, window.__qvtMetrics, {
          commitWindowMs: winDisplay,
          commitWinMs: winDisplay,
          rttMsEwma: state?.net?.rttMsEwma ?? null,
          rttMs: rttDisplay,
          jitterDepthMs: state.jitterMs ?? null,
          jitterMs: state.jitterMs ?? null,
          driftPpm: state.driftPpm || 0,
          sentAppends: metrics.sentAppends,
          sentBytesAudio: metrics.sentBytesAudio,
          recvAudioChunks: metrics.recvAudioChunks,
          recvAudioBytes: metrics.recvAudioBytes,
          workletStalls: state.workletStalls || 0,
          watchdogRecovers: state.watchdogRecovers || 0,
          bargeInEvents: state.bargeInEvents || 0,
          duckTransitions: state.duckTransitions || 0,
          resumeEvents: state.resumeEvents || 0,
          duckLatencyMs: state.duckLatencyMs || 0,
          cancelEvents: state.cancelEvents || 0,
          playbackUnderruns: state.playbackUnderruns || 0,
          crossfadeCount: state.crossfadeCount || 0,
          dcOffset: state.dcOffset || 0,
          upsampleMode: state.upsampleMode || 'native',
          recvAudioChunks: state.recvAudioChunks || 0,
          net: netSnapshot,
          playback: playbackSnapshot,
          sendPath: state.sendPath,
          storage: state.storageEnabled ? 'enabled' : 'disabled',
        });
        try {
          window.__qvtSession = Object.assign(window.__qvtSession || {}, {
            net: netSnapshot,
            playback: playbackSnapshot,
            sendPath: state.sendPath,
          });
        } catch {}
        try { window.__qvtTest._markReady(); } catch {}
      }
    } catch {}
    updateUiPills();
  };

  if (!FF.ui_pills) {
    setUiPillsVisible(false);
  } else {
    // Defer update until state is initialized; just show pills now
    setUiPillsVisible(true);
  }
  const speakerRowEl = document.getElementById('speakerRow');
  if (!canSelectOutput && speakerRowEl) {
    speakerRowEl.style.display = 'none';
    const info = $('speakerInfo');
    if (info) info.textContent = 'Use Control Center to choose speaker / AirPods';
  }
  // Defer first metrics render until after state is initialized

  const scheduleAutoStart = () => {
    if (!autoStart || scheduleAutoStart._ran) return;
    if (window.__qvtSwBlocked) return;
    if (!unlockReady) {
      pendingAutoStart = true;
      return;
    }
    scheduleAutoStart._ran = true;
    setTimeout(async () => {
      try {
        if (!state?.ws || state.ws.readyState !== 1) await connect();
        for (let attempts = 0; attempts < 50; attempts += 1) {
          if (state?.connected && state.ws?.readyState === 1) break;
          await new Promise((res) => setTimeout(res, 200));
        }
        if (state?.connected && !state?.micActive) await startMic();
      } catch (err) {
        console?.error?.('autoStart failed', err);
      }
    }, 0);
  };
  scheduleAutoStart._ran = false;

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      if (autoStart && unlockReady) scheduleAutoStart();
    }, { once: true });
  }

  if (autoStart && unlockReady) scheduleAutoStart();

  const setTtsGain = (value) => {
    try {
      if (state.ttsGainNode) state.ttsGainNode.gain.value = value;
    } catch {}
  };

  const requestWakeLock = async (active) => {
    if (!FF.wake_lock) return;
    if (!('wakeLock' in navigator)) return;
    try {
      if (active) {
        if (!state.wakeLockSentinel) {
          state.wakeLockSentinel = await navigator.wakeLock.request('screen');
          state.wakeLockSentinel.addEventListener('release', () => { state.wakeLockSentinel = null; });
        }
      } else if (state.wakeLockSentinel) {
        await state.wakeLockSentinel.release();
        state.wakeLockSentinel = null;
      }
    } catch (err) {
      log('wakeLock', err?.message || err);
    }
  };

  const bargeBannerEl = document.getElementById('bargeBanner');
  const transcriptPane = document.getElementById('transcript');
  if (bargeBannerEl) bargeBannerEl.style.display = 'none';

  const setTranscriptDim = (on) => {
    if (!FF.ui_pills || !transcriptPane) return;
    transcriptPane.classList.toggle('transcript-dim', !!on);
  };

  const showBargeBanner = (on, message = 'Listening…') => {
    if (!FF.ui_pills || !bargeBannerEl) return;
    if (on) {
      bargeBannerEl.style.display = '';
      bargeBannerEl.textContent = message;
    } else {
      bargeBannerEl.style.display = 'none';
    }
  };

  const clearBargeResumeTimer = () => {
    if (state.bargeResumeTimer) {
      try { clearTimeout(state.bargeResumeTimer); } catch {}
      state.bargeResumeTimer = null;
    }
  };

  const suspendBarge = () => {
    if (!FF.barge_in) return;
    if (state.bargeInActive) return;
    if (!state.ws || state.ws.readyState !== 1) return;
    clearBargeResumeTimer();
    try { state.ws.send(JSON.stringify({ type: 'response.suspend_audio' })); } catch {}
    state.bargeInActive = true;
    state.bargeInEvents += 1;
    state.duckTransitions += 1;
    state.bargeDuckAt = performance.now();
    state.duckLatencyMs = 0;
    setTtsGain(0.2); // ~ -14 dB
    if (FF.ui_pills) {
      setTranscriptDim(true);
      showBargeBanner(true, 'Barge-in active');
      updateUiPills();
    }
  };

  const resumeBarge = (mode = 'resume') => {
    if (!FF.barge_in) return;
    if (!state.bargeInActive) return;
    clearBargeResumeTimer();
    if (state.ws && state.ws.readyState === 1 && mode === 'resume') {
      try { state.ws.send(JSON.stringify({ type: 'response.resume_audio' })); } catch {}
    } else if (state.ws && state.ws.readyState === 1 && mode === 'cancel') {
      if (state.responseActive === true) {
        try { state.ws.send(JSON.stringify({ type: 'response.cancel' })); } catch {}
      } else {
        log('cancel.skipped no-active-response');
      }
      state.cancelEvents += 1;
    }
    if (state.bargeDuckAt) {
      const latency = Math.round(performance.now() - state.bargeDuckAt);
      state.duckLatencyMs = latency > 0 ? latency : 0;
    }
    state.bargeDuckAt = 0;
    state.bargeInActive = false;
    if (mode === 'resume') state.resumeEvents += 1;
    setTtsGain(1.0);
    if (FF.ui_pills) {
      setTranscriptDim(false);
      showBargeBanner(false);
      updateUiPills();
    }
  };

  const scheduleBargeResume = () => {
    if (!FF.barge_in) return;
    clearBargeResumeTimer();
    state.bargeResumeTimer = setTimeout(() => resumeBarge('resume'), 300);
  };

  const initDriftTracker = (startMs) => {
    if (!FF.drift_comp || !dsp || typeof dsp.DriftTracker !== 'function') {
      state.driftTracker = null;
      state.driftPpm = 0;
      return null;
    }
    if (!state.driftTracker || typeof state.driftTracker.reset !== 'function') {
      state.driftTracker = new dsp.DriftTracker();
    }
    state.driftTracker.reset(startMs);
    state.driftPpm = 0;
    return state.driftTracker;
  };

  const teardownDriftTracker = () => {
    if (state.driftTracker && typeof state.driftTracker.reset === 'function') {
      state.driftTracker.reset();
    }
    state.driftTracker = null;
    state.driftPpm = 0;
  };

  const state = {
    commitWinMs: null,
    ws: null,
    mediaStream: null,
    audioContext: null,
    processor: null,
    connected: false,
    micActive: false,
    playCtx: null,
    playCursor: 0,
    serverInHz: 24000,
    sendPath: resolvedSendPath,
    sendDisplay: `send=${resolvedSendPath}`,
    storageEnabled,
    meterEl: null,
    meterFill: null,
    meterText: null,
    clipEl: null,
    deviceId: null,
    speakerId: null,
    outputSupported: !!(HTMLMediaElement.prototype && HTMLMediaElement.prototype.setSinkId),
    sinkDest: null,
    sinkEl: null,
    analyser: null,
    visRaf: null,
    autoStartMic: autoStart || FORCE_SIM,
    softwareGain,
    agcEnabled: agcEnabledDefault,
    agcGain: 1,
    targetRms: defaultTargetRms,
    gateRms: null, // dynamically set after ambient calibration
    stragglerTimer: null,
    idleCommitTimer: null,
    net: { rttMsEwma: 80, minCommitMs: 100, maxCommitMs: 150, serverInHz: 24000, audioOutHz: 24000, supportsBargeIn: false },
    _pingTimer: null,
    _lastPing: null,
    _seq: 0,
    simSource: null,
    _captureHandleFrame: null,
    firFilter: null,
    driftTracker: null,
    driftPpm: 0,
    workletStalls: 0,
    watchdogRecovers: 0,
    watchdogInterval: null,
    watchdogLastFrame: 0,
    watchdogRecoveryAt: 0,
    watchdogActiveMode: null,
    watchdogController: null,
    jitterMs: 0,
    playbackUnderruns: 0,
    crossfadeCount: 0,
    dcOffset: 0,
    upsampleMode: 'native',
    recvAudioChunks: 0,
    audioUnlocked: false,
    audioUnlockPending: false,
    ttsStreamDest: null,
    outEl: null,
    resumeAudioTimer: null,
    resumeAudioRetryTimer: null,
    firstTtsChunkSeen: false,
    ingressPauseUntil: 0,
    serverErrorRetrySent: false,
    serverErrorFallbackSent: false,
    resumeAudioOutstanding: false,
    resumeAudioArms: 0,
    resumeAudioCancels: 0,
    initialGreetingSent: false,
    initialGreetingTimer: null,
    wakeLockSentinel: null,
    ingressRateKbps: 0,
    lastIngressSample: null,
    partialActive: false,
    bargeInActive: false,
    bargeDuckAt: 0,
    bargeResumeTimer: null,
    bargeInEvents: 0,
    duckTransitions: 0,
    resumeEvents: 0,
    duckLatencyMs: 0,
    tailPadNeeded: false,
    cancelEvents: 0,
  };
  try { window.state = state; window.__qvtState = state; } catch {}
  try {
    window.__qvtSession = Object.assign({}, window.__qvtSession, {
      net: Object.assign({}, state.net, { commitWinMs: state.net.minCommitMs ?? 100, rttMsEwma: state.net.rttMsEwma }),
      playback: {
        jitterMs: state.jitterMs || 0,
        underruns: state.playbackUnderruns || 0,
        crossfadeCount: state.crossfadeCount || 0,
        upsampleMode: state.upsampleMode || 'native',
        dcOffset: state.dcOffset || 0,
        recvAudioChunks: state.recvAudioChunks || 0,
      },
      sendPath: state.sendPath,
    });
  } catch {}
  state.storageEnabled = storageEnabled;

  const ewma = (prev, value, alpha = 0.2) => (prev == null ? value : (alpha * value) + ((1 - alpha) * prev));
  const commitWindowMs = () => {
    const rtt = Math.max(0, Math.min(400, state.net.rttMsEwma || 0));
    const lower = state.net.minCommitMs ?? 100;
    const upper = state.net.maxCommitMs ?? 150;
    return Math.max(lower, Math.min(upper, 80 + Math.floor(rtt / 4)));
  };
  const applyNegotiation = (negotiation) => {
    if (!negotiation || typeof negotiation !== 'object') return;
    const next = {
      serverInHz: negotiation.serverInHz ?? state.net.serverInHz ?? 24000,
      minCommitMs: negotiation.minCommitMs ?? state.net.minCommitMs ?? 100,
      maxCommitMs: negotiation.maxCommitMs ?? state.net.maxCommitMs ?? 150,
      audioOutHz: negotiation.audioOutHz ?? state.net.audioOutHz ?? 24000,
      supportsBargeIn: negotiation.supportsBargeIn ?? state.net.supportsBargeIn ?? false,
      rttMsEwma: state.net.rttMsEwma ?? 80,
    };
    state.net = Object.assign({}, state.net, next);
    if (state.net.serverInHz) state.serverInHz = state.net.serverInHz;
    try { renderMetrics(); } catch {}
  };
  const normalizeEventType = (type) => (type || '').replace(/@v\d+$/, '');

  const startDiagPinger = () => {
    if (!FF.diag) return;
    if (state._pingTimer) return;
    state._pingTimer = setInterval(() => {
      try {
        state._lastPing = performance.now();
        state.ws?.send(JSON.stringify({ type: 'client.ping', ts: Date.now() }));
      } catch {}
    }, 5000);
  };

  const setConn = (ok) => {
    const pill = $('conn-pill');
    pill.textContent = ok ? 'Connected' : 'Disconnected';
    pill.className = 'pill ' + (ok ? 'ok' : 'err');
    $('btnMic').disabled = !ok;
    const btnConnect = $('btnConnect');
    if (btnConnect) {
      if (ok) {
        btnConnect.textContent = 'Disconnect';
        btnConnect.classList.remove('btn-brand');
        btnConnect.classList.add('btn-danger');
        btnConnect.dataset.state = 'connected';
        btnConnect.setAttribute('aria-pressed', 'true');
        try { btnConnect.setAttribute('data-testid', 'btnDisconnect'); } catch {}
      } else {
        btnConnect.textContent = 'Connect';
        btnConnect.classList.add('btn-brand');
        btnConnect.classList.remove('btn-danger');
        btnConnect.dataset.state = 'disconnected';
        btnConnect.setAttribute('aria-pressed', 'false');
        try { btnConnect.setAttribute('data-testid', 'btnConnect'); } catch {}
    // Keep Connect enabled even if SW controller is still active
      }
    }
  };

  async function connect() {
    if (state.ws) return;
    // Allow connect even if SW controller is active (we unregistered on load)
    try {
      log('Connecting to', wsUrl);
      if (diag) {
        try {
          log('ua', navigator.userAgent);
          if (navigator.mediaDevices?.getSupportedConstraints) {
            log('supportedConstraints', JSON.stringify(navigator.mediaDevices.getSupportedConstraints()));
          }
          if (document.visibilityState) log('visibility', document.visibilityState);
          if (navigator.permissions?.query) {
            navigator.permissions.query({ name: 'microphone' }).then(r => log('perm.microphone', r.state)).catch(()=>{});
          }
          navigator.mediaDevices?.enumerateDevices?.().then(list => {
            const info = list.map(d => ({ kind: d.kind, id: (d.deviceId||'').slice(0,8)+'…', label: d.label||'', groupId: (d.groupId||'').slice(0,8)+'…' }));
            log('devices', JSON.stringify(info));
          }).catch(()=>{});
        } catch {}
      }

      // Protocol v2 initialization - skip v1 WebSocket entirely
      if (useProtocolV2 && window.ProtocolV2) {
        try {
          log('[ProtocolV2] Initializing...');
          // Store v2 flag in state for later checks
          state.useProtocolV2 = true;
          state.protocolV2Client = null; // Will be initialized after audio context is ready
          state.connected = true;
          setConn(true);

          // Initialize audio context for Protocol v2
          if (!state.playCtx) {
            state.playCtx = new (window.AudioContext || window.webkitAudioContext)();
            state.playCursor = state.playCtx.currentTime;
          }
          if (!state.sinkDest) {
            state.sinkDest = new MediaStreamAudioDestinationNode(state.playCtx);
          }
          const outEl = state.outEl || document.getElementById('qvtOut');
          if (outEl && outEl.srcObject !== state.sinkDest.stream) {
            outEl.srcObject = state.sinkDest.stream;
          }
          if (outEl) {
            outEl.setAttribute('playsinline', '');
            outEl.autoplay = true;
            if (!state.audioUnlocked) outEl.muted = true;
            updateMuteTestid();
            state.outEl = outEl;
            state.sinkEl = outEl;
            try { outEl.play?.(); } catch {}
          }
          if (state.audioUnlockPending || (isIOS && !state.audioUnlocked)) {
            state.audioUnlockPending = true;
            unlockIOSAudio(state.playCtx);
          }

          // Create Protocol v2 client
          log('[ProtocolV2] Creating client with audio context');
          const p2 = new window.ProtocolV2(wsUrl, state.playCtx, {
            sampleRateHz: 24000,
            minMs: 140,
            proposeIntervalMs: 100
          });

          // Set up event handlers
          p2.onReady = () => {
            log('[ProtocolV2] Ready to send audio');
            state.protocolV2Ready = true;
          };

          p2.onFrameAck = (frameId) => {
            // Frame acknowledged
          };

          p2.onCommitAck = (ack) => {
            if (ack.status === 'accept') {
              log(`[ProtocolV2] Commit accepted: ${ack.ms}ms`);
            } else if (ack.status === 'defer') {
              log(`[ProtocolV2] Commit deferred: need ${ack.min_ms_needed}ms more`);
            }
          };

          p2.onError = (error) => {
            logError('[ProtocolV2]', error);
          };

          // Connect Protocol v2 client
          p2.connect().then(() => {
            log('[ProtocolV2] Connected');
            state.protocolV2Client = p2;
          }).catch((err) => {
            logError('[ProtocolV2] Connect failed', err);
            state.useProtocolV2 = false;
            state.protocolV2Client = null;
          });
        } catch (e) {
          log('[ProtocolV2] Init error:', e?.message || e);
          // Fall back to v1 on error
          state.useProtocolV2 = false;
        }
      }

      // Only create v1 WebSocket if NOT using Protocol v2
      if (!useProtocolV2) {
        const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        state.ws = ws;
        const rawSend = ws.send.bind(ws);
        ws.send = (payload) => {
          try {
            const tag = (payload instanceof ArrayBuffer || ArrayBuffer.isView?.(payload)) ? 'arraybuffer' : typeof payload;
            const length = typeof payload === 'string' ? payload.length : (payload && typeof payload === 'object' && 'byteLength' in payload ? payload.byteLength : ArrayBuffer.isView?.(payload) ? payload.byteLength : 0);
            console.info('[wire]', tag, length);
          } catch {}
          return rawSend(payload);
        };
        window.wsSend = (payload) => {
          if (!state.ws || state.ws.readyState !== 1) return false;
          try {
            const outbound = typeof payload === 'string' ? payload : JSON.stringify(payload);
            state.ws.send(outbound);
            return true;
          } catch (err) {
            log('wsSend error', err?.message || err);
            return false;
          }
        };
        state.connected = true;
        setConn(true);
        logFlow('WebSocket connected', `url=${wsUrl.split('/').slice(0,3).join('/')}`);
        logState('connection', { connected: true, readyState: ws.readyState, sendPath: state.sendPath });
        startDiagPinger();
        state.sendDisplay = `send=${state.sendPath}`;
        state.serverErrorRetrySent = false;
        state.serverErrorFallbackSent = false;
        state.firstTtsChunkSeen = false;
        pauseIngress(0);
        resetInitialGreeting();
        if (FF.ui_pills) {
          try {
            state.commitWinMs = commitWindowMs();
            updateUiPills();
          } catch {}
        }
        try { state.playCtx?.resume(); } catch {}
        metrics.recvAudioChunks = 0;
        state.recvAudioChunks = 0;
        // Send client state only when diagnostics enabled
        if (FF.diag) {
          try {
            const ver = (document.currentScript && document.currentScript.src) || 'qvt-web';
            ws.send(JSON.stringify({ type: 'client.state', client: { app_version: 'web-' + new Date().toISOString(), platform: navigator.userAgent, read_mode: false, capabilities: { binary_send_ok: (resolvedSendPath === 'binary'), barge_in_supported: true, mobile: isMobileSafari } } }));
          } catch {}
        }
        // Initialize playback context/output chain
        if (!state.playCtx) {
          state.playCtx = new (window.AudioContext || window.webkitAudioContext)();
          state.playCursor = state.playCtx.currentTime;
        }
        if (!state.sinkDest) {
          state.sinkDest = new MediaStreamAudioDestinationNode(state.playCtx);
        }
        const outEl = state.outEl || document.getElementById('qvtOut');
        if (outEl && outEl.srcObject !== state.sinkDest.stream) {
          outEl.srcObject = state.sinkDest.stream;
        }
        if (outEl) {
          outEl.setAttribute('playsinline', '');
          outEl.autoplay = true;
          if (!state.audioUnlocked) outEl.muted = true;
          updateMuteTestid();
          state.outEl = outEl;
          state.sinkEl = outEl;
          if (state.outputSupported && state.speakerId && typeof outEl.setSinkId === 'function') {
            outEl.setSinkId(state.speakerId).then(() => log('speaker set', state.speakerId)).catch(()=>{});
          }
          try { outEl.play?.(); } catch {}
        }
        if (state.audioUnlockPending || (isIOS && !state.audioUnlocked)) {
          state.audioUnlockPending = true;
          unlockIOSAudio(state.playCtx);
        }

        // Prepare jitter buffer for TTS playback (smooths network jitter)
        try {
          class TtsJitterBuffer {
            constructor(ctx, destNode, opts = {}) {
              const defaults = { startMs: 80, lowMs: 60, highMs: 180, crossfadeMs: 0, dcAlpha: 0.995, pbPolish: false, onMetrics: null };
              this.opts = Object.assign({}, defaults, opts);
              this.ctx = ctx;
              this.dest = destNode || ctx.destination;
              this.queue = [];
              this.bufferedSec = 0;
              this.started = false;
              this.gain = ctx.createGain();
              this.gain.connect(this.dest);
              this.pbPolish = !!this.opts.pbPolish;
              this.crossfadeMs = Math.max(0, this.opts.crossfadeMs || 0);
              this.dcAlpha = Number.isFinite(this.opts.dcAlpha) ? this.opts.dcAlpha : 0.995;
              this.onMetrics = typeof this.opts.onMetrics === 'function' ? this.opts.onMetrics : null;
              this.dcPrevX = 0;
              this.dcPrevY = 0;
              this.dcOffset = 0;
              this.lastTail = null;
              this.lastTailRate = null;
              this.crossfadeCount = 0;
              this.underruns = 0;
              this.upsampleMode = 'native';
              this.dynamicBoostMs = 0;
              this.boostUntil = 0;
              this.playCursor = ctx.currentTime;
            }
            setGainLinear(g) { try { this.gain.gain.value = g; } catch {} }
            reset() {
              this.queue.length = 0;
              this.bufferedSec = 0;
              this.started = false;
              this.lastTail = null;
              this.lastTailRate = null;
              this.crossfadeCount = 0;
              this.underruns = 0;
              this.upsampleMode = 'native';
              this.playCursor = this.ctx.currentTime;
              this._emitMetrics();
            }
            pushChunk(f32, sampleRate = 24000) {
              if (!f32 || !f32.length) return;
              let block = f32 instanceof Float32Array ? f32 : Float32Array.from(f32);
              if (this.pbPolish) {
                block = this._dcBlock(block);
              } else {
                const mean = block.length ? this._mean(block) : 0;
                this.dcOffset = 0.95 * this.dcOffset + 0.05 * mean;
              }
              const up = this._upsampleToContext(block, sampleRate);
              block = up.data;
              const usedRate = up.sampleRate;
              if (this.pbPolish && this.crossfadeMs > 0 && block.length > 1) {
                const fadeSamples = Math.min(block.length, Math.max(1, Math.round((this.crossfadeMs / 1000) * usedRate)));
                if (this.lastTail && this.lastTailRate === usedRate && this.lastTail.length && fadeSamples > 1) {
                  const tailLen = Math.min(fadeSamples, this.lastTail.length, block.length);
                  for (let i = 0; i < tailLen; i++) {
                    const t = i / tailLen;
                    block[i] = (this.lastTail[i] * (1 - t)) + (block[i] * t);
                  }
                  this.crossfadeCount += 1;
                }
                this.lastTail = block.slice(block.length - Math.min(fadeSamples, block.length));
                this.lastTailRate = usedRate;
              } else if (this.crossfadeMs === 0) {
                this.lastTail = null;
                this.lastTailRate = null;
              }
              const buf = this.ctx.createBuffer(1, block.length, usedRate);
              buf.copyToChannel(block, 0);
              this.queue.push({ buffer: buf, duration: block.length / usedRate });
              this.bufferedSec += block.length / usedRate;
              this._ensureDrain();
              this._emitMetrics();
            }
            _mean(arr) {
              let sum = 0;
              for (let i = 0; i < arr.length; i++) sum += arr[i];
              return arr.length ? sum / arr.length : 0;
            }
            _dcBlock(arr) {
              const alpha = this.dcAlpha;
              const out = new Float32Array(arr.length);
              let prevX = this.dcPrevX;
              let prevY = this.dcPrevY;
              let sum = 0;
              for (let i = 0; i < arr.length; i++) {
                const x = arr[i];
                const y = x - prevX + alpha * prevY;
                out[i] = y;
                prevX = x;
                prevY = y;
                sum += x;
              }
              this.dcPrevX = prevX;
              this.dcPrevY = prevY;
              const mean = arr.length ? sum / arr.length : 0;
              this.dcOffset = 0.95 * this.dcOffset + 0.05 * mean;
              return out;
            }
            _upsampleToContext(arr, sampleRate) {
              const target = this.ctx.sampleRate || sampleRate;
              if (!this.pbPolish || Math.abs(target - sampleRate) < 1) {
                this.upsampleMode = Math.abs(target - sampleRate) < 1 ? 'native' : 'context';
                return { data: arr, sampleRate };
              }
              if (Math.abs(target - (sampleRate * 2)) < 1) {
                const out = new Float32Array(arr.length * 2);
                for (let i = 0; i < arr.length; i++) {
                  const sample = arr[i];
                  const next = (i + 1 < arr.length) ? arr[i + 1] : sample;
                  const idx = i * 2;
                  out[idx] = sample;
                  out[idx + 1] = 0.5 * (sample + next);
                }
                this.upsampleMode = 'linear2x';
                return { data: out, sampleRate: target };
              }
              this.upsampleMode = 'context';
              return { data: arr, sampleRate };
            }
            _currentThresholds() {
              const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
              if (this.dynamicBoostMs > 0 && now > this.boostUntil) {
                this.dynamicBoostMs = Math.max(0, this.dynamicBoostMs - 10);
                if (this.dynamicBoostMs === 0) this.boostUntil = 0;
              }
              const boost = this.dynamicBoostMs;
              return {
                startMs: this.opts.startMs + boost,
                lowMs: this.opts.lowMs + boost,
                highMs: this.opts.highMs + boost,
              };
            }
            _recordUnderrun() {
              this.underruns += 1;
              if (this.pbPolish) {
                this.dynamicBoostMs = Math.min(120, (this.dynamicBoostMs || 0) + 20);
                this.boostUntil = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) + 30000;
              }
            }
            _ensureDrain() {
              const thresholds = this._currentThresholds();
              const bufferedMs = this.bufferedSec * 1000;
              if (!this.started && bufferedMs >= thresholds.startMs) {
                this._drain(thresholds);
              } else if (bufferedMs > thresholds.highMs && this.queue.length > 1) {
                while (this.queue.length > 1 && this.bufferedSec * 1000 > thresholds.highMs) {
                  const dropped = this.queue.shift();
                  this.bufferedSec = Math.max(0, this.bufferedSec - dropped.duration);
                }
              }
            }
            _drain(thresholds) {
              this.started = true;
              let when = Math.max(this.ctx.currentTime + 0.005, this.playCursor || this.ctx.currentTime);
              while (this.queue.length) {
                const item = this.queue.shift();
                const src = this.ctx.createBufferSource();
                src.buffer = item.buffer;
                src.connect(this.gain);
                src.start(when);
                when += item.duration;
              }
              this.playCursor = when;
              const aheadSec = Math.max(0, when - this.ctx.currentTime);
              this.bufferedSec = aheadSec;
              if (aheadSec * 1000 < thresholds.lowMs) {
                this.started = false;
                if (aheadSec * 1000 < 15) this._recordUnderrun();
              }
              this._emitMetrics();
            }
            _emitMetrics() {
              const aheadMs = Math.max(0, this.bufferedSec * 1000);
              if (this.onMetrics) {
                this.onMetrics({
                  jitterMs: aheadMs,
                  aheadSec: this.bufferedSec,
                  playbackUnderruns: this.underruns,
                  crossfadeCount: this.crossfadeCount,
                  dcOffset: this.dcOffset,
                  upsampleMode: this.upsampleMode,
                });
              }
            }
          }
          const dest = state.sinkDest || state.playCtx.destination;
          state.playbackUnderruns = 0;
          state.crossfadeCount = 0;
          state.dcOffset = 0;
          state.upsampleMode = 'native';
          state.recvAudioChunks = metrics.recvAudioChunks || 0;
          const iosPolish = FF.pb_polish && isIOS;
          const jbStart = FF.pb_polish ? (iosPolish ? 135 : 100) : 80;
          const jbLow = FF.pb_polish ? (iosPolish ? 110 : 70) : 60;
          const jbHigh = FF.pb_polish ? (iosPolish ? 280 : 220) : 180;
          const jbCrossfade = FF.pb_polish ? (iosPolish ? 8 : 5) : 0;
          const jbOpts = {
            startMs: jbStart,
            lowMs: jbLow,
            highMs: jbHigh,
            crossfadeMs: jbCrossfade,
            dcAlpha: 0.995,
            pbPolish: !!FF.pb_polish,
            onMetrics: (info) => {
              if (!info) return;
              state.jitterMs = Math.round(info.jitterMs || 0);
              state.playbackUnderruns = info.playbackUnderruns || 0;
              state.crossfadeCount = info.crossfadeCount || 0;
              state.dcOffset = Number.isFinite(info.dcOffset) ? info.dcOffset : 0;
              state.upsampleMode = info.upsampleMode || state.upsampleMode;
              state.recvAudioChunks = metrics.recvAudioChunks || state.recvAudioChunks || 0;
              if (Number.isFinite(info.aheadSec) && state.playCtx) {
                state.playCursor = state.playCtx.currentTime + info.aheadSec;
              }
              if (FF.pb_polish && (FF.diag || state.playbackUnderruns > 0)) {
                try { renderMetrics(); } catch {}
              }
              if (FF.ui_pills) updateUiPills();
            },
          };
          state.ttsJB = new TtsJitterBuffer(state.playCtx, dest, jbOpts);
          state.ttsGainNode = state.ttsJB.gain;
          if (!state.outEl && dest !== state.playCtx.destination) {
            try { state.ttsJB.gain.connect(state.playCtx.destination); } catch {}
          }
        } catch {}
        // Update session with desired voice and (best-effort) VAD threshold
        const rawThreshold = parseFloat($('vadThresh').value || '0.6');
        const threshold = Number.isFinite(rawThreshold) ? rawThreshold : 0.6;
        const turnDetectionPayload = {
          type: 'server_vad',
          threshold,
          prefix_ms: 200,
          silence_ms: 350,
        };
        const voiceChoice = getSelectedVoice();
        const mode = (window.ASIMO_SETTINGS && ASIMO_SETTINGS.recitationMode) ? "quran_recitation" : "default";
        const requested_vad_mode = (window.ASIMO_SETTINGS && ASIMO_SETTINGS.useServerVAD) ? "server" : "client";
        const sessionUpdate = {
          type: 'session.update',
          session: {
            voice: voiceChoice,
            turn_detection: turnDetectionPayload,
            input_audio_format: { type: 'pcm16', channels: 1, sample_rate: 24000 },
            output_audio_format: { type: 'pcm16', channels: 1, sample_rate: 24000 },
            requested_vad_mode: requested_vad_mode,
            mode: mode,
          }
        };
        try {
          window.wsSend?.(sessionUpdate) || ws.send(JSON.stringify(sessionUpdate));
          try { log('=> session.update keys', Object.keys(sessionUpdate.session).join(',')); } catch {}
        } catch {}
        try {
          const wantSmoke = FF.smoke || (urlParams.get('smoke') === '1');
          if (wantSmoke) {
            const greetingSent = sendResponseCreate({
              modalities: ['audio'],
              instructions: 'Hello! This is an audio check.',
              metadata: { kind: 'smoke' },
            });
            if (greetingSent) state.initialGreetingSent = true;
          }
        } catch (err) {
          if (diag) log('initial greeting error', err?.message || err);
        }
        window.__qvtSession.sendPath = resolvedSendPath;

        // Prepare/select devices after connection
        initDevices().then(async () => {
          // Auto-select by label if requested
          if (urlDeviceLabel) {
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              const inputs = devices.filter(d => d.kind==='audioinput');
              const match = inputs.find(d => (d.label||'').toLowerCase().includes(urlDeviceLabel.toLowerCase()));
              if (match) { state.deviceId = match.deviceId; log('deviceMatch', `selected '${match.label}'`); }
              else { log('deviceMatch', `no match for '${urlDeviceLabel}'`); }
            } catch {}
          }
        }).catch(()=>{});
        // Auto-start mic after connection if enabled
        if (state.autoStartMic) {
          // Slight delay ensures WS is stable
          setTimeout(() => { if (!state.micActive) startMic(); }, 150);
        }
      };
      ws.onmessage = async (ev) => {
        // Support both text JSON events and binary PCM16 frames
        if (typeof ev.data === 'string') {
          const raw = ev.data;
          try {
            const msg = JSON.parse(raw);
            handleServerEvent(msg, raw);
          } catch {
            log('<=', raw.slice(0, 160));
          }
        } else {
          try {
            const arr = ev.data instanceof Blob ? await ev.data.arrayBuffer() : ev.data;
            if (arr && arr.byteLength) {
              const i16 = new Int16Array(arr);
              const f32 = new Float32Array(i16.length);
              for (let i=0;i<i16.length;i++) f32[i] = Math.max(-1, i16[i] / 32768);
              try { metrics.recvAudioChunks += 1; metrics.recvAudioBytes += i16.byteLength; renderMetrics(); if (diag) log('delta(binary)', String(i16.byteLength)); } catch {}
              state.recvAudioChunks = metrics.recvAudioChunks;
              try { window.__qvtMetrics.recvAudioChunks = metrics.recvAudioChunks; } catch {}
              try { console.info('[audio] enqueue delta', { recvAudioChunks: state.recvAudioChunks, transport: 'binary' }); } catch {}
              enqueuePlayback(f32, state.serverInHz || 24000);
            }
          } catch (e) { log('audio.binary.error', String(e)); }
        }
      };
      ws.onerror = (e) => log('WS error', e.message || e);
      ws.onclose = () => {
        log('WebSocket closed');
        if (state.ws === ws) {
          state.ws = null; state.connected = false; setConn(false);
          if (state.micActive) stopMic();
          if (state._pingTimer) { clearInterval(state._pingTimer); state._pingTimer = null; }
          state._lastPing = null;
          clearResumeAudioTimer('reset');
          clearIdleCommit();
          if (state.ttsJB && typeof state.ttsJB.reset === 'function') {
            try { state.ttsJB.reset(); } catch {}
          }
          state.ttsJB = null;
          state.ttsGainNode = null;
          state.jitterMs = 0;
          state.playCursor = state.playCtx ? state.playCtx.currentTime : 0;
          state.playbackUnderruns = 0;
          state.crossfadeCount = 0;
          state.dcOffset = 0;
          state.upsampleMode = 'native';
          state.recvAudioChunks = 0;
          if (state.outEl) {
            try { state.outEl.muted = true; } catch {}
            updateMuteTestid();
            try { state.outEl.srcObject = null; } catch {}
          }
          state.sinkDest = null;
          state.audioUnlocked = false;
          state.audioUnlockPending = false;
          resetInitialGreeting();
        }
      };
      } // End of if (!useProtocolV2)
    } catch (e) {
      log('Connect failed', e.message || e);
    }
  }

  const startConnection = async () => {
    // Do not block connection due to service worker; proceed
    if (!unlockReady) {
      if (unlockOverlayEl) unlockOverlayEl.classList.add('active');
      return;
    }
    if (state.connected || (state.ws && state.ws.readyState === 1)) return;
    try { await unlockIOSAudio(state.playCtx || state.audioContext || null); } catch {}
    await connect();
  };

  function appendTranscript(text, isFinal) {
    const el = $('transcript'); if (!el) return;
    el.textContent += text;
    metrics.recvTranscriptChars += text.length;
    renderMetrics();
    if (isFinal) el.textContent += '\n';
  }

  function base64ToFloat32(b64, sampleRate) {
    const bin = atob(b64);
    const len = bin.length;
    const out = new Int16Array(len / 2);
    for (let i = 0, j = 0; i < len; i += 2, j++) {
      const lo = bin.charCodeAt(i);
      const hi = bin.charCodeAt(i + 1);
      let val = (hi << 8) | lo;
      if (val & 0x8000) val = val - 0x10000;
      out[j] = val;
    }
    const f32 = new Float32Array(out.length);
    for (let i = 0; i < out.length; i++) f32[i] = Math.max(-1, out[i] / 32768);
    return { f32, sampleRate };
  }

  function enqueuePlayback(f32, sr) {
    if (!state.playCtx) return;
    try {
      state.recvAudioChunks = metrics.recvAudioChunks || state.recvAudioChunks || 0;
      clearResumeAudioTimer('chunk');
      if (state.audioUnlockPending || (isIOS && !state.audioUnlocked)) {
        unlockIOSAudio(state.playCtx);
      }
      // If jitter buffer exists, push to it; else fall back to direct scheduling
      if (state.ttsJB && typeof state.ttsJB.pushChunk === 'function') {
        state.ttsJB.pushChunk(f32, sr);
        if (FF.ui_pills) updateUiPills();
        return;
      }
      if (state.ttsJB && typeof state.ttsJB.pushFloat32Mono24k === 'function' && sr === 24000) {
        state.ttsJB.pushFloat32Mono24k(f32);
        if (FF.ui_pills) updateUiPills();
        return;
      }
      const buf = state.playCtx.createBuffer(1, f32.length, sr);
      buf.copyToChannel(f32, 0);
      const src = state.playCtx.createBufferSource();
      src.buffer = buf;
      if (state.outputSupported && state.sinkDest) src.connect(state.sinkDest);
      else src.connect(state.playCtx.destination);
      const when = Math.max(state.playCtx.currentTime + 0.01, state.playCursor);
      src.start(when);
      state.playCursor = when + buf.duration;
      const aheadSec = Math.max(0, state.playCursor - state.playCtx.currentTime);
      state.jitterMs = Math.round(aheadSec * 1000);
      if (FF.ui_pills) updateUiPills();
    } catch (e) { log('playback error', e.message || e); }
  }

  function handleServerEvent(msg, raw) {
    const rawType = msg.type || '';
    const t = normalizeEventType(rawType);
    msg.type = t;
    if (rawType !== t) {
      try { console.info('[event] normalized', { raw: rawType, type: t }); } catch {}
    }
    const traceId = msg.trace_id || msg.traceId;
    if (traceId) {
      state.traceId = traceId;
      try { window.__qvtSession = Object.assign(window.__qvtSession || {}, { traceId }); } catch {}
      try { window.__qvtMetrics = Object.assign(window.__qvtMetrics || {}, { traceId }); } catch {}
    }
    // Handle new output audio delta family (when modalities include audio+text)
    if (t === 'response.output_audio.delta') {
      try {
        const b64 = msg.delta || msg.audio || msg.bytes || msg.data || '';
        if (typeof b64 === 'string' && b64.length) {
          if (!state.responseActive) { state.responseActive = true; try { log('response.begin'); } catch {} }
          const bin = atob(b64);
          const i16 = new Int16Array(bin.length / 2);
          for (let i = 0; i < i16.length; i++) {
            const lo = bin.charCodeAt(i*2), hi = bin.charCodeAt(i*2+1);
            let v = (hi << 8) | lo; if (v & 0x8000) v -= 0x10000; i16[i] = v;
          }
          const f32 = new Float32Array(i16.length);
          for (let i=0;i<i16.length;i++) f32[i] = Math.max(-1, i16[i] / 32768);
          try { metrics.recvAudioChunks += 1; metrics.recvAudioBytes += i16.byteLength; renderMetrics(); if (diag) log('delta(output_audio)', String(b64.length)); } catch {}
          state.recvAudioChunks = metrics.recvAudioChunks;
          try { window.__qvtMetrics.recvAudioChunks = metrics.recvAudioChunks; } catch {}
          try { console.info('[audio] enqueue delta', { recvAudioChunks: state.recvAudioChunks }); } catch {}
          if (!state.firstTtsChunkSeen) {
            state.firstTtsChunkSeen = true;
            activateOutput();
            try {
              const el = ensureOutputElement();
              console.info('[audio] first chunk seen', {
                paused: !!(el && el.paused),
                currentTime: el ? Number(el.currentTime.toFixed(3)) : null,
              });
            } catch {}
          } else {
            activateOutput();
          }
          state.sendDisplay = `send=${state.sendPath}`;
          state.serverErrorRetrySent = false;
          state.serverErrorFallbackSent = false;
          pauseIngress(0);
          enqueuePlayback(f32, msg.sample_rate_hz || 24000);
        }
      } catch (e) { log('audio.decode.error', String(e)); }
      return;
    }
    switch (t) {
      case 'server.pong': {
        if (state._lastPing != null) {
          const rtt = performance.now() - state._lastPing;
          state.net.rttMsEwma = ewma(state.net.rttMsEwma, rtt);
          renderMetrics();
        }
        break;
      }
      case 'session.started': {
        applyNegotiation(msg.negotiation);
        exportNegotiation(msg.negotiation);
        try { window.__qvtSession.lastType = 'session.started'; } catch {}
        startDiagPinger();
        if (FF.ui_pills) updateUiPills();
        if (FF.smoke) queueInitialGreeting();
        break;
      }
      case 'session.audio_status':
        if (msg.input_sample_rate_hz) state.serverInHz = msg.input_sample_rate_hz;
        log('<= audio_status', `in=${msg.input_sample_rate_hz} out=${msg.output_sample_rate_hz}`);
        if (FF.smoke) queueInitialGreeting();
        break;
      case 'personalized_greeting':
        log('<= greeting', JSON.stringify(msg).slice(0, 160));
        break;
      case 'error':
        log('<= ERROR', JSON.stringify(msg).slice(0, 200));
        break;
      case 'server.error@v1': {
        const cause = msg.cause || (msg.error && (msg.error.code || msg.error.type)) || 'upstream';
        const errCode = (msg.error && (msg.error.code || msg.error.type)) || msg.upstream_cause || cause;
        state.sendDisplay = `ERR:${errCode}`;
        // Treat commit-too-small as informational: hold until threshold
        if (/commit_empty|commit.*too.*small/i.test(String(errCode))) {
          try {
            commitRequiredBytes = Math.max(commitRequiredBytes || 0, MIN_COMMIT_BYTES);
            log('commit.deferred (upstream)', `need=${commitRequiredBytes} have=${bytesSinceCommit}`);
          } catch {}
          // brief pause then resume
          pauseIngress(250);
          break;
        }
        pauseIngress(1000);
        updateUiPills();
        try {
          console.info('[audio] server.error', {
            cause,
            upstreamCause: msg.upstream_cause || msg.upstreamCause,
            traceId: msg.trace_id || msg.traceId,
            detail: msg.error,
          });
        } catch {}
        clearResumeAudioTimer('reset');
        state.resumeAudioOutstanding = false;
        syncWatchdogMetrics();
        const voiceChoice = getSelectedVoice();
        if (!state.serverErrorRetrySent) {
          state.serverErrorRetrySent = true;
          const sent = sendResponseCreate({
            instructions: 'Encountered an upstream error. Please try responding again audibly.',
            audioVoice: voiceChoice,
          });
          if (sent) state.initialGreetingSent = true;
        } else if (!state.serverErrorFallbackSent) {
          state.serverErrorFallbackSent = true;
          sendResponseCreate({
            modalities: ['text'],
            instructions: '(Fallback) Please confirm you can hear me.',
            fallback: true,
          });
        }
        break;
      }
      case 'ingress.commit_deferred':
      case 'ingress.commit_deferred@v1': {
        const need = Number(msg.needed_bytes || msg.neededBytes) || MIN_COMMIT_BYTES;
        const have = Number(msg.have_bytes || msg.haveBytes) || 0;
        commitRequiredBytes = Math.max(commitRequiredBytes || 0, need);
        try { log('commit.deferred', `need=${need} have=${have}`); } catch {}
        break;
      }
      case 'response.created':
        $('transcript').textContent = '';
        state.responseActive = true;
        state.partialActive = false;
        logFlow('Response started', 'responseActive=true');
        logState('response', { active: true, partial: false, ttsChunkSeen: state.firstTtsChunkSeen });
        updateUiPills();
        break;
      // Ignore raw OpenAI transcript deltas to avoid double-printing;
      // the proxy also emits transcript_stream which we display.
      case 'response.audio_transcript.delta':
        break;
      case 'response.audio_transcript.done': {
        appendTranscript('\n', true);
        state.partialActive = false;
        updateUiPills();
        break;
      }
      case 'transcript_stream': { // compatibility
        const text = msg.delta || '';
        appendTranscript(text, !!msg.is_final);
        state.partialActive = !msg.is_final;
        updateUiPills();
        break;
      }
      case 'response.output_item.added':
        // Some models may not emit response.created early; treat first output item as active
        state.responseActive = true;
        state.partialActive = true;
        if (FF.ui_pills) updateUiPills();
        state.firstTtsChunkSeen = false;
        clearResumeAudioTimer('reset');
        if (FF.pb_polish) {
          const baselineChunks = state.recvAudioChunks || metrics.recvAudioChunks || 0;
          state.resumeAudioOutstanding = true;
          state.resumeAudioArms = (state.resumeAudioArms || 0) + 1;
          syncWatchdogMetrics();
          try { console.info('[audio] resume guard armed', { baselineChunks }); } catch {}
          state.resumeAudioTimer = setTimeout(() => {
            try {
              const currentChunks = state.recvAudioChunks || metrics.recvAudioChunks || 0;
              if (currentChunks <= baselineChunks && state.ws?.readyState === 1) {
                state.ws.send(JSON.stringify({ type: 'response.resume_audio' }));
                log('=> response.resume_audio (auto)');
                activateOutput({ resumeAudio: true });
                try {
                  const el = ensureOutputElement();
                  console.info('[audio] resume guard fired', {
                    baselineChunks,
                    currentChunks,
                    paused: !!(el && el.paused),
                  });
                } catch {}
                if (!state.resumeAudioRetryTimer) {
                  state.resumeAudioRetryTimer = setTimeout(() => {
                    try {
                      const latestChunks = state.recvAudioChunks || metrics.recvAudioChunks || 0;
                      if (state.ws?.readyState === 1 && latestChunks <= baselineChunks) {
                        sendResponseCreate({
                          modalities: ['audio'],
                          instructions: 'Please continue audibly.',
                          metadata: { kind: 'resume-retry' },
                        });
                      }
                    } catch {}
                    state.resumeAudioRetryTimer = null;
                  }, 1500);
                }
              }
            } catch {}
            state.resumeAudioTimer = null;
            state.resumeAudioOutstanding = false;
            syncWatchdogMetrics();
          }, 750);
        }
        break;
      case 'response.output_item.done':
        state.responseActive = false;
        state.partialActive = false;
        clearResumeAudioTimer('reset');
        updateUiPills();
        break;
      case 'response.audio.delta': {
        // Support multiple possible payload keys
        const b64 = msg.delta || msg.audio || msg.data || msg.chunk || msg.output_audio_chunk;
        if (state.outEl && state.audioUnlocked) {
          try { state.outEl.muted = false; } catch {}
          updateMuteTestid();
        }
        if (b64 && typeof b64 === 'string') {
          const { f32 } = base64ToFloat32(b64, msg.sample_rate_hz || 24000);
          metrics.recvAudioChunks += 1; metrics.recvAudioBytes += (b64.length * 3) / 4; renderMetrics();
          state.recvAudioChunks = metrics.recvAudioChunks;
          try { window.__qvtMetrics.recvAudioChunks = metrics.recvAudioChunks; } catch {}
          try { console.info('[audio] enqueue delta', { recvAudioChunks: state.recvAudioChunks, transport: 'json' }); } catch {}
          if (!state.firstTtsChunkSeen) {
            state.firstTtsChunkSeen = true;
            activateOutput();
          } else {
            activateOutput();
          }
          state.sendDisplay = `send=${state.sendPath}`;
          state.serverErrorRetrySent = false;
          state.serverErrorFallbackSent = false;
          pauseIngress(0);
          enqueuePlayback(f32, msg.sample_rate_hz || 24000);
        }
        break;
      }
      case 'session.updated': {
        if (msg.negotiation) {
          applyNegotiation(msg.negotiation);
          exportNegotiation(msg.negotiation);
        }
        try { window.__qvtSession.lastType = 'session.updated'; } catch {}
        const ia = msg.ingress_audio || msg.ingress;
        if (ia && typeof ia === 'object') {
          log('<= ingress', `chunks=${ia.chunks} bytes=${ia.bytes}`);
          try { state.lastIngress = { chunks: ia.chunks||0, bytes: ia.bytes||0, ts: ia.last_ts||Date.now() }; } catch {}
          if (FF.ui_pills) {
            try {
              const now = Date.now();
              const prev = state.lastIngressSample;
              const bytes = ia.bytes || 0;
              if (prev) {
                const deltaBytes = bytes - (prev.bytes || 0);
                const deltaMs = Math.max(200, now - (prev.ts || now - 1));
                const bytesPerSec = (deltaBytes / deltaMs) * 1000;
                const kbps = Math.max(0, (bytesPerSec * 8) / 1000);
                state.ingressRateKbps = kbps;
              }
              state.lastIngressSample = { bytes, ts: now };
            } catch {}
          }
          try {
            window.__qvtMetrics = Object.assign({}, window.__qvtMetrics, {
              ingress: { chunks: ia.chunks || 0, bytes: ia.bytes || 0, ts: ia.last_ts || Date.now() },
              egress: { recvAudioChunks: state.recvAudioChunks || 0 },
            });
            window.__qvtSession = Object.assign({}, window.__qvtSession || {}, {
              ingress: { chunks: ia.chunks || 0, bytes: ia.bytes || 0, ts: ia.last_ts || Date.now() },
            });
          } catch {}
          try {
            const pill = $('ingress-pill');
            if (pill) {
              const kb = Math.round((ia.bytes || 0) / 1024);
              pill.textContent = `Ingress ${ia.chunks || 0} / ${kb} KB`;
            }
          } catch {}
          updateUiPills();
          try {
            console.info('[ingress] session.update', {
              chunks: ia.chunks || 0,
              bytes: ia.bytes || 0,
              recvAudioChunks: state.recvAudioChunks || 0,
            });
          } catch {}
        }
        if (FF.ui_pills) updateUiPills();
        break;
      }
      case 'response.audio.done':
      case 'response.output_audio.done':
      case 'response.done':
        logFlow('Response completed', 'responseActive=false');
        logState('response', { active: false, partial: false, duration: state.lastTurn?.durationMs || 'unknown' });
        try { if (state.ttsGainNode) state.ttsGainNode.gain.value = 1.0; } catch {}
        state.responseActive = false;
        state.partialActive = false;
        clearResumeAudioTimer('reset');
        updateUiPills();
        break;
      case 'response.cancelled':
      case 'response.canceled':
        state.responseActive = false;
        state.partialActive = false;
        clearResumeAudioTimer('reset');
        updateUiPills();
        try { if (state.ttsGainNode) state.ttsGainNode.gain.value = 1.0; } catch {}
        break;
      case 'response.cancelled':
      case 'response.canceled':
      case 'response.cancel':
        log('<=', t);
        try { if (state.ttsGainNode) state.ttsGainNode.gain.value = 1.0; } catch {}
        clearResumeAudioTimer('reset');
        break;
      case 'session.no_audio_ingress':
      case 'session.no_audio_ingress@v1':
        log('<= no_audio_ingress', JSON.stringify(msg));
        state.eventCounts = state.eventCounts || {}; state.eventCounts['no_audio_ingress'] = (state.eventCounts['no_audio_ingress']||0)+1;
        break;
      case 'input_audio_buffer.speech_started':
      case 'input_audio_buffer.speech_ended':
        log('<=', t, JSON.stringify({ ts: msg.ts, threshold: msg.vad_threshold }));
        if (t === 'input_audio_buffer.speech_started') {
          if (FF.barge_in) {
            state.tailPadNeeded = false;
            suspendBarge();
          } else {
            setTtsGain(0.25);
          }
        } else {
          if (FF.barge_in) {
            state.tailPadNeeded = true;
            scheduleBargeResume();
          } else {
            setTtsGain(1.0);
          }
        }
        // Optional auto-commit flow on silence — allow >= ~96ms on speech stop, else wait (v1 only)
        if (!state.useProtocolV2 && t === 'input_audio_buffer.speech_ended' && $('autoCommit')?.checked) {
          try {
            // Allow slightly lower threshold on explicit speech stop (>= ~96ms / 4608B)
            const tol = 4608; // ~96ms @ 24k/pcm16
            const need = Math.max(MIN_COMMIT_BYTES, commitRequiredBytes || 0);
            if (bytesSinceCommit >= tol) {
              if (bytesSinceCommit < need) commitRequiredBytes = need; // future commits use stricter floor
              const hadBytes = bytesSinceCommit;
              if (sendAudioCommit('speech_stop')) log('commit(reason=speech_stop)', `have=${hadBytes} need=${need}`);
            } else {
              log('commit.suppressed', `reason=speech_stop have=${bytesSinceCommit} need=${tol}`);
            }
          } catch {}
        }
        break;
      case 'input_audio_buffer.committed':
        // CRITICAL FIX: Reset counters when OpenAI acknowledges commit
        // OpenAI clears its buffer after committing, so we must stop sending commits
        // until new audio accumulates
        framesSinceCommit = 0;
        msSinceLastCommit = 0;
        bytesSinceCommit = 0;
        state.appendsSinceCommit = 0;
        commitRequiredBytes = 0;
        log('✅ commit acknowledged by OpenAI, counters reset');
        break;
      case 'input_audio_buffer.cleared': {
        // Reset commit gating counters when server clears buffer
        framesSinceCommit = 0;
        msSinceLastCommit = 0;
        bytesSinceCommit = 0;
        break;
      }
      case 'commit_ready@v1': {
        // Backend-controlled commit protocol: backend signals when buffer is ready
        try {
          const backendBytes = raw.bytes_buffered || 0;
          const backendDuration = raw.duration_ms || 0;
          log('commit_ready@v1', `backend=${backendBytes}B (${backendDuration}ms), local=${bytesSinceCommit}B`);

          // Immediately send commit - backend has validated buffer is ready
          state.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));

          // Reset local counters
          framesSinceCommit = 0;
          msSinceLastCommit = 0;
          bytesSinceCommit = 0;
          state.appendsSinceCommit = 0;
          state.lastCommitReason = 'backend_ready';

          log('✓ [COMMIT] Responded to backend commit_ready', `sent=${backendBytes}B`);
        } catch (e) {
          log('ERROR', 'Failed to respond to commit_ready', e);
        }
        break;
      }
      default:
        // Keep concise, but log unknown types (more verbose in diag)
        if (rawType) {
          if (diag) log('UNHANDLED', rawType, raw.slice(0, 160));
          else log('<=', rawType);
        } else log('<=', raw.slice(0, 160));
    }
  }

  function floatTo16BitPCM(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      let s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out.buffer;
  }

  // Lightweight smoothing decimator (48k -> 24k) tuned for speech.
  function downsample48kTo24k(float32) {
    const ratio = 2;
    const len = Math.floor(float32.length / ratio);
    const out = new Float32Array(len);
    let prev = 0;
    for (let i = 0, j = 0; i < len; i++, j += ratio) {
      const current = float32[j];
      out[i] = (0.25 * prev) + (0.75 * current);
      prev = current;
    }
    return out;
  }

  function resampleWithDelta(src, delta) {
    if (!delta) return src;
    const N = src.length;
    if (N < 2) return src;
    const M = N + delta;
    if (M < 1) return src;
    const out = new Float32Array(M);
    const ratio = (N - 1) / (M - 1);
    for (let i = 0; i < M; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const next = idx + 1 < N ? src[idx + 1] : src[idx];
      out[i] = src[idx] + frac * (next - src[idx]);
    }
    return out;
  }

  function pcm16BytesToFloat32(buffer) {
    const view = new DataView(buffer);
    const len = buffer.byteLength / 2;
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = view.getInt16(i * 2, true) / 0x8000;
    }
    return out;
  }

  function upsample24kTo48k(float32) {
    const out = new Float32Array(float32.length * 2);
    for (let i = 0, j = 0; i < float32.length; i++, j += 2) {
      const sample = float32[i];
      out[j] = sample;
      out[j + 1] = sample;
    }
    return out;
  }

  function float32ToPCM16(float32) {
    const outBuf = new ArrayBuffer(float32.length * 2);
    const dv = new DataView(outBuf);
    let clipped = false;
    for (let i = 0; i < float32.length; i++) {
      let s = Math.max(-1, Math.min(1, float32[i]));
      if (Math.abs(s) >= 0.98) clipped = true;
      const val = s < 0 ? (s * 0x8000) : (s * 0x7FFF);
      dv.setInt16(i * 2, val, true); // little-endian
    }
    // UI meter update based on RMS/peak of float32
    try {
      let peak = 0, sum = 0, n = float32.length;
      for (let i = 0; i < n; i++) { const s = Math.abs(float32[i]); peak = Math.max(peak, s); sum += s*s; }
      const rms = Math.sqrt(sum / Math.max(1, n));
      const pct = Math.min(100, Math.round(peak * 100));
      if (!state.meterFill) { state.meterFill = $('meterFill'); state.meterText = $('meterText'); state.clipEl = $('clipWarn'); }
      if (state.meterFill) state.meterFill.style.width = pct + '%';
      if (state.meterText) state.meterText.textContent = `level: ${pct}% (rms ${rms.toFixed(2)})`;
      if (state.clipEl) state.clipEl.style.display = (clipped || peak > 0.98) ? '' : 'none';
      state.lastPeakRms = { peak, rms };
      // Silence detector (pre-downsample). If sustained silence, show warning.
      const warn = $('silenceWarn');
      if (rms < 0.005 && peak < 0.01) { metrics.silenceFrames++; }
      else { metrics.silenceFrames = 0; }
      if (warn) warn.style.display = metrics.silenceFrames > 20 ? '' : 'none';
    } catch {}
    return outBuf;
  }

  function sendTailPad() {
    if (!FF.barge_in || !state.tailPadNeeded) return;
    if (!state.ws || state.ws.readyState !== 1) return;
    if (state.ingressPauseUntil && Date.now() < state.ingressPauseUntil) return;
    const hz = state.serverInHz || 24000;
    const durationMs = 50;
    const samples = Math.max(1, Math.round(hz * (durationMs / 1000)));
    const silence = new Float32Array(samples);
    const pcmBuf = float32ToPCM16(silence);
    try {
      if (sendAudioFrameBuffer(pcmBuf)) {
        metrics.sentAppends += 1;
        metrics.sentBytesAudio += pcmBuf.byteLength;
        state.lastAudioSentAt = Date.now();
        renderMetrics();
      }
    } catch {}
  }

  function sendAudioCommit(reason = 'auto') {
    const counters = { frames: framesSinceCommit, ms: msSinceLastCommit, bytes: bytesSinceCommit };
    if (!state.ws || state.ws.readyState !== 1) {
      logCommit('blocked - ws not ready', counters);
      return false;
    }
    clearIdleCommit();
    // Block commits while a response is actively speaking (no barge-in by default)
    if (state.responseActive) {
      logCommit('skipped - response active', counters);
      return false;
    }
    // Guard empties
    if (bytesSinceCommit <= 0) {
      logCommit('suppressed - empty buffer', counters);
      return false;
    }
    // Enforce ≥120ms/5760B by default; allow server-raised threshold via commitRequiredBytes
    const needBytes = Math.max(MIN_COMMIT_BYTES, commitRequiredBytes || 0);
    if (framesSinceCommit < MIN_COMMIT_FRAMES || msSinceLastCommit < MIN_COMMIT_MS || bytesSinceCommit < needBytes) {
      logCommit(`skipped - need≥${MIN_COMMIT_FRAMES}fr ${MIN_COMMIT_MS}ms ${needBytes}B`, counters);
      return false;
    }
    if (FF.barge_in && state.tailPadNeeded) {
      sendTailPad();
      state.tailPadNeeded = false;
    }
    try {
      logCommit(`SENT (${reason}) need=${needBytes}B`, counters);
      state.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      // Reset gating counters
      try {
        const prevAppends = state.appendsSinceCommit || 0;
        window.__qvtMetrics = Object.assign(window.__qvtMetrics || {}, { lastCommit: { reason, appendsBeforeCommit: prevAppends, bytesBeforeCommit: bytesSinceCommit, ts: Date.now() } });
      } catch {}
      framesSinceCommit = 0;
      msSinceLastCommit = 0;
      state.appendsSinceCommit = 0;
      bytesSinceCommit = 0;
      state.lastCommitReason = reason;
      if (FF.barge_in) {
        clearBargeResumeTimer();
        // Resume TTS after commit rather than cancel unless user explicitly stops
        if (state.bargeInActive) resumeBarge('resume'); else setTtsGain(1.0);
        state.tailPadNeeded = false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function sendAudioFrameBuffer(pcmBuf) {
    // DEBUG: Log every call to see what's happening
    const debugOnce = !window.__debugLoggedOnce;
    if (debugOnce) {
      window.__debugLoggedOnce = true;
      log(`[DEBUG] sendAudioFrameBuffer called. useProtocolV2=${state.useProtocolV2}, client=${!!state.protocolV2Client}, ready=${state.protocolV2Ready}`);
    }

    // Use Protocol v2 if available
    if (state.useProtocolV2) {
      // Debug which conditions are failing
      if (!state.protocolV2Client) {
        log('[ProtocolV2] DEBUG: No client yet');
        return false;
      }
      if (!state.protocolV2Ready) {
        log('[ProtocolV2] DEBUG: Not ready yet');
        return false;
      }

      try {
        const base64Audio = arrayBufferToBase64(pcmBuf);
        const timestamp = Date.now();
        state.protocolV2Client.sendFrame(base64Audio, timestamp);

        // Track metrics (Protocol v2 handles commits internally)
        framesSinceCommit += 1;
        msSinceLastCommit += 20;
        state.appendsSinceCommit = (state.appendsSinceCommit || 0) + 1;
        try { bytesSinceCommit += pcmBuf.byteLength || 0; } catch { bytesSinceCommit = 0; }

        // Log progress
        if (framesSinceCommit % 100 === 0) {
          logAudio(`[ProtocolV2] capture progress: ${framesSinceCommit}fr (${msSinceLastCommit}ms, ${bytesSinceCommit}B)`);
        }
        return true;
      } catch (err) {
        logError('[ProtocolV2] sendFrame error', err);
        // Fall back to v1 on error
        state.useProtocolV2 = false;
        state.protocolV2Client = null;
      }
    }

    // v1 protocol (original code)
    if (!state.ws || state.ws.readyState !== 1) return false;
    try {
      if (resolvedSendPath === 'json+seq' || resolvedSendPath === 'json') {
        // Always include a monotonically increasing sequence for JSON appends
        try { state._seq = (state._seq || 0) + 1; } catch { state._seq = 1; }
        state.ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          seq: state._seq,
          audio: arrayBufferToBase64(pcmBuf),
        }));
      } else {
        state.ws.send(pcmBuf);
      }
      state.sendPath = resolvedSendPath;
      state.sendDisplay = `send=${resolvedSendPath}`;
      try {
        window.__qvtMetrics = Object.assign(window.__qvtMetrics || {}, { sendPath: resolvedSendPath });
        window.__qvtSession = Object.assign(window.__qvtSession || {}, { sendPath: resolvedSendPath });
      } catch {}
      scheduleIdleCommit('frame');
      // Each append is one 20ms frame at 24k; track commit gating
      framesSinceCommit += 1;
      msSinceLastCommit += 20;
      state.appendsSinceCommit = (state.appendsSinceCommit || 0) + 1;
      try { bytesSinceCommit += pcmBuf.byteLength || 0; } catch { bytesSinceCommit = 0; }
      // Log audio capture progress every 100 frames (~2s)
      if (framesSinceCommit % 100 === 0) {
        logAudio(`capture progress: ${framesSinceCommit}fr (${msSinceLastCommit}ms, ${bytesSinceCommit}B)`);
      }
      return true;
    } catch (err) {
      log('sendAudioFrame error', err?.message || err);
      return false;
    }
  }

  async function configureCapture(ctx, source, opts = {}) {
    const analyser = opts.analyser || ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    let captureMode = opts.captureMode || (document.getElementById('captureMode') || { value: 'worklet' }).value || 'worklet';
    if (!('audioWorklet' in ctx) && captureMode === 'worklet') captureMode = 'script';
    const monitor = opts.monitor ?? (document.getElementById('monitor') || {}).checked;
    let processor = null;

    const batchMs = Math.max(5, Math.min(100, parseFloat(urlParams.get('batchMs') || '20')));
  // Disable input gate by default to avoid silence skips during diagnosis; can be set via ?gate=0.002
  const gateParam = Math.max(0, parseFloat(urlParams.get('gate') || '0'));
    const MAX_BUFFERED = 512 * 1024;
    const flushMs = Math.max(15, parseInt(urlParams.get('flushMs') || String(batchMs + 10)));
    let carry = new Float32Array(0);
    let flushTimer = null;
    const wantFir = !!(FF.fir_halfband && dsp && typeof dsp.FirFilter === 'function');
    let firFilter = (wantFir && captureMode === 'script') ? new dsp.FirFilter(dsp.HALF_BAND_COEFFS) : null;


    const handleFrame = (input) => {
      markWatchdogFrame();
      const filtered = firFilter ? firFilter.process(input) : input;
      const ds = downsample48kTo24k(filtered);
      try {
        const jitterEstimate = Math.max(40, Math.min(120, commitWindowMs() - 40));
        state.jitterMs = Math.round(jitterEstimate);
      } catch {}
      try {
        let nz = 0;
        for (let i = 0; i < ds.length; i++) if (Math.abs(ds[i]) > 1e-4) nz++;
        metrics.nzSamples += nz;
        metrics.totalSamples += ds.length;
        if ((metrics.sentAppends % 20) === 0) renderMetrics();
        if (diag && (metrics.sentAppends % 50 === 0)) {
          const sample = Array.from(ds.slice(0, 8)).map(v => Number(v.toFixed(4)));
          log('frame sample', JSON.stringify(sample));
        }
      } catch {}

      let combined;
      if (!carry.length) {
        combined = ds;
      } else {
        combined = new Float32Array(carry.length + ds.length);
        combined.set(carry, 0);
        combined.set(ds, carry.length);
      }
      const chunkSamples = Math.max(1, Math.round((state.serverInHz || 24000) * (batchMs / 1000)));
      let offset = 0;
      let sentAny = false;

      while ((combined.length - offset) >= chunkSamples) {
        let chunk = combined.subarray(offset, offset + chunkSamples);
        offset += chunkSamples;

        const gateRms = (state.gateRms != null ? state.gateRms : gateParam);
        if (gateRms > 0) {
          let sum = 0;
          for (let i = 0; i < chunk.length; i++) { const s = chunk[i]; sum += s * s; }
          const rms = Math.sqrt(sum / Math.max(1, chunk.length));
          if (rms < gateRms) continue;
        }

        try {
          let sum = 0;
          for (let i = 0; i < chunk.length; i++) { const s = chunk[i]; sum += s * s; }
          const rms = Math.sqrt(sum / Math.max(1, chunk.length));
          if (state.agcEnabled) {
            const eps = 1e-6;
            const tgt = state.targetRms || defaultTargetRms;
            const desired = tgt / Math.max(rms, eps);
            state.agcGain = Math.max(0.1, Math.min(10, state.agcGain * (1 - agcRate) + desired * agcRate));
          }
          const gEff = (state.softwareGain || 1) * (state.agcEnabled ? state.agcGain : 1);
          for (let i = 0; i < chunk.length; i++) {
            let v = chunk[i] * gEff;
            const a = Math.abs(v);
            if (a > limiterThr) {
              const sign = v < 0 ? -1 : 1;
              const excess = a - limiterThr;
              const knee = 1 - limiterThr;
              const comp = Math.tanh((excess / Math.max(1e-6, knee)) * 2.0) * knee;
              v = sign * (limiterThr + comp);
            }
            if (v > 1) v = 1; else if (v < -1) v = -1;
            chunk[i] = v;
          }
        } catch {}

        if (FF.drift_comp && state.driftTracker) {
          try {
            const { adjust, driftPpm } = state.driftTracker.ingest(chunk.length, performance.now(), state.serverInHz || 24000);
            state.driftPpm = driftPpm;
            if (adjust !== 0 && chunk.length > 1) {
              chunk = resampleWithDelta(chunk, adjust);
            }
          } catch {}
        }

        const pcmBuf = float32ToPCM16(chunk);
        if (state.ingressPauseUntil && Date.now() < state.ingressPauseUntil) {
          continue;
        }
        // Allow sending if v1 WebSocket is ready OR Protocol v2 is enabled
        if ((state.ws && state.ws.readyState === 1) || state.useProtocolV2) {
          try {
            const ba = (state.ws && state.ws.bufferedAmount) || 0;
            if (ba > MAX_BUFFERED * 4) { if (diag) log('backpressure drop', String(ba)); continue; }
            if (sendAudioFrameBuffer(pcmBuf)) {
              metrics.sentAppends += 1;
              metrics.sentBytesAudio += pcmBuf.byteLength;
              state.lastAudioSentAt = Date.now();
              renderMetrics();
              if (metrics.sentAppends <= 3 || metrics.sentAppends % 50 === 0) {
                let peak = 0, sum = 0;
                for (let i = 0; i < chunk.length; i++) { const a = Math.abs(chunk[i]); peak = Math.max(peak, a); sum += a * a; }
                const rms = Math.sqrt(sum / Math.max(1, chunk.length));
                log('=> audio', `mode=${resolvedSendPath} bytes=${pcmBuf.byteLength} peak=${peak.toFixed(2)} rms=${rms.toFixed(2)} buffered=${state.ws.bufferedAmount}`);
              }
            }
          } catch {}
        }
        sentAny = true;
        armInactivityCommit();
        try { if (state.stragglerTimer) clearTimeout(state.stragglerTimer); } catch {}
        // Only use v1 commit logic if NOT using Protocol v2 (which handles commits internally)
        if (!state.useProtocolV2) {
          state.stragglerTimer = setTimeout(() => {
            try {
              if (framesSinceCommit >= MIN_COMMIT_FRAMES && bytesSinceCommit >= Math.max(MIN_COMMIT_BYTES, commitRequiredBytes || 0)) {
                const hadBytes = bytesSinceCommit;
                if (sendAudioCommit('threshold')) log('commit(reason=threshold)', `have=${hadBytes} need=${Math.max(MIN_COMMIT_BYTES, commitRequiredBytes || 0)}`);
              } else {
                try { log(`commit.suppressed reason=straggler have=${bytesSinceCommit} need=${MIN_COMMIT_BYTES}`); } catch {}
              }
            } catch {}
          }, 30);
        }
      }

      carry = (offset < combined.length) ? combined.subarray(offset).slice(0) : new Float32Array(0);
      try {
        if (sentAny && flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        if (carry.length > 0 && !flushTimer) {
          flushTimer = setTimeout(() => {
            try {
              if (!carry.length) { flushTimer = null; return; }
              let chunk = carry;
              carry = new Float32Array(0);
              const _gate = (state.gateRms != null ? state.gateRms : gateParam);
              if (_gate > 0) {
                let sum = 0; for (let i = 0; i < chunk.length; i++) { const s = chunk[i]; sum += s * s; }
                const rms = Math.sqrt(sum / Math.max(1, chunk.length));
                if (rms < _gate) { flushTimer = null; return; }
              }
              try {
                let sum = 0;
                for (let i = 0; i < chunk.length; i++) { const s = chunk[i]; sum += s * s; }
                const rms = Math.sqrt(sum / Math.max(1, chunk.length));
                if (state.agcEnabled) {
                  const eps = 1e-6;
                  const tgt = state.targetRms || defaultTargetRms;
                  const desired = tgt / Math.max(rms, eps);
                  state.agcGain = Math.max(0.1, Math.min(10, state.agcGain * (1 - agcRate) + desired * agcRate));
                }
                const gEff = (state.softwareGain || 1) * (state.agcEnabled ? state.agcGain : 1);
                for (let i = 0; i < chunk.length; i++) {
                  let v = chunk[i] * gEff;
                  const a = Math.abs(v);
                  if (a > limiterThr) {
                    const sign = v < 0 ? -1 : 1;
                    const excess = a - limiterThr;
                    const knee = 1 - limiterThr;
                    const comp = Math.tanh((excess / Math.max(1e-6, knee)) * 2.0) * knee;
                    v = sign * (limiterThr + comp);
                  }
                  if (v > 1) v = 1; else if (v < -1) v = -1;
                  chunk[i] = v;
                }
              } catch {}
              if (FF.drift_comp && state.driftTracker) {
                try {
                  const { adjust, driftPpm } = state.driftTracker.ingest(chunk.length, performance.now(), state.serverInHz || 24000);
                  state.driftPpm = driftPpm;
                  if (adjust !== 0 && chunk.length > 1) {
                    chunk = resampleWithDelta(chunk, adjust);
                  }
                } catch {}
              }
              if (state.ingressPauseUntil && Date.now() < state.ingressPauseUntil) {
                flushTimer = null;
                return;
              }
              const pcmBuf = float32ToPCM16(chunk);
              if (state.ws && state.ws.readyState === 1) {
                try {
                  const ba = state.ws.bufferedAmount || 0;
                  if (ba > MAX_BUFFERED * 4) { if (diag) log('backpressure drop', String(ba)); flushTimer = null; return; }
                  if (sendAudioFrameBuffer(pcmBuf)) {
                    metrics.sentAppends += 1;
                    metrics.sentBytesAudio += pcmBuf.byteLength;
                    state.lastAudioSentAt = Date.now();
                    renderMetrics();
                  }
                  flushTimer = null;
                } catch {}
              }
            } catch {}
          }, flushMs);
        }
      } catch {}
    };

    state.firFilter = firFilter || null;
    state._captureHandleFrame = handleFrame;
    let activeMode = 'pending';
    let monitorNode = null;
    let connectingWorklet = false;

    const syncWatchdogState = () => {
      if (!FF.watchdog) return;
      const ctrl = state.watchdogController;
      if (!ctrl || typeof ctrl.getState !== 'function') return;
      try {
        const info = ctrl.getState();
        state.watchdogLastFrame = info.lastFrameAt;
        state.watchdogRecoveryAt = info.recoveryAt;
        state.workletStalls = info.stalls;
        state.watchdogRecovers = info.recovers;
      } catch {}
    };

    const markWatchdogFrame = (nowOverride) => {
      if (!FF.watchdog) return;
      try {
        const now = Number.isFinite(nowOverride) ? nowOverride : performance.now();
        if (state.watchdogController && typeof state.watchdogController.noteFrame === 'function') {
          state.watchdogController.noteFrame(now);
          syncWatchdogState();
        } else {
          state.watchdogLastFrame = now;
        }
        state.watchdogActiveMode = activeMode;
      } catch {}
    };

    const cleanupProcessor = () => {
      if (processor) {
        try { source.disconnect(processor); } catch {}
        try { processor.disconnect(); } catch {}
      }
      processor = null;
      if (monitorNode) {
        try { monitorNode.disconnect(); } catch {}
        monitorNode = null;
      }
    };

    let workletDisabled = false;
    const attachScriptProcessor = () => {
      cleanupProcessor();
      try {
        if (wantFir) {
          try { firFilter = new dsp.FirFilter(dsp.HALF_BAND_COEFFS); }
          catch { firFilter = null; }
        } else {
          firFilter = null;
        }
      } catch { firFilter = null; }
      state.firFilter = firFilter;
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      try { source.connect(sp); } catch {}
      monitorNode = ctx.createGain();
      monitorNode.gain.value = monitor ? 1 : 0;
      sp.connect(monitorNode);
      monitorNode.connect(ctx.destination);
      sp.onaudioprocess = (e) => {
        try {
          const input = e.inputBuffer.getChannelData(0);
          handleFrame(input);
        } catch (err) {
          log('script onaudioprocess error', err.message || err);
        }
      };
      processor = sp;
      state.processor = sp;
      activeMode = 'script';
      captureMode = 'script';
      if (FF.drift_comp) {
        try { initDriftTracker(performance.now()); } catch { initDriftTracker(); }
      }
      markWatchdogFrame();
      log('capture', 'script processor attached');
    };

    const attachWorkletNode = async () => {
      if (workletDisabled) { log('worklet', 'disabled; using script'); return attachScriptProcessor(); }
      if (connectingWorklet) return;
      connectingWorklet = true;
      try {
        cleanupProcessor();
        try {
          const url = './scripts/pcm_worklet.js';
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) { log('worklet load failed', String(res.status)); throw new Error('worklet 404'); }
        } catch (e) {
          log('worklet prefetch error', e?.message || e);
        }
        await ctx.audioWorklet.addModule('./scripts/pcm_worklet.js');
        const node = new AudioWorkletNode(ctx, 'pcm-capture');
        try { node.port.postMessage({ type: 'configure_fir', enabled: wantFir, coeffs: wantFir ? Array.from(dsp.HALF_BAND_COEFFS) : null }); } catch {}
        monitorNode = ctx.createGain();
        monitorNode.gain.value = monitor ? 1 : 0;
        node.connect(monitorNode);
        monitorNode.connect(ctx.destination);
        try { source.connect(node); } catch {}
        state.framesSeen = 0;
        let workletFrameLogged = false;
        node.port.onmessage = (ev) => {
          try {
            const input = ev.data && ev.data.data;
            if (!input) return;
            state.framesSeen = (state.framesSeen || 0) + 1;
            if (!workletFrameLogged && diag) { workletFrameLogged = true; log('workletState=frames_ok'); }
            handleFrame(input);
          } catch (e) { log('worklet onmessage error', e.message || e); }
        };
        processor = node;
        state.processor = node;
        firFilter = null;
        state.firFilter = null;
        activeMode = 'worklet';
        captureMode = 'worklet';
        if (FF.drift_comp) {
          try { initDriftTracker(performance.now()); } catch { initDriftTracker(); }
        }
        markWatchdogFrame();
        log('capture', 'worklet attached'); if (diag) log('workletState=attached');
        setTimeout(() => {
          try {
            if (activeMode === 'worklet' && (state.framesSeen || 0) === 0) {
              log('fallback', 'no worklet frames; switching to script'); if (diag) log('workletState=fallback_script');
              const now = performance.now();
              if (state.watchdogController && typeof state.watchdogController.registerFallback === 'function') {
                state.watchdogController.registerFallback(now);
                syncWatchdogState();
              } else {
                state.workletStalls = (state.workletStalls || 0) + 1;
                if (FF.watchdog) state.watchdogRecoveryAt = now + 4000;
              }
              workletDisabled = true; attachScriptProcessor();
              if (FF.watchdog) syncWatchdogState();
            }
          } catch {}
        }, 600);
      } finally {
        connectingWorklet = false;
      }
    };

    source.connect(analyser);

    if (captureMode === 'worklet') {
      try {
        await attachWorkletNode();
      } catch (e) {
        log('worklet error', e.message || e);
      }
    }

    if (activeMode !== 'worklet') {
      attachScriptProcessor();
    }

    const startWatchdog = () => {
      if (!FF.watchdog) return;
      if (state.watchdogInterval) {
        try { clearInterval(state.watchdogInterval); } catch {}
      }
      state.watchdogInterval = null;
      state.watchdogRecoveryAt = 0;
      markWatchdogFrame();
      let ticking = false;
      const tick = () => {
        if (ticking) return;
        ticking = true;
        Promise.resolve().then(async () => {
          const now = performance.now();
          const ctrl = state.watchdogController;
          if (ctrl && typeof ctrl.shouldFallback === 'function') {
            if (!workletDisabled && activeMode === 'worklet' && ctrl.shouldFallback(now)) {
              log('watchdog', 'worklet stall detected; switching to script');
              ctrl.registerFallback(now);
              workletDisabled = true; attachScriptProcessor();
              syncWatchdogState();
            } else if (!workletDisabled && activeMode === 'script' && ctrl.shouldRecover(now)) {
              try {
                await attachWorkletNode();
                if (activeMode === 'worklet' && typeof ctrl.registerRecoverySuccess === 'function') {
                  ctrl.registerRecoverySuccess(performance.now());
                  syncWatchdogState();
                  log('watchdog', 'worklet recovered');
                } else if (typeof ctrl.registerRecoveryFailure === 'function') {
                  ctrl.registerRecoveryFailure(now);
                  syncWatchdogState();
                }
              } catch (err) {
                log('watchdog', `worklet recovery failed: ${err?.message || err}`);
                if (typeof ctrl.registerRecoveryFailure === 'function') {
                  ctrl.registerRecoveryFailure(performance.now());
                  syncWatchdogState();
                }
              }
            }
          } else {
            if (!workletDisabled && activeMode === 'worklet') {
              const last = state.watchdogLastFrame || now;
              if ((now - last) > 600) {
                log('watchdog', 'worklet stall detected; switching to script');
                state.workletStalls = (state.workletStalls || 0) + 1;
                workletDisabled = true; attachScriptProcessor();
                state.watchdogRecoveryAt = now + 4000;
              }
            } else if (!workletDisabled && activeMode === 'script' && state.watchdogRecoveryAt && now >= state.watchdogRecoveryAt) {
              try {
                await attachWorkletNode();
                if (activeMode === 'worklet') {
                  state.watchdogRecovers = (state.watchdogRecovers || 0) + 1;
                  state.watchdogRecoveryAt = 0;
                  log('watchdog', 'worklet recovered');
                }
              } catch (err) {
                log('watchdog', `worklet recovery failed: ${err?.message || err}`);
                state.watchdogRecoveryAt = now + 5000;
              }
            }
          }
        }).catch((err) => {
          log('watchdog', err?.message || err);
        }).finally(() => { ticking = false; });
      };
      state.watchdogInterval = setInterval(tick, 250);
    };

    startWatchdog();

    return { analyser, processor, mode: activeMode };
  }

  async function buildSimulatedSource() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    const resp = await fetch('./testdata/sample_24k_pcm16.raw');
    if (!resp.ok) throw new Error(`sample fetch failed: ${resp.status}`);
    const arrayBuf = await resp.arrayBuffer();
    const float24 = pcm16BytesToFloat32(arrayBuf);
    const float48 = upsample24kTo48k(float24);
    const audioBuffer = ctx.createBuffer(1, float48.length, 48000);
    audioBuffer.copyToChannel(float48, 0);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    return { ctx, source };
  }

  async function calibrateAmbient(analyser) {
    try {
      const calMs = Math.max(800, Math.min(4000, parseInt(urlParams.get('calMs') || '1500')));
      await new Promise(r => setTimeout(r, 120));
      const t0 = performance.now();
      let sum = 0, n = 0, peak = 0, nonZero = 0;
      const tmp = new Float32Array(analyser.fftSize);
      while ((performance.now() - t0) < calMs) {
        analyser.getFloatTimeDomainData(tmp);
        let s = 0, p = 0;
        for (let i = 0; i < tmp.length; i++) { const a = Math.abs(tmp[i]); s += a * a; if (a > p) p = a; }
        const rms = Math.sqrt(s / Math.max(1, tmp.length));
        if (rms > 1e-5) nonZero++;
        sum += rms;
        n += 1;
        if (p > peak) peak = p;
        await new Promise(r => setTimeout(r, 30));
      }
      const amb = (n && nonZero) ? (sum / n) : 0.003;
      const tgt = Math.max(0.06, Math.min(0.18, amb * 4));
      const gate = Math.max(0.001, Math.min(0.01, amb * 2));
      state.targetRms = tgt;
      state.gateRms = gate;
      state.agcGain = 1;
      log('calibrated', JSON.stringify({ ambientRms: Number(amb.toFixed(4)), targetRms: Number(tgt.toFixed(3)), gateRms: Number(gate.toFixed(3)) }));
    } catch {}
  }

  function setupDiagnostics(ctx, analyser, stream) {
    if (diag) {
      try {
        if (state.summaryTimer) clearInterval(state.summaryTimer);
        state.summaryTimer = setInterval(() => {
          try {
            const nzPct = metrics.totalSamples ? Math.round((metrics.nzSamples / metrics.totalSamples) * 100) : 0;
            const ingress = state.lastIngress || { chunks: 0, bytes: 0 };
            const wsState = state.ws ? state.ws.readyState : -1;
            const summary = {
              t: new Date().toISOString(),
              capture: (document.getElementById('captureMode') || { value: 'worklet' }).value || 'worklet',
              send: state.sendPath,
              ctx: ctx.state,
              micActive: state.micActive,
              deviceId: (state.deviceId || 'default'),
              gain: state.softwareGain || 1,
              nzPct,
              lastPeak: Number((state.lastPeakRms?.peak || 0).toFixed(3)),
              lastRms: Number((state.lastPeakRms?.rms || 0).toFixed(3)),
              sentAppends: metrics.sentAppends,
              sentBytes: metrics.sentBytesAudio,
              ingressChunks: ingress.chunks,
              ingressBytes: ingress.bytes,
              ws: wsState,
              recvAudioChunks: state.recvAudioChunks || 0,
              events: state.eventCounts || {},
              driftPpm: FF.drift_comp ? Number((state.driftPpm || 0).toFixed(1)) : undefined,
              workletStalls: state.workletStalls || 0,
              watchdogRecovers: state.watchdogRecovers || 0,
              jitterMs: state.jitterMs || 0,
              bargeInEvents: state.bargeInEvents || 0,
              duckTransitions: state.duckTransitions || 0,
              resumeEvents: state.resumeEvents || 0,
              cancelEvents: state.cancelEvents || 0,
              duckLatencyMs: state.duckLatencyMs || 0,
              bargeActive: !!state.bargeInActive,
            };
            log('SUMMARY', JSON.stringify(summary));
          } catch {}
        }, 3000);
      } catch {}
    }
    if (diag) {
      try {
        if (state._diagTimer) clearInterval(state._diagTimer);
        const interval = FORCE_SIM ? 500 : 1000;
        state._diagTimer = setInterval(() => {
          try {
            if (FORCE_SIM) {
              const payload = {
                ts: Date.now(),
                rttMs: typeof state.net?.rttMsEwma === 'number' ? Number(state.net.rttMsEwma.toFixed(1)) : null,
                commitWinMs: commitWindowMs(),
                sentAppends: metrics.sentAppends,
                sentBytes: metrics.sentBytesAudio,
                ingressChunks: state.lastIngress?.chunks || 0,
                ingressBytes: state.lastIngress?.bytes || 0,
                sendPath: state.sendPath,
                driftPpm: typeof state.driftPpm === 'number' ? Number(state.driftPpm.toFixed(1)) : 0,
              workletStalls: state.workletStalls || 0,
              watchdogRecovers: state.watchdogRecovers || 0,
              jitterMs: state.jitterMs || 0,
              bargeInEvents: state.bargeInEvents || 0,
              duckTransitions: state.duckTransitions || 0,
              resumeEvents: state.resumeEvents || 0,
              cancelEvents: state.cancelEvents || 0,
              duckLatencyMs: state.duckLatencyMs || 0,
              bargeActive: !!state.bargeInActive,
              recvAudioChunks: state.recvAudioChunks || 0,
            };
              if (typeof window !== 'undefined') window.__qvtDiag = payload;
              console.log(JSON.stringify(payload));
            } else {
              const buf = new Float32Array(analyser.fftSize);
              analyser.getFloatTimeDomainData(buf);
              let peak = 0, sum = 0, nz = 0;
              for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); peak = Math.max(peak, a); sum += a * a; if (a > 1e-4) nz++; }
              const rms = Math.sqrt(sum / Math.max(1, buf.length));
              const nzPct = Math.round((nz / buf.length) * 100);
              log('analyser', `peak=${peak.toFixed(3)} rms=${rms.toFixed(3)} nz=${nzPct}%`);
            }
          } catch {}
        }, interval);
      } catch {}
    }
    if (!FORCE_SIM) {
      try {
        if (state.recalTimer) clearInterval(state.recalTimer);
        state.recalTimer = setInterval(async () => {
          try {
            const t0 = performance.now();
            let sum = 0, n = 0;
            const tmp = new Float32Array(analyser.fftSize);
            while ((performance.now() - t0) < 500) {
              analyser.getFloatTimeDomainData(tmp);
              let s = 0;
              for (let i = 0; i < tmp.length; i++) { const a = tmp[i]; s += a * a; }
              const rms = Math.sqrt(s / Math.max(1, tmp.length));
              sum += rms;
              n++;
              await new Promise(r => setTimeout(r, 30));
            }
            const amb = n ? (sum / n) : 0.003;
            const newGate = Math.max(0.001, Math.min(0.01, amb * 2));
            const newTgt = Math.max(0.06, Math.min(0.18, amb * 4));
            state.gateRms = newGate;
            state.targetRms = (state.targetRms * 0.8) + (newTgt * 0.2);
            if (diag) log('ambient-recal', { amb: Number(amb.toFixed(4)), gate: Number(newGate.toFixed(3)), tgt: Number(state.targetRms.toFixed(3)) });
          } catch {}
        }, 60000);
      } catch {}
    }
  }

  async function startMic() {
    if (!state.connected) return log('Not connected');
    if (state.micActive) return;
    try {
      try {
        console.info(FORCE_SIM ? '[sim] capture=sim, no gUM' : '[mic] capture=mic');
      } catch {}
      try { if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ type: 'input_audio_buffer.clear' })); } catch {}
      state._seq = 0;
      // Reset commit gating counters at mic start
      framesSinceCommit = 0;
      msSinceLastCommit = 0;
      bytesSinceCommit = 0;
      let ctx;
      let source;
      let stream = null;
      let monitorOverride;
      if (FORCE_SIM) {
        const sim = await buildSimulatedSource();
        ctx = sim.ctx;
        source = sim.source;
        monitorOverride = false;
        state.simSource = sim.source;
      } else {
        const constraints = buildConstraints();
        try { log('getUserMedia constraints', JSON.stringify(constraints)); } catch {}
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
        source = ctx.createMediaStreamSource(stream);
        monitorOverride = undefined;
        state.simSource = null;
      }
      if (state.watchdogInterval) { clearInterval(state.watchdogInterval); state.watchdogInterval = null; }
      state.workletStalls = 0;
      state.watchdogRecovers = 0;
      state.watchdogRecoveryAt = 0;
      state.watchdogLastFrame = 0;
      if (FF.watchdog && watchdogLib && typeof watchdogLib.CaptureWatchdog === 'function') {
        try {
          state.watchdogController = new watchdogLib.CaptureWatchdog();
          state.watchdogController.reset(performance.now());
        } catch {
          state.watchdogController = null;
        }
      } else {
        state.watchdogController = null;
      }
      if (FF.drift_comp) {
        try { initDriftTracker(performance.now()); } catch { initDriftTracker(); }
      } else {
        teardownDriftTracker();
      }
      const { analyser, processor } = await configureCapture(ctx, source, { monitor: monitorOverride });
      await unlockIOSAudio(ctx);
      state.processor = processor;
      state.audioContext = ctx;
      state.mediaStream = stream;
      state.analyser = analyser;
      state.micActive = true;
      $('btnMic').textContent = 'Stop Mic';
      logFlow('Microphone started', `sampleRate=${ctx.sampleRate} captureMode=${captureMode}`);
      logState('mic', { active: true, sampleRate: ctx.sampleRate, streamActive: stream?.active, tracks: stream?.getTracks().length });
      logState('counters_reset', { framesSinceCommit, msSinceLastCommit, bytesSinceCommit });
      requestWakeLock(true);
      await calibrateAmbient(analyser);
      setupDiagnostics(ctx, analyser, stream);
      startVisualizer();
      // Optional chirp to verify output routing (100ms @ 1kHz)
      try {
        if (debugBeep && state.playCtx) {
          const osc = state.playCtx.createOscillator();
          const g = state.playCtx.createGain();
          osc.frequency.value = 1000;
          g.gain.value = 0.2;
          osc.connect(g);
          if (state.sinkDest) g.connect(state.sinkDest);
          else g.connect(state.playCtx.destination);
          const t0 = state.playCtx.currentTime;
          osc.start(t0);
          osc.stop(t0 + 0.10);
        }
      } catch {}
      // Post-start silent stream probe: if nz% stays ~0, try a simpler constraint set once
      try {
        if (!FORCE_SIM) {
          if (!state._probeTimer) {
            state._probeTimer = setTimeout(async () => {
              try {
                const nzPct = metrics.totalSamples ? Math.round((metrics.nzSamples / metrics.totalSamples) * 100) : 0;
                if ((nzPct < 1) && !state.__probeFallbackTried) {
                  const warn = $('silenceWarn'); if (warn) { warn.style.display = ''; warn.textContent = 'Mic stream is silent (0%). Change input above or check OS/site mic settings.'; }
                  state.__probeFallbackTried = true;
                  log('probe.fallback', 'nz% < 1; retrying with plain {audio:true}');
                  try { stopMic(); } catch {}
                  try {
                    const stream2 = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                    // If we got a stream, rebuild capture path quickly
                    const ctx2 = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
                    const source2 = ctx2.createMediaStreamSource(stream2);
                    const out = await configureCapture(ctx2, source2, { monitor: undefined });
                    await unlockIOSAudio(ctx2);
                    state.processor = out.processor;
                    state.audioContext = ctx2;
                    state.mediaStream = stream2;
                    state.analyser = out.analyser;
                    state.micActive = true;
                    $('btnMic').textContent = 'Stop Mic';
                    log('Mic re-started (fallback)');
                    startVisualizer();
                  } catch (e) {
                    log('probe.fallback.error', e?.message || e);
                  }
                }
              } catch {}
              finally { try { clearTimeout(state._probeTimer); } catch {}; state._probeTimer = null; }
            }, 1500);
          }
        }
      } catch {}
      if (diag && stream && !FORCE_SIM) {
        try { await autoRecordAnalyse(stream, 5000); } catch (err) { log('autoRecord error', err.message || err); }
      }
    } catch (e) {
      log('Mic error', e.message || e);
      try { stopMic(); } catch {}
    }
    updateUiPills();
  }



  function stopMic() {
    if (!state.micActive) return;
    try {
      state.processor && state.processor.disconnect();
      state.audioContext && state.audioContext.close();
      state.mediaStream && state.mediaStream.getTracks().forEach(t => t.stop());
      if (state.simSource) {
        try { state.simSource.stop?.(); } catch {}
        try { state.simSource.disconnect?.(); } catch {}
        state.simSource = null;
      }
      if (state.firFilter && typeof state.firFilter.reset === 'function') {
        try { state.firFilter.reset(); } catch {}
      }
      state.firFilter = null;
      state._captureHandleFrame = null;
      if (state._diagTimer) { clearInterval(state._diagTimer); state._diagTimer = null; }
      if (state.summaryTimer) { clearInterval(state.summaryTimer); state.summaryTimer = null; }
      if (state.recalTimer) { clearInterval(state.recalTimer); state.recalTimer = null; }
      if (state.watchdogInterval) { clearInterval(state.watchdogInterval); state.watchdogInterval = null; }
      state.watchdogRecoveryAt = 0;
      state.watchdogLastFrame = 0;
      state.watchdogController = null;
      clearBargeResumeTimer();
      state.bargeInActive = false;
      state.tailPadNeeded = false;
      setTtsGain(1.0);
    } catch {}
    teardownDriftTracker();
    clearResumeAudioTimer('reset');
    clearIdleCommit();
    // Commit the audio buffer to trigger response (v1 only - v2 handles commits internally)
    try {
      if (!state.useProtocolV2 && sendAudioCommit('stopMic')) {
        state.ws.send(JSON.stringify({ type: 'response.create' }));
      }
    } catch {}
    state.processor = null; state.audioContext = null; state.mediaStream = null; state.micActive = false;
    $('btnMic').textContent = 'Start Mic';
    log('Mic stopped');
    requestWakeLock(false);
    // Reset meter display
    try { if (state.meterFill) state.meterFill.style.width = '0%'; if (state.meterText) state.meterText.textContent = 'level: 0%'; if (state.clipEl) state.clipEl.style.display='none'; } catch {}
    stopVisualizer();
    if (FF.ui_pills) {
      setTranscriptDim(false);
      showBargeBanner(false);
      updateUiPills();
    }
    state.ingressRateKbps = 0;
    state.lastIngressSample = null;
  }

  function buildConstraints() {
    const raw = $('rawMic').checked;
    const sysProc = String(urlParams.get('sysProc') || '').toLowerCase();
    const wantSys = /^(1|on|true)$/i.test(sysProc);
    const useSys = !!(wantSys && !raw);
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: Boolean(useSys),
      autoGainControl: Boolean(useSys),
      channelCount: 1
    };
    if (isIOS && !raw) {
      audioConstraints.echoCancellation = true;
      audioConstraints.noiseSuppression = true;
      audioConstraints.autoGainControl = false;
    }
    const c = { audio: audioConstraints, video: false };
    if (state.deviceId) c.audio.deviceId = { exact: state.deviceId };
    try { log('getUserMedia constraints', JSON.stringify(c)); } catch {}
    return c;
  }

  async function autoRecordAnalyse(stream, ms=3000) {
    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      await new Promise((resolve) => { rec.onstop = resolve; rec.start(); setTimeout(() => { try { rec.stop(); } catch {} }, ms); });
      const blob = new Blob(chunks, { type: mime });
      log('autoRecord blob', `type=${blob.type} size=${blob.size}B`);
      // Decode and analyse
      const arr = await blob.arrayBuffer();
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await ac.decodeAudioData(arr.slice(0));
      const ch0 = buf.getChannelData(0);
      let nz=0, peak=0, sum=0; for (let i=0;i<ch0.length;i++){ const a=Math.abs(ch0[i]); if (a>1e-4) nz++; if (a>peak) peak=a; sum+=ch0[i]*ch0[i]; }
      const rms = Math.sqrt(sum/Math.max(1,ch0.length));
      const pct = Math.round((nz/Math.max(1,ch0.length))*10000)/100;
      log('autoRecord analysis', `nonZero=${pct}% peak=${peak.toFixed(3)} rms=${rms.toFixed(3)}`);
    } catch (e) {
      log('autoRecord analyse error', e.message||e);
    }
  }

  bindOnce('#btnConnect', 'click', async (ev) => {
    try { ev.preventDefault?.(); } catch {}
    log('connect.click');
    if (state.connected) { try { state.ws && state.ws.close(); } catch {}; return; }
    state.audioUnlockPending = true;
    try { state.playCtx?.resume(); state.audioContext?.resume(); setTtsGain(1.0); } catch {}
    await startConnection();
  });
  bindOnce('#btnMic', 'click', (ev) => {
    try { ev.preventDefault?.(); } catch {}
    log('mic.click');
    state.audioUnlockPending = true;
    unlockIOSAudio(state.playCtx || state.audioContext || null);
    return state.micActive ? stopMic() : startMic();
  });
  ensureElement('btnClear', (el) => el.addEventListener('click', () => { const t = $('transcript'); if (t) t.textContent=''; const l=$('log'); if (l) l.value=''; metrics.sentBytesAudio=metrics.sentAppends=metrics.recvAudioChunks=metrics.recvAudioBytes=metrics.recvTranscriptChars=0; renderMetrics(); }));
  ensureElement('btnDownload', (el) => el.addEventListener('click', () => {
    try {
      const blob = new Blob([logBuffer.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `qvt-log-${Date.now()}.txt`; if(window.ASIMO_SETTINGS && ASIMO_SETTINGS.autoDownload){ a.click(); }
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch {}
  }));
  ensureElement('btnClearLog', (el) => el.addEventListener('click', () => { const l=$('log'); if (l) l.value=''; logBuffer.length=0; log('cleared logs'); }));
  ensureElement('btnCopyLog', (el) => el.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(logBuffer.join('\n')); log('copied logs to clipboard'); }
    catch { try { const l=$('log'); l.focus(); l.select(); document.execCommand('copy'); log('copied logs (fallback)'); } catch (e) { log('copy failed', e.message||e); } }
  }));
  ensureElement('btnResumeAudio', (el) => el.addEventListener('click', async () => {
    try { await state.audioContext?.resume(); } catch {}
    try { await state.playCtx?.resume(); } catch {}
    log('resume', `audio=${state.audioContext?.state} play=${state.playCtx?.state}`);
  }));

  // Loopback test: record ~1s from current (or default) mic and play back. Report % non-zero.
  $('btnLoopback')?.addEventListener('click', async () => {
    try {
      const raw = $('rawMic').checked;
      const constr = { audio: { echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: !raw, channelCount: 1 }, video: false };
      if (state.deviceId) constr.audio.deviceId = { exact: state.deviceId };
      log('loopback constraints', JSON.stringify(constr));
      const stream = state.mediaStream || await navigator.mediaDevices.getUserMedia(constr);
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      await new Promise((resolve) => { rec.onstop = resolve; rec.start(); setTimeout(() => { try { rec.stop(); } catch {} }, 1100); });
      const blob = new Blob(chunks, { type: mime });
      log('loopback blob', `type=${blob.type} size=${blob.size}B`);
      // Decode and analyze
      const arr = await blob.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await ctx.decodeAudioData(arr.slice(0));
      const ch0 = buf.getChannelData(0);
      let nz = 0, peak = 0, sum = 0; const n = ch0.length; const eps = 1e-4;
      for (let i=0;i<n;i++){ const v = ch0[i]; const a = Math.abs(v); if (a > eps) nz++; if (a > peak) peak = a; sum += v*v; }
      const pctNz = Math.round((nz / Math.max(1,n)) * 10000) / 100;
      const rms = Math.sqrt(sum / Math.max(1,n));
      log('loopback analysis', `nonZero=${pctNz}% peak=${peak.toFixed(3)} rms=${rms.toFixed(3)}`);
      // Playback
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      try { if (state.outputSupported && state.speakerId) await a.setSinkId(state.speakerId); } catch {}
      a.play().catch(()=>{});
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      log('loopback error', e.message || e);
    }
  });

  // Auto-detect mic: try available devices briefly and choose the one with highest peak
  ensureElement('btnAutoDetect', (el) => el.addEventListener('click', async () => {
    try {
      log('auto-detect', 'starting scan of input devices');
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      if (!inputs.length) { log('auto-detect', 'no inputs'); return; }
      const results = [];
      for (const d of inputs) {
        const r = await sampleDeviceOnce(d.deviceId);
        results.push({ id: d.deviceId, label: d.label || '(no label)', peak: r.peak, rms: r.rms });
        log('auto-detect', `${d.label || d.deviceId.slice(0,8)} peak=${r.peak.toFixed(3)} rms=${r.rms.toFixed(3)}`);
      }
      results.sort((a,b) => b.peak - a.peak);
      const best = results[0];
      if (!best || best.peak <= 0.01) { log('auto-detect', 'no device with measurable signal'); return; }
      state.deviceId = best.id; persist();
      log('auto-detect', `selected '${best.label}' (peak=${best.peak.toFixed(3)})`);
      if (state.micActive) { stopMic(); }
      startMic();
    } catch (e) { log('auto-detect error', e.message || e); }
  }));

  async function sampleDeviceOnce(deviceId) {
    const raw = true;
    const constraints = { audio: { deviceId: { exact: deviceId }, echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: !raw, channelCount: 1 }, video: false };
    let stream, ctx, proc, src;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      src = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(2048, 1, 1);
      src.connect(proc); proc.connect(ctx.destination);
      let peak = 0, sum = 0, frames = 0;
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 400);
        proc.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          for (let i=0;i<input.length;i++){ const a=Math.abs(input[i]); peak = Math.max(peak,a); sum += a*a; }
          frames += input.length;
        };
      });
      const rms = Math.sqrt(sum / Math.max(1, frames));
      return { peak, rms };
    } catch (e) {
      return { peak: 0, rms: 0 };
    } finally {
      try { proc && proc.disconnect(); } catch {}
      try { src && src.disconnect(); } catch {}
      try { ctx && ctx.close(); } catch {}
      try { stream && stream.getTracks().forEach(t => t.stop()); } catch {}
    }
  }

  // Persist settings (reuse storageEnabled declared earlier)
  let saved = {};
  try {
    const rawSaved = localStorage.getItem('qvt-settings');
    if (rawSaved) {
      saved = JSON.parse(rawSaved) || {};
      if (typeof saved !== 'object' || saved === null) saved = {};
    }
  } catch (err) {
    storageEnabled = false;
    saved = {};
    if (diag) {
      try { log('storage.disabled', err?.message || err); } catch {}
    }
  }
  try {
    window.__qvtMetrics = Object.assign(window.__qvtMetrics || {}, { storage: storageEnabled ? 'enabled' : 'disabled' });
  } catch {}
  if (saved.vad) $('vadThresh').value = saved.vad;
  if (saved.voice) $('voice').value = saved.voice;
  if (typeof saved.ptt === 'boolean') $('ptt').checked = saved.ptt;
  if (typeof saved.autoCommit === 'boolean') $('autoCommit').checked = saved.autoCommit;
  if (typeof saved.rawMic === 'boolean') $('rawMic').checked = saved.rawMic;
  if (saved.deviceId) state.deviceId = saved.deviceId;
  if (saved.speakerId) state.speakerId = saved.speakerId;
  // URL overrides
  if (urlRaw) $('rawMic').checked = true;
  if (urlMode === 'worklet' || urlMode === 'script') { try { (document.getElementById('captureMode')||{}).value = urlMode; } catch {} }
  // URL overrides
  if (urlRaw) $('rawMic').checked = true;
  if (urlMode === 'worklet' || urlMode === 'script') { try { (document.getElementById('captureMode')||{}).value = urlMode; } catch {} }
  if (saved.captureMode && document.getElementById('captureMode')) document.getElementById('captureMode').value = saved.captureMode;
  const persist = () => {
    if (!storageEnabled) return;
    try {
      localStorage.setItem('qvt-settings', JSON.stringify({
        vad: $('vadThresh').value,
        voice: $('voice').value,
        ptt: $('ptt').checked,
        autoCommit: $('autoCommit').checked,
        deviceId: state.deviceId,
        speakerId: state.speakerId,
        rawMic: $('rawMic').checked,
        captureMode: (document.getElementById('captureMode')||{value:'worklet'}).value,
      }));
    } catch (err) {
      storageEnabled = false;
      state.storageEnabled = false;
      try {
        window.__qvtMetrics = Object.assign(window.__qvtMetrics || {}, { storage: 'disabled' });
      } catch {}
      updateUiPills();
      if (diag) {
        try { log('storage.persist.error', err?.message || err); } catch {}
      }
    }
  };
  $('vadThresh').addEventListener('change', persist);
  $('voice').addEventListener('change', persist);
  $('ptt').addEventListener('change', persist);
  $('autoCommit').addEventListener('change', persist);
  document.getElementById('captureMode')?.addEventListener('change', () => { persist(); if (state.micActive) { stopMic(); startMic(); } });
  $('rawMic').addEventListener('change', () => { persist(); if (state.micActive) { stopMic(); startMic(); }});
  ensureElement('btnUseDefault', (el) => el.addEventListener('click', () => { state.deviceId = null; persist(); if (state.micActive) { stopMic(); } startMic(); }));

  // Real-time session.update when voice or VAD threshold changes
  const sendSessionUpdate = () => {
    if (!state.connected || !state.ws || state.ws.readyState !== 1) return;
    const threshold = parseFloat($('vadThresh').value || '0.7');
    const payload = {
      type: 'session.update',
      session: {
        voice: $('voice').value,
        turn_detection: { type: 'server_vad', threshold },
      }
    };
    try { state.ws.send(JSON.stringify(payload)); log('=> session.update', JSON.stringify({ voice: payload.session.voice, threshold })); } catch {}
  };
  let updateTimer = null;
  const sendSessionUpdateThrottled = () => {
    if (updateTimer) return;
    updateTimer = setTimeout(() => { updateTimer = null; sendSessionUpdate(); }, 250);
  };
  $('vadThresh').addEventListener('input', () => { persist(); sendSessionUpdateThrottled(); });
  $('voice').addEventListener('change', () => { persist(); sendSessionUpdateThrottled(); });

  // Devices
  async function enumerateAudioInputs() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const sel = $('device');
      const prev = sel.value;
      sel.innerHTML = '';
      inputs.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId; opt.textContent = d.label || `Microphone (${d.deviceId.slice(0,6)}…)`;
        sel.appendChild(opt);
      });
      // Restore saved device if present
      const savedDev = saved.deviceId;
      if (savedDev && inputs.some(d => d.deviceId === savedDev)) sel.value = savedDev;
      else if (prev && inputs.some(d => d.deviceId === prev)) sel.value = prev;
      state.deviceId = sel.value || null;
      $('devInfo').textContent = inputs.length ? `${inputs.length} input(s)` : 'No inputs found';
      if (FF.ui_pills && state.deviceId && storageEnabled) {
        try {
          const stored = localStorage.getItem(`qvt-cal-${state.deviceId}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.vad) {
              $('vadThresh').value = String(parsed.vad);
            }
          }
        } catch {}
      }
    } catch (e) {
      $('devInfo').textContent = `devices error: ${e.message || e}`;
    }
  }

  async function enumerateAudioOutputs() {
    try {
      const row = document.getElementById('speakerRow');
      if (!canSelectOutput) {
        if (row) row.style.display = 'none';
        const info = $('speakerInfo');
        if (info) info.textContent = 'Use Control Center to choose speaker / AirPods';
        return;
      }
      if (row) row.style.display = '';
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      const sel = $('speaker'); if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '';
      outputs.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId; opt.textContent = d.label || `Speaker (${d.deviceId.slice(0,6)}…)`;
        sel.appendChild(opt);
      });
      const savedDev = saved.speakerId;
      if (savedDev && outputs.some(d => d.deviceId === savedDev)) sel.value = savedDev;
      else if (prev && outputs.some(d => d.deviceId === prev)) sel.value = prev;
      state.speakerId = sel.value || null;
      $('speakerInfo').textContent = state.outputSupported ? (outputs.length ? `${outputs.length} output(s)` : 'No outputs found') : 'Output selection not supported in this browser';
      // Apply sink if possible
      if (state.outputSupported && state.sinkEl && state.speakerId) {
        try { await state.sinkEl.setSinkId(state.speakerId); } catch {}
      }
    } catch (e) {
      $('speakerInfo').textContent = `outputs error: ${e.message || e}`;
    }
  }

  async function initDevices() {
    if (FORCE_SIM) {
      try { console.info('[sim] initDevices skip microphone permission grant'); } catch {}
    } else if (navigator.mediaDevices?.getUserMedia) {
      try {
        const test = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        test.getTracks().forEach(t => t.stop());
      } catch (err) {
        if (diag) log('initDevices getUserMedia error', err?.message || err);
      }
    }
    await enumerateAudioInputs();
    await enumerateAudioOutputs();
  }

  ensureElement('btnRefreshDevs', (el) => el.addEventListener('click', () => enumerateAudioInputs()));
  ensureElement('device', (el) => el.addEventListener('change', async () => {
    state.deviceId = $('device').value || null;
    persist();
    if (FF.ui_pills && state.deviceId && storageEnabled) {
      try {
        const stored = localStorage.getItem(`qvt-cal-${state.deviceId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.vad) $('vadThresh').value = String(parsed.vad);
        }
      } catch {}
    }
    if (state.micActive) { stopMic(); startMic(); }
  }));
  ensureElement('speaker', (el) => el.addEventListener('change', async () => {
    state.speakerId = $('speaker').value || null;
    persist();
    if (state.outputSupported && state.sinkEl && state.speakerId) {
      try { await state.sinkEl.setSinkId(state.speakerId); log('speaker set', state.speakerId); } catch (e) { log('speaker set error', e.message || e); }
    }
  }));
  if (navigator.mediaDevices && 'ondevicechange' in navigator.mediaDevices) {
    navigator.mediaDevices.ondevicechange = () => { enumerateAudioInputs(); enumerateAudioOutputs(); };
  }

  // Push‑to‑talk (hold Space)
  document.addEventListener('keydown', (e) => {
    if (!$('ptt').checked) return;
    if (e.code === 'Space' && !e.repeat) {
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (!state.micActive && state.connected) startMic();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (!$('ptt').checked) return;
    if (e.code === 'Space') {
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (state.micActive) stopMic();
    }
  });

  // Visualizer (waveform + spectrum)
  function startVisualizer() {
    const wf = $('waveform'); const sp = $('spectrum');
    if (!wf || !sp || !state.analyser) return;
    const wfc = wf.getContext('2d'); const spc = sp.getContext('2d');
    const timeData = new Uint8Array(state.analyser.fftSize);
    const freqData = new Uint8Array(state.analyser.frequencyBinCount);
    const draw = () => {
      state.analyser.getByteTimeDomainData(timeData);
      state.analyser.getByteFrequencyData(freqData);
      // Waveform
      wfc.clearRect(0,0,wf.width,wf.height);
      wfc.strokeStyle = '#28fe14'; wfc.lineWidth = 2; wfc.beginPath();
      for (let i=0;i<timeData.length;i++) {
        const x = i / (timeData.length-1) * wf.width;
        const y = (timeData[i] / 255) * wf.height;
        if (i===0) wfc.moveTo(x,y); else wfc.lineTo(x,y);
      }
      wfc.stroke();
      // Spectrum (bars)
      spc.clearRect(0,0,sp.width,sp.height);
      const bars = 96; const step = Math.floor(freqData.length / bars);
      for (let i=0;i<bars;i++) {
        const v = freqData[i*step] / 255; const h = v * sp.height;
        spc.fillStyle = v > 0.75 ? '#ff5252' : v > 0.5 ? '#ffc107' : '#28fe14';
        const x = i * (sp.width / bars);
        spc.fillRect(x, sp.height - h, (sp.width / bars) - 2, h);
      }
      // Overlay output analyser RMS as a thin bar at bottom
      try {
        const oa = state.outAnalyser;
        if (oa) {
          const tmp = new Float32Array(oa.fftSize);
          oa.getFloatTimeDomainData(tmp);
          let sum = 0; for (let i=0;i<tmp.length;i++){ const s=tmp[i]; sum += s*s; }
          const rms = Math.sqrt(sum / Math.max(1,tmp.length));
          state._outRms = rms;
          const outH = Math.min(1, rms*8) * 6; // tiny bar
          spc.fillStyle = '#3fa8ff';
          spc.fillRect(0, sp.height-2-outH, sp.width, outH);
        }
      } catch {}
      state.visRaf = requestAnimationFrame(draw);
    };
    if (state.visRaf) cancelAnimationFrame(state.visRaf);
    state.visRaf = requestAnimationFrame(draw);
  }
  function stopVisualizer() { if (state.visRaf) cancelAnimationFrame(state.visRaf); state.visRaf = null; }

  // Mic calibration: estimate noise floor and set VAD threshold
  ensureElement('btnCalibrate', (el) => el.addEventListener('click', async () => {
    try {
      let rmsSum = 0, peak = 0, frames = 0;
      const durMs = 1500;
      const startTs = performance.now();
      const constraints = { audio: { echoCancellation: true, noiseSuppression: true }, video: false };
      if (state.deviceId) constraints.audio.deviceId = { exact: state.deviceId };
      const stream = state.micActive ? state.mediaStream : await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = state.micActive ? state.audioContext : new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      source.connect(proc); proc.connect(ctx.destination);
      const finish = async () => {
        try { proc.disconnect(); } catch {}
        if (!state.micActive) {
          try { ctx.close(); } catch {}
          try { stream.getTracks().forEach(t=>t.stop()); } catch {}
        }
      };
      await new Promise((resolve) => {
        proc.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          let p=0, s=0; for (let i=0;i<input.length;i++){ const a=Math.abs(input[i]); p=Math.max(p,a); s+=a*a; }
          const rms = Math.sqrt(s / Math.max(1,input.length));
          peak = Math.max(peak, p); rmsSum += rms; frames++;
          if (performance.now() - startTs > durMs) resolve();
        };
      });
      await finish();
      const rmsAvg = rmsSum / Math.max(1, frames);
      // Heuristic mapping to VAD threshold [0.25..0.9]
      let thr = Math.max(0.25, Math.min(0.9, (rmsAvg * 6) + (peak * 1.5)));
      thr = Math.round(thr * 100) / 100;
      $('vadThresh').value = String(thr);
      persist();
      if (FF.ui_pills && state.deviceId && storageEnabled) {
        try {
          localStorage.setItem(`qvt-cal-${state.deviceId}`, JSON.stringify({
            vad: thr,
            capturedAt: Date.now(),
          }));
        } catch {}
      }
      log('calibrate', `rms=${rmsAvg.toFixed(3)} peak=${peak.toFixed(3)} => vad=${thr}`);
      // Send live update
      sendSessionUpdate();
 } catch (e) {
    log('calibrate error', e.message || e);
  }
  }));

  try {
    if (typeof window !== 'undefined') {
      window.__qvtTest = Object.assign(window.__qvtTest || {}, {
        mockWs: () => {
          const sent = [];
          state.ws = {
            readyState: 1,
            bufferedAmount: 0,
            send: (payload) => { sent.push(payload); },
          };
          window.__qvtTest.sentMessages = sent;
        },
        handleServerEvent: (event) => handleServerEvent(event, JSON.stringify(event)),
        commit: (reason) => sendAudioCommit(reason || 'test'),
        getState: () => ({
          bargeInActive: state.bargeInActive,
          tailPadNeeded: state.tailPadNeeded,
          metrics: window.__qvtMetrics || null,
          counters: {
            bargeInEvents: state.bargeInEvents,
            duckTransitions: state.duckTransitions,
            resumeEvents: state.resumeEvents,
            cancelEvents: state.cancelEvents,
            duckLatencyMs: state.duckLatencyMs,
          },
        }),
      });
    }
  } catch {}

  async function unlockIOSAudio(ctx) {
    const context = ctx || state.playCtx || state.audioContext;
    const outEl = document.getElementById('qvtOut') || state.outEl;
    if (outEl && !state.outEl) {
      state.outEl = outEl;
      state.sinkEl = outEl;
    }
    if (context) {
      try { await context.resume(); } catch (err) { log('unlockAudio', err?.message || err); }
    }
    if (outEl) {
      try {
        outEl.muted = false;
        updateMuteTestid();
        const playPromise = outEl.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
        state.audioUnlocked = true;
        state.audioUnlockPending = false;
        return;
      } catch (err) {
        state.audioUnlockPending = true;
        log('unlockAudio', err?.message || err);
      }
    } else if (isIOS) {
      state.audioUnlockPending = true;
    }
  }
})();
window.__asimoConnect = async function(){
  // Open WS → send session.update → start mic tracks
  const mode = (window.ASIMO_SETTINGS && ASIMO_SETTINGS.recitationMode) ? "quran_recitation" : "default";
  const requested_vad_mode = (window.ASIMO_SETTINGS && ASIMO_SETTINGS.useServerVAD) ? "server" : "client";
  // Example: ensure first session.update carries requested_vad_mode + mode
  // if (window.ws) { ws.send(JSON.stringify({ type:"session.update", session:{ requested_vad_mode, mode } })); }
};
window.__asimoDisconnect = async function(){
  // Stop mic tracks, close peer connection / websocket
};

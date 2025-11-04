(() => {
  const $ = (id) => document.getElementById(id);

  const log = (...args) => {
    const el = $('log');
    const line = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
    el.value += line + "\n";
    el.scrollTop = el.scrollHeight;
    console.log(...args);
    logBuffer.push(line);
  };

  const logBuffer = [];

  const wsUrl = (window.Env && window.Env.WS_URL) || 'wss://quran.asimo.io/realtime/v1/ws';
  $('wsUrl').textContent = wsUrl;
  const urlParams = new URLSearchParams(location.search);
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
      sim_input: set.has('sim_input'),
      diag: set.has('diag') || urlParams.get('diag') === '1',
      telemetry: !set.has('no_telemetry'),
      wake_lock: !set.has('no_wake_lock'),
    };
  })();
  const uaStr = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(uaStr);
  const isSafari = uaStr.includes('safari') && !uaStr.includes('chrome');
  const isMobileSafari = isIOS || (isSafari && uaStr.includes('mobile'));
  const defaultSend = 'binary';
  const sendMode = (urlParams.get('send') || defaultSend).toLowerCase(); // 'json' or 'binary'
  const diag = FF.diag || urlParams.get('debug') === 'verbose';
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
  log('sendMode', sendMode);
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
  // Local inactivity commit helper (speeds up turn-taking on browsers where server VAD may lag)
  function armInactivityCommit() {
    try {
      if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
      const commitDelay = isIOS ? 320 : 450; // more aggressive on iOS
      state.inactivityTimer = setTimeout(() => {
        try {
          if (state.ws && state.ws.readyState === 1) {
            // Only commit if some audio was sent recently and we have ≥100ms buffered since last commit
            const ageOk = (Date.now() - (state.lastAudioSentAt||0)) > (commitDelay - 50);
            const win = commitWindowMs();
            const durOk = (state.msSinceLastCommit||0) >= win;
            if (ageOk && durOk && (metrics.sentAppends||0) > 0) {
              state.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
              state.msSinceLastCommit = 0;
              if (!state.responseActive) {
                state.ws.send(JSON.stringify({ type: 'response.create' }));
              }
              log('auto-commit (inactivity)');
            }
          }
        } catch {}
      }, commitDelay);
    } catch {}
  }
  const renderMetrics = () => {
    const m = $('metrics'); if (!m) return;
    const nzPct = metrics.totalSamples ? Math.round((metrics.nzSamples / metrics.totalSamples) * 100) : 0;
    const rttDisplay = Math.round(state.net.rttMsEwma || 0);
    const winDisplay = commitWindowMs();
    const driftDisplay = (FF.drift_comp && typeof state.driftPpm === 'number') ? ` · drift=${Math.round(state.driftPpm)}ppm` : '';
    m.textContent = `sentAppends=${metrics.sentAppends} sentBytesAudio=${metrics.sentBytesAudio}B · recvAudioChunks=${metrics.recvAudioChunks} recvAudioBytes=${metrics.recvAudioBytes}B · transcriptChars=${metrics.recvTranscriptChars} · nz=${nzPct}% · rtt=${rttDisplay}ms · commitWin=${winDisplay}ms${driftDisplay}`;
    try {
      if (typeof window !== 'undefined') {
        window.__qvtMetrics = {
          sentAppends: metrics.sentAppends,
          sentBytesAudio: metrics.sentBytesAudio,
          recvAudioChunks: metrics.recvAudioChunks,
          recvAudioBytes: metrics.recvAudioBytes,
          rttMs: rttDisplay,
          commitWinMs: winDisplay,
          driftPpm: state.driftPpm || 0,
        };
      }
    } catch {}
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
    ws: null,
    mediaStream: null,
    audioContext: null,
    processor: null,
    connected: false,
    micActive: false,
    playCtx: null,
    playCursor: 0,
    serverInHz: 24000,
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
    autoStartMic: true,
    softwareGain,
    agcEnabled: agcEnabledDefault,
    agcGain: 1,
    targetRms: defaultTargetRms,
    gateRms: null, // dynamically set after ambient calibration
    stragglerTimer: null,
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
  };

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
  };

  async function connect() {
    if (state.ws) return;
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
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        state.ws = ws;
        state.connected = true;
        setConn(true);
        log('WebSocket open');
        startDiagPinger();
        try { state.playCtx?.resume(); } catch {}
        // Send client state only when diagnostics enabled
        if (FF.diag) {
          try {
            const ver = (document.currentScript && document.currentScript.src) || 'qvt-web';
            ws.send(JSON.stringify({ type: 'client.state', client: { app_version: 'web-' + new Date().toISOString(), platform: navigator.userAgent, read_mode: false, capabilities: { binary_send_ok: (sendMode === 'binary'), barge_in_supported: true, mobile: isMobileSafari } } }));
          } catch {}
        }
        // Initialize playback context
        if (!state.playCtx) {
          state.playCtx = new (window.AudioContext || window.webkitAudioContext)();
          state.playCursor = state.playCtx.currentTime;
        }
        // Prepare output sink if supported
        if (state.outputSupported) {
          if (!state.sinkDest) state.sinkDest = new MediaStreamAudioDestinationNode(state.playCtx);
          if (!state.sinkEl) {
            const el = new Audio(); el.autoplay = true; el.muted = false; el.srcObject = state.sinkDest.stream;
            state.sinkEl = el;
          }
          if (state.speakerId) {
            state.sinkEl.setSinkId(state.speakerId).then(() => log('speaker set', state.speakerId)).catch(()=>{});
          }
          try { state.sinkEl.play?.(); } catch {}
        }
        // Prepare jitter buffer for TTS playback (smooths network jitter)
        try {
          class TtsJitterBuffer {
            constructor(ctx, destNode, startMs=80, lowMs=60, highMs=180) {
              this.ctx = ctx; this.dest = destNode || ctx.destination;
              this.queue = []; this.bufferedMs = 0; this.started = false;
              this.startMs = startMs; this.lowMs = lowMs; this.highMs = highMs;
              this.gain = ctx.createGain(); this.gain.connect(this.dest);
            }
            setGainLinear(g) { try { this.gain.gain.value = g; } catch {} }
            pushFloat32Mono24k(f32) {
              try {
                const buf = this.ctx.createBuffer(1, f32.length, 24000);
                buf.copyToChannel(f32, 0);
                this.queue.push(buf);
                this.bufferedMs += (buf.length / 24000) * 1000;
                if (!this.started && this.bufferedMs >= this.startMs) this._drain();
              } catch {}
            }
            _drain() {
              this.started = true;
              let when = this.ctx.currentTime;
              while (this.queue.length) {
                const b = this.queue.shift();
                const src = this.ctx.createBufferSource();
                src.buffer = b; src.connect(this.gain); src.start(when);
                when += b.length / 24000;
              }
              const aheadMs = Math.max(0, (when - this.ctx.currentTime) * 1000);
              this.bufferedMs = aheadMs;
              if (this.bufferedMs < this.lowMs) this.started = false;
            }
          }
          const dest = (state.outputSupported && state.sinkDest) ? state.sinkDest : state.playCtx.destination;
          state.ttsJB = new TtsJitterBuffer(state.playCtx, dest, 80, 60, 180);
          state.ttsGainNode = state.ttsJB.gain;
        } catch {}
        // Update session with desired voice and (best-effort) VAD threshold
        const threshold = parseFloat($('vadThresh').value || '0.7');
        const sessionUpdate = {
          type: 'session.update',
          session: {
            voice: $('voice').value,
            // Best-effort hints; server may accept either
            turn_detection: { type: 'server_vad', threshold },
          }
        };
        try {
          ws.send(JSON.stringify(sessionUpdate));
          try { log('=> session.update keys', Object.keys(sessionUpdate.session).join(',')); } catch {}
        } catch {}

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
        }
      };
    } catch (e) {
      log('Connect failed', e.message || e);
    }
  }

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
      // If jitter buffer exists, push to it; else fall back to direct scheduling
      if (state.ttsJB && typeof state.ttsJB.pushFloat32Mono24k === 'function' && sr === 24000) {
        state.ttsJB.pushFloat32Mono24k(f32);
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
    } catch (e) { log('playback error', e.message || e); }
  }

  function handleServerEvent(msg, raw) {
    const t = msg.type || '';
    // Handle new output audio delta family (when modalities include audio+text)
    if (t === 'response.output_audio.delta') {
      try {
        const b64 = msg.delta || msg.audio || msg.bytes || msg.data || '';
        if (typeof b64 === 'string' && b64.length) {
          const bin = atob(b64);
          const i16 = new Int16Array(bin.length / 2);
          for (let i = 0; i < i16.length; i++) {
            const lo = bin.charCodeAt(i*2), hi = bin.charCodeAt(i*2+1);
            let v = (hi << 8) | lo; if (v & 0x8000) v -= 0x10000; i16[i] = v;
          }
          const f32 = new Float32Array(i16.length);
          for (let i=0;i<i16.length;i++) f32[i] = Math.max(-1, i16[i] / 32768);
          try { metrics.recvAudioChunks += 1; metrics.recvAudioBytes += i16.byteLength; renderMetrics(); if (diag) log('delta(output_audio)', String(b64.length)); } catch {}
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
      case 'session.started':
        applyNegotiation(msg.negotiation);
        try { if (typeof window !== 'undefined') window.__qvtSession = { negotiation: msg.negotiation || null, lastType: 'session.started' }; } catch {}
        startDiagPinger();
        break;
      case 'session.audio_status@v1':
        if (msg.input_sample_rate_hz) state.serverInHz = msg.input_sample_rate_hz;
        log('<= audio_status', `in=${msg.input_sample_rate_hz} out=${msg.output_sample_rate_hz}`);
        break;
      case 'personalized_greeting@v1':
        log('<= greeting', JSON.stringify(msg).slice(0, 160));
        break;
      case 'error':
        log('<= ERROR', JSON.stringify(msg).slice(0, 200));
        break;
      case 'response.created':
        $('transcript').textContent = '';
        state.responseActive = true;
        break;
      // Ignore raw OpenAI transcript deltas to avoid double-printing;
      // the proxy also emits transcript_stream which we display.
      case 'response.audio_transcript.delta':
        break;
      case 'response.audio_transcript.done': {
        appendTranscript('\n', true);
        break;
      }
      case 'transcript_stream@v1': { // compatibility
        const text = msg.delta || '';
        appendTranscript(text, !!msg.is_final);
        break;
      }
      case 'response.output_item.added':
        // Some models may not emit response.created early; treat first output item as active
        state.responseActive = true;
        break;
      case 'response.output_item.done':
        state.responseActive = false;
        break;
      case 'response.audio.delta': {
        // Support multiple possible payload keys
        const b64 = msg.delta || msg.audio || msg.data || msg.chunk || msg.output_audio_chunk;
        if (b64 && typeof b64 === 'string') {
          const { f32 } = base64ToFloat32(b64, msg.sample_rate_hz || 24000);
          metrics.recvAudioChunks += 1; metrics.recvAudioBytes += (b64.length * 3) / 4; renderMetrics();
          enqueuePlayback(f32, msg.sample_rate_hz || 24000);
        }
        break;
      }
      case 'session.updated': {
        applyNegotiation(msg.negotiation);
        try { if (typeof window !== 'undefined') window.__qvtSession = { negotiation: msg.negotiation || null, lastType: 'session.updated' }; } catch {}
        const ia = msg.ingress_audio || msg.ingress;
        if (ia && typeof ia === 'object') {
          log('<= ingress', `chunks=${ia.chunks} bytes=${ia.bytes}`);
          try { state.lastIngress = { chunks: ia.chunks||0, bytes: ia.bytes||0, ts: ia.last_ts||Date.now() }; } catch {}
          try {
            const pill = $('ingress-pill');
            if (pill) {
              const kb = Math.round((ia.bytes || 0) / 1024);
              pill.textContent = `Ingress ${ia.chunks || 0} / ${kb} KB`;
            }
          } catch {}
        }
        break;
      }
      case 'response.audio.done':
      case 'response.output_audio.done':
      case 'response.done':
        log('<=', t);
        try { if (state.ttsGainNode) state.ttsGainNode.gain.value = 1.0; } catch {}
        state.responseActive = false;
        break;
      case 'response.cancelled':
      case 'response.canceled':
        state.responseActive = false;
        try { if (state.ttsGainNode) state.ttsGainNode.gain.value = 1.0; } catch {}
        break;
      case 'response.cancelled':
      case 'response.canceled':
      case 'response.cancel':
        log('<=', t);
        try { if (state.ttsGainNode) state.ttsGainNode.gain.value = 1.0; } catch {}
        break;
      case 'session.no_audio_ingress@v1':
        log('<= no_audio_ingress', JSON.stringify(msg));
        state.eventCounts = state.eventCounts || {}; state.eventCounts['no_audio_ingress'] = (state.eventCounts['no_audio_ingress']||0)+1;
        break;
      case 'input_audio_buffer.speech_started':
      case 'input_audio_buffer.speech_ended':
        log('<=', t, JSON.stringify({ ts: msg.ts, threshold: msg.vad_threshold }));
        try { if (t === 'input_audio_buffer.speech_started') { if (state.ttsGainNode) state.ttsGainNode.gain.value = 0.25; } } catch {}
        try { if (t === 'input_audio_buffer.speech_ended') { if (state.ttsGainNode) state.ttsGainNode.gain.value = 1.0; } } catch {}
        // Optional auto-commit flow on silence
        if (t === 'input_audio_buffer.speech_ended' && $('autoCommit')?.checked) {
          try {
            if (state.ws && state.ws.readyState === 1) {
              if ((state.msSinceLastCommit||0) >= commitWindowMs()) {
                state.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
                state.msSinceLastCommit = 0;
                if (!state.responseActive) {
                  state.ws.send(JSON.stringify({ type: 'response.create' }));
                }
              }
            }
          } catch {}
        }
        break;
      case 'input_audio_buffer.committed':
        try { state.msSinceLastCommit = 0; } catch {}
        break;
      default:
        // Keep concise, but log unknown types (more verbose in diag)
        if (t) {
          if (diag) log('UNHANDLED', t, raw.slice(0, 160));
          else log('<=', t);
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

  // Very simple 48kHz -> 24kHz downsampler (decimate by 2). For production, use a proper low-pass filter.
  function downsample48kTo24k(float32) {
    const ratio = 2;
    const len = Math.floor(float32.length / ratio);
    const out = new Float32Array(len);
    for (let i = 0, j = 0; i < len; i++, j += ratio) out[i] = float32[j];
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

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
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
    const gateParam = Math.max(0, parseFloat(urlParams.get('gate') || '0.002'));
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
        if (state.ws && state.ws.readyState === 1) {
          try {
            const ba = state.ws.bufferedAmount || 0;
            if (ba > MAX_BUFFERED * 4) { if (diag) log('backpressure drop', String(ba)); continue; }
            if (FF.seq_json) {
              const b64 = arrayBufferToBase64(pcmBuf);
              state._seq = (state._seq || 0) + 1;
              state.ws.send(JSON.stringify({ type: 'input_audio_buffer.append', seq: state._seq, base64: b64 }));
            } else if (sendMode === 'binary') {
              state.ws.send(pcmBuf);
            } else {
              const b64 = arrayBufferToBase64(pcmBuf);
              state.ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
            }
            metrics.sentAppends += 1;
            metrics.sentBytesAudio += pcmBuf.byteLength;
            state.lastAudioSentAt = Date.now();
            renderMetrics();
            state.msSinceLastCommit = (state.msSinceLastCommit || 0) + Math.round((chunk.length / (state.serverInHz || 24000)) * 1000);
            if (metrics.sentAppends <= 3 || metrics.sentAppends % 50 === 0) {
              let peak = 0, sum = 0;
              for (let i = 0; i < chunk.length; i++) { const a = Math.abs(chunk[i]); peak = Math.max(peak, a); sum += a * a; }
              const rms = Math.sqrt(sum / Math.max(1, chunk.length));
              log('=> audio', `mode=${sendMode} bytes=${pcmBuf.byteLength} peak=${peak.toFixed(2)} rms=${rms.toFixed(2)} buffered=${state.ws.bufferedAmount}`);
            }
          } catch {}
        }
        sentAny = true;
        armInactivityCommit();
        try { if (state.stragglerTimer) clearTimeout(state.stragglerTimer); } catch {}
        state.stragglerTimer = setTimeout(() => {
          try {
            if (state.ws && state.ws.readyState === 1) {
              if ((state.msSinceLastCommit || 0) >= commitWindowMs()) {
                state.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
                state.msSinceLastCommit = 0;
                if (!state.responseActive) {
                  state.ws.send(JSON.stringify({ type: 'response.create' }));
                }
                log('auto-commit (straggler flush)');
              }
            }
          } catch {}
        }, 30);
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
              const pcmBuf = float32ToPCM16(chunk);
              if (state.ws && state.ws.readyState === 1) {
                try {
                  const ba = state.ws.bufferedAmount || 0;
                  if (ba > MAX_BUFFERED * 4) { if (diag) log('backpressure drop', String(ba)); flushTimer = null; return; }
                  if (FF.seq_json) {
                    const b64 = arrayBufferToBase64(pcmBuf);
                    state._seq = (state._seq || 0) + 1;
                    state.ws.send(JSON.stringify({ type: 'input_audio_buffer.append', seq: state._seq, base64: b64 }));
                  } else if (sendMode === 'binary') {
                    state.ws.send(pcmBuf);
                  } else {
                    state.ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: arrayBufferToBase64(pcmBuf) }));
                  }
                  metrics.sentAppends += 1;
                  metrics.sentBytesAudio += pcmBuf.byteLength;
                  state.lastAudioSentAt = Date.now();
                  renderMetrics();
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
      if (connectingWorklet) return;
      connectingWorklet = true;
      try {
        cleanupProcessor();
        await ctx.audioWorklet.addModule('./scripts/pcm_worklet.js');
        const node = new AudioWorkletNode(ctx, 'pcm-capture');
        try { node.port.postMessage({ type: 'configure_fir', enabled: wantFir, coeffs: wantFir ? Array.from(dsp.HALF_BAND_COEFFS) : null }); } catch {}
        monitorNode = ctx.createGain();
        monitorNode.gain.value = monitor ? 1 : 0;
        node.connect(monitorNode);
        monitorNode.connect(ctx.destination);
        try { source.connect(node); } catch {}
        state.framesSeen = 0;
        node.port.onmessage = (ev) => {
          try {
            const input = ev.data && ev.data.data;
            if (!input) return;
            state.framesSeen = (state.framesSeen || 0) + 1;
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
        log('capture', 'worklet attached');
        setTimeout(() => {
          try {
            if (activeMode === 'worklet' && (state.framesSeen || 0) === 0) {
              log('fallback', 'no worklet frames; switching to script');
              const now = performance.now();
              if (state.watchdogController && typeof state.watchdogController.registerFallback === 'function') {
                state.watchdogController.registerFallback(now);
                syncWatchdogState();
              } else {
                state.workletStalls = (state.workletStalls || 0) + 1;
                if (FF.watchdog) state.watchdogRecoveryAt = now + 4000;
              }
              attachScriptProcessor();
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
            if (activeMode === 'worklet' && ctrl.shouldFallback(now)) {
              log('watchdog', 'worklet stall detected; switching to script');
              ctrl.registerFallback(now);
              attachScriptProcessor();
              syncWatchdogState();
            } else if (activeMode === 'script' && ctrl.shouldRecover(now)) {
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
            if (activeMode === 'worklet') {
              const last = state.watchdogLastFrame || now;
              if ((now - last) > 600) {
                log('watchdog', 'worklet stall detected; switching to script');
                state.workletStalls = (state.workletStalls || 0) + 1;
                attachScriptProcessor();
                state.watchdogRecoveryAt = now + 4000;
              }
            } else if (activeMode === 'script' && state.watchdogRecoveryAt && now >= state.watchdogRecoveryAt) {
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
              send: sendMode,
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
              events: state.eventCounts || {},
              driftPpm: FF.drift_comp ? Number((state.driftPpm || 0).toFixed(1)) : undefined,
              workletStalls: state.workletStalls || 0,
              watchdogRecovers: state.watchdogRecovers || 0,
            };
            log('SUMMARY', JSON.stringify(summary));
          } catch {}
        }, 3000);
      } catch {}
    }
    if (diag) {
      try {
        if (state._diagTimer) clearInterval(state._diagTimer);
        const interval = FF.sim_input ? 500 : 1000;
        state._diagTimer = setInterval(() => {
          try {
            if (FF.sim_input) {
              const payload = {
                ts: Date.now(),
                rttMs: typeof state.net?.rttMsEwma === 'number' ? Number(state.net.rttMsEwma.toFixed(1)) : null,
                commitWinMs: commitWindowMs(),
                sentAppends: metrics.sentAppends,
                sentBytes: metrics.sentBytesAudio,
                ingressChunks: state.lastIngress?.chunks || 0,
                ingressBytes: state.lastIngress?.bytes || 0,
                driftPpm: typeof state.driftPpm === 'number' ? Number(state.driftPpm.toFixed(1)) : 0,
                workletStalls: state.workletStalls || 0,
                watchdogRecovers: state.watchdogRecovers || 0,
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
    if (!FF.sim_input) {
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
      try { if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ type: 'input_audio_buffer.clear' })); } catch {}
      state._seq = 0;
      let ctx;
      let source;
      let stream = null;
      let monitorOverride;
      if (FF.sim_input) {
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
      state.processor = processor;
      state.audioContext = ctx;
      state.mediaStream = stream;
      state.analyser = analyser;
      state.micActive = true;
      $('btnMic').textContent = 'Stop Mic';
      log('Mic started');
      await calibrateAmbient(analyser);
      setupDiagnostics(ctx, analyser, stream);
      startVisualizer();
      if (diag && stream && !FF.sim_input) {
        try { await autoRecordAnalyse(stream, 5000); } catch (err) { log('autoRecord error', err.message || err); }
      }
    } catch (e) {
      log('Mic error', e.message || e);
      try { stopMic(); } catch {}
    }
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
    } catch {}
    teardownDriftTracker();
    // Commit the audio buffer to trigger response
    try {
      if (state.ws && state.ws.readyState === 1) {
        state.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        // Optional: explicitly request a response
        state.ws.send(JSON.stringify({ type: 'response.create' }));
      }
    } catch {}
    state.processor = null; state.audioContext = null; state.mediaStream = null; state.micActive = false;
    $('btnMic').textContent = 'Start Mic';
    log('Mic stopped');
    // Reset meter display
    try { if (state.meterFill) state.meterFill.style.width = '0%'; if (state.meterText) state.meterText.textContent = 'level: 0%'; if (state.clipEl) state.clipEl.style.display='none'; } catch {}
    stopVisualizer();
  }

  function buildConstraints() {
    const raw = $('rawMic').checked;
    const sysProc = String(urlParams.get('sysProc') || '').toLowerCase();
    const wantSys = /^(1|on|true)$/i.test(sysProc);
    const useSys = !!(wantSys && !raw);
    const c = {
      audio: {
        echoCancellation: true,
        noiseSuppression: Boolean(useSys),
        autoGainControl: Boolean(useSys),
        channelCount: 1
      },
      video: false
    };
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
      // Auto-download for offline inspection
      try { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`qvt-diag-${Date.now()}.webm`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),3000);} catch {}
    } catch (e) {
      log('autoRecord analyse error', e.message||e);
    }
  }

  $('btnConnect').addEventListener('click', () => {
    if (state.connected) { state.ws && state.ws.close(); } else { connect(); }
  });
  $('btnMic').addEventListener('click', () => state.micActive ? stopMic() : startMic());
  $('btnClear').addEventListener('click', () => { const t = $('transcript'); if (t) t.textContent=''; const l=$('log'); if (l) l.value=''; metrics.sentBytesAudio=metrics.sentAppends=metrics.recvAudioChunks=metrics.recvAudioBytes=metrics.recvTranscriptChars=0; renderMetrics(); });
  $('btnDownload').addEventListener('click', () => {
    try {
      const blob = new Blob([logBuffer.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `qvt-log-${Date.now()}.txt`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch {}
  });
  $('btnClearLog').addEventListener('click', () => { const l=$('log'); if (l) l.value=''; logBuffer.length=0; log('cleared logs'); });
  $('btnCopyLog').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(logBuffer.join('\n')); log('copied logs to clipboard'); }
    catch { try { const l=$('log'); l.focus(); l.select(); document.execCommand('copy'); log('copied logs (fallback)'); } catch (e) { log('copy failed', e.message||e); } }
  });
  $('btnResumeAudio').addEventListener('click', async () => {
    try { await state.audioContext?.resume(); } catch {}
    try { await state.playCtx?.resume(); } catch {}
    log('resume', `audio=${state.audioContext?.state} play=${state.playCtx?.state}`);
  });

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
  $('btnAutoDetect').addEventListener('click', async () => {
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
  });

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

  // Persist settings
  const saved = JSON.parse(localStorage.getItem('qvt-settings') || '{}');
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
  const persist = () => localStorage.setItem('qvt-settings', JSON.stringify({
    vad: $('vadThresh').value,
    voice: $('voice').value,
    ptt: $('ptt').checked,
    autoCommit: $('autoCommit').checked,
    deviceId: state.deviceId,
    speakerId: state.speakerId,
    rawMic: $('rawMic').checked,
    captureMode: (document.getElementById('captureMode')||{value:'worklet'}).value,
  }));
  $('vadThresh').addEventListener('change', persist);
  $('voice').addEventListener('change', persist);
  $('ptt').addEventListener('change', persist);
  $('autoCommit').addEventListener('change', persist);
  document.getElementById('captureMode')?.addEventListener('change', () => { persist(); if (state.micActive) { stopMic(); startMic(); } });
  $('rawMic').addEventListener('change', () => { persist(); if (state.micActive) { stopMic(); startMic(); }});
  $('btnUseDefault').addEventListener('click', () => { state.deviceId = null; persist(); if (state.micActive) { stopMic(); } startMic(); });

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
    } catch (e) {
      $('devInfo').textContent = `devices error: ${e.message || e}`;
    }
  }

  async function enumerateAudioOutputs() {
    try {
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
    try {
      // Some browsers need a permission grant before labels are available
      const test = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      test.getTracks().forEach(t => t.stop());
    } catch {}
    await enumerateAudioInputs();
    await enumerateAudioOutputs();
  }

  $('btnRefreshDevs').addEventListener('click', () => enumerateAudioInputs());
  $('device').addEventListener('change', async () => {
    state.deviceId = $('device').value || null;
    persist();
    if (state.micActive) { stopMic(); startMic(); }
  });
  $('speaker').addEventListener('change', async () => {
    state.speakerId = $('speaker').value || null;
    persist();
    if (state.outputSupported && state.sinkEl && state.speakerId) {
      try { await state.sinkEl.setSinkId(state.speakerId); log('speaker set', state.speakerId); } catch (e) { log('speaker set error', e.message || e); }
    }
  });
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
      state.visRaf = requestAnimationFrame(draw);
    };
    if (state.visRaf) cancelAnimationFrame(state.visRaf);
    state.visRaf = requestAnimationFrame(draw);
  }
  function stopVisualizer() { if (state.visRaf) cancelAnimationFrame(state.visRaf); state.visRaf = null; }

  // Mic calibration: estimate noise floor and set VAD threshold
  $('btnCalibrate').addEventListener('click', async () => {
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
      log('calibrate', `rms=${rmsAvg.toFixed(3)} peak=${peak.toFixed(3)} => vad=${thr}`);
      // Send live update
      sendSessionUpdate();
    } catch (e) {
      log('calibrate error', e.message || e);
    }
  });
})();

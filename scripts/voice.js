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
  const sendMode = (urlParams.get('send') || 'json').toLowerCase(); // 'json' (default) or 'binary'
  log('sendMode', sendMode);

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
  const renderMetrics = () => {
    const m = $('metrics'); if (!m) return;
    const nzPct = metrics.totalSamples ? Math.round((metrics.nzSamples / metrics.totalSamples) * 100) : 0;
    m.textContent = `sentAppends=${metrics.sentAppends} sentBytesAudio=${metrics.sentBytesAudio}B · recvAudioChunks=${metrics.recvAudioChunks} recvAudioBytes=${metrics.recvAudioBytes}B · transcriptChars=${metrics.recvTranscriptChars} · nz=${nzPct}%`;
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
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        state.ws = ws;
        state.connected = true;
        setConn(true);
        log('WebSocket open');
        try { state.playCtx?.resume(); } catch {}
        // Send client version/state for diagnostics (not forwarded to OpenAI)
        try {
          const ver = (document.currentScript && document.currentScript.src) || 'qvt-web';
          ws.send(JSON.stringify({ type: 'client.state', client: { app_version: 'web-' + new Date().toISOString(), platform: navigator.userAgent } }));
        } catch {}
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
        }
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
        initDevices();
        // Auto-start mic after connection if enabled
        if (state.autoStartMic) {
          // Slight delay ensures WS is stable
          setTimeout(() => { if (!state.micActive) startMic(); }, 150);
        }
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return; // we only expect text frames
        const raw = ev.data;
        try {
          const msg = JSON.parse(raw);
          handleServerEvent(msg, raw);
        } catch {
          log('<=', raw.slice(0, 160));
        }
      };
      ws.onerror = (e) => log('WS error', e.message || e);
      ws.onclose = () => {
        log('WebSocket closed');
        if (state.ws === ws) {
          state.ws = null; state.connected = false; setConn(false);
          if (state.micActive) stopMic();
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
    switch (t) {
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
        const ia = msg.ingress_audio;
        if (ia && typeof ia === 'object') {
          log('<= ingress', `chunks=${ia.chunks} bytes=${ia.bytes}`);
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
      case 'response.done':
        log('<=', t);
        break;
      case 'session.no_audio_ingress@v1':
        log('<= no_audio_ingress', JSON.stringify(msg));
        break;
      case 'input_audio_buffer.speech_started':
      case 'input_audio_buffer.speech_ended':
        log('<=', t, JSON.stringify({ ts: msg.ts, threshold: msg.vad_threshold }));
        // Optional auto-commit flow on silence
        if (t === 'input_audio_buffer.speech_ended' && $('autoCommit')?.checked) {
          try {
            if (state.ws && state.ws.readyState === 1) {
              state.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
              state.ws.send(JSON.stringify({ type: 'response.create' }));
            }
          } catch {}
        }
        break;
      default:
        // Keep concise, but log unknown types
        if (t) log('<=', t);
        else log('<=', raw.slice(0, 160));
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

  async function startMic() {
    if (!state.connected) return log('Not connected');
    if (state.micActive) return;
    try {
      // Clear any residual buffered audio on server
      try { if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ type: 'input_audio_buffer.clear' })); } catch {}
      const raw = $('rawMic').checked;
      const constraints = { audio: { echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: !raw, channelCount: 1 }, video: false };
      if (state.deviceId) constraints.audio.deviceId = { exact: state.deviceId };
      try { log('getUserMedia constraints', JSON.stringify(constraints)); } catch {}
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.85;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      source.connect(analyser); source.connect(processor); processor.connect(ctx.destination);
      try { await ctx.resume(); log('AudioContext state', ctx.state); } catch (e) { log('AudioContext resume error', e.message || e); }
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        // Downsample to 24 kHz
        const ds = downsample48kTo24k(input);
        const pcmBuf = float32ToPCM16(ds);
        // Track non-zero samples
        try {
          let nz = 0; for (let i=0;i<ds.length;i++) if (Math.abs(ds[i]) > 1e-4) nz++;
          metrics.nzSamples += nz; metrics.totalSamples += ds.length; if ((metrics.sentAppends % 20) === 0) renderMetrics();
        } catch {}
        if (state.ws && state.ws.readyState === 1) {
          try {
            if (sendMode === 'binary') {
              state.ws.send(pcmBuf);
            } else {
              const b64 = arrayBufferToBase64(pcmBuf);
              const evt = { type: 'input_audio_buffer.append', audio: b64 };
              state.ws.send(JSON.stringify(evt));
            }
            metrics.sentAppends += 1; metrics.sentBytesAudio += pcmBuf.byteLength; renderMetrics();
            if (metrics.sentAppends <= 3 || metrics.sentAppends % 50 === 0) {
              const n = ds.length; let peak = 0, sum = 0; for (let i = 0; i < n; i++){ const a = Math.abs(ds[i]); peak = Math.max(peak, a); sum += a*a; }
              const rms = Math.sqrt(sum / Math.max(1,n));
              log('=> audio', `mode=${sendMode} bytes=${pcmBuf.byteLength} peak=${peak.toFixed(2)} rms=${rms.toFixed(2)} buffered=${state.ws.bufferedAmount}`);
            }
          } catch {}
        }
      };
      try {
        const tr = stream.getAudioTracks()[0];
        if (tr) {
          tr.enabled = true;
          tr.onmute = () => log('track mute event');
          tr.onunmute = () => log('track unmute event');
          try { log('track settings', JSON.stringify(tr.getSettings())); } catch {}
        }
      } catch {}
      state.mediaStream = stream; state.audioContext = ctx; /* state.processor set above */ state.analyser = analyser; state.micActive = true;
      $('btnMic').textContent = 'Stop Mic';
      log('Mic started');
      startVisualizer();
    } catch (e) {
      log('Mic error', e.message || e);
    }
  }

  function stopMic() {
    if (!state.micActive) return;
    try {
      state.processor && state.processor.disconnect();
      state.audioContext && state.audioContext.close();
      state.mediaStream && state.mediaStream.getTracks().forEach(t => t.stop());
    } catch {}
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

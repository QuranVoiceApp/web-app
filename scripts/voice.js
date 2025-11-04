(() => {
  const $ = (id) => document.getElementById(id);

  const log = (...args) => {
    const el = $('log');
    const line = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
    el.value += line + "\n";
    el.scrollTop = el.scrollHeight;
    console.log(...args);
  };

  const wsUrl = (window.Env && window.Env.WS_URL) || 'wss://quran.asimo.io/realtime/v1/ws';
  $('wsUrl').textContent = wsUrl;

  const metrics = {
    sentBytesAudio: 0,
    sentAppends: 0,
    recvAudioChunks: 0,
    recvAudioBytes: 0,
    recvTranscriptChars: 0,
  };
  const renderMetrics = () => {
    const m = $('metrics'); if (!m) return;
    m.textContent = `sentAppends=${metrics.sentAppends} sentBytesAudio=${metrics.sentBytesAudio}B · recvAudioChunks=${metrics.recvAudioChunks} recvAudioBytes=${metrics.recvAudioBytes}B · transcriptChars=${metrics.recvTranscriptChars}`;
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
        // Initialize playback context
        if (!state.playCtx) {
          state.playCtx = new (window.AudioContext || window.webkitAudioContext)();
          state.playCursor = state.playCtx.currentTime;
        }
        // Update session with desired voice and (best-effort) VAD threshold
        const threshold = parseFloat($('vadThresh').value || '0.7');
        const sessionUpdate = {
          type: 'session.update',
          voice: $('voice').value,
          // Best-effort hints; server may accept either
          vad_threshold: threshold,
          turn_detection: { type: 'server_vad', threshold },
          input_audio_format: 'pcm16',
          input_sample_rate_hz: 24000,
        };
        try { ws.send(JSON.stringify(sessionUpdate)); } catch {}
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
      src.connect(state.playCtx.destination);
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
      case 'response.audio_transcript.delta': {
        const text = msg.delta || '';
        appendTranscript(text, false);
        break;
      }
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
      case 'response.audio.done':
      case 'response.done':
        log('<=', t);
        break;
      case 'session.no_audio_ingress@v1':
        log('<= no_audio_ingress', JSON.stringify(msg));
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

  function bufToBase64PCM16(float32) {
    const pcm16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      let s = Math.max(-1, Math.min(1, float32[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    let bin = '';
    for (let i = 0; i < pcm16.length; i++) {
      let val = pcm16[i];
      if (val < 0) val += 0x10000;
      bin += String.fromCharCode(val & 0xff, val >> 8);
    }
    return btoa(bin);
  }

  async function startMic() {
    if (!state.connected) return log('Not connected');
    if (state.micActive) return;
    try {
      // Clear any residual buffered audio on server
      try { if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ type: 'input_audio_buffer.clear' })); } catch {}
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      source.connect(processor); processor.connect(ctx.destination);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        // Downsample to 24 kHz and send as base64 PCM16 JSON event
        const ds = downsample48kTo24k(input);
        const b64 = bufToBase64PCM16(ds);
        if (state.ws && state.ws.readyState === 1) {
          try {
            const evt = { type: 'input_audio_buffer.append', audio: b64 };
            state.ws.send(JSON.stringify(evt));
            metrics.sentAppends += 1; metrics.sentBytesAudio += (b64.length * 3) / 4; renderMetrics();
          } catch {}
        }
      };
      state.mediaStream = stream; state.audioContext = ctx; state.processor = processor; state.micActive = true;
      $('btnMic').textContent = 'Stop Mic';
      log('Mic started');
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
  }

  $('btnConnect').addEventListener('click', () => {
    if (state.connected) { state.ws && state.ws.close(); } else { connect(); }
  });
  $('btnMic').addEventListener('click', () => state.micActive ? stopMic() : startMic());
  $('btnClear').addEventListener('click', () => { const t = $('transcript'); if (t) t.textContent=''; const l=$('log'); if (l) l.value=''; metrics.sentBytesAudio=metrics.sentAppends=metrics.recvAudioChunks=metrics.recvAudioBytes=metrics.recvTranscriptChars=0; renderMetrics(); });
})();

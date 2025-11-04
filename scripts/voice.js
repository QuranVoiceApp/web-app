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

  const state = {
    ws: null,
    mediaStream: null,
    audioContext: null,
    processor: null,
    connected: false,
    micActive: false,
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
        // Example: send a small ping/config event; backend may ignore
        const msg = { type: 'client.hello', vad_threshold: parseFloat($('vadThresh').value || '0.7'), voice: $('voice').value };
        ws.send(JSON.stringify(msg));
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          log('<=', ev.data.slice(0, 160));
        } else {
          // Binary audio or other frames
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

  function floatTo16BitPCM(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      let s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out.buffer;
  }

  // Very simple 48kHz -> 16kHz downsampler (decimate by 3). For production, consider a proper low-pass filter.
  function downsample48kTo16k(float32) {
    const ratio = 3;
    const len = Math.floor(float32.length / ratio);
    const out = new Float32Array(len);
    for (let i = 0, j = 0; i < len; i++, j += ratio) {
      out[i] = float32[j];
    }
    return out;
  }

  async function startMic() {
    if (!state.connected) return log('Not connected');
    if (state.micActive) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      source.connect(processor); processor.connect(ctx.destination);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const ds = downsample48kTo16k(input);
        const pcm16 = floatTo16BitPCM(ds);
        if (state.ws && state.ws.readyState === 1) {
          try {
            // Send raw PCM16 bytes; backend proxies as input_audio_buffer.append
            state.ws.send(pcm16);
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
})();

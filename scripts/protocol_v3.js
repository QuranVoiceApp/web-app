/**
 * Protocol v3 Client Adapter - WebRTC Transport
 *
 * Implements Protocol v3 using native WebRTC for lower latency and better quality:
 * - RTCPeerConnection for audio transport (Opus codec)
 * - Data channel for control messages (session.update, response.create, etc.)
 * - Ephemeral token authentication
 * - TURN server support for firewall traversal
 * - Automatic stats collection
 *
 * Usage:
 *   const p3 = new ProtocolV3({ tokenUrl: '/realtime/v3/session' });
 *   await p3.connect();
 *   p3.onAudio((stream) => { audioEl.srcObject = stream; });
 *   p3.onEvent((event) => { console.log(event); });
 *
 * Enable via: localStorage.setItem("useProtocolV3", "true")
 */

class ProtocolV3 {
  /**
   * Create Protocol v3 WebRTC client adapter.
   *
   * @param {Object} opts - Options
   * @param {string} opts.tokenUrl - Backend URL for ephemeral token (default: '/realtime/v3/session')
   * @param {string} opts.model - OpenAI model (default: 'gpt-4o-realtime-preview-2024-12-17')
   * @param {string} opts.voice - Voice name (default: 'alloy')
   * @param {string} opts.instructions - System instructions
   */
  constructor(opts = {}) {
    this.tokenUrl = opts.tokenUrl || '/realtime/v3/session';
    this.model = opts.model || 'gpt-4o-realtime-preview-2024-12-17';
    this.voice = opts.voice || 'alloy';
    this.instructions = opts.instructions || 'You are a helpful AI assistant.';

    // WebRTC components
    this.pc = null;                 // RTCPeerConnection
    this.dataChannel = null;        // Data channel for events
    this.localStream = null;        // Microphone stream
    this.remoteStream = null;       // Remote audio stream

    // Connection state
    this.connected = false;
    this.ready = false;
    this.ephemeralToken = null;
    this.iceServers = [];

    // Event handlers (can be overridden)
    this.onReady = null;
    this.onAudio = null;            // Called with MediaStream
    this.onEvent = null;            // Called with event object
    this.onError = null;
    this.onDisconnect = null;
    this.onConnectionState = null;  // Called with state string

    // Statistics
    this.stats = {
      protocol: 'v3',
      transport: 'webrtc',
      codec: 'opus',
      packetsLost: 0,
      jitter: 0,
      roundTripTime: 0,
      bytesReceived: 0,
      bytesSent: 0,
      connectionState: 'new',
      iceState: 'new',
      dataChannelState: 'connecting',
    };

    // Stats monitoring interval
    this.statsInterval = null;

    console.log(
      `[ProtocolV3] Initialized: tokenUrl=${this.tokenUrl}, model=${this.model}, voice=${this.voice}`
    );
  }

  /**
   * Connect to OpenAI Realtime API via WebRTC.
   *
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      console.log('[ProtocolV3] Starting WebRTC connection');

      // Step 1: Get ephemeral token and ICE configuration from backend
      console.log('[ProtocolV3] Fetching ephemeral token...');
      const tokenResponse = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          voice: this.voice,
          instructions: this.instructions,
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        throw new Error(`Failed to get ephemeral token: ${tokenResponse.status} ${error}`);
      }

      const tokenData = await tokenResponse.json();
      this.ephemeralToken = tokenData.ephemeral_token;
      this.iceServers = [
        ...tokenData.ice_servers.map(s => ({ urls: s.urls })),
        ...tokenData.turn_servers.map(s => ({
          urls: s.urls,
          username: s.username,
          credential: s.credential,
        })),
      ];

      console.log('[ProtocolV3] Ephemeral token obtained, expires:', tokenData.expires_at);
      console.log('[ProtocolV3] ICE servers:', this.iceServers.length);

      // Step 2: Create RTCPeerConnection
      this.pc = new RTCPeerConnection({
        iceServers: this.iceServers,
      });

      // Set up event handlers
      this._setupPeerConnectionHandlers();

      // Step 3: Create data channel for events
      this.dataChannel = this.pc.createDataChannel('oai-events', {
        ordered: true,
        maxRetransmits: null,  // Infinite retries for reliability
      });

      this._setupDataChannelHandlers();

      // Step 4: Create SDP offer
      console.log('[ProtocolV3] Creating SDP offer...');
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await this._waitForICEGathering();

      // Step 5: Send SDP offer to OpenAI
      console.log('[ProtocolV3] Sending SDP offer to OpenAI...');
      const formData = new FormData();
      formData.append('sdp', this.pc.localDescription.sdp);
      formData.append('model', this.model);

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.ephemeralToken}`,
        },
        body: formData,
      });

      if (!sdpResponse.ok) {
        const error = await sdpResponse.text();
        throw new Error(`OpenAI SDP exchange failed: ${sdpResponse.status} ${error}`);
      }

      const sdpData = await sdpResponse.json();
      console.log('[ProtocolV3] Received SDP answer from OpenAI');

      // Step 6: Set remote SDP answer
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: sdpData.sdp,
      });

      console.log('[ProtocolV3] Remote SDP set, waiting for connection...');

      // Step 7: Wait for connection
      await this._waitForConnection();

      console.log('[ProtocolV3] WebRTC connection established!');
      this.connected = true;

      // Start stats monitoring
      this._startStatsMonitoring();

    } catch (error) {
      console.error('[ProtocolV3] Connection error:', error);
      this._cleanup();
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  /**
   * Disconnect and cleanup.
   */
  async disconnect() {
    console.log('[ProtocolV3] Disconnecting...');
    this._cleanup();
  }

  /**
   * Get microphone access and add to peer connection.
   *
   * @param {Object} constraints - getUserMedia constraints
   * @returns {Promise<MediaStream>}
   */
  async startMicrophone(constraints = {}) {
    try {
      console.log('[ProtocolV3] Requesting microphone access...');

      const defaultConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 24000 },
        },
      };

      const mergedConstraints = {
        audio: { ...defaultConstraints.audio, ...constraints.audio },
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(mergedConstraints);
      console.log('[ProtocolV3] Microphone access granted');

      // Add audio track to peer connection
      const audioTrack = this.localStream.getAudioTracks()[0];
      this.pc.addTrack(audioTrack, this.localStream);

      console.log('[ProtocolV3] Audio track added to peer connection');
      return this.localStream;

    } catch (error) {
      console.error('[ProtocolV3] Microphone error:', error);
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  /**
   * Stop microphone.
   */
  stopMicrophone() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      console.log('[ProtocolV3] Microphone stopped');
    }
  }

  /**
   * Send event via data channel.
   *
   * @param {Object} event - Event object to send
   */
  sendEvent(event) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(event));
      console.log(`[ProtocolV3] Sent event: ${event.type}`);
    } else {
      console.warn('[ProtocolV3] Data channel not open, cannot send event');
      if (this.onError) {
        this.onError(new Error('Data channel not open'));
      }
    }
  }

  /**
   * Update session configuration.
   *
   * @param {Object} session - Session configuration
   */
  updateSession(session) {
    this.sendEvent({
      type: 'session.update',
      session: session,
    });
  }

  /**
   * Create a response.
   *
   * @param {Object} response - Response configuration
   */
  createResponse(response = {}) {
    this.sendEvent({
      type: 'response.create',
      response: response,
    });
  }

  /**
   * Cancel current response (barge-in).
   */
  cancelResponse() {
    this.sendEvent({
      type: 'response.cancel',
    });
    console.log('[ProtocolV3] Response cancelled (barge-in)');
  }

  /**
   * Get current stats.
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  // ========================================================================
  // Internal Methods
  // ========================================================================

  _setupPeerConnectionHandlers() {
    this.pc.onconnectionstatechange = () => {
      this.stats.connectionState = this.pc.connectionState;
      console.log(`[ProtocolV3] Connection state: ${this.pc.connectionState}`);

      if (this.onConnectionState) {
        this.onConnectionState(this.pc.connectionState);
      }

      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected') {
        console.error('[ProtocolV3] Connection failed/disconnected');
        if (this.onDisconnect) this.onDisconnect();
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      this.stats.iceState = this.pc.iceConnectionState;
      console.log(`[ProtocolV3] ICE state: ${this.pc.iceConnectionState}`);
    };

    this.pc.onicegatheringstatechange = () => {
      console.log(`[ProtocolV3] ICE gathering: ${this.pc.iceGatheringState}`);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[ProtocolV3] ICE candidate: ${event.candidate.type} ${event.candidate.protocol}`);
      }
    };

    this.pc.ontrack = (event) => {
      console.log(`[ProtocolV3] Received remote track: ${event.track.kind}`);

      if (event.track.kind === 'audio') {
        this.remoteStream = event.streams[0];
        console.log('[ProtocolV3] Remote audio stream received');

        if (this.onAudio) {
          this.onAudio(this.remoteStream);
        }
      }
    };
  }

  _setupDataChannelHandlers() {
    this.dataChannel.onopen = () => {
      this.stats.dataChannelState = 'open';
      this.ready = true;
      console.log('[ProtocolV3] Data channel opened');

      // Send initial session configuration
      this.updateSession({
        modalities: ['audio', 'text'],
        instructions: this.instructions,
        voice: this.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      });

      if (this.onReady) this.onReady();
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'error') {
          console.error(`[ProtocolV3] OpenAI error:`, msg.error);
          if (this.onError) this.onError(new Error(msg.error.message || 'Unknown error'));
        } else {
          console.log(`[ProtocolV3] Data channel event: ${msg.type}`);
          if (this.onEvent) this.onEvent(msg);
        }
      } catch (error) {
        console.error('[ProtocolV3] Data channel parse error:', error);
      }
    };

    this.dataChannel.onerror = (error) => {
      console.error('[ProtocolV3] Data channel error:', error);
      this.stats.dataChannelState = 'error';
      if (this.onError) this.onError(error);
    };

    this.dataChannel.onclose = () => {
      console.log('[ProtocolV3] Data channel closed');
      this.stats.dataChannelState = 'closed';
      this.ready = false;
    };
  }

  async _waitForICEGathering() {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        const checkState = () => {
          if (this.pc.iceGatheringState === 'complete') {
            this.pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        this.pc.addEventListener('icegatheringstatechange', checkState);

        // Timeout after 10 seconds
        setTimeout(() => {
          this.pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();  // Continue anyway
        }, 10000);
      }
    });
  }

  async _waitForConnection() {
    return new Promise((resolve, reject) => {
      const checkState = () => {
        if (this.pc.connectionState === 'connected') {
          this.pc.removeEventListener('connectionstatechange', checkState);
          resolve();
        } else if (this.pc.connectionState === 'failed') {
          this.pc.removeEventListener('connectionstatechange', checkState);
          reject(new Error('Connection failed'));
        }
      };
      this.pc.addEventListener('connectionstatechange', checkState);

      // Timeout after 30 seconds
      setTimeout(() => {
        this.pc.removeEventListener('connectionstatechange', checkState);
        reject(new Error('Connection timeout'));
      }, 30000);
    });
  }

  _startStatsMonitoring() {
    this.statsInterval = setInterval(async () => {
      if (!this.pc) return;

      try {
        const stats = await this.pc.getStats();

        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            this.stats.packetsLost = report.packetsLost || 0;
            this.stats.jitter = report.jitter ? (report.jitter * 1000) : 0;
            this.stats.bytesReceived = report.bytesReceived || 0;
          }

          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            this.stats.roundTripTime = report.currentRoundTripTime ? (report.currentRoundTripTime * 1000) : 0;
          }

          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            this.stats.bytesSent = report.bytesSent || 0;
          }
        });
      } catch (error) {
        // Ignore stats errors
      }
    }, 1000);
  }

  _cleanup() {
    console.log('[ProtocolV3] Cleaning up...');

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    this.stopMicrophone();

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (e) {}
      this.dataChannel = null;
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch (e) {}
      this.pc = null;
    }

    this.connected = false;
    this.ready = false;
    this.remoteStream = null;

    this.stats.connectionState = 'closed';
    this.stats.iceState = 'closed';
    this.stats.dataChannelState = 'closed';

    console.log('[ProtocolV3] Cleanup complete');
  }
}

// Expose as both module export and global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProtocolV3 };
}
if (typeof window !== 'undefined') {
  window.ProtocolV3 = ProtocolV3;
}

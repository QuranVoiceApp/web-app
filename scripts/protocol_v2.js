/**
 * Protocol v2 Client Adapter
 *
 * Implements client-side Protocol v2 for deterministic audio handling:
 * - JSON-only append with 20ms frames
 * - Sequential frame_id tracking
 * - Commit proposals to server
 * - ACK handling for reliability
 *
 * Usage:
 *   const p2 = new ProtocolV2(wsUrl, audioCtx, { sampleRateHz: 24000 });
 *   await p2.connect();
 *   p2.sendFrame(pcm16BytesBase64, timestampMs);
 *   p2.proposeCommit("periodic");
 *
 * Enable via: localStorage.setItem("useProtocolV2", "true")
 */

class ProtocolV2 {
  /**
   * Create Protocol v2 client adapter.
   *
   * @param {string} wsUrl - WebSocket URL (e.g., "ws://localhost:8000/realtime/v2")
   * @param {AudioContext} audioCtx - Web Audio API context
   * @param {Object} opts - Options
   * @param {number} opts.sampleRateHz - Audio sample rate (16000 or 24000)
   * @param {number} opts.minMs - Minimum audio duration before proposing commits (default 140ms)
   * @param {number} opts.proposeIntervalMs - How often to propose commits (default 100ms)
   */
  constructor(wsUrl, audioCtx, opts = {}) {
    this.wsUrl = wsUrl;
    this.audioCtx = audioCtx;
    this.sampleRate = opts.sampleRateHz || 24000;
    this.minMs = opts.minMs || 140;
    this.proposeIntervalMs = opts.proposeIntervalMs || 100;

    // Connection state
    this.ws = null;
    this.connected = false;
    this.ready = false;

    // Frame tracking
    this.frameId = 0;
    this.turnId = this._generateUUID();

    // Commit proposal tracking
    this.lastProposalTime = 0;
    this.pendingCommit = false;

    // Event handlers (can be overridden)
    this.onReady = null;
    this.onFrameAck = null;
    this.onCommitAck = null;
    this.onError = null;
    this.onDisconnect = null;

    // Statistics
    this.stats = {
      framesSent: 0,
      framesAcked: 0,
      commitsProposed: 0,
      commitsAccepted: 0,
      commitsDeferred: 0,
    };

    console.log(
      `[ProtocolV2] Initialized: url=${wsUrl}, sampleRate=${this.sampleRate}Hz, minMs=${this.minMs}ms`
    );
  }

  /**
   * Connect to server and open turn.
   *
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log("[ProtocolV2] WebSocket connected");
          this.connected = true;

          // Send v2.open message
          this._sendMessage({
            type: "v2.open",
            turn_id: this.turnId,
            audio_format: {
              type: "pcm16",
              sample_rate_hz: this.sampleRate,
            },
          });
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this._handleMessage(msg);

            // Resolve on v2.ack.open
            if (msg.type === "v2.ack.open") {
              this.ready = true;
              console.log("[ProtocolV2] Turn opened, ready to send frames");
              if (this.onReady) this.onReady();
              resolve();
            }
          } catch (err) {
            console.error("[ProtocolV2] Message parse error:", err);
          }
        };

        this.ws.onerror = (err) => {
          console.error("[ProtocolV2] WebSocket error:", err);
          if (this.onError) this.onError(err);
          reject(err);
        };

        this.ws.onclose = () => {
          console.log("[ProtocolV2] WebSocket disconnected");
          this.connected = false;
          this.ready = false;
          if (this.onDisconnect) this.onDisconnect();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Disconnect from server.
   */
  async disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (err) {
        console.error("[ProtocolV2] Disconnect error:", err);
      }
    }
    this.connected = false;
    this.ready = false;
  }

  /**
   * Send audio frame to server.
   *
   * @param {string} pcm16BytesBase64 - Base64-encoded PCM16 mono audio (20ms frame)
   * @param {number} tsMs - Timestamp in milliseconds
   */
  sendFrame(pcm16BytesBase64, tsMs) {
    if (!this.ready) {
      console.warn("[ProtocolV2] Not ready, skipping frame");
      return;
    }

    this._sendMessage({
      type: "v2.append",
      turn_id: this.turnId,
      frame_id: this.frameId++,
      ts_ms: tsMs || Date.now(),
      audio: pcm16BytesBase64,
    });

    this.stats.framesSent++;

    // Auto-propose commits periodically
    const now = Date.now();
    if (now - this.lastProposalTime >= this.proposeIntervalMs && !this.pendingCommit) {
      this.proposeCommit("periodic", this.frameId - 1);
    }
  }

  /**
   * Propose commit to server.
   *
   * @param {string} reason - "periodic" | "end_of_turn"
   * @param {number|null} lastFrameId - Last frame ID to commit (defaults to current frameId)
   */
  proposeCommit(reason = "periodic", lastFrameId = null) {
    if (!this.ready) {
      console.warn("[ProtocolV2] Not ready, skipping commit proposal");
      return;
    }

    const lid = lastFrameId !== null ? lastFrameId : this.frameId - 1;

    this._sendMessage({
      type: "v2.commit_proposal",
      turn_id: this.turnId,
      last_frame_id: lid,
      reason: reason,
    });

    this.stats.commitsProposed++;
    this.lastProposalTime = Date.now();
    this.pendingCommit = true;

    console.log(`[ProtocolV2] Proposed commit: frame_id=${lid}, reason=${reason}`);
  }

  /**
   * Send keepalive ping to server.
   */
  keepalive() {
    if (!this.connected) return;

    this._sendMessage({
      type: "v2.keepalive",
    });
  }

  /**
   * Get current statistics.
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset turn (start new turn with new turn_id).
   */
  reset() {
    this.frameId = 0;
    this.turnId = this._generateUUID();
    this.lastProposalTime = 0;
    this.pendingCommit = false;
    console.log(`[ProtocolV2] Reset: new turn_id=${this.turnId}`);

    // Reopen turn
    if (this.ready) {
      this._sendMessage({
        type: "v2.open",
        turn_id: this.turnId,
        audio_format: {
          type: "pcm16",
          sample_rate_hz: this.sampleRate,
        },
      });
    }
  }

  // Internal methods

  _sendMessage(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[ProtocolV2] Cannot send, WebSocket not open");
      return;
    }

    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error("[ProtocolV2] Send error:", err);
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case "v2.ack.append":
        this.stats.framesAcked++;
        if (this.onFrameAck) this.onFrameAck(msg.frame_id);
        break;

      case "v2.ack.commit":
        this.pendingCommit = false;
        if (msg.status === "accept") {
          this.stats.commitsAccepted++;
          console.log(`[ProtocolV2] Commit accepted: ${msg.ms}ms`);
        } else if (msg.status === "defer") {
          this.stats.commitsDeferred++;
          console.log(
            `[ProtocolV2] Commit deferred: need ${msg.min_ms_needed}ms more`
          );
        }
        if (this.onCommitAck) this.onCommitAck(msg);
        break;

      case "v2.event.speech_started":
        console.log("[ProtocolV2] Server detected speech start");
        break;

      case "v2.event.speech_stopped":
        console.log("[ProtocolV2] Server detected speech end");
        break;

      case "v2.error":
        console.error(`[ProtocolV2] Server error: ${msg.code}`, msg.detail || "");
        if (this.onError) this.onError(msg);
        break;

      case "v2.ack.keepalive":
        // Keepalive acknowledged
        break;

      default:
        console.warn(`[ProtocolV2] Unknown message type: ${msg.type}`);
    }
  }

  _generateUUID() {
    // Simple UUID v4 generation
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}


// Expose as both module export and global
if (typeof module !== "undefined" && module.exports) {
  module.exports = { ProtocolV2 };
}
if (typeof window !== "undefined") {
  window.ProtocolV2 = ProtocolV2;
}

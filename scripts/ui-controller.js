/**
 * UI Controller
 *
 * Main controller that coordinates all UI components:
 * - Connect/Disconnect button
 * - Mute/Unmute button
 * - Copy/Clear Logs buttons
 * - Visualizer state management
 * - Audio feedback (beeps/chimes)
 * - Now Reading panel
 * - Keyboard shortcuts
 * - Protocol v3 integration
 */

class UIController {
  constructor() {
    this.protocol = null;
    this.connected = false;
    this.muted = false;
    this.logs = [];

    // Narration auto-pause tracking
    this.narrationAutoPaused = false;
    this.lastResponseText = '';

    // Initialize components
    this.visualizer = new VoiceVisualizer('viz-canvas');
    this.audioFeedback = new AudioFeedback();
    this.nowReadingPanel = new NowReadingPanel(this);
    this.keyboardShortcuts = new KeyboardShortcuts(this);

    // Bind button events
    this.bindButtons();

    // Initialize Protocol v3
    this.initProtocol();

    console.log('[UIController] Initialized');
  }

  /**
   * Initialize Protocol v3 client
   */
  async initProtocol() {
    try {
      // Check if Protocol v3 is available
      if (typeof ProtocolV3 === 'undefined') {
        console.warn('[UIController] ProtocolV3 not loaded, waiting...');

        // Wait for protocol to load
        await this.waitForProtocol();
      }

      // Create Protocol v3 instance
      // Get voice from settings (default to 'echo' if not set)
      const selectedVoice = ASIMO_SETTINGS.conversationVoice || 'echo';

      // Determine persona mode based on user settings
      const personaMode = ASIMO_SETTINGS.recitationMode ? 'recitation' : 'realtime';

      console.log('[UIController] Creating Protocol v3 with voice:', selectedVoice, 'persona_mode:', personaMode);

      this.protocol = new ProtocolV3({
        tokenUrl: '/realtime/v3/session',
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: selectedVoice,
        instructions: null,  // null = use backend default persona from admin settings
        personaMode: personaMode  // 'realtime' or 'recitation' based on user settings
      });

      // Set up event handlers
      this.protocol.onConnectionState = (state) => {
        this.handleConnectionState(state);
      };

      this.protocol.onEvent = (event) => {
        this.handleProtocolEvent(event);
      };

      this.protocol.onAudio = (stream) => {
        this.handleAudioStream(stream);
      };

      this.protocol.onError = (error) => {
        this.addLog(`❌ Protocol error: ${error.message}`, 'error');
      };

      console.log('[UIController] Protocol v3 initialized');
    } catch (error) {
      console.error('[UIController] Failed to initialize protocol:', error);
      this.addLog(`❌ Failed to initialize protocol: ${error.message}`, 'error');
    }
  }

  /**
   * Wait for Protocol v3 to load
   */
  waitForProtocol() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50;

      const check = () => {
        if (typeof ProtocolV3 !== 'undefined') {
          resolve();
        } else if (attempts++ < maxAttempts) {
          setTimeout(check, 100);
        } else {
          reject(new Error('Protocol v3 failed to load'));
        }
      };

      check();
    });
  }

  /**
   * Bind button event listeners
   */
  bindButtons() {
    // Connect/Disconnect button
    const btnConnect = document.getElementById('btnConnect');
    if (btnConnect) {
      btnConnect.addEventListener('click', () => {
        if (this.connected) {
          this.disconnect();
        } else {
          this.connect();
        }
      });
    }

    // Mute/Unmute button
    const btnMute = document.getElementById('btnMute');
    if (btnMute) {
      btnMute.addEventListener('click', () => {
        this.toggleMute();
      });
    }

    // Copy Logs button
    const btnCopyLogs = document.getElementById('btnCopyLogs');
    if (btnCopyLogs) {
      btnCopyLogs.addEventListener('click', () => {
        this.copyLogs();
      });
    }

    // Clear Logs button
    const btnClearLogs = document.getElementById('btnClearLogs');
    if (btnClearLogs) {
      btnClearLogs.addEventListener('click', () => {
        this.clearLogs();
      });
    }

    console.log('[UIController] Buttons bound');
  }

  /**
   * Connect to voice mode
   */
  async connect() {
    try {
      this.addLog('🔌 Connecting to voice mode...', 'info');

      // Reinitialize protocol to pick up current voice settings
      await this.initProtocol();

      if (!this.protocol) {
        this.addLog('❌ Protocol not initialized', 'error');
        return;
      }

      await this.protocol.connect();

      this.connected = true;

      // Update Connect button
      const btn = document.getElementById('btnConnect');
      if (btn) {
        btn.textContent = 'Disconnect';
        btn.className = 'btn btn-lg btn-red';
        btn.setAttribute('aria-pressed', 'true');
      }

      // Update visualizer state
      this.visualizer.setState('listening');

      this.addLog('✅ Connected successfully', 'success');
    } catch (error) {
      this.addLog(`❌ Connection failed: ${error.message}`, 'error');
      console.error('[UIController] Connect error:', error);
    }
  }

  /**
   * Disconnect from voice mode
   */
  async disconnect() {
    if (!this.protocol) return;

    try {
      this.addLog('🔌 Disconnecting...', 'info');

      await this.protocol.disconnect();

      this.connected = false;

      // Update Connect button
      const btn = document.getElementById('btnConnect');
      if (btn) {
        btn.textContent = 'Connect';
        btn.className = 'btn btn-lg btn-green';
        btn.setAttribute('aria-pressed', 'false');
      }

      // Update visualizer state
      this.visualizer.setState('idle');

      // Hide Now Reading panel if visible
      this.nowReadingPanel.hide();

      this.addLog('✅ Disconnected', 'success');
    } catch (error) {
      this.addLog(`❌ Disconnect error: ${error.message}`, 'error');
      console.error('[UIController] Disconnect error:', error);
    }
  }

  /**
   * Toggle mute/unmute
   */
  toggleMute() {
    this.muted = !this.muted;

    // Update Protocol v3 client (enable/disable audio track, don't stop/start)
    if (this.protocol) {
      if (this.muted) {
        this.protocol.muteMicrophone();
      } else {
        this.protocol.unmuteMicrophone();
      }
    }

    // Update Mute button
    const btn = document.getElementById('btnMute');
    if (btn) {
      btn.textContent = this.muted ? 'Unmute' : 'Mute';
      btn.setAttribute('aria-pressed', this.muted ? 'true' : 'false');

      if (this.muted) {
        btn.classList.add('btn-muted');
      } else {
        btn.classList.remove('btn-muted');
      }
    }

    // Update audio feedback mute state
    this.audioFeedback.setMuted(this.muted);

    // Update visualizer state
    this.visualizer.setState(this.muted ? 'idle' : 'listening');

    this.addLog(this.muted ? '🔇 Microphone muted' : '🎤 Microphone active', 'info');
  }

  /**
   * Copy logs to clipboard
   */
  copyLogs() {
    const logsText = this.logs.join('\n');

    navigator.clipboard.writeText(logsText).then(() => {
      this.addLog('📋 Logs copied to clipboard', 'success');
    }).catch((error) => {
      this.addLog(`❌ Failed to copy logs: ${error.message}`, 'error');
    });
  }

  /**
   * Clear logs
   */
  clearLogs() {
    this.logs = [];

    const logsEl = document.getElementById('logs');
    if (logsEl) {
      logsEl.textContent = '';
    }

    this.addLog('🧹 Logs cleared', 'info');
  }

  /**
   * Add log message
   * @param {string} message
   * @param {string} type - info|success|warning|error
   */
  addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;

    this.logs.push(logMessage);

    const logsEl = document.getElementById('logs');
    if (logsEl) {
      logsEl.textContent += logMessage + '\n';
      logsEl.scrollTop = logsEl.scrollHeight;
    }

    console.log('[UIController]', message);
  }

  /**
   * Handle connection state changes
   * @param {string} state
   */
  handleConnectionState(state) {
    console.log('[UIController] Connection state:', state);

    if (state === 'connected') {
      this.visualizer.setState('listening');
    } else if (state === 'disconnected') {
      this.visualizer.setState('idle');
    }
  }

  /**
   * Handle Protocol v3 events
   * @param {Object} event
   */
  handleProtocolEvent(event) {
    // ═══════════════════════════════════════════════════════════
    // DEBUG: Log all events to web-app Logs pane
    // ═══════════════════════════════════════════════════════════
    if (event.type) {
      this.addLog(`[DEBUG] Event: ${event.type}`, 'info');
      if (event.type.includes("function") || event.type.includes("output")) {
        this.addLog(`[DEBUG] Details: ${JSON.stringify(event).substring(0, 300)}`, 'info');
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 5: MODE CHANGE VISUALIZATION
    // ═══════════════════════════════════════════════════════════
    if (event.type === 'mode_change') {
      this.handleModeChange(event);
    }

    // ═══════════════════════════════════════════════════════════
    // SERVER-SIDE NARRATION DETECTION
    // ═══════════════════════════════════════════════════════════
    // Detect kb_start_narration function call
    if (event.type === 'response.function_call_arguments.done') {
      if (event.name === 'kb_start_narration' && event.arguments) {
        try {
          const args = JSON.parse(event.arguments);
          this.addLog(`🎙️ Narration requested: ${args.book_id}, page ${args.start_page}`, 'info');
        } catch (e) {
          console.error('[UIController] Error parsing narration args:', e);
        }
      }
    }

    // Detect narration start (function call output)
    if (event.type === 'conversation.item.created' && event.item) {
      try {
        const item = event.item;
        // Check if this is a function_call_output with narration data
        if (item.type === 'function_call_output' && item.output) {
          const output = JSON.parse(item.output);
          if (output.narration_id && output.stream_url_full) {
            this.addLog(`🎙️ Starting narration: ${output.narration_id}`, 'success');

            // Cancel OpenAI's response to prevent voice overlap
            // (OpenAI was about to say "Starting narration..." but we don't need that)
            if (this.protocol) {
              this.protocol.cancelResponse();
              console.log('[UIController] Cancelled OpenAI response to prevent overlap with narration');
            }

            // Start narration player
            if (window.narrationPlayer) {
              window.narrationPlayer.start(
                output.narration_id,
                output.stream_url_full,
                {
                  book_id: output.book_id,
                  start_page: output.start_page
                }
              );
            } else {
              console.error('[UIController] narrationPlayer not available');
              this.addLog('❌ Narration player not loaded', 'error');
            }
          }
        }
      } catch (e) {
        // Silent fail - not all output_item.done events are narration
      }
    }

    // ═══════════════════════════════════════════════════════════
    // NARRATION CONTROL - Verbal Commands
    // ═══════════════════════════════════════════════════════════
    // Detect narration control function calls and send to player
    if (event.type === 'response.function_call_arguments.done') {
      const funcName = event.name;

      if (funcName === 'kb_stop_narration') {
        this.addLog('🛑 Stopping narration (verbal command)', 'info');

        // Cancel OpenAI's verbal response to prevent overlap
        if (this.protocol) {
          this.protocol.cancelResponse();
          console.log('[UIController] Cancelled OpenAI response for stop command');
        }

        if (window.narrationPlayer) {
          window.narrationPlayer.stop();
        }

        // Reset auto-pause flag - narration is stopping completely
        this.narrationAutoPaused = false;
      }

      if (funcName === 'kb_pause_narration') {
        this.addLog('⏸️ Pausing narration (verbal command)', 'info');

        // Cancel OpenAI's verbal response to prevent "narration has been paused" playing over audio
        if (this.protocol) {
          this.protocol.cancelResponse();
          console.log('[UIController] Cancelled OpenAI response for pause command');
        }

        if (window.narrationPlayer) {
          window.narrationPlayer.pause();
        }

        // Reset auto-pause flag - this is an EXPLICIT pause, not auto-pause
        // Prevents auto-resume from kicking in
        this.narrationAutoPaused = false;
      }

      if (funcName === 'kb_resume_narration') {
        this.addLog('▶️ Resuming narration (verbal command)', 'info');

        // Cancel OpenAI's verbal response
        if (this.protocol) {
          this.protocol.cancelResponse();
          console.log('[UIController] Cancelled OpenAI response for resume command');
        }

        if (window.narrationPlayer) {
          window.narrationPlayer.resume();
        }
        // Reset auto-pause flag since we're explicitly resuming
        this.narrationAutoPaused = false;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // NAVIGATION: Detect narration navigation and restart playback
    // ═══════════════════════════════════════════════════════════
    if (event.type === 'conversation.item.created' && event.item?.type === 'function_call_output') {
      const outputStr = event.item.output;
      if (!outputStr) return;

      try {
        const output = JSON.parse(outputStr);
        const funcCallId = event.item.call_id;

        // Find the function name from a previous function_call_arguments.done event
        // We need to check if this is a navigation function that returned a new narration
        if (output.success && output.narration) {
          console.log('[UIController] Navigation completed, restarting narration:', output);
          this.addLog(`⏭️ ${output.message}`, 'info');

          // Stop current narration player
          if (window.narrationPlayer) {
            window.narrationPlayer.stop();
          }

          // Start new narration from new position
          if (window.narrationPlayer && output.narration.stream_url_full) {
            window.narrationPlayer.start(
              output.narration.narration_id,
              output.narration.stream_url_full,
              {
                book_id: output.narration.book_id,
                start_page: output.narration.start_page
              }
            );
          }

          // Reset auto-pause flag
          this.narrationAutoPaused = false;
        }
      } catch (e) {
        // Not JSON or not a navigation result, ignore
      }
    }

    // ═══════════════════════════════════════════════════════════
    // AUTO-PAUSE: When user speaks during narration
    // ═══════════════════════════════════════════════════════════
    if (event.type === 'input_audio_buffer.speech_started') {
      // Check if narration is currently playing
      if (window.narrationPlayer && window.narrationPlayer.isPlayingNow && window.narrationPlayer.isPlayingNow()) {
        console.log('[UIController] User speaking during narration - auto-pausing');
        window.narrationPlayer.pause();
        this.narrationAutoPaused = true;
        this.addLog('⏸️ Auto-paused narration (you can say "resume" or ask questions)', 'info');
      }
    }

    // KB tool call started
    if (event.type === 'ui.kb_busy' && event.status === 'started') {
      this.audioFeedback.playSearchingBeep();
      this.visualizer.setState('searching');
      this.addLog(`🔍 Searching: ${event.tool}`, 'info');
    }

    // KB tool call completed
    if (event.type === 'ui.kb_busy' && event.status === 'completed') {
      this.audioFeedback.playCompletionChime();
      this.visualizer.setState('listening');
      this.addLog(`✅ Completed: ${event.tool}`, 'success');
    }

    // KB reading started
    if (event.type === 'ui.kb_reading' && event.status === 'started') {
      this.nowReadingPanel.show({
        title: event.title,
        author: event.author,
        section_header: event.section_header,
        page_start: event.page_start,
        page_end: event.page_end,
        book_id: event.book_id
      });
    }

    // Page changed during reading
    if (event.type === 'ui.kb_reading' && event.status === 'page_changed') {
      this.nowReadingPanel.updatePage(event.page_number);
    }

    // Reading completed
    if (event.type === 'ui.kb_reading' && event.status === 'completed') {
      this.nowReadingPanel.hide();
    }

    // Speaking state (TTS audio)
    if (event.type === 'response.audio.delta') {
      this.visualizer.setState('speaking');
    }

    // Speaking done
    if (event.type === 'response.audio.done') {
      this.visualizer.setState('listening');
    }

    // Phase 2: Show feedback panel after response complete
    if (event.type === 'response.done') {
      // Show feedback panel if feedback collector is available
      if (window.feedbackCollector) {
        // Use a small delay to ensure visualizer state is updated first
        setTimeout(() => {
          window.feedbackCollector.showFeedbackPanel();
        }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // AUTO-RESUME: Resume narration when OpenAI's audio finishes
    // ═══════════════════════════════════════════════════════════
    // Wait for output_audio_buffer.stopped instead of response.done
    // This ensures OpenAI's audio completely finishes before resuming narration
    if (event.type === 'output_audio_buffer.stopped') {
      if (this.narrationAutoPaused) {
        // Check if OpenAI's response contains a question
        // If yes, don't auto-resume because it's waiting for user input
        const responseText = this.lastResponseText.toLowerCase();
        const containsQuestion = responseText.includes('?') ||
                                 responseText.includes('want to') ||
                                 responseText.includes('would you') ||
                                 responseText.includes('should i') ||
                                 responseText.includes('do you') ||
                                 responseText.includes('can i');

        if (containsQuestion) {
          console.log('[UIController] Response contains question - NOT auto-resuming');
          this.addLog('⏸️ Paused (voice mode is waiting for your response)', 'info');
          // Don't reset the flag - user can manually say "resume" or answer the question
          return;
        }

        // Check if narration player is still loaded and paused
        if (window.narrationPlayer && window.narrationPlayer.isPaused && window.narrationPlayer.isPaused()) {
          console.log('[UIController] Auto-resuming narration after audio buffer stopped');
          // Small delay to ensure smooth transition
          setTimeout(() => {
            if (window.narrationPlayer && window.narrationPlayer.isPaused && window.narrationPlayer.isPaused()) {
              window.narrationPlayer.resume();
              this.narrationAutoPaused = false;
              this.addLog('▶️ Auto-resumed narration', 'info');
            }
          }, 300);
        } else {
          // Narration was stopped, not just paused - reset flag
          this.narrationAutoPaused = false;
        }
      }
    }

    // Add transcript messages
    // Add transcript messages
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      this.addTranscript('User', event.transcript || '[audio]');

      // If user says affirmative response while narration is paused (after a question),
      // allow auto-resume on next response
      if (this.narrationAutoPaused && event.transcript) {
        const userText = event.transcript.toLowerCase();
        const isAffirmative = userText.includes('yes') ||
                             userText.includes('continue') ||
                             userText.includes('go ahead') ||
                             userText.includes('keep going') ||
                             userText.includes('sure') ||
                             userText.includes('ok') ||
                             userText.includes('okay');

        if (isAffirmative) {
          console.log('[UIController] User gave affirmative - next response can auto-resume');
          // Don't resume immediately, but allow next response to auto-resume
          this.narrationAutoPaused = true;
        }
      }
    }

    if (event.type === 'response.text.delta') {
      this.addTranscript('Assistant', event.delta, true);
      // Accumulate response text for auto-resume decision
      this.lastResponseText += event.delta;
    }

    // Capture full audio transcript when complete
    if (event.type === 'response.audio_transcript.done') {
      if (event.transcript) {
        this.lastResponseText = event.transcript;
        console.log('[UIController] Response transcript:', event.transcript);
      }
    }

    // Reset response text on new response
    if (event.type === 'response.created') {
      this.lastResponseText = '';
    }
  }

  /**
   * Handle mode change event (Phase 5: Mode Visualization)
   * @param {Object} event - Mode change event with mode, previous_mode, reason
   */
  handleModeChange(event) {
    const badge = document.getElementById('modeIndicator');
    const icon = document.getElementById('modeIcon');
    const text = document.getElementById('modeText');

    if (!badge || !icon || !text) {
      console.warn('[UIController] Mode indicator elements not found');
      return;
    }

    const mode = event.mode || 'realtime';
    const previousMode = event.previous_mode || 'unknown';
    const reason = event.reason || 'unknown';

    // Mode configuration: icon, display text
    const modeConfig = {
      'realtime': { icon: '💬', text: 'Conversational' },
      'verbatim': { icon: '📖', text: 'Reading' },
      'recitation': { icon: '🕌', text: 'Recitation' }
    };

    const config = modeConfig[mode] || modeConfig['realtime'];

    // Update badge visibility
    badge.style.display = 'flex';

    // Update icon and text
    icon.textContent = config.icon;
    text.textContent = config.text;

    // Update CSS class for styling
    badge.className = 'mode-badge mode-' + mode;

    // Log mode change
    this.addLog(`🔄 Mode changed: ${previousMode} → ${mode} (${reason})`, 'info');

    console.log('[UIController] Mode changed:', {
      mode,
      previousMode,
      reason,
      config
    });
  }

  /**
   * Handle audio stream from Protocol v3
   * @param {MediaStream} stream
   */
  handleAudioStream(stream) {
    console.log('[UIController] Audio stream received');

    // Connect visualizer to audio stream
    if (this.visualizer && stream.getAudioTracks().length > 0) {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        this.visualizer.connect(audioContext, source);
      } catch (error) {
        console.error('[UIController] Failed to connect visualizer:', error);
      }
    }

    // Set audio element source for playback
    const audioEl = document.getElementById('qvtOut');
    if (audioEl) {
      audioEl.srcObject = stream;
      audioEl.muted = false; // Unmute for playback
    }
  }

  /**
   * Add transcript message
   * @param {string} speaker - User|Assistant
   * @param {string} text
   * @param {boolean} append - Append to last message
   */
  addTranscript(speaker, text, append = false) {
    const transcriptEl = document.getElementById('transcript');
    if (!transcriptEl) return;

    if (append) {
      // Append to last message
      const lines = transcriptEl.textContent.split('\n');
      if (lines.length > 0 && lines[lines.length - 1].startsWith(speaker + ':')) {
        lines[lines.length - 1] += text;
        transcriptEl.textContent = lines.join('\n');
      } else {
        transcriptEl.textContent += `${speaker}: ${text}`;
      }
    } else {
      // New message
      transcriptEl.textContent += `${speaker}: ${text}\n`;
    }

    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }
}

// Initialize UI Controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('[UIController] DOM ready, initializing...');
  window.uiController = new UIController();
});

console.log('[UIController] Module loaded');

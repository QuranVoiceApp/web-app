/**
 * Audio Feedback
 *
 * WebAudio-based audible feedback system for KB tool events:
 * - Soft "searching" beep (880 Hz, 120-160ms) when KB tool starts
 * - Pleasant completion chime (660 Hz + 880 Hz, 100ms) when KB tool completes
 *
 * Both sounds are:
 * - Non-intrusive (low volume)
 * - Suppressable (when muted)
 * - Toggleable (settings)
 */

class AudioFeedback {
  constructor() {
    this.audioContext = null;
    this.enabled = true; // Searching beep enabled
    this.enableCompletionChime = true; // Completion chime enabled
    this.muted = false; // Suppressed when mic is muted

    // Load settings from localStorage
    this.loadSettings();

    console.log('[AudioFeedback] Initialized', {
      searchingBeep: this.enabled,
      completionChime: this.enableCompletionChime,
      muted: this.muted
    });
  }

  /**
   * Load settings from localStorage
   */
  loadSettings() {
    try {
      const settings = JSON.parse(localStorage.getItem('ASIMO_SETTINGS') || '{}');
      this.enabled = settings.audibleFeedback !== false;
      this.enableCompletionChime = settings.completionChime !== false;
      console.log('[AudioFeedback] Settings loaded from localStorage');
    } catch (error) {
      console.warn('[AudioFeedback] Failed to load settings:', error);
    }
  }

  /**
   * Save settings to localStorage
   */
  saveSettings() {
    try {
      const settings = JSON.parse(localStorage.getItem('ASIMO_SETTINGS') || '{}');
      settings.audibleFeedback = this.enabled;
      settings.completionChime = this.enableCompletionChime;
      localStorage.setItem('ASIMO_SETTINGS', JSON.stringify(settings));
      console.log('[AudioFeedback] Settings saved to localStorage');
    } catch (error) {
      console.warn('[AudioFeedback] Failed to save settings:', error);
    }
  }

  /**
   * Initialize AudioContext (lazy init)
   */
  init() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[AudioFeedback] AudioContext created');
      } catch (error) {
        console.error('[AudioFeedback] Failed to create AudioContext:', error);
      }
    }

    // Resume if suspended (browser policy)
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        console.log('[AudioFeedback] AudioContext resumed');
      });
    }
  }

  /**
   * Play soft "searching" beep (880 Hz, 120-160ms)
   * Plays when KB tool starts (kb_catalog_stats, kb_search_anchors, kb_read_verbatim)
   */
  playSearchingBeep() {
    if (!this.enabled || this.muted) {
      console.log('[AudioFeedback] Searching beep suppressed (enabled:', this.enabled, 'muted:', this.muted, ')');
      return;
    }

    this.init();

    if (!this.audioContext) {
      console.warn('[AudioFeedback] AudioContext not available');
      return;
    }

    try {
      const now = this.audioContext.currentTime;
      const duration = 0.14; // 140ms

      // Oscillator (sine wave, 880 Hz = A5)
      const osc = this.audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 880;

      // Envelope (5ms attack, 135ms decay)
      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.005); // Attack to low volume
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration); // Decay

      // Connect and play
      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start(now);
      osc.stop(now + duration);

      console.log('[AudioFeedback] ♪ Playing searching beep (880 Hz, 140ms)');
    } catch (error) {
      console.error('[AudioFeedback] Failed to play searching beep:', error);
    }
  }

  /**
   * Play pleasant completion chime (660 Hz + 880 Hz, 100ms)
   * Plays when KB tool completes successfully
   */
  playCompletionChime() {
    if (!this.enableCompletionChime || this.muted) {
      console.log('[AudioFeedback] Completion chime suppressed (enabled:', this.enableCompletionChime, 'muted:', this.muted, ')');
      return;
    }

    this.init();

    if (!this.audioContext) {
      console.warn('[AudioFeedback] AudioContext not available');
      return;
    }

    try {
      const now = this.audioContext.currentTime;
      const duration = 0.1; // 100ms (shorter than searching beep)

      // First oscillator (660 Hz = E5)
      const osc1 = this.audioContext.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 660;

      // Second oscillator (880 Hz = A5) - harmonic
      const osc2 = this.audioContext.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 880;

      // Envelope (3ms attack, 97ms decay) - very soft
      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.003); // Very soft volume
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      // Mix both oscillators
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioContext.destination);

      // Start with slight delay for pleasant harmony
      osc1.start(now);
      osc2.start(now + 0.02); // 20ms delay
      osc1.stop(now + duration);
      osc2.stop(now + duration);

      console.log('[AudioFeedback] ♫ Playing completion chime (660+880 Hz, 100ms)');
    } catch (error) {
      console.error('[AudioFeedback] Failed to play completion chime:', error);
    }
  }

  /**
   * Set searching beep enabled/disabled
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.saveSettings();
    console.log('[AudioFeedback] Searching beep:', enabled ? 'enabled' : 'disabled');
  }

  /**
   * Set completion chime enabled/disabled
   * @param {boolean} enabled
   */
  setCompletionChimeEnabled(enabled) {
    this.enableCompletionChime = enabled;
    this.saveSettings();
    console.log('[AudioFeedback] Completion chime:', enabled ? 'enabled' : 'disabled');
  }

  /**
   * Set muted state (suppresses all beeps)
   * @param {boolean} muted
   */
  setMuted(muted) {
    this.muted = muted;
    console.log('[AudioFeedback] Muted:', muted);
  }
}

// Export for use in other modules
window.AudioFeedback = AudioFeedback;

console.log('[AudioFeedback] Module loaded');

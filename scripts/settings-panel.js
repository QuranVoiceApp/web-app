/**
 * Settings Panel
 *
 * Interactive settings panel with:
 * - Protocol v3 toggle
 * - Server VAD toggle
 * - Recitation mode toggle
 * - Audible feedback (KB searching beep) toggle
 * - Completion chime toggle
 * - Auto-download audio toggle
 *
 * Settings are persisted in localStorage via ASIMO_SETTINGS.
 */

(function() {
  'use strict';

  console.log('[SettingsPanel] Initializing...');

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAsync);
  } else {
    initAsync();
  }

  async function initAsync() {
    // Wait for admin defaults to load from backend
    if (window.waitForAdminDefaults) {
      console.log('[SettingsPanel] Waiting for admin defaults...');
      await window.waitForAdminDefaults();
      console.log('[SettingsPanel] Admin defaults loaded, initializing UI');
    }
    init();
  }

  function init() {
    const gear = document.getElementById('settingsGear');
    const panel = document.getElementById('settingsPanel');

    if (!gear || !panel) {
      console.error('[SettingsPanel] Missing elements!', { gear: !!gear, panel: !!panel });
      return;
    }

    // Toggle panel visibility
    gear.addEventListener('click', function() {
      const isHidden = panel.style.display === 'none' || !panel.style.display;
      panel.style.display = isHidden ? 'block' : 'none';
      console.log('[SettingsPanel] Panel toggled:', panel.style.display);
    });

    // Close panel when clicking outside
    document.addEventListener('click', function(e) {
      if (!gear.contains(e.target) && !panel.contains(e.target)) {
        if (panel.style.display === 'block') {
          panel.style.display = 'none';
        }
      }
    });

    // Bind checkbox settings
    bindCheckbox('useProtocolV3', () => ASIMO_SETTINGS.useProtocolV3, v => {
      ASIMO_SETTINGS.useProtocolV3 = v;
      console.log('[SettingsPanel] Use Protocol v3:', v);
    });

    bindCheckbox('useServerVAD', () => ASIMO_SETTINGS.useServerVAD, v => {
      ASIMO_SETTINGS.useServerVAD = v;
      console.log('[SettingsPanel] Use Server VAD:', v);
    });

    bindCheckbox('recitationMode', () => ASIMO_SETTINGS.recitationMode, v => {
      ASIMO_SETTINGS.recitationMode = v;
      console.log('[SettingsPanel] Recitation mode:', v);
    });

    bindCheckbox('audibleFeedback', () => {
      return ASIMO_SETTINGS.audibleFeedback !== false;
    }, v => {
      ASIMO_SETTINGS.audibleFeedback = v;

      // Update AudioFeedback instance if available
      if (window.uiController && window.uiController.audioFeedback) {
        window.uiController.audioFeedback.setEnabled(v);
      }

      console.log('[SettingsPanel] Audible feedback (KB beep):', v);
    });

    bindCheckbox('completionChime', () => {
      return ASIMO_SETTINGS.completionChime !== false;
    }, v => {
      ASIMO_SETTINGS.completionChime = v;

      // Update AudioFeedback instance if available
      if (window.uiController && window.uiController.audioFeedback) {
        window.uiController.audioFeedback.setCompletionChimeEnabled(v);
      }

      console.log('[SettingsPanel] Completion chime:', v);
    });

    bindCheckbox('autoDownload', () => ASIMO_SETTINGS.autoDownload, v => {
      ASIMO_SETTINGS.autoDownload = v;
      console.log('[SettingsPanel] Auto-download audio:', v);
    });

    // Bind voice select dropdowns
    bindSelect('conversationVoice', () => ASIMO_SETTINGS.conversationVoice || 'echo', v => {
      ASIMO_SETTINGS.conversationVoice = v;
      console.log('[SettingsPanel] Conversation voice:', v);

      // If already connected, show message that reconnection is needed
      if (window.uiController && window.uiController.protocol) {
        console.log('[SettingsPanel] Voice changed. Reconnection needed for changes to take effect.');
      }
    });

    bindSelect('narrationVoice', () => ASIMO_SETTINGS.narrationVoice || 'echo', v => {
      ASIMO_SETTINGS.narrationVoice = v;
      console.log('[SettingsPanel] Narration voice:', v);
    });

    // Add debug logging to show settings sources
    console.log('[SettingsPanel] Settings sources:');
    console.log('  - conversationVoice:', ASIMO_SETTINGS.conversationVoice,
      '(localStorage:', localStorage.getItem('conversationVoice'),
      'admin default:', window.ADMIN_DEFAULTS_CACHE.voice_defaults.conversation_voice + ')');
    console.log('  - narrationVoice:', ASIMO_SETTINGS.narrationVoice,
      '(localStorage:', localStorage.getItem('narrationVoice'),
      'admin default:', window.ADMIN_DEFAULTS_CACHE.voice_defaults.narration_voice + ')');

    // Add "Reset to Defaults" button functionality
    const resetBtn = document.getElementById('btnResetSettings');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        if (confirm('Reset all settings to admin defaults? This will clear your personal preferences.')) {
          // Clear all voice-related localStorage
          localStorage.removeItem('conversationVoice');
          localStorage.removeItem('narrationVoice');
          localStorage.removeItem('useServerVAD');
          localStorage.removeItem('recitationMode');
          localStorage.removeItem('autoDownload');
          localStorage.removeItem('useProtocolV3');
          localStorage.removeItem('audibleFeedback');
          localStorage.removeItem('completionChime');

          console.log('[SettingsPanel] Cleared all localStorage overrides');
          alert('Settings reset to admin defaults. Refreshing page...');
          location.reload();
        }
      });
    }

    console.log('[SettingsPanel] Initialization complete');
  }

  /**
   * Bind checkbox to ASIMO_SETTINGS
   * @param {string} id - Checkbox element ID
   * @param {Function} get - Getter function for initial value
   * @param {Function} set - Setter function for new value
   */
  function bindCheckbox(id, get, set) {
    const el = document.getElementById(id);
    if (!el) {
      console.warn('[SettingsPanel] Checkbox not found:', id);
      return;
    }

    try {
      // Set initial state
      el.checked = get();

      // Handle changes
      el.addEventListener('change', function() {
        set(el.checked);
        console.log('[SettingsPanel] Changed:', id, el.checked);
      });
    } catch (error) {
      console.error('[SettingsPanel] Error binding:', id, error);
    }
  }

  /**
   * Bind select dropdown to ASIMO_SETTINGS
   * @param {string} id - Select element ID
   * @param {Function} get - Getter function for initial value
   * @param {Function} set - Setter function for new value
   */
  function bindSelect(id, get, set) {
    const el = document.getElementById(id);
    if (!el) {
      console.warn('[SettingsPanel] Select not found:', id);
      return;
    }

    try {
      // Set initial state
      el.value = get();

      // Handle changes
      el.addEventListener('change', function() {
        set(el.value);
        console.log('[SettingsPanel] Select changed:', id, el.value);
      });
    } catch (error) {
      console.error('[SettingsPanel] Error binding select:', id, error);
    }
  }

  console.log('[SettingsPanel] Module loaded');
})();

// Admin defaults cache - fetched from backend on page load
window.ADMIN_DEFAULTS_CACHE = {
  voice_defaults: {
    conversation_voice: 'echo',
    narration_voice: 'echo'
  },
  feature_flags: {
    server_vad_default: true,
    audible_feedback_default: true,
    completion_chime_default: true,
    auto_download_default: false,
    protocol_v3_default: true,
    recitation_mode_default: false
  },
  loaded: false
};

// Fetch admin defaults from backend (called on page load)
async function loadAdminDefaults() {
  try {
    const response = await fetch('/api/admin/settings', {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    const data = await response.json();

    if (data.success) {
      window.ADMIN_DEFAULTS_CACHE = {
        voice_defaults: data.voice_defaults || window.ADMIN_DEFAULTS_CACHE.voice_defaults,
        feature_flags: data.feature_flags || window.ADMIN_DEFAULTS_CACHE.feature_flags,
        loaded: true
      };
      console.log('[Settings] Loaded admin defaults:', window.ADMIN_DEFAULTS_CACHE);
    } else {
      console.warn('[Settings] Failed to load admin defaults, using hardcoded defaults');
    }
  } catch (error) {
    console.error('[Settings] Error fetching admin defaults:', error);
    // Keep using hardcoded defaults on error
  }
}

// Settings object with admin defaults + local overrides
window.ASIMO_SETTINGS = {
  // Server VAD (uses admin default if not set locally)
  get useServerVAD() {
    const local = localStorage.getItem("useServerVAD");
    if (local !== null) return local === "true";
    return window.ADMIN_DEFAULTS_CACHE.feature_flags.server_vad_default;
  },
  set useServerVAD(v) { localStorage.setItem("useServerVAD", String(!!v)); },

  // Recitation Mode (uses admin default if not set locally)
  get recitationMode() {
    const local = localStorage.getItem("recitationMode");
    if (local !== null) return local === "true";
    return window.ADMIN_DEFAULTS_CACHE.feature_flags.recitation_mode_default;
  },
  set recitationMode(v) { localStorage.setItem("recitationMode", String(!!v)); },

  // Auto Download (uses admin default if not set locally)
  get autoDownload() {
    const local = localStorage.getItem("autoDownload");
    if (local !== null) return local === "true";
    return window.ADMIN_DEFAULTS_CACHE.feature_flags.auto_download_default;
  },
  set autoDownload(v) { localStorage.setItem("autoDownload", String(!!v)); },

  // Protocol V3 (uses admin default if not set locally)
  get useProtocolV3() {
    const local = localStorage.getItem("useProtocolV3");
    if (local !== null) return local === "true";
    return window.ADMIN_DEFAULTS_CACHE.feature_flags.protocol_v3_default;
  },
  set useProtocolV3(v) { localStorage.setItem("useProtocolV3", String(!!v)); },

  // Conversation Voice (uses admin default if not set locally)
  get conversationVoice() {
    const local = localStorage.getItem("conversationVoice");
    if (local !== null && local !== "") return local;
    return window.ADMIN_DEFAULTS_CACHE.voice_defaults.conversation_voice;
  },
  set conversationVoice(v) { localStorage.setItem("conversationVoice", String(v)); },

  // Narration Voice (uses admin default if not set locally)
  get narrationVoice() {
    const local = localStorage.getItem("narrationVoice");
    if (local !== null && local !== "") return local;
    return window.ADMIN_DEFAULTS_CACHE.voice_defaults.narration_voice;
  },
  set narrationVoice(v) { localStorage.setItem("narrationVoice", String(v)); },

  // Audible Feedback (uses admin default if not set locally)
  get audibleFeedback() {
    const local = localStorage.getItem("audibleFeedback");
    if (local !== null) return local === "true";
    return window.ADMIN_DEFAULTS_CACHE.feature_flags.audible_feedback_default;
  },
  set audibleFeedback(v) { localStorage.setItem("audibleFeedback", String(!!v)); },

  // Completion Chime (uses admin default if not set locally)
  get completionChime() {
    const local = localStorage.getItem("completionChime");
    if (local !== null) return local === "true";
    return window.ADMIN_DEFAULTS_CACHE.feature_flags.completion_chime_default;
  },
  set completionChime(v) { localStorage.setItem("completionChime", String(!!v)); },

  // Helper to check if a setting is using admin default or local override
  isUsingAdminDefault(key) {
    const localKeys = {
      'useServerVAD': 'useServerVAD',
      'recitationMode': 'recitationMode',
      'autoDownload': 'autoDownload',
      'useProtocolV3': 'useProtocolV3',
      'conversationVoice': 'conversationVoice',
      'narrationVoice': 'narrationVoice'
    };
    const localKey = localKeys[key];
    if (!localKey) return false;
    const local = localStorage.getItem(localKey);
    return local === null || local === "";
  }
};

// Load admin defaults on page load (returns promise for other scripts to await)
window.ADMIN_DEFAULTS_PROMISE = loadAdminDefaults();

// Convenience method to wait for admin defaults
window.waitForAdminDefaults = () => window.ADMIN_DEFAULTS_PROMISE;

// Debug helper - expose function to check settings sources
window.debugSettings = function() {
  console.log('=== SETTINGS DEBUG ===');
  console.log('Admin defaults loaded:', window.ADMIN_DEFAULTS_CACHE.loaded);
  console.log('\nAdmin Defaults:');
  console.log('  conversation_voice:', window.ADMIN_DEFAULTS_CACHE.voice_defaults.conversation_voice);
  console.log('  narration_voice:', window.ADMIN_DEFAULTS_CACHE.voice_defaults.narration_voice);
  console.log('\nLocalStorage Overrides:');
  console.log('  conversationVoice:', localStorage.getItem('conversationVoice'));
  console.log('  narrationVoice:', localStorage.getItem('narrationVoice'));
  console.log('\nFinal Settings (what UI sees):');
  console.log('  conversationVoice:', ASIMO_SETTINGS.conversationVoice);
  console.log('  narrationVoice:', ASIMO_SETTINGS.narrationVoice);
  console.log('\n💡 To clear localStorage and use admin defaults, run: window.resetToAdminDefaults()');
};

// Helper function to reset all settings
window.resetToAdminDefaults = async function() {
  console.log('Clearing all localStorage overrides...');
  localStorage.removeItem('conversationVoice');
  localStorage.removeItem('narrationVoice');
  localStorage.removeItem('useServerVAD');
  localStorage.removeItem('recitationMode');
  localStorage.removeItem('autoDownload');
  localStorage.removeItem('useProtocolV3');
  localStorage.removeItem('audibleFeedback');
  localStorage.removeItem('completionChime');
  console.log('✅ Cleared! Reloading admin defaults...');

  // Force reload admin defaults from server (no cache)
  await loadAdminDefaults();
  console.log('✅ Admin defaults reloaded:', window.ADMIN_DEFAULTS_CACHE);

  // Reload page to apply new defaults
  location.reload(true); // Force reload from server, not cache
};

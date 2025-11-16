/**
 * Keyboard Shortcuts
 *
 * Keyboard navigation for voice mode controls:
 * - M: Toggle Mute/Unmute
 * - Ctrl+C: Copy Logs
 * - Ctrl+X: Clear Logs
 * - Space/Enter: Activate focused button
 * - Tab: Navigate between controls
 */

class KeyboardShortcuts {
  constructor(uiController) {
    this.uiController = uiController;
    this.enabled = true;

    this.bindShortcuts();

    console.log('[KeyboardShortcuts] Initialized');
  }

  /**
   * Bind keyboard event listeners
   */
  bindShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;

      // Don't interfere with text input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Handle shortcuts
      this.handleKeyDown(e);
    });
  }

  /**
   * Handle keydown events
   * @param {KeyboardEvent} e
   */
  handleKeyDown(e) {
    const key = e.key.toLowerCase();

    // M: Toggle Mute
    if (key === 'm' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.uiController.toggleMute();
      console.log('[KeyboardShortcuts] M pressed - toggle mute');
      return;
    }

    // Ctrl+C: Copy Logs
    if (key === 'c' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const btn = document.getElementById('btnCopyLogs');
      if (btn) {
        btn.click();
        console.log('[KeyboardShortcuts] Ctrl+C pressed - copy logs');
      }
      return;
    }

    // Ctrl+X: Clear Logs
    if (key === 'x' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const btn = document.getElementById('btnClearLogs');
      if (btn) {
        btn.click();
        console.log('[KeyboardShortcuts] Ctrl+X pressed - clear logs');
      }
      return;
    }

    // Space/Enter: Activate focused button
    if ((key === 'enter' || key === ' ') && document.activeElement.tagName === 'BUTTON') {
      e.preventDefault();
      document.activeElement.click();
      console.log('[KeyboardShortcuts] Space/Enter pressed - activate button');
      return;
    }
  }

  /**
   * Enable keyboard shortcuts
   */
  enable() {
    this.enabled = true;
    console.log('[KeyboardShortcuts] Enabled');
  }

  /**
   * Disable keyboard shortcuts
   */
  disable() {
    this.enabled = false;
    console.log('[KeyboardShortcuts] Disabled');
  }
}

// Export for use in other modules
window.KeyboardShortcuts = KeyboardShortcuts;

console.log('[KeyboardShortcuts] Module loaded');

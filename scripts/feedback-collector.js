/**
 * Feedback Collector - Phase 2
 * Collects user feedback on voice mode interactions
 */

class FeedbackCollector {
  constructor() {
    this.backendUrl = window.location.origin;
    this.currentInteractionId = null;
    this.feedbackQueue = [];
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.setupUI();
  }

  setupUI() {
    // Create feedback panel
    const feedbackPanel = document.createElement('div');
    feedbackPanel.id = 'feedbackPanel';
    feedbackPanel.className = 'feedback-panel';
    feedbackPanel.style.display = 'none';
    feedbackPanel.innerHTML = `
      <div class="feedback-content">
        <p class="feedback-prompt">How was that response?</p>
        <div class="feedback-buttons">
          <button id="btnThumbsUp" class="btn-feedback btn-thumbs-up" title="Good response">
            👍
          </button>
          <button id="btnThumbsDown" class="btn-feedback btn-thumbs-down" title="Needs improvement">
            👎
          </button>
          <button id="btnDismissFeedback" class="btn-feedback btn-dismiss" title="Skip">
            ✕
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(feedbackPanel);

    // Add CSS styles
    const style = document.createElement('style');
    style.textContent = `
      .feedback-panel {
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: rgba(15, 15, 15, 0.95);
        border: 1px solid #333;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        z-index: 1000;
        min-width: 240px;
        backdrop-filter: blur(10px);
      }

      .feedback-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .feedback-prompt {
        margin: 0;
        font-size: 14px;
        color: #e0e0e0;
        text-align: center;
      }

      .feedback-buttons {
        display: flex;
        gap: 8px;
        justify-content: center;
      }

      .btn-feedback {
        font-size: 24px;
        width: 50px;
        height: 50px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        background: rgba(255, 255, 255, 0.1);
      }

      .btn-feedback:hover {
        transform: scale(1.1);
        background: rgba(255, 255, 255, 0.2);
      }

      .btn-thumbs-up:hover {
        background: rgba(76, 175, 80, 0.3);
      }

      .btn-thumbs-down:hover {
        background: rgba(244, 67, 54, 0.3);
      }

      .btn-dismiss {
        font-size: 18px;
        color: #999;
      }

      .btn-dismiss:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
      }

      .feedback-sent {
        animation: feedbackSent 0.3s ease-out;
      }

      @keyframes feedbackSent {
        0% { transform: scale(1); }
        50% { transform: scale(1.2); }
        100% { transform: scale(1); }
      }
    `;
    document.head.appendChild(style);

    // Bind event listeners
    document.getElementById('btnThumbsUp')?.addEventListener('click', () => {
      this.sendFeedback('positive');
    });

    document.getElementById('btnThumbsDown')?.addEventListener('click', () => {
      this.sendFeedback('negative');
    });

    document.getElementById('btnDismissFeedback')?.addEventListener('click', () => {
      this.hideFeedbackPanel();
    });

    console.log('[FeedbackCollector] UI initialized');
  }

  /**
   * Show feedback panel after assistant response
   */
  showFeedbackPanel(interactionId = null) {
    this.currentInteractionId = interactionId;
    const panel = document.getElementById('feedbackPanel');
    if (panel) {
      panel.style.display = 'block';

      // Auto-hide after 15 seconds
      if (this.autoHideTimeout) {
        clearTimeout(this.autoHideTimeout);
      }
      this.autoHideTimeout = setTimeout(() => {
        this.hideFeedbackPanel();
      }, 15000);
    }
  }

  hideFeedbackPanel() {
    const panel = document.getElementById('feedbackPanel');
    if (panel) {
      panel.style.display = 'none';
    }
    if (this.autoHideTimeout) {
      clearTimeout(this.autoHideTimeout);
    }
  }

  /**
   * Send feedback to backend
   * @param {string} feedbackType - 'positive' or 'negative'
   */
  async sendFeedback(feedbackType) {
    const userToken = window.userAuth ? window.userAuth.getUserToken() : null;

    if (!userToken) {
      console.warn('[FeedbackCollector] No user token available');
      this.hideFeedbackPanel();
      return;
    }

    // Visual feedback
    const btn = feedbackType === 'positive'
      ? document.getElementById('btnThumbsUp')
      : document.getElementById('btnThumbsDown');

    if (btn) {
      btn.classList.add('feedback-sent');
      setTimeout(() => btn.classList.remove('feedback-sent'), 300);
    }

    try {
      // Queue feedback for sending
      this.feedbackQueue.push({
        user_id: userToken,
        interaction_id: this.currentInteractionId,
        feedback_type: feedbackType,
        timestamp: new Date().toISOString()
      });

      console.log(`[FeedbackCollector] ${feedbackType} feedback queued`);

      // Send feedback to backend
      const response = await fetch(`${this.backendUrl}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Token': userToken
        },
        body: JSON.stringify({
          interaction_id: this.currentInteractionId,
          feedback_type: feedbackType,
          feedback_details: null
        })
      });

      if (response.ok) {
        console.log(`[FeedbackCollector] ${feedbackType} feedback sent successfully`);
      } else {
        console.warn(`[FeedbackCollector] Failed to send feedback: ${response.status}`);
      }

    } catch (error) {
      console.error('[FeedbackCollector] Error sending feedback:', error);
    }

    // Hide panel after feedback
    this.hideFeedbackPanel();
  }

  /**
   * Reset feedback state (e.g., on new session)
   */
  reset() {
    this.currentInteractionId = null;
    this.hideFeedbackPanel();
    this.feedbackQueue = [];
  }
}

// Global instance
window.feedbackCollector = new FeedbackCollector();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.feedbackCollector.init();
    console.log('[FeedbackCollector] Loaded (DOM ready)');
  });
} else {
  // DOM already loaded
  window.feedbackCollector.init();
  console.log('[FeedbackCollector] Loaded (DOM already ready)');
}

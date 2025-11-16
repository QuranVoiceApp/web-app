/**
 * Now Reading Panel
 *
 * Displays current book/section/page during verbatim narration.
 * Shows "Continue with next 10 pages?" prompt at end of section.
 */

class NowReadingPanel {
  constructor(protocol) {
    this.protocol = protocol;
    this.visible = false;
    this.currentReading = null;

    this.bindControls();

    console.log('[NowReadingPanel] Initialized');
  }

  /**
   * Bind control button events
   */
  bindControls() {
    // Stop reading button
    const btnStop = document.getElementById('btnStopReading');
    if (btnStop) {
      btnStop.addEventListener('click', () => {
        this.stopReading();
      });
    }

    // Continue reading button
    const btnContinue = document.getElementById('btnContinueReading');
    if (btnContinue) {
      btnContinue.addEventListener('click', () => {
        this.continueReading();
      });
    }

    // Stop at end button
    const btnStopAtEnd = document.getElementById('btnStopAtEnd');
    if (btnStopAtEnd) {
      btnStopAtEnd.addEventListener('click', () => {
        this.hideControls();
        this.addLog('📚 Will stop at end of current section');
      });
    }
  }

  /**
   * Show panel when kb_read_verbatim starts
   * @param {Object} readingData - Book/section metadata
   */
  show(readingData) {
    this.currentReading = readingData;
    this.visible = true;

    // Update panel content
    const titleEl = document.getElementById('readingTitle');
    const authorEl = document.getElementById('readingAuthor');
    const sectionEl = document.getElementById('readingSection');
    const currentPageEl = document.getElementById('currentPage');
    const totalPagesEl = document.getElementById('totalPages');

    if (titleEl) titleEl.textContent = readingData.title || '—';
    if (authorEl) authorEl.textContent = readingData.author || '—';
    if (sectionEl) sectionEl.textContent = readingData.section_header || '—';
    if (currentPageEl) currentPageEl.textContent = readingData.page_start || '—';
    if (totalPagesEl) totalPagesEl.textContent = readingData.page_end || '—';

    // Show panel with animation
    const panel = document.getElementById('nowReadingPanel');
    if (panel) {
      panel.style.display = 'block';
    }

    console.log('[NowReadingPanel] Showing:', readingData);
  }

  /**
   * Hide panel
   */
  hide() {
    this.visible = false;
    this.currentReading = null;

    const panel = document.getElementById('nowReadingPanel');
    if (panel) {
      panel.style.display = 'none';
    }

    // Hide controls if visible
    this.hideControls();

    console.log('[NowReadingPanel] Hidden');
  }

  /**
   * Update current page during narration
   * @param {number} pageNumber
   */
  updatePage(pageNumber) {
    if (!this.visible || !this.currentReading) return;

    const currentPageEl = document.getElementById('currentPage');
    if (currentPageEl) {
      currentPageEl.textContent = pageNumber;
    }

    // Show continuation prompt at end of section
    const currentPage = parseInt(pageNumber);
    const totalPages = parseInt(this.currentReading.page_end);

    if (currentPage >= totalPages - 1) {
      this.showControls();
    }

    console.log('[NowReadingPanel] Page updated:', pageNumber);
  }

  /**
   * Show "continue reading?" controls
   */
  showControls() {
    const controls = document.getElementById('readingControls');
    if (controls) {
      controls.style.display = 'block';

      // Update next page count (default 10)
      const nextCountEl = document.getElementById('nextPageCount');
      if (nextCountEl) {
        nextCountEl.textContent = '10';
      }

      console.log('[NowReadingPanel] Showing continuation prompt');
    }
  }

  /**
   * Hide continuation controls
   */
  hideControls() {
    const controls = document.getElementById('readingControls');
    if (controls) {
      controls.style.display = 'none';
    }
  }

  /**
   * User clicked "Yes, Continue"
   */
  continueReading() {
    this.hideControls();

    if (!this.currentReading) {
      console.warn('[NowReadingPanel] No current reading data');
      return;
    }

    // Calculate next page range
    const nextPageStart = parseInt(this.currentReading.page_end) + 1;
    const nextPageEnd = nextPageStart + 9;

    // Send continuation request via protocol
    if (this.protocol && this.protocol.sendControlMessage) {
      this.protocol.sendControlMessage({
        type: 'kb.read.continue',
        book_id: this.currentReading.book_id,
        page_start: nextPageStart,
        page_end: nextPageEnd
      });

      console.log('[NowReadingPanel] Continue reading:', nextPageStart, '-', nextPageEnd);
    } else {
      // Fallback: simulate user saying "continue"
      console.log('[NowReadingPanel] Protocol sendControlMessage not available, skipping');
    }
  }

  /**
   * User clicked "Stop"
   */
  stopReading() {
    this.hide();

    // Send stop command via protocol
    if (this.protocol && this.protocol.sendControlMessage) {
      this.protocol.sendControlMessage({
        type: 'response.cancel'
      });

      console.log('[NowReadingPanel] Stop reading');
    }
  }

  /**
   * Add log message (helper for compatibility)
   * @param {string} message
   */
  addLog(message) {
    const logsEl = document.getElementById('logs');
    if (logsEl) {
      const timestamp = new Date().toLocaleTimeString();
      logsEl.textContent += `[${timestamp}] ${message}\n`;
      logsEl.scrollTop = logsEl.scrollHeight;
    }
  }
}

// Export for use in other modules
window.NowReadingPanel = NowReadingPanel;

console.log('[NowReadingPanel] Module loaded');

/**
 * Voice Visualizer
 *
 * Canvas-based waveform/spectrum visualizer for the breathing element.
 * Shows visual feedback based on voice state (listening/speaking/searching).
 */

class VoiceVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error('[Visualizer] Canvas not found:', canvasId);
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    this.analyser = null;
    this.animationId = null;
    this.state = 'idle'; // idle|listening|speaking|searching
    this.dataArray = null;
    this.bufferLength = 0;

    // Reduced motion preference
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    console.log('[Visualizer] Initialized', {
      canvas: this.canvas.id,
      size: `${this.canvas.width}x${this.canvas.height}`,
      reducedMotion: this.prefersReducedMotion
    });
  }

  /**
   * Connect to AudioContext for visualization
   * @param {AudioContext} audioContext
   * @param {AudioNode} source - Audio source to visualize
   */
  connect(audioContext, source) {
    if (!audioContext || !source) {
      console.warn('[Visualizer] Invalid audioContext or source');
      return;
    }

    try {
      // Create analyser node
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(this.bufferLength);

      // Connect source to analyser
      source.connect(this.analyser);

      console.log('[Visualizer] Connected to audio source', {
        fftSize: this.analyser.fftSize,
        bufferLength: this.bufferLength
      });

      // Start animation loop
      this.startAnimation();
    } catch (error) {
      console.error('[Visualizer] Connection error:', error);
    }
  }

  /**
   * Disconnect and stop visualization
   */
  disconnect() {
    this.stopAnimation();
    this.analyser = null;
    this.clear();
    console.log('[Visualizer] Disconnected');
  }

  /**
   * Start animation loop
   */
  startAnimation() {
    if (this.animationId) return;

    const animate = () => {
      this.draw();
      this.animationId = requestAnimationFrame(animate);
    };

    animate();
    console.log('[Visualizer] Animation started');
  }

  /**
   * Stop animation loop
   */
  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
      console.log('[Visualizer] Animation stopped');
    }
  }

  /**
   * Draw visualization based on current state
   */
  draw() {
    if (this.prefersReducedMotion) {
      // Don't animate if user prefers reduced motion
      this.drawIdle();
      return;
    }

    switch (this.state) {
      case 'listening':
        this.drawWaveform();
        break;
      case 'speaking':
        this.drawSpectrum();
        break;
      case 'searching':
        this.drawSearching();
        break;
      default:
        this.drawIdle();
    }
  }

  /**
   * Draw idle state (static circle)
   */
  drawIdle() {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw static circle
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
    this.ctx.fillStyle = '#555555';
    this.ctx.globalAlpha = 0.3;
    this.ctx.fill();
    this.ctx.globalAlpha = 1.0;
  }

  /**
   * Draw waveform for listening state
   */
  drawWaveform() {
    if (!this.analyser) {
      this.drawIdle();
      return;
    }

    this.analyser.getByteTimeDomainData(this.dataArray);

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 40;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw circular waveform
    this.ctx.beginPath();
    const sliceWidth = (Math.PI * 2) / this.bufferLength;
    let angle = 0;

    for (let i = 0; i < this.bufferLength; i++) {
      const v = this.dataArray[i] / 128.0;
      const r = radius * (0.7 + (v - 1) * 0.3);

      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }

      angle += sliceWidth;
    }

    this.ctx.closePath();
    this.ctx.strokeStyle = '#3fa8ff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  /**
   * Draw spectrum for speaking state
   */
  drawSpectrum() {
    if (!this.analyser) {
      this.drawIdle();
      return;
    }

    this.analyser.getByteFrequencyData(this.dataArray);

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const maxRadius = Math.min(centerX, centerY) - 40;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw circular spectrum bars
    const barCount = 64;
    const sliceAngle = (Math.PI * 2) / barCount;

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor((i / barCount) * this.bufferLength);
      const value = this.dataArray[dataIndex];
      const percent = value / 255.0;
      const barHeight = maxRadius * percent * 0.5;

      const angle = i * sliceAngle;
      const x1 = centerX + Math.cos(angle) * (maxRadius - barHeight);
      const y1 = centerY + Math.sin(angle) * (maxRadius - barHeight);
      const x2 = centerX + Math.cos(angle) * maxRadius;
      const y2 = centerY + Math.sin(angle) * maxRadius;

      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.strokeStyle = `rgba(255, 149, 0, ${0.5 + percent * 0.5})`;
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
    }
  }

  /**
   * Draw searching state (pulsing circle)
   */
  drawSearching() {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const baseRadius = Math.min(centerX, centerY) - 60;

    // Pulsing animation
    const time = Date.now() / 1000;
    const pulse = Math.sin(time * 5) * 0.5 + 0.5; // Fast pulse (0.8s period)
    const radius = baseRadius * (0.5 + pulse * 0.5);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw pulsing circle
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = `rgba(255, 193, 7, ${0.3 + pulse * 0.4})`;
    this.ctx.fill();

    // Draw outer ring
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#ffc107';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  /**
   * Clear canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Set visualization state
   * @param {string} newState - idle|listening|speaking|searching
   */
  setState(newState) {
    if (this.state === newState) return;

    console.log('[Visualizer] State change:', this.state, '→', newState);
    this.state = newState;

    // Update breather element class
    const breather = document.getElementById('breather');
    if (breather) {
      breather.className = `state-${newState}`;

      // Update ARIA label
      const statusText = {
        'idle': 'Idle, not connected',
        'listening': 'Listening for your voice',
        'speaking': 'Assistant is speaking',
        'searching': 'Searching knowledge base'
      };

      breather.setAttribute('aria-label', `Voice status: ${statusText[newState] || newState}`);
    }
  }
}

// Export for use in other modules
window.VoiceVisualizer = VoiceVisualizer;

console.log('[Visualizer] Module loaded');

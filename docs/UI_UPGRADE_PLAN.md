# Web-App UI Upgrade Plan: ChatGPT-Style Voice Mode + KB Searching Feedback

**Date**: 2025-11-11
**Target**: Protocol v3 (WebRTC)
**Status**: 📋 Planning Phase

---

## Executive Summary

Upgrade the web-app UI to a minimalist ChatGPT-style voice interface with:
1. **Central breathing element** with integrated waveform/spectrum visualization
2. **4-button interface**: Connect/Disconnect, Mute/Unmute, Copy Logs, Clear Logs
3. **Audible KB "searching" feedback**: Soft beep when KB tools are called
4. **Server-side event hooks**: Real-time KB tool progress signaling via data channel
5. **Full accessibility**: ARIA, keyboard shortcuts, reduced-motion support

---

## Current Architecture Analysis

### ✅ What We Have (Working)

**Protocol v3 Implementation**:
- `scripts/protocol_v3.js`: Full WebRTC client with RTCPeerConnection
- `app/routers/realtime_v3_proxy.py`: Backend proxy to OpenAI Realtime API
- Data channel for control messages
- Microphone capture with AudioWorklet
- Automatic stats collection
- 100% test coverage (26/26 checks passing)

**Current UI Elements** (to be refactored):
- Complex control panel with device selectors
- Multiple mic-related toggles (start/stop/clear/calibrate/etc.)
- Separate transcript and logs sections
- Settings gear with Protocol v3 toggle

**KB Tools** (backend):
- `kb.catalog.stats`: Return catalog size
- `kb.search.anchors`: Search for book/section/page anchors
- `kb.read.verbatim`: Stream verbatim text for narration

### 🎯 What We Need (New)

**UI Components**:
1. Central breathing element (canvas + pulse animation)
2. Simplified 4-button control panel
3. Visual state indicators (listening/speaking/searching)
4. Transcript + Logs panes (keep existing, style updates)

**Audio Feedback System**:
1. WebAudio synthesizer for KB "searching" beep
2. Settings toggle for audible feedback
3. Mute-aware beep suppression
4. Low-volume, short envelope (120-160ms)

**Server Event System**:
1. KB tool progress signals via data channel
2. UI control messages: `{type:"ui.kb_busy", status:"started|completed", tool:"kb.search.anchors"}`
3. Non-blocking, low-latency event emission

---

## Implementation Phases

### Phase 1: UI Surface Refactor (2-3 hours)
**Goal**: Transform index.html to ChatGPT-style minimalist interface

#### Tasks:
1. **New HTML Structure** (`index.html`):
   ```html
   <main id="app">
     <section id="stage">
       <div id="breather" aria-label="Voice status" role="img">
         <canvas id="viz-canvas" width="320" height="320"></canvas>
         <div id="pulse"></div>
       </div>
       <div id="controls" role="group" aria-label="Voice controls">
         <button id="btnConnect" class="btn btn-lg btn-green">Connect</button>
         <button id="btnMute" class="btn btn-lg">Mute</button>
         <button id="btnCopyLogs" class="btn">Copy Logs</button>
         <button id="btnClearLogs" class="btn">Clear Logs</button>
       </div>
     </section>

     <section id="panes">
       <div id="transcriptPane">
         <h3>Transcript</h3>
         <div id="transcript" aria-live="polite"></div>
       </div>
       <div id="logsPane">
         <h3>Logs</h3>
         <pre id="logs" aria-live="polite"></pre>
       </div>
     </section>
   </main>
   ```

2. **CSS Styling** (`styles/voice-ui.css`):
   - Central stage layout (flexbox centered)
   - Breathing element animations:
     - `.connected`: green pulsing ring
     - `.listening`: steady blue glow
     - `.speaking`: orange wave animation
     - `.searching`: yellow/blue faster pulse
   - Button states (green/red toggle, muted indicator)
   - Responsive layout (mobile-friendly)
   - `prefers-reduced-motion` support (disable animations)

3. **Remove Old UI**:
   - Device dropdowns
   - Mic control buttons (start/stop/clear/calibrate/autodetect)
   - Advanced toggles (move to settings drawer)
   - Level meters (integrate into breather canvas)

**Acceptance Criteria**:
- ✅ Only 4 buttons visible on main UI
- ✅ Central breathing element displays correctly
- ✅ Responsive on mobile (320px+)
- ✅ No visual regressions in transcript/logs

---

### Phase 2: Breathing Element + Visualizer (2-3 hours)
**Goal**: Implement central canvas visualization with state-based animations

#### Tasks:
1. **Canvas Visualizer** (`scripts/visualizer.js`):
   ```javascript
   class VoiceVisualizer {
     constructor(canvasId) {
       this.canvas = document.getElementById(canvasId);
       this.ctx = this.canvas.getContext('2d');
       this.analyser = null;
       this.animationId = null;
       this.state = 'idle'; // idle|listening|speaking|searching
     }

     // Connect to AudioContext output
     connect(audioContext, source) {
       this.analyser = audioContext.createAnalyser();
       this.analyser.fftSize = 256;
       source.connect(this.analyser);
       this.startAnimation();
     }

     // Draw waveform/spectrum based on state
     draw() {
       const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
       this.analyser.getByteFrequencyData(dataArray);

       // Clear canvas
       this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

       // Draw based on state
       switch(this.state) {
         case 'listening':
           this.drawWaveform(dataArray, '#3fa8ff');
           break;
         case 'speaking':
           this.drawSpectrum(dataArray, '#ff9500');
           break;
         case 'searching':
           this.drawSearching();
           break;
         default:
           this.drawIdle();
       }

       this.animationId = requestAnimationFrame(() => this.draw());
     }

     // State transitions
     setState(newState) {
       this.state = newState;
       document.getElementById('breather').className = `state-${newState}`;
     }
   }
   ```

2. **Pulse Animation** (CSS):
   ```css
   #pulse {
     position: absolute;
     inset: 0;
     border-radius: 50%;
     opacity: 0;
   }

   .state-listening #pulse {
     animation: pulse-blue 2s ease-in-out infinite;
   }

   .state-speaking #pulse {
     animation: pulse-orange 1.5s ease-in-out infinite;
   }

   .state-searching #pulse {
     animation: pulse-yellow 0.8s ease-in-out infinite;
   }

   @keyframes pulse-blue {
     0%, 100% { box-shadow: 0 0 20px rgba(63, 168, 255, 0); opacity: 0; }
     50% { box-shadow: 0 0 40px rgba(63, 168, 255, 0.6); opacity: 1; }
   }
   ```

3. **Reduced Motion Support**:
   ```css
   @media (prefers-reduced-motion: reduce) {
     #pulse { animation: none !important; }
     .state-listening #breather { border: 3px solid #3fa8ff; }
     .state-speaking #breather { border: 3px solid #ff9500; }
     .state-searching #breather { border: 3px solid #ffc107; }
   }
   ```

**Acceptance Criteria**:
- ✅ Visualizer shows waveform during listening
- ✅ Visualizer shows spectrum during speaking
- ✅ Pulse animation respects prefers-reduced-motion
- ✅ Canvas updates smoothly at 60fps
- ✅ No performance issues on mobile

---

### Phase 3: Button Wiring + Protocol v3 Integration (3-4 hours)
**Goal**: Wire 4 buttons to Protocol v3 client with proper state management

#### Tasks:
1. **Connect/Disconnect Button** (`scripts/ui-controller.js`):
   ```javascript
   class UIController {
     constructor(protocol) {
       this.protocol = protocol;
       this.connected = false;
       this.muted = false;
       this.logs = [];
       this.visualizer = new VoiceVisualizer('viz-canvas');

       this.bindButtons();
     }

     bindButtons() {
       // Connect/Disconnect
       document.getElementById('btnConnect').addEventListener('click', () => {
         if (this.connected) {
           this.disconnect();
         } else {
           this.connect();
         }
       });

       // Mute/Unmute
       document.getElementById('btnMute').addEventListener('click', () => {
         this.toggleMute();
       });

       // Copy Logs
       document.getElementById('btnCopyLogs').addEventListener('click', () => {
         navigator.clipboard.writeText(this.logs.join('\n'));
         this.addLog('📋 Logs copied to clipboard');
       });

       // Clear Logs
       document.getElementById('btnClearLogs').addEventListener('click', () => {
         this.logs = [];
         document.getElementById('logs').textContent = '';
         this.addLog('🧹 Logs cleared');
       });
     }

     async connect() {
       try {
         this.addLog('🔌 Connecting to voice mode...');
         await this.protocol.connect();
         this.connected = true;

         // Update UI
         const btn = document.getElementById('btnConnect');
         btn.textContent = 'Disconnect';
         btn.className = 'btn btn-lg btn-red';
         btn.setAttribute('aria-pressed', 'true');

         this.visualizer.setState('listening');
         this.addLog('✅ Connected successfully');
       } catch (error) {
         this.addLog(`❌ Connection failed: ${error.message}`);
         console.error('[UIController] Connect error:', error);
       }
     }

     async disconnect() {
       try {
         this.addLog('🔌 Disconnecting...');
         await this.protocol.disconnect();
         this.connected = false;

         // Update UI
         const btn = document.getElementById('btnConnect');
         btn.textContent = 'Connect';
         btn.className = 'btn btn-lg btn-green';
         btn.setAttribute('aria-pressed', 'false');

         this.visualizer.setState('idle');
         this.addLog('✅ Disconnected');
       } catch (error) {
         this.addLog(`❌ Disconnect error: ${error.message}`);
       }
     }

     toggleMute() {
       this.muted = !this.muted;

       // Update Protocol v3 client
       if (this.muted) {
         this.protocol.stopMicrophone();
       } else {
         this.protocol.startMicrophone();
       }

       // Update UI
       const btn = document.getElementById('btnMute');
       btn.textContent = this.muted ? 'Unmute' : 'Mute';
       btn.setAttribute('aria-pressed', this.muted ? 'true' : 'false');
       btn.classList.toggle('btn-muted', this.muted);

       this.visualizer.setState(this.muted ? 'idle' : 'listening');
       this.addLog(this.muted ? '🔇 Microphone muted' : '🎤 Microphone active');
     }
   }
   ```

2. **Protocol v3 Event Hooks**:
   ```javascript
   // In protocol_v3.js, add event callbacks
   this.protocol.onConnectionState = (state) => {
     if (state === 'connected') {
       this.visualizer.setState('listening');
     }
   };

   this.protocol.onEvent = (event) => {
     if (event.type === 'response.audio.delta') {
       this.visualizer.setState('speaking');
     }
     if (event.type === 'response.audio.done') {
       this.visualizer.setState('listening');
     }
   };
   ```

**Acceptance Criteria**:
- ✅ Connect button initiates WebRTC connection
- ✅ Disconnect cleanly closes PC + tracks
- ✅ Mute stops mic capture without closing connection
- ✅ Buttons have proper ARIA states
- ✅ Keyboard shortcuts work (Space/Enter)

---

### Phase 4: KB Searching Beep System (3-4 hours)
**Goal**: Implement audible feedback for KB tool calls

#### Tasks:
1. **Audio Synthesizer** (`scripts/audio-feedback.js`):
   ```javascript
   class AudioFeedback {
     constructor() {
       this.audioContext = null;
       this.enabled = true; // localStorage toggle
       this.muted = false;

       // Load settings
       const settings = JSON.parse(localStorage.getItem('ASIMO_SETTINGS') || '{}');
       this.enabled = settings.audibleFeedback !== false;
     }

     init() {
       if (!this.audioContext) {
         this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
       }
     }

     // Soft "searching" beep (880 Hz, 120-160ms)
     playSearchingBeep() {
       if (!this.enabled || this.muted) return;

       this.init();

       const now = this.audioContext.currentTime;
       const duration = 0.14; // 140ms

       // Oscillator (sine wave, 880 Hz)
       const osc = this.audioContext.createOscillator();
       osc.type = 'sine';
       osc.frequency.value = 880;

       // Envelope (5ms attack, 135ms decay)
       const gain = this.audioContext.createGain();
       gain.gain.setValueAtTime(0, now);
       gain.gain.linearRampToValueAtTime(0.15, now + 0.005); // Attack
       gain.gain.exponentialRampToValueAtTime(0.001, now + duration); // Decay

       // Connect and play
       osc.connect(gain);
       gain.connect(this.audioContext.destination);

       osc.start(now);
       osc.stop(now + duration);

       console.log('[AudioFeedback] Playing searching beep');
     }

     // Optional: Completion chime (softer, lower pitch)
     playCompletionChime() {
       if (!this.enabled || this.muted) return;

       this.init();

       const now = this.audioContext.currentTime;
       const duration = 0.1; // 100ms

       const osc = this.audioContext.createOscillator();
       osc.type = 'sine';
       osc.frequency.value = 660; // Lower pitch

       const gain = this.audioContext.createGain();
       gain.gain.setValueAtTime(0, now);
       gain.gain.linearRampToValueAtTime(0.08, now + 0.003); // Softer
       gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

       osc.connect(gain);
       gain.connect(this.audioContext.destination);

       osc.start(now);
       osc.stop(now + duration);

       console.log('[AudioFeedback] Playing completion chime');
     }

     setEnabled(enabled) {
       this.enabled = enabled;
       const settings = JSON.parse(localStorage.getItem('ASIMO_SETTINGS') || '{}');
       settings.audibleFeedback = enabled;
       localStorage.setItem('ASIMO_SETTINGS', JSON.stringify(settings));
     }

     setMuted(muted) {
       this.muted = muted;
     }
   }
   ```

2. **Integration with UI Controller**:
   ```javascript
   class UIController {
     constructor(protocol) {
       // ... existing code ...
       this.audioFeedback = new AudioFeedback();

       // Hook into Protocol v3 events
       this.protocol.onEvent = (event) => {
         this.handleProtocolEvent(event);
       };
     }

     handleProtocolEvent(event) {
       // KB tool call started
       if (event.type === 'ui.kb_busy' && event.status === 'started') {
         this.audioFeedback.playSearchingBeep();
         this.visualizer.setState('searching');
         this.addLog(`🔍 Searching: ${event.tool}`);
       }

       // KB tool call completed
       if (event.type === 'ui.kb_busy' && event.status === 'completed') {
         this.visualizer.setState('listening');
         this.addLog(`✅ Completed: ${event.tool}`);
         // Optional: this.audioFeedback.playCompletionChime();
       }

       // Speaking state
       if (event.type === 'response.audio.delta') {
         this.visualizer.setState('speaking');
       }
     }

     toggleMute() {
       this.muted = !this.muted;
       this.audioFeedback.setMuted(this.muted);
       // ... rest of mute logic ...
     }
   }
   ```

3. **Settings Panel Addition** (`scripts/settings-panel.js`):
   ```javascript
   // Add checkbox for audible feedback
   const audibleFeedbackCheckbox = document.createElement('input');
   audibleFeedbackCheckbox.type = 'checkbox';
   audibleFeedbackCheckbox.id = 'audibleFeedback';
   audibleFeedbackCheckbox.checked = ASIMO_SETTINGS.audibleFeedback !== false;

   audibleFeedbackCheckbox.addEventListener('change', (e) => {
     ASIMO_SETTINGS.audibleFeedback = e.target.checked;
     if (window.uiController) {
       window.uiController.audioFeedback.setEnabled(e.target.checked);
     }
     console.log('[Settings] Audible feedback:', e.target.checked);
   });

   // Add to settings panel
   const label = document.createElement('label');
   label.appendChild(audibleFeedbackCheckbox);
   label.appendChild(document.createTextNode(' KB searching beep'));
   settingsPanel.appendChild(label);
   ```

**Acceptance Criteria**:
- ✅ Beep plays when KB tool is called
- ✅ Beep is soft, non-intrusive (120-160ms, low volume)
- ✅ Beep suppressed when muted
- ✅ Beep toggle in settings works
- ✅ No mixing into microphone input path

---

### Phase 5: Server-Side KB Event Hooks (3-4 hours)
**Goal**: Emit UI control messages from backend when KB tools are called

#### Tasks:
1. **Backend Event Emitter** (`app/routers/realtime_v3_proxy.py`):
   ```python
   class RealtimeV3ProxySession:
       # ... existing code ...

       async def handle_function_call(self, event: Dict[str, Any]):
           """Handle function call from OpenAI and emit UI events."""
           function_name = event.get("name", "")
           call_id = event.get("call_id", "")

           # Check if this is a KB tool
           if function_name.startswith("kb_"):
               # Emit "started" event to client via data channel
               await self.send_ui_event({
                   "type": "ui.kb_busy",
                   "status": "started",
                   "tool": function_name,
                   "call_id": call_id,
                   "timestamp": time.time()
               })

               logger.info(f"[{self.session_id}] KB tool started: {function_name}")

           # Execute the function (existing logic)
           try:
               result = await self.execute_tool(function_name, event.get("arguments", {}))

               # Emit "completed" event
               if function_name.startswith("kb_"):
                   await self.send_ui_event({
                       "type": "ui.kb_busy",
                       "status": "completed",
                       "tool": function_name,
                       "call_id": call_id,
                       "timestamp": time.time()
                   })

                   logger.info(f"[{self.session_id}] KB tool completed: {function_name}")

               return result

           except Exception as e:
               # Emit "error" event
               if function_name.startswith("kb_"):
                   await self.send_ui_event({
                       "type": "ui.kb_busy",
                       "status": "error",
                       "tool": function_name,
                       "call_id": call_id,
                       "error": str(e),
                       "timestamp": time.time()
                   })

               logger.error(f"[{self.session_id}] KB tool error: {function_name}: {e}")
               raise

       async def send_ui_event(self, event: Dict[str, Any]):
           """Send UI control message to client via data channel."""
           if self.proxy_dc and self.proxy_dc.readyState == "open":
               try:
                   message = json.dumps(event)
                   self.proxy_dc.send(message)
                   logger.debug(f"[{self.session_id}] Sent UI event: {event['type']}")
               except Exception as e:
                   logger.warning(f"[{self.session_id}] Failed to send UI event: {e}")
   ```

2. **Client Data Channel Handler** (`scripts/protocol_v3.js`):
   ```javascript
   class ProtocolV3 {
     // ... existing code ...

     _setupPeerConnectionHandlers() {
       // ... existing handlers ...

       // Listen for data channel messages
       this.pc.ondatachannel = (event) => {
         const channel = event.channel;
         console.log('[ProtocolV3] Data channel opened:', channel.label);

         if (channel.label === 'oai-events') {
           channel.onmessage = (msgEvent) => {
             try {
               const data = JSON.parse(msgEvent.data);

               // Forward UI events to application
               if (data.type && data.type.startsWith('ui.')) {
                 console.log('[ProtocolV3] UI event:', data.type, data);
                 if (this.onEvent) {
                   this.onEvent(data);
                 }
               }

               // Forward other events
               if (this.onEvent) {
                 this.onEvent(data);
               }
             } catch (error) {
               console.error('[ProtocolV3] Failed to parse data channel message:', error);
             }
           };
         }
       };
     }
   }
   ```

**Acceptance Criteria**:
- ✅ Backend emits `ui.kb_busy` on KB tool start
- ✅ Backend emits `ui.kb_busy` on KB tool completion
- ✅ Client receives events via data channel
- ✅ Events forwarded to UIController
- ✅ No blocking of audio pipeline
- ✅ Low latency (<50ms from tool call to beep)

---

### Phase 6: Accessibility + Keyboard Shortcuts (2-3 hours)
**Goal**: Ensure full keyboard navigation and screen reader support

#### Tasks:
1. **ARIA Attributes** (HTML):
   ```html
   <button id="btnConnect"
           class="btn btn-lg btn-green"
           aria-pressed="false"
           aria-label="Connect to voice mode">
     Connect
   </button>

   <div id="breather"
        role="img"
        aria-label="Voice status: idle"
        aria-live="polite">
     <!-- Canvas + pulse -->
   </div>

   <div id="transcript"
        role="log"
        aria-live="polite"
        aria-atomic="false">
     <!-- Transcript content -->
   </div>
   ```

2. **Keyboard Shortcuts** (`scripts/keyboard-shortcuts.js`):
   ```javascript
   class KeyboardShortcuts {
     constructor(uiController) {
       this.uiController = uiController;
       this.enabled = true;

       document.addEventListener('keydown', (e) => {
         if (!this.enabled) return;

         // Don't interfere with text input
         if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
           return;
         }

         switch(e.key.toLowerCase()) {
           case 'm':
             e.preventDefault();
             this.uiController.toggleMute();
             break;

           case 'c':
             if (e.ctrlKey || e.metaKey) {
               e.preventDefault();
               document.getElementById('btnCopyLogs').click();
             }
             break;

           case 'x':
             if (e.ctrlKey || e.metaKey) {
               e.preventDefault();
               document.getElementById('btnClearLogs').click();
             }
             break;

           case 'enter':
           case ' ':
             // Space/Enter on focused button
             if (document.activeElement.tagName === 'BUTTON') {
               e.preventDefault();
               document.activeElement.click();
             }
             break;
         }
       });
     }
   }
   ```

3. **Screen Reader Announcements**:
   ```javascript
   class UIController {
     // ... existing code ...

     updateVoiceStatus(status) {
       const breather = document.getElementById('breather');
       const statusText = {
         'idle': 'Idle, not connected',
         'listening': 'Listening for your voice',
         'speaking': 'Assistant is speaking',
         'searching': 'Searching knowledge base'
       };

       breather.setAttribute('aria-label', `Voice status: ${statusText[status] || status}`);

       // Optional: create live region announcement
       const announcement = document.createElement('div');
       announcement.className = 'sr-only';
       announcement.setAttribute('role', 'status');
       announcement.setAttribute('aria-live', 'polite');
       announcement.textContent = statusText[status];
       document.body.appendChild(announcement);

       setTimeout(() => announcement.remove(), 1000);
     }
   }
   ```

**Acceptance Criteria**:
- ✅ All buttons have proper ARIA labels
- ✅ Keyboard shortcuts work (M, Ctrl+C, Ctrl+X)
- ✅ Tab navigation follows logical order
- ✅ Focus indicators visible on all controls
- ✅ Screen reader announces state changes
- ✅ No keyboard traps

---

### Phase 7: Testing + Documentation (2-3 hours)
**Goal**: Comprehensive testing and user documentation

#### Tasks:
1. **Automated Tests** (`tests/ui-upgrade.spec.ts`):
   ```typescript
   import { test, expect } from '@playwright/test';

   test.describe('UI Upgrade - ChatGPT Style', () => {
     test('should show 4 buttons only', async ({ page }) => {
       await page.goto('http://localhost:8080');

       const buttons = page.locator('button');
       await expect(buttons).toHaveCount(5); // 4 main + 1 settings gear

       await expect(page.locator('#btnConnect')).toBeVisible();
       await expect(page.locator('#btnMute')).toBeVisible();
       await expect(page.locator('#btnCopyLogs')).toBeVisible();
       await expect(page.locator('#btnClearLogs')).toBeVisible();
     });

     test('should toggle Connect/Disconnect', async ({ page }) => {
       await page.goto('http://localhost:8080');

       const btn = page.locator('#btnConnect');
       await expect(btn).toHaveText('Connect');
       await expect(btn).toHaveClass(/btn-green/);

       await btn.click();
       await expect(btn).toHaveText('Disconnect');
       await expect(btn).toHaveClass(/btn-red/);
     });

     test('should play searching beep on KB tool call', async ({ page, context }) => {
       // Grant microphone permissions
       await context.grantPermissions(['microphone']);

       await page.goto('http://localhost:8080');

       // Listen for audio feedback
       let beepPlayed = false;
       await page.exposeFunction('onBeepPlayed', () => { beepPlayed = true; });

       // Connect
       await page.locator('#btnConnect').click();

       // Trigger KB tool (mock or real)
       // ... test implementation ...

       // Verify beep was played
       await page.waitForFunction(() => window.beepPlayed === true, { timeout: 5000 });
       expect(beepPlayed).toBe(true);
     });

     test('should respect mute state for beeps', async ({ page, context }) => {
       await context.grantPermissions(['microphone']);
       await page.goto('http://localhost:8080');

       await page.locator('#btnConnect').click();
       await page.locator('#btnMute').click();

       // Trigger KB tool
       // ... test implementation ...

       // Verify beep was NOT played
       // ... assertion ...
     });
   });
   ```

2. **Manual Test Checklist** (`docs/UI_UPGRADE_TEST_PLAN.md`):
   ```markdown
   # UI Upgrade Manual Test Plan

   ## Pre-flight
   - [ ] Deploy to staging (quran.asimo.io)
   - [ ] Clear browser cache
   - [ ] Test on Chrome, Safari, Firefox
   - [ ] Test on iOS, Android

   ## UI Tests
   - [ ] Connect button turns red "Disconnect"
   - [ ] Disconnect button turns green "Connect"
   - [ ] Mute button toggles text/state
   - [ ] Copy Logs copies to clipboard
   - [ ] Clear Logs clears logs pane
   - [ ] Only 4 buttons visible (+ settings gear)
   - [ ] Breathing element shows correctly
   - [ ] Canvas visualizer animates smoothly

   ## KB Beep Tests
   - [ ] Ask "How many books?" → hear soft beep
   - [ ] Beep is ~120-160ms duration
   - [ ] Beep is low volume, non-intrusive
   - [ ] Beep suppressed when muted
   - [ ] Beep toggle in settings works
   - [ ] No beep mixed into microphone

   ## State Transitions
   - [ ] Idle → Listening (after connect)
   - [ ] Listening → Speaking (TTS starts)
   - [ ] Speaking → Listening (TTS ends)
   - [ ] Listening → Searching (KB tool starts)
   - [ ] Searching → Listening (KB tool completes)

   ## Accessibility
   - [ ] Tab navigation works
   - [ ] Keyboard shortcuts (M, Ctrl+C, Ctrl+X)
   - [ ] Focus indicators visible
   - [ ] ARIA labels present
   - [ ] Screen reader announces states
   - [ ] prefers-reduced-motion disables animations

   ## Performance
   - [ ] Canvas 60fps on desktop
   - [ ] Canvas 30fps+ on mobile
   - [ ] No audio glitches/dropouts
   - [ ] Beep doesn't block TTS
   - [ ] UI responsive (<100ms clicks)
   ```

3. **User Documentation** (`docs/UI_GUIDE.md`):
   ```markdown
   # Voice Mode UI Guide

   ## Overview
   The new Voice Mode interface features a minimalist ChatGPT-style design with:
   - **Central breathing element**: Visual indicator of voice state
   - **4 simple buttons**: Connect, Mute, Copy Logs, Clear Logs
   - **Audible feedback**: Soft beep when searching knowledge base

   ## Controls

   ### Connect/Disconnect
   - **Green "Connect"**: Start voice session
   - **Red "Disconnect"**: End voice session
   - **Keyboard**: Focus button + Enter/Space

   ### Mute/Unmute
   - **Mute**: Stop microphone without disconnecting
   - **Unmute**: Resume microphone
   - **Keyboard**: Press `M`

   ### Copy Logs
   - Copies all logs to clipboard
   - **Keyboard**: `Ctrl+C` (when not in text field)

   ### Clear Logs
   - Clears logs pane
   - **Keyboard**: `Ctrl+X` (when not in text field)

   ## Visual States

   ### Idle (Gray)
   - Not connected

   ### Listening (Blue)
   - Microphone active, waiting for speech
   - Blue pulsing glow

   ### Speaking (Orange)
   - Assistant is speaking
   - Orange wave animation

   ### Searching (Yellow)
   - Searching knowledge base
   - Yellow/blue faster pulse
   - Soft audible beep

   ## Settings

   Click ⚙️ gear icon to access:
   - **KB searching beep**: Toggle audible feedback (default ON)
   - **Protocol v3**: Enable WebRTC transport (default ON)
   - **Server VAD**: Server-side voice detection
   - **Recitation mode**: Quranic recitation settings

   ## Accessibility

   - Full keyboard navigation
   - Screen reader support (ARIA labels)
   - Reduced motion support (disables animations)
   - High contrast compatible
   ```

**Acceptance Criteria**:
- ✅ All automated tests passing
- ✅ Manual test checklist completed
- ✅ User documentation published
- ✅ No regressions in existing features

---

## File Structure

```
web-app/
├── index.html                      # ✏️ MODIFIED: New UI structure + Now Reading panel
├── styles/
│   └── voice-ui.css                # ✨ NEW: ChatGPT-style UI styles
├── scripts/
│   ├── protocol_v3.js              # ✏️ MODIFIED: Data channel event hooks
│   ├── ui-controller.js            # ✨ NEW: Main UI controller
│   ├── visualizer.js               # ✨ NEW: Canvas visualizer
│   ├── audio-feedback.js           # ✨ NEW: Beep synthesizer + completion chime
│   ├── keyboard-shortcuts.js       # ✨ NEW: Keyboard navigation
│   ├── now-reading-panel.js        # ✨ NEW: "Now Reading" panel controller
│   └── settings-panel.js           # ✏️ MODIFIED: Add audible feedback toggles
├── tests/
│   ├── ui-upgrade.spec.ts          # ✨ NEW: UI upgrade tests
│   └── now-reading.spec.ts         # ✨ NEW: Now Reading panel tests
└── docs/
    ├── UI_UPGRADE_PLAN.md          # ✨ NEW: This document
    ├── UI_UPGRADE_TEST_PLAN.md     # ✨ NEW: Test checklist
    └── UI_GUIDE.md                 # ✨ NEW: User guide

backend/
└── app/routers/
    └── realtime_v3_proxy.py        # ✏️ MODIFIED: KB tool event hooks + reading progress events
```

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1. UI Surface Refactor | 2-3 hours | None |
| 2. Breathing Element + Visualizer | 2-3 hours | Phase 1 |
| 3. Button Wiring + Protocol v3 | 3-4 hours | Phase 1, 2 |
| 4. KB Searching Beep | 3-4 hours | Phase 3 |
| 5. Server-Side KB Events | 3-4 hours | Phase 4 |
| 6. Accessibility + Keyboard | 2-3 hours | Phase 1-5 |
| 7. Testing + Documentation | 2-3 hours | Phase 1-6 |
| 8. Completion Chime | 2 hours | Phase 4, 5 |
| 9. "Now Reading" Panel | 3-4 hours | Phase 5 |
| **Total** | **22-30 hours** | ~4-5 days |

---

## Rollout Plan

### Stage 1: Development (Local)
1. Implement Phases 1-7 on local machine
2. Test with Protocol v3 locally
3. Verify all automated tests pass

### Stage 2: Staging (quran.asimo.io)
1. Deploy to staging server
2. Run manual test checklist
3. Test on multiple devices/browsers
4. Collect feedback from 2-3 users

### Stage 3: Production
1. Create feature flag: `CHATGPT_UI_ENABLED`
2. Deploy behind feature flag
3. Enable for 10% of users (canary)
4. Monitor metrics (connection rate, errors, beep feedback)
5. Gradually increase to 100%

### Stage 4: Cleanup
1. Remove old UI code (device dropdowns, etc.)
2. Update documentation
3. Archive old screenshots/videos

---

## Success Metrics

### Quantitative
- **Connection success rate**: >95% (same as v3 baseline)
- **Beep latency**: <50ms from KB tool call to beep
- **Canvas FPS**: >30fps on mobile, >60fps on desktop
- **Accessibility score**: 100/100 (Lighthouse)
- **Test coverage**: >90% (Playwright)

### Qualitative
- **User feedback**: "UI is cleaner and easier to use"
- **KB awareness**: "I know when it's searching the books"
- **No confusion**: Zero reports of "why is it silent?"

---

## Risks + Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Canvas performance on mobile | Medium | Throttle FPS, disable on low-end devices |
| Beep too loud/annoying | Medium | User testing, settings toggle, low volume |
| Data channel latency | High | Optimize message size, monitor metrics |
| Accessibility regressions | High | Comprehensive a11y testing, screen reader QA |
| Protocol v3 instability | High | Keep v2 fallback, feature flag rollout |

---

---

### Phase 8: Completion Chime (2 hours)
**Goal**: Add subtle audible feedback when KB tool completes successfully

#### Tasks:
1. **Enhanced Audio Feedback** (`scripts/audio-feedback.js`):
   ```javascript
   class AudioFeedback {
     // ... existing code ...

     // Completion chime (softer, lower pitch than searching beep)
     playCompletionChime() {
       if (!this.enabled || this.muted) return;

       this.init();

       const now = this.audioContext.currentTime;
       const duration = 0.1; // 100ms (shorter than searching beep)

       // Two-tone chime for pleasant completion sound
       const osc1 = this.audioContext.createOscillator();
       osc1.type = 'sine';
       osc1.frequency.value = 660; // E5 (lower pitch)

       const osc2 = this.audioContext.createOscillator();
       osc2.type = 'sine';
       osc2.frequency.value = 880; // A5 (harmonic)

       const gain = this.audioContext.createGain();
       gain.gain.setValueAtTime(0, now);
       gain.gain.linearRampToValueAtTime(0.06, now + 0.003); // Very soft
       gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

       // Mix both oscillators
       osc1.connect(gain);
       osc2.connect(gain);
       gain.connect(this.audioContext.destination);

       osc1.start(now);
       osc2.start(now + 0.02); // Slight delay for pleasant harmony
       osc1.stop(now + duration);
       osc2.stop(now + duration);

       console.log('[AudioFeedback] Playing completion chime');
     }
   }
   ```

2. **UI Controller Integration**:
   ```javascript
   handleProtocolEvent(event) {
     // ... existing code ...

     // KB tool call completed - play completion chime
     if (event.type === 'ui.kb_busy' && event.status === 'completed') {
       this.audioFeedback.playCompletionChime();
       this.visualizer.setState('listening');
       this.addLog(`✅ Completed: ${event.tool}`);
     }
   }
   ```

3. **Settings Toggle**:
   ```javascript
   // Add separate toggle for completion chime (default ON)
   const completionChimeCheckbox = document.createElement('input');
   completionChimeCheckbox.type = 'checkbox';
   completionChimeCheckbox.id = 'completionChime';
   completionChimeCheckbox.checked = ASIMO_SETTINGS.completionChime !== false;

   completionChimeCheckbox.addEventListener('change', (e) => {
     ASIMO_SETTINGS.completionChime = e.target.checked;
     if (window.uiController) {
       window.uiController.audioFeedback.enableCompletionChime = e.target.checked;
     }
   });
   ```

**Acceptance Criteria**:
- ✅ Chime plays when KB tool completes
- ✅ Distinct from searching beep (two-tone, softer, 100ms)
- ✅ Suppressed when muted
- ✅ Toggle in settings works independently
- ✅ Pleasant, non-intrusive sound

---

### Phase 9: "Now Reading" Panel (3-4 hours)
**Goal**: Display current book/section/page during verbatim narration with continuation prompt

#### Tasks:
1. **Now Reading Panel UI** (`index.html`):
   ```html
   <section id="nowReadingPanel" class="now-reading" style="display:none">
     <div class="now-reading-header">
       <h3>📖 Now Reading</h3>
       <button id="btnStopReading" class="btn btn-sm btn-outline" aria-label="Stop reading">Stop</button>
     </div>

     <div class="now-reading-content">
       <div class="book-info">
         <div class="book-title" id="readingTitle">—</div>
         <div class="book-author" id="readingAuthor">—</div>
       </div>

       <div class="section-info">
         <div class="section-header" id="readingSection">—</div>
         <div class="page-progress" id="readingProgress">
           Page <span id="currentPage">—</span> of <span id="totalPages">—</span>
         </div>
       </div>

       <div class="reading-controls" id="readingControls" style="display:none">
         <p class="continuation-prompt">
           Continue with the next <span id="nextPageCount">10</span> pages?
         </p>
         <div class="btn-group">
           <button id="btnContinueReading" class="btn btn-primary">Yes, Continue</button>
           <button id="btnStopAtEnd" class="btn btn-secondary">No, Stop Here</button>
         </div>
       </div>
     </div>
   </section>
   ```

2. **Panel Styling** (`styles/voice-ui.css`):
   ```css
   .now-reading {
     position: fixed;
     bottom: 20px;
     right: 20px;
     width: 320px;
     max-width: calc(100vw - 40px);
     background: #1a1a1a;
     border: 1px solid #2a2a2a;
     border-radius: 12px;
     padding: 16px;
     box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
     z-index: 1000;
     animation: slide-up 0.3s ease-out;
   }

   @keyframes slide-up {
     from {
       transform: translateY(20px);
       opacity: 0;
     }
     to {
       transform: translateY(0);
       opacity: 1;
     }
   }

   .now-reading-header {
     display: flex;
     justify-content: space-between;
     align-items: center;
     margin-bottom: 12px;
   }

   .now-reading-header h3 {
     margin: 0;
     font-size: 14px;
     font-weight: 600;
     color: #3fa8ff;
   }

   .book-info {
     margin-bottom: 12px;
   }

   .book-title {
     font-size: 15px;
     font-weight: 600;
     color: #fff;
     margin-bottom: 4px;
     line-height: 1.3;
   }

   .book-author {
     font-size: 13px;
     color: #999;
   }

   .section-header {
     font-size: 13px;
     color: #ccc;
     margin-bottom: 8px;
     font-style: italic;
   }

   .page-progress {
     font-size: 12px;
     color: #3fa8ff;
     font-weight: 500;
   }

   .reading-controls {
     margin-top: 12px;
     padding-top: 12px;
     border-top: 1px solid #2a2a2a;
   }

   .continuation-prompt {
     font-size: 13px;
     color: #ddd;
     margin-bottom: 10px;
   }

   .btn-group {
     display: flex;
     gap: 8px;
   }

   .btn-group button {
     flex: 1;
     font-size: 13px;
     padding: 8px 12px;
   }

   .btn-primary {
     background: #3fa8ff;
     color: #fff;
   }

   .btn-secondary {
     background: #2a2a2a;
     color: #ccc;
   }

   @media (prefers-reduced-motion: reduce) {
     .now-reading {
       animation: none;
     }
   }

   @media (max-width: 640px) {
     .now-reading {
       bottom: 10px;
       right: 10px;
       left: 10px;
       width: auto;
     }
   }
   ```

3. **Panel Controller** (`scripts/now-reading-panel.js`):
   ```javascript
   class NowReadingPanel {
     constructor(protocol) {
       this.protocol = protocol;
       this.visible = false;
       this.currentReading = null;

       this.bindControls();
     }

     bindControls() {
       // Stop reading button
       document.getElementById('btnStopReading').addEventListener('click', () => {
         this.stopReading();
       });

       // Continue reading button
       document.getElementById('btnContinueReading').addEventListener('click', () => {
         this.continueReading();
       });

       // Stop at end button
       document.getElementById('btnStopAtEnd').addEventListener('click', () => {
         this.hideControls();
         this.addLog('📚 Will stop at end of current section');
       });
     }

     // Show panel when kb_read_verbatim starts
     show(readingData) {
       this.currentReading = readingData;
       this.visible = true;

       // Update panel content
       document.getElementById('readingTitle').textContent = readingData.title || '—';
       document.getElementById('readingAuthor').textContent = readingData.author || '—';
       document.getElementById('readingSection').textContent = readingData.section_header || '—';
       document.getElementById('currentPage').textContent = readingData.page_start || '—';
       document.getElementById('totalPages').textContent = readingData.page_end || '—';

       // Show panel with animation
       const panel = document.getElementById('nowReadingPanel');
       panel.style.display = 'block';

       console.log('[NowReadingPanel] Showing:', readingData);
     }

     hide() {
       this.visible = false;
       this.currentReading = null;

       const panel = document.getElementById('nowReadingPanel');
       panel.style.display = 'none';

       console.log('[NowReadingPanel] Hidden');
     }

     // Update current page during narration
     updatePage(pageNumber) {
       if (!this.visible) return;

       document.getElementById('currentPage').textContent = pageNumber;

       // Show continuation prompt at end of section
       const currentPage = parseInt(pageNumber);
       const totalPages = parseInt(this.currentReading.page_end);

       if (currentPage >= totalPages - 1) {
         this.showControls();
       }
     }

     // Show "continue reading?" controls
     showControls() {
       const controls = document.getElementById('readingControls');
       controls.style.display = 'block';

       // Update next page count (default 10)
       const nextCount = 10;
       document.getElementById('nextPageCount').textContent = nextCount;

       console.log('[NowReadingPanel] Showing continuation prompt');
     }

     hideControls() {
       const controls = document.getElementById('readingControls');
       controls.style.display = 'none';
     }

     // User clicked "Continue"
     continueReading() {
       this.hideControls();

       // Send continuation request to voice mode
       const nextPageStart = parseInt(this.currentReading.page_end) + 1;
       const nextPageEnd = nextPageStart + 9;

       // Trigger voice command (simulate user saying "continue")
       // Or send control message to backend
       this.protocol.sendControlMessage({
         type: 'kb.read.continue',
         book_id: this.currentReading.book_id,
         page_start: nextPageStart,
         page_end: nextPageEnd
       });

       console.log('[NowReadingPanel] Continue reading:', nextPageStart, '-', nextPageEnd);
     }

     // User clicked "Stop"
     stopReading() {
       this.hide();

       // Send stop command to backend
       this.protocol.sendControlMessage({
         type: 'response.cancel'
       });

       console.log('[NowReadingPanel] Stop reading');
     }
   }
   ```

4. **Integration with UI Controller**:
   ```javascript
   class UIController {
     constructor(protocol) {
       // ... existing code ...
       this.nowReadingPanel = new NowReadingPanel(protocol);

       // Hook into Protocol v3 events
       this.protocol.onEvent = (event) => {
         this.handleProtocolEvent(event);
       };
     }

     handleProtocolEvent(event) {
       // ... existing code ...

       // KB read verbatim started
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

       // Page changed during narration
       if (event.type === 'ui.kb_reading' && event.status === 'page_changed') {
         this.nowReadingPanel.updatePage(event.page_number);
       }

       // Reading completed
       if (event.type === 'ui.kb_reading' && event.status === 'completed') {
         this.nowReadingPanel.hide();
       }
     }
   }
   ```

5. **Backend Event Emission** (`app/routers/realtime_v3_proxy.py`):
   ```python
   async def handle_kb_read_verbatim(self, arguments: Dict[str, Any]):
       """Handle kb_read_verbatim with progress events."""
       book_id = arguments.get("book_id")
       page_start = arguments.get("page_start")
       page_end = arguments.get("page_end")

       # Emit "started" event with reading metadata
       await self.send_ui_event({
           "type": "ui.kb_reading",
           "status": "started",
           "book_id": book_id,
           "title": arguments.get("title"),
           "author": arguments.get("author"),
           "section_header": arguments.get("section_header"),
           "page_start": page_start,
           "page_end": page_end,
           "timestamp": time.time()
       })

       # Stream verbatim text with page numbers
       async for chunk in stream_verbatim_text(book_id, page_start, page_end):
           # Emit page change events
           if chunk.get("page_number"):
               await self.send_ui_event({
                   "type": "ui.kb_reading",
                   "status": "page_changed",
                   "page_number": chunk["page_number"],
                   "timestamp": time.time()
               })

           yield chunk

       # Emit "completed" event
       await self.send_ui_event({
           "type": "ui.kb_reading",
           "status": "completed",
           "timestamp": time.time()
       })
   ```

**Acceptance Criteria**:
- ✅ Panel appears when verbatim reading starts
- ✅ Displays book title, author, section, page progress
- ✅ Updates current page during narration
- ✅ Shows "Continue?" prompt at end of section
- ✅ "Yes, Continue" loads next 10 pages
- ✅ "No, Stop Here" dismisses prompt
- ✅ "Stop" button cancels reading immediately
- ✅ Panel animates smoothly (slide-up)
- ✅ Responsive on mobile

---

## Future Enhancements

### Phase 10: Advanced Visualizer Modes
- Waveform, spectrum, circular modes
- User-selectable in settings
- Color themes (match breathing state)

---

## References

- [Protocol v3 Implementation](PROTOCOL_V3_IMPLEMENTATION_COMPLETE.md)
- [Protocol v3 Final Status](PROTOCOL_V3_FINAL_STATUS.md)
- [Backend Codex](~/.claude/CLAUDE.md)
- [WebRTC API Docs](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

**Next Steps**: Review this plan, get approval, then proceed with Phase 1 implementation.

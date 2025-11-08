# Protocol v2 Integration Guide

## Overview

This document explains how to integrate and use Protocol v2 in the web-app. Protocol v2 provides deterministic audio handling with:

- Single JSON ingestion path (no multi-path complexity)
- Monotonic frame_id for guaranteed ordering
- Hybrid commit protocol (client proposes, server accepts/defers)
- Auto-commit backstop to prevent deadlocks

## Quick Start

### 1. Enable Protocol v2

In your browser console or JavaScript code:

```javascript
localStorage.setItem("useProtocolV2", "true");
```

Then refresh the page.

### 2. Disable Protocol v2 (Revert to v1)

```javascript
localStorage.removeItem("useProtocolV2");
// or
localStorage.setItem("useProtocolV2", "false");
```

Then refresh the page.

## Protocol v2 Client Adapter

The `ProtocolV2` class (`scripts/protocol_v2.js`) provides a clean client-side API for Protocol v2.

### Basic Usage

```javascript
import { ProtocolV2 } from "./scripts/protocol_v2.js";

// 1. Create instance
const audioCtx = new AudioContext({ sampleRate: 24000 });
const p2 = new ProtocolV2("ws://localhost:8000/realtime/v2", audioCtx, {
  sampleRateHz: 24000,
  minMs: 140,
  proposeIntervalMs: 100,
});

// 2. Set up event handlers (optional)
p2.onReady = () => console.log("Protocol v2 ready!");
p2.onCommitAck = (ack) => console.log("Commit response:", ack);
p2.onError = (err) => console.error("Protocol v2 error:", err);

// 3. Connect
await p2.connect();

// 4. Send audio frames (20ms PCM16 @ 24kHz)
const pcm16Bytes = ...; // Float32Array from AudioWorklet
const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcm16Bytes.buffer)));
p2.sendFrame(base64Audio, Date.now());

// 5. Propose commits (auto-proposes every 100ms, or manually)
p2.proposeCommit("end_of_turn"); // Force commit at end

// 6. Disconnect when done
await p2.disconnect();
```

### API Reference

#### Constructor

```javascript
new ProtocolV2(wsUrl, audioCtx, options)
```

**Options:**
- `sampleRateHz` (number): Audio sample rate (16000 or 24000, default 24000)
- `minMs` (number): Minimum audio duration before proposing commits (default 140ms)
- `proposeIntervalMs` (number): How often to auto-propose commits (default 100ms)

#### Methods

**`async connect()`**
- Connect to server and open turn
- Returns Promise that resolves when turn is opened

**`sendFrame(pcm16BytesBase64, timestampMs)`**
- Send 20ms audio frame to server
- Automatically increments frame_id
- Auto-proposes commits every `proposeIntervalMs`

**`proposeCommit(reason, lastFrameId)`**
- Manually propose commit to server
- `reason`: "periodic" | "end_of_turn"
- `lastFrameId`: Optional, defaults to current frame_id

**`keepalive()`**
- Send keepalive ping to server

**`reset()`**
- Start new turn with new turn_id
- Resets frame_id counter

**`getStats()`**
- Get current statistics object
- Returns: `{ framesSent, framesAcked, commitsProposed, commitsAccepted, commitsDeferred }`

**`async disconnect()`**
- Disconnect from server

#### Event Handlers

Set these properties to handle events:

```javascript
p2.onReady = () => { /* Turn opened and ready */ };
p2.onFrameAck = (frameId) => { /* Frame acknowledged */ };
p2.onCommitAck = (ack) => { /* Commit response: { status: "accept|defer", ms, min_ms_needed } */ };
p2.onError = (error) => { /* Error occurred */ };
p2.onDisconnect = () => { /* WebSocket disconnected */ };
```

## Integration with Existing Voice Code

### Option 1: Conditional Import (Recommended)

Modify `scripts/voice.js` to check `localStorage.useProtocolV2`:

```javascript
// At top of voice.js
const useV2 = localStorage.getItem("useProtocolV2") === "true";

let protocol;
if (useV2) {
  const { ProtocolV2 } = await import("./protocol_v2.js");
  protocol = new ProtocolV2("ws://localhost:8000/realtime/v2", audioCtx);
  await protocol.connect();
} else {
  // Use existing v1 logic
}

// In audio processing loop
if (useV2) {
  protocol.sendFrame(base64Audio, Date.now());
} else {
  // Existing v1 append logic
}
```

### Option 2: Separate Voice Mode File

Create a new `voice_v2.js` file that imports `ProtocolV2` and uses it exclusively. Toggle between `voice.js` and `voice_v2.js` based on localStorage flag.

## Server Endpoints

- **v1 (current)**: `ws://localhost:8000/realtime`
- **v2 (new)**: `ws://localhost:8000/realtime/v2`

Both endpoints coexist. Protocol v2 is opt-in via localStorage toggle.

## Message Flow

### Client → Server

1. **v2.open**: Open turn with audio format
   ```json
   {
     "type": "v2.open",
     "turn_id": "<uuid>",
     "audio_format": { "type": "pcm16", "sample_rate_hz": 24000 }
   }
   ```

2. **v2.append**: Send 20ms audio frame
   ```json
   {
     "type": "v2.append",
     "turn_id": "<uuid>",
     "frame_id": 123,
     "ts_ms": 1762,
     "audio": "<base64 PCM16>"
   }
   ```

3. **v2.commit_proposal**: Propose commit
   ```json
   {
     "type": "v2.commit_proposal",
     "turn_id": "<uuid>",
     "last_frame_id": 123,
     "reason": "periodic|end_of_turn"
   }
   ```

### Server → Client

1. **v2.ack.append**: Frame acknowledged
   ```json
   {
     "type": "v2.ack.append",
     "turn_id": "<uuid>",
     "frame_id": 123
   }
   ```

2. **v2.ack.commit**: Commit response
   - **Accept:**
     ```json
     {
       "type": "v2.ack.commit",
       "turn_id": "<uuid>",
       "status": "accept",
       "ms": 145.2
     }
     ```
   - **Defer:**
     ```json
     {
       "type": "v2.ack.commit",
       "turn_id": "<uuid>",
       "status": "defer",
       "min_ms_needed": 35
     }
     ```

3. **v2.error**: Error occurred
   ```json
   {
     "type": "v2.error",
     "code": "out_of_order|bad_base64|unknown_type",
     "detail": "..."
   }
   ```

## Testing

### Enable Protocol v2

1. Open browser console: `localStorage.setItem("useProtocolV2", "true")`
2. Refresh page
3. Start voice conversation
4. Observe console logs: `[ProtocolV2] ...`

### Verify Metrics

Check that:
- Frame IDs are monotonically increasing
- Commits are accepted when buffer ≥140ms
- Commits are deferred when buffer <140ms
- Auto-commit backstop triggers after 350ms

### Debug Logging

Protocol v2 logs all activity to console:
- `[ProtocolV2] Initialized: ...`
- `[ProtocolV2] WebSocket connected`
- `[ProtocolV2] Turn opened, ready to send frames`
- `[ProtocolV2] Proposed commit: frame_id=123, reason=periodic`
- `[ProtocolV2] Commit accepted: 145.2ms`
- `[ProtocolV2] Commit deferred: need 35ms more`

## Troubleshooting

### "Not ready, skipping frame"

**Cause**: Trying to send frames before turn is opened.

**Solution**: Wait for `p2.onReady` callback or `await p2.connect()` to resolve before sending frames.

### "Out-of-order frame rejected"

**Cause**: Server received frame with frame_id ≤ last_frame_id (protocol violation).

**Solution**: Check that frame_id is monotonically increasing. Don't reset frame_id mid-turn.

### Commits always deferred

**Cause**: Sending frames too slowly (buffer never reaches 140ms).

**Solution**:
- Check frame size (should be 960 bytes for 20ms @ 24kHz)
- Verify sample rate matches (24kHz)
- Wait longer before proposing commits

### Auto-commit backstop triggered

**Cause**: No commit for 350ms (server forces commit).

**Solution**: Propose commits more frequently (every 100-150ms) or at end-of-turn.

## Performance Notes

- **Frame size**: 20ms @ 24kHz = 960 bytes (PCM16 mono)
- **Commit frequency**: Every 100ms (5 frames)
- **Min commit duration**: 140ms (7 frames)
- **Auto-commit backstop**: 350ms

## Rollback Plan

If Protocol v2 causes issues:

1. Disable for all users: Remove localStorage check, use v1 only
2. Server remains compatible: v1 endpoint (/realtime) unchanged
3. No data loss: Both protocols handle same audio data

## Related Files

- **Backend Protocol v2**: `/opt/quran-rtc/backend/docs/REALTIME_PROTOCOL_V2.md`
- **Backend Endpoint**: `/opt/quran-rtc/backend/app/routers/realtime_v2_ws.py`
- **Web Client**: `scripts/protocol_v2.js`

## Questions?

For detailed protocol specification, see backend documentation:
`/opt/quran-rtc/backend/docs/REALTIME_PROTOCOL_V2.md`

---

**Last Updated**: 2025-11-07
**Status**: Ready for testing

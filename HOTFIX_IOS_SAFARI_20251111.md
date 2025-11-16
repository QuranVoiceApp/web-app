# iOS Safari Connection Hotfix

**Date**: 2025-11-11 00:30 CST
**Status**: ✅ **DEPLOYED TO PRODUCTION** (v2)
**Build**: HOTFIX_IOS_SAFARI_20251111_0030

---

## Issue Report

**User Report**: Connection fails on iOS Safari when clicking "Connect" button
**Error**: `TypeError: null is not an object (evaluating 'this.pc.addTrack')`

**Console Logs**:
```
[ProtocolV3] Microphone stopped
[AudioFeedback] Muted: true
[Visualizer] State change: "listening" → "idle"
[UIController] 🔇 Microphone muted
[ProtocolV3] Requesting microphone access...
[AudioFeedback] Muted: false
[Visualizer] State change: "idle" → "listening"
[UIController] 🎤 Microphone active
[ProtocolV3] Microphone access granted
[Error] [ProtocolV3] Microphone error: TypeError: null is not an object (evaluating 'this.pc.addTrack')
```

---

## Root Cause Analysis

### Problem 1: Race Condition in `startMicrophone()`
**File**: `/var/www/quran/scripts/protocol_v3.js:193`

The `startMicrophone()` method assumed `this.pc` (RTCPeerConnection) would always exist when called. However, if the method is called:
1. **Before** `connect()` creates the peer connection, OR
2. **After** `disconnect()` cleans up and sets `this.pc = null`

...then line 193 would fail with `TypeError: null is not an object`.

**Sequence of Events**:
1. iOS Safari automatically mutes/unmutes microphone on page load
2. This triggers `toggleMute()` → `protocol.startMicrophone()`
3. `startMicrophone()` tries to access `this.pc.addTrack()` before connection is established
4. Crash!

### Problem 2: Incorrect Mute Implementation
**File**: `/var/www/quran/scripts/ui-controller.js:223-225`

The `toggleMute()` method was calling:
- `protocol.stopMicrophone()` when muting (stops tracks entirely)
- `protocol.startMicrophone()` when unmuting (re-requests mic access + adds track)

This is **wrong** for muting during an active connection. Muting should only **disable** the audio track (`track.enabled = false`), not stop it entirely.

### Problem 3: Legacy voice.js Conflicting with New UI
**File**: `/var/www/quran/scripts/voice.js:3508`
**Error**: `TypeError: null is not an object (evaluating '$('vadThresh').addEventListener')`

The legacy `voice.js` client (for Protocol v1/v2) was still being loaded by `bootstrap.js` and tried to bind to old UI elements:
- `vadThresh` (VAD threshold slider)
- `log` (log textarea)
- `voice` (voice selector)
- `ptt` (push-to-talk checkbox)

These elements **don't exist** in the new minimalist UI, causing crashes when `voice.js` tried to call `.addEventListener()` on `null`.

---

## Fixes Applied

### Fix 1: Defensive Null Check in `startMicrophone()`
**File**: `/home/asimo/web-app/scripts/protocol_v3.js:191-198`

**Before**:
```javascript
this.localStream = await navigator.mediaDevices.getUserMedia(mergedConstraints);
console.log('[ProtocolV3] Microphone access granted');

// Add audio track to peer connection
const audioTrack = this.localStream.getAudioTracks()[0];
this.pc.addTrack(audioTrack, this.localStream);  // ❌ Crashes if this.pc is null

console.log('[ProtocolV3] Audio track added to peer connection');
return this.localStream;
```

**After**:
```javascript
this.localStream = await navigator.mediaDevices.getUserMedia(mergedConstraints);
console.log('[ProtocolV3] Microphone access granted');

// Add audio track to peer connection (only if peer connection exists)
if (this.pc) {
  const audioTrack = this.localStream.getAudioTracks()[0];
  this.pc.addTrack(audioTrack, this.localStream);
  console.log('[ProtocolV3] Audio track added to peer connection');
} else {
  console.warn('[ProtocolV3] Peer connection not initialized, cannot add track');
}

return this.localStream;
```

**Why This Works**: Prevents crash when `startMicrophone()` is called before connection is established or after cleanup.

---

### Fix 2: Add Proper Mute/Unmute Methods
**File**: `/home/asimo/web-app/scripts/protocol_v3.js:220-244`

**Added New Methods**:
```javascript
/**
 * Mute microphone (disable audio track without stopping it).
 */
muteMicrophone() {
  if (this.localStream) {
    const audioTracks = this.localStream.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = false;
    });
    console.log('[ProtocolV3] Microphone muted');
  }
}

/**
 * Unmute microphone (enable audio track).
 */
unmuteMicrophone() {
  if (this.localStream) {
    const audioTracks = this.localStream.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = true;
    });
    console.log('[ProtocolV3] Microphone unmuted');
  }
}
```

**Why This Works**: Toggles `track.enabled` flag instead of stopping/restarting the entire media stream.

---

### Fix 3: Update `toggleMute()` to Use New Methods
**File**: `/home/asimo/web-app/scripts/ui-controller.js:220-227`

**Before**:
```javascript
// Update Protocol v3 client
if (this.protocol) {
  if (this.muted) {
    this.protocol.stopMicrophone();    // ❌ Stops track entirely
  } else {
    this.protocol.startMicrophone();   // ❌ Re-requests mic + tries to add track
  }
}
```

**After**:
```javascript
// Update Protocol v3 client (enable/disable audio track, don't stop/start)
if (this.protocol) {
  if (this.muted) {
    this.protocol.muteMicrophone();    // ✅ Disables track
  } else {
    this.protocol.unmuteMicrophone();  // ✅ Enables track
  }
}
```

**Why This Works**: Muting now only toggles `track.enabled`, not the entire media stream.

---

### Fix 4: Skip Loading voice.js When New UI is Active
**File**: `/home/asimo/web-app/scripts/bootstrap.js:31-43`

**Before**:
```javascript
const loadNext = (idx) => {
  if (idx >= scriptsInOrder.length) return;
  const tag = document.createElement('script');
  tag.src = scriptsInOrder[idx] + '?v=' + encodeURIComponent(versionToken);
  // ... load script
};
```

**After**:
```javascript
// Check if new UI is active (has UIController and no old UI elements)
const hasNewUI = !document.getElementById('vadThresh') && !document.getElementById('log');

const loadNext = (idx) => {
  if (idx >= scriptsInOrder.length) return;

  // Skip voice.js if new UI is detected (UIController handles Protocol v3)
  const scriptPath = scriptsInOrder[idx];
  if (hasNewUI && scriptPath.includes('voice.js')) {
    console.log('[bootstrap] Skipping voice.js (new UI detected)');
    loadNext(idx + 1);
    return;
  }

  const tag = document.createElement('script');
  tag.src = scriptPath + '?v=' + encodeURIComponent(versionToken);
  // ... load script
};
```

**Why This Works**:
- Detects new UI by checking if old elements (`vadThresh`, `log`) are missing
- Skips loading `voice.js` entirely when new UI is active
- `UIController` handles Protocol v3, so `voice.js` is not needed
- Allows backward compatibility: if old UI is restored, `voice.js` loads normally

---

## Files Modified

### 1. `/home/asimo/web-app/scripts/protocol_v3.js`
- **Lines 191-198**: Added null check before `this.pc.addTrack()`
- **Lines 220-244**: Added `muteMicrophone()` and `unmuteMicrophone()` methods

### 2. `/home/asimo/web-app/scripts/ui-controller.js`
- **Lines 220-227**: Updated `toggleMute()` to use `muteMicrophone()` / `unmuteMicrophone()`

### 3. `/home/asimo/web-app/scripts/bootstrap.js` ⭐ **NEW**
- **Lines 31-43**: Added logic to skip loading `voice.js` when new UI is detected
- **Why**: `voice.js` (legacy v1/v2 client) tries to bind to old UI elements (`vadThresh`, `log`, etc.) that don't exist in the new minimalist UI, causing crashes

---

## Deployment

**Commands**:
```bash
# Deploy fixed files (v1 - 00:26 CST)
sudo cp /home/asimo/web-app/scripts/protocol_v3.js /var/www/quran/scripts/
sudo cp /home/asimo/web-app/scripts/ui-controller.js /var/www/quran/scripts/

# Deploy fixed files (v2 - 00:30 CST)
sudo cp /home/asimo/web-app/scripts/bootstrap.js /var/www/quran/scripts/

# Verify deployment
ls -lh /var/www/quran/scripts/{protocol_v3,ui-controller,bootstrap}.js
```

**Deployment Timeline**:
- **00:26 CST**: Initial hotfix (protocol_v3.js, ui-controller.js)
- **00:30 CST**: Follow-up fix (bootstrap.js to skip voice.js)

**Files Deployed**:
- ✅ `/var/www/quran/scripts/protocol_v3.js` (15 KB, 00:26 CST)
- ✅ `/var/www/quran/scripts/ui-controller.js` (12 KB, 00:26 CST)
- ✅ `/var/www/quran/scripts/bootstrap.js` (2.9 KB, 00:30 CST)

---

## Testing Instructions

### Test on iOS Safari

1. Open Safari on iPhone
2. Navigate to https://quran.asimo.io/
3. Click "Connect" button
4. **Expected**: Connection should succeed without errors
5. **Expected**: Microphone permission prompt appears
6. Grant microphone permission
7. **Expected**: "Connected successfully" log appears
8. **Expected**: Breathing element shows "listening" state (blue pulse)
9. Click "Mute" button
10. **Expected**: Button turns orange, visualizer goes to "idle" state
11. Click "Unmute" button
12. **Expected**: Button returns to normal, visualizer returns to "listening" state
13. Say: "How many books are in our knowledge base?"
14. **Expected**: KB searching beep plays, assistant responds with "47 books"

### Expected Console Logs (Success)

```
[ProtocolV3] Requesting microphone access...
[ProtocolV3] Microphone access granted
[ProtocolV3] Audio track added to peer connection
[ProtocolV3] Creating SDP offer...
[ProtocolV3] Sending SDP offer to backend proxy...
[ProtocolV3] Received SDP answer from backend proxy
[ProtocolV3] Remote SDP set, waiting for connection...
[ProtocolV3] Connection state: connected
[ProtocolV3] WebRTC connection established via proxy!
[UIController] ✅ Connected successfully
```

---

## Success Criteria

| Test Case | Status |
|-----------|--------|
| Connection succeeds on iOS Safari | 🔄 **Awaiting User Test** |
| No "null is not an object" errors | 🔄 **Awaiting User Test** |
| Mute button works correctly | 🔄 **Awaiting User Test** |
| Unmute button works correctly | 🔄 **Awaiting User Test** |
| KB searching beep plays | 🔄 **Awaiting User Test** |
| Voice interaction works end-to-end | 🔄 **Awaiting User Test** |

---

## Rollback Plan

If issues persist:

```bash
# Restore from backup (if needed)
cd /opt/quran-rtc
git checkout scripts/protocol_v3.js scripts/ui-controller.js

# Or restore from Git history
git log --oneline --all -- scripts/protocol_v3.js | head -5
git checkout <commit_hash> -- scripts/protocol_v3.js scripts/ui-controller.js
```

---

## Related Issues

- **Original Deployment**: `DEPLOYMENT_SUMMARY_UI_UPGRADE.md` (2025-11-11 00:19 CST)
- **Issue**: iOS Safari connection failure with null pointer exception
- **Platform**: iOS Safari (mobile)
- **Severity**: Critical (blocks connection on iOS)

---

## Notes

- This hotfix addresses a **critical bug** that blocked iOS Safari users from connecting
- The fixes are **backwards compatible** with desktop browsers (Chrome, Firefox, Safari)
- No backend changes required
- No database migrations required
- No configuration changes required

---

**Status**: ✅ **HOTFIX DEPLOYED - READY FOR USER TESTING**

Please test on iOS Safari and report results! 🚀

# Protocol v3: WebRTC/RTP Implementation Plan

**Date**: 2025-11-09
**Status**: 🔮 Planning Phase
**Target**: Q1 2026
**Priority**: Medium (v2 is stable baseline)

---

## Executive Summary

Protocol v3 will migrate from WebSocket-based audio transport to **WebRTC/RTP** for:
- **Lower latency** (~50-100ms improvement)
- **Better network resilience** (built-in FEC, congestion control)
- **Native browser support** (no custom audio encoding)
- **Direct OpenAI integration** (official WebRTC endpoint available)

**Key Insight**: OpenAI released official WebRTC support for Realtime API in early 2025, making this migration straightforward.

---

## Current State (Protocol v2)

### Architecture
```
Web-App → WebSocket → Backend Proxy → WebSocket → OpenAI Realtime API
         (JSON+base64)                (JSON)
```

### Characteristics
- ✅ Deterministic audio handling (frame_id ordering)
- ✅ Hybrid commit protocol
- ✅ Full metrics/observability
- ✅ Barge-in support
- ⚠️ Latency: ~150-250ms (encoding + network + decoding)
- ⚠️ Base64 encoding overhead (~33% size increase)
- ⚠️ No built-in FEC (Forward Error Correction)

---

## Target State (Protocol v3)

### Architecture
```
Web-App → WebRTC (Opus/RTP) → Backend TURN/ICE → WebRTC → OpenAI Realtime API
         (native)                (relay)           (native)
```

### Characteristics
- ✅ Native browser WebRTC (RTCPeerConnection)
- ✅ Opus codec with in-band FEC
- ✅ Transport-wide congestion control (transport-cc)
- ✅ Lower latency (~100-150ms total)
- ✅ No encoding overhead (native PCM→Opus)
- ✅ Automatic network adaptation
- ✅ NACK retransmissions for packet loss

---

## OpenAI WebRTC Implementation Details

### Endpoint
```
POST https://api.openai.com/v1/realtime/calls
Content-Type: multipart/form-data

Fields:
- sdp: <SDP offer from client>
- model: gpt-4o-realtime-preview
- modalities: ["audio", "text"]
- instructions: <system instructions>
- voice: <alloy|shimmer|etc>
```

### Connection Flow
1. **Client**: Create RTCPeerConnection
2. **Client**: Add microphone track via getUserMedia
3. **Client**: Create data channel ("oai-events")
4. **Client**: Generate SDP offer
5. **Client**: POST offer to OpenAI endpoint (with API key or ephemeral token)
6. **OpenAI**: Returns SDP answer
7. **Client**: Set remote description
8. **Client**: Wait for connection state = "connected"
9. **Client**: Send session.update via data channel
10. **Start**: Bidirectional audio + event exchange

### ICE Candidates
- **Type**: Host-only (no STUN/TURN from OpenAI)
- **Endpoints**: 3 geographic locations (Chicago, Virginia, Austin)
- **Ports**: TCP 443, UDP (firewall-friendly)
- **Trickle ICE**: Supported

### Audio Configuration
- **Codec**: Opus (16kHz or 24kHz)
- **FEC**: In-band forward error correction enabled
- **Fallback**: PCMU/PCMA (G.711)
- **Bandwidth**: Adaptive via transport-cc

### Data Channel
- **Label**: "oai-events"
- **Purpose**: Control messages (session.update, response.create, function calls, etc.)
- **Protocol**: Same JSON events as WebSocket API

---

## Phase Breakdown

### Phase 1: Research & Prototype (2 weeks)

**Goals:**
- ✅ Research OpenAI WebRTC API (COMPLETE)
- Build minimal WebRTC proof-of-concept
- Test direct OpenAI connection (no backend proxy)
- Measure latency improvements

**Deliverables:**
- `/home/asimo/web-app/prototypes/webrtc-poc.html`
- Latency comparison report (v2 vs v3)
- Connection reliability testing results

**Success Criteria:**
- WebRTC connection establishes successfully
- Audio quality matches or exceeds v2
- Latency reduction ≥50ms
- No audio dropouts on test network

---

### Phase 2: Backend Integration Design (1 week)

**Goals:**
- Design backend proxy role for WebRTC
- Plan ephemeral token generation
- Design TURN/ICE server infrastructure
- Plan metrics/observability for WebRTC

**Key Questions:**
1. **Do we proxy WebRTC or go direct?**
   - **Option A**: Direct client → OpenAI (simpler, lower latency)
   - **Option B**: Proxy via backend (metrics, security, control)
   - **Recommendation**: Start with A, add B for enterprise

2. **Authentication strategy?**
   - **Option A**: Backend generates ephemeral tokens
   - **Option B**: Backend proxies SDP exchange
   - **Recommendation**: A (2-hour TTL, server-side only)

3. **TURN server needed?**
   - OpenAI doesn't provide TURN
   - Corporate firewalls may block UDP
   - **Recommendation**: Deploy coturn for fallback

**Deliverables:**
- Architecture diagram (WebRTC flows)
- Ephemeral token API spec
- TURN server deployment plan
- Metrics instrumentation plan

---

### Phase 3: Web-App Client Implementation (3 weeks)

**Goals:**
- Implement Protocol v3 client adapter
- Add feature flag toggle (v2 ↔ v3)
- Maintain backward compatibility
- Add WebRTC-specific metrics

**File Structure:**
```
/home/asimo/web-app/scripts/
├── protocol_v2.js      (existing)
├── protocol_v3.js      (NEW - WebRTC client)
├── webrtc_helpers.js   (NEW - RTCPeerConnection utils)
└── voice.js            (updated - v2/v3 toggle)
```

**Implementation Tasks:**

#### Task 3.1: Protocol v3 Client Class
```javascript
class ProtocolV3 {
  constructor(ephemeralTokenUrl, opts) {
    this.tokenUrl = ephemeralTokenUrl;
    this.pc = null;           // RTCPeerConnection
    this.dataChannel = null;  // oai-events channel
    this.localStream = null;  // Microphone
    this.remoteAudio = null;  // Audio element
    // ... stats, handlers
  }

  async connect() {
    // 1. Get ephemeral token from backend
    // 2. getUserMedia for mic
    // 3. Create RTCPeerConnection
    // 4. Add audio track
    // 5. Create data channel
    // 6. Create SDP offer
    // 7. POST to OpenAI
    // 8. Set remote SDP answer
    // 9. Wait for connected state
  }

  sendEvent(event) {
    // Send JSON via data channel
  }

  onAudio(callback) {
    // Remote audio track
  }

  onEvent(callback) {
    // Data channel messages
  }
}
```

#### Task 3.2: Feature Flag Toggle
```javascript
// voice.js
const useProtocolV3 = localStorage.getItem("useProtocolV3") === "true";

if (useProtocolV3) {
  // Use WebRTC
  const p3 = new ProtocolV3("/realtime/ephemeral", opts);
  await p3.connect();
} else if (useProtocolV2) {
  // Use v2 (current)
} else {
  // Use v1 (legacy)
}
```

#### Task 3.3: WebRTC Metrics
```javascript
window.__qvtMetrics.webrtc = {
  protocol: "v3",
  codec: "opus",
  packetsLost: 0,
  jitter: 0,
  roundTripTime: 0,
  bytesReceived: 0,
  bytesSent: 0,
  connectionState: "connected",
  iceState: "connected",
};
```

**Deliverables:**
- `protocol_v3.js` implementation
- Feature flag in localStorage
- WebRTC stats collection
- Unit tests for v3 client

---

### Phase 4: Backend Ephemeral Token Service (1 week)

**Goals:**
- Implement ephemeral token generation endpoint
- Add rate limiting & security
- Add TURN server credentials
- Deploy to production

**API Spec:**
```
POST /realtime/v3/session
Authorization: Bearer <user-session-token>

Response:
{
  "ephemeral_token": "<openai-ephemeral-token>",
  "expires_at": "2025-11-09T14:30:00Z",
  "turn_servers": [
    {
      "urls": ["turn:turn.asimo.io:3478"],
      "username": "<turn-user>",
      "credential": "<turn-pass>"
    }
  ],
  "ice_servers": [
    {"urls": ["stun:stun.l.google.com:19302"]}
  ]
}
```

**Backend Implementation:**
```python
# /opt/quran-rtc/backend/app/routers/realtime_v3.py

@router.post("/realtime/v3/session")
async def create_webrtc_session(
    user_token: str = Depends(verify_user_token)
):
    # Generate OpenAI ephemeral token
    ephemeral = await openai_client.generate_ephemeral_token(
        ttl_seconds=7200  # 2 hours
    )

    # Generate TURN credentials (if needed)
    turn_creds = generate_turn_credentials(user_token)

    return {
        "ephemeral_token": ephemeral.token,
        "expires_at": ephemeral.expires_at,
        "turn_servers": [
            {
                "urls": [f"turn:turn.asimo.io:3478"],
                "username": turn_creds.username,
                "credential": turn_creds.password,
            }
        ],
        "ice_servers": [
            {"urls": ["stun:stun.l.google.com:19302"]}
        ]
    }
```

**Deliverables:**
- Ephemeral token endpoint
- TURN server deployment (coturn)
- Rate limiting (10 requests/min per user)
- Monitoring dashboard

---

### Phase 5: Testing & Validation (2 weeks)

**Test Matrix:**

| Test | v2 Baseline | v3 Target | Status |
|------|-------------|-----------|--------|
| **Latency** | | | |
| - Mic → First audio | 200ms | <150ms | ⏳ |
| - Speech → Response | 1500ms | <1200ms | ⏳ |
| **Quality** | | | |
| - Audio clarity | Good | Excellent | ⏳ |
| - Packet loss 5% | Degraded | Graceful (FEC) | ⏳ |
| - Jitter handling | Manual | Automatic | ⏳ |
| **Reliability** | | | |
| - Connection success | 98% | 99%+ | ⏳ |
| - Network changes | Reconnect | Seamless | ⏳ |
| - Corporate firewall | TCP 443 | TCP 443 + TURN | ⏳ |
| **Compatibility** | | | |
| - Chrome desktop | ✅ | ⏳ |
| - Safari desktop | ✅ | ⏳ |
| - Firefox desktop | ✅ | ⏳ |
| - Chrome mobile | ✅ | ⏳ |
| - Safari iOS | ✅ | ⏳ |

**Deliverables:**
- Automated test suite (Playwright)
- Latency comparison report
- Network resilience testing
- Device compatibility matrix
- Load testing (concurrent connections)

---

### Phase 6: Gradual Rollout (3 weeks)

**Week 1: Internal Alpha**
- Enable `?ff=protocol_v3` for team
- Monitor metrics closely
- Fix critical bugs

**Week 2: Beta Testing**
- Invite power users
- A/B test v2 vs v3
- Collect feedback

**Week 3: Production Default**
- Enable v3 by default
- Keep v2 as fallback (`?ff=protocol_v2`)
- Monitor for 7 days

**Success Criteria:**
- Latency reduction ≥50ms
- Connection success rate ≥99%
- No increase in audio quality complaints
- WebRTC metrics healthy

---

## Migration Strategy

### Backward Compatibility

**Protocol v2 remains available:**
- Keep v2 code in place
- Support v2 for ≥6 months
- Fallback toggle: `?ff=protocol_v2`

**Graceful Degradation:**
```javascript
async function connectToRealtime() {
  // Try v3 first
  if (useProtocolV3) {
    try {
      const p3 = new ProtocolV3(...);
      await p3.connect();
      return p3;
    } catch (err) {
      console.warn("v3 failed, falling back to v2", err);
      // Fall through to v2
    }
  }

  // Try v2
  if (useProtocolV2) {
    const p2 = new ProtocolV2(...);
    await p2.connect();
    return p2;
  }

  // Try v1 (legacy)
  // ...
}
```

### Feature Parity

All v2 features must work in v3:
- ✅ Barge-in (via data channel events)
- ✅ KB function calling (via data channel)
- ✅ Metrics tracking (via RTCStatsReport)
- ✅ Session configuration (via session.update)
- ✅ Cancel/resume (via data channel)

---

## Technical Challenges

### Challenge 1: ICE/TURN Configuration
**Problem**: OpenAI doesn't provide TURN servers; corporate firewalls may block direct UDP.

**Solution**:
- Deploy coturn on `turn.asimo.io:3478`
- Provide TURN credentials via ephemeral token endpoint
- Monitor TURN usage metrics
- Cost: ~$20/month for small TURN server

### Challenge 2: Metrics/Observability
**Problem**: WebRTC metrics are different from WebSocket metrics (frame_id, commit latency, etc.).

**Solution**:
- Use `getStats()` API for RTCPeerConnection
- Track: packetsLost, jitter, RTT, bytesReceived, bytesSent
- Map to existing metrics dashboard
- Keep separate namespaces: `__qvtMetrics.v2` vs `__qvtMetrics.v3`

### Challenge 3: Data Channel Reliability
**Problem**: Data channel must be reliable for control messages (session.update, function calls).

**Solution**:
- Create ordered, reliable data channel:
  ```javascript
  dataChannel = pc.createDataChannel("oai-events", {
    ordered: true,
    maxRetransmits: null,  // Infinite retries
  });
  ```
- Add message ACKs for critical commands
- Timeout & retry logic for no-response scenarios

### Challenge 4: Browser Compatibility
**Problem**: WebRTC APIs vary across browsers.

**Solution**:
- Use adapter.js for polyfills
- Test matrix: Chrome, Safari, Firefox (desktop + mobile)
- Graceful fallback to v2 on unsupported browsers
- Document known limitations (e.g., older Safari versions)

---

## Performance Targets

### Latency Improvements
| Metric | v2 (WebSocket) | v3 (WebRTC) | Improvement |
|--------|----------------|-------------|-------------|
| Mic → Network | 50ms | 20ms | -60% |
| Network RTT | 100ms | 80ms | -20% |
| Network → Speaker | 50ms | 30ms | -40% |
| **Total** | **200ms** | **130ms** | **-35%** |

### Bandwidth Usage
| Metric | v2 (base64) | v3 (Opus) | Improvement |
|--------|-------------|-----------|-------------|
| Encoding overhead | +33% | 0% | -33% |
| Audio bitrate | ~32 kbps | ~24 kbps | -25% |
| Total bandwidth | ~42 kbps | ~24 kbps | -43% |

### Quality Improvements
- **Packet loss resilience**: FEC enabled (up to 10% loss)
- **Jitter handling**: Native jitter buffer
- **Congestion control**: transport-cc adaptation
- **Network changes**: Automatic ICE restart

---

## Cost Analysis

### Infrastructure
- **TURN server**: $20/month (Hetzner 2GB VPS)
- **Bandwidth**: Negligible (TURN relay < 1% of traffic)
- **OpenAI API**: No change (same Realtime API pricing)

### Development
- **Engineering time**: ~8 weeks (1 FTE)
- **Testing time**: ~2 weeks
- **Maintenance**: Minimal (standard WebRTC)

### ROI
- **User experience**: Significantly better (lower latency, better quality)
- **Support costs**: Lower (fewer connection issues)
- **Scalability**: Better (less server CPU for audio encoding)

**Verdict**: **Strong ROI, recommend implementation**

---

## Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| WebRTC browser bugs | High | Low | Keep v2 fallback, test matrix |
| TURN server costs | Medium | Medium | Monitor usage, cap at 100 concurrent |
| OpenAI API changes | High | Low | Version lock, monitor changelog |
| User confusion | Low | Low | Gradual rollout, clear fallback |
| Increased complexity | Medium | High | Thorough docs, training |

---

## Timeline

```
2025-11-09: Planning complete ✅
2025-11-16: Phase 1 (Prototype) start
2025-11-30: Phase 1 complete
2025-12-07: Phase 2 (Design) complete
2025-12-28: Phase 3 (Client) complete
2026-01-04: Phase 4 (Backend) complete
2026-01-18: Phase 5 (Testing) complete
2026-02-08: Phase 6 (Rollout) complete
```

**Total**: ~12 weeks (3 months)

---

## Success Metrics

### Launch Criteria
- [ ] Latency reduction ≥50ms (measured)
- [ ] Connection success rate ≥99%
- [ ] All v2 features working in v3
- [ ] 5 browser/device combinations tested
- [ ] Load tested (100 concurrent connections)
- [ ] Documentation complete
- [ ] Rollback plan tested

### Post-Launch (30 days)
- [ ] User satisfaction ≥95% (survey)
- [ ] Support tickets ≤5 WebRTC-related
- [ ] Uptime ≥99.9%
- [ ] v2 usage <10% (most users on v3)

---

## Documentation Updates

- [ ] `/home/asimo/web-app/README.md` - Add v3 section
- [ ] `/home/asimo/web-app/docs/PROTOCOL_V3_INTEGRATION.md` - Developer guide
- [ ] `/home/asimo/web-app/Runbook.md` - Operations guide
- [ ] `/opt/quran-rtc/backend/docs/REALTIME_V3_API.md` - Backend spec
- [ ] User-facing docs - "What's new in voice mode"

---

## Open Questions

1. **Should we support video in v3?**
   - OpenAI supports H.264 video
   - Use case: Screen sharing for Quran pages?
   - **Decision**: Phase 2, not Phase 1

2. **TURN server provider?**
   - Self-hosted coturn (recommended)
   - Third-party (Twilio, etc.)
   - **Decision**: Self-hosted for control/cost

3. **How long to maintain v2?**
   - Recommendation: 6 months minimum
   - Sunset date: 2026-08-01
   - **Decision**: TBD based on v3 adoption

4. **Ephemeral token caching?**
   - 2-hour TTL allows reuse
   - Could reduce backend load
   - **Decision**: Implement client-side refresh

---

## Next Steps

### Immediate (This Week)
1. ✅ Complete this planning doc
2. ⏳ Review with team for feedback
3. ⏳ Approve budget for TURN server
4. ⏳ Schedule Phase 1 kickoff

### Short-term (Next Month)
5. ⏳ Build WebRTC proof-of-concept
6. ⏳ Measure latency improvements
7. ⏳ Finalize architecture design
8. ⏳ Begin client implementation

---

## Conclusion

Protocol v3 (WebRTC) represents a **significant architectural upgrade** that will deliver:
- ✅ **Better latency** (~35% reduction)
- ✅ **Better quality** (native Opus, FEC)
- ✅ **Better reliability** (automatic adaptation)
- ✅ **Lower bandwidth** (~43% reduction)
- ✅ **Standards-based** (WebRTC is proven tech)

**Recommendation**: **APPROVE for Q1 2026 implementation**

---

**Document Status**: ✅ Complete
**Approval Required**: Product Team, Engineering Lead
**Next Review**: 2025-11-16 (Phase 1 kickoff)

**Contact**: Backend Codex
**Project**: Quran Voice Tutor
**Repository**: /home/asimo/web-app

# Web-App UI Upgrade - Quick Reference Summary

**Date**: 2025-11-11
**Version**: 1.0
**Status**: 📋 Plan Ready for Implementation

---

## Overview

Transform the web-app into a ChatGPT-style voice interface with intelligent KB feedback.

### Key Features
1. **4-Button Minimalist UI**: Connect, Mute, Copy Logs, Clear Logs
2. **Central Breathing Element**: Canvas visualizer with state-based animations
3. **KB Searching Beep**: Soft audible feedback when searching knowledge base
4. **Completion Chime**: Pleasant two-tone sound when search completes
5. **"Now Reading" Panel**: Display book/section/page during verbatim narration with "Continue?" prompt
6. **Full Accessibility**: ARIA labels, keyboard shortcuts, reduced-motion support

---

## 9 Implementation Phases

| # | Phase | Duration | Key Deliverables |
|---|-------|----------|------------------|
| 1 | UI Surface Refactor | 2-3h | New HTML structure, remove old controls |
| 2 | Breathing Element + Visualizer | 2-3h | Canvas visualizer, state animations (CSS) |
| 3 | Button Wiring + Protocol v3 | 3-4h | Connect/disconnect, mute, logs, v3 integration |
| 4 | KB Searching Beep | 3-4h | WebAudio synthesizer, settings toggle |
| 5 | Server-Side KB Events | 3-4h | Backend event emission via data channel |
| 6 | Accessibility + Keyboard | 2-3h | ARIA, keyboard shortcuts (M, Ctrl+C, Ctrl+X) |
| 7 | Testing + Documentation | 2-3h | Playwright tests, manual checklist, user guide |
| 8 | Completion Chime | 2h | Two-tone pleasant sound on KB tool completion |
| 9 | "Now Reading" Panel | 3-4h | Floating panel with book info + continuation UI |

**Total**: 22-30 hours (~4-5 days)

---

## Visual States

| State | Color | Animation | Trigger |
|-------|-------|-----------|---------|
| **Idle** | Gray | None | Not connected |
| **Listening** | Blue | Slow pulse | Mic active, waiting for speech |
| **Speaking** | Orange | Wave animation | Assistant TTS playing |
| **Searching** | Yellow | Fast pulse | KB tool running (+ beep) |

---

## Audio Feedback

### 1. Searching Beep
- **Frequency**: 880 Hz (A5) sine wave
- **Duration**: 120-160ms
- **Envelope**: 5ms attack → 130ms decay
- **Volume**: 0.15 (low, non-intrusive)
- **Trigger**: KB tool starts (`kb_catalog_stats`, `kb_search_anchors`, `kb_read_verbatim`)
- **Settings**: Toggle in settings panel (default ON)
- **Mute**: Suppressed when mic is muted

### 2. Completion Chime
- **Frequency**: 660 Hz (E5) + 880 Hz (A5) two-tone harmony
- **Duration**: 100ms (shorter than searching beep)
- **Envelope**: 3ms attack → 97ms decay
- **Volume**: 0.06 (very soft)
- **Trigger**: KB tool completes successfully
- **Settings**: Separate toggle (default ON)
- **Mute**: Suppressed when mic is muted

---

## "Now Reading" Panel

### UI Components
- **Book Info**: Title + Author
- **Section Info**: Section header + "Page X of Y" progress
- **Controls**:
  - "Stop" button (top-right): Cancel reading immediately
  - "Yes, Continue" button: Load next 10 pages
  - "No, Stop Here" button: Dismiss prompt, stop at end

### Behavior
1. **Appears**: When `kb_read_verbatim` starts
2. **Updates**: Current page number during narration
3. **Prompt**: Shows "Continue with next 10 pages?" at end of section
4. **Continues**: Next 10 pages loaded when user clicks "Yes"
5. **Dismisses**: Panel closes when reading stops or completes

### Position
- **Desktop**: Fixed bottom-right (320px wide)
- **Mobile**: Fixed bottom, spans full width with margins

---

## Server Events (Data Channel)

### KB Tool Events
```json
// KB tool started
{
  "type": "ui.kb_busy",
  "status": "started",
  "tool": "kb_search_anchors",
  "call_id": "...",
  "timestamp": 1731234567.89
}

// KB tool completed
{
  "type": "ui.kb_busy",
  "status": "completed",
  "tool": "kb_search_anchors",
  "call_id": "...",
  "timestamp": 1731234568.12
}
```

### Reading Progress Events
```json
// Reading started
{
  "type": "ui.kb_reading",
  "status": "started",
  "book_id": "Tafsir-Ibn-Kathir-10vol",
  "title": "Tafsir Ibn Kathir",
  "author": "Ibn Kathir",
  "section_header": "Surah Al-Fatiha",
  "page_start": 1,
  "page_end": 10,
  "timestamp": 1731234569.45
}

// Page changed
{
  "type": "ui.kb_reading",
  "status": "page_changed",
  "page_number": 5,
  "timestamp": 1731234571.23
}

// Reading completed
{
  "type": "ui.kb_reading",
  "status": "completed",
  "timestamp": 1731234575.67
}
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **M** | Toggle Mute/Unmute |
| **Ctrl+C** | Copy Logs (when not in text field) |
| **Ctrl+X** | Clear Logs (when not in text field) |
| **Enter/Space** | Activate focused button |
| **Tab** | Navigate between controls |

---

## Acceptance Demo

### Test Scenario 1: KB Searching Beep
1. Connect to voice mode
2. Ask: "How many books are in our knowledge base?"
3. **✅ Expect**: Soft beep plays when searching starts
4. **✅ Expect**: Breathing element shows yellow "searching" state
5. **✅ Expect**: Completion chime plays when search completes
6. **✅ Expect**: Assistant announces exact count (e.g., "47 books")

### Test Scenario 2: "Now Reading" Panel
1. Connect to voice mode
2. Ask: "Read Tafsir Ibn Kathir on Surah Al-Fatiha"
3. **✅ Expect**: Beep plays when searching
4. **✅ Expect**: "Now Reading" panel appears bottom-right
5. **✅ Expect**: Panel shows: "Tafsir Ibn Kathir" / "Ibn Kathir" / "Surah Al-Fatiha" / "Page 1 of 10"
6. **✅ Expect**: Page number updates during narration (1 → 2 → 3...)
7. **✅ Expect**: At page 10, prompt shows: "Continue with next 10 pages?"
8. **✅ Expect**: Clicking "Yes, Continue" loads pages 11-20
9. **✅ Expect**: Clicking "Stop" cancels reading and closes panel

### Test Scenario 3: Mute Behavior
1. Connect to voice mode
2. Click "Mute"
3. Ask: "How many books?"
4. **✅ Expect**: No beep plays (suppressed due to mute)
5. **✅ Expect**: Visual "searching" state still shows
6. **✅ Expect**: No TTS audio (muted)

---

## File Checklist

### New Files (7)
- [ ] `styles/voice-ui.css`
- [ ] `scripts/ui-controller.js`
- [ ] `scripts/visualizer.js`
- [ ] `scripts/audio-feedback.js`
- [ ] `scripts/keyboard-shortcuts.js`
- [ ] `scripts/now-reading-panel.js`
- [ ] `tests/now-reading.spec.ts`

### Modified Files (4)
- [ ] `index.html` (new UI structure + Now Reading panel)
- [ ] `scripts/protocol_v3.js` (data channel event hooks)
- [ ] `scripts/settings-panel.js` (audible feedback toggles)
- [ ] `backend/app/routers/realtime_v3_proxy.py` (KB events + reading progress)

### Documentation Files (3)
- [x] `docs/UI_UPGRADE_PLAN.md` (full implementation plan)
- [x] `docs/UI_UPGRADE_SUMMARY.md` (this document)
- [ ] `docs/UI_UPGRADE_TEST_PLAN.md` (manual test checklist)
- [ ] `docs/UI_GUIDE.md` (user guide)

---

## Success Metrics

### Quantitative
- **Connection success rate**: >95% (same as v3 baseline)
- **Beep latency**: <50ms from KB tool call to beep
- **Canvas FPS**: >30fps mobile, >60fps desktop
- **Accessibility score**: 100/100 (Lighthouse)
- **Test coverage**: >90% (Playwright)

### Qualitative
- "UI is cleaner and easier to use"
- "I know when it's searching the books"
- "Love the 'Now Reading' panel with continuation prompt"
- Zero reports of "why is it silent?"

---

## Rollout Strategy

### Phase 1: Development (Local)
1. Implement phases 1-9 on local machine
2. Test with Protocol v3 locally
3. Verify all automated tests pass

### Phase 2: Staging (quran.asimo.io)
1. Deploy to staging server
2. Run manual test checklist
3. Test on multiple devices/browsers
4. Collect feedback from 2-3 users

### Phase 3: Canary (10%)
1. Feature flag: `CHATGPT_UI_ENABLED`
2. Enable for 10% of users
3. Monitor metrics (connection rate, errors, beep feedback)

### Phase 4: Production (100%)
1. Gradually increase to 100%
2. Monitor for 48 hours
3. Archive old UI code

---

## Next Steps

1. **Review this plan** with Dr. M. N. Hamad
2. **Get approval** for timeline and scope
3. **Start Phase 1**: UI Surface Refactor
4. **Iterate** through phases sequentially
5. **Deploy** to staging after Phase 7
6. **Collect feedback** and refine
7. **Roll out** to production with canary

---

## Questions?

- See full plan: `docs/UI_UPGRADE_PLAN.md`
- Backend Codex: `~/.claude/CLAUDE.md`
- Protocol v3 Status: `docs/PROTOCOL_V3_FINAL_STATUS.md`

---

**Ready to build the most advanced bilingual Islamic voice tutor UI on earth.** 🚀

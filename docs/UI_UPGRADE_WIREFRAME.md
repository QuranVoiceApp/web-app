# Web-App UI Upgrade - Visual Wireframe

**Date**: 2025-11-11
**Version**: 1.0

---

## Desktop Layout (1920x1080)

```
┌──────────────────────────────────────────────────────────────────┐
│  Quran Voice Tutor                                          ⚙️   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│                                                                   │
│                         ╭─────────────╮                          │
│                         │             │                          │
│                         │   ◯◯◯◯◯◯    │  ← Breathing Element    │
│                         │  ◯      ◯   │     (Canvas 320x320)     │
│                         │  ◯  🎤  ◯   │                          │
│                         │  ◯      ◯   │                          │
│                         │   ◯◯◯◯◯◯    │                          │
│                         │             │                          │
│                         ╰─────────────╯                          │
│                                                                   │
│                    [ Connect ] [ Mute ]                          │
│                  [ Copy Logs ] [ Clear Logs ]                    │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Transcript                                                 │  │
│  │ ───────────────────────────────────────────────────────── │  │
│  │ User: How many books are in our knowledge base?           │  │
│  │ Assistant: I'll check that for you. [🔍 searching...]     │  │
│  │ Assistant: We have 47 books in our Islamic library...     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Logs                                                       │  │
│  │ ───────────────────────────────────────────────────────── │  │
│  │ [23:45:12] Connected to voice mode                        │  │
│  │ [23:45:15] 🔍 Searching: kb.catalog.stats                 │  │
│  │ [23:45:16] ✅ Completed: kb.catalog.stats (1.2s)          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│                                    ┌─────────────────────────┐  │
│                                    │ 📖 Now Reading     [Stop]│  │
│                                    │─────────────────────────│  │
│                                    │ Tafsir Ibn Kathir       │  │
│                                    │ Ibn Kathir              │  │
│                                    │                          │  │
│                                    │ Surah Al-Fatiha         │  │
│                                    │ Page 5 of 10            │  │
│                                    │                          │  │
│                                    │─────────────────────────│  │
│                                    │ Continue with next 10?  │  │
│                                    │ [Yes] [No, Stop Here]   │  │
│                                    └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Mobile Layout (375x667 - iPhone SE)

```
┌──────────────────────────────┐
│ Quran Voice Tutor       ⚙️  │
├──────────────────────────────┤
│                               │
│      ╭─────────────╮         │
│      │             │         │
│      │   ◯◯◯◯◯◯    │         │
│      │  ◯      ◯   │         │
│      │  ◯  🎤  ◯   │         │
│      │  ◯      ◯   │         │
│      │   ◯◯◯◯◯◯    │         │
│      │             │         │
│      ╰─────────────╯         │
│                               │
│    [ Connect ]  [ Mute ]     │
│  [ Copy ] [ Clear Logs ]     │
│                               │
│ ┌───────────────────────────┐│
│ │ Transcript                 ││
│ │────────────────────────────││
│ │ User: Read from Bukhari... ││
│ │ Assistant: [🔍 searching]  ││
│ └───────────────────────────┘│
│                               │
│ ┌───────────────────────────┐│
│ │ Logs                       ││
│ │────────────────────────────││
│ │ [23:45] Connected          ││
│ │ [23:45] 🔍 Searching...    ││
│ └───────────────────────────┘│
│                               │
│ ┌───────────────────────────┐│
│ │ 📖 Now Reading   [Stop]   ││
│ │───────────────────────────││
│ │ Sahih Bukhari             ││
│ │ Page 42 of 50             ││
│ │                            ││
│ │ Continue next 10 pages?   ││
│ │ [Yes] [No, Stop]          ││
│ └───────────────────────────┘│
└──────────────────────────────┘
```

---

## Breathing Element States

### 1. Idle (Not Connected)
```
╭─────────────╮
│             │
│   ◯◯◯◯◯◯    │  Gray circle
│  ◯      ◯   │  No animation
│  ◯  🎤  ◯   │  Opacity: 50%
│  ◯      ◯   │
│   ◯◯◯◯◯◯    │
│             │
╰─────────────╯
```

### 2. Listening (Mic Active)
```
╭─────────────╮
│   ═══════   │  Blue glow
│  ╱◯◯◯◯◯◯╲   │  Slow pulse (2s)
│ │ ◯      ◯ │ │  Waveform visualization
│ │ ◯  🎤  ◯ │ │
│ │ ◯      ◯ │ │
│  ╲◯◯◯◯◯◯╱   │
│   ═══════   │
╰─────────────╯
```

### 3. Speaking (TTS Playing)
```
╭─────────────╮
│  ▓▓▓▓▓▓▓▓▓  │  Orange wave
│ ▓◯◯◯◯◯◯◯◯▓  │  Wave animation (1.5s)
│ ▓ ◯      ◯▓ │  Spectrum bars
│ ▓ ◯  🔊  ◯▓ │
│ ▓ ◯      ◯▓ │
│ ▓◯◯◯◯◯◯◯◯▓  │
│  ▓▓▓▓▓▓▓▓▓  │
╰─────────────╯
```

### 4. Searching (KB Tool Running)
```
╭─────────────╮
│ ⚡⚡⚡⚡⚡⚡⚡⚡⚡│  Yellow/blue pulse
│⚡╱◯◯◯◯◯◯╲⚡  │  Fast pulse (0.8s)
│⚡│ ◯      ◯│⚡ │  + Beep sound (880Hz)
│⚡│ ◯  🔍  ◯│⚡ │
│⚡│ ◯      ◯│⚡ │
│⚡╲◯◯◯◯◯◯╱⚡  │
│ ⚡⚡⚡⚡⚡⚡⚡⚡⚡│
╰─────────────╯
```

---

## Button States

### Connect Button
```
┌───────────┐       ┌───────────┐
│           │       │           │
│  Connect  │  →    │Disconnect │
│  (Green)  │       │   (Red)   │
│           │       │           │
└───────────┘       └───────────┘
 Not Connected       Connected
```

### Mute Button
```
┌───────────┐       ┌───────────┐
│           │       │           │
│   Mute    │  →    │  Unmute   │
│  (Gray)   │       │ (Orange)  │
│    🎤     │       │    🔇     │
│           │       │           │
└───────────┘       └───────────┘
   Active            Muted
```

---

## "Now Reading" Panel States

### State 1: Active Reading (Page 1-9)
```
┌─────────────────────────┐
│ 📖 Now Reading     [Stop]│
│─────────────────────────│
│ Tafsir Ibn Kathir       │
│ Ibn Kathir              │
│                          │
│ Surah Al-Fatiha         │
│ Page 5 of 10            │  ← Current page updates
│                          │
└─────────────────────────┘
```

### State 2: End of Section (Page 10)
```
┌─────────────────────────┐
│ 📖 Now Reading     [Stop]│
│─────────────────────────│
│ Tafsir Ibn Kathir       │
│ Ibn Kathir              │
│                          │
│ Surah Al-Fatiha         │
│ Page 10 of 10           │  ← At end
│                          │
│─────────────────────────│
│ Continue with next 10   │  ← Prompt appears
│ pages?                  │
│ [Yes, Continue]         │
│ [No, Stop Here]         │
└─────────────────────────┘
```

### State 3: Hidden
```
(Panel not visible)
```

---

## Settings Panel (Expanded)

```
┌─────────────────────────┐
│ ⚙️ Settings              │
│─────────────────────────│
│ ☐ Use server VAD        │
│ ☐ Recitation mode       │
│ ☐ Auto-download audio   │
│ ☑ Use Protocol v3       │
│─────────────────────────│
│ Audio Feedback:         │
│ ☑ KB searching beep     │  ← New
│ ☑ Completion chime      │  ← New
│─────────────────────────│
│ Visualizer:             │
│ ◉ Waveform              │
│ ○ Spectrum              │
│ ○ Circular              │
└─────────────────────────┘
```

---

## Interaction Flow: KB Search

```
Step 1: User asks question
┌──────────────────────────┐
│ User says:               │
│ "How many books?"        │
└──────────────────────────┘
         ↓
Step 2: KB tool starts
┌──────────────────────────┐
│ Backend emits:           │
│ ui.kb_busy: started      │
└──────────────────────────┘
         ↓
Step 3: Client responds
┌──────────────────────────┐
│ ♪ Play beep (880Hz)      │
│ ⚡ Show "searching" state │
│ 📝 Log: "🔍 Searching..." │
└──────────────────────────┘
         ↓
Step 4: KB tool completes
┌──────────────────────────┐
│ Backend emits:           │
│ ui.kb_busy: completed    │
└──────────────────────────┘
         ↓
Step 5: Client responds
┌──────────────────────────┐
│ ♫ Play chime (660+880Hz) │
│ 🔵 Return "listening"     │
│ 📝 Log: "✅ Completed"    │
└──────────────────────────┘
         ↓
Step 6: Assistant speaks
┌──────────────────────────┐
│ "We have 47 books..."    │
│ 🟠 Show "speaking" state  │
└──────────────────────────┘
```

---

## Interaction Flow: Verbatim Reading

```
Step 1: User requests reading
┌──────────────────────────┐
│ "Read from Ibn Kathir    │
│ on Surah Al-Fatiha"      │
└──────────────────────────┘
         ↓
Step 2: Search + beep
┌──────────────────────────┐
│ ♪ Beep                   │
│ ⚡ "Searching..."          │
└──────────────────────────┘
         ↓
Step 3: Reading starts
┌──────────────────────────┐
│ ui.kb_reading: started   │
│ → Show "Now Reading"     │
│   panel with metadata    │
└──────────────────────────┘
         ↓
Step 4: Narration (Pages 1-10)
┌──────────────────────────┐
│ Page 1 → "Page 1..."     │
│ Page 2 → Update panel    │
│ ...                      │
│ Page 10 → Update panel   │
└──────────────────────────┘
         ↓
Step 5: Continuation prompt
┌──────────────────────────┐
│ "Continue with next 10?" │
│ [ Yes ] [ No ]           │
└──────────────────────────┘
         ↓
    ┌─────┴─────┐
   Yes          No
    │            │
    ↓            ↓
┌───────┐  ┌──────────┐
│Pages  │  │ Stop &   │
│11-20  │  │ Hide     │
└───────┘  └──────────┘
```

---

## Color Palette

| State | Primary | Glow | Text |
|-------|---------|------|------|
| **Idle** | #555555 (Gray) | None | #999999 |
| **Listening** | #3fa8ff (Blue) | rgba(63,168,255,0.6) | #3fa8ff |
| **Speaking** | #ff9500 (Orange) | rgba(255,149,0,0.6) | #ff9500 |
| **Searching** | #ffc107 (Yellow) | rgba(255,193,7,0.8) | #ffc107 |

---

## Audio Waveforms (Visual)

### Searching Beep (880 Hz, 140ms)
```
Frequency: 880 Hz
Gain
 │  ╱╲
 │ ╱  ╲___
 │╱       ╲___
 └────────────→ Time
 0   5ms  140ms

Volume: 0.15 (soft)
Type: Sine wave
```

### Completion Chime (660 Hz + 880 Hz, 100ms)
```
Frequency: 660 Hz + 880 Hz (harmony)
Gain
 │  ╱╲  ╱╲
 │ ╱  ╲╱  ╲
 │╱        ╲__
 └────────────→ Time
 0   3ms 20ms 100ms

Volume: 0.06 (very soft)
Type: Sine wave (two oscillators)
```

---

## Responsive Breakpoints

| Device | Width | Layout Changes |
|--------|-------|----------------|
| **Mobile** | <640px | Stacked, full-width buttons, "Now Reading" spans bottom |
| **Tablet** | 640-1024px | Side-by-side buttons, transcript/logs 50/50 |
| **Desktop** | >1024px | Full layout as shown, "Now Reading" fixed bottom-right |

---

## Accessibility Features

| Feature | Implementation |
|---------|----------------|
| **ARIA Labels** | All buttons, canvas, panels have descriptive labels |
| **Keyboard Navigation** | Tab order: Connect → Mute → Copy → Clear → Settings |
| **Focus Indicators** | 2px blue outline (3fa8ff) on :focus-visible |
| **Screen Reader** | Live regions for transcript/logs, status announcements |
| **Reduced Motion** | Disable animations, use static border colors |
| **High Contrast** | Colors meet WCAG AAA (7:1 ratio) |

---

## Animation Timing

| Animation | Duration | Easing | Respects prefers-reduced-motion |
|-----------|----------|--------|--------------------------------|
| **Pulse (listening)** | 2s | ease-in-out | ✅ Yes → static border |
| **Wave (speaking)** | 1.5s | ease-in-out | ✅ Yes → static border |
| **Fast pulse (searching)** | 0.8s | ease-in-out | ✅ Yes → static border |
| **Panel slide-up** | 0.3s | ease-out | ✅ Yes → instant show |
| **Button state** | 0.15s | ease | ❌ No (essential feedback) |

---

**Ready to transform the voice mode experience.** 🚀

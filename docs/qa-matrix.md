# Phase 4 QA Matrix — Playback Polish (Cross-fade, DC Block, Upsample)

Focus: verify jitter-buffer tuning, click-free joins, and playback diagnostics with the `pb_polish` flag before enabling by default.

## Desktop Chrome (sim_input)
- `https://app.asimo.io/?ff=seq_json,pb_polish,sim_input&diag=1&auto=1&v=<shortsha>`
  - Commit window held at 100 ms (negotiated min/max respected).
  - Playback jitter depth ~60 ms steady; `playbackUnderruns=0`.
  - Cross-fade counter increments once chunks accumulate (≥0 after 2 s); no audible clicks.
  - DC offset reported ≈0; `upsampleMode=native` on macOS (48 kHz context).

## iPhone Safari (real device)
- `https://app.asimo.io/index.html?ff=seq_json,pb_polish,sim_input&diag=1&auto=1&v=<shortsha>`
  - Target jitter 60–80 ms, underruns ≤1 every 5 minutes on good Wi‑Fi.
  - Capture metrics pill screenshot and console dump (`window.__qvtSession.net` / `window.__qvtSession.playback`) and store under `docs/assets/phase4/`.
  - Verify crossfade count increments without audible clicks; `upsampleMode` stable (`native` or `linear2x`).
  - Log observed values here once measurements are recorded; leave a TODO row if awaiting capture.

## Artifacts
- Include Playwright trace from `tests/playback.spec.ts` run.
- Archive `window.__qvtMetrics` JSON sample showing `{ playbackUnderruns, crossfadeCount, upsampleMode }`.

---

# Phase 2 QA Matrix — Capture / Resampling / Drift

Focus: validate the new FIR half-band decimator, drift slewing, and worklet watchdog features before flipping defaults. Run each pass with adaptive commit window logs (`diag=1`) and keep telemetry snapshots for reference.

## Desktop Chrome (macOS/Windows)
- `?ff=fir_halfband,drift_comp,watchdog&diag=1`
  - Worklet stays active (no fallback) for at least 10 minutes; `workletStalls` remains 0.
  - `driftPpm` stays within ±40 ppm after 5+ minutes of capture.
  - Audio playback remains clean (no aliasing on fricatives).
- `?ff=fir_halfband,drift_comp,watchdog,sim_input&diag=1`
  - CI-equivalent run; verify JSON diagnostics line increments (`sentAppends`, `ingressChunks`).
  - Confirm watchdog counters remain 0.

## iPhone Safari (latest release)
- Same flag set as above; capture for ≥6 minutes while walking.
  - Observe `driftPpm` trending back toward 0 after brief device pocketing.
  - Ensure watchdog does not trigger during normal use (stalls remain 0).
- Force worklet stall by backgrounding the tab for 10+ seconds.
  - Expect watchdog to switch to ScriptProcessor (log line `watchdog stall detected`).
  - After returning to foreground, recovery succeeds within 5 seconds (`watchdogRecovers` increments and worklet resumes).

## Low-end Android Chrome (Go or equivalent)
- `?ff=fir_halfband,watchdog&diag=1`
  - Validate ScriptProcessor fallback audio quality when FIR is on.
  - Observe watchdog recovery when throttling (devtools performance throttling or backgrounding).

## Negative tests
- `?ff=drift_comp&diag=1` with hardware clock artificially offset (e.g., Audio Hijack / Virtual Audio Cable).
  - Confirm slewing prevents buffer growth/underrun across 15 minutes.
- Disable FIR (`ff=` empty) and compare aliasing on sibilant phrases to ensure flag makes observable difference.

## Artifacts to capture per run
- Screenshot or copy of diagnostics console (`SUMMARY` logs + JSON payloads).
- `window.__qvtDiag` snapshot showing `{ commitWinMs, rttMs, driftPpm, workletStalls, watchdogRecovers }` steady state.
- Audio clip (30 s) recorded via built-in recorder for aliasing comparison when FIR is toggled.

---

# Phase 3 QA Matrix — True Barge-in (Suspend / Resume)

Goal: verify suspend/resume delivers <50 ms ducking, no audible pops on resume, and metrics counters align with expectations. Keep `diag=1` enabled and capture Prometheus samples after each pass.

## Desktop Chrome
- `?ff=seq_json,barge_in,sim_input&diag=1`
  - Playwright helper (`tests/bargein.spec.ts`) confirms suspend/resume/cancel signalling with mock WS.
  - Latest sim run (2025-03-XX) recorded `bargeInEvents=1`, `resumeEvents=1`, `duckLatencyMs≈360 ms` (expected due to 300 ms silence guard) and tail-pad append present.

- Real mic session (`?ff=seq_json,barge_in&diag=1`)
  - Speak over TTS playback; expect audible duck ≤50 ms (monitor via console log).
  - Resume after 300 ms silence ⇒ playback resumes without click; `resumeEvents` increments.

## iPhone Safari
- Same flags as above.
  - Confirm ducking/resume behaviour matches desktop.
  - Monitor `duckLatencyMs` in console; target ≤60 ms on device.
  - Ensure `tailPadNeeded` clears on commit (no truncated words at resume).

## Backend Metrics Validation
- After exercising suspend/resume, fetch `/metrics` and check:
  - `tts_suspend_requested_total` increments with each suspension.
  - `tts_suspension_ms_total` roughly matches stopwatch (±10%).
  - `tts_resume_buffered_events_total` equals buffered delta count (should be small, typically 2–4).
  - `tts_buffer_drop_total` remains 0; if >0, mark test as warning and investigate buffer limit.

## Artifacts
- Playwright trace (`phase3-bargein` job) + console log with `{bargeInEvents, duckLatencyMs, resumeEvents}` snapshot.
- Prometheus scrape excerpt highlighting new counters.
- Optional: 10 s audio capture showing smooth resume (no fade-in click).

---

# Phase 5 QA Matrix — UI Pills & Wake Lock

Focus: ensure the new session pills, wake-lock handling, and barge-in affordance behave correctly before enabling by default.

## Desktop Chrome (sim_input)
- `https://app.asimo.io/index.html?ff=ui_pills,sim_input&diag=1&auto=1&v=<shortsha>`
  - Pills appear within 1.5 s and update every ≤1 s.
  - `pill-ingress` reflects non-zero kb/s after data begins flowing.
  - Wake lock held while mic active (observe in DevTools `navigator.wakeLock` debug).
  - Transcript banner hides/shows instantly on simulated barge-in events.

## iPhone Safari
- Same flag set; verify wake lock prevents dimming while mic is active.
- Confirm pills remain legible (contrast ≥ 4.5:1) and VoiceOver reads labels.
- Capture screenshot + console log once metrics are stable; archive under `docs/assets/phase5/`.

## Artifacts
- Playwright trace from `tests/ui_pills.spec.ts` (Phase 5 workflow job).
- Screenshot + console JSON from real-device run stored in `docs/assets/phase5/`.

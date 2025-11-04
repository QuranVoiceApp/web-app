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

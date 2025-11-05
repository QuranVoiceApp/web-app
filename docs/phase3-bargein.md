# Phase 3 — True Barge-in Status

Feature flag: `ff=barge_in` (defaults OFF).

## Frontend summary
- Auto-ducking drops playback gain ≈14 dB immediately on `speech_started`.
- Silence watchdog (`speech_ended`) schedules resume or cancel after 300 ms; tail-pad injects ~50 ms of silence before commit.
- Diagnostics exported via `window.__qvtMetrics`: `{ bargeInEvents, resumeEvents, cancelEvents, duckLatencyMs }`.

## Backend summary
- `response.suspend_audio` pauses TTS stream; `response.resume_audio` restarts without pops.
- Prometheus counters: `tts_suspend_requested_total`, `tts_suspension_ms_total`, `barge_in_count`, `tts_buffer_drop_total`.

## Recent measurements (2025‑03‑XX smoke)
- Sim path (`tests/bargein.spec.ts` with `mockWs`):
  - `bargeInEvents=1`, `resumeEvents=1`, `cancelEvents=1`.
  - `duckLatencyMs≈360 ms` (resume guard = 300 ms).
  - Tail-pad append observed (`input_audio_buffer.append` with 50 ms silence).
- Live metrics scrape:
  - `https://quran.asimo.io/api/metrics` shows increments for suspend/resume counters post-smoke.

## Artifacts
- Playwright trace: `phase3-bargein-<run_id>.zip`.
- Backend probe log: `barge_resume.jsonl` (verifies suspend/resume cadence).

## Next steps
- Run real-device validation (iPhone Safari + desktop mic) before flipping default.
- Tighten duck latency metric to capture actual gain drop (<50 ms) versus resume timing.

# QA Matrix — Voice Mode

This document tracks the current E2E/Smoke test coverage and acceptance gates.

## Browsers
- Chromium: required. Runs full suite with trace/HAR/video artifacts.
- WebKit (macOS/iOS): non‑blocking with retries=2; promote to required after 3 consecutive greens.

## Test Matrix
- tests/ui_pills.spec.ts — UI pills visible and stateful
- tests/ui/all-controls.spec.ts — connect/mic toggles; desktop clickability (no overlay blocks)
- tests/playback.spec.ts — playback polish, underrun checks
- tests/transcript_match.spec.ts — transcript contains expected phrases
- tests/bargein.spec.ts — barge‑in cancels on speech start
- tests/jitter_buffer.spec.ts — buffer stability under bursty deltas

Artifacts: reporter line+html, trace on, HAR + video uploaded in Actions.

## Acceptance Gates (Backend metrics)
- empty_commit_total == 0
- deferred_commit_total > 0
- tts_underrun_total == 0

Endpoint: `GET https://quran.asimo.io/api/metrics/health`

## Debug Probes
- Active: `POST /debug/tts-ping?trace_id=<id>&tone_hz=880` (injects short debug tone)
- Loopback: `POST /debug/loopback?trace_id=<id>&frames=10`

Note: Historical docs referenced `/debug/tts-chirp`, `/debug/tts-burst`, `/debug/delta-jitter`. These are superseded by the endpoints above.

## QA URLs (cache‑busted)
- Sim smoke: `https://app.asimo.io/?ff=seq_json,ui_pills,sim_input&diag=1&auto=1&v=<fe_short_sha>`
- Barge‑in & polish: `https://app.asimo.io/?ff=barge_in,seq_json,pb_polish&diag=1&v=<fe_short_sha>`

## Operational Notes
- Connect/Disconnect toggles test ids: `btnConnect` ⇄ `btnDisconnect`
- Stable selectors: Buttons: `btnConnect|btnDisconnect`, `btnMic`; Selects: `selectDevice`, `speakerSelect`; Pills: `pill-playback`, `pill-storage`, `pill-send`; Transcript: `transcript`
- Desktop click fix: `#controlBar { pointer-events:auto; z-index:5 }`


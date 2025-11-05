Quran Voice Tutor — Voice Mode Runbook

Flags
- ff=seq_json,ui_pills,sim_input,watchdog,pb_polish
- Gate overrides: `gate=0` (CI), `diag=1` (verbose)

Debug endpoints (backend)
- POST /debug/tts-ping?trace_id=...&tone_hz=880 — inject debug audio
- POST /debug/loopback?trace_id=...&frames=10 — replay last PCM frames
- POST /debug/tts-chirp|/debug/tts-sweep — deterministic audio for playback/JB tests
- POST /debug/tts-burst — bursty tone for underrun resiliency tests
- POST /debug/delta-jitter — bursty deltas for JB coverage
- GET  /metrics/health — JSON snapshot for CI asserts
 - GET  /metrics — Prometheus text exposition

Prod sanity (Chromium/WebKit)
1) Open https://app.asimo.io/index.html?ff=seq_json,ui_pills,sim_input&diag=1
2) Click Connect → Logs show “WebSocket open”
3) Sim path: expect “frame sample [ … ]”, playback starts on first delta
4) Mic path: add &gate=0, click Start Mic → non‑zero frames

Commit discipline
- FE: ≥100ms between commits; idle auto‑commit ~1200ms
- BE: Defers commits until ≥4800 bytes; emits ingress.commit_deferred@v1

Artifacts
- Playwright report: GitHub Actions → e2e → “playwright-report-*” artifact
- Traces/HAR/video: included in report bundle

Quick CI
- FE: gh workflow run e2e -R QuranVoiceApp/web-app
- BE: gh workflow run "Backend CI & Deploy" -R QuranVoiceApp/quran-voice-tutor

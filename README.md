# Quran Voice Tutor – Web App

Static, fast, voice‑first UI for the Quran Voice Tutor backend (OpenAI Realtime proxy). Deployed via GitHub Pages with a custom domain.

- Live: https://app.asimo.io
- Backend WS: set in `scripts/env.js` (default `wss://quran.asimo.io/realtime/v1/ws`).

## Features

- Minimal, low‑latency voice test page (connect + mic + VAD threshold).
- PCM16/16kHz mic streaming over WebSocket; commit + response.create on stop.
- Clean brand theme (`theme.css`).
- PWA basics: `manifest.webmanifest`, offline cache via `sw.js`.
- CSP locked down to your backend WS.

## Development

No build step is required.

- Serve locally:
  - `cd web-app && python3 -m http.server 8080`
  - Visit http://localhost:8080
- Configure backend endpoint:
  - Edit `scripts/env.js`, set `WS_URL` to your FastAPI Realtime proxy.

## Deploy (GitHub Pages)

This repo includes a workflow that publishes the site on pushes to `main`.

- Custom domain: `CNAME` is set to `app.asimo.io`.
- Action: `.github/workflows/deploy-github-pages.yml` uploads the static root.
- After the first successful run, Pages serves https://app.asimo.io.

## Security

- CSP (in `index.html`) restricts `connect-src` to `wss://quran.asimo.io`.
- Service worker caches only same‑origin static assets.
- Avoid embedding secrets in the client; keep keys on the backend proxy.

## Backend Requirements

- Allow origin `https://app.asimo.io` in CORS/WS origin checks on your FastAPI service.
- WS schema: this client streams raw PCM16 (16kHz, mono). It sends:
  - `input_audio_buffer.commit` then `response.create` when mic stops.
  - Adjust `voice.js` to match your finalized on‑wire schema if needed.

## Diagnostics Flags

Append query parameters to enable feature flags and diagnostics during testing:

- `ff=seq_json` – enable JSON+seq append path (pilot jitter buffer).
- `ff=sim_input` – drive the client with a bundled 24 kHz PCM sample (no getUserMedia prompt). Useful for CI smoke tests.
- `ff=fir_halfband` – run the capture path through the 47‑tap half-band FIR before decimating 48 kHz → 24 kHz.
- `ff=drift_comp` – enable drift slewing (±50 ppm) that gently stretches/shrinks outgoing chunks to stay synchronized.
- `ff=watchdog` – turn on the capture watchdog: auto-fails over to ScriptProcessor when the worklet stalls and retries recovery after 4 s (adds `workletStalls`/`watchdogRecovers` counters).
- `diag=1` – enable diagnostic logs, including adaptive commit window telemetry. When `ff=sim_input` is present a compact JSON line is emitted every 500 ms with `{ commitWinMs, rttMs, sentAppends, ingressChunks, driftPpm, workletStalls, watchdogRecovers }`.

Example: `https://app.asimo.io/?ff=seq_json,sim_input&diag=1`

## Theming

Include `theme.css` variables and helper classes.

```
<link rel="stylesheet" href="./theme.css" />
```

Variables: `--brand-accent`, `--brand-ink-strong`, `--bg`, `--fg`, `--link`, `--button-*`.

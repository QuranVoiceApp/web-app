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

## Theming

Include `theme.css` variables and helper classes.

```
<link rel="stylesheet" href="./theme.css" />
```

Variables: `--brand-accent`, `--brand-ink-strong`, `--bg`, `--fg`, `--link`, `--button-*`.


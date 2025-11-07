Acceptance Checklist

- QA links
  - Sim smoke: https://app.asimo.io/?ff=seq_json,ui_pills,sim_input&diag=1&auto=1&v=<short-sha>
  - Barge-in & polish: https://app.asimo.io/?ff=barge_in,seq_json,pb_polish&diag=1&v=<short-sha>

- Bundle contents
  - Server logs (60s window) showing:
    - JSON ingress updates (chunks/bytes)
    - TTFSP_ms ≤ ~1200 for a short turn
    - BAR_GE_CANCEL_ms=… on barge‑in cancel
  - UI clip (≤10s) from latest Chromium artifact video:
    - Connect → red Disconnect → speak (nz% > 0; ingress > 0) → Disconnect; no auto download.
    - Artifact path example: playwright-report/test-results/.../video.webm
  - Browser console (15 lines, `?diag=1`) showing:
    - nz%, peak/rms, ingress pill increment, and final response.done
    - Example URL: https://app.asimo.io/?ff=seq_json,ui_pills,sim_input&diag=1&auto=1&v=<short-sha>
  - Reader smoke:
    - Prompt: “Read Jalalayn on Al‑Fātiḥa”, interrupt (barge‑in), then “continue.”
    - Paste journalctl lines showing pause + Redis bookmark + resume

- Operational notes
  - Keep WebKit non‑blocking until 3× consecutive greens. When reached, restore gating and re‑require transcript_match on WebKit via a follow‑up PR.
  - SLO gate: empty_commit_total=0, tts_underrun_total=0, deferred_commit_total>0.


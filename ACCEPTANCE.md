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

Current build
- Short SHA: 692771c
- QA URLs:
  - https://app.asimo.io/?ff=seq_json,ui_pills,sim_input&diag=1&auto=1&v=692771c
  - https://app.asimo.io/?ff=barge_in,seq_json,sim_input,ui_pills&diag=1&auto=1&v=692771c

Artifact video subpaths
- Run 19158108932: data/1c5be158007dba0e04407b31f1fea7119c6cdd94.webm
- Run 19158250655: data/1f01cf3f115f41dd8fa04a83ccd326bdcf9e55f6.webm

Console excerpt (last 15 lines)
[<=] response.output_audio.delta@v1
[<=] response.output_audio.delta@v1
[<=] response.output_audio.delta@v1
[<=] response.output_audio.delta@v1
[<=] response.output_audio.delta@v1
[<=] response.output_audio.delta@v1
[<=] response.output_audio.delta@v1
[<=] response.output_audio.delta@v1
[<=] response.output_audio.delta@v1
[<=] response.output_audio.delta@v1
[<=] response.output_audio.delta@v1
[<=] response.output_audio.done@v1
[TTFSP] 10
[burst] 200
[=>] commit(barge)

Server log excerpt (last 120 seconds, filtered)
- Several Realtime upstream errors due to sub‑100ms commits during barge‑in attempts:
  - invalid_request_error: input_audio_buffer_commit_empty (buffer too small)
- Note: METRIC tokens (TTFSP_ms, BAR_GE_CANCEL_ms) did not surface in journald for these runs; frontend observed TTFSP via response.output_audio.delta timing (10ms in the run above). A short manual browser run can capture server‑side METRIC lines if needed.

\nCurrent build
- Short SHA: 692771c
- QA URLs:
  - https://app.asimo.io/?ff=seq_json,ui_pills,sim_input&diag=1&auto=1&v=692771c
  - https://app.asimo.io/?ff=barge_in,seq_json,sim_input,ui_pills&diag=1&auto=1&v=692771c
\nArtifact video subpaths
- Run 19158108932: data/1c5be158007dba0e04407b31f1fea7119c6cdd94.webm
- Run 19158250655: data/1f01cf3f115f41dd8fa04a83ccd326bdcf9e55f6.webm
\nConsole excerpt (last 15 lines)
[<=] session.audio_status@v1
[<=] personalized_greeting@v1
[<=] session.created
[=>] commit(initial)
[<=] session.updated@v1
[<=] session.updated@v1
[<=] session.updated@v1
[<=] session.updated@v1
[<=] session.updated@v1
[<=] session.updated
[<=] session.updated
[<=] response.created
[<=] response.done
[turn] done in 1183 ms
[=>] commit(barge)
\nServer log excerpt

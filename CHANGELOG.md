# Changelog

All notable changes to this project will be documented here.

## [Unreleased]

### Added
- E2E test suites: transcript_match, jitter_buffer, all-controls.
- Stable data-testids for controls and pills (btnConnect/btnDisconnect, btnMic, selectDevice, speakerSelect, pill-playback, pill-storage, pill-send, transcript).
- CI: WebKit job on macos-latest with retries; Chromium remains required.
- CI: Backend metrics gate check (empty_commit_total==0, deferred_commit_total>0, tts_underrun_total==0).

### Changed
- Transport: JSON+seq appends; FE commit gating enforces ≥100ms and ≥4800B.
- Toggle connect/disconnect testid on connection state.

### CI
- Add e2e-manual workflow (workflow_dispatch) with Chromium required and WebKit non-blocking.


### Fixed
- Ensure Connect/Disconnect UI toggle and desktop clickability verified by tests.
- No automatic downloads post-Connect (only explicit log download supported).


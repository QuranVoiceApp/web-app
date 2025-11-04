# Repository Guidelines

## Repo Scope & Structure
- This repo hosts the GitHub Pages deployment harness; keep `.github/workflows/deploy-github-pages.yml` deterministic with pinned actions.
- `README.md` states the deployment target; update it alongside workflow edits and note environment assumptions.
- Ignore transient build outputs such as `pages/`; confirm clean tree with `git status` before committing.

## Build & Validation
- Mirror CI when testing: enable Corepack, clone `laurent22/joplin`, install dependencies, then run `yarn web` in `packages/app-mobile/`.
- Dry-run workflow changes with `act workflow_dispatch -j deploy`; fallback to draft PR logs.
- Confirm `packages/app-mobile/web/dist/index.html` and share preview URLs or `act` excerpts in PR notes.

## Style, Commits & Reviews
- Use two-space YAML indentation, lowercase step names, and descriptive IDs (`prepare_yarn`, `deployment`).
- Keep shell `run` blocks POSIX-compliant; docs use sentence-case headings and fenced command blocks.
- Commits follow “Component: Imperative” (e.g., `README: Clarify GitHub Pages target`) with logical grouping of workflow and docs changes.
- PRs summarize impact, cite upstream issues where relevant, and list verification evidence.

## Deployment & Secrets
- Rely on the built-in `GITHUB_TOKEN`; add new secrets only with documented justification.
- Align concurrency group names with the published site and document caches or artifacts added, including cleanup expectations.

## Backend Agent Charter – Quran Voice Tutor
- Act as the backend AI for `quran_voice_tutor` on Mohammed’s Ubuntu home server (~1 TB). Confirm the repo root (e.g., `/opt/quran-rtc` or `/opt/quran-rtc/backend`) and KB database `/opt/quran-rtc/library/kb.sqlite`.
- Operate within the shared mono-repo, coordinating with the MacBook Pro frontend agent through Git activity, issues, docs, and human relays. Resolve PR conflicts before merging and call out required frontend follow-up in status updates.
- Strategic goal: deliver a world-class, low-latency voice-first experience powered by the OpenAI Realtime API (Thinker-Talker is retired). Voice mode must stream verbatim KB passages for 5–10 minute segments, stay conversationally natural, and use state-of-the-art VAD with near-zero false barge-ins.
- After Mohammed’s device testing, expect debug reports (notes, in-app logs, console dumps). For each issue, assess whether architectural upgrades or integration shifts beat incremental tweaks.
- Stay aligned with project direction, immediate tasks, and near-term roadmap; document assumptions and decisions for hand-offs.
- Initial readiness sequence once you signal availability:  
  1. Confirm the current backend baseline.  
  2. Review the latest OpenAI Realtime/voice documentation to map immediate versus near-term priorities.  
  3. Sync with the frontend agent on pending integrations to plan the next tasks with their requirements in mind.

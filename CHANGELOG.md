# Changelog

All notable project changes are tracked here.

## 0.2.0 - 2026-05-09

### Added

- Added generated architecture snapshots under `docs/architecture/`.
- Added `npm run architecture:generate` and `npm run docs:generate`.
- Added the current architecture SVG to README.
- Added a provider-agnostic JSON tool-call protocol for the agent loop.
- Added read-only `list_files`, `read_file`, and `search_text` tools.
- Added path safety checks that keep tool reads inside the workspace.
- Added a tool-call limit to prevent runaway model loops.
- Added tool input/output summaries to the workbench trace.
- Updated generated README, project plan, and development context for the next version.

### Changed

- Replaced the DeepSeek path from a one-shot workspace snapshot prompt with a multi-turn read-only tool loop.
- Changed workspace discovery so real `.env` files are ignored while `.env.example` remains readable.

### Notes

- This version still does not write files, apply patches, or run shell commands from model output.

## 0.1.0 - 2026-05-09

### Added

- Initialized a Next.js + TypeScript learning workbench for a DeepSeek-first coding agent.
- Added `POST /api/agent` to run the server-side agent.
- Added a minimal agent runner with goal intake, workspace scan, trace steps, DeepSeek call, and offline fallback.
- Added a DeepSeek provider using an OpenAI-compatible chat completions request.
- Added a browser UI for entering goals and viewing structured results.
- Added generated README automation with a pre-commit hook.
- Added `docs/project-plan.json` as the project source of truth.
- Added `docs/DEVELOPMENT_CONTEXT.md` as the handoff prompt/context file for future versions.

### Notes

- This version is intentionally read-only. It does not write files, run shell commands from the model, or apply patches.
- The first implementation is a browser workbench rather than a terminal TUI so the control flow is easier to study with TypeScript and Next.js.

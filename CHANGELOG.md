# Changelog

All notable project changes are tracked here.

## Unreleased

### Notes

- Next planned focus: model JSON repair, retry, and protocol stability.

## 0.13.0 - 2026-05-22

### Added

- Added `src/lib/agent/context-selection.ts` for heuristic file priority scoring.
- Added `AGENT_CONTEXT_SELECTED_MAX_FILES` to control initial prompt file selection.
- Added context selection metadata to agent run results and saved run records.
- Added selected context display in CLI, Web, and TUI outputs.
- Added `docs/CONTEXT_SELECTION.md` for the current context-selection strategy.

### Changed

- Runner now indexes the workspace, then selects an explainable initial file map before building the prompt.
- Prompt input now includes context selection metadata and only the selected initial file map.
- Updated project planning with the next version line from V0.14 through V0.17.
- Updated handoff context and generated architecture snapshots for V0.13.
- Bumped project version to `0.13.0`.

## 0.12.0 - 2026-05-22

### Added

- Added `src/lib/agent/tool-policy.ts` for environment-driven read-tool allowlists and patch proposal policy.
- Added `AGENT_ALLOWED_READ_TOOLS` and `AGENT_PATCH_PROPOSAL` environment knobs.
- Added active tool policy metadata to each agent run result and persisted run record.
- Added TUI tool-call detail rendering and policy summary output.
- Added Web and CLI display for active tool policy.
- Added `docs/TOOL_POLICY.md` for the current policy model.

### Changed

- Prompt construction now advertises only tools allowed by the active policy.
- Runner now enforces tool policy before executing model-requested tools.
- Runner removes model-returned `patchProposal` when `AGENT_PATCH_PROPOSAL=disabled`.
- Updated project planning, handoff context, and generated architecture snapshots for V0.12.
- Bumped project version to `0.12.0`.

## 0.11.0 - 2026-05-21

### Added

- Added `src/lib/agent/context-budget.ts` for explicit context budget controls.
- Added `AGENT_CONTEXT_*` environment knobs to `.env.example`.
- Added active context budget metadata to each agent run result.
- Added tool boundary metadata: `category`, `risk`, and `approvalRequired`.
- Added `docs/CONTEXT_BUDGET.md` for budget and tool boundary notes.

### Changed

- Clamped model-provided `list_files`, `read_file`, and `search_text` limits by the active context budget.
- Included context budget details in prompts, CLI output, run records, and the Web result tags.
- Updated project planning, handoff context, and generated architecture snapshots for V0.11.
- Bumped project version to `0.11.0`.

## 0.10.0 - 2026-05-21

### Added

- Added `npm run tui` as a dependency-free full-screen terminal UI spike.
- Added `src/cli/tui.ts` with alternate-screen rendering, keyboard controls, recent-run selection, live event display, and model stream preview.
- Added TUI continuation from a selected saved run.
- Added TUI patch application through the existing safe patch proposal module.
- Added `--once` for non-interactive TUI smoke tests.

### Changed

- Reused the V0.9 Agent Event Bus as the TUI renderer input.
- Updated project planning, handoff context, and generated architecture snapshots for V0.10.
- Bumped project version to `0.10.0`.

## 0.9.0 - 2026-05-21

### Added

- Added Agent Event Bus events for run start, model stream, model token, tool call, and run completion.
- Added DeepSeek OpenAI-compatible SSE token streaming in the provider.
- Added `POST /api/agent/stream` for browser/TUI-style event streaming.
- Added Web live-run rendering for agent events and streamed model text.

### Changed

- `npm run agent -- --stream` now enables provider token streaming when DeepSeek is configured.
- Updated offline guidance, CLI docs, project plan, development context, and architecture snapshots for V0.9.
- Bumped project version to `0.9.0`.

## 0.8.0 - 2026-05-21

### Added

- Added `resumeFromRunId` to agent run results and saved run summaries.
- Added a compact resume prompt builder that turns a saved run into next-turn context.
- Added `npm run agent -- --continue <run-id>` for CLI-side run continuation.
- Added `resumeRunId` support to `POST /api/agent`.
- Added a Web workbench continue action in the recent-runs panel.

### Changed

- Preserved the user's new goal separately from the expanded model prompt when resuming.
- Updated offline guidance, CLI docs, project plan, and architecture snapshots for V0.8.
- Bumped project version to `0.8.0`.

## 0.7.0 - 2026-05-19

### Added

- Added runner step events so CLI can print high-level progress while the agent is running.
- Added `npm run agent -- --stream` for incremental terminal progress output.
- Added `npm run agent -- --apply` for terminal-side patch proposal approval and application.
- Added `npm run agent -- --validate typecheck|build|all` for terminal validation command chaining.
- Added `--yes` as an explicit non-interactive confirmation flag for CLI patch application.

### Changed

- Reused the existing patch safety module for terminal-side patch application.
- Reused the existing validation whitelist for CLI validation commands.
- Bumped project version to `0.7.0`.

## 0.6.0 - 2026-05-19

### Added

- Added a minimal VS Code attach config for server-side Next.js debugging.
- Added `npm run dev:inspect` to start Next with Node inspector enabled.
- Added `npm run debug:check` to verify that `/api/agent` can pause through the Node inspector without calling DeepSeek.
- Added guarded debug probes in `/api/agent` and the DeepSeek provider.
- Added `docs/DEBUGGING.md` with the step-by-step server-side debug workflow.
- Added `.nvmrc` and `package.json` engines for the Node.js 22 runtime.
- Added `npm run agent` as a direct TypeScript CLI shell for running the agent without a Next dev server.
- Added `src/cli/agent.ts` with compact answer output, optional trace output, JSON output, recent-run listing, and saved-run detail view.
- Added `.env.local` loading for the direct CLI path.
- Added `git_status` as a fixed read-only tool for branch, short status, diff stat, and recent commits.
- Added `docs/CLI.md` with terminal usage notes and current limitations.

### Changed

- Upgraded runtime dependencies to Next.js 16.2.6 and React 19.2.6.
- Upgraded development dependencies to TypeScript 6.0.3 and Node.js 22 type definitions.
- Added `tsx` as a development dependency and Node loader for running TypeScript CLI modules directly.
- Switched the inspect script from `NODE_OPTIONS='--inspect'` to the Next.js 16 `next dev --inspect` CLI flag.
- Pinned `turbopack.root` in `next.config.mjs` so the repo does not inherit the parent workspace lockfile.
- Updated TypeScript config to the values generated by Next.js 16.
- Bumped project version to `0.6.0`.

### Removed

- Removed the pre-upgrade `dev:break` and `debug:worker` scripts.
- Removed the obsolete Next router-worker inspector helper.

## 0.5.0 - 2026-05-19

### Added

- Added local `.agent-runs` storage for lightweight agent run records.
- Added `GET /api/runs` to list recent runs and load a saved run record.
- Added automatic run saving after `POST /api/agent`.
- Added validation result association through `runId`.
- Added a recent-runs panel in the workbench UI.
- Added versioned architecture snapshot generation for `v0.5.0`.

### Changed

- Stored run records omit model raw text and full patch content; patch proposals are saved as metadata only.
- Bumped project version to `0.5.0`.

### Notes

- Run history is local-only and ignored by git.
- This is a session-history foundation, not full conversation resume yet.

## 0.4.0 - 2026-05-19

### Added

- Added `POST /api/validate` for whitelist-only validation commands.
- Added `npm run typecheck` and `npm run build` validation buttons in the workbench UI.
- Added validation command output display with success and failure states.
- Added `DEEPSEEK_JSON_OUTPUT` and `DEEPSEEK_MAX_TOKENS` environment options.
- Added versioned architecture snapshot generation for `v0.4.0`.

### Changed

- Updated DeepSeek requests to use `response_format: { type: "json_object" }` by default.
- Updated DeepSeek requests to explicitly send `thinking: { type: "enabled" | "disabled" }`.
- Avoided sending `temperature` when thinking mode is enabled.
- Bumped project version to `0.4.0`.

### Notes

- Validation commands are fixed server-side and are not generated by the model.
- Arbitrary shell execution remains intentionally unsupported.

## 0.3.0 - 2026-05-19

### Added

- Added structured `patchProposal` support to agent final answers.
- Added patch proposal normalization and server-side safety validation.
- Added `POST /api/patch/apply` for human-approved patch application.
- Added UI patch preview with file action, explanation, content preview, and explicit apply confirmation.
- Added workspace write path validation for text-like files inside the repository.
- Added versioned architecture snapshot generation for `v0.3.0`.

### Changed

- Updated the prompt protocol so DeepSeek can propose `create` and `replace` file changes without applying them directly.
- Bumped project version to `0.3.0`.

### Notes

- This version still does not run arbitrary shell commands from model output.
- Patch application currently supports structured full-file `create` and `replace` actions, not arbitrary unified diff hunks.

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

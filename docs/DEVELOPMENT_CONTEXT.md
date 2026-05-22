# Development Context

This file is the handoff note for the next development pass. It records the project intent, reference repos, current implementation state, and the prompt shape that should guide future work.

## Product Goal

Build a small macOS-first coding agent inspired by DeepSeek-TUI, opencode, and openclaude.

This repository is not trying to clone those projects line-by-line. The learning goal is to rebuild the core ideas from 0 to 1 with TypeScript and Next.js:

- task input
- workspace context collection
- model/provider abstraction
- tool loop
- approval gates for risky actions
- traceable steps
- generated docs that preserve implementation context

## Reference Notes

### DeepSeek-TUI

Source: https://github.com/Hmbown/DeepSeek-TUI

Observed ideas to learn from:

- Terminal-first coding agent for DeepSeek models.
- Dispatcher command plus companion TUI runtime.
- OpenAI-compatible streaming client around DeepSeek V4 models.
- Tool registry for file operations, shell, git, web, sub-agents, MCP, and patch application.
- Plan, Agent, and YOLO modes.
- Approval gates before workspace edits and risky shell actions.
- Session save/resume, rollback snapshots, durable task queue, and cost/context tracking.
- Auto mode that routes model and thinking level per turn.

### opencode

Sources:

- https://opencode.ai/
- https://github.com/anomalyco/opencode

Observed ideas to learn from:

- Coding agent available across terminal, IDE, and desktop surfaces.
- Model/provider flexibility instead of being locked to one backend.
- LSP-aware context and diagnostics.
- Multi-session workflows.
- Privacy-first positioning: local workspace context should not be stored by a third-party app service.

### openclaude

Source: https://github.com/Gitlawb/openclaude

Observed ideas to learn from:

- TypeScript-heavy terminal-first coding-agent CLI.
- OpenAI-compatible APIs, Gemini, GitHub Models, DeepSeek, Ollama, and other provider backends.
- Provider profiles configured inside the app.
- Tool-driven loop: bash, file tools, grep, glob, agents, tasks, MCP, web tools, and streaming output.
- Agent routing so different task roles can use different models.

## Current State

Version: V0.17

The current implementation is a Node.js 22 + Next.js 16 learning workbench plus a CLI and a dependency-free TUI spike. It has read-only tools, explicit session modes, explicit context budgets, heuristic context selection, configurable tool policy, model protocol repair, server-side patch diff preview, human-approved patch application, post-patch validation, local run history, Agent Event Bus, DeepSeek token streaming, terminal approval flow, and simple resume.

Implemented:

- Next.js app with a browser workbench.
- API route at `POST /api/agent`.
- API route at `POST /api/agent/stream` for Server-Sent Event streaming.
- Agent runner with high-level trace steps and typed event bus events.
- Agent runner records an active context budget for each run.
- Agent runner records an active context selection snapshot for each run.
- Workspace text-file index with ignored `.agent-runs`, heavy directories, and real `.env` files.
- `AGENT_CONTEXT_*` environment variables control file indexing, file reads, text search, and tool output truncation.
- `AGENT_CONTEXT_SELECTED_MAX_FILES` controls how many scored files enter the initial prompt file map.
- `src/lib/agent/context-selection.ts` scores likely-relevant files by goal terms, path hints, concepts, module type, and size.
- Prompt construction sends the selected initial file map plus selection reasons; tools can still expand context after that.
- CLI, Web, TUI, and saved run records expose selected files, scores, and reasons.
- DeepSeek provider using OpenAI-compatible chat completions and SSE token streaming.
- Provider-agnostic JSON tool-call protocol.
- `src/lib/agent/model-protocol.ts` controls one visible repair retry for malformed model protocol output.
- `AGENT_PROTOCOL_REPAIR_MAX_ATTEMPTS` and `AGENT_PROTOCOL_REPAIR_MAX_RAW_LENGTH` control protocol repair behavior.
- Runner classifies model protocol failures as `non_json`, `top_level_not_object`, `missing_type`, or `invalid_tool_call`.
- Runner can extract the first JSON object from prose-wrapped model output before using the repair path.
- CLI, Web, TUI, and saved run records expose protocol repair policy, repair counts, and protocol errors.
- `src/lib/agent/patches.ts` can turn a structured `patchProposal` into a local diff preview before any write.
- Run results can include `patchPreview` with total additions/deletions, per-file risks, compact diff lines, and path/action warnings.
- CLI, Web, TUI, and saved run records expose patch diff counts and write-risk metadata.
- `ValidationRunResult` records whether a validation was manual or triggered after patch application.
- Web patch preview can run `typecheck`, `build`, both, or skip after a successful patch apply.
- CLI `--apply --validate` runs validation only after the patch was successfully applied.
- TUI `v` runs `typecheck` for the latest run and stores it with `post_patch` when a patch was just applied.
- Resume prompts include validation trigger, exit code, duration, and compact failure output.
- `AgentSessionMode` defines `plan`, `agent`, and `apply` run modes.
- `src/lib/agent/session-mode.ts` centralizes session-mode parsing, descriptions, prompt text, and plan-mode patch disabling.
- Prompt construction includes the active session mode.
- Run results, run summaries, event streams, CLI, Web, and TUI expose the active session mode.
- CLI supports `--mode plan|agent|apply`; `--apply` defaults to `apply` when no explicit mode is passed.
- TUI supports `m` to cycle plan/agent/apply before running a goal.
- Read-only `list_files`, `read_file`, `search_text`, and `git_status` tools.
- Tool definitions include `category`, `risk`, and `approvalRequired` so callable boundaries are visible to prompt, code, and docs.
- `src/lib/agent/tool-policy.ts` turns environment variables into a run-level tool policy snapshot.
- `AGENT_ALLOWED_READ_TOOLS` can restrict which read-only tools the model sees and can request.
- `AGENT_PATCH_PROPOSAL=disabled` removes model-returned patch proposals for planning-only runs.
- Runner enforces tool policy before executing model-requested tools.
- Prompt construction advertises only tools allowed by the active policy.
- CLI, Web, TUI, and saved run records expose the active tool policy.
- TUI now has a separate tool-call detail area and policy summary.
- Tool inputs from the model are clamped by the active context budget before local reads/searches.
- Tool-call limit to avoid runaway loops.
- UI trace entries for tool input and output summaries.
- CLI entrypoint at `src/cli/agent.ts`, runnable with `npm run agent`.
- TUI entrypoint at `src/cli/tui.ts`, runnable with `npm run tui`.
- CLI output for answer, plan, files, patch proposal summary, optional trace, recent runs, and saved run detail.
- TUI alternate-screen renderer with goal display, recent-run selection, live events, model stream preview, and result summary.
- TUI keyboard controls for run, edit goal, select recent run, continue selected run, apply latest patch proposal, and quit.
- CLI streaming mode through `--stream`, fed by high-level `AgentRunEvent` callbacks from the runner.
- CLI `--stream` enables DeepSeek token streaming when the API key is configured.
- CLI patch application through `--apply`, reusing the same safe full-file patch module as the browser API.
- CLI validation chaining through `--validate typecheck|build|all`, reusing the fixed validation command whitelist.
- The `tsx` Node loader is used so the CLI can run TypeScript modules directly in development.
- CLI resume through `--continue <run-id>`, using saved runs as compact next-turn context.
- Structured `patchProposal` final answer format.
- UI patch preview with explicit confirmation before writes.
- Server-side patch apply API with workspace path validation.
- Safe `create` and `replace` full-file patch actions.
- Whitelist validation API for `npm run typecheck` and `npm run build`.
- DeepSeek request options aligned with JSON Output and thinking-mode parameter rules.
- Local `.agent-runs` store for lightweight run records.
- Recent-runs UI for inspecting previous agent results.
- Recent-runs UI can start a continuation from a saved run.
- Web workbench renders live agent events and streamed model text while a run is active.
- `POST /api/agent` accepts `resumeRunId` and records `resumeFromRunId`.
- `src/lib/agent/resume.ts` compresses visible run output, patch metadata, and validation history into a resume prompt.
- `AgentRunEvent` now includes run, model stream, model token, tool call, and completion events.
- Validation results can be linked to a saved run by `runId`.
- VS Code can start a Next inspector session with guarded debug probes for browser-triggered `/api/agent` requests.
- `npm run debug:check` can verify that `/api/agent` pauses through the inspector without calling DeepSeek.
- `.nvmrc` and `package.json` engines document Node.js 22 as the local runtime.
- Generated architecture snapshots in `docs/architecture/`.
- Offline fallback when `DEEPSEEK_API_KEY` is missing.
- README generation from `docs/project-plan.json` and `package.json`.
- Git pre-commit hook that regenerates and stages `README.md`.

Important files:

- `src/components/AgentWorkbench.tsx`
- `src/app/api/agent/route.ts`
- `src/app/api/agent/stream/route.ts`
- `src/lib/agent/runner.ts`
- `src/lib/agent/context-budget.ts`
- `src/lib/agent/context-selection.ts`
- `src/lib/agent/model-protocol.ts`
- `src/lib/agent/tool-policy.ts`
- `src/lib/agent/tools.ts`
- `src/lib/agent/git-tools.ts`
- `src/cli/agent.ts`
- `src/cli/tui.ts`
- `src/lib/agent/patches.ts`
- `src/lib/agent/run-store.ts`
- `src/lib/agent/resume.ts`
- `src/lib/agent/validation.ts`
- `src/app/api/patch/apply/route.ts`
- `src/app/api/validate/route.ts`
- `src/app/api/runs/route.ts`
- `src/lib/agent/deepseek.ts`
- `src/lib/agent/workspace.ts`
- `docs/project-plan.json`
- `docs/architecture/architecture-latest.svg`
- `scripts/generate-architecture-diagram.mjs`
- `scripts/generate-readme.mjs`
- `.githooks/pre-commit`
- `.vscode/launch.json`
- `docs/DEBUGGING.md`
- `docs/CLI.md`
- `docs/TUI.md`
- `docs/CONTEXT_BUDGET.md`
- `docs/CONTEXT_SELECTION.md`
- `docs/MODEL_PROTOCOL.md`
- `docs/TOOL_POLICY.md`
- `docs/PATCH_DIFF.md`
- `docs/VALIDATION_LOOP.md`
- `docs/SESSION_MODES.md`

## Architecture Direction

Keep the architecture intentionally small:

```txt
UI / CLI
  -> API route or direct local command handler
  -> Agent runner
  -> Prompt builder
  -> Provider client
  -> Tool registry
  -> Approval policy
  -> Workspace changes / command output
  -> Trace + session record
  -> Generated docs + architecture snapshot
```

The V0.17 architecture keeps the V0.2 tool loop, V0.3 write approval, V0.4 validation, V0.5 run history, V0.6 terminal shell, V0.7 CLI streaming/approval, V0.8 cross-surface continuation, V0.9 shared event stream, V0.10 full-screen terminal renderer, V0.11 context budgets/tool boundaries, V0.12 local tool policy, V0.13 context selection, V0.14 model protocol repair, V0.15 patch diff review, V0.16 post-patch validation, and adds explicit plan/agent/apply session modes:

1. User submits a goal.
2. Agent creates a turn state with `sessionMode=plan|agent|apply`.
3. Model chooses a tool call such as `list_files`, `read_file`, `search_text`, or `git_status`.
4. Server validates the tool call against the active local tool policy.
5. Tool output is appended to the transcript.
6. Model either requests another tool or returns a final answer.
7. Final answers may include a `patchProposal` with structured file changes when session/tool policy allows it.
8. Runner validates the proposal through the safe patch module and builds a compact diff preview.
9. UI, CLI, and TUI show diff counts and write-risk metadata before any write.
10. UI shows patch preview and requires explicit user confirmation.
11. Server validates paths/actions again before writing files.
12. User can run fixed validation commands and inspect output.
13. If validation follows a successful patch apply, the result is tagged as `post_patch`.
14. Server saves lightweight run records under `.agent-runs`.
15. UI and CLI can list recent runs and load a saved result.
16. CLI can run the same agent runner directly without starting the Next dev server.
17. CLI can print high-level step events as they happen.
18. CLI can ask for explicit approval before applying patch proposals.
19. CLI can run fixed validation commands after an agent run or patch application.
20. UI or CLI can select a saved run to continue.
21. Resume context is rebuilt from user-visible summaries, patch metadata, diff metadata, and validation records.
22. The new run preserves the user's fresh goal and stores `resumeFromRunId` for traceability.
23. Runner emits typed events for run lifecycle, steps, model stream chunks, tool calls, and completion.
24. DeepSeek provider can stream token chunks and still return accumulated final content for JSON parsing.
25. Web uses SSE to render live events; CLI uses the same events through the direct runner callback.
26. TUI uses the same direct runner callback to render events in an alternate-screen terminal layout.
27. TUI can continue from a selected saved run and apply a returned patch proposal through the existing safe patch module.
28. Runner applies a central context budget before workspace indexing and tool execution.
29. Runner scores indexed files by current goal, path, module hints, and size.
30. Prompt construction receives only the selected initial file map plus selection metadata.
31. Runner parses model output against the `tool_call`/`final` JSON protocol.
32. If parsing fails, runner records a typed protocol error and can send one compact repair prompt.
33. Tool definitions expose category, risk, and approval metadata; current model-callable tools remain low-risk read-only tools.
34. Runner builds a tool policy snapshot from `AGENT_ALLOWED_READ_TOOLS` and `AGENT_PATCH_PROPOSAL`.
35. Prompt construction exposes only policy-allowed tools.
36. Runner enforces the same policy before executing tool calls.
37. CLI, Web, and TUI show context selection, protocol repair, patch diff, validation trigger, session mode, and policy metadata so users can understand why a run had a smaller prompt/tool surface, stayed read-only, needed repair, proposed risky writes, or failed verification.

Debugging uses the official Next.js 16 `next dev --inspect` path. Start `npm run dev:inspect:break`, attach VS Code with `Attach Next.js Server (9229)`, and run `npm run debug:check` to verify that the guarded `debugger` statement in `src/app/api/agent/route.ts` is reachable before testing normal source breakpoints.

## V0.2 Completed

Theme: explicit read-only tool loop.

Built:

- `src/lib/agent/tools.ts` with typed tool definitions.
- `list_files`, `read_file`, and `search_text` tools.
- A small tool-call protocol that works even if the model does not support native function calling.
- A loop limit such as 6 tool calls per run.
- UI trace entries that show each tool call and summarized output.
- Prompt updates that tell DeepSeek how to choose tools and when to stop.

Do not build yet:

- automatic file writes
- arbitrary shell execution
- background task queues
- sub-agents
- MCP

## V0.3 Target

Theme: patch preview with human approval.

Built:

- model returns structured file edits through `patchProposal`
- server validates path safety and patch action
- UI shows file list and patch preview
- user explicitly approves before applying
- server applies safe full-file `create` and `replace` actions

Do not build yet:

- arbitrary shell execution
- background task queues
- sub-agents
- MCP

## V0.4 Completed

Theme: command validation and DeepSeek runtime hardening.

Built:

- `POST /api/validate` with fixed command names only.
- UI buttons for `typecheck` and `build`.
- Captured stdout/stderr, exit code, and duration.
- DeepSeek JSON Output enabled by default.
- Explicit thinking-mode toggle in every DeepSeek request.

Do not build yet:

- arbitrary shell execution
- model-suggested commands
- automatic validation after patch apply

## V0.5 Completed

Theme: local session history.

Built:

- `.agent-runs` local run store ignored by git.
- Automatic save after each agent run.
- `GET /api/runs` for summaries and detail records.
- Recent-runs UI panel.
- Validation result association by `runId`.

Do not build yet:

- full transcript replay
- multi-turn conversation resume
- remote/shared run storage

## V0.6 Completed

Theme: terminal shell and Git read-only context.

Built:

- `npm run agent -- "goal"` direct CLI entrypoint.
- `--trace` compact terminal trace output.
- `--recent` and `--show <run-id>` run-history readback.
- `--json` output for automation and debugging.
- `.env.local` loading for the direct CLI path.
- `git_status` read-only tool with fixed Git commands.
- `docs/CLI.md` usage guide.

Do not build yet:

- full-screen terminal UI framework
- model-suggested arbitrary shell execution
- model-generated arbitrary shell execution

## V0.7 Completed

Theme: streaming terminal feedback and CLI-side approval.

Built:

- `AgentRunEvent` type and runner `onEvent` callback.
- `npm run agent -- --stream` for high-level step progress.
- `npm run agent -- --apply` for terminal patch approval.
- `npm run agent -- --apply --yes` for explicit non-interactive patch approval.
- `npm run agent -- --validate typecheck|build|all` for whitelist validation chaining.
- CLI validation results are appended to saved run records when saving is enabled.

Do not build yet:

- arbitrary shell execution from model output
- full transcript replay
- full-screen TUI renderer

## V0.8 Completed

Theme: multi-turn resume across CLI and Web.

Built:

- `src/lib/agent/resume.ts` for compact saved-run handoff prompts.
- `resumeFromRunId` on run results, saved records, and recent-run summaries.
- `npm run agent -- --continue <run-id> "goal"` for CLI continuation.
- `POST /api/agent` support for `resumeRunId`.
- Web recent-runs continue action and composer resume banner.

Do not build yet:

- full transcript replay
- arbitrary shell execution from model output
- full-screen TUI renderer

## V0.9 Completed

Theme: shared event stream and provider token streaming.

Built:

- Expanded `AgentRunEvent` into a typed event bus for run lifecycle, model stream, token chunks, tool calls, and completion.
- Added DeepSeek SSE token streaming while preserving accumulated final content for JSON parsing.
- Added `POST /api/agent/stream` for browser/TUI-style Server-Sent Events.
- Updated CLI `--stream` to enable provider streaming when DeepSeek is configured.
- Added Web live-run rendering for agent events and streamed model text.

Do not build yet:

- arbitrary shell execution from model output
- full transcript replay

## V0.10 Completed

Theme: first full-screen TUI renderer spike.

Built:

- `npm run tui` entrypoint.
- Dependency-free ANSI alternate-screen TUI renderer.
- Keyboard controls for running a goal, editing the goal, selecting recent runs, continuing a selected run, applying a patch proposal, and quitting.
- Live event panel and model stream preview fed by the V0.9 Agent Event Bus.
- `--once` mode for non-interactive smoke tests.

Do not build yet:

- rich terminal component framework
- arbitrary shell execution from model output
- full transcript replay

## V0.11 Completed

Theme: context budget and tool boundaries.

Built:

- `src/lib/agent/context-budget.ts` for central budget defaults and env parsing.
- `AGENT_CONTEXT_*` knobs in `.env.example`.
- Active context budget recorded on run results and persisted run records.
- Prompt-visible context budget details.
- Tool definitions with `category`, `risk`, and `approvalRequired`.
- Runtime clamping for model-provided `list_files`, `read_file`, and `search_text` limits.

Do not build yet:

- arbitrary shell execution from model output
- multi-category write/shell policy
- full transcript replay

## V0.12 Completed

Theme: configurable tool policy and TUI tool panels.

Built:

- `src/lib/agent/tool-policy.ts` for central policy parsing and formatting.
- `AGENT_ALLOWED_READ_TOOLS` read-tool allowlist.
- `AGENT_PATCH_PROPOSAL` planning-only switch.
- Tool policy snapshots on run results and saved run records.
- Prompt-visible tool policy details and filtered tool definitions.
- Runner enforcement before executing any model-requested tool.
- Patch proposal removal when the active policy disables patches.
- CLI/Web/TUI display for active tool policy.
- TUI tool-call detail area fed by `tool_call` events.
- `docs/TOOL_POLICY.md` as the policy handoff note.

Do not build yet:

- arbitrary shell execution from model output
- multi-category write/shell policy
- full transcript replay
- LSP-aware file prioritization

## V0.13 Completed

Theme: file priority and context selection.

Built:

- `src/lib/agent/context-selection.ts` for deterministic heuristic file scoring.
- `AGENT_CONTEXT_SELECTED_MAX_FILES` context budget knob.
- Context selection snapshots on run results and saved run records.
- Prompt-visible selected file map with score and reasons.
- CLI/Web/TUI display for selected files, scores, and reasons.
- `docs/CONTEXT_SELECTION.md` as the context-selection handoff note.

Do not build yet:

- embeddings or vector retrieval
- LSP-aware symbol selection
- arbitrary shell execution from model output
- full transcript replay

## V0.14 Completed

Theme: model protocol repair and retry.

Built:

- `src/lib/agent/model-protocol.ts` for repair policy, raw response previews, and typed error snapshots.
- `AGENT_PROTOCOL_REPAIR_MAX_ATTEMPTS` and `AGENT_PROTOCOL_REPAIR_MAX_RAW_LENGTH` knobs.
- Protocol repair policy, repair count, and protocol errors on run results and saved records.
- One controlled repair retry after malformed JSON or protocol misses.
- First-JSON-object extraction for prose-wrapped model output.
- CLI/Web/TUI display for repair policy, repair count, and protocol errors.
- `docs/MODEL_PROTOCOL.md` as the model protocol handoff note.

Do not build yet:

- multi-step autonomous repair loops
- arbitrary shell execution from model output
- full transcript replay

## V0.15 Completed

Theme: patch diff preview and write-risk review.

Built:

- `PatchDiffPreview` and per-file diff metadata in `src/lib/agent/types.ts`.
- `previewPatchProposal` in `src/lib/agent/patches.ts`, reusing the same path/action checks as patch application.
- Runner-side diff generation after a final answer includes an allowed `patchProposal`.
- Run history metadata for total additions/deletions, per-file additions/deletions, and diff warnings.
- Web patch preview with run-level diff status, per-file risk tags, and compact changed-line snippets.
- CLI patch proposal output with diff totals, per-file risk tags, and preview snippets before approval.
- TUI result summary showing run-level diff totals before the user applies a patch.
- `docs/PATCH_DIFF.md` as the patch review handoff note.

Do not build yet:

- automatic patch application without human approval
- model-suggested arbitrary shell execution
- full unified diff parser or partial hunk application
- validation loop that automatically runs after applying a patch

## V0.16 Completed

Theme: validation loop after patch application.

Built:

- `ValidationTrigger` metadata on validation results, with `manual` and `post_patch` triggers.
- `POST /api/validate` trigger parsing while keeping command names whitelist-only.
- Web patch preview control for post-apply validation: `typecheck`, `build`, both, or skip.
- CLI `--apply --validate` behavior that skips validation unless the patch was applied.
- TUI `v` key for running `typecheck` on the latest run and storing it in run history.
- Resume prompt validation lines with trigger, exit code, duration, and compact failure output.
- `docs/VALIDATION_LOOP.md` as the post-patch validation handoff note.

Do not build yet:

- arbitrary model-suggested shell commands
- automatic patch application without human approval
- generalized command sandbox
- rich multi-mode TUI session manager

## V0.17 Completed

Theme: session modes and a closer DeepSeek-TUI interaction loop.

Built:

- `AgentSessionMode` with `plan`, `agent`, and `apply`.
- `src/lib/agent/session-mode.ts` for mode parsing, descriptions, prompt guidance, and plan-mode policy override.
- `sessionMode` on run results, saved run records, recent-run summaries, and run-started events.
- Prompt-level mode instructions so plan stays read-only and apply prefers reviewable patches.
- Web mode control above the task composer.
- CLI `--mode plan|agent|apply`, with `--apply` defaulting to apply mode.
- TUI `m` key to cycle modes before running a goal.
- `docs/SESSION_MODES.md` as the session-mode handoff note.

Do not build yet:

- background task queues
- arbitrary model-suggested shell commands
- automatic patch application without human approval
- multi-agent/sub-agent routing

## Safety Rules

- macOS only for now.
- Keep model API keys server-side.
- Never let the browser directly read local files.
- Do not run arbitrary shell commands from model output.
- Every workspace write should pass through a path allowlist and human approval.
- Keep generated reasoning as high-level implementation notes, not hidden chain-of-thought transcripts.

## Prompt For Next Development Pass

Use this prompt when starting the next version:

```txt
You are continuing DeepSeek TUI Demo.

Goal: implement V0.18, richer multi-turn TUI session input and run filtering for a macOS-first coding-agent learning project built with Next.js and TypeScript.

Read first:
- docs/DEVELOPMENT_CONTEXT.md
- docs/project-plan.json
- src/lib/agent/runner.ts
- src/lib/agent/context-budget.ts
- src/lib/agent/context-selection.ts
- src/lib/agent/model-protocol.ts
- src/lib/agent/tool-policy.ts
- src/lib/agent/prompts.ts
- src/lib/agent/tools.ts
- src/lib/agent/git-tools.ts
- src/lib/agent/patches.ts
- src/lib/agent/validation.ts
- src/lib/agent/run-store.ts
- src/lib/agent/resume.ts
- src/app/api/agent/stream/route.ts
- src/lib/agent/workspace.ts
- src/cli/agent.ts
- src/cli/tui.ts
- docs/CONTEXT_BUDGET.md
- docs/CONTEXT_SELECTION.md
- docs/MODEL_PROTOCOL.md
- docs/TOOL_POLICY.md
- docs/PATCH_DIFF.md
- docs/VALIDATION_LOOP.md
- docs/SESSION_MODES.md

Constraints:
- Keep DeepSeek as the first provider.
- Keep Node.js 22 as the local runtime.
- Keep the browser UI and CLI working.
- Keep the existing read-only tools, including git_status.
- Keep CLI/Web resume compatible through `resumeFromRunId`.
- Keep the V0.10 TUI working.
- Keep the V0.11 context budget controls working.
- Keep the V0.12 tool policy controls working.
- Keep the V0.13 context selection controls working.
- Keep the V0.14 protocol repair controls working.
- Keep the V0.15 patch diff preview controls working.
- Keep the V0.16 post-patch validation controls working.
- Keep the V0.17 plan/agent/apply session modes working.
- Keep human approval before writes.
- Never execute model-suggested arbitrary commands.
- Reuse the existing runner, run store, resume, patch, and validation modules.
- Improve the TUI loop around multi-turn use: mode-aware recent-run display, simple mode filtering, and clearer continuation state.
- Keep the implementation dependency-free unless the value of a TUI framework becomes obvious.
- Preserve sessionMode in any new run filtering or continuation affordance.
- Keep patch application behind explicit human approval.
- Keep validation commands whitelist-only.
- Do not store API keys or full hidden reasoning.
- Update README through npm run readme:generate.
- Run npm run docs:generate so the versioned architecture SVG is updated.
```

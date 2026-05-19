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

Version: V0.6

The current implementation is a Node.js 22 + Next.js 16 learning workbench plus a small CLI shell. It has read-only tools, human-approved patch application, whitelist validation commands, local run history, and a terminal entrypoint, not a full-screen TUI yet.

Implemented:

- Next.js app with a browser workbench.
- API route at `POST /api/agent`.
- Agent runner with high-level trace steps.
- Workspace text-file index with ignored heavy directories and real `.env` files.
- DeepSeek provider using OpenAI-compatible chat completions.
- Provider-agnostic JSON tool-call protocol.
- Read-only `list_files`, `read_file`, `search_text`, and `git_status` tools.
- Tool-call limit to avoid runaway loops.
- UI trace entries for tool input and output summaries.
- CLI entrypoint at `src/cli/agent.ts`, runnable with `npm run agent`.
- CLI output for answer, plan, files, patch proposal summary, optional trace, recent runs, and saved run detail.
- The `tsx` Node loader is used so the CLI can run TypeScript modules directly in development.
- Structured `patchProposal` final answer format.
- UI patch preview with explicit confirmation before writes.
- Server-side patch apply API with workspace path validation.
- Safe `create` and `replace` full-file patch actions.
- Whitelist validation API for `npm run typecheck` and `npm run build`.
- DeepSeek request options aligned with JSON Output and thinking-mode parameter rules.
- Local `.agent-runs` store for lightweight run records.
- Recent-runs UI for inspecting previous agent results.
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
- `src/lib/agent/runner.ts`
- `src/lib/agent/tools.ts`
- `src/lib/agent/git-tools.ts`
- `src/cli/agent.ts`
- `src/lib/agent/patches.ts`
- `src/lib/agent/validation.ts`
- `src/lib/agent/run-store.ts`
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

The V0.6 architecture keeps the V0.2 tool loop, V0.3 write approval, V0.4 validation, V0.5 run history, and adds a terminal shell:

1. User submits a goal.
2. Agent creates a turn state.
3. Model chooses a tool call such as `list_files`, `read_file`, `search_text`, or `git_status`.
4. Server validates the tool call against a local policy.
5. Tool output is appended to the transcript.
6. Model either requests another tool or returns a final answer.
7. Final answers may include a `patchProposal` with structured file changes.
8. UI shows patch preview and requires explicit user confirmation.
9. Server validates paths/actions before writing files.
10. User can run fixed validation commands and inspect output.
11. Server saves lightweight run records under `.agent-runs`.
12. UI and CLI can list recent runs and load a saved result.
13. CLI can run the same agent runner directly without starting the Next dev server.

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
- terminal patch apply flow
- model-suggested arbitrary shell execution
- long-lived multi-turn session resume

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

Goal: implement V0.7, streaming terminal feedback and safer terminal-side approval for a macOS-first coding-agent learning project built with Next.js and TypeScript.

Read first:
- docs/DEVELOPMENT_CONTEXT.md
- docs/project-plan.json
- src/lib/agent/runner.ts
- src/lib/agent/prompts.ts
- src/lib/agent/tools.ts
- src/lib/agent/git-tools.ts
- src/lib/agent/patches.ts
- src/lib/agent/validation.ts
- src/lib/agent/run-store.ts
- src/lib/agent/workspace.ts
- src/cli/agent.ts

Constraints:
- Keep DeepSeek as the first provider.
- Keep Node.js 22 as the local runtime.
- Keep the browser UI and CLI working.
- Keep the existing read-only tools, including git_status.
- Keep human approval before writes.
- Never execute model-suggested arbitrary commands.
- Reuse the existing runner, run store, patch, and validation modules.
- Add streaming or incremental terminal feedback without exposing hidden reasoning.
- Explore terminal-side patch approval while keeping path/action validation.
- Keep validation commands whitelist-only.
- Do not store API keys or full hidden reasoning.
- Update README through npm run readme:generate.
- Run npm run docs:generate so the versioned architecture SVG is updated.
```

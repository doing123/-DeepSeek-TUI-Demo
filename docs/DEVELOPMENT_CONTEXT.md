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

Version: V0.1

The current implementation is a learning workbench, not a full TUI yet.

Implemented:

- Next.js app with a browser workbench.
- API route at `POST /api/agent`.
- Agent runner with high-level trace steps.
- Workspace text-file scan with ignored heavy directories.
- DeepSeek provider using OpenAI-compatible chat completions.
- Offline fallback when `DEEPSEEK_API_KEY` is missing.
- README generation from `docs/project-plan.json` and `package.json`.
- Git pre-commit hook that regenerates and stages `README.md`.

Important files:

- `src/components/AgentWorkbench.tsx`
- `src/app/api/agent/route.ts`
- `src/lib/agent/runner.ts`
- `src/lib/agent/deepseek.ts`
- `src/lib/agent/workspace.ts`
- `docs/project-plan.json`
- `scripts/generate-readme.mjs`
- `.githooks/pre-commit`

## Architecture Direction

Keep the architecture intentionally small:

```txt
UI / future CLI
  -> API or local command handler
  -> Agent runner
  -> Prompt builder
  -> Provider client
  -> Tool registry
  -> Approval policy
  -> Workspace changes / command output
  -> Trace + session record
```

The next major architectural step is to stop giving the model a large one-shot snapshot and instead let it ask for tools:

1. User submits a goal.
2. Agent creates a turn state.
3. Model chooses a tool call such as `list_files`, `read_file`, or `search_text`.
4. Server validates the tool call against a local policy.
5. Tool output is appended to the transcript.
6. Model either requests another tool or returns a proposed patch/answer.
7. UI shows trace, result, and any approval request.

## V0.2 Target

Theme: explicit read-only tool loop.

Build:

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

Build:

- model returns unified diff or structured file edits
- server validates path safety and diff format
- UI shows file list and patch preview
- user explicitly approves before applying
- post-apply typecheck/build can be triggered manually

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

Goal: implement V0.2, an explicit read-only tool loop for a macOS-first coding-agent learning project built with Next.js and TypeScript.

Read first:
- docs/DEVELOPMENT_CONTEXT.md
- docs/project-plan.json
- src/lib/agent/runner.ts
- src/lib/agent/prompts.ts
- src/lib/agent/workspace.ts

Constraints:
- Keep DeepSeek as the first provider.
- Keep the browser UI, but structure the core so a CLI/TUI can be added later.
- Add typed tools for list_files, read_file, and search_text.
- The model should ask for tools through a strict JSON protocol.
- Limit the loop to a small number of tool calls.
- Show tool calls in the UI trace.
- Do not implement file writes or shell execution yet.
- Update README through npm run readme:generate.
```

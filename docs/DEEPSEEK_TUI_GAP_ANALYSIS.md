# DeepSeek-TUI Gap Analysis

This note compares the learning project with the public DeepSeek-TUI direction
as of 2026-05-22. It is a planning guide, not a clone checklist.

Sources:

- https://github.com/Hmbown/DeepSeek-TUI
- https://github.com/Hmbown/DeepSeek-TUI/blob/main/docs/MODES.md
- https://github.com/Hmbown/DeepSeek-TUI/blob/main/docs/CONFIGURATION.md
- https://deepseek-tui.com/docs

## What This Project Already Has

- macOS-first TypeScript/Next learning workbench
- DeepSeek provider with streaming
- Web, CLI, and a dependency-free TUI spike
- read-only tool loop: list files, read file, search text, git status
- run history and resume
- session modes: `plan`, `agent`, `apply`
- patch proposal, diff preview, human approval, and post-patch validation
- context budgets, context selection, tool policy, and protocol repair
- generated README, changelog, development context, and architecture snapshots

## Major Gaps To Close

- Approval modes: DeepSeek-TUI separates visible mode from approval aggressiveness.
  This project has mode but not approval profiles.
- YOLO/trust mode: DeepSeek-TUI supports an auto-approved mode for trusted repos.
  This project should first implement explicit approval profiles before any
  risky automation.
- Tool registry breadth: DeepSeek-TUI includes shell, file operations, git, web,
  sub-agents, MCP, and RLM-style fan-out. This project currently has only safe
  read tools plus local patch/validation entrypoints.
- Checklist planning: DeepSeek-TUI has a checklist-oriented workflow. This
  project has `plan` arrays but no first-class checklist state.
- Composer ergonomics: DeepSeek-TUI has richer keyboard flows, command menus,
  queued drafts, and mode cycling. This project has only a small TUI spike.
- Configuration: DeepSeek-TUI has user and project configuration. This project
  mostly uses environment variables.
- Memory/instructions: DeepSeek-TUI supports persistent memory/instruction
  concepts. This project has run history but no memory file or AGENTS-style
  instruction loading.
- Model routing: DeepSeek-TUI has provider/model selection and auto behavior.
  This project is DeepSeek-first with a single configured model.
- Cost/context visibility: DeepSeek-TUI tracks more session metadata. This
  project exposes budgets and selection, but not token/cost estimates.
- Rollback/snapshots: this project can apply full-file patches, but does not
  keep pre-apply rollback snapshots.

## Ten-Version Roadmap

V0.18: TUI session workflow.

- recent-run filter by mode
- mode-aware continuation
- in-process turn history
- updated gap analysis

V0.19: Approval profiles.

- introduce `approvalMode=ask|trusted-read|trusted-write`
- surface approval mode in Web/CLI/TUI
- keep arbitrary shell disabled

V0.20: Checklist workflow.

- add first-class checklist items to agent answers
- render checklist in Web/CLI/TUI
- persist checklist summary in run history

V0.21: Local configuration.

- add a checked-in config schema and ignored local config
- merge env + project config safely
- document denied keys for project config

V0.22: Instruction and memory files.

- load repo instruction file when present
- add explicit memory notes file
- make prompt injection boundaries visible

V0.23: Safer command proposals.

- let the model propose shell commands as review-only objects
- require user approval and whitelist matching before any execution
- store command proposal metadata

V0.24: Patch rollback snapshots.

- capture before-content snapshots before applying patches
- expose rollback metadata in run history
- add CLI/TUI rollback commands only after path validation

V0.25: Web fetch read tool.

- add a read-only `fetch_url` tool with size and host guardrails
- keep network tools disabled by policy by default
- surface fetched sources in trace

V0.26: Model profiles.

- add named DeepSeek profiles and reasoning/thinking settings
- show active model profile in every surface
- keep API keys server-side/local only

V0.27: Context and cost telemetry.

- estimate prompt/tool/output sizes
- persist context usage on run records
- show compact telemetry in Web/CLI/TUI

Stop after V0.27 before starting more large features unless the user confirms a
new ten-version stretch.

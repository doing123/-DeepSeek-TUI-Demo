# TUI

V0.10 added a small dependency-free terminal UI spike. V0.12 keeps the same
minimal renderer and adds a dedicated tool-call area plus the active tool policy
summary, so a run looks closer to a practical coding-agent loop.

V0.13 adds the active context-selection summary to the result area, showing how
many indexed files were selected for the first prompt map.

V0.14 adds the active model protocol repair policy and repair count, so malformed
model responses show up as a visible agent step instead of a mysterious stop.

```bash
npm run tui
npm run tui -- "查看当前仓库状态"
```

## Keys

- `r` / `enter`: run the current goal
- `n`: edit the goal
- `up` / `down`: select a saved run
- `c`: continue from the selected saved run
- `a`: apply the latest patch proposal through the safe patch module
- `q` / `esc`: quit

## Smoke Test

```bash
DEEPSEEK_API_KEY=' ' npm run tui -- --once "TUI smoke test"
```

The `--once` mode is non-interactive and useful for CI-style checks. The full
TUI uses the alternate screen and the same Agent Event Bus as the Web and CLI.

## Tool Policy

The TUI renders tool calls from the shared `tool_call` events. When a run
completes, it also shows the active policy from the run result:

- allowed read-tool count
- patchProposal enabled/disabled state
- detailed policy line in the result area

Use `AGENT_ALLOWED_READ_TOOLS` and `AGENT_PATCH_PROPOSAL` to test smaller tool
surfaces from the terminal.

## Context Selection

The TUI shows context selection after a run completes:

- selected file count versus indexed candidate count
- strategy summary from `context-selection.ts`
- selected context line in the result area

Tune it with `AGENT_CONTEXT_SELECTED_MAX_FILES`.

## Model Protocol

The TUI renders protocol repair through the same event stream:

- `修复模型协议` appears in live events when a repair prompt is sent.
- The result area shows the configured repair policy and repair count.

Tune it with `AGENT_PROTOCOL_REPAIR_MAX_ATTEMPTS`.

# TUI

V0.10 added a small dependency-free terminal UI spike. V0.12 keeps the same
minimal renderer and adds a dedicated tool-call area plus the active tool policy
summary, so a run looks closer to a practical coding-agent loop.

V0.13 adds the active context-selection summary to the result area, showing how
many indexed files were selected for the first prompt map.

V0.14 adds the active model protocol repair policy and repair count, so malformed
model responses show up as a visible agent step instead of a mysterious stop.

V0.15 adds a compact patch diff line in the result area. When a run returns a
patch preview, the TUI shows `Diff: +added/-removed` before the user presses `a`
to apply the proposal.

V0.16 adds `v` for a lightweight validation loop. After applying a patch with
`a`, pressing `v` runs `typecheck`, stores it against the latest run, and marks
the result as `post_patch`.

V0.17 adds session modes to the terminal loop. Press `m` to cycle
`plan -> agent -> apply` before running the current goal.

```bash
npm run tui
npm run tui -- "查看当前仓库状态"
```

## Keys

- `r` / `enter`: run the current goal
- `m`: cycle session mode
- `n`: edit the goal
- `up` / `down`: select a saved run
- `c`: continue from the selected saved run
- `a`: apply the latest patch proposal through the safe patch module
- `v`: validate the latest run with `typecheck`
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

## Patch Diff

The TUI does not render a full file-by-file diff yet. It shows the run-level
addition/deletion summary from `patchPreview`, while `a` still routes through the
same safe patch application module and human approval boundary.

## Validation Loop

The TUI keeps validation intentionally small: `v` runs the fixed `typecheck`
command and appends the result to `.agent-runs`. If a patch was just applied for
the latest result, the validation trigger is saved as `post_patch`.

## Session Modes

The TUI stores the selected session mode on each run. `plan` disables
`patchProposal`, `agent` is the default inspection loop, and `apply` nudges the
model toward a reviewable patch while preserving human approval.

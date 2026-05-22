# TUI

V0.10 added a small dependency-free terminal UI spike. V0.12 keeps the same
minimal renderer and adds a dedicated tool-call area plus the active tool policy
summary, so a run looks closer to a practical coding-agent loop.

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

# TUI

V0.10 adds a small dependency-free terminal UI spike.

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

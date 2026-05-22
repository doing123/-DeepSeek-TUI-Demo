# TUI Session Workflow

V0.18 improves the dependency-free terminal UI as a persistent coding-agent
workspace. The goal is still modest: make repeated runs, continuation, and mode
switching easier to understand before introducing a heavier TUI framework.

## New Controls

- `f`: cycle the recent-run filter through `all`, `plan`, `agent`, and `apply`.
- `m`: cycle the next run's session mode.
- `c`: continue the selected run and inherit its saved `sessionMode`.

## Run List

The recent-run panel now shows:

- session mode
- tool count
- patch count
- validation count
- continuation source, when a run was resumed from another run

This keeps the terminal loop closer to a practical coding agent: inspect a prior
run, continue from it, apply a patch, validate, and then continue again with the
same visible context.

## Turn History

The TUI tracks the latest local goals in memory during the current process. This
is intentionally lightweight; durable history still lives in `.agent-runs`.

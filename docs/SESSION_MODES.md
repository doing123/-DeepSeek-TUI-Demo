# Session Modes

V0.17 adds the first explicit session-mode layer. This mirrors the shape of
DeepSeek-TUI-style coding agents without changing the safety boundary: modes
guide the agent, but writes still require patch review and human approval.

## Modes

- `plan`: read-only planning. The runner disables `patchProposal` for the run,
  even if the environment would normally allow patches.
- `agent`: default mode. The agent inspects the repo and may return a
  `patchProposal` only when the task clearly calls for code changes.
- `apply`: implementation-oriented mode. The prompt tells the model to prefer a
  reviewable `patchProposal` when context is sufficient, while local code still
  requires diff review, approval, and optional validation.

## Surfaces

- Web: choose `plan`, `agent`, or `apply` above the task textarea.
- CLI: pass `--mode plan|agent|apply`. If omitted, `--apply` defaults the run to
  `apply`; otherwise the default is `agent`.
- TUI: press `m` to cycle modes before running the current goal.

## Runtime Shape

`sessionMode` is saved on the run result and run summary, sent in the initial
event stream, and included in the prompt payload. Resume context records the
previous mode so the next turn understands whether it is continuing a plan,
agent investigation, or apply-focused pass.

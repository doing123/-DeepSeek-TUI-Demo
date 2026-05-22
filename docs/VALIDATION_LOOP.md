# Validation Loop

V0.16 connects patch approval to whitelisted validation commands. This keeps the
project on the DeepSeek-TUI-style coding-agent path: propose code changes, ask a
human to approve writes, then collect verification evidence for the next turn.

## Runtime Flow

1. The model returns a `patchProposal`.
2. The runner builds `patchPreview` so the user can review the write.
3. The user explicitly applies the patch in Web, CLI, or TUI.
4. A whitelisted validation command can run after the patch is applied.
5. The validation result is appended to the saved run record.
6. Resume context includes validation status, trigger, exit code, duration, and a
   compact failure output summary.

## Surfaces

- Web: patch preview includes an apply-after-validation selector for
  `typecheck`, `build`, both, or skip.
- CLI: `npm run agent -- --apply --validate typecheck "goal"` validates only
  after the patch was successfully applied.
- TUI: press `a` to apply the latest patch, then `v` to run `typecheck` for the
  latest run.

## Safety Boundary

Validation remains whitelist-only. The model cannot provide arbitrary commands;
local code maps `typecheck` and `build` to fixed npm scripts through
`runValidationCommand`.

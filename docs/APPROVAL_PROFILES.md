# Approval Profiles

V0.19 adds explicit approval profiles. This is the first step toward the
DeepSeek-TUI-style distinction between a visible session mode and the trust
boundary for local actions.

## Profiles

- `ask`: default profile. Read-only tools are allowed, while patch application
  and validation stay behind explicit local actions.
- `trusted-read`: read-only tools remain auto-approved and the UI labels the run
  as trusted for inspection. Writes, validation, and shell execution still stay
  manual or blocked.
- `trusted-write`: records the user's future intent for a more automated trusted
  workflow. In V0.19 it is metadata only: patch proposals still require local
  preview and human approval before any file write.

## Surfaces

- Web: use the approval segmented control under the session-mode control.
- CLI: pass `--approval ask|trusted-read|trusted-write`.
- TUI: press `p` to cycle approval profiles before running the current goal.
- Env default: set `AGENT_APPROVAL_MODE=ask|trusted-read|trusted-write`.

## Safety Boundary

The model still cannot execute shell commands or write files directly. It can
only call the configured read tools and return a `patchProposal`. Local code
records the active approval profile in the run result, event stream, prompt
input, and run history so later versions can build command proposals and trust
mode without changing the data model again.

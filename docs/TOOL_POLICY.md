# Tool Policy

V0.12 adds a small local policy layer between the model protocol and tool
execution. The goal is to make the coding-agent safety boundary visible while
keeping the learning implementation easy to inspect.

## Environment Knobs

```bash
# Use all read tools.
AGENT_ALLOWED_READ_TOOLS=all

# Or restrict model-callable tools to a comma-separated allowlist.
AGENT_ALLOWED_READ_TOOLS=list_files,read_file,search_text,git_status

# Keep patch proposals enabled, or force planning-only runs.
AGENT_PATCH_PROPOSAL=enabled
AGENT_PATCH_PROPOSAL=disabled
```

## Runtime Behavior

- The prompt receives only the read tools allowed by `AGENT_ALLOWED_READ_TOOLS`.
- The runner enforces the same policy before any tool call reaches local
  filesystem-aware code.
- Invalid tool names in the allowlist are ignored and recorded as policy
  warnings on the run result.
- `AGENT_PATCH_PROPOSAL=disabled` removes model-returned `patchProposal` blocks
  before they reach Web, CLI, TUI, or run history.
- Validation commands remain manual and whitelist-only. They are not model
  callable tools.

## Current Boundary

The model can only request low-risk read tools:

- `list_files`
- `read_file`
- `search_text`
- `git_status`

Writes still require an explicit local action: Web confirmation, CLI `--apply`,
or TUI `a` after a visible patch proposal.

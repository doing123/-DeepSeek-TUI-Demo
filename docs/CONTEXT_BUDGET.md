# Context Budget

V0.11 makes context limits explicit so the agent stays understandable as the
workspace and tool set grow.

## Environment Knobs

```bash
AGENT_CONTEXT_MAX_FILES=160
AGENT_CONTEXT_READ_MAX_LENGTH=12000
AGENT_CONTEXT_SEARCH_MAX_FILES=240
AGENT_CONTEXT_SEARCH_MAX_MATCHES=24
AGENT_CONTEXT_TOOL_OUTPUT_MAX_LENGTH=1400
```

The runner records the active budget on every run. Tool inputs from the model are
clamped by this budget before any local file read or search happens.

## Tool Boundary

Current model-callable tools are all read-only:

- `list_files`
- `read_file`
- `search_text`
- `git_status`

Each tool definition includes `category`, `risk`, and `approvalRequired`.
Patch application and validation commands remain outside the model-callable tool
registry and require explicit local user action.

## Tool Policy

V0.12 adds a policy layer on top of these boundaries:

```bash
AGENT_ALLOWED_READ_TOOLS=all
AGENT_PATCH_PROPOSAL=enabled
```

`AGENT_ALLOWED_READ_TOOLS` can also be a comma-separated allowlist such as
`list_files,read_file,git_status`. The prompt advertises only allowed tools, and
the runner checks the same policy again before execution.

Set `AGENT_PATCH_PROPOSAL=disabled` for planning-only runs. In that mode the
runner removes model-returned `patchProposal` blocks before they reach any UI,
CLI, TUI, or saved run record.

See `docs/TOOL_POLICY.md` for the current policy model.

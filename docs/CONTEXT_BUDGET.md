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

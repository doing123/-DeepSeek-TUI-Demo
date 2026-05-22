# Model Protocol

V0.14 hardens the JSON protocol between DeepSeek and the local agent runner.
This is not full autonomous recovery; it is a small, visible retry path that
keeps the coding-agent loop understandable.

## Expected Shapes

Tool call:

```json
{
  "type": "tool_call",
  "tool": {
    "name": "read_file",
    "input": {
      "path": "src/lib/agent/runner.ts"
    }
  }
}
```

Final answer:

```json
{
  "type": "final",
  "answer": {
    "title": "Short title",
    "summary": "Visible summary",
    "plan": [],
    "filesToInspect": [],
    "proposedChanges": [],
    "risks": [],
    "nextActions": []
  }
}
```

## Repair Policy

```bash
AGENT_PROTOCOL_REPAIR_MAX_ATTEMPTS=1
AGENT_PROTOCOL_REPAIR_MAX_RAW_LENGTH=2400
```

When parsing fails, the runner:

1. Classifies the failure.
2. Stores a trimmed raw response preview on the run result.
3. Adds a visible `修复模型协议` step.
4. Sends one compact repair message asking the model to return only valid JSON.
5. Stops if the repaired response is still invalid.

## Error Codes

- `non_json`: response could not be parsed as JSON.
- `top_level_not_object`: parsed JSON is not an object.
- `missing_type`: object does not contain `type=tool_call` or `type=final`.
- `invalid_tool_call`: tool call does not include a valid read-only tool name.

## Safety Boundary

Protocol repair never executes a tool by guessing. If the model still fails the
protocol after the allowed repair attempts, the runner returns a structured
failure answer and preserves the raw text for inspection.

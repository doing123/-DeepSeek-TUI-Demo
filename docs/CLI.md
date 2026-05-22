# CLI

V0.9 keeps the small terminal shell and adds provider token streaming through
the shared Agent Event Bus. It is intentionally not a full-screen TUI yet, but
the command flow now looks closer to a practical coding agent loop: run, stream,
inspect, continue, approve, validate.

V0.10 adds `npm run tui` for the first full-screen terminal interface. See
`docs/TUI.md` for the interactive keymap.

V0.12 adds local tool policy output. CLI runs now print the active read-tool
allowlist and patchProposal policy when the result includes policy metadata.

## Usage

```bash
npm run agent -- "查看当前仓库状态并给出下一步开发建议"
```

Print detailed trace entries:

```bash
npm run agent -- --trace "分析 src/lib/agent 的工具调用流程"
```

Print runner events and model token chunks while the agent is running:

```bash
npm run agent -- --stream "分析当前仓库状态"
```

Ask before applying a returned patch proposal:

```bash
npm run agent -- --apply "实现一个小改动"
```

Run whitelisted validation commands after the agent run:

```bash
npm run agent -- --validate typecheck "检查类型风险"
npm run agent -- --validate all "实现并验证一个改动"
```

List saved runs:

```bash
npm run agent -- --recent
```

Show one saved run:

```bash
npm run agent -- --show <run-id>
```

Continue from one saved run:

```bash
npm run agent -- --continue <run-id> "继续上一轮任务，先确认当前未提交改动"
```

Print JSON:

```bash
npm run agent -- --json "查看当前仓库有哪些风险"
```

## Design Notes

- The CLI imports `src/lib/agent/runner.ts` directly through the `tsx` Node loader.
- It loads `.env.local` and `.env` before running the agent so DeepSeek config
  works outside Next.js.
- It saves runs to `.agent-runs` by default, matching the browser workbench.
- `--stream` enables the runner event bus and asks DeepSeek for streaming
  completions when `DEEPSEEK_API_KEY` is configured.
- `--continue <run-id>` reads a saved run and passes a compact summary of its
  visible result, patch metadata, and validation history into the next prompt.
- Patch proposals can be applied from the terminal with `--apply`, but only after
  explicit user approval. The CLI reuses the same path and action validation as
  the browser patch API.
- Validation commands are still whitelist-only: `typecheck`, `build`, or `all`.
- Git context is exposed through the fixed read-only `git_status` tool.
- Tool policy is controlled by `AGENT_ALLOWED_READ_TOOLS` and
  `AGENT_PATCH_PROPOSAL`. The prompt and runner use the same policy snapshot.

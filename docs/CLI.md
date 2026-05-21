# CLI

V0.7 keeps the small terminal shell from V0.6 and adds high-level streaming,
terminal patch approval, and whitelist validation chaining. It is intentionally
not a full-screen TUI yet.

## Usage

```bash
npm run agent -- "查看当前仓库状态并给出下一步开发建议"
```

Print detailed trace entries:

```bash
npm run agent -- --trace "分析 src/lib/agent 的工具调用流程"
```

Print high-level step events while the agent is running:

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

Print JSON:

```bash
npm run agent -- --json "查看当前仓库有哪些风险"
```

## Design Notes

- The CLI imports `src/lib/agent/runner.ts` directly through the `tsx` Node loader.
- It loads `.env.local` and `.env` before running the agent so DeepSeek config
  works outside Next.js.
- It saves runs to `.agent-runs` by default, matching the browser workbench.
- Patch proposals can be applied from the terminal with `--apply`, but only after
  explicit user approval. The CLI reuses the same path and action validation as
  the browser patch API.
- Validation commands are still whitelist-only: `typecheck`, `build`, or `all`.
- Git context is exposed through the fixed read-only `git_status` tool.

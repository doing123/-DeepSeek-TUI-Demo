# CLI

V0.6 adds a small terminal shell that runs the same agent kernel as the browser
workbench. It is intentionally not a full-screen TUI yet.

## Usage

```bash
npm run agent -- "查看当前仓库状态并给出下一步开发建议"
```

Print detailed trace entries:

```bash
npm run agent -- --trace "分析 src/lib/agent 的工具调用流程"
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
- Patch proposals are preview-only in the terminal for now. Applying patches
  still goes through the existing browser approval flow.
- Git context is exposed through the fixed read-only `git_status` tool.

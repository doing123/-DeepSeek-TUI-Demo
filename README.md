# DeepSeek TUI Demo

一个用 Next.js、TypeScript 和 DeepSeek 学习 agent 编码工具的最小实现。

> Environment: macOS first

## Purpose

- 参考 opencode、DeepSeek-TUI、openclaude 的方向，先做一个容易理解的 agent 编码工作台。
- 把 agent 拆成 UI、API、模型 provider、工作区工具、运行 trace、文档生成几个小模块。
- 优先学习 agent 的控制流，而不是一开始追求完整 IDE 或复杂 TUI。

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 and run a goal from the workbench.

## Architecture

- **Next.js App**: 负责输入任务、展示 agent trace、展示结构化建议。
- **API Route**: 运行在 Node.js 服务端，读取环境变量和本地仓库。
- **Agent Runner**: 组织任务理解、仓库扫描、LLM 调用、结果解析。
- **DeepSeek Provider**: 封装 OpenAI-compatible chat completions 请求，默认使用 DeepSeek。
- **Workspace Tools**: 当前支持安全只读扫描，后续扩展 read_file、write_patch、run_command。
- **README Generator**: 从项目规划数据和 package scripts 生成 README，并由 pre-commit hook 自动执行。

## Current Features

- Next.js + TypeScript 项目骨架。
- 浏览器工作台：输入目标、运行 agent、查看步骤摘要和建议。
- 服务端 API：POST /api/agent。
- DeepSeek provider：读取 DEEPSEEK_API_KEY、DEEPSEEK_BASE_URL、DEEPSEEK_MODEL。
- 离线模式：没有 API key 时仍能返回本地规划结果。
- 工作区扫描：忽略 .git、node_modules、.next，读取文本文件摘要。
- 自动 README：pre-commit 时运行 npm run readme:generate 并自动 git add README.md。
- 独立开发上下文：docs/DEVELOPMENT_CONTEXT.md 记录参考项目、实现取舍和下一版 prompt。
- 独立变更日志：CHANGELOG.md 记录每个版本新增内容和限制。

## DeepSeek

- Base URL: `https://api.deepseek.com`
- Default model: `deepseek-v4-flash`

- DeepSeek API 使用 OpenAI-compatible chat completions 格式。
- deepseek-chat 和 deepseek-reasoner 在官方文档中标注将于 2026-07-24 弃用；本项目默认使用 deepseek-v4-flash，并允许通过 DEEPSEEK_MODEL 覆盖。
- 可通过 DEEPSEEK_THINKING=enabled 为支持的模型开启 thinking 参数；UI 只展示高层步骤摘要。

Sources:
- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/zh-cn/

## Implementation Thinking

- 先做 Web 版而不是 TUI，是因为用户希望用 TS 和 Next 学习，浏览器 UI 更利于快速观察 agent 状态。
- V0 只读仓库，先把 agent loop 跑通；写文件和跑命令会放到人工确认之后。
- LLM 输出要求结构化 JSON，这样 UI 和后续自动化都更稳定。
- 保留的是高层实现步骤与取舍，不记录逐字隐藏推理。
- DeepSeek 逻辑独立成 provider，后续可以平滑加入 OpenAI、Claude、本地模型或 OpenRouter。
- 下一步从 one-shot 仓库快照升级到显式 read-only tool loop，再进入补丁预览和人工审批。

## Development Context

- `docs/DEVELOPMENT_CONTEXT.md`: 下一版本开发时优先阅读的上下文、参考项目摘要和 prompt。
- `CHANGELOG.md`: 按版本记录功能、限制和重要取舍。

## Roadmap

### V0.1 · 只读 agent 工作台

- 任务输入
- 仓库扫描
- DeepSeek 调用
- 结构化建议
- README 自动生成

### V0.2 · 工具调用雏形

- list_files/read_file 显式工具协议
- 模型多轮选择工具
- token 预算与文件摘录策略
- 更完整的错误提示

### V0.3 · 补丁预览

- 生成 unified diff
- 人工确认后 apply patch
- 变更文件列表
- 失败回滚提示

### V0.4 · 命令执行与验证

- macOS shell 命令白名单
- npm run typecheck/build
- 测试结果回填给模型
- 安全边界说明

### V0.5 · 接近真实 coding agent

- 会话历史
- 项目索引
- 多 provider
- 文件级权限
- 任务检查点

## Scripts

- `dev`: `next dev`
- `build`: `next build`
- `start`: `next start`
- `typecheck`: `tsc --noEmit`
- `readme:generate`: `node scripts/generate-readme.mjs`
- `hooks:install`: `node scripts/install-git-hooks.mjs`
- `prepare`: `node scripts/install-git-hooks.mjs`

## README Automation

This README is generated from `docs/project-plan.json` and `package.json`.

The repository uses `.githooks/pre-commit` to run:

```bash
npm run readme:generate
git add README.md
```

If hooks are not active after cloning, run:

```bash
npm run hooks:install
```

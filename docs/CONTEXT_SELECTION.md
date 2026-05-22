# Context Selection

V0.13 adds a small, inspectable file-priority layer before prompt construction.
The goal is to make context choice visible without introducing embeddings,
databases, LSP indexes, or persistent caches yet.

## Runtime Flow

1. The runner indexes text-like workspace files within `AGENT_CONTEXT_MAX_FILES`.
2. `src/lib/agent/context-selection.ts` scores each candidate file.
3. The runner keeps the top `AGENT_CONTEXT_SELECTED_MAX_FILES` as the initial
   prompt file map.
4. The model can still call `list_files`, `search_text`, and `read_file` to
   expand beyond the initial selection.
5. The run result stores the selection strategy, candidate count, selected files,
   scores, reasons, and goal terms.

## Environment Knob

```bash
AGENT_CONTEXT_SELECTED_MAX_FILES=40
```

The value is bounded locally so accidental large values do not flood the prompt.

## Current Heuristics

The scorer is intentionally simple:

- goal terms matched against file name and path
- known concepts such as `agent`, `tool`, `tui`, `web`, `debug`, `docs`,
  `context`, `patch`, and `validation`
- core project files such as runner, prompts, tools, workbench, CLI/TUI, package
  metadata, project plan, and changelog
- light boosts for code, docs, API routes, and agent-core paths
- small penalties for very large files

Each selected file includes reasons such as `name:agent`, `concept:tui`,
`agent-core`, `docs`, or `core`.

## Why This Matters

Real coding agents spend much of their quality budget on context choice. V0.13
keeps the strategy deterministic and visible so later versions can compare it
against better retrieval approaches.

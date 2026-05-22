import type { ContextBudget } from "./types";

// Central context budget used by the runner and tools.
// These knobs make context pressure explicit before the project grows more
// tools or larger file-selection strategies.
export function getContextBudget(env: NodeJS.ProcessEnv = process.env): ContextBudget {
  return {
    maxWorkspaceFiles: readBoundedInt(env.AGENT_CONTEXT_MAX_FILES, 160, 20, 500),
    maxReadLength: readBoundedInt(env.AGENT_CONTEXT_READ_MAX_LENGTH, 12_000, 1_000, 40_000),
    maxSearchFiles: readBoundedInt(env.AGENT_CONTEXT_SEARCH_MAX_FILES, 240, 20, 800),
    maxSearchMatches: readBoundedInt(env.AGENT_CONTEXT_SEARCH_MAX_MATCHES, 24, 1, 100),
    maxToolOutputLength: readBoundedInt(env.AGENT_CONTEXT_TOOL_OUTPUT_MAX_LENGTH, 1400, 400, 8000)
  };
}

export function describeContextBudget(budget: ContextBudget) {
  return [
    `files<=${budget.maxWorkspaceFiles}`,
    `read<=${budget.maxReadLength}`,
    `searchFiles<=${budget.maxSearchFiles}`,
    `matches<=${budget.maxSearchMatches}`,
    `toolOutput<=${budget.maxToolOutputLength}`
  ].join(" / ");
}

function readBoundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

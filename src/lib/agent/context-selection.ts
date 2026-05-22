import path from "path";
import type {
  ContextSelectedFile,
  ContextSelection,
  WorkspaceFile
} from "./types";

type GoalConcept = {
  label: string;
  matches: string[];
  pathHints: string[];
};

const GOAL_CONCEPTS: GoalConcept[] = [
  {
    label: "agent",
    matches: ["agent", "代理", "智能体", "编码工具"],
    pathHints: ["agent", "runner", "prompts", "tools"]
  },
  {
    label: "deepseek",
    matches: ["deepseek", "模型", "llm", "provider"],
    pathHints: ["deepseek", "provider", "prompts"]
  },
  {
    label: "tool",
    matches: ["tool", "工具", "调用"],
    pathHints: ["tools", "tool-policy", "workspace"]
  },
  {
    label: "tui",
    matches: ["tui", "terminal", "终端", "命令行"],
    pathHints: ["tui", "cli"]
  },
  {
    label: "web",
    matches: ["web", "页面", "浏览器", "ui", "样式"],
    pathHints: ["components", "app", "globals.css"]
  },
  {
    label: "debug",
    matches: ["debug", "调试", "断点", "inspect"],
    pathHints: ["debug", "launch", "next.config"]
  },
  {
    label: "docs",
    matches: ["版本", "规划", "文档", "readme", "changelog", "架构图"],
    pathHints: ["docs", "readme", "changelog", "project-plan", "architecture"]
  },
  {
    label: "context",
    matches: ["context", "上下文", "预算", "选择", "优先级"],
    pathHints: ["context", "workspace", "runner", "prompts"]
  },
  {
    label: "patch",
    matches: ["patch", "补丁", "写入", "修改"],
    pathHints: ["patch", "validation", "agent"]
  },
  {
    label: "validation",
    matches: ["validate", "validation", "验证", "build", "typecheck"],
    pathHints: ["validate", "validation", "package.json"]
  }
];

const CORE_PATH_HINTS = [
  "src/lib/agent/runner.ts",
  "src/lib/agent/prompts.ts",
  "src/lib/agent/tools.ts",
  "src/lib/agent/workspace.ts",
  "src/lib/agent/deepseek.ts",
  "src/components/AgentWorkbench.tsx",
  "src/cli/agent.ts",
  "src/cli/tui.ts",
  "docs/project-plan.json",
  "docs/DEVELOPMENT_CONTEXT.md",
  "CHANGELOG.md",
  "package.json"
];

// Selects the initial prompt file map from the broader workspace index.
// This is intentionally heuristic and inspectable: V0.13 teaches context
// selection before introducing embeddings, LSP indexes, or persistent caches.
export function selectContextFiles(
  goal: string,
  files: WorkspaceFile[],
  options: { maxFiles: number }
): ContextSelection {
  const goalTerms = extractGoalTerms(goal);
  const scored = files
    .map((file) => scoreFile(file, goal, goalTerms))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  const selected = scored.slice(0, options.maxFiles);

  return {
    strategy: "heuristic-v1",
    candidateCount: files.length,
    maxSelectedFiles: options.maxFiles,
    selectedCount: selected.length,
    goalTerms,
    files: selected
  };
}

export function describeContextSelection(selection: ContextSelection) {
  const topFiles = selection.files.slice(0, 5).map((file) => file.path).join(", ");
  const terms = selection.goalTerms.slice(0, 8).join(", ") || "none";

  return [
    `${selection.strategy}`,
    `selected=${selection.selectedCount}/${selection.candidateCount}`,
    `limit=${selection.maxSelectedFiles}`,
    `terms=[${terms}]`,
    `top=[${topFiles || "none"}]`
  ].join(" / ");
}

function scoreFile(
  file: WorkspaceFile,
  goal: string,
  goalTerms: string[]
): ContextSelectedFile {
  const normalizedPath = normalize(file.path);
  const baseName = normalize(path.basename(file.path));
  const reasons: string[] = [];
  let score = 0;

  for (const term of goalTerms) {
    if (baseName.includes(term)) {
      score += 28;
      addReason(reasons, `name:${term}`);
    } else if (normalizedPath.includes(term)) {
      score += 18;
      addReason(reasons, `path:${term}`);
    }
  }

  for (const concept of matchingConcepts(goal)) {
    if (concept.pathHints.some((hint) => normalizedPath.includes(normalize(hint)))) {
      score += 20;
      addReason(reasons, `concept:${concept.label}`);
    }
  }

  if (CORE_PATH_HINTS.some((hint) => normalizedPath === normalize(hint))) {
    score += 16;
    addReason(reasons, "core");
  }

  const extension = path.extname(file.path);
  if ([".ts", ".tsx", ".mjs", ".js"].includes(extension)) {
    score += 9;
    addReason(reasons, "code");
  } else if ([".md", ".json"].includes(extension)) {
    score += 6;
    addReason(reasons, "project-context");
  } else if ([".css"].includes(extension)) {
    score += 4;
    addReason(reasons, "style");
  }

  if (normalizedPath.startsWith("src/lib/agent/")) {
    score += 10;
    addReason(reasons, "agent-core");
  }

  if (normalizedPath.startsWith("src/app/api/")) {
    score += 7;
    addReason(reasons, "api");
  }

  if (normalizedPath.startsWith("docs/")) {
    score += 4;
    addReason(reasons, "docs");
  }

  if (file.size > 160_000) {
    score -= 18;
    addReason(reasons, "large-file");
  } else if (file.size > 64_000) {
    score -= 8;
    addReason(reasons, "medium-file");
  }

  return {
    ...file,
    score,
    reasons: reasons.length > 0 ? reasons.slice(0, 6) : ["fallback"]
  };
}

function extractGoalTerms(goal: string) {
  const asciiTerms = normalize(goal)
    .split(/[^a-z0-9_.-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term));
  const conceptTerms = matchingConcepts(goal).map((concept) => concept.label);

  return unique([...asciiTerms, ...conceptTerms]).slice(0, 20);
}

function matchingConcepts(goal: string) {
  const normalizedGoal = normalize(goal);
  return GOAL_CONCEPTS.filter((concept) =>
    concept.matches.some((match) => normalizedGoal.includes(normalize(match)))
  );
}

function normalize(value: string) {
  return value.toLowerCase().replaceAll("\\", "/");
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "then",
  "next",
  "version",
  "please"
]);

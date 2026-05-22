import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import type {
  PatchApplyResult,
  PatchDiffPreview,
  PatchFileChange,
  PatchFileDiffPreview,
  PatchProposal
} from "./types";
import { resolveWorkspaceWriteFile } from "./workspace";

// Patch proposals use full-file create/replace operations instead of arbitrary
// shell commands or free-form diffs. That keeps V0.3 easy to inspect and safe to
// apply after human approval.
const MAX_PATCH_FILES = 8;
const MAX_FILE_CONTENT_LENGTH = 80_000;
const MAX_TOTAL_CONTENT_LENGTH = 300_000;
const MAX_EXACT_DIFF_CELLS = 120_000;
const MAX_PREVIEW_LINES = 100;

type PreparedPatchFile = {
  change: PatchFileChange;
  absolutePath: string;
};

type DiffOperation = {
  type: "equal" | "add" | "delete";
  line: string;
};

export function normalizePatchProposal(value: unknown): PatchProposal | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const summary = readString(value.summary, "模型提出了一个补丁。");
  const files = Array.isArray(value.files)
    ? value.files
        .map(normalizePatchFileChange)
        .filter((file): file is PatchFileChange => Boolean(file))
    : [];

  if (files.length === 0) {
    return undefined;
  }

  return {
    summary,
    files
  };
}

// Applies a model-proposed patch only after the caller has explicitly approved
// it. Every file is revalidated here so the browser cannot bypass path checks.
export async function applyPatchProposal(
  workspaceRoot: string,
  proposal: unknown
): Promise<PatchApplyResult> {
  const normalized = normalizePatchProposal(proposal);

  if (!normalized) {
    return {
      ok: false,
      appliedFiles: [],
      errors: ["Patch proposal is missing or invalid."]
    };
  }

  const prepared = await preparePatchFiles(workspaceRoot, normalized);

  if (prepared.errors.length > 0) {
    return {
      ok: false,
      appliedFiles: [],
      errors: prepared.errors
    };
  }

  const appliedFiles: string[] = [];
  const errors: string[] = [];

  for (const item of prepared.files) {
    try {
      await mkdir(path.dirname(item.absolutePath), { recursive: true });
      await writeFile(item.absolutePath, item.change.content, "utf8");
      appliedFiles.push(item.change.path);
    } catch (error) {
      errors.push(
        `${item.change.path}: ${error instanceof Error ? error.message : "Write failed."}`
      );
    }
  }

  return {
    ok: errors.length === 0,
    appliedFiles,
    errors
  };
}

// Builds a write-review preview without changing the workspace.
// The preview is intentionally compact: enough line counts and hunk context for
// human review, while full content remains in the explicit patchProposal.
export async function previewPatchProposal(
  workspaceRoot: string,
  proposal: unknown
): Promise<PatchDiffPreview | undefined> {
  const normalized = normalizePatchProposal(proposal);

  if (!normalized) {
    return undefined;
  }

  const prepared = await preparePatchFiles(workspaceRoot, normalized);
  const files: PatchFileDiffPreview[] = [];

  for (const item of prepared.files) {
    const before = await readExistingFile(item.absolutePath);
    const diff = buildFileDiffPreview(item.change, before.content, before.exists);
    files.push(diff);
  }

  const totalAdditions = files.reduce((total, file) => total + file.additions, 0);
  const totalDeletions = files.reduce((total, file) => total + file.deletions, 0);

  return {
    summary: normalized.summary,
    generatedAt: new Date().toISOString(),
    ok: prepared.errors.length === 0,
    fileCount: normalized.files.length,
    totalAdditions,
    totalDeletions,
    files,
    errors: prepared.errors
  };
}

// Performs all safety checks before writing any file, so partial writes only
// happen after the complete proposal passes validation.
async function preparePatchFiles(workspaceRoot: string, proposal: PatchProposal) {
  const errors: string[] = [];
  const files: PreparedPatchFile[] = [];

  if (proposal.files.length > MAX_PATCH_FILES) {
    errors.push(`Patch can include at most ${MAX_PATCH_FILES} files.`);
  }

  const totalContentLength = proposal.files.reduce((total, file) => total + file.content.length, 0);

  if (totalContentLength > MAX_TOTAL_CONTENT_LENGTH) {
    errors.push(`Patch content cannot exceed ${MAX_TOTAL_CONTENT_LENGTH} characters.`);
  }

  const seenPaths = new Set<string>();

  for (const change of proposal.files) {
    if (seenPaths.has(change.path)) {
      errors.push(`${change.path}: duplicate file change.`);
      continue;
    }

    seenPaths.add(change.path);

    if (change.content.length > MAX_FILE_CONTENT_LENGTH) {
      errors.push(`${change.path}: file content exceeds ${MAX_FILE_CONTENT_LENGTH} characters.`);
      continue;
    }

    try {
      const safePath = await resolveWorkspaceWriteFile(workspaceRoot, change.path);
      const exists = await fileExists(safePath.absolutePath);

      if (change.action === "create" && exists) {
        errors.push(`${change.path}: create action cannot overwrite an existing file.`);
        continue;
      }

      if (change.action === "replace" && !exists) {
        errors.push(`${change.path}: replace action requires an existing file.`);
        continue;
      }

      files.push({
        change: {
          ...change,
          path: safePath.relativePath
        },
        absolutePath: safePath.absolutePath
      });
    } catch (error) {
      errors.push(`${change.path}: ${error instanceof Error ? error.message : "Invalid path."}`);
    }
  }

  return {
    files,
    errors
  };
}

function buildFileDiffPreview(
  change: PatchFileChange,
  beforeContent: string,
  exists: boolean
): PatchFileDiffPreview {
  const beforeLines = splitLines(beforeContent);
  const afterLines = splitLines(change.content);
  const diffWindow = findChangedWindow(beforeLines, afterLines);
  const beforeChangedEnd = Math.max(diffWindow.commonPrefix, beforeLines.length - diffWindow.commonSuffix);
  const afterChangedEnd = Math.max(diffWindow.commonPrefix, afterLines.length - diffWindow.commonSuffix);
  const operations = buildLineDiffOperations(
    beforeLines.slice(diffWindow.commonPrefix, beforeChangedEnd),
    afterLines.slice(diffWindow.commonPrefix, afterChangedEnd)
  );
  const previewLines = renderPreviewLines(beforeLines, afterLines, diffWindow, operations);
  const additions = operations.filter((operation) => operation.type === "add").length;
  const deletions = operations.filter((operation) => operation.type === "delete").length;

  return {
    path: change.path,
    action: change.action,
    exists,
    beforeLineCount: beforeLines.length,
    afterLineCount: afterLines.length,
    additions,
    deletions,
    previewLines,
    risks: buildDiffRisks(change, exists, additions, deletions, beforeLines.length),
    explanation: change.explanation
  };
}

function buildDiffRisks(
  change: PatchFileChange,
  exists: boolean,
  additions: number,
  deletions: number,
  beforeLineCount: number
) {
  const risks: string[] = [];

  if (change.action === "create") {
    risks.push("creates-new-file");
  }

  if (change.action === "replace") {
    risks.push("replaces-full-file");
  }

  if (!exists && change.action === "replace") {
    risks.push("target-missing");
  }

  if (exists && change.action === "create") {
    risks.push("target-exists");
  }

  if (beforeLineCount > 0 && deletions / beforeLineCount > 0.6) {
    risks.push("large-deletion");
  }

  if (additions + deletions > 240) {
    risks.push("large-change");
  }

  return risks.length > 0 ? risks : ["low-change-scope"];
}

function findChangedWindow(beforeLines: string[], afterLines: string[]) {
  let commonPrefix = 0;

  while (
    commonPrefix < beforeLines.length &&
    commonPrefix < afterLines.length &&
    beforeLines[commonPrefix] === afterLines[commonPrefix]
  ) {
    commonPrefix += 1;
  }

  let commonSuffix = 0;

  while (
    commonSuffix + commonPrefix < beforeLines.length &&
    commonSuffix + commonPrefix < afterLines.length &&
    beforeLines[beforeLines.length - commonSuffix - 1] === afterLines[afterLines.length - commonSuffix - 1]
  ) {
    commonSuffix += 1;
  }

  return {
    commonPrefix,
    commonSuffix
  };
}

function renderPreviewLines(
  beforeLines: string[],
  afterLines: string[],
  window: { commonPrefix: number; commonSuffix: number },
  operations: DiffOperation[]
) {
  if (operations.length === 0) {
    return [" no textual changes"];
  }

  const contextBeforeStart = Math.max(0, window.commonPrefix - 3);
  const afterChangedEnd = Math.max(window.commonPrefix, afterLines.length - window.commonSuffix);
  const contextAfterEnd = Math.min(afterLines.length, afterChangedEnd + 3);
  const lines: string[] = [];

  if (contextBeforeStart > 0) {
    lines.push("...");
  }

  for (const line of beforeLines.slice(contextBeforeStart, window.commonPrefix)) {
    lines.push(` ${line}`);
  }

  for (const operation of operations.slice(0, MAX_PREVIEW_LINES)) {
    lines.push(formatDiffOperation(operation));
  }

  if (operations.length > MAX_PREVIEW_LINES) {
    lines.push("...");
  }

  for (const line of afterLines.slice(afterChangedEnd, contextAfterEnd)) {
    lines.push(` ${line}`);
  }

  if (contextAfterEnd < afterLines.length) {
    lines.push("...");
  }

  return lines.length > 0 ? lines : [" no textual changes"];
}

function buildLineDiffOperations(beforeLines: string[], afterLines: string[]): DiffOperation[] {
  if (beforeLines.length === 0) {
    return afterLines.map((line) => ({ type: "add", line }));
  }

  if (afterLines.length === 0) {
    return beforeLines.map((line) => ({ type: "delete", line }));
  }

  if (beforeLines.length * afterLines.length > MAX_EXACT_DIFF_CELLS) {
    return [
      ...beforeLines.map((line) => ({ type: "delete" as const, line })),
      ...afterLines.map((line) => ({ type: "add" as const, line }))
    ];
  }

  const lcs = Array.from({ length: beforeLines.length + 1 }, () =>
    new Uint32Array(afterLines.length + 1)
  );

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lcs[beforeIndex][afterIndex] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? lcs[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(lcs[beforeIndex + 1][afterIndex], lcs[beforeIndex][afterIndex + 1]);
    }
  }

  const operations: DiffOperation[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      operations.push({ type: "equal", line: beforeLines[beforeIndex] });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (lcs[beforeIndex + 1][afterIndex] >= lcs[beforeIndex][afterIndex + 1]) {
      operations.push({ type: "delete", line: beforeLines[beforeIndex] });
      beforeIndex += 1;
      continue;
    }

    operations.push({ type: "add", line: afterLines[afterIndex] });
    afterIndex += 1;
  }

  while (beforeIndex < beforeLines.length) {
    operations.push({ type: "delete", line: beforeLines[beforeIndex] });
    beforeIndex += 1;
  }

  while (afterIndex < afterLines.length) {
    operations.push({ type: "add", line: afterLines[afterIndex] });
    afterIndex += 1;
  }

  return operations;
}

function formatDiffOperation(operation: DiffOperation) {
  if (operation.type === "add") {
    return `+${operation.line}`;
  }

  if (operation.type === "delete") {
    return `-${operation.line}`;
  }

  return ` ${operation.line}`;
}

function splitLines(content: string) {
  if (!content) {
    return [];
  }

  return content.replace(/\n$/, "").split(/\r?\n/);
}

async function readExistingFile(absolutePath: string) {
  try {
    return {
      exists: true,
      content: await readFile(absolutePath, "utf8")
    };
  } catch {
    return {
      exists: false,
      content: ""
    };
  }
}

async function fileExists(absolutePath: string) {
  try {
    const fileStat = await stat(absolutePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

function normalizePatchFileChange(value: unknown): PatchFileChange | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const pathValue = readString(value.path, "");
  const content = readContentString(value.content);
  const action = readPatchAction(value.action);

  if (!pathValue || !content || !action) {
    return undefined;
  }

  return {
    path: pathValue,
    action,
    content,
    explanation: readString(value.explanation, "")
  };
}

function readPatchAction(value: unknown) {
  return value === "create" || value === "replace" ? value : undefined;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function readContentString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

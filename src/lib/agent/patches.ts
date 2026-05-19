import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import type { PatchApplyResult, PatchFileChange, PatchProposal } from "./types";
import { resolveWorkspaceWriteFile } from "./workspace";

const MAX_PATCH_FILES = 8;
const MAX_FILE_CONTENT_LENGTH = 80_000;
const MAX_TOTAL_CONTENT_LENGTH = 300_000;

type PreparedPatchFile = {
  change: PatchFileChange;
  absolutePath: string;
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

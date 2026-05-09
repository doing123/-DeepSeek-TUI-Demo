import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import type { WorkspaceFile, WorkspaceSnapshot } from "./types";

const ignoredNames = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  ".DS_Store"
]);

const textExtensions = new Set([
  "",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
]);

export async function getWorkspaceSnapshot(
  root: string,
  options: { maxFiles?: number; maxExcerptLength?: number } = {}
): Promise<WorkspaceSnapshot> {
  const maxFiles = options.maxFiles ?? 80;
  const maxExcerptLength = options.maxExcerptLength ?? 1200;
  const files: WorkspaceFile[] = [];

  await walk(root, root, files, maxFiles, maxExcerptLength);

  return {
    root,
    fileCount: files.length,
    files
  };
}

async function walk(
  root: string,
  currentDir: string,
  files: WorkspaceFile[],
  maxFiles: number,
  maxExcerptLength: number
) {
  if (files.length >= maxFiles) {
    return;
  }

  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (files.length >= maxFiles || ignoredNames.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(root, absolutePath);

    if (entry.isDirectory()) {
      await walk(root, absolutePath, files, maxFiles, maxExcerptLength);
      continue;
    }

    if (!entry.isFile() || !isTextCandidate(relativePath)) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    const file: WorkspaceFile = {
      path: relativePath,
      size: fileStat.size
    };

    if (fileStat.size <= 64_000) {
      file.excerpt = await readExcerpt(absolutePath, maxExcerptLength);
    }

    files.push(file);
  }
}

function isTextCandidate(relativePath: string) {
  const extension = path.extname(relativePath);

  if (relativePath.startsWith(".env")) {
    return true;
  }

  return textExtensions.has(extension);
}

async function readExcerpt(absolutePath: string, maxLength: number) {
  const content = await readFile(absolutePath, "utf8");
  return content.length > maxLength ? `${content.slice(0, maxLength)}\n...` : content;
}

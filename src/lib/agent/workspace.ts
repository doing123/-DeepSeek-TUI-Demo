import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import type { WorkspaceFile, WorkspaceSearchMatch, WorkspaceSnapshot } from "./types";

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

  await walk(root, root, files, {
    maxFiles,
    maxExcerptLength,
    includeExcerpts: true
  });

  return {
    root,
    fileCount: files.length,
    files
  };
}

export async function listWorkspaceFiles(
  root: string,
  options: { maxFiles?: number } = {}
): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = [];

  await walk(root, root, files, {
    maxFiles: options.maxFiles ?? 160,
    maxExcerptLength: 0,
    includeExcerpts: false
  });

  return files;
}

export async function readWorkspaceFile(
  root: string,
  relativePath: string,
  options: { maxLength?: number } = {}
) {
  const safePath = await resolveWorkspaceReadFile(root, relativePath);
  const maxLength = options.maxLength ?? 12_000;
  const content = await readFile(safePath.absolutePath, "utf8");

  return {
    path: safePath.relativePath,
    size: content.length,
    truncated: content.length > maxLength,
    content: content.length > maxLength ? content.slice(0, maxLength) : content
  };
}

export async function searchWorkspaceText(
  root: string,
  query: string,
  options: { maxMatches?: number; maxFiles?: number; maxFileSize?: number } = {}
): Promise<WorkspaceSearchMatch[]> {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    throw new Error("search_text query cannot be empty.");
  }

  const maxMatches = options.maxMatches ?? 24;
  const maxFileSize = options.maxFileSize ?? 128_000;
  const files = await listWorkspaceFiles(root, {
    maxFiles: options.maxFiles ?? 240
  });
  const matches: WorkspaceSearchMatch[] = [];

  for (const file of files) {
    if (matches.length >= maxMatches || file.size > maxFileSize) {
      continue;
    }

    const safePath = await resolveWorkspaceReadFile(root, file.path);
    const content = await readFile(safePath.absolutePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (matches.length >= maxMatches) {
        break;
      }

      if (line.toLowerCase().includes(normalizedQuery)) {
        matches.push({
          path: safePath.relativePath,
          lineNumber: index + 1,
          line: line.length > 240 ? `${line.slice(0, 240)}...` : line
        });
      }
    }
  }

  return matches;
}

export async function resolveWorkspaceWriteFile(root: string, relativePath: string) {
  const safePath = resolveWorkspacePath(root, relativePath);

  if (!isTextCandidate(safePath.relativePath)) {
    throw new Error("Only text-like workspace files can be written.");
  }

  return safePath;
}

async function walk(
  root: string,
  currentDir: string,
  files: WorkspaceFile[],
  options: {
    maxFiles: number;
    maxExcerptLength: number;
    includeExcerpts: boolean;
  }
) {
  if (files.length >= options.maxFiles) {
    return;
  }

  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (files.length >= options.maxFiles || shouldIgnoreEntry(entry.name)) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(root, absolutePath);

    if (entry.isDirectory()) {
      await walk(root, absolutePath, files, options);
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

    if (options.includeExcerpts && fileStat.size <= 64_000) {
      file.excerpt = await readExcerpt(absolutePath, options.maxExcerptLength);
    }

    files.push(file);
  }
}

async function resolveWorkspaceReadFile(root: string, relativePath: string) {
  const safePath = resolveWorkspacePath(root, relativePath);

  if (!isTextCandidate(safePath.relativePath)) {
    throw new Error("Only text-like workspace files can be read.");
  }

  const fileStat = await stat(safePath.absolutePath);

  if (!fileStat.isFile()) {
    throw new Error("Path does not point to a file.");
  }

  return safePath;
}

function resolveWorkspacePath(root: string, relativePath: string) {
  const normalizedRoot = path.resolve(root);

  if (!relativePath.trim()) {
    throw new Error("File path cannot be empty.");
  }

  if (path.isAbsolute(relativePath)) {
    throw new Error("Only workspace-relative file paths are allowed.");
  }

  const absolutePath = path.resolve(normalizedRoot, relativePath);
  const normalizedRelativePath = path.relative(normalizedRoot, absolutePath);

  if (
    normalizedRelativePath.startsWith("..") ||
    path.isAbsolute(normalizedRelativePath) ||
    normalizedRelativePath.split(path.sep).some((part) => shouldIgnoreEntry(part))
  ) {
    throw new Error("Path is outside the allowed workspace.");
  }

  return {
    absolutePath,
    relativePath: normalizedRelativePath
  };
}

function isTextCandidate(relativePath: string) {
  const extension = path.extname(relativePath);

  if (relativePath.startsWith(".env")) {
    return relativePath === ".env.example";
  }

  return textExtensions.has(extension);
}

function shouldIgnoreEntry(name: string) {
  if (ignoredNames.has(name)) {
    return true;
  }

  return name.startsWith(".env") && name !== ".env.example";
}

async function readExcerpt(absolutePath: string, maxLength: number) {
  const content = await readFile(absolutePath, "utf8");
  return content.length > maxLength ? `${content.slice(0, maxLength)}\n...` : content;
}

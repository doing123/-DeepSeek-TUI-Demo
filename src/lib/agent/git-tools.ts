import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 8_000;
const GIT_MAX_BUFFER = 256_000;

export type GitStatusSummary = {
  branch: string;
  statusShort: string;
  diffStat: string;
  recentCommits: string;
};

// Collects read-only Git context for the agent.
// The command list is intentionally fixed so model output cannot become shell input.
export async function getGitStatusSummary(workspaceRoot: string): Promise<GitStatusSummary> {
  const [statusShort, diffStat, recentCommits] = await Promise.all([
    runGit(workspaceRoot, ["status", "--short", "--branch"]),
    runGit(workspaceRoot, ["diff", "--stat"]),
    runGit(workspaceRoot, ["log", "--oneline", "-5"])
  ]);

  return {
    branch: readBranch(statusShort),
    statusShort: statusShort || "clean",
    diffStat: diffStat || "No unstaged diff.",
    recentCommits: recentCommits || "No commits found."
  };
}

async function runGit(workspaceRoot: string, args: string[]) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: workspaceRoot,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER
  });

  return stdout.trim();
}

function readBranch(statusShort: string) {
  const firstLine = statusShort.split("\n").find(Boolean);

  if (!firstLine?.startsWith("## ")) {
    return "unknown";
  }

  return firstLine.replace(/^##\s+/, "").trim();
}

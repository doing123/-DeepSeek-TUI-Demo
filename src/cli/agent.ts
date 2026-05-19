import { readFile } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import type {
  AgentRunRecord,
  AgentRunResult,
  AgentRunSummary,
  StoredAgentRunResult
} from "../lib/agent/types";

type CliOptions = {
  cwd: string;
  goal: string;
  json: boolean;
  noSave: boolean;
  recent: boolean;
  recentLimit: number;
  showRunId?: string;
  trace: boolean;
  help: boolean;
};

// Terminal entrypoint for the same agent kernel used by the browser workbench.
// Keeping it small makes the terminal flow easy to study before introducing a full TUI.
async function main() {
  const options = await parseArgs(process.argv.slice(2));
  const workspaceRoot = path.resolve(options.cwd);

  if (options.help) {
    printHelp();
    return;
  }

  await loadLocalEnv(workspaceRoot);

  if (options.recent) {
    const { listAgentRunSummaries } = await import("../lib/agent/run-store");
    const summaries = await listAgentRunSummaries(workspaceRoot);
    printRecentRuns(summaries.slice(0, options.recentLimit), options);
    return;
  }

  if (options.showRunId) {
    const { readAgentRunRecord } = await import("../lib/agent/run-store");
    const record = await readAgentRunRecord(workspaceRoot, options.showRunId);

    if (!record) {
      throw new Error(`Run not found: ${options.showRunId}`);
    }

    printRunRecord(record, options);
    return;
  }

  if (!options.goal) {
    throw new Error("Please provide a goal, or pass --help for usage.");
  }

  const [{ runCodingAgent }, { saveAgentRunRecord }] = await Promise.all([
    import("../lib/agent/runner"),
    import("../lib/agent/run-store")
  ]);

  printHeader(options.goal, workspaceRoot, options);
  const result = await runCodingAgent({
    goal: options.goal,
    workspaceRoot
  });

  if (!options.noSave) {
    await saveAgentRunRecord(workspaceRoot, result);
  }

  printAgentResult(result, options);
  printSaveHint(result, options);
}

async function parseArgs(args: string[]): Promise<CliOptions> {
  const options: CliOptions = {
    cwd: process.cwd(),
    goal: "",
    json: false,
    noSave: false,
    recent: false,
    recentLimit: 10,
    trace: false,
    help: false
  };
  const goalParts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--no-save") {
      options.noSave = true;
      continue;
    }

    if (arg === "--trace") {
      options.trace = true;
      continue;
    }

    if (arg === "--recent") {
      options.recent = true;
      continue;
    }

    if (arg === "--limit") {
      options.recentLimit = readPositiveInt(args[index + 1], "--limit");
      index += 1;
      continue;
    }

    if (arg === "--show") {
      options.showRunId = readRequiredArg(args[index + 1], "--show");
      index += 1;
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = readRequiredArg(args[index + 1], "--cwd");
      index += 1;
      continue;
    }

    goalParts.push(arg);
  }

  options.goal = goalParts.join(" ").trim() || (await readGoalFromStdin());
  return options;
}

async function loadLocalEnv(workspaceRoot: string) {
  await loadEnvFile(path.join(workspaceRoot, ".env.local"));
  await loadEnvFile(path.join(workspaceRoot, ".env"));
}

// Minimal dotenv reader for CLI use.
// Next.js already loads .env.local for the web app, but the direct CLI path runs outside Next.
async function loadEnvFile(filePath: string) {
  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const value = stripEnvQuotes(valueParts.join("="));

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function printHeader(goal: string, workspaceRoot: string, options: CliOptions) {
  if (options.json) {
    return;
  }

  console.log("DeepSeek TUI Demo CLI");
  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Goal: ${goal}`);
  console.log("");
}

function printAgentResult(result: AgentRunResult | StoredAgentRunResult, options: CliOptions) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`${result.answer.title}`);
  console.log(`${result.answer.summary}`);
  console.log("");
  console.log(`Run: ${result.id}`);
  console.log(`Mode: ${result.mode}`);
  console.log(`Model: ${result.model}`);
  console.log(`Workspace files indexed: ${result.workspace.fileCount}`);
  console.log(`Tool calls: ${result.toolCallCount}`);
  console.log("");

  printList("Plan", result.answer.plan);
  printList("Files To Inspect", result.answer.filesToInspect);
  printList("Proposed Changes", result.answer.proposedChanges);
  printList("Risks", result.answer.risks);
  printList("Next Actions", result.answer.nextActions);
  printPatchProposal(result);

  if (options.trace) {
    printTrace(result);
  }
}

function printRunRecord(record: AgentRunRecord, options: CliOptions) {
  if (options.json) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  printAgentResult(record.result, options);

  if (record.patchProposalMeta) {
    console.log("");
    console.log("Saved Patch Metadata");
    console.log(`- ${record.patchProposalMeta.summary}`);
    for (const file of record.patchProposalMeta.files) {
      console.log(`- ${file.action}: ${file.path}${file.explanation ? ` - ${file.explanation}` : ""}`);
    }
  }

  if (record.validations.length > 0) {
    console.log("");
    console.log("Validations");
    for (const validation of record.validations) {
      console.log(
        `- ${validation.ok ? "ok" : "failed"} ${validation.displayCommand} (${validation.durationMs}ms)`
      );
    }
  }
}

function printRecentRuns(summaries: AgentRunSummary[], options: CliOptions) {
  if (options.json) {
    console.log(JSON.stringify(summaries, null, 2));
    return;
  }

  if (summaries.length === 0) {
    console.log("No saved runs yet.");
    return;
  }

  console.log("Recent Runs");
  for (const item of summaries) {
    console.log(`- ${item.id}`);
    console.log(`  ${item.title}`);
    console.log(`  ${item.mode} / ${item.model} / tools=${item.toolCallCount} / patches=${item.patchFileCount}`);
    console.log(`  ${item.goal}`);
  }
}

function printPatchProposal(result: AgentRunResult | StoredAgentRunResult) {
  const proposal = "patchProposal" in result.answer ? result.answer.patchProposal : undefined;

  if (!proposal) {
    return;
  }

  console.log("");
  console.log("Patch Proposal (preview only)");
  console.log(`- ${proposal.summary}`);
  for (const file of proposal.files) {
    console.log(`- ${file.action}: ${file.path}${file.explanation ? ` - ${file.explanation}` : ""}`);
  }
}

function printTrace(result: AgentRunResult) {
  console.log("");
  console.log("Trace");
  for (const [index, step] of result.steps.entries()) {
    console.log(`${index + 1}. [${step.ok === false ? "failed" : "ok"}] ${step.title}`);
    console.log(`   ${step.detail}`);

    if (step.toolName) {
      console.log(`   tool=${step.toolName}`);
    }

    if (step.toolOutput) {
      console.log(`   output=${step.toolOutput}`);
    }
  }
}

function printSaveHint(result: AgentRunResult, options: CliOptions) {
  if (options.json || options.noSave) {
    return;
  }

  console.log("");
  console.log(`Saved run. Reopen it with: npm run agent -- --show ${result.id}`);
}

function printList(title: string, items: string[]) {
  if (items.length === 0) {
    return;
  }

  console.log(title);
  for (const item of items) {
    console.log(`- ${item}`);
  }
  console.log("");
}

function printHelp() {
  console.log(`DeepSeek TUI Demo CLI

Usage:
  npm run agent -- "summarize this repo"
  npm run agent -- --trace "inspect the validation flow"
  npm run agent -- --recent
  npm run agent -- --show <run-id>

Options:
  --cwd <path>     Workspace root. Defaults to the current directory.
  --json           Print machine-readable JSON.
  --no-save        Do not persist this run to .agent-runs.
  --trace          Print detailed agent trace entries.
  --recent         List recent saved runs.
  --limit <n>      Limit --recent output. Defaults to 10.
  --show <run-id>  Show one saved run.
  -h, --help       Show this help.
`);
}

async function readGoalFromStdin() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

function readRequiredArg(value: string | undefined, flag: string) {
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function readPositiveInt(value: string | undefined, flag: string) {
  const parsed = Number.parseInt(readRequiredArg(value, flag), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number.`);
  }

  return parsed;
}

function stripEnvQuotes(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

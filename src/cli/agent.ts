import { readFile } from "fs/promises";
import path from "path";
import { createInterface } from "readline/promises";
import { pathToFileURL } from "url";
import { describeContextBudget } from "../lib/agent/context-budget";
import { buildResumePromptGoal, formatResumeTitle } from "../lib/agent/resume";
import type {
  AgentRunEvent,
  AgentRunRecord,
  AgentRunResult,
  AgentRunSummary,
  PatchApplyResult,
  StoredAgentRunResult,
  ValidationCommandName,
  ValidationRunResult
} from "../lib/agent/types";

type CliOptions = {
  apply: boolean;
  cwd: string;
  goal: string;
  json: boolean;
  noSave: boolean;
  recent: boolean;
  recentLimit: number;
  continueRunId?: string;
  showRunId?: string;
  stream: boolean;
  trace: boolean;
  validate: ValidationCommandName[];
  yes: boolean;
  help: boolean;
};

type CliPatchApplyResult = PatchApplyResult & {
  skipped?: boolean;
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

  const [
    { runCodingAgent },
    { saveAgentRunRecord, appendValidationToRun, readAgentRunRecord }
  ] = await Promise.all([import("../lib/agent/runner"), import("../lib/agent/run-store")]);
  const resumeRecord = options.continueRunId
    ? await readAgentRunRecord(workspaceRoot, options.continueRunId)
    : null;

  if (options.continueRunId && !resumeRecord) {
    throw new Error(`Run not found for --continue: ${options.continueRunId}`);
  }

  const promptGoal = resumeRecord
    ? buildResumePromptGoal(options.goal, resumeRecord)
    : options.goal;

  printHeader(options.goal, workspaceRoot, options, resumeRecord ?? undefined);
  const result = await runCodingAgent({
    goal: options.goal,
    promptGoal,
    resumeFromRunId: resumeRecord?.id,
    streamModel: options.stream,
    workspaceRoot,
    onEvent: options.stream && !options.json ? printRunEvent : undefined
  });
  let saved = false;

  if (!options.noSave) {
    await saveAgentRunRecord(workspaceRoot, result);
    saved = true;
  }

  if (!options.json) {
    printAgentResult(result, options);
  }

  const patchResult = await maybeApplyPatch(workspaceRoot, result, options);
  const validations = await runRequestedValidations(workspaceRoot, options);

  if (saved) {
    for (const validation of validations) {
      await appendValidationToRun(workspaceRoot, result.id, validation);
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ result, patchResult, validations }, null, 2));
    return;
  }

  printPatchApplyResult(patchResult, options);
  printValidationResults(validations, options);
  printSaveHint(result, options);
}

async function parseArgs(args: string[]): Promise<CliOptions> {
  const options: CliOptions = {
    apply: false,
    cwd: process.cwd(),
    goal: "",
    json: false,
    noSave: false,
    recent: false,
    recentLimit: 10,
    stream: false,
    trace: false,
    validate: [],
    yes: false,
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

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }

    if (arg === "--stream") {
      options.stream = true;
      continue;
    }

    if (arg === "--trace") {
      options.trace = true;
      continue;
    }

    if (arg === "--validate") {
      options.validate = readValidationTargets(args[index + 1]);
      index += 1;
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

    if (arg === "--continue") {
      options.continueRunId = readRequiredArg(args[index + 1], "--continue");
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

function printRunEvent(event: AgentRunEvent) {
  if (event.type === "run_started") {
    console.log(`== run started: ${event.startedAt}`);
    return;
  }

  if (event.type === "step_started") {
    console.log(`-> ${event.step.title}`);
    return;
  }

  if (event.type === "step_completed") {
    console.log(`<- ${event.step.title}: ${event.step.detail}`);
    return;
  }

  if (event.type === "model_stream_started") {
    console.log(`~~ streaming ${event.model} turn ${event.turn}`);
    return;
  }

  if (event.type === "model_token") {
    process.stdout.write(event.token);
    return;
  }

  if (event.type === "model_stream_completed") {
    console.log("");
    console.log(`~~ stream complete (${event.contentLength} chars)`);
    return;
  }

  if (event.type === "tool_call") {
    console.log(`=> tool_call ${event.call.name}`);
    return;
  }
}

async function maybeApplyPatch(
  workspaceRoot: string,
  result: AgentRunResult,
  options: CliOptions
): Promise<CliPatchApplyResult | null> {
  if (!options.apply) {
    return null;
  }

  const proposal = result.answer.patchProposal;

  if (!proposal) {
    return {
      ok: false,
      appliedFiles: [],
      errors: ["No patchProposal was returned by the agent."],
      skipped: true
    };
  }

  const approved = await confirmPatchApply(proposal.files.length, options);

  if (!approved) {
    return {
      ok: false,
      appliedFiles: [],
      errors: ["Patch application skipped by user."],
      skipped: true
    };
  }

  const { applyPatchProposal } = await import("../lib/agent/patches");
  return applyPatchProposal(workspaceRoot, proposal);
}

async function confirmPatchApply(fileCount: number, options: CliOptions) {
  if (options.yes) {
    return true;
  }

  if (!process.stdin.isTTY) {
    return false;
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await prompt.question(
      `Apply patch proposal for ${fileCount} file(s)? Type "apply" to continue: `
    );
    return answer.trim() === "apply";
  } finally {
    prompt.close();
  }
}

async function runRequestedValidations(workspaceRoot: string, options: CliOptions) {
  const results: ValidationRunResult[] = [];

  if (options.validate.length === 0) {
    return results;
  }

  const { runValidationCommand } = await import("../lib/agent/validation");

  for (const command of options.validate) {
    if (!options.json) {
      console.log(`Running validation: ${command}`);
    }

    results.push(await runValidationCommand(workspaceRoot, command));
  }

  return results;
}

function printHeader(
  goal: string,
  workspaceRoot: string,
  options: CliOptions,
  resumeRecord?: AgentRunRecord
) {
  if (options.json) {
    return;
  }

  console.log("DeepSeek TUI Demo CLI");
  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Goal: ${goal}`);
  if (resumeRecord) {
    console.log(`Continue: ${formatResumeTitle(resumeRecord)}`);
  }
  console.log("");
}

function printPatchApplyResult(result: CliPatchApplyResult | null, options: CliOptions) {
  if (!result || options.json) {
    return;
  }

  console.log("");
  console.log(result.skipped ? "Patch Apply Skipped" : "Patch Apply Result");

  if (result.appliedFiles.length > 0) {
    console.log("Applied files:");
    for (const file of result.appliedFiles) {
      console.log(`- ${file}`);
    }
  }

  if (result.errors.length > 0) {
    console.log("Messages:");
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
  }
}

function printValidationResults(results: ValidationRunResult[], options: CliOptions) {
  if (results.length === 0 || options.json) {
    return;
  }

  console.log("");
  console.log("Validation Results");

  for (const result of results) {
    console.log(
      `- ${result.ok ? "ok" : "failed"} ${result.displayCommand} (${result.durationMs}ms)`
    );

    if (!result.ok) {
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

      if (output) {
        console.log(trimForCli(output));
      }
    }
  }
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
  if (result.resumeFromRunId) {
    console.log(`Continued from: ${result.resumeFromRunId}`);
  }
  console.log(`Mode: ${result.mode}`);
  console.log(`Model: ${result.model}`);
  console.log(`Workspace files indexed: ${result.workspace.fileCount}`);
  if (result.contextBudget) {
    console.log(`Context budget: ${describeContextBudget(result.contextBudget)}`);
  }
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
    console.log(
      `  ${item.mode} / ${item.model} / tools=${item.toolCallCount} / patches=${item.patchFileCount}`
    );
    if (item.resumeFromRunId) {
      console.log(`  continued-from=${item.resumeFromRunId}`);
    }
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

function printTrace(result: AgentRunResult | StoredAgentRunResult) {
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
  npm run agent -- --continue <run-id> "continue the previous task"

Options:
  --cwd <path>     Workspace root. Defaults to the current directory.
  --json           Print machine-readable JSON.
  --no-save        Do not persist this run to .agent-runs.
  --stream         Print step updates while the agent is running.
  --trace          Print detailed agent trace entries.
  --apply          Ask before applying a returned patch proposal.
  -y, --yes        Confirm --apply without an interactive prompt.
  --validate <x>   Run typecheck, build, or all after the agent run.
  --recent         List recent saved runs.
  --limit <n>      Limit --recent output. Defaults to 10.
  --show <run-id>  Show one saved run.
  --continue <id>  Continue from a saved run and use it as context.
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

function readValidationTargets(value: string | undefined): ValidationCommandName[] {
  const raw = readRequiredArg(value, "--validate");

  if (raw === "all") {
    return ["typecheck", "build"];
  }

  const targets = raw.split(",").map((item) => item.trim()).filter(Boolean);
  const uniqueTargets = new Set<ValidationCommandName>();

  for (const target of targets) {
    if (target !== "typecheck" && target !== "build") {
      throw new Error("--validate must be typecheck, build, or all.");
    }

    uniqueTargets.add(target);
  }

  return [...uniqueTargets];
}

function trimForCli(value: string) {
  return value.length > 2400 ? `${value.slice(-2400)}\n...` : value;
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

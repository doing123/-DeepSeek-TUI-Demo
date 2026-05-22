import { readFile } from "fs/promises";
import path from "path";
import { emitKeypressEvents } from "readline";
import { createInterface as createPrompt } from "readline/promises";
import { pathToFileURL } from "url";
import { describeContextSelection } from "../lib/agent/context-selection";
import { describeProtocolRepairPolicy } from "../lib/agent/model-protocol";
import { applyPatchProposal } from "../lib/agent/patches";
import { buildResumePromptGoal } from "../lib/agent/resume";
import { runCodingAgent } from "../lib/agent/runner";
import { describeToolPolicy } from "../lib/agent/tool-policy";
import {
  listAgentRunSummaries,
  readAgentRunRecord,
  saveAgentRunRecord
} from "../lib/agent/run-store";
import type {
  AgentRunEvent,
  AgentRunResult,
  AgentRunSummary
} from "../lib/agent/types";

type TuiOptions = {
  cwd: string;
  goal: string;
  help: boolean;
  once: boolean;
};

type TuiState = {
  workspaceRoot: string;
  goal: string;
  recentRuns: AgentRunSummary[];
  selectedIndex: number;
  resumeRunId?: string;
  isRunning: boolean;
  status: string;
  events: string[];
  toolEvents: string[];
  streamText: string;
  result?: AgentRunResult;
};

const DEFAULT_GOAL =
  "查看当前仓库状态，给出下一步最适合实现的 coding-agent 功能。";
const MAX_EVENTS = 14;

// Minimal dependency-free TUI spike.
// It deliberately reuses the V0.9 Agent Event Bus so the eventual richer TUI can
// evolve without inventing a separate terminal-only protocol.
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspaceRoot = path.resolve(options.cwd);

  if (options.help) {
    printHelp();
    return;
  }

  await loadLocalEnv(workspaceRoot);

  if (options.once || !process.stdout.isTTY || !process.stdin.isTTY) {
    await runOnce(workspaceRoot, options.goal);
    return;
  }

  const state: TuiState = {
    workspaceRoot,
    goal: options.goal,
    recentRuns: await listAgentRunSummaries(workspaceRoot),
    selectedIndex: 0,
    isRunning: false,
    status: "Ready",
    events: [],
    toolEvents: [],
    streamText: ""
  };

  await runInteractiveTui(state);
}

function parseArgs(args: string[]): TuiOptions {
  const options: TuiOptions = {
    cwd: process.cwd(),
    goal: DEFAULT_GOAL,
    help: false,
    once: false
  };
  const goalParts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--once") {
      options.once = true;
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = readRequiredArg(args[index + 1], "--cwd");
      index += 1;
      continue;
    }

    goalParts.push(arg);
  }

  options.goal = goalParts.join(" ").trim() || DEFAULT_GOAL;
  return options;
}

async function runInteractiveTui(state: TuiState) {
  const input = process.stdin;
  const output = process.stdout;
  let closed = false;

  emitKeypressEvents(input);
  input.setRawMode(true);
  output.write("\x1b[?1049h\x1b[?25l");
  render(state);

  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    input.setRawMode(false);
    output.write("\x1b[?25h\x1b[?1049l");
  };

  input.on("keypress", async (_chunk, key) => {
    if (state.isRunning) {
      return;
    }

    if (key.name === "q" || key.name === "escape") {
      close();
      return;
    }

    if (key.name === "up") {
      state.selectedIndex = Math.max(0, state.selectedIndex - 1);
      render(state);
      return;
    }

    if (key.name === "down") {
      state.selectedIndex = Math.min(state.recentRuns.length - 1, state.selectedIndex + 1);
      render(state);
      return;
    }

    if (key.name === "c") {
      continueSelectedRun(state);
      render(state);
      return;
    }

    if (key.name === "n") {
      await editGoal(state, input, output);
      render(state);
      return;
    }

    if (key.name === "a") {
      await applyLatestPatch(state);
      render(state);
      return;
    }

    if (key.name === "r" || key.name === "return") {
      await runTuiAgent(state);
      render(state);
    }
  });

  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (closed) {
        clearInterval(timer);
        resolve();
      }
    }, 80);
  });
}

async function runOnce(workspaceRoot: string, goal: string) {
  const result = await runCodingAgent({
    goal,
    streamModel: true,
    workspaceRoot,
    onEvent: (event) => {
      const line = formatEvent(event);
      if (line) {
        console.log(line);
      }
    }
  });

  await saveAgentRunRecord(workspaceRoot, result);
  console.log(`Saved run: ${result.id}`);
}

async function runTuiAgent(state: TuiState) {
  state.isRunning = true;
  state.status = "Running";
  state.events = [];
  state.toolEvents = [];
  state.streamText = "";
  state.result = undefined;
  render(state);

  const resumeRecord = state.resumeRunId
    ? await readAgentRunRecord(state.workspaceRoot, state.resumeRunId)
    : null;
  const promptGoal = resumeRecord ? buildResumePromptGoal(state.goal, resumeRecord) : state.goal;

  try {
    const result = await runCodingAgent({
      goal: state.goal,
      promptGoal,
      resumeFromRunId: resumeRecord?.id,
      streamModel: true,
      workspaceRoot: state.workspaceRoot,
      onEvent: (event) => {
        applyEvent(state, event);
        render(state);
      }
    });

    await saveAgentRunRecord(state.workspaceRoot, result);
    state.recentRuns = await listAgentRunSummaries(state.workspaceRoot);
    state.result = result;
    state.status = `Saved ${result.id}`;
  } catch (error) {
    state.status = error instanceof Error ? error.message : "Agent run failed";
  } finally {
    state.isRunning = false;
  }
}

function applyEvent(state: TuiState, event: AgentRunEvent) {
  if (event.type === "model_token") {
    state.streamText = `${state.streamText}${event.token}`.slice(-6000);
    return;
  }

  if (event.type === "tool_call") {
    state.toolEvents = [
      ...state.toolEvents,
      `${event.call.name} ${formatInlineJson(event.call.input)}`
    ].slice(-8);
  }

  const line = formatEvent(event);
  if (line) {
    state.events = [...state.events, line].slice(-MAX_EVENTS);
  }

  if (event.type === "run_completed") {
    state.result = event.result;
  }
}

function render(state: TuiState) {
  const width = process.stdout.columns || 100;
  const height = process.stdout.rows || 32;
  const leftWidth = Math.max(34, Math.min(46, Math.floor(width * 0.38)));
  const rightWidth = Math.max(32, width - leftWidth - 3);
  const lines: string[] = [];
  const selected = state.recentRuns[state.selectedIndex];

  lines.push(color("DeepSeek TUI Demo", "cyan"));
  lines.push(`Workspace: ${truncate(state.workspaceRoot, width - 11)}`);
  lines.push("");
  lines.push(row("Goal", state.goal, leftWidth, "Live Events", state.status, rightWidth));
  lines.push(row("Keys", "r run · n edit · ↑↓ select · c continue · a apply patch · q quit", leftWidth, "", "", rightWidth));
  lines.push(row("Resume", state.resumeRunId ?? "none", leftWidth, "", "", rightWidth));
  lines.push(row("Tool Calls", formatToolSummary(state), leftWidth, "Policy", formatPolicySummary(state.result), rightWidth));
  lines.push(row("Context", formatContextSummary(state.result), leftWidth, "", "", rightWidth));
  lines.push(row("Protocol", formatProtocolSummary(state.result), leftWidth, "", "", rightWidth));
  lines.push("");

  const recentLines = formatRecentRuns(state.recentRuns, state.selectedIndex, leftWidth);
  const eventLines = state.events.length > 0 ? state.events : ["No events yet."];
  const toolLines = state.toolEvents.length > 0
    ? ["Tool Calls", ...state.toolEvents]
    : ["Tool Calls", "No tool calls yet."];
  const maxPaneLines = Math.max(recentLines.length, eventLines.length, 10);

  for (let index = 0; index < maxPaneLines; index += 1) {
    lines.push(joinColumns(
      recentLines[index] ?? "",
      eventLines[index] ?? "",
      leftWidth,
      rightWidth
    ));
  }

  lines.push("");
  lines.push(color("Tool Detail", "cyan"));
  lines.push(...toolLines.slice(0, 6).map((line) => truncate(line, width)));
  lines.push("");
  lines.push(color("Model Stream", "cyan"));
  lines.push(...wrap(state.streamText || "Waiting for model output...", width).slice(0, 8));

  if (state.result) {
    lines.push("");
    lines.push(color("Result", "green"));
    lines.push(...wrap(`${state.result.answer.title}: ${state.result.answer.summary}`, width).slice(0, 4));

    if (state.result.answer.patchProposal) {
      lines.push(color(`Patch: ${state.result.answer.patchProposal.summary}`, "cyan"));
    }

    if (state.result.toolPolicy) {
      lines.push(color(`Policy: ${describeToolPolicy(state.result.toolPolicy)}`, "dim"));
    }

    if (state.result.contextSelection) {
      lines.push(color(`Context: ${describeContextSelection(state.result.contextSelection)}`, "dim"));
    }

    if (state.result.protocolRepairPolicy) {
      lines.push(color(`Protocol: ${describeProtocolRepairPolicy(state.result.protocolRepairPolicy)} repairs=${state.result.protocolRepairCount ?? 0}`, "dim"));
    }
  }

  process.stdout.write("\x1b[2J\x1b[H");
  process.stdout.write(lines.slice(0, height - 1).join("\n"));

  if (selected) {
    process.stdout.write(`\n${color(`Selected: ${selected.id}`, "dim")}`);
  }
}

function formatRecentRuns(runs: AgentRunSummary[], selectedIndex: number, width: number) {
  if (runs.length === 0) {
    return ["Recent Runs", "No saved runs yet."];
  }

  const lines = ["Recent Runs"];
  for (const [index, run] of runs.slice(0, 8).entries()) {
    const marker = index === selectedIndex ? ">" : " ";
    lines.push(`${marker} ${truncate(run.title, width - 2)}`);
    lines.push(`  ${truncate(run.goal, width - 2)}`);
  }

  return lines;
}

function continueSelectedRun(state: TuiState) {
  const selected = state.recentRuns[state.selectedIndex];

  if (!selected) {
    state.status = "No run selected";
    return;
  }

  state.resumeRunId = selected.id;
  state.goal = `继续上一轮任务：${selected.goal}\n\n本轮目标：`;
  state.status = `Continuing ${selected.id}`;
}

async function editGoal(
  state: TuiState,
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream
) {
  input.setRawMode(false);
  output.write("\x1b[?25h\x1b[2J\x1b[H");
  const prompt = createPrompt({
    input,
    output
  });

  try {
    const answer = await prompt.question("Goal: ");
    if (answer.trim()) {
      state.goal = answer.trim();
      state.resumeRunId = undefined;
      state.status = "Goal updated";
    }
  } finally {
    prompt.close();
    input.setRawMode(true);
    output.write("\x1b[?25l");
  }
}

async function applyLatestPatch(state: TuiState) {
  const proposal = state.result?.answer.patchProposal;

  if (!proposal) {
    state.status = "No patchProposal in latest result";
    return;
  }

  state.status = "Applying patchProposal";
  render(state);

  const result = await applyPatchProposal(state.workspaceRoot, proposal);

  if (result.ok) {
    state.status = `Patch applied: ${result.appliedFiles.join(", ")}`;
  } else {
    state.status = `Patch not applied: ${result.errors.join("; ")}`;
  }
}

async function loadLocalEnv(workspaceRoot: string) {
  await loadEnvFile(path.join(workspaceRoot, ".env.local"));
  await loadEnvFile(path.join(workspaceRoot, ".env"));
}

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

function formatEvent(event: AgentRunEvent) {
  if (event.type === "run_started") {
    return `run_started ${event.goal}`;
  }

  if (event.type === "step_started") {
    return `-> ${event.step.title}`;
  }

  if (event.type === "step_completed") {
    return `<- ${event.step.title}: ${event.step.detail}`;
  }

  if (event.type === "model_stream_started") {
    return `~~ stream ${event.model} turn ${event.turn}`;
  }

  if (event.type === "model_stream_completed") {
    return `~~ stream complete ${event.contentLength} chars`;
  }

  if (event.type === "tool_call") {
    return `tool_call ${event.call.name}`;
  }

  if (event.type === "run_completed") {
    return `run_completed ${event.result.id}`;
  }

  return "";
}

function formatToolSummary(state: TuiState) {
  if (state.result) {
    return `${state.result.toolCallCount} executed`;
  }

  return state.toolEvents.length > 0 ? `${state.toolEvents.length} observed` : "none";
}

function formatPolicySummary(result: AgentRunResult | undefined) {
  if (!result?.toolPolicy) {
    return "available after run";
  }

  return `read=${result.toolPolicy.allowedReadTools.length} patch=${result.toolPolicy.patchProposal}`;
}

function formatContextSummary(result: AgentRunResult | undefined) {
  if (!result?.contextSelection) {
    return "available after run";
  }

  return `${result.contextSelection.selectedCount}/${result.contextSelection.candidateCount} selected`;
}

function formatProtocolSummary(result: AgentRunResult | undefined) {
  if (!result?.protocolRepairPolicy) {
    return "available after run";
  }

  return `${result.protocolRepairCount ?? 0}/${result.protocolRepairPolicy.maxAttempts} repairs`;
}

function formatInlineJson(value: unknown) {
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function row(
  leftTitle: string,
  leftText: string,
  leftWidth: number,
  rightTitle: string,
  rightText: string,
  rightWidth: number
) {
  return joinColumns(
    `${color(leftTitle, "dim")}: ${leftText}`,
    rightTitle ? `${color(rightTitle, "dim")}: ${rightText}` : "",
    leftWidth,
    rightWidth
  );
}

function joinColumns(left: string, right: string, leftWidth: number, rightWidth: number) {
  return `${pad(truncate(left, leftWidth), leftWidth)} │ ${truncate(right, rightWidth)}`;
}

function wrap(value: string, width: number) {
  const plain = value.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  let rest = plain;

  while (rest.length > width) {
    lines.push(rest.slice(0, width));
    rest = rest.slice(width);
  }

  lines.push(rest);
  return lines;
}

function truncate(value: string, width: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > width ? `${normalized.slice(0, Math.max(0, width - 1))}…` : normalized;
}

function pad(value: string, width: number) {
  return `${value}${" ".repeat(Math.max(0, width - value.length))}`;
}

function color(value: string, tone: "cyan" | "green" | "dim") {
  const codes = {
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    dim: "\x1b[2m"
  };

  return `${codes[tone]}${value}\x1b[0m`;
}

function readRequiredArg(value: string | undefined, flag: string) {
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
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

function printHelp() {
  console.log(`DeepSeek TUI Demo

Usage:
  npm run tui
  npm run tui -- "inspect current repo"
  npm run tui -- --once "non-interactive smoke test"

Keys:
  r / enter  Run current goal
  n          Edit goal
  up/down    Select recent run
  c          Continue selected run
  a          Apply latest patch proposal
  q / esc    Quit
`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

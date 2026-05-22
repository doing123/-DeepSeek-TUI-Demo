import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import path from "path";
import type {
  AgentRunRecord,
  AgentRunResult,
  AgentRunSummary,
  PatchProposalMeta,
  StoredAgentRunResult,
  ValidationRunResult
} from "./types";

const RUN_STORE_DIR = ".agent-runs";
const MAX_SUMMARIES = 40;

// Local run history store.
// This is intentionally file-based and ignored by git so the project can teach
// session persistence without introducing a database or cloud dependency.
export async function saveAgentRunRecord(workspaceRoot: string, result: AgentRunResult) {
  const record: AgentRunRecord = {
    id: result.id,
    savedAt: new Date().toISOString(),
    result: toStoredRunResult(result),
    patchProposalMeta: toPatchProposalMeta(result),
    validations: []
  };

  await writeRecord(workspaceRoot, record);
  return record;
}

export async function appendValidationToRun(
  workspaceRoot: string,
  runId: string,
  validation: ValidationRunResult
) {
  const record = await readAgentRunRecord(workspaceRoot, runId);

  if (!record) {
    return null;
  }

  const nextRecord: AgentRunRecord = {
    ...record,
    savedAt: new Date().toISOString(),
    validations: [...record.validations, validation]
  };

  await writeRecord(workspaceRoot, nextRecord);
  return nextRecord;
}

export async function listAgentRunSummaries(workspaceRoot: string): Promise<AgentRunSummary[]> {
  const records = await readAllRecords(workspaceRoot);

  return records
    .sort((left, right) => right.result.startedAt.localeCompare(left.result.startedAt))
    .slice(0, MAX_SUMMARIES)
    .map(toSummary);
}

export async function readAgentRunRecord(workspaceRoot: string, runId: string) {
  if (!isSafeRunId(runId)) {
    return null;
  }

  try {
    return JSON.parse(await readFile(recordPath(workspaceRoot, runId), "utf8")) as AgentRunRecord;
  } catch {
    return null;
  }
}

async function readAllRecords(workspaceRoot: string) {
  try {
    const names = await readdir(storePath(workspaceRoot));
    const records = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map((name) => readAgentRunRecord(workspaceRoot, name.replace(/\.json$/, "")))
    );

    return records.filter((record): record is AgentRunRecord => Boolean(record));
  } catch {
    return [];
  }
}

async function writeRecord(workspaceRoot: string, record: AgentRunRecord) {
  await mkdir(storePath(workspaceRoot), { recursive: true });
  await writeFile(recordPath(workspaceRoot, record.id), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function toStoredRunResult(result: AgentRunResult): StoredAgentRunResult {
  const { patchProposal: _patchProposal, ...answer } = result.answer;

  return {
    id: result.id,
    goal: result.goal,
    resumeFromRunId: result.resumeFromRunId,
    mode: result.mode,
    model: result.model,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    steps: result.steps,
    workspace: result.workspace,
    contextBudget: result.contextBudget,
    contextSelection: result.contextSelection,
    toolPolicy: result.toolPolicy,
    toolCallCount: result.toolCallCount,
    answer
  };
}

function toPatchProposalMeta(result: AgentRunResult): PatchProposalMeta | undefined {
  const proposal = result.answer.patchProposal;

  if (!proposal) {
    return undefined;
  }

  return {
    summary: proposal.summary,
    fileCount: proposal.files.length,
    files: proposal.files.map((file) => ({
      path: file.path,
      action: file.action,
      explanation: file.explanation
    }))
  };
}

function toSummary(record: AgentRunRecord): AgentRunSummary {
  return {
    id: record.id,
    goal: record.result.goal,
    resumeFromRunId: record.result.resumeFromRunId,
    title: record.result.answer.title,
    mode: record.result.mode,
    model: record.result.model,
    startedAt: record.result.startedAt,
    completedAt: record.result.completedAt,
    toolCallCount: record.result.toolCallCount,
    patchFileCount: record.patchProposalMeta?.fileCount ?? 0,
    validationCount: record.validations.length
  };
}

function storePath(workspaceRoot: string) {
  return path.join(workspaceRoot, RUN_STORE_DIR);
}

function recordPath(workspaceRoot: string, runId: string) {
  return path.join(storePath(workspaceRoot), `${runId}.json`);
}

function isSafeRunId(value: string) {
  return /^[a-f0-9-]{20,80}$/i.test(value);
}

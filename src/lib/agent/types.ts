export type AgentMode = "deepseek" | "offline";

export type ReadOnlyToolName = "list_files" | "read_file" | "search_text" | "git_status";

export type AgentMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AgentStep = {
  title: string;
  detail: string;
  startedAt: string;
  completedAt?: string;
  kind?: "system" | "model" | "tool";
  toolName?: ReadOnlyToolName;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  ok?: boolean;
};

export type AgentRunEvent =
  | {
      type: "run_started";
      goal: string;
      startedAt: string;
      resumeFromRunId?: string;
    }
  | {
      type: "step_started";
      step: AgentStep;
    }
  | {
      type: "step_completed";
      step: AgentStep;
    }
  | {
      type: "model_stream_started";
      model: string;
      turn: number;
    }
  | {
      type: "model_token";
      token: string;
      turn: number;
    }
  | {
      type: "model_stream_completed";
      model: string;
      turn: number;
      contentLength: number;
    }
  | {
      type: "tool_call";
      call: ToolCall;
    }
  | {
      type: "run_completed";
      result: AgentRunResult;
    };

export type WorkspaceFile = {
  path: string;
  size: number;
  excerpt?: string;
};

export type WorkspaceSnapshot = {
  root: string;
  fileCount: number;
  files: WorkspaceFile[];
};

export type WorkspaceSearchMatch = {
  path: string;
  lineNumber: number;
  line: string;
};

export type PatchAction = "create" | "replace";

export type PatchFileChange = {
  path: string;
  action: PatchAction;
  content: string;
  explanation?: string;
};

export type PatchProposal = {
  summary: string;
  files: PatchFileChange[];
};

export type PatchApplyResult = {
  ok: boolean;
  appliedFiles: string[];
  errors: string[];
};

export type ValidationCommandName = "typecheck" | "build";

export type ValidationRunResult = {
  ok: boolean;
  command: ValidationCommandName;
  displayCommand: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type PatchProposalMeta = {
  summary: string;
  fileCount: number;
  files: Array<{
    path: string;
    action: PatchAction;
    explanation?: string;
  }>;
};

export type ToolDefinition = {
  name: ReadOnlyToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: ReadOnlyToolName;
  input: Record<string, unknown>;
};

export type ToolResult = {
  callId: string;
  name: ReadOnlyToolName;
  ok: boolean;
  summary: string;
  output?: unknown;
  error?: string;
};

export type AgentAnswer = {
  title: string;
  summary: string;
  plan: string[];
  filesToInspect: string[];
  proposedChanges: string[];
  risks: string[];
  nextActions: string[];
  patchProposal?: PatchProposal;
};

export type AgentRunResult = {
  id: string;
  goal: string;
  resumeFromRunId?: string;
  mode: AgentMode;
  model: string;
  startedAt: string;
  completedAt: string;
  steps: AgentStep[];
  workspace: Pick<WorkspaceSnapshot, "root" | "fileCount">;
  toolCallCount: number;
  answer: AgentAnswer;
  rawText?: string;
};

export type StoredAgentAnswer = Omit<AgentAnswer, "patchProposal">;

export type StoredAgentRunResult = Omit<AgentRunResult, "answer" | "rawText"> & {
  answer: StoredAgentAnswer;
};

export type AgentRunRecord = {
  id: string;
  savedAt: string;
  result: StoredAgentRunResult;
  patchProposalMeta?: PatchProposalMeta;
  validations: ValidationRunResult[];
};

export type AgentRunSummary = {
  id: string;
  goal: string;
  resumeFromRunId?: string;
  title: string;
  mode: AgentMode;
  model: string;
  startedAt: string;
  completedAt: string;
  toolCallCount: number;
  patchFileCount: number;
  validationCount: number;
};

export type ProviderCompletion = {
  model: string;
  content: string;
};

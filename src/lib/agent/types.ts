export type AgentMode = "deepseek" | "offline";

export type ReadOnlyToolName = "list_files" | "read_file" | "search_text";

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
};

export type AgentRunResult = {
  id: string;
  goal: string;
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

export type ProviderCompletion = {
  model: string;
  content: string;
};

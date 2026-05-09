export type AgentMode = "deepseek" | "offline";

export type AgentMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AgentStep = {
  title: string;
  detail: string;
  startedAt: string;
  completedAt?: string;
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
  answer: AgentAnswer;
  rawText?: string;
};

export type ProviderCompletion = {
  model: string;
  content: string;
};

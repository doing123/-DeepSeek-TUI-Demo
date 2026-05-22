import type {
  AgentSessionMode,
  ApprovalMode,
  ApprovalProfileSnapshot
} from "./types";

const APPROVAL_MODES: ApprovalMode[] = ["ask", "trusted-read", "trusted-write"];

// Approval profiles describe what the local runtime is allowed to do after the
// model proposes an action. V0.19 keeps writes human-reviewed while making the
// future trust boundary explicit in every run.
export function buildApprovalProfile({
  mode,
  sessionMode,
  source = "request"
}: {
  mode: ApprovalMode;
  sessionMode: AgentSessionMode;
  source?: ApprovalProfileSnapshot["source"];
}): ApprovalProfileSnapshot {
  const warnings: string[] = [];

  if (mode === "trusted-write") {
    warnings.push(
      "trusted-write is metadata only in this learning version; patch application still requires local review."
    );
  }

  if (sessionMode === "plan" && mode !== "ask") {
    warnings.push("sessionMode=plan remains read-only even when a trusted approval profile is selected.");
  }

  return {
    mode,
    readTools: "auto-approved",
    patchApplication: mode === "trusted-write" ? "trusted-after-preview" : "manual-review",
    validationCommands: "manual",
    shellCommands: "blocked",
    source,
    warnings
  };
}

export function getDefaultApprovalMode(env: NodeJS.ProcessEnv = process.env): ApprovalMode {
  return normalizeApprovalMode(env.AGENT_APPROVAL_MODE) ?? "ask";
}

export function normalizeApprovalMode(value: unknown): ApprovalMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return isApprovalMode(normalized) ? normalized : undefined;
}

export function isApprovalMode(value: string): value is ApprovalMode {
  return APPROVAL_MODES.includes(value as ApprovalMode);
}

export function nextApprovalMode(mode: ApprovalMode): ApprovalMode {
  const index = APPROVAL_MODES.indexOf(mode);
  return APPROVAL_MODES[(index + 1) % APPROVAL_MODES.length] ?? "ask";
}

export function describeApprovalMode(mode: ApprovalMode) {
  if (mode === "trusted-read") {
    return "trusted-read: read-only tools are auto-approved; writes, validation, and shell stay manual or blocked";
  }

  if (mode === "trusted-write") {
    return "trusted-write: future auto-apply intent after preview; V0.19 still requires human patch approval";
  }

  return "ask: explicit human approval for every write or validation step";
}

export function describeApprovalProfile(profile: ApprovalProfileSnapshot) {
  return [
    `approval=${profile.mode}`,
    `readTools=${profile.readTools}`,
    `patch=${profile.patchApplication}`,
    `validation=${profile.validationCommands}`,
    `shell=${profile.shellCommands}`,
    `source=${profile.source}`
  ].join("; ");
}

export function buildApprovalProfilePrompt(profile: ApprovalProfileSnapshot) {
  const warningText = profile.warnings.length
    ? ` warnings=[${profile.warnings.join(" | ")}]`
    : "";

  return [
    `approvalProfile=${profile.mode}：${describeApprovalMode(profile.mode)}。`,
    `Read tools: ${profile.readTools}. Patch application: ${profile.patchApplication}. Validation: ${profile.validationCommands}. Shell: ${profile.shellCommands}.${warningText}`,
    "即使 approvalProfile 表示 trusted-write，模型也只能返回 patchProposal；不能假设文件已经写入，也不能请求 shell 执行。"
  ].join("\n");
}

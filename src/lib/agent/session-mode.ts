import type { AgentSessionMode, ToolPolicySnapshot } from "./types";

export const AGENT_SESSION_MODES: AgentSessionMode[] = ["plan", "agent", "apply"];

export function isAgentSessionMode(value: unknown): value is AgentSessionMode {
  return typeof value === "string" && AGENT_SESSION_MODES.includes(value as AgentSessionMode);
}

export function normalizeAgentSessionMode(value: unknown): AgentSessionMode {
  return isAgentSessionMode(value) ? value : "agent";
}

export function describeAgentSessionMode(mode: AgentSessionMode) {
  if (mode === "plan") {
    return "plan: read-only planning, patchProposal disabled";
  }

  if (mode === "apply") {
    return "apply: prepare an explicit patch proposal for human review";
  }

  return "agent: inspect, reason, and propose changes when useful";
}

export function applySessionModeToToolPolicy(
  policy: ToolPolicySnapshot,
  mode: AgentSessionMode
): ToolPolicySnapshot {
  if (mode !== "plan") {
    return policy;
  }

  return {
    ...policy,
    patchProposal: "disabled",
    warnings: [
      ...policy.warnings,
      "sessionMode=plan disables patchProposal for this run."
    ]
  };
}

export function buildSessionModePrompt(mode: AgentSessionMode) {
  if (mode === "plan") {
    return "sessionMode=plan：保持只读规划；不要返回 patchProposal；重点输出架构理解、实施步骤、风险和下一步。";
  }

  if (mode === "apply") {
    return "sessionMode=apply：如果上下文足够且用户目标明确要求实现，请优先返回可审查的 patchProposal；补丁仍必须等待用户确认后才会应用。";
  }

  return "sessionMode=agent：按任务需要选择只读工具；信息足够后给出建议，只有明确需要改代码时才返回 patchProposal。";
}

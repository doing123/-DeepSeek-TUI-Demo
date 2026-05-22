import type {
  ReadOnlyToolName,
  ToolDefinition,
  ToolPolicySnapshot
} from "./types";
import {
  isReadOnlyToolName,
  READ_ONLY_TOOL_DEFINITIONS
} from "./tools";

const ALL_READ_TOOL_NAMES = READ_ONLY_TOOL_DEFINITIONS.map((tool) => tool.name);

// Tool policy is the local safety gate between the model protocol and execution.
// The prompt advertises only allowed tools, and the runner also enforces this
// policy before a tool call reaches filesystem-aware code.
export function getToolPolicy(env: NodeJS.ProcessEnv = process.env): ToolPolicySnapshot {
  const { allowedReadTools, warnings: readToolWarnings } = readAllowedTools(
    env.AGENT_ALLOWED_READ_TOOLS
  );
  const { patchProposal, warnings: patchWarnings } = readPatchProposalPolicy(
    env.AGENT_PATCH_PROPOSAL
  );

  return {
    allowedReadTools,
    patchProposal,
    validationCommands: "manual",
    source: "env",
    warnings: [...readToolWarnings, ...patchWarnings]
  };
}

export function filterToolsByPolicy(
  tools: ToolDefinition[],
  policy: ToolPolicySnapshot
) {
  const allowed = new Set(policy.allowedReadTools);
  return tools.filter((tool) => allowed.has(tool.name));
}

export function isToolAllowed(name: ReadOnlyToolName, policy: ToolPolicySnapshot) {
  return policy.allowedReadTools.includes(name);
}

export function describeToolPolicy(policy: ToolPolicySnapshot) {
  const tools = policy.allowedReadTools.join(", ") || "none";
  const warningText = policy.warnings.length > 0
    ? ` warnings=${policy.warnings.join(" | ")}`
    : "";

  return [
    `read tools=[${tools}]`,
    `patchProposal=${policy.patchProposal}`,
    `validation=${policy.validationCommands}`,
    `source=${policy.source}${warningText}`
  ].join("; ");
}

function readAllowedTools(value: string | undefined): {
  allowedReadTools: ReadOnlyToolName[];
  warnings: string[];
} {
  const raw = value?.trim();

  if (!raw || raw.toLowerCase() === "all") {
    return {
      allowedReadTools: ALL_READ_TOOL_NAMES,
      warnings: []
    };
  }

  const requested = unique(
    raw
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const allowed = requested.filter(isReadOnlyToolName);
  const invalid = requested.filter((name) => !isReadOnlyToolName(name));
  const warnings = invalid.length > 0
    ? [`Ignored invalid read tools: ${invalid.join(", ")}`]
    : [];

  if (allowed.length === 0) {
    return {
      allowedReadTools: ALL_READ_TOOL_NAMES,
      warnings: [
        ...warnings,
        "No valid read tools were configured; falling back to all read-only tools."
      ]
    };
  }

  return {
    allowedReadTools: allowed,
    warnings
  };
}

function readPatchProposalPolicy(value: string | undefined): {
  patchProposal: ToolPolicySnapshot["patchProposal"];
  warnings: string[];
} {
  const raw = value?.trim().toLowerCase();

  if (!raw || raw === "enabled" || raw === "true" || raw === "on") {
    return {
      patchProposal: "enabled",
      warnings: []
    };
  }

  if (raw === "disabled" || raw === "false" || raw === "off") {
    return {
      patchProposal: "disabled",
      warnings: []
    };
  }

  return {
    patchProposal: "enabled",
    warnings: [`Ignored invalid AGENT_PATCH_PROPOSAL value: ${value}`]
  };
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

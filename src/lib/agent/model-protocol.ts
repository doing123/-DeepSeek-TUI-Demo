import type {
  ModelProtocolError,
  ModelProtocolErrorCode,
  ProtocolRepairPolicy
} from "./types";

// Protocol repair is deliberately tiny: one local retry by default, with the
// original invalid text trimmed before it is sent back to the model.
export function getProtocolRepairPolicy(
  env: NodeJS.ProcessEnv = process.env
): ProtocolRepairPolicy {
  return {
    maxAttempts: readBoundedInt(env.AGENT_PROTOCOL_REPAIR_MAX_ATTEMPTS, 1, 0, 2),
    maxRawTextLength: readBoundedInt(env.AGENT_PROTOCOL_REPAIR_MAX_RAW_LENGTH, 2400, 400, 8000),
    source: "env"
  };
}

export function describeProtocolRepairPolicy(policy: ProtocolRepairPolicy) {
  return [
    `attempts<=${policy.maxAttempts}`,
    `raw<=${policy.maxRawTextLength}`,
    `source=${policy.source}`
  ].join(" / ");
}

export function createModelProtocolError({
  code,
  reason,
  rawText,
  repairAttempted,
  maxRawTextLength
}: {
  code: ModelProtocolErrorCode;
  reason: string;
  rawText: string;
  repairAttempted: boolean;
  maxRawTextLength: number;
}): ModelProtocolError {
  return {
    code,
    reason,
    rawTextPreview: previewProtocolText(rawText, maxRawTextLength),
    occurredAt: new Date().toISOString(),
    repairAttempted
  };
}

export function previewProtocolText(rawText: string, maxLength: number) {
  const trimmed = rawText.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}\n...` : trimmed;
}

function readBoundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

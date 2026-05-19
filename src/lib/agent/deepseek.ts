import type { AgentMessage, ProviderCompletion } from "./types";

// DeepSeek provider boundary.
// Keeps API-key access server-side and centralizes the exact OpenAI-compatible
// request shape used by the agent runner.
type DeepSeekConfig = {
  apiKey?: string;
  baseUrl: string;
  model: string;
  thinking: "enabled" | "disabled";
  reasoningEffort: string;
  jsonOutput: "enabled" | "disabled";
  maxTokens: number;
};

type DeepSeekResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export function getDeepSeekConfig(): DeepSeekConfig {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    thinking: process.env.DEEPSEEK_THINKING === "enabled" ? "enabled" : "disabled",
    reasoningEffort: process.env.DEEPSEEK_REASONING_EFFORT ?? "high",
    jsonOutput: process.env.DEEPSEEK_JSON_OUTPUT === "disabled" ? "disabled" : "enabled",
    maxTokens: readPositiveInt(process.env.DEEPSEEK_MAX_TOKENS, 8192)
  };
}

export function hasDeepSeekKey(config = getDeepSeekConfig()) {
  return Boolean(config.apiKey?.trim());
}

// Calls DeepSeek's non-streaming chat completions API.
// The runner expects plain assistant content and owns all tool-loop parsing.
export async function completeWithDeepSeek(
  messages: AgentMessage[],
  config = getDeepSeekConfig()
): Promise<ProviderCompletion> {
  if (!config.apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const body = buildDeepSeekRequestBody(messages, config);

  try {
    const response = await fetch(`${trimTrailingSlash(config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const payload = (await response.json()) as DeepSeekResponse;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `DeepSeek request failed: ${response.status}`);
    }

    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("DeepSeek response did not include message content.");
    }

    return {
      model: payload.model ?? config.model,
      content
    };
  } finally {
    clearTimeout(timeout);
  }
}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

// DeepSeek thinking mode has different parameter rules from normal chat:
// temperature is only sent when thinking is disabled.
function buildDeepSeekRequestBody(messages: AgentMessage[], config: DeepSeekConfig) {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: false,
    max_tokens: config.maxTokens,
    thinking: {
      type: config.thinking
    }
  };

  if (config.jsonOutput === "enabled") {
    body.response_format = {
      type: "json_object"
    };
  }

  if (config.thinking === "enabled") {
    body.reasoning_effort = config.reasoningEffort;
  } else {
    body.temperature = 0.2;
  }

  return body;
}

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

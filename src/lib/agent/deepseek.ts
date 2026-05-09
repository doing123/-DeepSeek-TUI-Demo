import type { AgentMessage, ProviderCompletion } from "./types";

type DeepSeekConfig = {
  apiKey?: string;
  baseUrl: string;
  model: string;
  thinking: "enabled" | "disabled";
  reasoningEffort: string;
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
    reasoningEffort: process.env.DEEPSEEK_REASONING_EFFORT ?? "medium"
  };
}

export function hasDeepSeekKey(config = getDeepSeekConfig()) {
  return Boolean(config.apiKey?.trim());
}

export async function completeWithDeepSeek(
  messages: AgentMessage[],
  config = getDeepSeekConfig()
): Promise<ProviderCompletion> {
  if (!config.apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${trimTrailingSlash(config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        temperature: 0.2,
        ...(config.thinking === "enabled"
          ? {
              thinking: { type: "enabled" },
              reasoning_effort: config.reasoningEffort
            }
          : {})
      }),
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

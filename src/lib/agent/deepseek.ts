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

type DeepSeekStreamChunk = {
  model?: string;
  choices?: Array<{
    delta?: {
      content?: string;
    };
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
  const body = buildDeepSeekRequestBody(messages, config, false);

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

// Calls DeepSeek with OpenAI-compatible SSE streaming and returns the same
// accumulated assistant content shape as the non-streaming path.
export async function streamCompleteWithDeepSeek(
  messages: AgentMessage[],
  onToken: (token: string) => void,
  config = getDeepSeekConfig()
): Promise<ProviderCompletion> {
  if (!config.apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const body = buildDeepSeekRequestBody(messages, config, true);

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

    if (!response.ok) {
      const payload = (await readJsonSafely(response)) as DeepSeekResponse | null;
      throw new Error(payload?.error?.message ?? `DeepSeek request failed: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("DeepSeek streaming response did not include a body.");
    }

    const completion = await readDeepSeekStream(response.body, onToken);

    if (!completion.content) {
      throw new Error("DeepSeek stream did not include message content.");
    }

    return {
      model: completion.model ?? config.model,
      content: completion.content
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
function buildDeepSeekRequestBody(
  messages: AgentMessage[],
  config: DeepSeekConfig,
  stream: boolean
) {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream,
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

async function readDeepSeekStream(
  body: ReadableStream<Uint8Array>,
  onToken: (token: string) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let model: string | undefined;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const parsed = parseDeepSeekStreamLine(line);

      if (!parsed || parsed.done) {
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error);
      }

      if (parsed.model) {
        model = parsed.model;
      }

      if (parsed.token) {
        content += parsed.token;
        onToken(parsed.token);
      }
    }
  }

  const tail = parseDeepSeekStreamLine(buffer);
  if (tail?.error) {
    throw new Error(tail.error);
  }
  if (tail?.model) {
    model = tail.model;
  }
  if (tail?.token) {
    content += tail.token;
    onToken(tail.token);
  }

  return { model, content };
}

function parseDeepSeekStreamLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || !trimmed.startsWith("data:")) {
    return null;
  }

  const data = trimmed.slice("data:".length).trim();

  if (data === "[DONE]") {
    return { done: true };
  }

  try {
    const payload = JSON.parse(data) as DeepSeekStreamChunk;
    const token = payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content;
    return {
      model: payload.model,
      token,
      error: payload.error?.message
    };
  } catch {
    return {
      error: "DeepSeek stream returned invalid JSON data."
    };
  }
}

async function readJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

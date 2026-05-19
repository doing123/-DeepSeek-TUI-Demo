import { randomUUID } from "crypto";
import {
  completeWithDeepSeek,
  getDeepSeekConfig,
  hasDeepSeekKey
} from "./deepseek";
import { normalizePatchProposal } from "./patches";
import { buildCodingAgentMessages, buildToolResultMessage } from "./prompts";
import {
  createToolCall,
  executeReadOnlyTool,
  isReadOnlyToolName,
  READ_ONLY_TOOL_DEFINITIONS,
  summarizeToolOutput
} from "./tools";
import type {
  AgentAnswer,
  AgentRunResult,
  AgentStep,
  ToolCall,
  WorkspaceSnapshot
} from "./types";
import { listWorkspaceFiles } from "./workspace";

type RunCodingAgentInput = {
  goal: string;
  workspaceRoot: string;
};

const MAX_TOOL_CALLS = 6;

export async function runCodingAgent({
  goal,
  workspaceRoot
}: RunCodingAgentInput): Promise<AgentRunResult> {
  const startedAt = new Date().toISOString();
  const steps: AgentStep[] = [];
  const config = getDeepSeekConfig();

  pushStep(steps, "理解目标", `收到任务：${goal}`, { kind: "system" });

  pushStep(steps, "建立文件索引", "列出仓库内可读的文本文件，作为工具循环的初始地图。", {
    kind: "system"
  });
  const files = await listWorkspaceFiles(workspaceRoot, { maxFiles: 160 });
  const snapshot: WorkspaceSnapshot = {
    root: workspaceRoot,
    fileCount: files.length,
    files
  };
  completeLatestStep(steps, `已索引 ${snapshot.fileCount} 个文本文件。`);

  if (!hasDeepSeekKey(config)) {
    pushStep(steps, "使用离线模式", "未检测到 DEEPSEEK_API_KEY，返回本地规划结果。", {
      kind: "system"
    });

    return {
      id: randomUUID(),
      goal,
      mode: "offline",
      model: config.model,
      startedAt,
      completedAt: new Date().toISOString(),
      steps,
      workspace: {
        root: snapshot.root,
        fileCount: snapshot.fileCount
      },
      toolCallCount: 0,
      answer: buildOfflineAnswer(snapshot.fileCount)
    };
  }

  const messages = buildCodingAgentMessages(
    goal,
    snapshot,
    READ_ONLY_TOOL_DEFINITIONS,
    MAX_TOOL_CALLS
  );
  let toolCallCount = 0;
  let model = config.model;
  let rawText: string | undefined;

  while (toolCallCount <= MAX_TOOL_CALLS) {
    pushStep(
      steps,
      "调用 DeepSeek",
      `第 ${toolCallCount + 1} 轮，模型：${config.model}，base URL：${config.baseUrl}`,
      { kind: "model" }
    );
    const completion = await completeWithDeepSeek(messages, config);
    model = completion.model;
    rawText = completion.content;
    completeLatestStep(steps, `收到 ${completion.model} 的响应。`);

    messages.push({
      role: "assistant",
      content: completion.content
    });

    const parsed = parseModelResponse(completion.content);

    if (parsed.type === "final") {
      return buildRunResult({
        goal,
        model,
        startedAt,
        steps,
        snapshot,
        toolCallCount,
        answer: parsed.answer,
        rawText: parsed.rawText
      });
    }

    if (parsed.type === "invalid") {
      return buildRunResult({
        goal,
        model,
        startedAt,
        steps,
        snapshot,
        toolCallCount,
        answer: buildInvalidResponseAnswer(parsed.reason, completion.content),
        rawText: completion.content
      });
    }

    if (toolCallCount >= MAX_TOOL_CALLS) {
      return buildRunResult({
        goal,
        model,
        startedAt,
        steps,
        snapshot,
        toolCallCount,
        answer: buildToolLimitAnswer(MAX_TOOL_CALLS),
        rawText
      });
    }

    toolCallCount += 1;
    pushStep(
      steps,
      `工具调用：${parsed.call.name}`,
      "执行服务端只读工具，并把结果回填给模型。",
      {
        kind: "tool",
        toolName: parsed.call.name,
        toolInput: parsed.call.input
      }
    );
    const result = await executeReadOnlyTool(parsed.call, {
      workspaceRoot
    });
    completeLatestStep(steps, result.summary, {
      ok: result.ok,
      toolOutput: summarizeToolOutput(result)
    });
    messages.push(buildToolResultMessage(result));
  }

  return buildRunResult({
    goal,
    model,
    startedAt,
    steps,
    snapshot,
    toolCallCount,
    answer: buildToolLimitAnswer(MAX_TOOL_CALLS),
    rawText
  });
}

function buildRunResult({
  goal,
  model,
  startedAt,
  steps,
  snapshot,
  toolCallCount,
  answer,
  rawText
}: {
  goal: string;
  model: string;
  startedAt: string;
  steps: AgentStep[];
  snapshot: WorkspaceSnapshot;
  toolCallCount: number;
  answer: AgentAnswer;
  rawText?: string;
}): AgentRunResult {
  return {
    id: randomUUID(),
    goal,
    mode: "deepseek",
    model,
    startedAt,
    completedAt: new Date().toISOString(),
    steps,
    workspace: {
      root: snapshot.root,
      fileCount: snapshot.fileCount
    },
    toolCallCount,
    answer,
    rawText
  };
}

function pushStep(
  steps: AgentStep[],
  title: string,
  detail: string,
  extra: Partial<AgentStep> = {}
) {
  steps.push({
    title,
    detail,
    startedAt: new Date().toISOString(),
    ...extra
  });
}

function completeLatestStep(steps: AgentStep[], detail?: string, extra: Partial<AgentStep> = {}) {
  const latest = steps.at(-1);

  if (!latest) {
    return;
  }

  if (detail) {
    latest.detail = detail;
  }

  latest.completedAt = new Date().toISOString();
  Object.assign(latest, extra);
}

function buildOfflineAnswer(fileCount: number): AgentAnswer {
  return {
    title: "补丁预览通道已就绪",
    summary:
      "当前运行在离线模式。V0.3 已经具备只读工具循环、结构化补丁提案和人工确认后的安全应用入口；配置 DEEPSEEK_API_KEY 后模型可以基于仓库上下文提出可预览补丁。",
    plan: [
      "把 Web UI 作为任务入口，收集用户的编码目标。",
      `服务端先索引当前工作区的 ${fileCount} 个文本文件。`,
      "模型通过严格 JSON 请求只读工具，服务端执行后把结果回填。",
      "模型在信息足够时输出结构化 final answer，可附带 patchProposal。",
      "用户在 UI 中审查 patchProposal 后，点击确认才会写入文件。"
    ],
    filesToInspect: [
      "src/app/api/agent/route.ts",
      "src/lib/agent/runner.ts",
      "src/lib/agent/tools.ts",
      "src/lib/agent/deepseek.ts",
      "src/lib/agent/workspace.ts"
    ],
    proposedChanges: [
      "V0.4 可以加入终端命令白名单，用于运行 typecheck/test/build。"
    ],
    risks: [
      "当前版本只读仓库，不会自动修改文件。",
      "上下文截断很简单，大仓库需要索引、检索和 token 预算。",
      "DeepSeek key 只应放在服务端环境变量，不能暴露到浏览器。"
    ],
    nextActions: [
      "复制 .env.example 为 .env.local 并填写 DEEPSEEK_API_KEY。",
      "运行 npm run dev 后在浏览器中测试任务输入。",
      "实现 V0.4 的命令白名单和验证回填。"
    ]
  };
}

type ParsedModelResponse =
  | {
      type: "tool_call";
      call: ToolCall;
    }
  | {
      type: "final";
      answer: AgentAnswer;
      rawText?: string;
    }
  | {
      type: "invalid";
      reason: string;
    };

function parseModelResponse(content: string): ParsedModelResponse {
  const normalized = stripJsonFence(content);

  try {
    const parsed = JSON.parse(normalized) as unknown;

    if (!isRecord(parsed)) {
      return {
        type: "invalid",
        reason: "模型返回的 JSON 顶层必须是对象。"
      };
    }

    if (parsed.type === "final") {
      return {
        type: "final",
        answer: normalizeAnswer(readRecord(parsed.answer))
      };
    }

    if (parsed.type === "tool_call") {
      return parseToolCall(parsed.tool);
    }

    if ("tool_call" in parsed) {
      return parseToolCall(parsed.tool_call);
    }

    if ("title" in parsed || "summary" in parsed || "plan" in parsed) {
      return {
        type: "final",
        answer: normalizeAnswer(parsed)
      };
    }

    return {
      type: "invalid",
      reason: "模型返回的 JSON 缺少 type=tool_call 或 type=final。"
    };
  } catch {
    return {
      type: "invalid",
      reason: "模型返回了非 JSON 内容。"
    };
  }
}

function parseToolCall(value: unknown): ParsedModelResponse {
  if (!isRecord(value) || !isReadOnlyToolName(value.name)) {
    return {
      type: "invalid",
      reason: "工具调用必须包含合法的 name。"
    };
  }

  return {
    type: "tool_call",
    call: createToolCall(value.name, readRecord(value.input))
  };
}

function buildInvalidResponseAnswer(reason: string, rawText: string): AgentAnswer {
  return {
    title: "模型响应无法继续执行",
    summary: `${reason}\n\n原始响应：${rawText}`,
    plan: ["调整 prompt 或模型参数，让输出稳定遵循 tool_call/final JSON 协议。"],
    filesToInspect: ["src/lib/agent/prompts.ts", "src/lib/agent/runner.ts"],
    proposedChanges: ["下一版可以增加 JSON 修复器或更细的模型响应校验错误提示。"],
    risks: ["模型没有遵循协议时，agent 会停止而不是猜测执行。"],
    nextActions: ["检查 rawText，必要时收紧 system prompt 或切换模型。"]
  };
}

function buildToolLimitAnswer(limit: number): AgentAnswer {
  return {
    title: "工具调用次数达到上限",
    summary: `本次运行已经执行 ${limit} 次只读工具调用。为了避免无限循环，agent 已停止并返回当前状态。`,
    plan: ["缩小任务范围，或让模型更早输出 final。"],
    filesToInspect: ["src/lib/agent/runner.ts", "src/lib/agent/prompts.ts"],
    proposedChanges: ["下一版可以按任务复杂度动态调整工具调用上限。"],
    risks: ["工具循环上限过低会导致复杂任务无法收敛。"],
    nextActions: ["重新运行任务，或把目标拆成更小的子任务。"]
  };
}

function normalizeAnswer(answer: Partial<AgentAnswer>): AgentAnswer {
  const patchProposal = normalizePatchProposal(answer.patchProposal);

  return {
    title: readString(answer.title, "Agent 建议"),
    summary: readString(answer.summary, "模型没有返回摘要。"),
    plan: readStringArray(answer.plan, ["补充实现步骤。"]),
    filesToInspect: readStringArray(answer.filesToInspect, []),
    proposedChanges: readStringArray(answer.proposedChanges, ["补充建议改动。"]),
    risks: readStringArray(answer.risks, ["补充风险点。"]),
    nextActions: readStringArray(answer.nextActions, ["补充下一步。"]),
    ...(patchProposal ? { patchProposal } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stripJsonFence(content: string) {
  return content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const values = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
  return values.length > 0 ? values : fallback;
}

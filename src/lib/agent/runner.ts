import { randomUUID } from "crypto";
import { describeContextBudget, getContextBudget } from "./context-budget";
import {
  buildApprovalProfile,
  describeApprovalProfile,
  getDefaultApprovalMode,
  normalizeApprovalMode
} from "./approval-profile";
import {
  describeContextSelection,
  selectContextFiles
} from "./context-selection";
import {
  completeWithDeepSeek,
  getDeepSeekConfig,
  hasDeepSeekKey,
  streamCompleteWithDeepSeek
} from "./deepseek";
import {
  createModelProtocolError,
  describeProtocolRepairPolicy,
  getProtocolRepairPolicy
} from "./model-protocol";
import { normalizePatchProposal } from "./patches";
import {
  buildCodingAgentMessages,
  buildProtocolRepairMessage,
  buildToolResultMessage
} from "./prompts";
import { previewPatchProposal } from "./patches";
import {
  applySessionModeToToolPolicy,
  describeAgentSessionMode,
  normalizeAgentSessionMode
} from "./session-mode";
import {
  describeToolPolicy,
  filterToolsByPolicy,
  getToolPolicy,
  isToolAllowed
} from "./tool-policy";
import {
  createToolCall,
  executeReadOnlyTool,
  isReadOnlyToolName,
  READ_ONLY_TOOL_DEFINITIONS,
  describeToolBoundaries,
  summarizeToolOutput
} from "./tools";
import type {
  AgentAnswer,
  AgentRunEvent,
  AgentRunResult,
  AgentSessionMode,
  AgentStep,
  ApprovalMode,
  ApprovalProfileSnapshot,
  ModelProtocolError,
  ModelProtocolErrorCode,
  PatchDiffPreview,
  ProtocolRepairPolicy,
  ToolPolicySnapshot,
  ToolCall,
  WorkspaceSnapshot
} from "./types";
import { listWorkspaceFiles } from "./workspace";

type RunCodingAgentInput = {
  goal: string;
  promptGoal?: string;
  resumeFromRunId?: string;
  sessionMode?: AgentSessionMode;
  approvalMode?: ApprovalMode;
  streamModel?: boolean;
  workspaceRoot: string;
  onEvent?: (event: AgentRunEvent) => void;
};

const MAX_TOOL_CALLS = 6;

export async function runCodingAgent({
  goal,
  promptGoal,
  resumeFromRunId,
  sessionMode: inputSessionMode,
  approvalMode: inputApprovalMode,
  streamModel = false,
  workspaceRoot,
  onEvent
}: RunCodingAgentInput): Promise<AgentRunResult> {
  const startedAt = new Date().toISOString();
  const steps: AgentStep[] = [];
  const config = getDeepSeekConfig();
  const contextBudget = getContextBudget();
  const sessionMode = normalizeAgentSessionMode(inputSessionMode);
  const requestedApprovalMode = normalizeApprovalMode(inputApprovalMode);
  const approvalProfile = buildApprovalProfile({
    mode: requestedApprovalMode ?? getDefaultApprovalMode(),
    sessionMode,
    source: requestedApprovalMode ? "request" : "env"
  });
  const toolPolicy = applySessionModeToToolPolicy(getToolPolicy(), sessionMode);
  const protocolRepairPolicy = getProtocolRepairPolicy();
  const availableTools = filterToolsByPolicy(READ_ONLY_TOOL_DEFINITIONS, toolPolicy);
  const modelGoal = promptGoal ?? goal;

  onEvent?.({
    type: "run_started",
    goal,
    sessionMode,
    approvalMode: approvalProfile.mode,
    startedAt,
    resumeFromRunId
  });

  pushStep(steps, "理解目标", `收到任务：${goal}`, { kind: "system" }, onEvent);
  completeLatestStep(steps, undefined, {}, onEvent);

  pushStep(
    steps,
    "应用审批配置",
    describeApprovalProfile(approvalProfile),
    {
      kind: "system"
    },
    onEvent
  );
  completeLatestStep(steps, undefined, {}, onEvent);

  pushStep(
    steps,
    "应用会话模式",
    describeAgentSessionMode(sessionMode),
    {
      kind: "system"
    },
    onEvent
  );
  completeLatestStep(steps, undefined, {}, onEvent);

  if (resumeFromRunId) {
    pushStep(
      steps,
      "恢复上下文",
      `续接本地运行记录：${resumeFromRunId}`,
      {
        kind: "system"
      },
      onEvent
    );
    completeLatestStep(steps, undefined, {}, onEvent);
  }

  pushStep(
    steps,
    "应用上下文预算",
    describeContextBudget(contextBudget),
    {
      kind: "system"
    },
    onEvent
  );
  completeLatestStep(steps, undefined, {}, onEvent);

  pushStep(
    steps,
    "应用工具策略",
    describeToolPolicy(toolPolicy),
    {
      kind: "system"
    },
    onEvent
  );
  completeLatestStep(steps, undefined, {}, onEvent);

  pushStep(
    steps,
    "应用协议修复策略",
    describeProtocolRepairPolicy(protocolRepairPolicy),
    {
      kind: "system"
    },
    onEvent
  );
  completeLatestStep(steps, undefined, {}, onEvent);

  pushStep(
    steps,
    "建立文件索引",
    "列出仓库内可读的文本文件，作为工具循环的初始地图。",
    {
      kind: "system"
    },
    onEvent
  );
  const files = await listWorkspaceFiles(workspaceRoot, {
    maxFiles: contextBudget.maxWorkspaceFiles
  });
  completeLatestStep(steps, `已索引 ${files.length} 个文本文件。`, {}, onEvent);

  pushStep(
    steps,
    "选择初始上下文",
    "根据任务目标、路径和文件类型为仓库文件打分，选择优先提供给模型的文件地图。",
    {
      kind: "system"
    },
    onEvent
  );
  const contextSelection = selectContextFiles(goal, files, {
    maxFiles: contextBudget.maxSelectedFiles
  });
  const snapshot: WorkspaceSnapshot = {
    root: workspaceRoot,
    fileCount: files.length,
    contextBudget,
    contextSelection,
    files: contextSelection.files
  };
  completeLatestStep(steps, describeContextSelection(contextSelection), {}, onEvent);

  if (!hasDeepSeekKey(config)) {
    pushStep(
      steps,
      "使用离线模式",
      "未检测到 DEEPSEEK_API_KEY，返回本地规划结果。",
      {
        kind: "system"
      },
      onEvent
    );
    completeLatestStep(steps, undefined, {}, onEvent);

    const result: AgentRunResult = {
      id: randomUUID(),
      goal,
      resumeFromRunId,
      sessionMode,
      approvalProfile,
      mode: "offline",
      model: config.model,
      startedAt,
      completedAt: new Date().toISOString(),
      steps,
      workspace: {
        root: snapshot.root,
        fileCount: snapshot.fileCount
      },
      contextBudget,
      contextSelection,
      toolPolicy,
      protocolRepairPolicy,
      protocolRepairCount: 0,
      protocolErrors: [],
      toolCallCount: 0,
      answer: buildOfflineAnswer(
        snapshot.fileCount,
        contextSelection.selectedCount,
        toolPolicy,
        sessionMode,
        approvalProfile
      )
    };

    onEvent?.({ type: "run_completed", result });
    return result;
  }

  const messages = buildCodingAgentMessages(
    modelGoal,
    snapshot,
    availableTools,
    toolPolicy,
    sessionMode,
    approvalProfile,
    MAX_TOOL_CALLS
  );
  let toolCallCount = 0;
  let modelTurnCount = 0;
  let protocolRepairCount = 0;
  const protocolErrors: ModelProtocolError[] = [];
  let model = config.model;
  let rawText: string | undefined;

  while (toolCallCount <= MAX_TOOL_CALLS) {
    modelTurnCount += 1;
    pushStep(
      steps,
      "调用 DeepSeek",
      `第 ${modelTurnCount} 轮，模型：${config.model}，base URL：${config.baseUrl}`,
      { kind: "model" },
      onEvent
    );
    const turn = modelTurnCount;
    const completion = streamModel
      ? await completeWithStreaming(messages, config, turn, onEvent)
      : await completeWithDeepSeek(messages, config);
    model = completion.model;
    rawText = completion.content;
    completeLatestStep(steps, `收到 ${completion.model} 的响应。`, {}, onEvent);

    messages.push({
      role: "assistant",
      content: completion.content
    });

    const parsed = parseModelResponse(completion.content);

    if (parsed.type === "final") {
      const answer = applyToolPolicyToAnswer(parsed.answer, toolPolicy);
      const patchPreview = answer.patchProposal
        ? await previewPatchProposal(workspaceRoot, answer.patchProposal)
        : undefined;

      return completeRunResult({
        goal,
        resumeFromRunId,
        sessionMode,
        approvalProfile,
        model,
        startedAt,
        steps,
        snapshot,
        protocolRepairPolicy,
        protocolRepairCount,
        protocolErrors,
        toolPolicy,
        toolCallCount,
        answer,
        patchPreview,
        rawText: parsed.rawText
      }, onEvent);
    }

    if (parsed.type === "invalid") {
      const canRepair = protocolRepairCount < protocolRepairPolicy.maxAttempts;
      const protocolError = createModelProtocolError({
        code: parsed.code,
        reason: parsed.reason,
        rawText: completion.content,
        repairAttempted: canRepair,
        maxRawTextLength: protocolRepairPolicy.maxRawTextLength
      });
      protocolErrors.push(protocolError);

      if (canRepair) {
        protocolRepairCount += 1;
        pushStep(
          steps,
          "修复模型协议",
          `${parsed.reason} 正在请求模型只返回合法 tool_call/final JSON。`,
          {
            kind: "model",
            ok: false
          },
          onEvent
        );
        messages.push(buildProtocolRepairMessage({
          error: protocolError,
          tools: availableTools,
          toolPolicy,
          protocolRepairPolicy
        }));
        completeLatestStep(
          steps,
          `已发送第 ${protocolRepairCount}/${protocolRepairPolicy.maxAttempts} 次协议修复提示。`,
          {},
          onEvent
        );
        continue;
      }

      return completeRunResult({
        goal,
        resumeFromRunId,
        sessionMode,
        approvalProfile,
        model,
        startedAt,
        steps,
        snapshot,
        protocolRepairPolicy,
        protocolRepairCount,
        protocolErrors,
        toolPolicy,
        toolCallCount,
        answer: buildInvalidResponseAnswer(parsed.reason, completion.content, protocolRepairCount),
        rawText: completion.content
      }, onEvent);
    }

    if (toolCallCount >= MAX_TOOL_CALLS) {
      return completeRunResult({
        goal,
        resumeFromRunId,
        sessionMode,
        approvalProfile,
        model,
        startedAt,
        steps,
        snapshot,
        protocolRepairPolicy,
        protocolRepairCount,
        protocolErrors,
        toolPolicy,
        toolCallCount,
        answer: buildToolLimitAnswer(MAX_TOOL_CALLS),
        rawText
      }, onEvent);
    }

    if (!isToolAllowed(parsed.call.name, toolPolicy)) {
      return completeRunResult({
        goal,
        resumeFromRunId,
        sessionMode,
        approvalProfile,
        model,
        startedAt,
        steps,
        snapshot,
        protocolRepairPolicy,
        protocolRepairCount,
        protocolErrors,
        toolPolicy,
        toolCallCount,
        answer: buildInvalidResponseAnswer(
          `工具 ${parsed.call.name} 不在当前 tool policy 允许列表中。`,
          completion.content
        ),
        rawText: completion.content
      }, onEvent);
    }

    toolCallCount += 1;
    onEvent?.({ type: "tool_call", call: parsed.call });
    pushStep(
      steps,
      `工具调用：${parsed.call.name}`,
      "执行服务端只读工具，并把结果回填给模型。",
      {
        kind: "tool",
        toolName: parsed.call.name,
        toolInput: parsed.call.input
      },
      onEvent
    );
    const result = await executeReadOnlyTool(parsed.call, {
      workspaceRoot,
      contextBudget
    });
    completeLatestStep(
      steps,
      result.summary,
      {
        ok: result.ok,
        toolOutput: summarizeToolOutput(result, contextBudget.maxToolOutputLength)
      },
      onEvent
    );
    messages.push(buildToolResultMessage(result));
  }

  return completeRunResult({
    goal,
    resumeFromRunId,
    sessionMode,
    approvalProfile,
    model,
    startedAt,
    steps,
    snapshot,
    protocolRepairPolicy,
    protocolRepairCount,
    protocolErrors,
    toolPolicy,
    toolCallCount,
    answer: buildToolLimitAnswer(MAX_TOOL_CALLS),
    rawText
  }, onEvent);
}

async function completeWithStreaming(
  messages: Parameters<typeof completeWithDeepSeek>[0],
  config: ReturnType<typeof getDeepSeekConfig>,
  turn: number,
  onEvent?: (event: AgentRunEvent) => void
) {
  onEvent?.({
    type: "model_stream_started",
    model: config.model,
    turn
  });

  const completion = await streamCompleteWithDeepSeek(
    messages,
    (token) => {
      onEvent?.({
        type: "model_token",
        token,
        turn
      });
    },
    config
  );

  onEvent?.({
    type: "model_stream_completed",
    model: completion.model,
    turn,
    contentLength: completion.content.length
  });

  return completion;
}

function completeRunResult(
  input: Parameters<typeof buildRunResult>[0],
  onEvent?: (event: AgentRunEvent) => void
) {
  const result = buildRunResult(input);
  onEvent?.({ type: "run_completed", result });
  return result;
}

function buildRunResult({
  goal,
  resumeFromRunId,
  sessionMode,
  approvalProfile,
  model,
  startedAt,
  steps,
  snapshot,
  contextSelection,
  protocolRepairPolicy,
  protocolRepairCount,
  protocolErrors,
  toolPolicy,
  toolCallCount,
  answer,
  patchPreview,
  rawText
}: {
  goal: string;
  resumeFromRunId?: string;
  sessionMode: AgentSessionMode;
  approvalProfile: ApprovalProfileSnapshot;
  model: string;
  startedAt: string;
  steps: AgentStep[];
  snapshot: WorkspaceSnapshot;
  contextSelection?: WorkspaceSnapshot["contextSelection"];
  protocolRepairPolicy: ProtocolRepairPolicy;
  protocolRepairCount: number;
  protocolErrors: ModelProtocolError[];
  toolPolicy: ToolPolicySnapshot;
  toolCallCount: number;
  answer: AgentAnswer;
  patchPreview?: PatchDiffPreview;
  rawText?: string;
}): AgentRunResult {
  return {
    id: randomUUID(),
    goal,
    resumeFromRunId,
    sessionMode,
    approvalProfile,
    mode: "deepseek",
    model,
    startedAt,
    completedAt: new Date().toISOString(),
    steps,
    workspace: {
      root: snapshot.root,
      fileCount: snapshot.fileCount
    },
    contextBudget: snapshot.contextBudget,
    contextSelection: contextSelection ?? snapshot.contextSelection,
    protocolRepairPolicy,
    protocolRepairCount,
    protocolErrors,
    patchPreview,
    toolPolicy,
    toolCallCount,
    answer,
    rawText
  };
}

function pushStep(
  steps: AgentStep[],
  title: string,
  detail: string,
  extra: Partial<AgentStep> = {},
  onEvent?: (event: AgentRunEvent) => void
) {
  const step: AgentStep = {
    title,
    detail,
    startedAt: new Date().toISOString(),
    ...extra
  };

  steps.push(step);
  onEvent?.({ type: "step_started", step });
}

function completeLatestStep(
  steps: AgentStep[],
  detail?: string,
  extra: Partial<AgentStep> = {},
  onEvent?: (event: AgentRunEvent) => void
) {
  const latest = steps.at(-1);

  if (!latest) {
    return;
  }

  if (detail) {
    latest.detail = detail;
  }

  latest.completedAt = new Date().toISOString();
  Object.assign(latest, extra);
  onEvent?.({ type: "step_completed", step: latest });
}

function buildOfflineAnswer(
  fileCount: number,
  selectedFileCount: number,
  toolPolicy: ToolPolicySnapshot,
  sessionMode: AgentSessionMode,
  approvalProfile: ApprovalProfileSnapshot
): AgentAnswer {
  const modeLine = describeAgentSessionMode(sessionMode);

  return {
    title: "审批配置已接入",
    summary:
      `当前运行在离线模式，session mode 为 ${sessionMode}，approval profile 为 ${approvalProfile.mode}。V0.19 已经具备 plan/agent/apply 会话模式骨架、只读工具循环、结构化补丁提案、补丁 diff 审查、人工确认后的安全应用入口、应用后验证闭环、运行历史、终端 CLI/TUI、续接上下文、Agent Event Bus、DeepSeek token streaming、上下文预算、上下文选择、可配置工具策略、模型协议修复、TUI 最近运行过滤、DeepSeek-TUI 差距规划和显式审批配置。`,
    plan: [
      `本轮会话模式：${modeLine}。`,
      `本轮审批配置：${describeApprovalProfile(approvalProfile)}。`,
      "把 Web UI 作为任务入口，收集用户的编码目标。",
      `服务端先索引当前工作区的 ${fileCount} 个文本文件，再选择 ${selectedFileCount} 个初始上下文候选。`,
      "模型通过严格 JSON 请求只读工具，服务端执行后把结果回填。",
      "模型在信息足够时输出结构化 final answer，可附带 patchProposal。",
      "用户在 UI 中审查 patchProposal 后，点击确认才会写入文件。",
      "runner 会在写入前生成 patchPreview，展示增删行数、风险标签和紧凑 diff 片段。",
      "补丁应用后可以运行白名单验证，并把 manual/post_patch 触发来源写回 run history。",
      "plan 模式会禁用 patchProposal；apply 模式会提示模型优先产出可审查补丁，但仍保持人工确认。",
      "也可以通过 npm run agent -- \"目标\" 在终端里运行同一套 agent 内核。",
      "终端可通过 --stream 查看高层步骤事件，通过 --apply 审批补丁，通过 --validate 运行白名单验证。",
      "CLI 和 Web 都可以选择历史 run，把上一轮摘要、计划、风险、补丁元信息和验证结果作为本轮上下文。",
      "Web 流式 API 会发送 run、step、model token、tool call 和 run completed 事件。",
      "V0.14 在模型输出不符合 JSON 协议时会记录错误分类，并最多发送一次受控修复提示。",
      "V0.18 在 TUI 中增加最近运行过滤、会话模式继承和更完整的运行元信息，便于学习多轮 agent 工作流。",
      "V0.19 把 ask、trusted-read、trusted-write 作为运行配置保存到 prompt、history、CLI、Web 和 TUI。"
    ],
    filesToInspect: [
      "src/app/api/agent/route.ts",
      "src/lib/agent/runner.ts",
      "src/lib/agent/tools.ts",
      "src/lib/agent/deepseek.ts",
      "src/lib/agent/workspace.ts",
      "src/cli/agent.ts",
      "src/lib/agent/patches.ts",
      "src/lib/agent/validation.ts",
      "src/lib/agent/resume.ts",
      "src/lib/agent/context-budget.ts",
      "src/lib/agent/context-selection.ts",
      "src/lib/agent/model-protocol.ts",
      "src/lib/agent/tool-policy.ts",
      "src/lib/agent/approval-profile.ts",
      "src/cli/tui.ts",
      "docs/CONTEXT_BUDGET.md",
      "docs/CONTEXT_SELECTION.md",
      "docs/MODEL_PROTOCOL.md",
      "docs/PATCH_DIFF.md",
      "docs/VALIDATION_LOOP.md",
      "docs/SESSION_MODES.md",
      "docs/TUI_SESSION.md",
      "docs/APPROVAL_PROFILES.md",
      "docs/DEEPSEEK_TUI_GAP_ANALYSIS.md",
      "src/app/api/agent/stream/route.ts"
    ],
    proposedChanges: [
      "V0.20 可以继续做 task checklist / todo workflow，让 agent 每轮输出和保存可推进的任务清单。"
    ],
    risks: [
      "当前版本默认不会自动修改文件，所有 patchProposal 写入仍需要人工确认。",
      "上下文截断很简单，大仓库需要索引、检索和 token 预算。",
      `当前工具边界：${describeToolBoundaries(READ_ONLY_TOOL_DEFINITIONS)}`,
      `当前工具策略：${describeToolPolicy(toolPolicy)}`,
      `当前审批配置：${describeApprovalProfile(approvalProfile)}`,
      "DeepSeek key 只应放在服务端环境变量，不能暴露到浏览器。"
    ],
    nextActions: [
      "复制 .env.example 为 .env.local 并填写 DEEPSEEK_API_KEY。",
      "运行 npm run dev 后在浏览器中测试任务输入。",
      "运行 npm run agent -- --stream \"查看当前仓库状态\" 测试终端 token streaming。",
      "运行 npm run agent -- --approval trusted-read \"查看当前仓库状态\" 测试审批配置透传。",
      "调整 AGENT_CONTEXT_* 环境变量测试预算收敛效果。",
      "调整 AGENT_CONTEXT_SELECTED_MAX_FILES 测试初始上下文选择数量。",
      "调整 AGENT_PROTOCOL_REPAIR_MAX_ATTEMPTS 测试协议修复策略。",
      "运行 npm run agent -- --continue <run-id> \"继续上一轮任务\" 测试恢复上下文。",
      "运行 npm run agent -- --validate typecheck \"检查当前实现\" 测试终端验证。"
    ]
  };
}

function applyToolPolicyToAnswer(
  answer: AgentAnswer,
  toolPolicy: ToolPolicySnapshot
): AgentAnswer {
  if (toolPolicy.patchProposal === "enabled" || !answer.patchProposal) {
    return answer;
  }

  const { patchProposal: _patchProposal, ...rest } = answer;

  return {
    ...rest,
    proposedChanges: [
      ...answer.proposedChanges,
      "模型返回了 patchProposal，但当前 AGENT_PATCH_PROPOSAL=disabled，服务端已按工具策略移除补丁提案。"
    ],
    risks: [
      ...answer.risks,
      "补丁提案被本地工具策略拦截，本轮不会出现可应用补丁。"
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
      code: ModelProtocolErrorCode;
      reason: string;
    };

function parseModelResponse(content: string): ParsedModelResponse {
  const normalized = normalizeJsonCandidate(content);

  try {
    const parsed = JSON.parse(normalized) as unknown;

    if (!isRecord(parsed)) {
      return {
        type: "invalid",
        code: "top_level_not_object",
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
      code: "missing_type",
      reason: "模型返回的 JSON 缺少 type=tool_call 或 type=final。"
    };
  } catch {
    return {
      type: "invalid",
      code: "non_json",
      reason: "模型返回了非 JSON 内容。"
    };
  }
}

function parseToolCall(value: unknown): ParsedModelResponse {
  if (!isRecord(value) || !isReadOnlyToolName(value.name)) {
    return {
      type: "invalid",
      code: "invalid_tool_call",
      reason: "工具调用必须包含合法的 name。"
    };
  }

  return {
    type: "tool_call",
    call: createToolCall(value.name, readRecord(value.input))
  };
}

function buildInvalidResponseAnswer(
  reason: string,
  rawText: string,
  protocolRepairCount = 0
): AgentAnswer {
  return {
    title: "模型响应无法继续执行",
    summary: `${reason}\n\n协议修复尝试：${protocolRepairCount} 次\n\n原始响应：${rawText}`,
    plan: ["调整 prompt 或模型参数，让输出稳定遵循 tool_call/final JSON 协议。"],
    filesToInspect: ["src/lib/agent/prompts.ts", "src/lib/agent/runner.ts"],
    proposedChanges: ["检查协议错误分类、repair prompt 和 DeepSeek JSON Output 配置。"],
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

function normalizeJsonCandidate(content: string) {
  const stripped = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  if (stripped.startsWith("{") && stripped.endsWith("}")) {
    return stripped;
  }

  return extractFirstJsonObject(stripped) ?? stripped;
}

function extractFirstJsonObject(content: string) {
  const start = content.indexOf("{");

  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return null;
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

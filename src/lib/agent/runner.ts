import { randomUUID } from "crypto";
import {
  completeWithDeepSeek,
  getDeepSeekConfig,
  hasDeepSeekKey
} from "./deepseek";
import { buildCodingAgentMessages } from "./prompts";
import type { AgentAnswer, AgentRunResult, AgentStep } from "./types";
import { getWorkspaceSnapshot } from "./workspace";

type RunCodingAgentInput = {
  goal: string;
  workspaceRoot: string;
};

export async function runCodingAgent({
  goal,
  workspaceRoot
}: RunCodingAgentInput): Promise<AgentRunResult> {
  const startedAt = new Date().toISOString();
  const steps: AgentStep[] = [];
  const config = getDeepSeekConfig();

  pushStep(steps, "理解目标", `收到任务：${goal}`);

  pushStep(steps, "扫描工作区", "读取仓库内的文本文件，并截取关键内容作为上下文。");
  const snapshot = await getWorkspaceSnapshot(workspaceRoot);
  completeLatestStep(steps, `已读取 ${snapshot.fileCount} 个文本文件。`);

  if (!hasDeepSeekKey(config)) {
    pushStep(steps, "使用离线模式", "未检测到 DEEPSEEK_API_KEY，返回本地规划结果。");

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
      answer: buildOfflineAnswer(snapshot.fileCount)
    };
  }

  pushStep(steps, "调用 DeepSeek", `模型：${config.model}，base URL：${config.baseUrl}`);
  const messages = buildCodingAgentMessages(goal, snapshot);
  const completion = await completeWithDeepSeek(messages, config);
  completeLatestStep(steps, `收到 ${completion.model} 的响应。`);

  const parsed = parseAgentAnswer(completion.content);

  return {
    id: randomUUID(),
    goal,
    mode: "deepseek",
    model: completion.model,
    startedAt,
    completedAt: new Date().toISOString(),
    steps,
    workspace: {
      root: snapshot.root,
      fileCount: snapshot.fileCount
    },
    answer: parsed.answer,
    rawText: parsed.rawText
  };
}

function pushStep(steps: AgentStep[], title: string, detail: string) {
  steps.push({
    title,
    detail,
    startedAt: new Date().toISOString()
  });
}

function completeLatestStep(steps: AgentStep[], detail?: string) {
  const latest = steps.at(-1);

  if (!latest) {
    return;
  }

  if (detail) {
    latest.detail = detail;
  }

  latest.completedAt = new Date().toISOString();
}

function buildOfflineAnswer(fileCount: number): AgentAnswer {
  return {
    title: "本地最小 Agent 已就绪",
    summary:
      "当前运行在离线模式。V0 已经具备仓库扫描、任务接收、步骤摘要和 DeepSeek provider 接口；配置 DEEPSEEK_API_KEY 后即可让模型基于仓库快照生成建议。",
    plan: [
      "把 Web UI 作为任务入口，收集用户的编码目标。",
      "在 API route 中运行 agent，保持服务端访问仓库和密钥。",
      `扫描当前工作区，最多采集 ${fileCount} 个文本文件作为上下文。`,
      "优先让模型输出结构化 JSON，方便 UI 呈现和后续自动化。"
    ],
    filesToInspect: [
      "src/app/api/agent/route.ts",
      "src/lib/agent/runner.ts",
      "src/lib/agent/deepseek.ts",
      "src/lib/agent/workspace.ts"
    ],
    proposedChanges: [
      "V0.2 可以加入工具调用协议，让模型先选择 read_file/list_files，再生成补丁。",
      "V0.3 可以加入补丁预览和人工确认，避免 agent 直接写坏仓库。",
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
      "实现 V0.2 的 read_file 工具调用与 patch 预览。"
    ]
  };
}

function parseAgentAnswer(content: string): { answer: AgentAnswer; rawText?: string } {
  const normalized = stripJsonFence(content);

  try {
    const parsed = JSON.parse(normalized) as Partial<AgentAnswer>;
    return {
      answer: normalizeAnswer(parsed)
    };
  } catch {
    return {
      answer: {
        title: "DeepSeek 返回了非 JSON 内容",
        summary: content,
        plan: ["调整 prompt 或模型参数，让输出稳定为 JSON。"],
        filesToInspect: [],
        proposedChanges: [],
        risks: ["UI 无法结构化展示非 JSON 响应。"],
        nextActions: ["保留原始输出，下一版增加更健壮的 JSON 修复。"]
      },
      rawText: content
    };
  }
}

function normalizeAnswer(answer: Partial<AgentAnswer>): AgentAnswer {
  return {
    title: readString(answer.title, "Agent 建议"),
    summary: readString(answer.summary, "模型没有返回摘要。"),
    plan: readStringArray(answer.plan, ["补充实现步骤。"]),
    filesToInspect: readStringArray(answer.filesToInspect, []),
    proposedChanges: readStringArray(answer.proposedChanges, ["补充建议改动。"]),
    risks: readStringArray(answer.risks, ["补充风险点。"]),
    nextActions: readStringArray(answer.nextActions, ["补充下一步。"])
  };
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

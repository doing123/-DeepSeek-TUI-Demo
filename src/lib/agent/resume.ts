import type { AgentRunRecord } from "./types";

const MAX_ITEMS_PER_SECTION = 8;

// Builds the compact handoff prompt for a resumed run.
// It keeps user-visible summaries and validation state, not hidden reasoning.
export function buildResumePromptGoal(nextGoal: string, record: AgentRunRecord) {
  const previous = record.result;
  const patchLines = record.patchProposalMeta
    ? [
        record.patchProposalMeta.summary,
        ...record.patchProposalMeta.files
          .slice(0, MAX_ITEMS_PER_SECTION)
          .map((file) =>
            `${file.action}: ${file.path}${file.explanation ? ` - ${file.explanation}` : ""}`
          )
      ]
    : ["上一轮没有保存补丁内容；如需修改文件，本轮必须重新输出 patchProposal 供用户审批。"];
  const validationLines =
    record.validations.length > 0
      ? record.validations.slice(-MAX_ITEMS_PER_SECTION).map(formatValidationLine)
      : ["上一轮没有关联验证记录。"];

  return [
    "你正在续接一个 coding-agent 运行记录。上一轮上下文只作为背景，不代表文件已经被修改。",
    "不要复述隐藏推理；请基于当前仓库状态和本轮目标继续工作。",
    "",
    "【本轮用户目标】",
    nextGoal,
    "",
    "【上一轮 run】",
    `runId: ${record.id}`,
    `title: ${previous.answer.title}`,
    `previousGoal: ${previous.goal}`,
    `mode/model: ${previous.mode}/${previous.model}`,
    `summary: ${previous.answer.summary}`,
    "",
    "【上一轮计划】",
    toBullets(previous.answer.plan),
    "",
    "【上一轮建议关注文件】",
    toBullets(previous.answer.filesToInspect),
    "",
    "【上一轮建议改动】",
    toBullets(previous.answer.proposedChanges),
    "",
    "【上一轮风险】",
    toBullets(previous.answer.risks),
    "",
    "【上一轮后续动作】",
    toBullets(previous.answer.nextActions),
    "",
    "【上一轮补丁元信息】",
    toBullets(patchLines),
    "",
    "【上一轮验证记录】",
    toBullets(validationLines),
    "",
    "请继续完成本轮目标。如果需要确认文件状态，请优先调用只读工具读取当前仓库。"
  ].join("\n");
}

export function formatResumeTitle(record: AgentRunRecord) {
  return `${record.result.answer.title} (${record.id})`;
}

function toBullets(items: string[]) {
  const lines = items.slice(0, MAX_ITEMS_PER_SECTION);
  return lines.length > 0 ? lines.map((item) => `- ${item}`).join("\n") : "- 无";
}

function formatValidationLine(validation: AgentRunRecord["validations"][number]) {
  const status = validation.ok ? "ok" : "failed";
  const trigger = validation.trigger ?? "manual";
  const output = validation.ok ? "" : `; output=${compactOutput(validation.stderr || validation.stdout)}`;

  return `${trigger}: ${status}: ${validation.displayCommand} exit=${validation.exitCode ?? "unknown"} (${validation.durationMs}ms)${output}`;
}

function compactOutput(output: string) {
  const oneLine = output.replace(/\s+/g, " ").trim();

  if (!oneLine) {
    return "no output";
  }

  return oneLine.length > 500 ? `${oneLine.slice(0, 500)}...` : oneLine;
}

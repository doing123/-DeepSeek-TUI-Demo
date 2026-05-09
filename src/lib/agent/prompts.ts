import type { AgentMessage, WorkspaceSnapshot } from "./types";

export function buildCodingAgentMessages(goal: string, snapshot: WorkspaceSnapshot): AgentMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是一个面向学习的 agent 编码工具内核。",
        "你的任务是根据用户目标和仓库快照，给出可执行的编码建议。",
        "不要输出逐字隐藏推理。只保留高层实现步骤、取舍、风险和下一步。",
        "必须返回严格 JSON，不要使用 Markdown 代码块。",
        "JSON schema: {\"title\": string, \"summary\": string, \"plan\": string[], \"filesToInspect\": string[], \"proposedChanges\": string[], \"risks\": string[], \"nextActions\": string[]}"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          goal,
          workspace: {
            root: snapshot.root,
            fileCount: snapshot.fileCount,
            files: snapshot.files
          }
        },
        null,
        2
      )
    }
  ];
}

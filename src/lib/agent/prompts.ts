import type { AgentMessage, ToolDefinition, ToolResult, WorkspaceSnapshot } from "./types";

export function buildCodingAgentMessages(
  goal: string,
  snapshot: WorkspaceSnapshot,
  tools: ToolDefinition[],
  maxToolCalls: number
): AgentMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是一个面向学习的 agent 编码工具内核。",
        "你的任务是根据用户目标，使用只读工具理解仓库，然后给出可执行的编码建议。",
        "不要输出逐字隐藏推理。只保留高层实现步骤、取舍、风险和下一步。",
        "当前版本禁止写文件、执行 shell、修改 git、联网搜索或调用未列出的工具。",
        `最多请求 ${maxToolCalls} 次工具。信息足够时必须给 final。`,
        "必须返回严格 JSON，不要使用 Markdown 代码块。",
        "如果需要工具，返回：{\"type\":\"tool_call\",\"tool\":{\"name\":\"list_files|read_file|search_text\",\"input\":{...}}}",
        "如果完成任务，返回：{\"type\":\"final\",\"answer\":{\"title\": string, \"summary\": string, \"plan\": string[], \"filesToInspect\": string[], \"proposedChanges\": string[], \"risks\": string[], \"nextActions\": string[]}}",
        "不要同时返回 tool_call 和 final。不要编造未读取过的文件内容。"
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
            files: snapshot.files.map((file) => ({
              path: file.path,
              size: file.size
            }))
          },
          availableTools: tools
        },
        null,
        2
      )
    }
  ];
}

export function buildToolResultMessage(result: ToolResult): AgentMessage {
  return {
    role: "user",
    content: JSON.stringify(
      {
        type: "tool_result",
        result
      },
      null,
      2
    )
  };
}

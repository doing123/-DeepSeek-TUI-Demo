import type {
  AgentMessage,
  ToolDefinition,
  ToolPolicySnapshot,
  ToolResult,
  WorkspaceSnapshot
} from "./types";

export function buildCodingAgentMessages(
  goal: string,
  snapshot: WorkspaceSnapshot,
  tools: ToolDefinition[],
  toolPolicy: ToolPolicySnapshot,
  maxToolCalls: number
): AgentMessage[] {
  const toolNames = tools.map((tool) => tool.name).join("|");
  const patchInstruction = toolPolicy.patchProposal === "enabled"
    ? "只有当用户明确要求实现代码或修改文件时，才返回 patchProposal。"
    : "当前 tool policy 禁用了 patchProposal；final answer 只能给建议、计划和风险，不能返回 patchProposal。";

  return [
    {
      role: "system",
      content: [
        "你是一个面向学习的 agent 编码工具内核。",
        "你的任务是根据用户目标，使用只读工具理解仓库，然后给出可执行的编码建议。",
        "不要输出逐字隐藏推理。只保留高层实现步骤、取舍、风险和下一步。",
        "当前版本禁止写文件、执行 shell、修改 git、联网搜索或调用未列出的工具。",
        "工具定义包含 category、risk、approvalRequired。当前模型只允许请求 category=read 且 approvalRequired=false 的工具。",
        "写文件、补丁应用和验证命令只能通过用户确认后的本地入口执行，不能由模型直接调用。",
        `当前 tool policy：read tools=[${toolPolicy.allowedReadTools.join(", ")}]，patchProposal=${toolPolicy.patchProposal}，validation=${toolPolicy.validationCommands}。`,
        "workspace.files 是服务端按 contextSelection 选出的初始候选文件；如信息不足，应继续用 list_files/search_text/read_file 扩展上下文。",
        `最多请求 ${maxToolCalls} 次工具。信息足够时必须给 final。`,
        "必须返回严格 JSON，不要使用 Markdown 代码块。",
        `如果需要工具，返回：{"type":"tool_call","tool":{"name":"${toolNames}","input":{...}}}`,
        "如果完成任务，返回：{\"type\":\"final\",\"answer\":{\"title\": string, \"summary\": string, \"plan\": string[], \"filesToInspect\": string[], \"proposedChanges\": string[], \"risks\": string[], \"nextActions\": string[], \"patchProposal\"?: {\"summary\": string, \"files\": [{\"path\": string, \"action\": \"create\"|\"replace\", \"content\": string, \"explanation\"?: string}]}}}",
        patchInstruction,
        "patchProposal 必须使用完整文件内容；path 必须是仓库相对路径；禁止修改 .env、.git、node_modules、.next 或二进制文件。",
        "patchProposal 只是提案，服务端会等用户确认后再应用。",
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
            contextBudget: snapshot.contextBudget,
            contextSelection: snapshot.contextSelection,
            files: snapshot.files.map((file) => ({
              path: file.path,
              size: file.size,
              ...("score" in file ? { score: file.score } : {}),
              ...("reasons" in file ? { reasons: file.reasons } : {})
            }))
          },
          toolPolicy,
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

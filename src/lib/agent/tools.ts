import { randomUUID } from "crypto";
import type {
  ReadOnlyToolName,
  ToolCall,
  ToolDefinition,
  ToolResult
} from "./types";
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  searchWorkspaceText
} from "./workspace";

export const READ_ONLY_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "list_files",
    description: "List text-like files in the current workspace. Use this before reading files.",
    inputSchema: {
      type: "object",
      properties: {
        maxFiles: {
          type: "number",
          description: "Maximum number of files to return. Default 80, max 160."
        }
      }
    }
  },
  {
    name: "read_file",
    description: "Read a single workspace-relative text file with truncation.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative path, for example src/lib/agent/runner.ts."
        },
        maxLength: {
          type: "number",
          description: "Maximum characters to return. Default 12000, max 20000."
        }
      }
    }
  },
  {
    name: "search_text",
    description: "Search text-like workspace files for a case-insensitive query.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Text query to search for."
        },
        maxMatches: {
          type: "number",
          description: "Maximum line matches to return. Default 24, max 60."
        }
      }
    }
  }
];

export function createToolCall(name: ReadOnlyToolName, input: Record<string, unknown>): ToolCall {
  return {
    id: randomUUID(),
    name,
    input
  };
}

export function isReadOnlyToolName(value: unknown): value is ReadOnlyToolName {
  return (
    value === "list_files" ||
    value === "read_file" ||
    value === "search_text"
  );
}

export async function executeReadOnlyTool(
  call: ToolCall,
  context: { workspaceRoot: string }
): Promise<ToolResult> {
  try {
    if (call.name === "list_files") {
      const maxFiles = readNumber(call.input.maxFiles, 80, 1, 160);
      const files = await listWorkspaceFiles(context.workspaceRoot, { maxFiles });

      return {
        callId: call.id,
        name: call.name,
        ok: true,
        summary: `Listed ${files.length} workspace files.`,
        output: {
          files
        }
      };
    }

    if (call.name === "read_file") {
      const filePath = readRequiredString(call.input.path, "path");
      const maxLength = readNumber(call.input.maxLength, 12_000, 500, 20_000);
      const file = await readWorkspaceFile(context.workspaceRoot, filePath, { maxLength });

      return {
        callId: call.id,
        name: call.name,
        ok: true,
        summary: `Read ${file.path}${file.truncated ? " with truncation" : ""}.`,
        output: file
      };
    }

    const query = readRequiredString(call.input.query, "query");
    const maxMatches = readNumber(call.input.maxMatches, 24, 1, 60);
    const matches = await searchWorkspaceText(context.workspaceRoot, query, { maxMatches });

    return {
      callId: call.id,
      name: call.name,
      ok: true,
      summary: `Found ${matches.length} matches for "${query}".`,
      output: {
        query,
        matches
      }
    };
  } catch (error) {
    return {
      callId: call.id,
      name: call.name,
      ok: false,
      summary: error instanceof Error ? error.message : "Tool execution failed.",
      error: error instanceof Error ? error.message : "Tool execution failed."
    };
  }
}

export function summarizeToolOutput(result: ToolResult) {
  const compact = JSON.stringify(result.output ?? result.error ?? null, null, 2);

  if (compact.length <= 1400) {
    return compact;
  }

  return `${compact.slice(0, 1400)}\n...`;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function readNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

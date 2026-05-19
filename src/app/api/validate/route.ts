import { NextResponse } from "next/server";
import {
  isValidationCommandName,
  runValidationCommand
} from "@/lib/agent/validation";
import { appendValidationToRun } from "@/lib/agent/run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const command = readCommand(payload);
  const runId = readRunId(payload);

  if (!isValidationCommandName(command)) {
    return NextResponse.json(
      {
        error: "command 只能是 typecheck 或 build。"
      },
      { status: 400 }
    );
  }

  const result = await runValidationCommand(process.cwd(), command);

  if (runId) {
    await appendValidationToRun(process.cwd(), runId, result);
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

function readCommand(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("command" in payload)) {
    return null;
  }

  return (payload as { command?: unknown }).command;
}

function readRunId(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("runId" in payload)) {
    return null;
  }

  const value = (payload as { runId?: unknown }).runId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

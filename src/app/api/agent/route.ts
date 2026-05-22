import { NextResponse } from "next/server";
import { buildResumePromptGoal } from "@/lib/agent/resume";
import { runCodingAgent } from "@/lib/agent/runner";
import { normalizeAgentSessionMode } from "@/lib/agent/session-mode";
import {
  readAgentRunRecord,
  saveAgentRunRecord
} from "@/lib/agent/run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const goal = readGoal(payload);

  if (!goal) {
    return NextResponse.json({ error: "请提供非空的 goal 字段。" }, { status: 400 });
  }

  if (goal.length > 4000) {
    return NextResponse.json({ error: "goal 不能超过 4000 个字符。" }, { status: 400 });
  }

  try {
    const resumeRunId = readOptionalString(payload, "resumeRunId");
    const sessionMode = normalizeAgentSessionMode(readOptionalString(payload, "sessionMode"));
    const resumeRecord = resumeRunId
      ? await readAgentRunRecord(process.cwd(), resumeRunId)
      : null;

    if (resumeRunId && !resumeRecord) {
      return NextResponse.json({ error: "找不到要继续的运行记录。" }, { status: 404 });
    }

    const promptGoal = resumeRecord
      ? buildResumePromptGoal(goal, resumeRecord)
      : goal;

    const result = await runCodingAgent({
      goal,
      promptGoal,
      resumeFromRunId: resumeRecord?.id,
      sessionMode,
      workspaceRoot: process.cwd()
    });

    await saveAgentRunRecord(process.cwd(), result);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Agent 运行失败。"
      },
      { status: 500 }
    );
  }
}

function readGoal(payload: unknown) {
  return readOptionalString(payload, "goal");
}

function readOptionalString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || !(key in payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

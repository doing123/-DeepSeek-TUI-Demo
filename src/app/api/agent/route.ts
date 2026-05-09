import { NextResponse } from "next/server";
import { runCodingAgent } from "@/lib/agent/runner";

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
    const result = await runCodingAgent({
      goal,
      workspaceRoot: process.cwd()
    });

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
  if (!payload || typeof payload !== "object" || !("goal" in payload)) {
    return null;
  }

  const value = (payload as { goal?: unknown }).goal;
  return typeof value === "string" ? value.trim() : null;
}

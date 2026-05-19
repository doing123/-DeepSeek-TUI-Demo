import { NextResponse } from "next/server";
import {
  isValidationCommandName,
  runValidationCommand
} from "@/lib/agent/validation";

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

  if (!isValidationCommandName(command)) {
    return NextResponse.json(
      {
        error: "command 只能是 typecheck 或 build。"
      },
      { status: 400 }
    );
  }

  const result = await runValidationCommand(process.cwd(), command);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

function readCommand(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("command" in payload)) {
    return null;
  }

  return (payload as { command?: unknown }).command;
}

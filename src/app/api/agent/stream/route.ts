import { buildResumePromptGoal } from "@/lib/agent/resume";
import { runCodingAgent } from "@/lib/agent/runner";
import {
  readAgentRunRecord,
  saveAgentRunRecord
} from "@/lib/agent/run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streaming agent endpoint for browser/TUI-style consumers.
// It sends Server-Sent Events so the UI can render runner events immediately
// while the final saved result still uses the same run store as POST /api/agent.
export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const goal = readOptionalString(payload, "goal");

  if (!goal) {
    return Response.json({ error: "请提供非空的 goal 字段。" }, { status: 400 });
  }

  if (goal.length > 4000) {
    return Response.json({ error: "goal 不能超过 4000 个字符。" }, { status: 400 });
  }

  const resumeRunId = readOptionalString(payload, "resumeRunId");
  const resumeRecord = resumeRunId
    ? await readAgentRunRecord(process.cwd(), resumeRunId)
    : null;

  if (resumeRunId && !resumeRecord) {
    return Response.json({ error: "找不到要继续的运行记录。" }, { status: 404 });
  }

  const promptGoal = resumeRecord
    ? buildResumePromptGoal(goal, resumeRecord)
    : goal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void runAndStreamEvents({
        controller,
        encoder,
        goal,
        promptGoal,
        resumeFromRunId: resumeRecord?.id
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive"
    }
  });
}

async function runAndStreamEvents({
  controller,
  encoder,
  goal,
  promptGoal,
  resumeFromRunId
}: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  goal: string;
  promptGoal: string;
  resumeFromRunId?: string;
}) {
  try {
    const result = await runCodingAgent({
      goal,
      promptGoal,
      resumeFromRunId,
      streamModel: true,
      workspaceRoot: process.cwd(),
      onEvent: (event) => sendSseEvent(controller, encoder, "agent_event", event)
    });

    await saveAgentRunRecord(process.cwd(), result);
    sendSseEvent(controller, encoder, "done", { runId: result.id });
  } catch (error) {
    sendSseEvent(controller, encoder, "error", {
      error: error instanceof Error ? error.message : "Agent 运行失败。"
    });
  } finally {
    controller.close();
  }
}

function sendSseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: string,
  data: unknown
) {
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  );
}

function readOptionalString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || !(key in payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

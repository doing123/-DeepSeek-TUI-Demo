import { NextResponse } from "next/server";
import {
  listAgentRunSummaries,
  readAgentRunRecord
} from "@/lib/agent/run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("id");

  if (runId) {
    const record = await readAgentRunRecord(process.cwd(), runId);

    if (!record) {
      return NextResponse.json({ error: "Run record not found." }, { status: 404 });
    }

    return NextResponse.json(record);
  }

  const runs = await listAgentRunSummaries(process.cwd());
  return NextResponse.json({ runs });
}

import { NextResponse } from "next/server";
import { applyPatchProposal } from "@/lib/agent/patches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const proposal = readProposal(payload);

  if (!proposal) {
    return NextResponse.json({ error: "请提供 patchProposal 字段。" }, { status: 400 });
  }

  const result = await applyPatchProposal(process.cwd(), proposal);
  const status = result.ok ? 200 : 400;

  return NextResponse.json(result, { status });
}

function readProposal(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("patchProposal" in payload)) {
    return null;
  }

  return (payload as { patchProposal?: unknown }).patchProposal;
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listSubscriberSegments, saveSubscriberSegment } from "@/lib/store";
import type { AudienceFilters } from "@/lib/types";

export async function GET() {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const segments = await listSubscriberSegments(session.workspaceId);
  return NextResponse.json({ segments }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const body = (await request.json()) as { id?: string; name: string; description?: string; filters: AudienceFilters };
    if (!body.name || !body.name.trim()) throw new Error("Segment name is required");

    const segment = await saveSubscriberSegment({
      id: body.id,
      name: body.name.trim(),
      description: body.description?.trim(),
      filters: body.filters || {},
      workspaceId: session.workspaceId,
    });

    return NextResponse.json({ ok: true, segment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save segment" },
      { status: 400 }
    );
  }
}

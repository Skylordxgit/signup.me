import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listPushSubscribers } from "@/lib/store";
import { estimateAudience } from "@/lib/audienceTargeting";
import type { AudienceFilters } from "@/lib/types";

export async function POST(request: NextRequest) {
  const session = await requireAdmin('notifications');
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const body = await request.json() as { filters?: AudienceFilters } | null;
    const filters = body?.filters;

    const summary = await listPushSubscribers(session.workspaceId);
    const subscribers = (summary.recent || []).map(s => ({
      id: s.id,
      pageId: s.pageId,
      slug: s.slug,
      endpointHash: '',
      userAgent: '',
      createdAt: s.createdAt,
      updatedAt: s.createdAt,
      details: s,
      isActive: s.isActive,
    }));

    const estimate = estimateAudience(subscribers, filters);
    return NextResponse.json(estimate);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Estimation failed" },
      { status: 400 }
    );
  }
}

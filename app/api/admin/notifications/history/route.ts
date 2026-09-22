import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listNotificationHistory } from "@/lib/store";

export async function GET(request: NextRequest) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId") ? Number(searchParams.get("campaignId")) : undefined;
  const country = searchParams.get("country") || undefined;
  const city = searchParams.get("city") || undefined;
  const device = searchParams.get("device") || undefined;
  const status = searchParams.get("status") || undefined;
  const search = searchParams.get("search") || undefined;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const offset = Math.max(0, Number(searchParams.get("offset") || 0));

  const { items, total } = await listNotificationHistory(session.workspaceId, {
    campaignId: Number.isFinite(campaignId) ? campaignId : undefined,
    country,
    city,
    device,
    status,
    search,
    limit,
    offset,
  });

  return NextResponse.json({ items, total, limit, offset }, { headers: { "Cache-Control": "private, no-store" } });
}

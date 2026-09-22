import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listNotificationHistory } from "@/lib/store";

export async function GET(request: NextRequest) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId") ? Number(searchParams.get("campaignId")) : undefined;
  const status = (searchParams.get("status") as "sent" | "delivered" | "clicked" | "failed") || undefined;
  const country = searchParams.get("country") || undefined;
  const device = searchParams.get("device") || undefined;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 100));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const result = await listNotificationHistory(session.workspaceId, {
    campaignId,
    status,
    country,
    device,
    limit,
    offset,
  });

  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listNotificationCampaigns, listPushSubscribers } from "@/lib/store";
import { webPushConfigured } from "@/lib/push";

export async function GET() {
  const session = await requireAdmin('notifications');
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  return NextResponse.json({
    configured: webPushConfigured(),
    subscribers: await listPushSubscribers(session.workspaceId),
    campaigns: await listNotificationCampaigns(session.workspaceId),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

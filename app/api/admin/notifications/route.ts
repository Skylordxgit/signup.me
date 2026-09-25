import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listNotificationCampaigns, listPushSubscribers, listSubscriberSegments } from "@/lib/store";
import { isWebPushConfigured } from "@/lib/push";
import { getWorkspaceDistinctLocations } from "@/lib/audienceTargeting";

export async function GET() {
  const session = await requireAdmin('notifications');
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const [subscribersSummary, campaigns, segments, configured] = await Promise.all([
    listPushSubscribers(session.workspaceId),
    listNotificationCampaigns(session.workspaceId),
    listSubscriberSegments(session.workspaceId),
    isWebPushConfigured(),
  ]);

  // Extract distinct locations available in this workspace
  const subscribers = subscribersSummary.recent || [];
  const locations = getWorkspaceDistinctLocations(subscribers.map(s => ({
    id: s.id,
    pageId: s.pageId,
    slug: s.slug,
    endpointHash: '',
    userAgent: '',
    createdAt: s.createdAt,
    updatedAt: s.createdAt,
    details: s,
    isActive: s.isActive,
  })));

  return NextResponse.json({
    configured,
    subscribers: subscribersSummary,
    campaigns,
    locations,
    segments,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

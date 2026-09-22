import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteNotificationCampaign, getNotificationCampaignById, listNotificationHistory, sendPushNotification, updateNotificationCampaign } from "@/lib/store";
import type { CampaignStatus, NotificationCampaign } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });

  const campaign = await getNotificationCampaignById(numId, session.workspaceId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { items: logs } = await listNotificationHistory(session.workspaceId, { campaignId: numId, limit: 100 });

  return NextResponse.json({ campaign, logs });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const campaign = await getNotificationCampaignById(numId, session.workspaceId);
    if (!campaign) throw new Error("Campaign not found");

    if (action === "send_now") {
      // Trigger send for draft/scheduled campaign
      const sendResult = await sendPushNotification({
        campaignId: campaign.id,
        name: campaign.name,
        title: campaign.title,
        body: campaign.body,
        url: campaign.url,
        image: campaign.image,
        icon: campaign.icon,
        badge: campaign.badge,
        ctaText: campaign.ctaText,
        pageId: campaign.pageId,
        workspaceId: session.workspaceId,
        targetFilters: campaign.targetFilters,
      });
      return NextResponse.json({ ok: true, ...sendResult });
    }

    if (action === "pause") {
      const updated = await updateNotificationCampaign(numId, { status: "paused" }, session.workspaceId);
      return NextResponse.json({ ok: true, campaign: updated });
    }

    if (action === "resume") {
      const updated = await updateNotificationCampaign(numId, { status: campaign.scheduledAt ? "scheduled" : "completed" }, session.workspaceId);
      return NextResponse.json({ ok: true, campaign: updated });
    }

    if (action === "cancel") {
      const updated = await updateNotificationCampaign(numId, { status: "cancelled" }, session.workspaceId);
      return NextResponse.json({ ok: true, campaign: updated });
    }

    // Standard edit patch for draft/scheduled campaigns
    const patch: Partial<NotificationCampaign> = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.body === "string") patch.body = body.body.trim();
    if (typeof body.url === "string") patch.url = body.url.trim();
    if (typeof body.scheduledAt === "string" || body.scheduledAt === null) patch.scheduledAt = body.scheduledAt;
    if (typeof body.status === "string") patch.status = body.status as CampaignStatus;
    if (body.targetFilters && typeof body.targetFilters === "object") patch.targetFilters = body.targetFilters;

    const updated = await updateNotificationCampaign(numId, patch, session.workspaceId);
    return NextResponse.json({ ok: true, campaign: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Campaign update failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });

  const success = await deleteNotificationCampaign(numId, session.workspaceId);
  return NextResponse.json({ ok: success });
}

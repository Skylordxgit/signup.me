import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pageForSession } from "@/lib/workspaceAccess";
import { createNotificationCampaign, listNotificationCampaigns, sendPushNotification } from "@/lib/store";
import { isNotificationUrl } from "@/lib/notificationUrl";
import type { AudienceFilters, CampaignStatus } from "@/lib/types";

export async function GET(request: NextRequest) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const query = searchParams.get("query")?.toLowerCase();

  let campaigns = await listNotificationCampaigns(session.workspaceId);

  if (statusFilter && statusFilter !== "all") {
    campaigns = campaigns.filter((c) => c.status === statusFilter);
  }

  if (query) {
    campaigns = campaigns.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(query)) ||
        c.title.toLowerCase().includes(query) ||
        c.body.toLowerCase().includes(query) ||
        c.url.toLowerCase().includes(query) ||
        (c.audience && c.audience.toLowerCase().includes(query))
    );
  }

  return NextResponse.json({ campaigns }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown> | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const message = typeof body?.body === "string" ? body.body.trim() : "";
    const url = typeof body?.url === "string" ? body.url.trim() : "/";
    const pageId = typeof body?.pageId === "number" && Number.isFinite(body.pageId) ? body.pageId : null;
    const image = typeof body?.image === "string" ? body.image.trim() : null;
    const icon = typeof body?.icon === "string" ? body.icon.trim() : null;
    const badge = typeof body?.badge === "string" ? body.badge.trim() : null;
    const ctaText = typeof body?.ctaText === "string" ? body.ctaText.trim() : null;
    const scheduledAt = typeof body?.scheduledAt === "string" ? body.scheduledAt.trim() : null;
    const timezone = typeof body?.timezone === "string" ? body.timezone.trim() : "";
    const priority = body?.priority === "urgent" || body?.priority === "high" ? body.priority : "normal";
    const status = (body?.status as CampaignStatus) || (scheduledAt ? "scheduled" : "completed");
    const targetFilters = (body?.targetFilters as AudienceFilters) || {};

    if (!title) throw new Error("Notification title is required");
    if (!message) throw new Error("Notification message is required");
    if (title.length > 80) throw new Error("Keep the title under 80 characters");
    if (message.length > 180) throw new Error("Keep the message under 180 characters");
    if (!isNotificationUrl(url)) throw new Error("Enter a full HTTPS link or a page path starting with /");

    if (pageId !== null) await pageForSession(session, pageId);

    const input = {
      name: name || title,
      title,
      body: message,
      url,
      pageId,
      image,
      icon,
      badge,
      ctaText,
      scheduledAt,
      timezone,
      priority,
      status,
      targetFilters,
      workspaceId: session.workspaceId,
    };

    if (status === "draft" || status === "scheduled") {
      const campaign = await createNotificationCampaign(input);
      return NextResponse.json({ ok: true, campaign });
    }

    // Send immediately
    const result = await sendPushNotification(input);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Notification failed" },
      { status: 400 }
    );
  }
}

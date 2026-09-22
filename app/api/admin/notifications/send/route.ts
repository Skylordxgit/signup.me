import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pageForSession } from "@/lib/workspaceAccess";
import { sendPushNotification } from "@/lib/store";
import { isNotificationUrl } from '@/lib/notificationUrl';
import type { AudienceFilters } from "@/lib/types";

export async function POST(request: NextRequest) {
  const session = await requireAdmin('notifications');
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown> | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const message = typeof body?.body === "string" ? body.body.trim() : "";
    const url = typeof body?.url === "string" ? body.url.trim() : "/";
    const pageId = typeof body?.pageId === "number" && Number.isFinite(body.pageId) ? body.pageId : null;
    const image = typeof body?.image === "string" ? body.image.trim() : null;
    const icon = typeof body?.icon === "string" ? body.icon.trim() : null;
    const badge = typeof body?.badge === "string" ? body.badge.trim() : null;
    const ctaText = typeof body?.ctaText === "string" ? body.ctaText.trim() : null;
    const priority = body?.priority === "urgent" || body?.priority === "high" ? body.priority : "normal";
    const targetFilters = (body?.targetFilters as AudienceFilters) || {};

    if (!title) throw new Error("Notification title is required");
    if (!message) throw new Error("Notification message is required");
    if (title.length > 80) throw new Error("Keep the title under 80 characters");
    if (message.length > 180) throw new Error("Keep the message under 180 characters");
    if (!isNotificationUrl(url)) throw new Error('Enter a full HTTPS link or a page path starting with /');
    // A page id from the client only counts when it is in this workspace.
    if (pageId !== null) await pageForSession(session, pageId);

    return NextResponse.json(await sendPushNotification({
      name: name || title,
      title,
      body: message,
      url,
      pageId,
      image,
      icon,
      badge,
      ctaText,
      priority,
      targetFilters,
      workspaceId: session.workspaceId,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Notification failed" },
      { status: 400 },
    );
  }
}

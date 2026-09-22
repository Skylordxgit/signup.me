import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteNotificationTemplate, listNotificationTemplates, saveNotificationTemplate } from "@/lib/store";
import type { NotificationTemplate } from "@/lib/types";

export async function GET() {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const templates = await listNotificationTemplates(session.workspaceId);
  return NextResponse.json({ templates }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const body = (await request.json()) as Partial<NotificationTemplate>;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const message = typeof body?.body === "string" ? body.body.trim() : "";

    if (!name) throw new Error("Template name is required");
    if (!title) throw new Error("Notification title is required");
    if (!message) throw new Error("Notification message is required");

    const saved = await saveNotificationTemplate({
      ...body,
      name,
      title,
      body: message,
      workspaceId: session.workspaceId,
    });

    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save template" },
      { status: 400 }
    );
  }
}

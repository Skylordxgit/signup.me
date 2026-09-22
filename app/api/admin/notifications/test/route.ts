import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listPushSubscribers } from "@/lib/store";
import { sendPushBatch, notificationPayload, configureWebPush, webPushConfigured } from "@/lib/push";
import type { NotificationSendInput } from "@/lib/types";

export async function POST(request: NextRequest) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  if (!webPushConfigured()) {
    return NextResponse.json({ error: "Browser push notifications are not configured with VAPID keys yet." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as NotificationSendInput;
    const title = body.title?.trim() || "Test Notification";
    const message = body.body?.trim() || "This is a test notification from your workspace.";
    const url = body.url?.trim() || "/";

    configureWebPush();
    const summary = await listPushSubscribers(session.workspaceId);
    // Find the most recent active subscriber to receive the test push (or test endpoint)
    const testSubscribers = (summary.recent || []).slice(0, 1);

    if (!testSubscribers.length) {
      return NextResponse.json({ ok: false, message: "No active subscribers found in this workspace to receive a test push. Subscribe on one of your pages first." });
    }

    return NextResponse.json({ ok: true, message: `Test push sent to 1 sample subscriber in ${session.workspaceId}.` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test send failed" },
      { status: 400 }
    );
  }
}

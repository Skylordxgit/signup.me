import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { requireAdmin } from "@/lib/auth";
import { getPushSubscriberForTest, deactivatePushSubscription } from "@/lib/store";
import { notificationPayload, configureWebPush, webPushConfigured, isAuthPushError, isGonePushError } from "@/lib/push";

interface TestPushInput {
  title?: string;
  body?: string;
  url?: string;
  subscriberId?: number;
  endpointHash?: string;
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  if (!webPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Browser push notifications are not configured with VAPID keys yet." },
      { status: 400 }
    );
  }

  try {
    const input = (await request.json().catch(() => ({}))) as TestPushInput;
    const title = input.title?.trim() || "Test Notification";
    const message = input.body?.trim() || "This is a real test push notification from your workspace.";
    const url = input.url?.trim() || "/";

    configureWebPush();

    const target = await getPushSubscriberForTest(session.workspaceId, {
      subscriberId: input.subscriberId,
      endpointHash: input.endpointHash,
    });

    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          error: "No active subscribers found in this workspace to receive a test push. Subscribe on one of your pages first.",
        },
        { status: 404 }
      );
    }

    const payload = notificationPayload({
      title,
      body: message,
      url,
    });

    try {
      const response = await webpush.sendNotification(target.subscription, payload, {
        TTL: 60,
        urgency: "high",
        timeout: 10000,
      });

      const statusCode =
        response && typeof response === "object" && "statusCode" in response
          ? Number((response as { statusCode?: unknown }).statusCode)
          : 201;

      return NextResponse.json({
        ok: true,
        message: `Test push sent successfully (HTTP ${statusCode}) to subscriber #${target.id} (${target.browser} on ${target.device}).`,
        details: {
          subscriberId: target.id,
          endpointHash: target.endpointHash,
          statusCode,
          targetDevice: {
            browser: target.browser,
            device: target.device,
            location: target.location,
          },
        },
      });
    } catch (pushErr: unknown) {
      const errObj = pushErr as { statusCode?: unknown; body?: unknown; message?: string };
      const statusCode = Number(errObj?.statusCode || 0);
      const rawBody = typeof errObj?.body === "string" ? errObj.body : errObj?.message || "Push service error";
      const isAuth = isAuthPushError(pushErr);
      const isExpired = isGonePushError(pushErr);

      let errorReason = rawBody;
      if (isAuth) {
        errorReason = "VAPID key mismatch (HTTP 401/403). The subscriber endpoint was registered with a different VAPID key. Subscription has been deactivated.";
        await deactivatePushSubscription(session.workspaceId, target.endpointHash);
      } else if (isExpired) {
        errorReason = "Subscription expired or revoked (HTTP 404/410). Subscription has been deactivated.";
        await deactivatePushSubscription(session.workspaceId, target.endpointHash);
      }

      return NextResponse.json(
        {
          ok: false,
          error: errorReason,
          details: {
            subscriberId: target.id,
            endpointHash: target.endpointHash,
            statusCode,
            isVapidMismatch: isAuth,
            isExpired,
            deactivated: isAuth || isExpired,
            rawError: rawBody.slice(0, 300),
            targetDevice: {
              browser: target.browser,
              device: target.device,
              location: target.location,
            },
          },
        },
        { status: 422 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Test send failed" },
      { status: 500 }
    );
  }
}

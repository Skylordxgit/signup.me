import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getVapidDiagnostic } from "@/lib/push";
import { listPushSubscribers } from "@/lib/store";

export async function GET() {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const diagnostic = getVapidDiagnostic();
    const subscriberData = await listPushSubscribers(session.workspaceId);

    return NextResponse.json({
      ...diagnostic,
      subscribers: {
        active: (subscriberData.total ?? 0) - (subscriberData.inactive ?? 0),
        inactive: subscriberData.inactive ?? 0,
        total: subscriberData.total ?? 0,
        recent: (subscriberData.recent || []).slice(0, 5).map(s => ({
          id: s.id,
          browser: s.browser,
          device: s.device,
          city: s.city,
          country: s.country,
          isActive: s.isActive,
          createdAt: s.createdAt,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get VAPID status" },
      { status: 500 }
    );
  }
}

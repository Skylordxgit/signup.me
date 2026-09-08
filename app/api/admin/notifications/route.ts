import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listPushSubscribers } from "@/lib/store";
import { webPushConfigured } from "@/lib/push";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  return NextResponse.json({
    configured: webPushConfigured(),
    subscribers: await listPushSubscribers(),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

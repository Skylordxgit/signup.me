import { NextRequest, NextResponse } from "next/server";
import { trackNotificationCampaignClick } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown> | null;
    const campaignId = Number(body?.campaignId);
    await trackNotificationCampaignClick(campaignId);
  } catch {
    // Tracking must never block the visitor from opening the notification link.
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

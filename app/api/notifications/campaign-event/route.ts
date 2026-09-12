import { NextRequest, NextResponse } from 'next/server';
import { recordNotificationCampaignEvent } from '@/lib/store';

const events = new Set(['delivered', 'seen', 'clicked']);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const campaignId = Number(body.campaignId);
    const event = typeof body.event === 'string' ? body.event : '';
    if (!Number.isFinite(campaignId) || !events.has(event)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    await recordNotificationCampaignEvent(campaignId, event as 'delivered' | 'seen' | 'clicked');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

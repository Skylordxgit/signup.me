import { NextRequest, NextResponse } from "next/server";
import { isPushSubscription } from "@/lib/push";
import { savePushSubscription } from "@/lib/store";
import { isValidSlug } from "@/lib/utils";
import { collectSubscriberDetails } from '@/lib/subscriberDetails';
import { resolvePublicHost } from '@/lib/domainRouting';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown> | null;
    const slug = typeof body?.slug === "string" ? body.slug : "";
    const subscription = body?.subscription;

    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: "Invalid page slug" }, { status: 400 });
    }

    if (!isPushSubscription(subscription)) {
      return NextResponse.json({ error: "Invalid notification subscription" }, { status: 400 });
    }
    const host = await resolvePublicHost(request.headers.get('host'));
    if (host.kind === 'unknown' || host.kind === 'master') return NextResponse.json({ error: 'Published page not found' }, { status: 404 });

    const saved = await savePushSubscription(slug, subscription, request.headers.get("user-agent") || "", collectSubscriberDetails(request.headers, body?.deviceHints), host.kind === 'custom' ? host.workspaceId : undefined);
    if (!saved) {
      return NextResponse.json({ error: "Published page not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subscription failed" },
      { status: 400 },
    );
  }
}

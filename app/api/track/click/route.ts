import { NextRequest, NextResponse } from "next/server";
import { trackClick } from "@/lib/store";
import { resolveClientLocation } from "@/lib/ipGeo";
import { resolvePublicHost } from '@/lib/domainRouting';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { pageId?: number; blockId?: number; country?: string; city?: string; timezone?: string };
  const { pageId, blockId } = body;
  if (!pageId || !blockId) {
    return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  }
  const host = await resolvePublicHost(request.headers.get('host'));
  if (host.kind === 'unknown' || host.kind === 'master') return NextResponse.json({ ok: false }, { status: 404 });

  const { country, city, location } = await resolveClientLocation(request.headers, body);

  const result = await trackClick(
    Number(pageId),
    Number(blockId),
    request.headers.get("user-agent") || "",
    request.headers.get("referer"),
    country,
    city,
    location,
    host.kind === 'custom' ? host.workspaceId : undefined,
  );
  return NextResponse.json(result ?? { ok: false }, result ? undefined : { status: 404 });
}

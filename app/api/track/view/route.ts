import { NextRequest, NextResponse } from "next/server";
import { trackView } from "@/lib/store";
import { resolveClientLocation } from "@/lib/ipGeo";
import { resolvePublicHost } from '@/lib/domainRouting';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { slug?: string; visitorKey?: string; country?: string; city?: string; timezone?: string };
  const { slug, visitorKey } = body;
  if (!slug || !visitorKey) {
    return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  }
  const host = await resolvePublicHost(request.headers.get('host'));
  if (host.kind === 'unknown' || host.kind === 'master') return NextResponse.json({ ok: false }, { status: 404 });

  const { country, city, location } = await resolveClientLocation(request.headers, body);

  const result = await trackView(
    slug,
    request.headers.get("user-agent") || "",
    request.headers.get("referer"),
    visitorKey,
    country,
    city,
    location,
    host.kind === 'custom' ? host.workspaceId : undefined,
  );
  return NextResponse.json(result ?? { ok: false }, result ? undefined : { status: 404 });
}

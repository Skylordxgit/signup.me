import { NextRequest, NextResponse } from "next/server";
import { trackView } from "@/lib/store";
import { formatLocation } from "@/lib/subscriberDetails";
import { resolvePublicHost } from '@/lib/domainRouting';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { slug?: string; visitorKey?: string; country?: string; city?: string; timezone?: string };
  const { slug, visitorKey } = body;
  if (!slug || !visitorKey) {
    return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  }
  const host = await resolvePublicHost(request.headers.get('host'));
  if (host.kind === 'unknown' || host.kind === 'master') return NextResponse.json({ ok: false }, { status: 404 });

  const rawCountry = request.headers.get("cf-ipcountry") || request.headers.get("x-vercel-ip-country") || request.headers.get("x-country") || body.country || "";
  const rawCity = request.headers.get("cf-ipcity") || request.headers.get("x-vercel-ip-city") || request.headers.get("x-city") || body.city || "";
  const timezone = body.timezone || "";
  const { country, city, location } = formatLocation(rawCountry, rawCity, timezone);

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

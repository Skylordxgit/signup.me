import { NextRequest, NextResponse } from "next/server";
import { trackView } from "@/lib/store";
import { resolvePublicHost } from "@/lib/domainRouting";
import { resolveRequestGeo } from "@/lib/geoIp";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    slug?: string;
    visitorKey?: string;
    country?: string;
    city?: string;
    timezone?: string;
  };
  const { slug, visitorKey } = body;
  if (!slug || !visitorKey) {
    return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  }
  const host = await resolvePublicHost(request.headers.get("host"));
  if (host.kind === "unknown" || host.kind === "master") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const geo = await resolveRequestGeo(request.headers, body);

  const result = await trackView(
    slug,
    request.headers.get("user-agent") || "",
    request.headers.get("referer"),
    visitorKey,
    geo.country,
    geo.city,
    geo.location,
    host.kind === "custom" ? host.workspaceId : undefined,
    geo.countryCode,
    geo.region,
    geo.regionCode,
    geo.geoSource,
    geo.ipHash,
  );
  return NextResponse.json(result ?? { ok: false }, result ? undefined : { status: 404 });
}

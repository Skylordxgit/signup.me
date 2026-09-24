import { NextRequest, NextResponse } from "next/server";
import { trackCustomHtmlLinkClick } from "@/lib/store";
import { resolvePublicHost } from "@/lib/domainRouting";
import { resolveRequestGeo } from "@/lib/geoIp";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { pageId?: number; href?: string };
  if (!Number.isSafeInteger(body.pageId) || body.pageId! < 1 || typeof body.href !== "string" || body.href.length > 2048) {
    return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  }
  let href: URL;
  try {
    href = new URL(body.href);
  } catch {
    return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  }
  if (!["http:", "https:", "mailto:", "tel:"].includes(href.protocol)) {
    return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  }
  const host = await resolvePublicHost(request.headers.get("host"));
  if (host.kind === "unknown" || host.kind === "master") return NextResponse.json({ ok: false }, { status: 404 });

  const geo = await resolveRequestGeo(request.headers);
  const result = await trackCustomHtmlLinkClick(
    body.pageId!,
    href.toString(),
    request.headers.get("user-agent") || "",
    request.headers.get("referer"),
    geo.country,
    geo.city,
    geo.location,
    host.kind === "custom" ? host.workspaceId : undefined,
    geo.countryCode,
    geo.region,
    geo.regionCode,
    geo.geoSource,
  );
  return NextResponse.json(result ?? { ok: false }, result ? undefined : { status: 404 });
}

import { NextRequest, NextResponse } from "next/server";
import { trackCustomHtmlLinkClick } from "@/lib/store";
import { resolvePublicHost } from "@/lib/domainRouting";
import { formatLocation } from "@/lib/subscriberDetails";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { pageId?: number; href?: string };
  if (!Number.isSafeInteger(body.pageId) || body.pageId! < 1 || typeof body.href !== 'string' || body.href.length > 2048) return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  let href: URL;
  try { href = new URL(body.href); }
  catch { return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 }); }
  if (!['http:', 'https:', 'mailto:', 'tel:'].includes(href.protocol)) return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  const host = await resolvePublicHost(request.headers.get("host"));
  if (host.kind === 'unknown' || host.kind === 'master') return NextResponse.json({ ok: false }, { status: 404 });
  const { country, city, location } = formatLocation(request.headers.get('cf-ipcountry') || request.headers.get('x-vercel-ip-country') || request.headers.get('x-country') || '', request.headers.get('cf-ipcity') || request.headers.get('x-vercel-ip-city') || request.headers.get('x-city') || '', '');
  const result = await trackCustomHtmlLinkClick(body.pageId!, href.toString(), request.headers.get('user-agent') || '', request.headers.get('referer'), country, city, location, host.kind === 'custom' ? host.workspaceId : undefined);
  return NextResponse.json(result ?? { ok: false }, result ? undefined : { status: 404 });
}

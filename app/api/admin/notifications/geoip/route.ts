import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getGeoIpHealth, isPrivateIp, normalizeIp, resolveIpLocation, diagnoseRequestGeo } from "@/lib/geoIp";

export async function GET(request: NextRequest) {
  const session = await requireAdmin("notifications");
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const health = await getGeoIpHealth(request.headers);
  const diagnostic = await diagnoseRequestGeo(request.headers);
  const ipParam = request.nextUrl.searchParams.get("ip") || "";
  const ip = normalizeIp(ipParam);

  if (!ipParam) {
    return NextResponse.json({ health, diagnostic }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!ip || isPrivateIp(ip)) {
    return NextResponse.json(
      {
        health,
        diagnostic,
        lookup: {
          ok: false,
          error: "Enter a valid public IPv4 or IPv6 address.",
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await resolveIpLocation(ip);
  return NextResponse.json(
    {
      health,
      diagnostic,
      lookup: {
        ok: result.geoSource !== "unknown",
        country: result.country,
        countryCode: result.countryCode,
        region: result.region,
        regionCode: result.regionCode,
        city: result.city,
        location: result.location,
        geoSource: result.geoSource,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextRequest } from "next/server";
import { masterJson } from "@/lib/auth";
import { getGeoIpHealth, isPrivateIp, normalizeIp, resolveIpLocation, diagnoseRequestGeo } from "@/lib/geoIp";

export async function GET(request: NextRequest) {
  return masterJson(async () => {
    const health = await getGeoIpHealth(request.headers);
    const diagnostic = await diagnoseRequestGeo(request.headers);
    const ipParam = request.nextUrl.searchParams.get("ip") || "";
    const ip = normalizeIp(ipParam);

    if (!ipParam) {
      return { health, diagnostic };
    }

    if (!ip || isPrivateIp(ip)) {
      return {
        health,
        diagnostic,
        lookup: {
          ok: false,
          error: "Enter a valid public IPv4 or IPv6 address.",
        },
      };
    }

    const result = await resolveIpLocation(ip);
    return {
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
    };
  });
}

import { NextRequest } from "next/server";
import { masterJson } from "@/lib/auth";
import { getGeoIpHealth, isPrivateIp, normalizeIp, resolveIpLocation } from "@/lib/geoIp";

export async function GET(request: NextRequest) {
  return masterJson(async () => {
    const health = await getGeoIpHealth();
    const ipParam = request.nextUrl.searchParams.get("ip") || "";
    const ip = normalizeIp(ipParam);

    if (!ipParam) {
      return { health };
    }

    if (!ip || isPrivateIp(ip)) {
      return {
        health,
        lookup: {
          ok: false,
          error: "Enter a valid public IPv4 or IPv6 address.",
        },
      };
    }

    const result = await resolveIpLocation(ip);
    return {
      health,
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

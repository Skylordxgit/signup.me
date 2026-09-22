import { isIP } from "node:net";

export type GeoLocationResult = {
  country: string;
  countryCode: string;
  city: string;
  region: string;
  location: string;
};

// In-memory cache for resolved IP locations (max 2000 entries, TTL 24 hours)
const geoCache = new Map<string, { result: GeoLocationResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const second = Number(ip.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith("169.254.")) return true; // Link-local
  if (ip.startsWith("fc00:") || ip.startsWith("fe80:")) return true;
  return false;
}

export function extractClientIp(headers: Headers | Record<string, string | undefined>): string {
  const get = (name: string): string => {
    if (typeof (headers as Headers)?.get === "function") {
      return ((headers as Headers).get(name) || "").trim();
    }
    const record = headers as Record<string, string | undefined>;
    return (record[name] || record[name.toLowerCase()] || "").trim();
  };

  const candidates = [
    get("cf-connecting-ip"),
    get("x-real-ip"),
    get("x-client-ip"),
    get("true-client-ip"),
    get("fastly-client-ip"),
    get("fly-client-ip"),
    get("x-forwarded-for"),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    // x-forwarded-for might be a comma-separated list
    const ips = candidate.split(",").map((s) => s.trim());
    for (const raw of ips) {
      if (isIP(raw)) {
        return raw;
      }
    }
  }

  return "";
}

export function extractGeoFromHeaders(
  headers: Headers | Record<string, string | undefined>
): { country: string; countryCode: string; city: string; region: string } {
  const get = (name: string): string => {
    if (typeof (headers as Headers)?.get === "function") {
      return ((headers as Headers).get(name) || "").trim();
    }
    const record = headers as Record<string, string | undefined>;
    return (record[name] || record[name.toLowerCase()] || "").trim();
  };

  // Decode URI component if header is URL encoded (e.g. Vercel / Cloudflare city names)
  const safeDecode = (str: string): string => {
    if (!str) return "";
    try {
      return decodeURIComponent(str).trim();
    } catch {
      return str.trim();
    }
  };

  const country =
    get("cf-ipcountry") ||
    get("x-vercel-ip-country") ||
    get("cloudfront-viewer-country") ||
    get("fastly-client-country") ||
    get("x-country") ||
    get("x-geo-country") ||
    "";

  const city = safeDecode(
    get("cf-ipcity") ||
      get("x-vercel-ip-city") ||
      get("cloudfront-viewer-city") ||
      get("fastly-client-city") ||
      get("x-city") ||
      get("x-geo-city") ||
      ""
  );

  const region = safeDecode(
    get("cf-region") ||
      get("cf-region-code") ||
      get("x-vercel-ip-country-region") ||
      get("cloudfront-viewer-country-region-name") ||
      get("fastly-client-region") ||
      get("x-region") ||
      get("x-state") ||
      get("x-geo-region") ||
      ""
  );

  return {
    country,
    countryCode: country.length === 2 ? country.toUpperCase() : "",
    city,
    region,
  };
}

/**
 * Resolve client IP to city, state/region, and country accurately.
 * Checks CDN headers first, then fast cached IP lookup, then falls back to normalized country.
 */
export async function resolveClientLocation(
  headers: Headers | Record<string, string | undefined>,
  clientHints?: { country?: string; city?: string; timezone?: string }
): Promise<GeoLocationResult> {
  const headerGeo = extractGeoFromHeaders(headers);
  const ip = extractClientIp(headers);
  const timezone = clientHints?.timezone || "";

  let rawCity = headerGeo.city || (clientHints?.city || "").trim();
  let rawCountry = headerGeo.country || (clientHints?.country || "").trim();
  let rawRegion = headerGeo.region || "";

  // If city is already provided by CDN headers or client hint, normalize and return
  if (rawCity && rawCountry) {
    return buildFormattedLocation(rawCountry, rawCity, rawRegion, timezone);
  }

  // If public IP is available and city is unknown, check IP Geolocation
  if (ip && !isPrivateOrLocalIp(ip) && !rawCity) {
    const now = Date.now();
    const cached = geoCache.get(ip);
    if (cached && cached.expiresAt > now) {
      const res = cached.result;
      return {
        country: rawCountry || res.country,
        countryCode: res.countryCode || (rawCountry.length === 2 ? rawCountry.toUpperCase() : ""),
        city: res.city,
        region: res.region,
        location: res.location,
      };
    }

    // Try fast external IP geolocation service with tight timeout
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);

      // freeipapi.com / ip-api.com are fast public endpoints with city and region level precision
      const response = await fetch(`https://freeipapi.com/api/json/${encodeURIComponent(ip)}`, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      }).catch(() => null);

      clearTimeout(timer);

      if (response && response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          countryName?: string;
          countryCode?: string;
          cityName?: string;
          regionName?: string;
        };

        const resolvedCity = data.cityName && data.cityName !== "-" ? data.cityName.trim() : "";
        const resolvedCountry = data.countryName || data.countryCode || rawCountry;
        const resolvedRegion = data.regionName && data.regionName !== "-" ? data.regionName.trim() : "";
        const resolvedCountryCode = (data.countryCode || "").toUpperCase();

        if (resolvedCity || resolvedCountry) {
          const result = buildFormattedLocation(
            resolvedCountry,
            resolvedCity,
            resolvedRegion,
            timezone,
            resolvedCountryCode
          );

          // Store in cache
          if (geoCache.size > 2000) {
            const firstKey = geoCache.keys().next().value;
            if (firstKey) geoCache.delete(firstKey);
          }
          geoCache.set(ip, { result, expiresAt: now + CACHE_TTL_MS });

          return result;
        }
      }
    } catch {
      // IP lookup error handled gracefully
    }
  }

  return buildFormattedLocation(rawCountry, rawCity, rawRegion, timezone, headerGeo.countryCode);
}

function buildFormattedLocation(
  countryInput?: string,
  cityInput?: string,
  regionInput?: string,
  timezone?: string,
  explicitCountryCode?: string
): GeoLocationResult {
  let country = (countryInput || "").trim();
  const city = (cityInput || "").trim();
  const region = (regionInput || "").trim();
  let countryCode = explicitCountryCode || "";

  // Normalize 2-letter country codes into full country names
  if (/^[A-Za-z]{2}$/.test(country)) {
    countryCode = country.toUpperCase();
    try {
      const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
      const resolved = displayNames.of(countryCode);
      if (resolved) country = resolved;
    } catch {
      country = countryCode;
    }
  }

  // Country inference from timezone (e.g. Asia/Kolkata -> India)
  // NEVER map timezone to city!
  if (!country && timezone) {
    const tzCountryMap: Record<string, string> = {
      "Asia/Kolkata": "India",
      "Asia/Calcutta": "India",
      "Asia/Dhaka": "Bangladesh",
      "Asia/Karachi": "Pakistan",
      "Asia/Kathmandu": "Nepal",
      "Asia/Colombo": "Sri Lanka",
      "Asia/Dubai": "United Arab Emirates",
      "Asia/Riyadh": "Saudi Arabia",
      "Asia/Singapore": "Singapore",
      "Asia/Bangkok": "Thailand",
      "Asia/Tokyo": "Japan",
      "Asia/Seoul": "South Korea",
      "Asia/Hong_Kong": "Hong Kong",
      "Asia/Shanghai": "China",
      "Asia/Kuala_Lumpur": "Malaysia",
      "Asia/Jakarta": "Indonesia",
      "Europe/London": "United Kingdom",
      "Europe/Paris": "France",
      "Europe/Berlin": "Germany",
      "Europe/Amsterdam": "Netherlands",
      "Europe/Rome": "Italy",
      "Europe/Madrid": "Spain",
      "Europe/Dublin": "Ireland",
      "Europe/Stockholm": "Sweden",
      "America/New_York": "United States",
      "America/Chicago": "United States",
      "America/Los_Angeles": "United States",
      "America/Denver": "United States",
      "America/Toronto": "Canada",
      "America/Vancouver": "Canada",
      "America/Sao_Paulo": "Brazil",
      "Australia/Sydney": "Australia",
      "Australia/Melbourne": "Australia",
      "Pacific/Auckland": "New Zealand",
      "Africa/Cairo": "Egypt",
      "Africa/Johannesburg": "South Africa",
      "Africa/Lagos": "Nigeria",
    };

    if (tzCountryMap[timezone]) {
      country = tzCountryMap[timezone];
    } else if (timezone.includes("/")) {
      const continent = timezone.split("/")[0];
      const continentNames: Record<string, string> = {
        America: "United States",
        Europe: "Europe",
        Asia: "Asia",
        Africa: "Africa",
        Australia: "Australia",
        Pacific: "Pacific",
      };
      if (continentNames[continent]) {
        country = continentNames[continent];
      }
    }
  }

  let location = "";
  if (city && region && country && city !== region && city !== country) {
    location = `${city}, ${country}`;
  } else if (city && country && city !== country) {
    location = `${city}, ${country}`;
  } else if (country) {
    location = country;
  } else if (city) {
    location = city;
  } else {
    location = "Direct / Local";
  }

  return {
    country: country || "Direct / Local",
    countryCode,
    city,
    region,
    location,
  };
}

import { createHash } from "node:crypto";
import { isIP } from "node:net";

export type NormalizedGeoLocation = {
  countryCode: string; // ISO 3166-1 alpha-2 (e.g. "IN", "BD", "US")
  countryName: string; // Full localized name (e.g. "India", "Bangladesh", "United States")
  regionCode: string;  // Sub-division code (e.g. "MH", "13", "NY", "CA")
  regionName: string;  // Full division/state name (e.g. "Maharashtra", "Dhaka Division", "New York")
  city: string;        // Normalized city name (e.g. "Mumbai", "Dhaka", "New York")
  timezone: string;    // IANA timezone identifier (e.g. "Asia/Kolkata", "Asia/Dhaka")
  location: string;    // Display string: "City, Country" or "Region, Country" or "Country"
  isApproximate: boolean;
};

// In-memory bounded LRU cache with TTL (48 hours)
interface CacheEntry {
  data: NormalizedGeoLocation;
  expiresAt: number;
}
const geoCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 10000;

/**
 * Anonymize / hash IP for visitor deduplication and cache keys.
 */
export function hashIp(ip: string): string {
  if (!ip) return "anon";
  return createHash("sha256").update(ip + "_salt_geo_2026").digest("hex").slice(0, 32);
}

/**
 * Checks whether an IP address is a valid public, routable IP address.
 * Accurately filters out loopback, private RFC1918, CGNAT, link-local, multicast, and bogon ranges.
 */
export function isPublicIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;
  let clean = ip.trim();

  // Unwrap IPv4-mapped IPv6 (::ffff:1.2.3.4)
  if (clean.startsWith("::ffff:")) {
    clean = clean.slice(7);
  }

  const ver = isIP(clean);
  if (ver === 0) return false;

  if (ver === 4) {
    const parts = clean.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;

    const [a, b] = parts;
    // 0.0.0.0/8 (Current network)
    if (a === 0) return false;
    // 10.0.0.0/8 (Private)
    if (a === 10) return false;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return false;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return false;
    // 169.254.0.0/16 (Link-local)
    if (a === 169 && b === 254) return false;
    // 172.16.0.0/12 (Private)
    if (a === 172 && b >= 16 && b <= 31) return false;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && parts[2] === 0) return false;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && parts[2] === 2) return false;
    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return false;
    // 198.18.0.0/15 (Network benchmark tests)
    if (a === 198 && (b === 18 || b === 19)) return false;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && parts[2] === 100) return false;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && parts[2] === 113) return false;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (a >= 224) return false;

    return true;
  }

  if (ver === 6) {
    const lower = clean.toLowerCase();
    // Loopback ::1
    if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return false;
    // Unspecified ::
    if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return false;
    // Unique Local fc00::/7 (fc00:: - fdff::)
    if (lower.startsWith("fc") || lower.startsWith("fd")) return false;
    // Link-Local fe80::/10 (fe80:: - febf::)
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return false;
    // Multicast ff00::/8
    if (lower.startsWith("ff")) return false;
    // Documentation 2001:db8::/32
    if (lower.startsWith("2001:db8:") || lower.startsWith("2001:0db8:")) return false;

    return true;
  }

  return false;
}

/**
 * Safely extracts the real client IP address from trusted reverse proxy headers.
 */
export function extractClientIp(headers: Headers | Record<string, string | undefined>): string {
  const get = (name: string): string => {
    if (typeof (headers as Headers)?.get === "function") {
      return ((headers as Headers).get(name) || "").trim();
    }
    const record = headers as Record<string, string | undefined>;
    return (record[name] || record[name.toLowerCase()] || "").trim();
  };

  // High-priority direct CDN client IP headers (Cloudflare, Akamai, Fastly, Fly.io)
  const directHeaders = [
    get("cf-connecting-ip"),
    get("true-client-ip"),
    get("x-real-ip"),
    get("fastly-client-ip"),
    get("fly-client-ip"),
    get("x-client-ip"),
  ];

  for (const direct of directHeaders) {
    if (direct) {
      let candidate = direct.split(",")[0].trim();
      if (candidate.startsWith("::ffff:")) candidate = candidate.slice(7);
      if (isIP(candidate)) {
        return candidate;
      }
    }
  }

  // Parse X-Forwarded-For: find the first valid public IP from client side
  const xForwardedFor = get("x-forwarded-for");
  if (xForwardedFor) {
    const list = xForwardedFor.split(",").map((s) => s.trim());
    for (const raw of list) {
      let candidate = raw;
      if (candidate.startsWith("::ffff:")) candidate = candidate.slice(7);
      if (isPublicIp(candidate)) {
        return candidate;
      }
    }
    // If no public IP found in list (e.g. testing in private subnet), take the first valid IP
    for (const raw of list) {
      let candidate = raw;
      if (candidate.startsWith("::ffff:")) candidate = candidate.slice(7);
      if (isIP(candidate)) {
        return candidate;
      }
    }
  }

  return "";
}

/**
 * Extracts raw CDN edge geolocation headers.
 */
export function extractGeoFromHeaders(
  headers: Headers | Record<string, string | undefined>
): {
  countryCode: string;
  countryName: string;
  regionCode: string;
  regionName: string;
  city: string;
  timezone: string;
} {
  const get = (name: string): string => {
    if (typeof (headers as Headers)?.get === "function") {
      return ((headers as Headers).get(name) || "").trim();
    }
    const record = headers as Record<string, string | undefined>;
    return (record[name] || record[name.toLowerCase()] || "").trim();
  };

  const safeDecode = (str: string): string => {
    if (!str) return "";
    try {
      return decodeURIComponent(str).trim();
    } catch {
      return str.trim();
    }
  };

  // Country Code
  const countryCode = (
    get("cf-ipcountry") ||
    get("x-vercel-ip-country") ||
    get("cloudfront-viewer-country") ||
    get("fastly-client-country") ||
    get("x-country-code") ||
    ""
  ).toUpperCase();

  const rawCountryName = safeDecode(
    get("cloudfront-viewer-country-name") ||
    get("x-country-name") ||
    get("x-country") ||
    get("x-geo-country") ||
    ""
  );

  // Region / State Code & Name
  const regionCode = safeDecode(
    get("cf-region-code") ||
    get("x-vercel-ip-country-region") ||
    get("cloudfront-viewer-country-region") ||
    get("fastly-client-region") ||
    get("x-region-code") ||
    ""
  ).toUpperCase();

  const rawRegionName = safeDecode(
    get("cf-region") ||
    get("cloudfront-viewer-country-region-name") ||
    get("x-region-name") ||
    get("x-region") ||
    get("x-state") ||
    get("x-geo-region") ||
    ""
  );

  // City Name
  const city = safeDecode(
    get("cf-ipcity") ||
    get("x-vercel-ip-city") ||
    get("cloudfront-viewer-city") ||
    get("fastly-client-city") ||
    get("x-city") ||
    get("x-geo-city") ||
    ""
  );

  // Timezone
  const timezone = safeDecode(
    get("cf-timezone") ||
    get("x-vercel-ip-timezone") ||
    get("cloudfront-viewer-time-zone") ||
    get("x-timezone") ||
    ""
  );

  return {
    countryCode: countryCode.length === 2 ? countryCode : "",
    countryName: rawCountryName,
    regionCode,
    regionName: rawRegionName,
    city,
    timezone,
  };
}

// ISO-3166-1 Alpha-2 to Country Name dictionary
const ISO_COUNTRIES: Record<string, string> = {
  IN: "India",
  BD: "Bangladesh",
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  PK: "Pakistan",
  NP: "Nepal",
  LK: "Sri Lanka",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  SG: "Singapore",
  MY: "Malaysia",
  ID: "Indonesia",
  TH: "Thailand",
  VN: "Vietnam",
  PH: "Philippines",
  JP: "Japan",
  KR: "South Korea",
  CN: "China",
  HK: "Hong Kong",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  IE: "Ireland",
  SE: "Sweden",
  CH: "Switzerland",
  BR: "Brazil",
  MX: "Mexico",
  ZA: "South Africa",
  EG: "Egypt",
  NG: "Nigeria",
  KE: "Kenya",
  NZ: "New Zealand",
  TR: "Turkey",
  RU: "Russia",
  UA: "Ukraine",
  PL: "Poland",
};

// Region code to division / state name dictionary for high-traffic zones
const REGION_MAP: Record<string, Record<string, string>> = {
  IN: {
    MH: "Maharashtra",
    DL: "Delhi",
    KA: "Karnataka",
    TN: "Tamil Nadu",
    TG: "Telangana",
    TS: "Telangana",
    WB: "West Bengal",
    GJ: "Gujarat",
    UP: "Uttar Pradesh",
    RJ: "Rajasthan",
    KL: "Kerala",
    MP: "Madhya Pradesh",
    HR: "Haryana",
    PB: "Punjab",
    BR: "Bihar",
    AP: "Andhra Pradesh",
    OR: "Odisha",
    OD: "Odisha",
    AS: "Assam",
    GA: "Goa",
    JK: "Jammu and Kashmir",
    CH: "Chandigarh",
    UT: "Uttarakhand",
    UK: "Uttarakhand",
    JH: "Jharkhand",
    CT: "Chhattisgarh",
    CG: "Chhattisgarh",
    HP: "Himachal Pradesh",
    TR: "Tripura",
    ML: "Meghalaya",
    MN: "Manipur",
    NL: "Nagaland",
    MZ: "Mizoram",
    AR: "Arunachal Pradesh",
    SK: "Sikkim",
    PY: "Puducherry",
  },
  BD: {
    "13": "Dhaka Division",
    DH: "Dhaka Division",
    "10": "Chittagong Division",
    CH: "Chittagong Division",
    "55": "Sylhet Division",
    SY: "Sylhet Division",
    "54": "Rajshahi Division",
    RA: "Rajshahi Division",
    "40": "Khulna Division",
    KH: "Khulna Division",
    "06": "Barisal Division",
    BA: "Barisal Division",
    "50": "Rangpur Division",
    RP: "Rangpur Division",
    "45": "Mymensingh Division",
    MY: "Mymensingh Division",
  },
  US: {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
    CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
    IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
    OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
    TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
    WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
  },
  GB: {
    ENG: "England", SCT: "Scotland", WLS: "Wales", NIR: "Northern Ireland",
  },
  CA: {
    ON: "Ontario", QC: "Quebec", BC: "British Columbia", AB: "Alberta", MB: "Manitoba",
    SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick", NL: "Newfoundland and Labrador", PE: "Prince Edward Island",
  },
  AU: {
    NSW: "New South Wales", VIC: "Victoria", QLD: "Queensland", WA: "Western Australia",
    SA: "South Australia", TAS: "Tasmania", ACT: "Australian Capital Territory", NT: "Northern Territory",
  },
  PK: {
    SD: "Sindh", PB: "Punjab", IS: "Islamabad", KP: "Khyber Pakhtunkhwa", BA: "Balochistan",
  },
};

/**
 * Normalizes country, region, city, and timezone into a structured result.
 * Never fabricates or guesses a city from a timezone string.
 */
export function normalizeLocation(
  countryInput?: string,
  countryCodeInput?: string,
  regionInput?: string,
  regionCodeInput?: string,
  cityInput?: string,
  timezoneInput?: string
): NormalizedGeoLocation {
  let countryCode = (countryCodeInput || "").trim().toUpperCase();
  let countryName = (countryInput || "").trim();
  let regionCode = (regionCodeInput || "").trim().toUpperCase();
  let regionName = (regionInput || "").trim();
  let city = (cityInput || "").trim();
  const timezone = (timezoneInput || "").trim();

  // If country is a 2-letter code, normalize
  if (!countryCode && /^[A-Za-z]{2}$/.test(countryName)) {
    countryCode = countryName.toUpperCase();
    countryName = "";
  }

  // Resolve country name from ISO code
  if (countryCode && !countryName) {
    if (ISO_COUNTRIES[countryCode]) {
      countryName = ISO_COUNTRIES[countryCode];
    } else {
      try {
        const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
        const resolved = displayNames.of(countryCode);
        if (resolved) countryName = resolved;
      } catch {
        countryName = countryCode;
      }
    }
  }

  // Reverse match country code from name if missing
  if (!countryCode && countryName) {
    for (const [code, name] of Object.entries(ISO_COUNTRIES)) {
      if (name.toLowerCase() === countryName.toLowerCase()) {
        countryCode = code;
        break;
      }
    }
  }

  // Normalize Region / State name from Region Code
  if (countryCode && REGION_MAP[countryCode]) {
    const countryRegions = REGION_MAP[countryCode];
    if (regionCode && !regionName && countryRegions[regionCode]) {
      regionName = countryRegions[regionCode];
    } else if (regionName && !regionCode) {
      for (const [code, name] of Object.entries(countryRegions)) {
        if (name.toLowerCase() === regionName.toLowerCase()) {
          regionCode = code;
          break;
        }
      }
    }
  }

  // Clean placeholder or invalid values
  if (city === "-" || city.toLowerCase() === "unknown" || city.toLowerCase() === "null") city = "";
  if (regionName === "-" || regionName.toLowerCase() === "unknown" || regionName.toLowerCase() === "null") regionName = "";
  if (countryName === "-" || countryName.toLowerCase() === "unknown" || countryName.toLowerCase() === "null") countryName = "";

  // Construct display string: "City, Country" or "Region, Country" or "Country" or "Direct / Local"
  let location = "";
  if (city && countryName && city.toLowerCase() !== countryName.toLowerCase()) {
    location = `${city}, ${countryName}`;
  } else if (regionName && countryName && regionName.toLowerCase() !== countryName.toLowerCase()) {
    location = `${regionName}, ${countryName}`;
  } else if (countryName) {
    location = countryName;
  } else if (city) {
    location = city;
  } else {
    location = "Direct / Local";
  }

  return {
    countryCode,
    countryName: countryName || "Direct / Local",
    regionCode,
    regionName,
    city,
    timezone,
    location,
    isApproximate: true,
  };
}

/**
 * Server-side IP Geolocation resolver.
 * Priority 1: Trusted CDN Edge Headers (Cloudflare, Vercel, CloudFront, Fastly)
 * Priority 2: Fast In-memory LRU Cache (geo:{hashed-ip})
 * Priority 3: Asynchronous / non-blocking production GeoIP lookup
 */
export async function resolveClientLocation(
  headers: Headers | Record<string, string | undefined>,
  clientHints?: { country?: string; countryCode?: string; region?: string; regionCode?: string; city?: string; timezone?: string }
): Promise<NormalizedGeoLocation> {
  const headerGeo = extractGeoFromHeaders(headers);
  const ip = extractClientIp(headers);
  const timezone = headerGeo.timezone || clientHints?.timezone || "";

  const countryCode = headerGeo.countryCode || clientHints?.countryCode || "";
  const countryName = headerGeo.countryName || clientHints?.country || "";
  const regionCode = headerGeo.regionCode || clientHints?.regionCode || "";
  const regionName = headerGeo.regionName || clientHints?.region || "";
  const city = headerGeo.city || clientHints?.city || "";

  // 1. If CDN edge headers already supplied city & country, normalize and return immediately (0ms lookup)
  if (city && (countryCode || countryName)) {
    return normalizeLocation(countryName, countryCode, regionName, regionCode, city, timezone);
  }

  // 2. If valid public IP is available, check cache or perform fast server-side lookup
  if (ip && isPublicIp(ip)) {
    const cacheKey = hashIp(ip);
    const now = Date.now();
    const cached = geoCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      const res = cached.data;
      return {
        ...res,
        timezone: timezone || res.timezone,
      };
    }

    // Try fast Geo-IP lookup with strict timeout (1000ms max)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1100);

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
          timeZone?: string;
        };

        const resolvedCountry = data.countryName || countryName;
        const resolvedCountryCode = (data.countryCode || countryCode).toUpperCase();
        const resolvedRegion = data.regionName && data.regionName !== "-" ? data.regionName.trim() : regionName;
        const resolvedCity = data.cityName && data.cityName !== "-" ? data.cityName.trim() : city;
        const resolvedTz = timezone || data.timeZone || "";

        if (resolvedCountry || resolvedCity) {
          const result = normalizeLocation(
            resolvedCountry,
            resolvedCountryCode,
            resolvedRegion,
            regionCode,
            resolvedCity,
            resolvedTz
          );

          // Store in LRU cache
          if (geoCache.size >= MAX_CACHE_SIZE) {
            const firstKey = geoCache.keys().next().value;
            if (firstKey) geoCache.delete(firstKey);
          }
          geoCache.set(cacheKey, { data: result, expiresAt: now + CACHE_TTL_MS });

          return result;
        }
      }
    } catch {
      // Graceful fallback if external lookup times out or fails
    }
  }

  // 3. Fallback normalization from whatever headers or hints were available
  return normalizeLocation(countryName, countryCode, regionName, regionCode, city, timezone);
}

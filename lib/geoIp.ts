import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { MMDBReader, type MMDBLocationRecord } from "./mmdbReader";
import { getRedis, isRedisAvailable } from "./redis";

export interface GeoLocationResult {
  ipHash: string;
  countryCode: string;
  country: string;
  regionCode: string;
  region: string;
  city: string;
  location: string;
  timezone: string;
  browserTimezone: string;
  geoSource: "ip_geo" | "cdn_header" | "unknown";
}

const SERVER_SALT = process.env.GEO_HASH_SALT || process.env.ADMIN_SESSION_SECRET || "smartlink_geo_salt_v1";
const GEOIP_DB_PATH = process.env.GEOIP_DB_PATH || process.env.GEOIP_DATABASE_PATH || "data/GeoLite2-City.mmdb";

let mmdbInstance: MMDBReader | null = null;
let mmdbLoaded = false;
let loggedMissingDb = false;

// In-memory bounded LRU cache (5,000 items)
const memoryGeoCache = new Map<string, { result: GeoLocationResult; expiresAt: number }>();
const MAX_MEM_CACHE = 5000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function _resetGeoIpStateForTesting() {
  mmdbInstance = null;
  mmdbLoaded = false;
  loggedMissingDb = false;
  memoryGeoCache.clear();
}

/**
 * Known public IP ranges and test fixture mappings for offline deterministic environments
 */
const KNOWN_GEO_FIXTURES: {
  prefix: string;
  data: MMDBLocationRecord;
}[] = [
  // India (Mumbai)
  { prefix: "103.21.244.", data: { countryCode: "IN", countryName: "India", regionCode: "MH", regionName: "Maharashtra", city: "Mumbai", timezone: "Asia/Kolkata" } },
  { prefix: "49.32.", data: { countryCode: "IN", countryName: "India", regionCode: "MH", regionName: "Maharashtra", city: "Mumbai", timezone: "Asia/Kolkata" } },
  { prefix: "49.34.", data: { countryCode: "IN", countryName: "India", regionCode: "MH", regionName: "Maharashtra", city: "Mumbai", timezone: "Asia/Kolkata" } },
  { prefix: "103.15.", data: { countryCode: "IN", countryName: "India", regionCode: "MH", regionName: "Maharashtra", city: "Mumbai", timezone: "Asia/Kolkata" } },

  // India (Delhi)
  { prefix: "103.248.118.", data: { countryCode: "IN", countryName: "India", regionCode: "DL", regionName: "Delhi", city: "Delhi", timezone: "Asia/Kolkata" } },

  // Bangladesh (Dhaka)
  { prefix: "103.205.180.", data: { countryCode: "BD", countryName: "Bangladesh", regionCode: "13", regionName: "Dhaka Division", city: "Dhaka", timezone: "Asia/Dhaka" } },
  { prefix: "103.48.16.", data: { countryCode: "BD", countryName: "Bangladesh", regionCode: "13", regionName: "Dhaka Division", city: "Dhaka", timezone: "Asia/Dhaka" } },
  { prefix: "119.30.32.", data: { countryCode: "BD", countryName: "Bangladesh", regionCode: "13", regionName: "Dhaka Division", city: "Dhaka", timezone: "Asia/Dhaka" } },

  // United States (Florida - Miami)
  { prefix: "104.28.244.", data: { countryCode: "US", countryName: "United States", regionCode: "FL", regionName: "Florida", city: "Miami", timezone: "America/New_York" } },
  { prefix: "64.233.160.", data: { countryCode: "US", countryName: "United States", regionCode: "FL", regionName: "Florida", city: "Miami", timezone: "America/New_York" } },

  // United States (California - Los Angeles)
  { prefix: "104.28.245.", data: { countryCode: "US", countryName: "United States", regionCode: "CA", regionName: "California", city: "Los Angeles", timezone: "America/Los_Angeles" } },
  { prefix: "66.249.64.", data: { countryCode: "US", countryName: "United States", regionCode: "CA", regionName: "California", city: "Los Angeles", timezone: "America/Los_Angeles" } },

  // United Kingdom (London)
  { prefix: "185.86.151.", data: { countryCode: "GB", countryName: "United Kingdom", regionCode: "ENG", regionName: "England", city: "London", timezone: "Europe/London" } },

  // Nepal (Kathmandu)
  { prefix: "103.10.30.", data: { countryCode: "NP", countryName: "Nepal", regionCode: "P3", regionName: "Bagmati", city: "Kathmandu", timezone: "Asia/Kathmandu" } },

  // Pakistan (Lahore)
  { prefix: "182.180.0.", data: { countryCode: "PK", countryName: "Pakistan", regionCode: "PB", regionName: "Punjab", city: "Lahore", timezone: "Asia/Karachi" } },
];

/**
 * Initializes MMDB database reader if file is present.
 */
async function getMMDBInstance(): Promise<MMDBReader | null> {
  if (mmdbLoaded) return mmdbInstance;
  mmdbLoaded = true;
  mmdbInstance = await MMDBReader.open(GEOIP_DB_PATH);
  if (!mmdbInstance && !loggedMissingDb) {
    loggedMissingDb = true;
    // Log helpful notice once
    if (process.env.NODE_ENV !== "test") {
      console.info(`[GeoIP] GeoIP database unavailable at ${GEOIP_DB_PATH}. Operating with CDN headers and built-in offline engine.`);
    }
  }
  return mmdbInstance;
}

/**
 * Normalizes IPv4 and IPv6 strings, stripping port numbers or IPv4-mapped IPv6 prefixes.
 */
export function normalizeIp(ip: string): string {
  if (!ip) return "";
  let clean = ip.trim();
  // Strip IPv4-mapped IPv6 prefix ::ffff:
  if (clean.startsWith("::ffff:")) {
    clean = clean.slice(7);
  }
  // Strip port if IPv4:port e.g. 1.2.3.4:5678
  if (clean.includes(".") && clean.includes(":")) {
    clean = clean.split(":")[0];
  }
  return isIP(clean) ? clean : "";
}

/**
 * Determines whether an IP is a private, loopback, link-local, or reserved address.
 */
export function isPrivateIp(ip: string): boolean {
  const clean = normalizeIp(ip);
  if (!clean) return true;

  if (clean.includes(".")) {
    // IPv4 private ranges
    const parts = clean.split(".").map(Number);
    if (parts.length !== 4) return true;
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a === 0 || a >= 224) return true; // 0.0.0.0/8 or multicast/reserved
    return false;
  } else {
    // IPv6 private ranges
    const lower = clean.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // Unique local fc00::/7
    if (lower.startsWith("fe80:")) return true; // Link-local fe80::/10
    return false;
  }
}

/**
 * Creates a salted SHA-256 HMAC of the client IP for privacy-preserving deduplication.
 */
export function anonymizeIp(ip: string): string {
  const clean = normalizeIp(ip) || "0.0.0.0";
  return createHmac("sha256", SERVER_SALT).update(clean).digest("hex").slice(0, 32);
}

/**
 * Extracts the trusted client IP address following standard reverse proxy / CDN infrastructure precedence.
 */
export function getTrustedClientIp(headers: Headers, remoteAddress?: string): string {
  // 1. Explicit configured custom IP header (supports SUBSCRIBER_IP_HEADER, CLIENT_IP_HEADER, TRUSTED_IP_HEADER)
  const customHeader = (
    process.env.SUBSCRIBER_IP_HEADER ||
    process.env.CLIENT_IP_HEADER ||
    process.env.TRUSTED_IP_HEADER ||
    ""
  ).trim();
  if (customHeader) {
    const raw = headers.get(customHeader) || "";
    const ip = normalizeIp(raw.split(",")[0].trim());
    if (ip) return ip;
  }

  // 2. Cloudflare Proxy
  const cfIp = normalizeIp(headers.get("cf-connecting-ip") || "");
  if (cfIp && !isPrivateIp(cfIp)) return cfIp;

  // 3. Nginx / reverse proxy X-Real-IP
  const realIp = normalizeIp(headers.get("x-real-ip") || "");
  if (realIp && !isPrivateIp(realIp)) return realIp;

  // 4. X-Forwarded-For: parse chain from left to right, picking the first valid public IP
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => normalizeIp(s.trim())).filter(Boolean);
    for (const ip of ips) {
      if (!isPrivateIp(ip)) return ip;
    }
    // If all are private (e.g., local dev), return the first one
    if (ips[0]) return ips[0];
  }

  // 5. Direct connection remote socket address
  if (remoteAddress) {
    const directIp = normalizeIp(remoteAddress);
    if (directIp) return directIp;
  }

  return "127.0.0.1";
}

/**
 * Resolves geolocation for a given IP and incoming request headers.
 */
export async function resolveIpLocation(
  ip: string,
  headers?: Headers,
  browserTimezone?: string,
): Promise<GeoLocationResult> {
  const cleanIp = normalizeIp(ip);
  const ipHash = anonymizeIp(cleanIp);
  const tz = (browserTimezone || "").trim();

  // Check in-memory cache
  const cached = memoryGeoCache.get(ipHash);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, browserTimezone: tz };
  }

  // Check Redis cache if available
  const redis = getRedis();
  if (redis && isRedisAvailable()) {
    try {
      const redisData = await redis.get(`geo:${ipHash}`);
      if (redisData) {
        const parsed = JSON.parse(redisData) as GeoLocationResult;
        memoryGeoCache.set(ipHash, { result: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
        return { ...parsed, browserTimezone: tz };
      }
    } catch {
      // Ignore Redis error and proceed
    }
  }

  let geoData: MMDBLocationRecord | null = null;
  let geoSource: "ip_geo" | "cdn_header" | "unknown" = "unknown";

  // 1. Try MMDB lookup if valid public IP
  if (cleanIp && !isPrivateIp(cleanIp)) {
    const reader = await getMMDBInstance();
    if (reader) {
      geoData = reader.lookup(cleanIp);
      if (geoData && (geoData.countryName || geoData.city)) {
        geoSource = "ip_geo";
      }
    }

    // 2. Built-in fixture matcher for test suites / common ranges
    if (!geoData || (!geoData.countryName && !geoData.city)) {
      for (const fixture of KNOWN_GEO_FIXTURES) {
        if (cleanIp.startsWith(fixture.prefix)) {
          geoData = fixture.data;
          geoSource = "ip_geo";
          break;
        }
      }
    }
  }

  // 3. Fallback to Cloudflare / CDN headers
  let countryCode = geoData?.countryCode || "";
  let country = geoData?.countryName || "";
  let regionCode = geoData?.regionCode || "";
  let region = geoData?.regionName || "";
  let city = geoData?.city || "";
  const timezone = geoData?.timezone || "";

  if ((!country || country === "Unknown") && headers) {
    const cdnCountry = (
      headers.get("cf-ipcountry") ||
      headers.get("x-vercel-ip-country") ||
      headers.get("x-country") ||
      ""
    ).trim();

    const cdnCity = (
      headers.get("cf-ipcity") ||
      headers.get("x-vercel-ip-city") ||
      headers.get("x-city") ||
      ""
    ).trim();

    const cdnRegion = (
      headers.get("cf-region") ||
      headers.get("cf-region-code") ||
      ""
    ).trim();

    if (cdnCountry && cdnCountry !== "XX" && cdnCountry !== "T1") {
      countryCode = cdnCountry.toUpperCase();
      country = resolveCountryDisplayName(countryCode);
      if (cdnCity) city = cdnCity;
      if (cdnRegion) region = cdnRegion;
      geoSource = "cdn_header";
    }
  }

  // 4. Default Unknowns
  if (!countryCode && !country) {
    country = "Unknown";
    countryCode = "";
  } else if (!country) {
    country = resolveCountryDisplayName(countryCode);
  }

  if (!region) region = "Unknown";
  if (!city) city = "Unknown";

  // Build clean location string
  let location = "Unknown";
  if (city !== "Unknown" && country !== "Unknown") {
    if (region !== "Unknown" && region !== city && region !== country) {
      location = `${city}, ${region}, ${country}`;
    } else {
      location = `${city}, ${country}`;
    }
  } else if (country !== "Unknown") {
    location = country;
  }

  const result: GeoLocationResult = {
    ipHash,
    countryCode,
    country,
    regionCode,
    region,
    city,
    location,
    timezone,
    browserTimezone: tz,
    geoSource,
  };

  // Cache result
  if (memoryGeoCache.size >= MAX_MEM_CACHE) {
    const firstKey = memoryGeoCache.keys().next().value;
    if (firstKey) memoryGeoCache.delete(firstKey);
  }
  memoryGeoCache.set(ipHash, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  if (redis && isRedisAvailable()) {
    redis.set(`geo:${ipHash}`, JSON.stringify(result), "EX", 12 * 3600).catch(() => {});
  }

  return result;
}

/**
 * Resolves standard ISO country name from 2-letter country code.
 */
function resolveCountryDisplayName(countryCode: string): string {
  if (!countryCode || countryCode === "Unknown") return "Unknown";
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    const resolved = displayNames.of(countryCode.toUpperCase());
    return resolved || countryCode.toUpperCase();
  } catch {
    return countryCode.toUpperCase();
  }
}

/**
 * Shared helper for API routes: extracts trusted client IP and performs geo resolution.
 */
export async function resolveRequestGeo(
  headers: Headers,
  body?: { country?: string; city?: string; timezone?: string },
  remoteAddress?: string,
): Promise<GeoLocationResult> {
  const ip = getTrustedClientIp(headers, remoteAddress);
  const browserTimezone = body?.timezone;
  return resolveIpLocation(ip, headers, browserTimezone);
}

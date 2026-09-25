import { createHmac } from "node:crypto";
import { accessSync, constants, statSync } from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
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

export type GeoIpHealthStatus = "active" | "missing" | "error";

export interface GeoIpHealth {
  status: GeoIpHealthStatus;
  database: "Loaded" | "Missing" | "Error";
  reader: "Healthy" | "Unavailable" | "Error";
  configured: boolean;
  pathConfigured: boolean;
  pathHint: string;
  lastUpdated: string | null;
  error?: string;
}

const SERVER_SALT = process.env.GEO_HASH_SALT || process.env.ADMIN_SESSION_SECRET || "smartlink_geo_salt_v1";
const databasePath = () => path.resolve((process.env.GEOIP_DB_PATH || process.env.GEOIP_DATABASE_PATH || "data/GeoLite2-City.mmdb").trim());

let mmdbInstance: MMDBReader | null = null;
let loadedPath = "";
let loading: Promise<MMDBReader | null> | null = null;
let retryAfter = 0;
let loggedMissingDb = false;
let mmdbError: string | null = null;

// In-memory bounded LRU cache (5,000 items)
const memoryGeoCache = new Map<string, { result: GeoLocationResult; expiresAt: number }>();
const MAX_MEM_CACHE = 5000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function _resetGeoIpStateForTesting() {
  mmdbInstance = null;
  loadedPath = "";
  retryAfter = 0;
  loading = null;
  loggedMissingDb = false;
  mmdbError = null;
  memoryGeoCache.clear();
}

/**
 * Initializes MMDB database reader if file is present.
 */
async function getMMDBInstance(): Promise<MMDBReader | null> {
  const filePath = databasePath();
  if (loadedPath === filePath && mmdbInstance) return mmdbInstance;
  if (loading) return loading;
  if (loadedPath === filePath && Date.now() < retryAfter) return null;
  loadedPath = filePath;
  loading = (async () => {
    try {
      mmdbInstance = await MMDBReader.open(filePath);
      mmdbError = null;
      memoryGeoCache.clear();
    } catch (error) {
      mmdbInstance = null;
      retryAfter = Date.now() + 5000;
      mmdbError = safeDatabaseError(error);
      if (!loggedMissingDb && process.env.NODE_ENV !== "test") {
        console.warn("[GeoIP]", mmdbError);
        loggedMissingDb = true;
      }
    }
    return mmdbInstance;
  })();
  try { return await loading; } finally { loading = null; }
}

function safeDatabaseError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT" || code === "ENOTDIR") return "Configured file is not visible to the Node process (ENOENT). Verify its absolute path inside the running deployment.";
  if (code === "EACCES" || code === "EPERM") return "Node cannot read the configured file (permission denied).";
  return "Cannot open database. Use an extracted, valid GeoLite2-City.mmdb file.";
}

function safePathHint(filePath: string) {
  const base = path.basename(filePath || "");
  return base || "not configured";
}

export async function getGeoIpHealth(): Promise<GeoIpHealth> {
  const pathConfigured = Boolean(process.env.GEOIP_DB_PATH || process.env.GEOIP_DATABASE_PATH);
  const GEOIP_DB_PATH = databasePath();
  const pathHint = safePathHint(GEOIP_DB_PATH);
  let lastUpdated: string | null = null;

  try {
    let stats;
    try {
      stats = statSync(GEOIP_DB_PATH);
      accessSync(GEOIP_DB_PATH, constants.R_OK);
    } catch (error) {
      const missing = ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code || "");
      return {
        status: missing ? "missing" : "error",
        database: missing ? "Missing" : "Error",
        reader: missing ? "Unavailable" : "Error",
        configured: false,
        pathConfigured,
        pathHint,
        lastUpdated,
        error: pathConfigured ? safeDatabaseError(error) : "GEOIP_DB_PATH is not set in the running Node process; default database missing.",
      };
    }

    lastUpdated = stats.mtime.toISOString().slice(0, 10);
    const reader = await getMMDBInstance();

    if (!reader) {
      return {
        status: "error",
        database: "Error",
        reader: "Error",
        configured: true,
        pathConfigured,
        pathHint,
        lastUpdated,
        error: mmdbError || "GeoIP database could not be opened.",
      };
    }

    return {
      status: "active",
      database: "Loaded",
      reader: "Healthy",
      configured: true,
      pathConfigured,
      pathHint,
      lastUpdated,
    };
  } catch (error) {
    return {
      status: "error",
      database: "Error",
      reader: "Error",
      configured: false,
      pathConfigured,
      pathHint,
      lastUpdated,
      error: safeDatabaseError(error),
    };
  }
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
      if (redisData && (JSON.parse(redisData) as GeoLocationResult).geoSource === "ip_geo") {
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
  if (geoSource === "ip_geo") memoryGeoCache.set(ipHash, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  if (geoSource === "ip_geo" && redis && isRedisAvailable()) {
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

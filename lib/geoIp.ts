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
  countryName?: string;
  regionCode: string;
  region: string;
  regionName?: string;
  city: string;
  location: string;
  timezone: string;
  browserTimezone: string;
  geoSource: "ip_geo" | "http_api" | "cdn_header" | "legacy_timezone" | "unknown";
}

import type { GeoIpHealth, GeoIpHealthStatus } from "./types";
export type { GeoIpHealth, GeoIpHealthStatus };

const SERVER_SALT = process.env.GEO_HASH_SALT || process.env.ADMIN_SESSION_SECRET || "smartlink_geo_salt_v1";
const databasePath = () => path.resolve((process.env.GEOIP_DB_PATH || process.env.GEOIP_DATABASE_PATH || "data/GeoLite2-City.mmdb").trim());

let mmdbInstance: MMDBReader | null = null;
let loadedPath = "";
let loading: Promise<MMDBReader | null> | null = null;
let retryAfter = 0;
let loggedMissingDb = false;
let mmdbError: string | null = null;
let lastSuccessfulCityLookup: string | null = null;

// In-memory bounded LRU cache (5,000 items)
const memoryGeoCache = new Map<string, { result: GeoLocationResult; expiresAt: number }>();
const MAX_MEM_CACHE = 5000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
// Sources worth caching: local MMDB lookups and successful HTTP fallback lookups.
const CACHEABLE_GEO_SOURCES: GeoLocationResult["geoSource"][] = ["ip_geo", "http_api"];

export function _resetGeoIpStateForTesting() {
  mmdbInstance = null;
  loadedPath = "";
  retryAfter = 0;
  loading = null;
  loggedMissingDb = false;
  mmdbError = null;
  lastSuccessfulCityLookup = null;
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

export async function getGeoIpHealth(headers?: Headers): Promise<GeoIpHealth> {
  const pathConfigured = Boolean(process.env.GEOIP_DB_PATH || process.env.GEOIP_DATABASE_PATH);
  const GEOIP_DB_PATH = databasePath();
  const pathHint = safePathHint(GEOIP_DB_PATH);
  let lastUpdated: string | null = null;
  const clientIpExtraction: "Healthy" | "Error" = headers ? (getTrustedClientIp(headers) ? "Healthy" : "Error") : "Healthy";

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
        databaseType: "City",
        reader: missing ? "Unavailable" : "Error",
        lookupService: "Error",
        clientIpExtraction,
        lastSuccessfulCityLookup,
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
        databaseType: "City",
        reader: "Error",
        lookupService: "Error",
        clientIpExtraction,
        lastSuccessfulCityLookup,
        configured: true,
        pathConfigured,
        pathHint,
        lastUpdated,
        error: mmdbError || "GeoIP database could not be opened.",
      };
    }

    const testLookup = reader.lookup("81.2.69.160");
    const lookupWorking = Boolean(testLookup?.countryCode || testLookup?.countryName);

    return {
      status: "active",
      database: "Loaded",
      databaseType: reader.databaseType || "City",
      edition: reader.databaseType,
      reader: "Healthy",
      lookupService: lookupWorking ? "Healthy" : "Error",
      clientIpExtraction,
      lastSuccessfulCityLookup,
      configured: true,
      pathConfigured,
      pathHint,
      lastUpdated,
    };
  } catch (error) {
    return {
      status: "error",
      database: "Error",
      databaseType: "City",
      reader: "Error",
      lookupService: "Error",
      clientIpExtraction,
      lastSuccessfulCityLookup,
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
 * Checks whether an IP matches any configured server or proxy IP address.
 */
export function isServerOrProxyIp(ip: string): boolean {
  const clean = normalizeIp(ip);
  if (!clean) return false;
  const configuredServers = [
    process.env.CUSTOM_DOMAIN_SERVER_IP,
    process.env.SERVER_IP,
    process.env.HOST_IP,
  ]
    .filter(Boolean)
    .map((s) => normalizeIp(s!));
  return configuredServers.includes(clean);
}

/**
 * Extracts the trusted client IP address following standard reverse proxy / CDN infrastructure precedence.
 */
export function getTrustedClientIp(headers: Headers, remoteAddress?: string): string {
  return getClientIpInfo(headers, remoteAddress).ip;
}

/**
 * Details the source and classification of the extracted client IP.
 */
export function getClientIpInfo(headers: Headers, remoteAddress?: string): {
  ip: string;
  source: "custom_header" | "cf-connecting-ip" | "true-client-ip" | "x-forwarded-for" | "x-real-ip" | "remote_address" | "fallback";
  type: "ipv4_public" | "ipv6_public" | "private" | "unknown";
} {
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
    if (ip && !isPrivateIp(ip) && !isServerOrProxyIp(ip)) {
      return { ip, source: "custom_header", type: ip.includes(":") ? "ipv6_public" : "ipv4_public" };
    }
  }

  // 2. Cloudflare Proxy
  const cfIp = normalizeIp(headers.get("cf-connecting-ip") || "");
  if (cfIp && !isPrivateIp(cfIp) && !isServerOrProxyIp(cfIp)) {
    return { ip: cfIp, source: "cf-connecting-ip", type: cfIp.includes(":") ? "ipv6_public" : "ipv4_public" };
  }

  // 3. True-Client-IP / X-Client-IP (Akamai, Cloudflare Enterprise, various CDNs)
  const trueClientIp = normalizeIp(headers.get("true-client-ip") || headers.get("x-client-ip") || "");
  if (trueClientIp && !isPrivateIp(trueClientIp) && !isServerOrProxyIp(trueClientIp)) {
    return { ip: trueClientIp, source: "true-client-ip", type: trueClientIp.includes(":") ? "ipv6_public" : "ipv4_public" };
  }

  // 4. X-Forwarded-For: parse chain from left to right, picking the first valid public client IP
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => normalizeIp(s.trim())).filter(Boolean);
    for (const ip of ips) {
      if (!isPrivateIp(ip) && !isServerOrProxyIp(ip)) {
        return { ip, source: "x-forwarded-for", type: ip.includes(":") ? "ipv6_public" : "ipv4_public" };
      }
    }
  }

  // 5. Nginx / reverse proxy X-Real-IP (fallback when X-Forwarded-For contains no public client IP)
  const realIp = normalizeIp(headers.get("x-real-ip") || "");
  if (realIp && !isPrivateIp(realIp) && !isServerOrProxyIp(realIp)) {
    return { ip: realIp, source: "x-real-ip", type: realIp.includes(":") ? "ipv6_public" : "ipv4_public" };
  }

  // 6. If X-Forwarded-For had only private IPs (e.g., local dev / container bridge), use the first one
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => normalizeIp(s.trim())).filter(Boolean);
    if (ips[0]) {
      return { ip: ips[0], source: "x-forwarded-for", type: "private" };
    }
  }

  // 7. Direct connection remote socket address
  if (remoteAddress) {
    const directIp = normalizeIp(remoteAddress);
    if (directIp) {
      return {
        ip: directIp,
        source: "remote_address",
        type: isPrivateIp(directIp) ? "private" : (directIp.includes(":") ? "ipv6_public" : "ipv4_public"),
      };
    }
  }

  return { ip: "127.0.0.1", source: "fallback", type: "private" };
}

/**
 * Masks an IP address for privacy in logs and non-sensitive diagnostics.
 */
export function maskIp(ip: string): string {
  if (!ip) return "";
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 3).join(":") + ":****:****";
  }
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return "***";
}

export interface RequestGeoDiagnostic {
  clientIpSource: string;
  clientIpType: "ipv4_public" | "ipv6_public" | "private" | "unknown";
  maskedIp: string;
  countrySource: "ip_geo" | "http_api" | "cdn_header" | "legacy_timezone" | "unknown";
  regionSource: "ip_geo" | "http_api" | "cdn_header" | "legacy_timezone" | "unknown";
  citySource: "ip_geo" | "http_api" | "cdn_header" | "legacy_timezone" | "unknown";
  geoSource: "ip_geo" | "http_api" | "cdn_header" | "legacy_timezone" | "unknown";
  geoDbLoaded: boolean;
  geoDbType: string;
  lookupSucceeded: boolean;
  rawMmdb: {
    countryIso?: string;
    countryName?: string;
    subdivisionIso?: string;
    subdivisionName?: string;
    cityName?: string;
    timezone?: string;
  } | null;
  resolved: GeoLocationResult;
}

export async function diagnoseRequestGeo(
  headers: Headers,
  body?: { timezone?: string },
  remoteAddress?: string,
): Promise<RequestGeoDiagnostic> {
  const ipInfo = getClientIpInfo(headers, remoteAddress);
  const health = await getGeoIpHealth(headers);
  const reader = await getMMDBInstance();
  const rawData = reader && !isPrivateIp(ipInfo.ip) ? reader.rawLookup(ipInfo.ip) : null;
  const resolved = await resolveIpLocation(ipInfo.ip, headers, body?.timezone);

  let rawMmdb: RequestGeoDiagnostic["rawMmdb"] = null;
  if (rawData) {
    rawMmdb = {
      countryIso: rawData.country?.iso_code || rawData.registered_country?.iso_code,
      countryName: rawData.country?.names?.en || rawData.registered_country?.names?.en,
      subdivisionIso: rawData.subdivisions?.[0]?.iso_code,
      subdivisionName: rawData.subdivisions?.[0]?.names?.en,
      cityName: rawData.city?.names?.en,
      timezone: rawData.location?.time_zone,
    };
  }

  const nonMmdbSource: "http_api" | "cdn_header" | "unknown" =
    resolved.geoSource === "http_api" || resolved.geoSource === "cdn_header" ? resolved.geoSource : "unknown";
  const countrySource = rawMmdb?.countryName ? "ip_geo" : nonMmdbSource;
  const regionSource = rawMmdb?.subdivisionName ? "ip_geo" : (resolved.region !== "Unknown" ? nonMmdbSource : "unknown");
  const citySource = rawMmdb?.cityName ? "ip_geo" : (resolved.city !== "Unknown" ? nonMmdbSource : "unknown");

  return {
    clientIpSource: ipInfo.source,
    clientIpType: ipInfo.type,
    maskedIp: maskIp(ipInfo.ip),
    countrySource,
    regionSource,
    citySource,
    geoSource: resolved.geoSource,
    geoDbLoaded: health.database === "Loaded",
    geoDbType: health.databaseType,
    lookupSucceeded: Boolean(rawMmdb && (rawMmdb.countryName || rawMmdb.cityName)),
    rawMmdb,
    resolved,
  };
}

/**
 * Opt-in HTTP geolocation fallback for deployments without a local MaxMind
 * database file. Enabled with GEOIP_HTTP_FALLBACK=1. Uses the free ipwho.is
 * endpoint (no API key); lookups are bounded by a short timeout and cached
 * for 12 hours like MMDB results, so a slow or failing provider never blocks
 * subscriptions and never invents location data.
 */
const HTTP_GEO_TIMEOUT_MS = 2500;

function httpGeoFallbackEnabled(): boolean {
  const value = (process.env.GEOIP_HTTP_FALLBACK || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

interface HttpGeoRecord {
  countryCode: string;
  countryName: string;
  regionCode: string;
  regionName: string;
  city: string;
}

async function lookupHttpGeo(ip: string): Promise<HttpGeoRecord | null> {
  if (!httpGeoFallbackEnabled()) return null;
  if (!ip || isPrivateIp(ip)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_GEO_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code,region,region_code,city`,
      {
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "Signup888-geoip/1.0" },
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    if (data?.success !== true) return null;
    const countryCode = typeof data.country_code === "string" ? data.country_code : "";
    const countryName = typeof data.country === "string" ? data.country : "";
    if (!countryCode && !countryName) return null;
    const asString = (value: unknown): string => (typeof value === "string" ? value : "");
    return {
      countryCode: countryCode.toUpperCase(),
      countryName,
      regionCode: asString(data.region_code),
      regionName: asString(data.region),
      city: asString(data.city),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
      const cachedSource = redisData ? (JSON.parse(redisData) as GeoLocationResult).geoSource : undefined;
      if (redisData && cachedSource && CACHEABLE_GEO_SOURCES.includes(cachedSource)) {
        const parsed = JSON.parse(redisData) as GeoLocationResult;
        memoryGeoCache.set(ipHash, { result: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
        return { ...parsed, browserTimezone: tz };
      }
    } catch {
      // Ignore Redis error and proceed
    }
  }

  let geoData: MMDBLocationRecord | null = null;
  let geoSource: "ip_geo" | "http_api" | "cdn_header" | "legacy_timezone" | "unknown" = "unknown";

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

  // 1b. Opt-in HTTP fallback (GEOIP_HTTP_FALLBACK=1) when the local database
  // yielded nothing. Never overrides a working MMDB result.
  if (geoSource !== "ip_geo" && cleanIp && !isPrivateIp(cleanIp)) {
    const httpGeo = await lookupHttpGeo(cleanIp);
    if (httpGeo) {
      geoData = {
        countryCode: httpGeo.countryCode,
        countryName: httpGeo.countryName,
        regionCode: httpGeo.regionCode,
        regionName: httpGeo.regionName,
        city: httpGeo.city,
        timezone: "",
      };
      geoSource = "http_api";
    }
  }

  // 2. Fallback to Cloudflare / CDN headers
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

  // 3. Default Unknowns
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

  if (geoSource === "ip_geo" && city !== "Unknown") {
    lastSuccessfulCityLookup = new Date().toISOString();
  }

  const result: GeoLocationResult = {
    ipHash,
    countryCode,
    country,
    countryName: country,
    regionCode,
    region,
    regionName: region,
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
  if (CACHEABLE_GEO_SOURCES.includes(geoSource)) memoryGeoCache.set(ipHash, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  if (CACHEABLE_GEO_SOURCES.includes(geoSource) && redis && isRedisAvailable()) {
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
  requestOrHeaders: Headers | { headers: Headers } | Request,
  body?: { country?: string; city?: string; timezone?: string },
  remoteAddress?: string,
): Promise<GeoLocationResult> {
  const headers =
    requestOrHeaders instanceof Headers
      ? requestOrHeaders
      : "headers" in requestOrHeaders && requestOrHeaders.headers instanceof Headers
      ? requestOrHeaders.headers
      : new Headers();
  const ip = getTrustedClientIp(headers, remoteAddress);
  const browserTimezone = body?.timezone;
  return resolveIpLocation(ip, headers, browserTimezone);
}

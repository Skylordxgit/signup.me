import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { MMDBReader } from "../lib/mmdbReader";

test("real City database opens and resolves public IPs", { skip: !process.env.GEOIP_TEST_DB_PATH }, async () => {
  const reader = await MMDBReader.open(process.env.GEOIP_TEST_DB_PATH!);
  const result = reader.lookup("81.2.69.160");
  assert.ok(result?.countryCode);
  assert.ok(result?.countryName);
  assert.equal(reader.lookup("127.0.0.1"), null);
});

test("missing reader file preserves the filesystem error", async () => {
  await assert.rejects(MMDBReader.open("/nonexistent-geoip-test/City.mmdb"), { code: "ENOENT" });
});

test("loader recovers after changing a missing path to a real database", { skip: !process.env.GEOIP_TEST_DB_PATH }, async () => {
  const previous = process.env.GEOIP_DB_PATH;
  try {
    _resetGeoIpStateForTesting();
    process.env.GEOIP_DB_PATH = "/nonexistent-geoip-test/City.mmdb";
    assert.equal((await resolveIpLocation("81.2.69.160")).geoSource, "unknown");
    process.env.GEOIP_DB_PATH = process.env.GEOIP_TEST_DB_PATH;
    assert.equal((await getGeoIpHealth()).database, "Loaded");
    assert.equal((await resolveIpLocation("81.2.69.160")).geoSource, "ip_geo");
  } finally {
    if (previous === undefined) delete process.env.GEOIP_DB_PATH;
    else process.env.GEOIP_DB_PATH = previous;
    _resetGeoIpStateForTesting();
  }
});
import {
  getTrustedClientIp,
  normalizeIp,
  isPrivateIp,
  anonymizeIp,
  getGeoIpHealth,
  resolveIpLocation,
  resolveRequestGeo,
  diagnoseRequestGeo,
  getClientIpInfo,
  _resetGeoIpStateForTesting,
} from "../lib/geoIp";
import { formatLocation, collectSubscriberDetails, subscriberListItem } from "../lib/subscriberDetails";
import {
  createPage,
  createBlock,
  trackView,
  trackClick,
  savePushSubscription,
  analyticsForPage,
} from "../lib/store";

test("IP extraction: normalizes IPv4, IPv6, ports, and IPv4-mapped IPv6", () => {
  assert.equal(normalizeIp("103.21.244.1:8080"), "103.21.244.1");
  assert.equal(normalizeIp("::ffff:104.28.244.1"), "104.28.244.1");
  assert.equal(normalizeIp("2001:db8::1"), "2001:db8::1");
  assert.equal(normalizeIp("invalid-ip"), "");
  assert.equal(normalizeIp(""), "");
});

test("IP extraction: detects private, loopback, link-local, and reserved IPs", () => {
  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("10.0.0.1"), true);
  assert.equal(isPrivateIp("172.16.0.1"), true);
  assert.equal(isPrivateIp("192.168.1.1"), true);
  assert.equal(isPrivateIp("169.254.1.1"), true);
  assert.equal(isPrivateIp("100.64.0.1"), true);
  assert.equal(isPrivateIp("::1"), true);
  assert.equal(isPrivateIp("fe80::1"), true);
  assert.equal(isPrivateIp("fc00::1"), true);
  assert.equal(isPrivateIp("103.21.244.1"), false);
  assert.equal(isPrivateIp("104.28.244.1"), false);
});

test("IP extraction: follows trusted header precedence and prevents header spoofing", () => {
  // 1. Cloudflare header
  const cfHeaders = new Headers({
    "cf-connecting-ip": "103.21.244.10",
    "x-forwarded-for": "10.0.0.1, 192.168.1.1",
    "x-real-ip": "10.0.0.2",
  });
  assert.equal(getTrustedClientIp(cfHeaders), "103.21.244.10");

  // 2. Nginx X-Real-IP
  const realIpHeaders = new Headers({
    "x-real-ip": "104.28.244.20",
    "x-forwarded-for": "10.0.0.1",
  });
  assert.equal(getTrustedClientIp(realIpHeaders), "104.28.244.20");

  // 3. X-Forwarded-For chain: skips private/spoofed hops and picks first public IP
  const xffHeaders = new Headers({
    "x-forwarded-for": "10.0.0.5, 103.205.180.30, 192.168.1.100",
  });
  assert.equal(getTrustedClientIp(xffHeaders), "103.205.180.30");

  // 4. Fallback socket remote address
  const emptyHeaders = new Headers();
  assert.equal(getTrustedClientIp(emptyHeaders, "185.86.151.40"), "185.86.151.40");

  // 5. Default fallback for local dev
  assert.equal(getTrustedClientIp(emptyHeaders), "127.0.0.1");
});

test("GeoIP resolution: does not invent city data when the MMDB is unavailable", async () => {
  _resetGeoIpStateForTesting();

  const mumbai = await resolveIpLocation("103.21.244.1");
  assert.equal(mumbai.country, "Unknown");
  assert.equal(mumbai.region, "Unknown");
  assert.equal(mumbai.city, "Unknown");
  assert.equal(mumbai.geoSource, "unknown");
});

test("GeoIP resolution: uses trusted CDN country headers without guessing city", async () => {
  _resetGeoIpStateForTesting();

  const headers = new Headers({
    "cf-connecting-ip": "103.21.244.1",
    "cf-ipcountry": "IN",
  });
  const geo = await resolveRequestGeo(headers, { timezone: "Asia/Kolkata" });
  assert.equal(geo.country, "India");
  assert.equal(geo.countryCode, "IN");
  assert.equal(geo.region, "Unknown");
  assert.equal(geo.city, "Unknown");
  assert.equal(geo.geoSource, "cdn_header");
  assert.equal(geo.browserTimezone, "Asia/Kolkata");
});

test("GeoIP health reports missing local database explicitly", async () => {
  _resetGeoIpStateForTesting();
  const health = await getGeoIpHealth();
  assert.equal(health.database, "Missing");
  assert.equal(health.reader, "Unavailable");
});

test("Timezone safety: NEVER infers city from browser timezone", async () => {
  _resetGeoIpStateForTesting();

  // Local/unresolvable IP with Asia/Kolkata browser timezone
  const headers = new Headers();
  const unknownWithKolkataTz = await resolveRequestGeo(headers, { timezone: "Asia/Kolkata" });
  assert.equal(unknownWithKolkataTz.city, "Unknown");
  assert.equal(unknownWithKolkataTz.country, "Unknown");
  assert.equal(unknownWithKolkataTz.browserTimezone, "Asia/Kolkata");
  assert.notEqual(unknownWithKolkataTz.city, "Kolkata");

  // Local/unresolvable IP with America/Los_Angeles browser timezone
  const unknownWithLaTz = await resolveRequestGeo(headers, { timezone: "America/Los_Angeles" });
  assert.equal(unknownWithLaTz.city, "Unknown");
  assert.equal(unknownWithLaTz.country, "Unknown");
  assert.equal(unknownWithLaTz.browserTimezone, "America/Los_Angeles");
  assert.notEqual(unknownWithLaTz.city, "Los Angeles");
});

test("Location format & Subscriber details: separates traffic source and location", () => {
  const loc = formatLocation("IN", "Mumbai", "Maharashtra");
  assert.equal(loc.country, "India");
  assert.equal(loc.region, "Maharashtra");
  assert.equal(loc.city, "Mumbai");
  assert.equal(loc.location, "Mumbai, Maharashtra, India");

  const unknownLoc = formatLocation("", "", "");
  assert.equal(unknownLoc.country, "Unknown");
  assert.equal(unknownLoc.region, "Unknown");
  assert.equal(unknownLoc.city, "Unknown");
  assert.equal(unknownLoc.location, "Unknown");
  assert.ok(!unknownLoc.location.includes("Direct"));
});

test("Analytics aggregation: calculates EXACT unique visitors and subscriber metrics without fake multipliers", async () => {
  const slug = `exact-metrics-${Date.now()}`;
  const page = await createPage({
    name: "Exact Metrics Page",
    slug,
    title: "Exact Metrics Page",
    bio: "",
    profileImage: "",
  });
  assert.ok(page);
  const block = (await createBlock(page.id, "link"))!;
  assert.ok(block);

  // Record 3 views from Mumbai with 2 distinct visitors
  await trackView(slug, "Mozilla/5.0", "Direct", "mumbai-visitor-1", "India", "Mumbai", "Mumbai, Maharashtra, India", undefined, "IN", "Maharashtra", "MH", "ip_geo");
  await trackView(slug, "Mozilla/5.0", "Direct", "mumbai-visitor-1", "India", "Mumbai", "Mumbai, Maharashtra, India", undefined, "IN", "Maharashtra", "MH", "ip_geo");
  await trackView(slug, "Mozilla/5.0", "https://google.com", "mumbai-visitor-2", "India", "Mumbai", "Mumbai, Maharashtra, India", undefined, "IN", "Maharashtra", "MH", "ip_geo");

  // Record 2 views from Dhaka with 2 distinct visitors
  await trackView(slug, "Mozilla/5.0", "https://facebook.com", "dhaka-visitor-1", "Bangladesh", "Dhaka", "Dhaka, Dhaka Division, Bangladesh", undefined, "BD", "Dhaka Division", "13", "ip_geo");
  await trackView(slug, "Mozilla/5.0", "Direct", "dhaka-visitor-2", "Bangladesh", "Dhaka", "Dhaka, Dhaka Division, Bangladesh", undefined, "BD", "Dhaka Division", "13", "ip_geo");

  // Record 1 click from Mumbai
  await trackClick(page.id, block.id, "Mozilla/5.0", "Direct", "India", "Mumbai", "Mumbai, Maharashtra, India", undefined, "IN", "Maharashtra", "MH", "ip_geo");

  // Save 1 subscriber from Mumbai
  await savePushSubscription(
    slug,
    { endpoint: `https://push.example.com/sub-mumbai-${Date.now()}`, keys: { auth: "auth1", p256dh: "key1" } },
    "Mozilla/5.0",
    {
      device: "Desktop",
      browser: "Chrome",
      ipAddress: "103.21.244.1",
      country: "India",
      countryCode: "IN",
      countryName: "India",
      region: "Maharashtra",
      regionCode: "MH",
      regionName: "Maharashtra",
      city: "Mumbai",
      timezone: "Asia/Kolkata",
    },
  );

  const report = await analyticsForPage(page.id, 30);
  assert.ok(report);

  // Total Views = 5, Total Unique Visitors = 4 (mumbai-1, mumbai-2, dhaka-1, dhaka-2)
  assert.equal(report.views, 5);
  assert.equal(report.uniqueVisitors, 4);
  assert.equal(report.clicks, 1);
  assert.equal(report.subscribers, 1);
  assert.equal(report.ctr, 20.0); // 1 / 5 * 100 = 20.0%

  // India Country metrics
  const india = report.countries?.find((c) => c.countryName === "India");
  assert.ok(india);
  assert.equal(india.views, 3);
  assert.equal(india.visitors, 2); // Exact distinct visitors: 2
  assert.equal(india.clicks, 1);
  assert.equal(india.subscribers, 1);
  assert.equal(india.ctr, 33.3); // 1 / 3 * 100 = 33.3%

  // Mumbai City metrics
  const mumbaiCity = india.cities.find((ct) => ct.city === "Mumbai");
  assert.ok(mumbaiCity);
  assert.equal(mumbaiCity.views, 3);
  assert.equal(mumbaiCity.visitors, 2);
  assert.equal(mumbaiCity.clicks, 1);
  assert.equal(mumbaiCity.subscribers, 1);

  // Dhaka City metrics
  const bangladesh = report.countries?.find((c) => c.countryName === "Bangladesh");
  assert.ok(bangladesh);
  assert.equal(bangladesh.views, 2);
  assert.equal(bangladesh.visitors, 2);
  assert.equal(bangladesh.clicks, 0);
  assert.equal(bangladesh.subscribers, 0);

  // Traffic sources are completely separated from locations
  const sources = report.trafficSources || [];
  assert.ok(sources.length >= 2);
  assert.ok(sources.some((s) => s.source === "Direct"));
  assert.ok(sources.some((s) => s.source.includes("google.com")));

  // Verify 'Direct / Local' is never listed as a country or city
  assert.ok(!report.countries?.some((c) => c.countryName === "Direct / Local" || c.countryName === "Direct"));
  assert.ok(!report.locations?.some((l) => l.city === "Direct" || l.city === "Direct / Local"));
});

test("MMDB normalization: parses complete CityResponse for Mumbai, India", () => {
  const rawCityResponse = {
    country: { iso_code: "IN", names: { en: "India" } },
    subdivisions: [{ iso_code: "MH", names: { en: "Maharashtra" } }],
    city: { names: { en: "Mumbai" } },
    location: { time_zone: "Asia/Kolkata" },
  };

  const formatted = MMDBReader.formatRecord(rawCityResponse as any);
  assert.ok(formatted);
  assert.equal(formatted.countryCode, "IN");
  assert.equal(formatted.countryName, "India");
  assert.equal(formatted.regionCode, "MH");
  assert.equal(formatted.regionName, "Maharashtra");
  assert.equal(formatted.city, "Mumbai");
  assert.equal(formatted.timezone, "Asia/Kolkata");
});

test("MMDB normalization: handles country-only response (e.g. CDN edge datacenter)", () => {
  const datacenterResponse = {
    country: { iso_code: "IN", names: { en: "India" } },
    subdivisions: [],
    city: undefined,
  };

  const formatted = MMDBReader.formatRecord(datacenterResponse as any);
  assert.ok(formatted);
  assert.equal(formatted.countryCode, "IN");
  assert.equal(formatted.countryName, "India");
  assert.equal(formatted.regionCode, undefined);
  assert.equal(formatted.regionName, undefined);
  assert.equal(formatted.city, undefined);
});

test("MMDB normalization: falls back to registered_country if country is missing", () => {
  const registeredOnlyResponse = {
    registered_country: { iso_code: "IN", names: { en: "India" } },
  };

  const formatted = MMDBReader.formatRecord(registeredOnlyResponse as any);
  assert.ok(formatted);
  assert.equal(formatted.countryCode, "IN");
  assert.equal(formatted.countryName, "India");
});

test("MMDB normalization: handles missing city with known region", () => {
  const regionOnlyResponse = {
    country: { iso_code: "IN", names: { en: "India" } },
    subdivisions: [{ iso_code: "MH", names: { en: "Maharashtra" } }],
  };

  const formatted = MMDBReader.formatRecord(regionOnlyResponse as any);
  assert.ok(formatted);
  assert.equal(formatted.countryCode, "IN");
  assert.equal(formatted.countryName, "India");
  assert.equal(formatted.regionName, "Maharashtra");
  assert.equal(formatted.city, undefined);
});

test("MMDB normalization: returns null for empty or invalid data", () => {
  assert.equal(MMDBReader.formatRecord(null), null);
  assert.equal(MMDBReader.formatRecord(undefined), null);
  assert.equal(MMDBReader.formatRecord({} as any), null);
});

test("Proxy chain: Hostinger CDN edge precedence test", () => {
  // Visitor is 103.21.244.1, Hostinger CDN edge is 88.222.243.172
  const headers = new Headers({
    "x-forwarded-for": "103.21.244.1, 88.222.243.172",
    "x-real-ip": "88.222.243.172",
  });

  const ip = getTrustedClientIp(headers);
  assert.equal(ip, "103.21.244.1");

  const info = getClientIpInfo(headers);
  assert.equal(info.ip, "103.21.244.1");
  assert.equal(info.source, "x-forwarded-for");
  assert.equal(info.type, "ipv4_public");
});

test("Proxy chain: skips known SERVER_IP in X-Forwarded-For", () => {
  const prevServerIp = process.env.SERVER_IP;
  try {
    process.env.SERVER_IP = "88.222.243.172";
    const headers = new Headers({
      "x-forwarded-for": "88.222.243.172, 103.21.244.5",
    });
    assert.equal(getTrustedClientIp(headers), "103.21.244.5");
  } finally {
    if (prevServerIp === undefined) delete process.env.SERVER_IP;
    else process.env.SERVER_IP = prevServerIp;
  }
});

test("Proxy chain: IPv6 client address extraction", () => {
  const headers = new Headers({
    "x-forwarded-for": "2001:db8:85a3::8a2e:370:7334, 192.168.1.1",
  });
  const info = getClientIpInfo(headers);
  assert.equal(info.ip, "2001:db8:85a3::8a2e:370:7334");
  assert.equal(info.type, "ipv6_public");
});

test("Request diagnostics: diagnoseRequestGeo reports full diagnostic payload", async () => {
  _resetGeoIpStateForTesting();

  const headers = new Headers({
    "x-forwarded-for": "103.21.244.1, 88.222.243.172",
    "x-real-ip": "88.222.243.172",
  });

  const diag = await diagnoseRequestGeo(headers);
  assert.equal(diag.clientIpSource, "x-forwarded-for");
  assert.equal(diag.clientIpType, "ipv4_public");
  assert.ok("countrySource" in diag);
  assert.ok("regionSource" in diag);
  assert.ok("citySource" in diag);
  assert.ok("geoSource" in diag);
  assert.ok("geoDbLoaded" in diag);
  assert.ok("lookupSucceeded" in diag);
});

test("Subscriber details: persists geoSource and handles subscriber list item mapping", () => {
  const headers = new Headers({
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "x-forwarded-for": "103.21.244.1",
  });

  const mockGeo = {
    country: "India",
    countryCode: "IN",
    countryName: "India",
    region: "Maharashtra",
    regionCode: "MH",
    regionName: "Maharashtra",
    city: "Mumbai",
    location: "Mumbai, Maharashtra, India",
    geoSource: "ip_geo" as const,
  };

  const details = collectSubscriberDetails(headers, { timezone: "Asia/Kolkata" }, mockGeo);
  assert.equal(details.country, "India");
  assert.equal(details.countryCode, "IN");
  assert.equal(details.countryName, "India");
  assert.equal(details.region, "Maharashtra");
  assert.equal(details.regionCode, "MH");
  assert.equal(details.regionName, "Maharashtra");
  assert.equal(details.city, "Mumbai");
  assert.equal(details.geoSource, "ip_geo");
  assert.ok(details.timezone === "Asia/Kolkata" || details.timezone === "Asia/Calcutta");

  const item = subscriberListItem({
    id: 42,
    pageId: 1,
    slug: "mumbai-page",
    createdAt: "2026-09-25T10:00:00Z",
    userAgent: headers.get("user-agent") || "",
    details,
  });

  assert.equal(item.id, 42);
  assert.equal(item.country, "India");
  assert.equal(item.countryCode, "IN");
  assert.equal(item.countryName, "India");
  assert.equal(item.region, "Maharashtra");
  assert.equal(item.regionCode, "MH");
  assert.equal(item.regionName, "Maharashtra");
  assert.equal(item.city, "Mumbai");
  assert.equal(item.geoSource, "ip_geo");
});

// ---------------------------------------------------------------------------
// HTTP geo fallback (GEOIP_HTTP_FALLBACK=1): resolves city/region/country when
// the local MaxMind database file is missing, without inventing data when the
// provider is disabled, unreachable, or refusing.
// ---------------------------------------------------------------------------

const MISSING_DB_PATH = "/nonexistent-geoip-test/City.mmdb";

function withMissingDbAndHttpFallback(t: TestContext) {
  _resetGeoIpStateForTesting();
  const prevDbPath = process.env.GEOIP_DB_PATH;
  const prevFallback = process.env.GEOIP_HTTP_FALLBACK;
  process.env.GEOIP_DB_PATH = MISSING_DB_PATH;
  process.env.GEOIP_HTTP_FALLBACK = "1";
  _resetGeoIpStateForTesting();
  t.after(() => {
    if (prevDbPath === undefined) delete process.env.GEOIP_DB_PATH;
    else process.env.GEOIP_DB_PATH = prevDbPath;
    if (prevFallback === undefined) delete process.env.GEOIP_HTTP_FALLBACK;
    else process.env.GEOIP_HTTP_FALLBACK = prevFallback;
    _resetGeoIpStateForTesting();
  });
}

function mockIpWhoIs(t: TestContext, payload: Record<string, unknown>) {
  return t.mock.method(
    globalThis,
    "fetch",
    (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch,
  );
}

test("HTTP fallback: resolves country/region/city when the MMDB is missing", async (t) => {
  withMissingDbAndHttpFallback(t);
  const fetchMock = mockIpWhoIs(t, {
    success: true,
    country: "India",
    country_code: "IN",
    region: "Maharashtra",
    region_code: "MH",
    city: "Mumbai",
  });

  const geo = await resolveIpLocation("103.21.244.1");

  assert.equal(fetchMock.mock.calls.length, 1);
  assert.ok(String(fetchMock.mock.calls[0].arguments[0]).includes("103.21.244.1"));
  assert.equal(geo.country, "India");
  assert.equal(geo.countryCode, "IN");
  assert.equal(geo.region, "Maharashtra");
  assert.equal(geo.regionCode, "MH");
  assert.equal(geo.city, "Mumbai");
  assert.equal(geo.location, "Mumbai, Maharashtra, India");
  assert.equal(geo.geoSource, "http_api");
});

test("HTTP fallback: caches the lookup so the provider is hit once per IP", async (t) => {
  withMissingDbAndHttpFallback(t);
  const fetchMock = mockIpWhoIs(t, {
    success: true,
    country: "India",
    country_code: "IN",
    region: "",
    region_code: "",
    city: "",
  });

  const first = await resolveIpLocation("49.32.0.1");
  const second = await resolveIpLocation("49.32.0.1");

  assert.equal(fetchMock.mock.calls.length, 1);
  assert.equal(first.geoSource, "http_api");
  assert.equal(first.country, "India");
  assert.equal(second.geoSource, "http_api");
  assert.equal(second.city, "Unknown");
});

test("HTTP fallback: provider refusal falls through without inventing data", async (t) => {
  withMissingDbAndHttpFallback(t);
  mockIpWhoIs(t, { success: false, message: "rate limited" });

  const geo = await resolveIpLocation("103.21.244.1");

  assert.equal(geo.country, "Unknown");
  assert.equal(geo.region, "Unknown");
  assert.equal(geo.city, "Unknown");
  assert.equal(geo.geoSource, "unknown");
});

test("HTTP fallback: network errors never block resolution", async (t) => {
  withMissingDbAndHttpFallback(t);
  t.mock.method(
    globalThis,
    "fetch",
    (async () => {
      throw new Error("network down");
    }) as typeof fetch,
  );

  const geo = await resolveIpLocation("103.21.244.1");

  assert.equal(geo.country, "Unknown");
  assert.equal(geo.geoSource, "unknown");
});

test("HTTP fallback: never queries the provider for private IPs", async (t) => {
  withMissingDbAndHttpFallback(t);
  const fetchMock = mockIpWhoIs(t, { success: true, country: "India", country_code: "IN" });

  const geo = await resolveIpLocation("192.168.1.10");

  assert.equal(fetchMock.mock.calls.length, 0);
  assert.equal(geo.country, "Unknown");
  assert.equal(geo.geoSource, "unknown");
});

test("HTTP fallback: stays off unless explicitly enabled", async (t) => {
  _resetGeoIpStateForTesting();
  const prevDbPath = process.env.GEOIP_DB_PATH;
  const prevFallback = process.env.GEOIP_HTTP_FALLBACK;
  process.env.GEOIP_DB_PATH = MISSING_DB_PATH;
  delete process.env.GEOIP_HTTP_FALLBACK;
  _resetGeoIpStateForTesting();
  t.after(() => {
    if (prevDbPath === undefined) delete process.env.GEOIP_DB_PATH;
    else process.env.GEOIP_DB_PATH = prevDbPath;
    if (prevFallback === undefined) delete process.env.GEOIP_HTTP_FALLBACK;
    else process.env.GEOIP_HTTP_FALLBACK = prevFallback;
    _resetGeoIpStateForTesting();
  });
  const fetchMock = mockIpWhoIs(t, {
    success: true,
    country: "India",
    country_code: "IN",
    city: "Mumbai",
  });

  const geo = await resolveIpLocation("103.21.244.1");

  assert.equal(fetchMock.mock.calls.length, 0);
  assert.equal(geo.country, "Unknown");
  assert.equal(geo.city, "Unknown");
  assert.equal(geo.geoSource, "unknown");
});

test("HTTP fallback: diagnostics report http_api as the resolving source", async (t) => {
  withMissingDbAndHttpFallback(t);
  mockIpWhoIs(t, {
    success: true,
    country: "India",
    country_code: "IN",
    region: "Maharashtra",
    region_code: "MH",
    city: "Mumbai",
  });

  const diag = await diagnoseRequestGeo(new Headers({ "x-forwarded-for": "103.21.244.1" }));

  assert.equal(diag.geoSource, "http_api");
  assert.equal(diag.countrySource, "http_api");
  assert.equal(diag.regionSource, "http_api");
  assert.equal(diag.citySource, "http_api");
  assert.equal(diag.resolved.city, "Mumbai");
});

test("Subscriber details: preserves http_api geoSource end to end", () => {
  const headers = new Headers({
    "user-agent": "test",
    "x-forwarded-for": "103.21.244.1",
  });
  const details = collectSubscriberDetails(
    headers,
    {},
    {
      ipHash: "abc",
      country: "India",
      countryCode: "IN",
      countryName: "India",
      region: "Maharashtra",
      regionCode: "MH",
      regionName: "Maharashtra",
      city: "Mumbai",
      location: "Mumbai, Maharashtra, India",
      timezone: "",
      browserTimezone: "",
      geoSource: "http_api" as const,
    },
  );

  assert.equal(details.country, "India");
  assert.equal(details.city, "Mumbai");
  assert.equal(details.region, "Maharashtra");
  assert.equal(details.geoSource, "http_api");

  const item = subscriberListItem({
    id: 7,
    pageId: 1,
    slug: "fallback-page",
    createdAt: "2026-09-25T10:00:00Z",
    userAgent: "test",
    details,
  });
  assert.equal(item.geoSource, "http_api");
  assert.equal(item.city, "Mumbai");
});

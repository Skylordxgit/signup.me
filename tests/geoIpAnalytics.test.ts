import assert from "node:assert/strict";
import test from "node:test";
import {
  getTrustedClientIp,
  normalizeIp,
  isPrivateIp,
  anonymizeIp,
  getGeoIpHealth,
  resolveIpLocation,
  resolveRequestGeo,
  _resetGeoIpStateForTesting,
} from "../lib/geoIp";
import { formatLocation, collectSubscriberDetails } from "../lib/subscriberDetails";
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

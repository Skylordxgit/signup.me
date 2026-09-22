import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLocation } from '../lib/subscriberDetails';
import { extractClientIp, extractGeoFromHeaders, hashIp, isPublicIp, normalizeLocation, resolveClientLocation } from '../lib/ipGeo';
import * as jsonStore from '../lib/stores/jsonStore';

test('isPublicIp accurately distinguishes public routable IPs from internal/private/loopback ranges', () => {
  // Public IPv4
  assert.equal(isPublicIp('103.21.244.2'), true); // Mumbai ISP
  assert.equal(isPublicIp('49.36.12.9'), true);   // Reliance Jio India
  assert.equal(isPublicIp('103.205.180.1'), true); // Bangladesh ISP
  assert.equal(isPublicIp('8.8.8.8'), true);       // Google DNS
  assert.equal(isPublicIp('1.1.1.1'), true);       // Cloudflare DNS

  // Private IPv4 (RFC 1918)
  assert.equal(isPublicIp('10.0.0.1'), false);
  assert.equal(isPublicIp('10.255.255.255'), false);
  assert.equal(isPublicIp('172.16.0.1'), false);
  assert.equal(isPublicIp('172.31.255.255'), false);
  assert.equal(isPublicIp('192.168.1.1'), false);

  // Loopback & Link-local & CGNAT
  assert.equal(isPublicIp('127.0.0.1'), false);
  assert.equal(isPublicIp('169.254.1.1'), false);
  assert.equal(isPublicIp('100.64.0.1'), false);
  assert.equal(isPublicIp('0.0.0.0'), false);
  assert.equal(isPublicIp('255.255.255.255'), false);

  // Public IPv6
  assert.equal(isPublicIp('2405:201:6800:1::1'), true); // Jio IPv6
  assert.equal(isPublicIp('2607:f8b0:4005:800::200e'), true); // Google IPv6

  // Private / Loopback IPv6
  assert.equal(isPublicIp('::1'), false);
  assert.equal(isPublicIp('::'), false);
  assert.equal(isPublicIp('fe80::1'), false);
  assert.equal(isPublicIp('fc00::1'), false);
  assert.equal(isPublicIp('fd00::1'), false);
});

test('hashIp creates consistent anonymized visitor tokens without leaking raw IP', () => {
  const hash1 = hashIp('103.21.244.2');
  const hash2 = hashIp('103.21.244.2');
  const hash3 = hashIp('49.36.12.9');

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(hash1.length, 32);
  assert.equal(hash1.includes('103.21.244.2'), false);
});

test('normalizeLocation stores separate country, state/region, and city fields', () => {
  // Mumbai, Maharashtra, India
  const mumbai = normalizeLocation('India', 'IN', 'Maharashtra', 'MH', 'Mumbai', 'Asia/Kolkata');
  assert.equal(mumbai.countryName, 'India');
  assert.equal(mumbai.countryCode, 'IN');
  assert.equal(mumbai.regionName, 'Maharashtra');
  assert.equal(mumbai.regionCode, 'MH');
  assert.equal(mumbai.city, 'Mumbai');
  assert.equal(mumbai.timezone, 'Asia/Kolkata');
  assert.equal(mumbai.location, 'Mumbai, India');
  assert.equal(mumbai.isApproximate, true);

  // Dhaka, Dhaka Division, Bangladesh
  const dhaka = normalizeLocation('Bangladesh', 'BD', 'Dhaka Division', '13', 'Dhaka', 'Asia/Dhaka');
  assert.equal(dhaka.countryName, 'Bangladesh');
  assert.equal(dhaka.countryCode, 'BD');
  assert.equal(dhaka.regionName, 'Dhaka Division');
  assert.equal(dhaka.regionCode, '13');
  assert.equal(dhaka.city, 'Dhaka');
  assert.equal(dhaka.timezone, 'Asia/Dhaka');
  assert.equal(dhaka.location, 'Dhaka, Bangladesh');

  // Automatic code to division mapping (e.g. IN + MH -> Maharashtra)
  const autoRegion = normalizeLocation('', 'IN', '', 'MH', 'Pune', 'Asia/Kolkata');
  assert.equal(autoRegion.countryName, 'India');
  assert.equal(autoRegion.regionName, 'Maharashtra');
  assert.equal(autoRegion.city, 'Pune');
});

test('formatLocation never assumes timezone name is the city', () => {
  // Asia/Kolkata is the standard IANA timezone identifier for all of India.
  // When a visitor from Mumbai visits with timezone Asia/Kolkata but no explicit city:
  const noCity = formatLocation('', '', 'Asia/Kolkata');
  assert.equal(noCity.country, 'India');
  assert.equal(noCity.city, '');
  assert.equal(noCity.location, 'India');

  // When visitor city is Mumbai:
  const mumbai = formatLocation('India', 'Mumbai', 'Asia/Kolkata');
  assert.equal(mumbai.country, 'India');
  assert.equal(mumbai.city, 'Mumbai');
  assert.equal(mumbai.location, 'Mumbai, India');

  // When visitor city is Bengaluru:
  const bangalore = formatLocation('IN', 'Bengaluru', 'Asia/Kolkata');
  assert.equal(bangalore.country, 'India');
  assert.equal(bangalore.city, 'Bengaluru');
  assert.equal(bangalore.location, 'Bengaluru, India');

  // When visitor city is Delhi:
  const delhi = formatLocation('India', 'Delhi', 'Asia/Calcutta');
  assert.equal(delhi.country, 'India');
  assert.equal(delhi.city, 'Delhi');
  assert.equal(delhi.location, 'Delhi, India');
});

test('extractGeoFromHeaders parses Cloudflare, Vercel, and proxy geo headers with URL decoding', () => {
  // Cloudflare headers with encoded characters
  const cfHeaders = new Headers({
    'cf-ipcountry': 'IN',
    'cf-ipcity': 'Mumbai',
    'cf-region': 'Maharashtra',
    'cf-region-code': 'MH',
    'cf-timezone': 'Asia/Kolkata',
  });
  const cfGeo = extractGeoFromHeaders(cfHeaders);
  assert.equal(cfGeo.countryCode, 'IN');
  assert.equal(cfGeo.city, 'Mumbai');
  assert.equal(cfGeo.regionName, 'Maharashtra');
  assert.equal(cfGeo.regionCode, 'MH');
  assert.equal(cfGeo.timezone, 'Asia/Kolkata');

  // Vercel headers with URL-encoded city name (e.g. New York)
  const vercelHeaders = new Headers({
    'x-vercel-ip-country': 'US',
    'x-vercel-ip-city': 'New%20York',
    'x-vercel-ip-country-region': 'NY',
    'x-vercel-ip-timezone': 'America/New_York',
  });
  const vercelGeo = extractGeoFromHeaders(vercelHeaders);
  assert.equal(vercelGeo.countryCode, 'US');
  assert.equal(vercelGeo.city, 'New York');
  assert.equal(vercelGeo.regionCode, 'NY');
  assert.equal(vercelGeo.timezone, 'America/New_York');
});

test('extractClientIp correctly extracts first public client IP across various reverse proxy setups', () => {
  assert.equal(extractClientIp(new Headers({ 'cf-connecting-ip': '103.21.244.2' })), '103.21.244.2');
  assert.equal(extractClientIp(new Headers({ 'x-real-ip': '49.36.12.9' })), '49.36.12.9');
  assert.equal(extractClientIp(new Headers({ 'x-forwarded-for': '103.21.244.2, 10.0.0.1, 172.16.0.2' })), '103.21.244.2');
  // Unwrap IPv4-mapped IPv6
  assert.equal(extractClientIp(new Headers({ 'x-forwarded-for': '::ffff:49.36.12.9' })), '49.36.12.9');
});

test('resolveClientLocation prioritizes accurate city and region from headers and caches lookups', async () => {
  const headers = new Headers({
    'cf-ipcountry': 'IN',
    'cf-ipcity': 'Mumbai',
    'cf-region': 'Maharashtra',
    'cf-region-code': 'MH',
    'cf-timezone': 'Asia/Kolkata',
  });
  const res = await resolveClientLocation(headers, { timezone: 'Asia/Kolkata' });
  assert.equal(res.countryName, 'India');
  assert.equal(res.countryCode, 'IN');
  assert.equal(res.regionName, 'Maharashtra');
  assert.equal(res.regionCode, 'MH');
  assert.equal(res.city, 'Mumbai');
  assert.equal(res.location, 'Mumbai, India');
  assert.equal(res.isApproximate, true);
});

test('analyticsForPage aggregates Country -> State/Region -> City hierarchy', async () => {
  const page = await jsonStore.createPage({
    name: 'Geo Analytics Test Page',
    slug: 'geo-analytics-test-' + Date.now(),
    title: 'Geo Test',
    bio: 'Testing Geo',
    profileImage: '',
  });
  assert.ok(page);

  // Track a view from Mumbai, Maharashtra, India
  await jsonStore.trackView(
    page.slug,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'https://google.com',
    'visitor-mumbai-1',
    'India',
    'Mumbai',
    'Mumbai, India',
    page.workspaceId,
    { countryCode: 'IN', region: 'Maharashtra', regionCode: 'MH', timezone: 'Asia/Kolkata' }
  );

  // Track a view from Pune, Maharashtra, India
  await jsonStore.trackView(
    page.slug,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'https://google.com',
    'visitor-pune-1',
    'India',
    'Pune',
    'Pune, India',
    page.workspaceId,
    { countryCode: 'IN', region: 'Maharashtra', regionCode: 'MH', timezone: 'Asia/Kolkata' }
  );

  // Track a view from Dhaka, Dhaka Division, Bangladesh
  await jsonStore.trackView(
    page.slug,
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)',
    'Direct',
    'visitor-dhaka-1',
    'Bangladesh',
    'Dhaka',
    'Dhaka, Bangladesh',
    page.workspaceId,
    { countryCode: 'BD', region: 'Dhaka Division', regionCode: '13', timezone: 'Asia/Dhaka' }
  );

  const report = await jsonStore.analyticsForPage(page.id, 30);
  assert.ok(report);
  assert.equal(report.views, 3);
  assert.equal(report.uniqueVisitors, 3);

  const india = report.countries?.find(c => c.countryName === 'India');
  assert.ok(india, 'India should be present in country metrics');
  assert.equal(india.views, 2);

  const maharashtra = india.regions?.find(r => r.regionName === 'Maharashtra');
  assert.ok(maharashtra, 'Maharashtra region should be present under India');
  assert.equal(maharashtra.views, 2);

  const mumbai = maharashtra.cities.find(ct => ct.city === 'Mumbai');
  assert.ok(mumbai, 'Mumbai should be present under Maharashtra');
  assert.equal(mumbai.views, 1);

  const pune = maharashtra.cities.find(ct => ct.city === 'Pune');
  assert.ok(pune, 'Pune should be present under Maharashtra');
  assert.equal(pune.views, 1);

  const bangladesh = report.countries?.find(c => c.countryName === 'Bangladesh');
  assert.ok(bangladesh, 'Bangladesh should be present');
  assert.equal(bangladesh.views, 1);

  const dhakaDivision = bangladesh.regions?.find(r => r.regionName === 'Dhaka Division');
  assert.ok(dhakaDivision, 'Dhaka Division should be present');
  assert.equal(dhakaDivision.views, 1);

  // Cleanup
  await jsonStore.deletePage(page.id);
});

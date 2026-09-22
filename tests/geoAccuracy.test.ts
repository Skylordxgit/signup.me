import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLocation } from '../lib/subscriberDetails';
import { extractClientIp, extractGeoFromHeaders, resolveClientLocation } from '../lib/ipGeo';

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

  // Other worldwide timezones do not corrupt visitor cities
  const chicago = formatLocation('United States', 'Houston', 'America/Chicago');
  assert.equal(chicago.country, 'United States');
  assert.equal(chicago.city, 'Houston');
  assert.equal(chicago.location, 'Houston, United States');

  const london = formatLocation('United Kingdom', 'Manchester', 'Europe/London');
  assert.equal(london.country, 'United Kingdom');
  assert.equal(london.city, 'Manchester');
  assert.equal(london.location, 'Manchester, United Kingdom');
});

test('extractGeoFromHeaders parses Cloudflare, Vercel, and proxy geo headers with URL decoding', () => {
  // Cloudflare headers with encoded characters
  const cfHeaders = new Headers({
    'cf-ipcountry': 'IN',
    'cf-ipcity': 'Mumbai',
    'cf-region': 'Maharashtra',
  });
  const cfGeo = extractGeoFromHeaders(cfHeaders);
  assert.equal(cfGeo.country, 'IN');
  assert.equal(cfGeo.countryCode, 'IN');
  assert.equal(cfGeo.city, 'Mumbai');
  assert.equal(cfGeo.region, 'Maharashtra');

  // Vercel headers with URL-encoded city name (e.g. New York)
  const vercelHeaders = new Headers({
    'x-vercel-ip-country': 'US',
    'x-vercel-ip-city': 'New%20York',
    'x-vercel-ip-country-region': 'NY',
  });
  const vercelGeo = extractGeoFromHeaders(vercelHeaders);
  assert.equal(vercelGeo.country, 'US');
  assert.equal(vercelGeo.city, 'New York');
  assert.equal(vercelGeo.region, 'NY');
});

test('extractClientIp correctly extracts client IP across various reverse proxy setups', () => {
  assert.equal(extractClientIp(new Headers({ 'cf-connecting-ip': '103.21.244.2' })), '103.21.244.2');
  assert.equal(extractClientIp(new Headers({ 'x-real-ip': '49.36.12.9' })), '49.36.12.9');
  assert.equal(extractClientIp(new Headers({ 'x-forwarded-for': '115.110.224.1, 10.0.0.1' })), '115.110.224.1');
});

test('resolveClientLocation prioritizes accurate city from headers or client hints', async () => {
  const headers = new Headers({
    'cf-ipcountry': 'IN',
    'cf-ipcity': 'Mumbai',
    'cf-region': 'Maharashtra',
  });
  const res = await resolveClientLocation(headers, { timezone: 'Asia/Kolkata' });
  assert.equal(res.country, 'India');
  assert.equal(res.city, 'Mumbai');
  assert.equal(res.region, 'Maharashtra');
  assert.equal(res.location, 'Mumbai, India');

  // Client hint city provided when direct headers absent
  const directHeaders = new Headers({
    'x-forwarded-for': '127.0.0.1',
  });
  const clientHintRes = await resolveClientLocation(directHeaders, {
    country: 'India',
    city: 'Mumbai',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(clientHintRes.country, 'India');
  assert.equal(clientHintRes.city, 'Mumbai');
  assert.equal(clientHintRes.location, 'Mumbai, India');
});

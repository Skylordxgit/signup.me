import { isIP } from 'node:net';
import type { SubscriberDetails, SubscriberListItem } from './types';
import { getTrustedClientIp, resolveIpLocation, type GeoLocationResult } from './geoIp';

export function subscriberListItem(item: { id: number; pageId: number; slug: string; createdAt: string; userAgent: string; details?: Partial<SubscriberDetails> | null; isActive?: boolean; lastFailedAt?: string | null }): SubscriberListItem {
  const inferred = subscriberDevice(item.userAgent);
  const details = item.details;
  return {
    id: item.id, pageId: item.pageId, slug: item.slug, createdAt: item.createdAt,
    isActive: item.isActive !== false,
    lastFailedAt: item.lastFailedAt ?? null,
    device: details?.device || inferred.device,
    browser: details?.browser || inferred.browser,
    ipAddress: details?.ipAddress || '',
    country: details?.country || 'Unknown',
    countryCode: details?.countryCode,
    countryName: details?.countryName || details?.country || 'Unknown',
    region: details?.region || 'Unknown',
    regionCode: details?.regionCode,
    regionName: details?.regionName || details?.region || 'Unknown',
    city: details?.city || 'Unknown',
    timezone: details?.timezone || '',
    geoSource: details?.geoSource || 'unknown',
  };
}

export function subscriberDevice(userAgent: string, touchPoints = 0) {
  const device = /iPhone|iPod/i.test(userAgent) ? 'iPhone'
    : /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1) ? 'iPad'
    : /Android/i.test(userAgent) ? 'Android'
    : /Windows/i.test(userAgent) ? 'Windows'
    : /Macintosh|Mac OS/i.test(userAgent) ? 'Mac'
    : /Linux/i.test(userAgent) ? 'Linux' : 'Unknown';
  const browser = /FBAN|FBAV|Instagram|; wv\)/i.test(userAgent) ? 'In-app browser'
    : /EdgA?\/|EdgiOS\//i.test(userAgent) ? 'Edge'
    : /SamsungBrowser\//i.test(userAgent) ? 'Samsung Internet'
    : /OPR\/|OPiOS\//i.test(userAgent) ? 'Opera'
    : /Firefox\/|FxiOS\//i.test(userAgent) ? 'Firefox'
    : /Chrome\/|CriOS\//i.test(userAgent) ? 'Chrome'
    : /Safari\//i.test(userAgent) ? 'Safari' : 'Unknown';
  return { device, browser };
}

export function formatLocation(countryCodeOrName?: string, city?: string, region?: string): { country: string; region: string; city: string; location: string } {
  let country = (countryCodeOrName || '').trim();
  let rawCity = (city || '').trim();
  let rawRegion = (region || '').trim();

  if (/^[A-Za-z]{2}$/.test(country)) {
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
      const resolved = displayNames.of(country.toUpperCase());
      if (resolved) country = resolved;
    } catch {
      country = country.toUpperCase();
    }
  }

  if (!country) country = 'Unknown';
  if (!rawCity) rawCity = 'Unknown';
  if (!rawRegion) rawRegion = 'Unknown';

  let location = 'Unknown';
  if (rawCity !== 'Unknown' && country !== 'Unknown') {
    if (rawRegion !== 'Unknown' && rawRegion !== rawCity && rawRegion !== country) {
      location = `${rawCity}, ${rawRegion}, ${country}`;
    } else {
      location = `${rawCity}, ${country}`;
    }
  } else if (country !== 'Unknown') {
    location = country;
  }

  return { country, region: rawRegion, city: rawCity, location };
}

export function collectSubscriberDetails(headers: Headers, hints: unknown, geoOverride?: Partial<GeoLocationResult>): SubscriberDetails {
  const data = hints && typeof hints === 'object' ? hints as Record<string, unknown> : {};
  const touchPoints = typeof data.touchPoints === 'number' && data.touchPoints > 1 ? 2 : 0;
  
  const ip = getTrustedClientIp(headers);
  let timezone = '';
  if (typeof data.timezone === 'string' && data.timezone.length <= 100) {
    try { timezone = new Intl.DateTimeFormat('en', { timeZone: data.timezone }).resolvedOptions().timeZone; } catch { /* Invalid client hint. */ }
  }

  const countryHeader = process.env.SUBSCRIBER_COUNTRY_HEADER ? headers.get(process.env.SUBSCRIBER_COUNTRY_HEADER) : null;
  const cityHeader = process.env.SUBSCRIBER_CITY_HEADER ? headers.get(process.env.SUBSCRIBER_CITY_HEADER) : null;
  const regionHeader = process.env.SUBSCRIBER_REGION_HEADER ? headers.get(process.env.SUBSCRIBER_REGION_HEADER) : null;

  const rawCountry = countryHeader ?? ((geoOverride?.country && geoOverride.country !== 'Unknown' ? geoOverride.country : '') || headers.get('cf-ipcountry') || '');
  const rawCity = cityHeader ?? ((geoOverride?.city && geoOverride.city !== 'Unknown' ? geoOverride.city : '') || headers.get('cf-ipcity') || '');
  const rawRegion = regionHeader ?? ((geoOverride?.region && geoOverride.region !== 'Unknown' ? geoOverride.region : '') || headers.get('cf-region') || '');

  const loc = formatLocation(rawCountry, rawCity, rawRegion);
  const country = countryHeader ? countryHeader.trim() : (loc.country !== 'Unknown' ? loc.country : (geoOverride ? 'Unknown' : ''));
  const city = cityHeader ? cityHeader.trim() : (rawCity && rawCity !== 'Unknown' ? loc.city : (geoOverride ? (loc.city !== 'Unknown' ? loc.city : '') : ''));
  const region = regionHeader ? regionHeader.trim() : (rawRegion && rawRegion !== 'Unknown' ? loc.region : (geoOverride ? (loc.region !== 'Unknown' ? loc.region : '') : ''));

  const countryName = geoOverride?.countryName || country || (geoOverride ? 'Unknown' : '');
  const regionName = geoOverride?.regionName || region || (geoOverride ? 'Unknown' : '');
  const countryCode = geoOverride?.countryCode || (headers.get('cf-ipcountry') && headers.get('cf-ipcountry')?.length === 2 ? headers.get('cf-ipcountry')!.toUpperCase() : undefined);
  const regionCode = geoOverride?.regionCode || headers.get('cf-region') || undefined;

  let geoSource: SubscriberDetails['geoSource'] = geoOverride?.geoSource;
  if (!geoSource) {
    if (countryHeader || cityHeader || headers.get('cf-ipcountry')) {
      geoSource = 'cdn_header';
    } else if (geoOverride && geoOverride.country && geoOverride.country !== 'Unknown') {
      geoSource = geoOverride.geoSource === 'http_api' ? 'http_api' : 'ip_geo';
    } else {
      geoSource = 'unknown';
    }
  }

  return {
    ...subscriberDevice(headers.get('user-agent') || '', touchPoints),
    ipAddress: ip,
    country: country || (geoOverride ? 'Unknown' : ''),
    countryCode,
    countryName,
    region: region || (geoOverride ? 'Unknown' : ''),
    regionCode,
    regionName,
    city: city || (geoOverride ? 'Unknown' : ''),
    timezone: timezone || geoOverride?.timezone || '',
    geoSource,
  };
}

export function mergeSubscriberDetails(
  existing?: Partial<SubscriberDetails> | null,
  incoming?: Partial<SubscriberDetails> | null,
): SubscriberDetails | undefined {
  if (!existing && !incoming) return undefined;
  if (!existing) return incoming as SubscriberDetails;
  if (!incoming) return existing as SubscriberDetails;

  const isKnown = (v?: string | null) =>
    Boolean(v && v.trim() && v.trim().toLowerCase() !== "unknown" && v.trim().toLowerCase() !== "direct / local" && v.trim().toLowerCase() !== "direct");

  const country = isKnown(incoming.country)
    ? incoming.country!
    : isKnown(existing.country)
    ? existing.country!
    : incoming.country || existing.country || "Unknown";

  const countryName = isKnown(incoming.countryName)
    ? incoming.countryName!
    : isKnown(existing.countryName)
    ? existing.countryName!
    : incoming.countryName || existing.countryName || country;

  const countryCode = incoming.countryCode || existing.countryCode;

  const region = isKnown(incoming.region)
    ? incoming.region!
    : isKnown(existing.region)
    ? existing.region!
    : incoming.region || existing.region || "Unknown";

  const regionName = isKnown(incoming.regionName)
    ? incoming.regionName!
    : isKnown(existing.regionName)
    ? existing.regionName!
    : incoming.regionName || existing.regionName || region;

  const regionCode = incoming.regionCode || existing.regionCode;

  const city = isKnown(incoming.city)
    ? incoming.city!
    : isKnown(existing.city)
    ? existing.city!
    : incoming.city || existing.city || "Unknown";

  let geoSource = incoming.geoSource;
  if (!isKnown(incoming.city) && isKnown(existing.city) && (existing.geoSource === "ip_geo" || existing.geoSource === "http_api")) {
    geoSource = existing.geoSource;
  }
  if (!geoSource || geoSource === "unknown") {
    geoSource = existing.geoSource || "unknown";
  }

  return {
    ...existing,
    ...incoming,
    country,
    countryCode,
    countryName,
    region,
    regionCode,
    regionName,
    city,
    geoSource,
    timezone: incoming.timezone || existing.timezone || "",
    ipAddress: incoming.ipAddress || existing.ipAddress || "",
    device: incoming.device || existing.device || "Unknown",
    browser: incoming.browser || existing.browser || "Unknown",
  };
}

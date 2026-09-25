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

  const country = countryHeader ?? ((geoOverride?.country && geoOverride.country !== 'Unknown' ? geoOverride.country : '') || headers.get('cf-ipcountry') || '');
  const city = cityHeader ?? ((geoOverride?.city && geoOverride.city !== 'Unknown' ? geoOverride.city : '') || headers.get('cf-ipcity') || '');
  const region = regionHeader ?? ((geoOverride?.region && geoOverride.region !== 'Unknown' ? geoOverride.region : '') || headers.get('cf-region') || '');

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
    city,
    timezone,
    geoSource,
  };
}

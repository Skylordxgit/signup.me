import { isIP } from 'node:net';
import type { SubscriberDetails, SubscriberListItem } from './types';

export function subscriberListItem(item: { id: number; pageId: number; slug: string; createdAt: string; userAgent: string; details?: Partial<SubscriberDetails> | null; isActive?: boolean; lastFailedAt?: string | null }): SubscriberListItem {
  const inferred = subscriberDevice(item.userAgent);
  const details = item.details;
  return {
    id: item.id, pageId: item.pageId, slug: item.slug, createdAt: item.createdAt,
    isActive: item.isActive !== false,
    lastFailedAt: item.lastFailedAt ?? null,
    device: details?.device || inferred.device,
    browser: details?.browser || inferred.browser,
    ipAddress: details?.ipAddress || '', country: details?.country || '', city: details?.city || '', timezone: details?.timezone || '',
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

export function formatLocation(countryCodeOrName?: string, city?: string, timezone?: string): { country: string; city: string; location: string } {
  let country = (countryCodeOrName || '').trim();
  let rawCity = (city || '').trim();

  if (!rawCity && timezone && timezone.includes('/')) {
    const tzCity = timezone.split('/')[1]?.replace(/_/g, ' ') || '';
    if (tzCity) rawCity = tzCity;
  }

  if (/^[A-Za-z]{2}$/.test(country)) {
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
      const resolved = displayNames.of(country.toUpperCase());
      if (resolved) country = resolved;
    } catch {
      country = country.toUpperCase();
    }
  }

  if (!country && timezone && timezone.includes('/')) {
    const tzRegion = timezone.split('/')[0];
    const regionNames: Record<string, string> = {
      'America': 'United States',
      'Europe': 'Europe',
      'Asia': 'Asia',
      'Africa': 'Africa',
      'Australia': 'Australia',
      'Pacific': 'Pacific',
    };
    if (regionNames[tzRegion]) country = regionNames[tzRegion];
  }

  let location = '';
  if (rawCity && country && rawCity !== country) {
    location = `${rawCity}, ${country}`;
  } else if (country) {
    location = country;
  } else if (rawCity) {
    location = rawCity;
  } else {
    location = 'Direct / Local';
  }

  return { country: country || 'Direct / Local', city: rawCity, location };
}

export function collectSubscriberDetails(headers: Headers, hints: unknown): SubscriberDetails {
  const data = hints && typeof hints === 'object' ? hints as Record<string, unknown> : {};
  const touchPoints = typeof data.touchPoints === 'number' && data.touchPoints > 1 ? 2 : 0;
  // Read configured proxy headers or standard proxy/direct headers (x-forwarded-for, x-real-ip, cf-connecting-ip).
  const trusted = (key: string) => {
    const header = process.env[key]?.trim();
    return header ? (headers.get(header) || '').trim().slice(0, 160) : '';
  };
  const configuredIp = trusted('SUBSCRIBER_IP_HEADER')?.split(',')[0]?.trim();
  const fallbackIp = headers.get('cf-connecting-ip')
    || headers.get('x-real-ip')
    || headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '';
  const rawIp = configuredIp || fallbackIp;
  const ip = isIP(rawIp) ? rawIp : '';

  let timezone = '';
  if (typeof data.timezone === 'string' && data.timezone.length <= 100) {
    try { timezone = new Intl.DateTimeFormat('en', { timeZone: data.timezone }).resolvedOptions().timeZone; } catch { /* Invalid client hint. */ }
  }
  return {
    ...subscriberDevice(headers.get('user-agent') || '', touchPoints),
    ipAddress: ip,
    country: trusted('SUBSCRIBER_COUNTRY_HEADER') || headers.get('cf-ipcountry') || '',
    city: trusted('SUBSCRIBER_CITY_HEADER') || headers.get('cf-ipcity') || '',
    timezone,
  };
}

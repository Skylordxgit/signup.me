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

const timezoneCountryMap: Record<string, { country: string; city?: string }> = {
  'Asia/Dhaka': { country: 'Bangladesh', city: 'Dhaka' },
  'Asia/Kolkata': { country: 'India', city: 'Kolkata' },
  'Asia/Calcutta': { country: 'India', city: 'Kolkata' },
  'Asia/Karachi': { country: 'Pakistan', city: 'Karachi' },
  'Asia/Dubai': { country: 'United Arab Emirates', city: 'Dubai' },
  'Asia/Riyadh': { country: 'Saudi Arabia', city: 'Riyadh' },
  'Asia/Singapore': { country: 'Singapore', city: 'Singapore' },
  'Asia/Bangkok': { country: 'Thailand', city: 'Bangkok' },
  'Asia/Tokyo': { country: 'Japan', city: 'Tokyo' },
  'Asia/Seoul': { country: 'South Korea', city: 'Seoul' },
  'Asia/Hong_Kong': { country: 'Hong Kong', city: 'Hong Kong' },
  'Asia/Shanghai': { country: 'China', city: 'Shanghai' },
  'Asia/Kuala_Lumpur': { country: 'Malaysia', city: 'Kuala Lumpur' },
  'Asia/Jakarta': { country: 'Indonesia', city: 'Jakarta' },
  'Europe/London': { country: 'United Kingdom', city: 'London' },
  'Europe/Paris': { country: 'France', city: 'Paris' },
  'Europe/Berlin': { country: 'Germany', city: 'Berlin' },
  'Europe/Amsterdam': { country: 'Netherlands', city: 'Amsterdam' },
  'Europe/Rome': { country: 'Italy', city: 'Rome' },
  'Europe/Madrid': { country: 'Spain', city: 'Madrid' },
  'Europe/Dublin': { country: 'Ireland', city: 'Dublin' },
  'Europe/Stockholm': { country: 'Sweden', city: 'Stockholm' },
  'America/New_York': { country: 'United States', city: 'New York' },
  'America/Chicago': { country: 'United States', city: 'Chicago' },
  'America/Los_Angeles': { country: 'United States', city: 'Los Angeles' },
  'America/Toronto': { country: 'Canada', city: 'Toronto' },
  'America/Vancouver': { country: 'Canada', city: 'Vancouver' },
  'America/Sao_Paulo': { country: 'Brazil', city: 'Sao Paulo' },
  'Australia/Sydney': { country: 'Australia', city: 'Sydney' },
  'Australia/Melbourne': { country: 'Australia', city: 'Melbourne' },
  'Pacific/Auckland': { country: 'New Zealand', city: 'Auckland' },
  'Africa/Cairo': { country: 'Egypt', city: 'Cairo' },
  'Africa/Johannesburg': { country: 'South Africa', city: 'Johannesburg' },
  'Africa/Lagos': { country: 'Nigeria', city: 'Lagos' },
};

export function formatLocation(countryCodeOrName?: string, city?: string, timezone?: string): { country: string; city: string; location: string } {
  let country = (countryCodeOrName || '').trim();
  let rawCity = (city || '').trim();

  if (timezone && timezoneCountryMap[timezone]) {
    const tzMatch = timezoneCountryMap[timezone];
    if (!country) country = tzMatch.country;
    if (!rawCity && tzMatch.city) rawCity = tzMatch.city;
  }

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

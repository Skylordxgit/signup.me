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

const timezoneCountryMap: Record<string, string> = {
  'Asia/Dhaka': 'Bangladesh',
  'Asia/Kolkata': 'India',
  'Asia/Calcutta': 'India',
  'Asia/Karachi': 'Pakistan',
  'Asia/Kathmandu': 'Nepal',
  'Asia/Colombo': 'Sri Lanka',
  'Asia/Dubai': 'United Arab Emirates',
  'Asia/Riyadh': 'Saudi Arabia',
  'Asia/Singapore': 'Singapore',
  'Asia/Bangkok': 'Thailand',
  'Asia/Tokyo': 'Japan',
  'Asia/Seoul': 'South Korea',
  'Asia/Hong_Kong': 'Hong Kong',
  'Asia/Shanghai': 'China',
  'Asia/Kuala_Lumpur': 'Malaysia',
  'Asia/Jakarta': 'Indonesia',
  'Europe/London': 'United Kingdom',
  'Europe/Paris': 'France',
  'Europe/Berlin': 'Germany',
  'Europe/Amsterdam': 'Netherlands',
  'Europe/Rome': 'Italy',
  'Europe/Madrid': 'Spain',
  'Europe/Dublin': 'Ireland',
  'Europe/Stockholm': 'Sweden',
  'America/New_York': 'United States',
  'America/Chicago': 'United States',
  'America/Los_Angeles': 'United States',
  'America/Denver': 'United States',
  'America/Toronto': 'Canada',
  'America/Vancouver': 'Canada',
  'America/Sao_Paulo': 'Brazil',
  'Australia/Sydney': 'Australia',
  'Australia/Melbourne': 'Australia',
  'Pacific/Auckland': 'New Zealand',
  'Africa/Cairo': 'Egypt',
  'Africa/Johannesburg': 'South Africa',
  'Africa/Lagos': 'Nigeria',
};

export function formatLocation(countryCodeOrName?: string, city?: string, timezone?: string): { country: string; city: string; location: string } {
  let country = (countryCodeOrName || '').trim();
  const rawCity = (city || '').trim();

  // Resolve country from timezone if not provided by GeoIP, but NEVER assume timezone string is the city!
  if (!country && timezone && timezoneCountryMap[timezone]) {
    country = timezoneCountryMap[timezone];
  }

  // Handle city-states where city and country are identical
  if (!rawCity && (timezone === 'Asia/Singapore' || country === 'Singapore')) {
    return { country: 'Singapore', city: 'Singapore', location: 'Singapore' };
  }
  if (!rawCity && (timezone === 'Asia/Hong_Kong' || country === 'Hong Kong')) {
    return { country: 'Hong Kong', city: 'Hong Kong', location: 'Hong Kong' };
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
    || headers.get('x-client-ip')
    || headers.get('true-client-ip')
    || headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '';
  const rawIp = configuredIp || fallbackIp;
  const ip = isIP(rawIp) ? rawIp : '';

  let timezone = '';
  if (typeof data.timezone === 'string' && data.timezone.length <= 100) {
    try { timezone = new Intl.DateTimeFormat('en', { timeZone: data.timezone }).resolvedOptions().timeZone; } catch { /* Invalid client hint. */ }
  }

  const hintCountry = typeof data.country === 'string' ? data.country.trim().slice(0, 100) : '';
  const hintCity = typeof data.city === 'string' ? data.city.trim().slice(0, 100) : '';

  const country = trusted('SUBSCRIBER_COUNTRY_HEADER')
    || headers.get('cf-ipcountry')
    || headers.get('x-vercel-ip-country')
    || headers.get('x-country')
    || hintCountry
    || '';

  const rawHeaderCity = headers.get('cf-ipcity')
    || headers.get('x-vercel-ip-city')
    || headers.get('x-city')
    || '';

  let city = trusted('SUBSCRIBER_CITY_HEADER');
  if (!city && rawHeaderCity) {
    try { city = decodeURIComponent(rawHeaderCity); } catch { city = rawHeaderCity; }
  }
  if (!city && hintCity) {
    city = hintCity;
  }

  return {
    ...subscriberDevice(headers.get('user-agent') || '', touchPoints),
    ipAddress: ip,
    country,
    city: city || '',
    timezone,
  };
}

import { isIP } from 'node:net';
import type { SubscriberDetails, SubscriberListItem } from './types';

export function subscriberListItem(item: { id: number; pageId: number; slug: string; createdAt: string; userAgent: string; details?: Partial<SubscriberDetails> | null }): SubscriberListItem {
  const inferred = subscriberDevice(item.userAgent);
  const details = item.details;
  return {
    id: item.id, pageId: item.pageId, slug: item.slug, createdAt: item.createdAt,
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

export function collectSubscriberDetails(headers: Headers, hints: unknown): SubscriberDetails {
  const data = hints && typeof hints === 'object' ? hints as Record<string, unknown> : {};
  const touchPoints = typeof data.touchPoints === 'number' && data.touchPoints > 1 ? 2 : 0;
  // Only read headers explicitly configured for a proxy that replaces client input.
  const trusted = (key: string) => {
    const header = process.env[key]?.trim();
    return header ? (headers.get(header) || '').trim().slice(0, 160) : '';
  };
  const candidate = trusted('SUBSCRIBER_IP_HEADER');
  let timezone = '';
  if (typeof data.timezone === 'string' && data.timezone.length <= 100) {
    try { timezone = new Intl.DateTimeFormat('en', { timeZone: data.timezone }).resolvedOptions().timeZone; } catch { /* Invalid client hint. */ }
  }
  return {
    ...subscriberDevice(headers.get('user-agent') || '', touchPoints),
    ipAddress: isIP(candidate) ? candidate : '',
    country: trusted('SUBSCRIBER_COUNTRY_HEADER'),
    city: trusted('SUBSCRIBER_CITY_HEADER'),
    timezone,
  };
}

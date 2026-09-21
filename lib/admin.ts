import type { AnalyticsReport, CityDetailMetric, LinkClickLocation, LocationMetric, RecentActivityItem, SmartPage } from "./types";

export async function adminApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error || (response.status === 401 ? "Your session has expired. Please sign in again." : "The request failed. Please try again."));
  return data as T;
}

export function editablePage(page: SmartPage) {
  const { name, slug, title, bio, profileImage, logoImage, status, theme, seo, integrations } = page;
  return { name, slug, title, bio, profileImage, logoImage, status, theme, seo, integrations };
}

export function combineAnalytics(reports: AnalyticsReport[]): AnalyticsReport {
  const result: AnalyticsReport = {
    views: 0,
    uniqueVisitors: 0,
    clicks: 0,
    ctr: 0,
    daily: [],
    devices: [],
    referrers: [],
    locations: [],
    linkLocations: [],
    countries: [],
    recentActivity: [],
    topBlocks: [],
  };
  const daily = new Map<string, { date: string; views: number; clicks: number }>();
  const devices = new Map<string, number>();
  const referrers = new Map<string, number>();
  const locations = new Map<string, LocationMetric>();
  const linkLocations = new Map<string, LinkClickLocation>();
  const countryMap = new Map<string, {
    countryCode: string;
    countryName: string;
    views: number;
    clicks: number;
    cities: Map<string, {
      city: string;
      location: string;
      views: number;
      clicks: number;
      links: Map<number, { blockId: number; blockTitle: string; clicks: number }>;
    }>;
  }>();
  const recentList: RecentActivityItem[] = [];

  for (const report of reports) {
    result.views += report.views;
    result.uniqueVisitors += report.uniqueVisitors;
    result.clicks += report.clicks;
    result.topBlocks.push(...report.topBlocks);
    if (report.days) result.days = report.days;
    if (report.startDate) result.startDate = report.startDate;
    if (report.endDate) result.endDate = report.endDate;

    for (const day of report.daily) {
      const current = daily.get(day.date) || { date: day.date, views: 0, clicks: 0 };
      daily.set(day.date, { date: day.date, views: current.views + day.views, clicks: current.clicks + day.clicks });
    }
    for (const entry of report.devices) devices.set(entry.device, (devices.get(entry.device) || 0) + entry.count);
    for (const entry of report.referrers) referrers.set(entry.referrer, (referrers.get(entry.referrer) || 0) + entry.count);

    for (const entry of report.locations || []) {
      const locKey = entry.location || entry.country || 'Direct / Local';
      const current = locations.get(locKey) || { location: locKey, country: entry.country || '', city: entry.city || '', views: 0, clicks: 0 };
      locations.set(locKey, {
        location: locKey,
        country: current.country || entry.country || '',
        city: current.city || entry.city || '',
        views: current.views + entry.views,
        clicks: current.clicks + entry.clicks,
      });
    }

    for (const entry of report.linkLocations || []) {
      const key = `${entry.blockId}:${entry.location}`;
      const current = linkLocations.get(key) || { blockId: entry.blockId, blockTitle: entry.blockTitle, location: entry.location, country: entry.country, city: entry.city, clicks: 0 };
      linkLocations.set(key, { ...current, clicks: current.clicks + entry.clicks });
    }

    for (const country of report.countries || []) {
      const cKey = country.countryName || country.countryCode || 'Direct / Local';
      let cAcc = countryMap.get(cKey);
      if (!cAcc) {
        cAcc = {
          countryCode: country.countryCode || '',
          countryName: country.countryName || cKey,
          views: 0,
          clicks: 0,
          cities: new Map(),
        };
        countryMap.set(cKey, cAcc);
      }
      cAcc.views += country.views;
      cAcc.clicks += country.clicks;

      for (const city of country.cities || []) {
        const ctKey = city.city || 'Direct';
        let ctAcc = cAcc.cities.get(ctKey);
        if (!ctAcc) {
          ctAcc = {
            city: city.city || ctKey,
            location: city.location || ctKey,
            views: 0,
            clicks: 0,
            links: new Map(),
          };
          cAcc.cities.set(ctKey, ctAcc);
        }
        ctAcc.views += city.views;
        ctAcc.clicks += city.clicks;

        for (const link of city.topLinks || []) {
          const lKey = link.blockId || 0;
          const lAcc = ctAcc.links.get(lKey) || { blockId: lKey, blockTitle: link.blockTitle || 'Link', clicks: 0 };
          lAcc.clicks += link.clicks;
          ctAcc.links.set(lKey, lAcc);
        }
      }
    }

    if (report.recentActivity) {
      recentList.push(...report.recentActivity);
    }
  }

  result.daily = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
  result.devices = [...devices].map(([device, count]) => ({ device, count }));
  result.referrers = [...referrers].map(([referrer, count]) => ({ referrer, count })).sort((a, b) => b.count - a.count);
  result.locations = [...locations.values()].sort((a, b) => (b.clicks + b.views) - (a.clicks + a.views));
  result.linkLocations = [...linkLocations.values()].sort((a, b) => b.clicks - a.clicks);

  result.countries = [...countryMap.values()].map(c => {
    const cities: CityDetailMetric[] = [...c.cities.values()].map(ct => ({
      city: ct.city,
      location: ct.location,
      views: ct.views,
      clicks: ct.clicks,
      ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
      topLinks: [...ct.links.values()].sort((a, b) => b.clicks - a.clicks),
    })).sort((a, b) => (b.clicks + b.views) - (a.clicks + a.views));

    return {
      countryCode: c.countryCode,
      countryName: c.countryName,
      views: c.views,
      clicks: c.clicks,
      ctr: c.views > 0 ? Number(((c.clicks / c.views) * 100).toFixed(1)) : (c.clicks > 0 ? 100 : 0),
      cities,
    };
  }).sort((a, b) => (b.clicks + b.views) - (a.clicks + a.views));

  recentList.sort((a, b) => b.date.localeCompare(a.date));
  result.recentActivity = recentList.slice(0, 30);

  result.topBlocks.sort((a, b) => b.clicks - a.clicks);
  result.topBlocks = result.topBlocks.slice(0, 5);
  result.ctr = result.views ? Number((result.clicks / result.views * 100).toFixed(1)) : 0;
  return result;
}

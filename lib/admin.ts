import type { AnalyticsReport, SmartPage } from "./types";

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
  const result: AnalyticsReport = { views: 0, uniqueVisitors: 0, clicks: 0, ctr: 0, daily: [], devices: [], referrers: [], topBlocks: [] };
  const daily = new Map<string, { date: string; views: number; clicks: number }>();
  const devices = new Map<string, number>();
  const referrers = new Map<string, number>();
  for (const report of reports) {
    result.views += report.views;
    result.uniqueVisitors += report.uniqueVisitors;
    result.clicks += report.clicks;
    result.topBlocks.push(...report.topBlocks);
    for (const day of report.daily) {
      const current = daily.get(day.date) || { date: day.date, views: 0, clicks: 0 };
      daily.set(day.date, { date: day.date, views: current.views + day.views, clicks: current.clicks + day.clicks });
    }
    for (const entry of report.devices) devices.set(entry.device, (devices.get(entry.device) || 0) + entry.count);
    for (const entry of report.referrers) referrers.set(entry.referrer, (referrers.get(entry.referrer) || 0) + entry.count);
  }
  result.daily = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
  result.devices = [...devices].map(([device, count]) => ({ device, count }));
  result.referrers = [...referrers].map(([referrer, count]) => ({ referrer, count })).sort((a, b) => b.count - a.count);
  result.topBlocks.sort((a, b) => b.clicks - a.clicks);
  result.topBlocks = result.topBlocks.slice(0, 5);
  result.ctr = result.views ? Number((result.clicks / result.views * 100).toFixed(1)) : 0;
  return result;
}

import type { AudienceFilters, NotificationSubscriber } from "./types";

function normalize(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

export function isUnknownLocation(city?: string, country?: string): boolean {
  const normCity = normalize(city);
  const normCountry = normalize(country);
  return (
    !normCity ||
    !normCountry ||
    normCity === "unknown" ||
    normCity === "direct / local" ||
    normCity === "direct" ||
    normCity === "local" ||
    normCountry === "unknown" ||
    normCountry === "direct / local"
  );
}

export function matchSubscriber(subscriber: NotificationSubscriber, filters?: AudienceFilters): boolean {
  if (!filters) return subscriber.isActive !== false;

  // Status Filter
  const status = filters.status || "active";
  if (status === "active" && subscriber.isActive === false) return false;
  if (status === "inactive" && subscriber.isActive !== false) return false;

  // Page ID Filter
  if (filters.pageIds && filters.pageIds.length > 0) {
    if (!filters.pageIds.includes(subscriber.pageId)) return false;
  }

  const details = subscriber.details || {
    city: "",
    country: "",
    region: "",
    device: "desktop",
    browser: "unknown",
    ipAddress: "",
    timezone: "",
  };

  const subCity = normalize(details.city);
  const subCountry = normalize(details.country || details.countryName);
  const subRegion = normalize(details.region || details.regionName);
  const subDevice = normalize(details.device);
  const subBrowser = normalize(details.browser);

  // Device Filter
  if (filters.devices && filters.devices.length > 0) {
    const filterDevices = filters.devices.map(normalize);
    const isMobile = subDevice === "iphone" || subDevice === "android" || subDevice === "mobile";
    const isTablet = subDevice === "ipad" || subDevice === "tablet";
    const isDesktop = subDevice === "mac" || subDevice === "windows" || subDevice === "linux" || subDevice === "desktop";

    const matched = filterDevices.some((d) => {
      if (d === "mobile" && isMobile) return true;
      if (d === "tablet" && isTablet) return true;
      if (d === "desktop" && isDesktop) return true;
      return subDevice.includes(d);
    });
    if (!matched) return false;
  }

  // Browser Filter
  if (filters.browsers && filters.browsers.length > 0) {
    const filterBrowsers = filters.browsers.map(normalize);
    const matched = filterBrowsers.some((b) => subBrowser.includes(b));
    if (!matched) return false;
  }

  // Operating System Filter
  if (filters.operatingSystems && filters.operatingSystems.length > 0) {
    const filterOs = filters.operatingSystems.map(normalize);
    const ua = normalize(subscriber.userAgent);
    const matched = filterOs.some((os) => subDevice.includes(os) || ua.includes(os));
    if (!matched) return false;
  }

  // Date Filters
  if (subscriber.createdAt) {
    const createdTime = new Date(subscriber.createdAt).getTime();
    const now = Date.now();
    if (typeof filters.subscribedWithinDays === "number" && filters.subscribedWithinDays > 0) {
      if (now - createdTime > filters.subscribedWithinDays * 86400000) return false;
    }
    if (typeof filters.subscribedBeforeDays === "number" && filters.subscribedBeforeDays > 0) {
      if (now - createdTime <= filters.subscribedBeforeDays * 86400000) return false;
    }
  }

  // Last Active Recency Filter
  if (typeof filters.lastActiveWithinDays === "number" && filters.lastActiveWithinDays > 0) {
    const lastActive = details.lastActiveAt ? new Date(details.lastActiveAt).getTime() : new Date(subscriber.updatedAt || subscriber.createdAt).getTime();
    if (Date.now() - lastActive > filters.lastActiveWithinDays * 86400000) return false;
  }

  // Engagement Filter
  if (filters.engagement === "clicked") {
    if (!details.totalClicks || details.totalClicks <= 0) return false;
  } else if (filters.engagement === "never_clicked") {
    if (details.totalClicks && details.totalClicks > 0) return false;
  }

  // Traffic Source Filter
  if (filters.trafficSources && filters.trafficSources.length > 0) {
    const src = normalize(details.source || details.utmSource || "direct");
    const allowed = filters.trafficSources.map(normalize);
    const matches = allowed.some(a => src.includes(a) || (a === "direct" && (!src || src === "direct")));
    if (!matches) return false;
  }

  // Visited Page Filter
  if (filters.visitedPageIds && filters.visitedPageIds.length > 0) {
    if (!filters.visitedPageIds.includes(subscriber.pageId)) return false;
  }

  // Location Target Filtering
  const loc = filters.locations;
  if (loc) {
    const incCountries = (loc.includeCountries || []).map(normalize).filter(Boolean);
    const excCountries = (loc.excludeCountries || []).map(normalize).filter(Boolean);
    const incRegions = (loc.includeRegions || []).map(normalize).filter(Boolean);
    const excRegions = (loc.excludeRegions || []).map(normalize).filter(Boolean);
    const incCities = (loc.includeCities || []).map(normalize).filter(Boolean);
    const excCities = (loc.excludeCities || []).map(normalize).filter(Boolean);
    const includeUnknown = Boolean(loc.includeUnknownLocation);

    const unknown = isUnknownLocation(details.city, details.country);

    // Exclusions apply first
    if (excCities.length > 0 && subCity && excCities.includes(subCity)) return false;
    if (excRegions.length > 0 && subRegion && excRegions.includes(subRegion)) return false;
    if (excCountries.length > 0 && subCountry && excCountries.includes(subCountry)) return false;

    // Has any location inclusions specified
    const hasInclusions = incCities.length > 0 || incRegions.length > 0 || incCountries.length > 0;

    if (hasInclusions) {
      if (unknown) {
        if (!includeUnknown) return false;
      } else {
        if (incCountries.length > 0 && (!subCountry || !incCountries.includes(subCountry))) return false;
        if (incRegions.length > 0 && (!subRegion || !incRegions.includes(subRegion))) return false;
        if (incCities.length > 0 && (!subCity || !incCities.includes(subCity))) return false;
      }
    } else if (unknown && !includeUnknown && (excCities.length > 0 || excCountries.length > 0)) {
      // If no inclusions but exclusions exist, allow unless explicitly blocked
    }
  }

  return true;
}

export type AudienceEstimateResult = {
  totalMatched: number;
  totalSubscribers: number;
  matchPercentage: number;
  locationBreakdown: { name: string; count: number; percentage: number }[];
  deviceBreakdown: { mobile: number; desktop: number; tablet: number };
  sampleSubscribers: { id: number; pageId: number; city: string; country: string; device: string }[];
};

export function estimateAudience(
  subscribers: NotificationSubscriber[],
  filters?: AudienceFilters
): AudienceEstimateResult {
  const totalSubscribers = subscribers.length;
  const matched = subscribers.filter((s) => matchSubscriber(s, filters));
  const totalMatched = matched.length;
  const matchPercentage = totalSubscribers > 0 ? Number(((totalMatched / totalSubscribers) * 100).toFixed(1)) : 0;

  // Breakdown by city/location
  const locCounts = new Map<string, number>();
  const deviceCounts = { mobile: 0, desktop: 0, tablet: 0 };

  for (const s of matched) {
    const city = (s.details?.city || "").trim();
    const country = (s.details?.country || "").trim();
    let locLabel = "Unknown Location";
    if (city && country && city.toLowerCase() !== country.toLowerCase()) {
      locLabel = `${city}, ${country}`;
    } else if (city) {
      locLabel = city;
    } else if (country && country.toLowerCase() !== "direct / local") {
      locLabel = country;
    }
    locCounts.set(locLabel, (locCounts.get(locLabel) || 0) + 1);

    const dev = (s.details?.device || "desktop").toLowerCase();
    if (dev.includes("phone") || dev.includes("android") || dev.includes("mobile")) {
      deviceCounts.mobile += 1;
    } else if (dev.includes("ipad") || dev.includes("tablet")) {
      deviceCounts.tablet += 1;
    } else {
      deviceCounts.desktop += 1;
    }
  }

  const locationBreakdown = [...locCounts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalMatched > 0 ? Number(((count / totalMatched) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const sampleSubscribers = matched.slice(0, 15).map((s) => ({
    id: s.id,
    pageId: s.pageId,
    city: s.details?.city || "Unknown",
    country: s.details?.country || "Unknown",
    device: s.details?.device || "Desktop",
  }));

  return {
    totalMatched,
    totalSubscribers,
    matchPercentage,
    locationBreakdown,
    deviceBreakdown: deviceCounts,
    sampleSubscribers,
  };
}

export type WorkspaceDistinctLocations = {
  countries: string[];
  regions: string[];
  cities: string[];
  hierarchy: Record<string, { regions: string[]; cities: string[]; regionCities?: Record<string, string[]> }>;
};

export function getWorkspaceDistinctLocations(subscribers: NotificationSubscriber[]): WorkspaceDistinctLocations {
  const countrySet = new Set<string>();
  const regionSet = new Set<string>();
  const citySet = new Set<string>();
  const hierarchy: Record<string, { regions: Set<string>; cities: Set<string>; regionCities: Record<string, Set<string>> }> = {};

  for (const s of subscribers) {
    const country = (s.details?.countryName || s.details?.country || "").trim();
    const region = (s.details?.regionName || s.details?.region || "").trim();
    const city = (s.details?.city || "").trim();

    const isVal = (v: string) => Boolean(v && v.toLowerCase() !== "unknown" && v.toLowerCase() !== "direct / local" && v.toLowerCase() !== "direct");

    if (isVal(country)) {
      countrySet.add(country);
      if (!hierarchy[country]) {
        hierarchy[country] = { regions: new Set(), cities: new Set(), regionCities: {} };
      }
      if (isVal(region)) {
        regionSet.add(region);
        hierarchy[country].regions.add(region);
        if (!hierarchy[country].regionCities[region]) {
          hierarchy[country].regionCities[region] = new Set();
        }
        if (isVal(city)) {
          hierarchy[country].regionCities[region].add(city);
        }
      }
      if (isVal(city)) {
        citySet.add(city);
        hierarchy[country].cities.add(city);
      }
    } else {
      if (isVal(city)) {
        citySet.add(city);
      }
      if (isVal(region)) {
        regionSet.add(region);
      }
    }
  }

  const hierarchyResult: Record<string, { regions: string[]; cities: string[]; regionCities: Record<string, string[]> }> = {};
  for (const [c, data] of Object.entries(hierarchy)) {
    const regionCitiesMap: Record<string, string[]> = {};
    for (const [r, cSet] of Object.entries(data.regionCities)) {
      regionCitiesMap[r] = [...cSet].sort();
    }
    hierarchyResult[c] = {
      regions: [...data.regions].sort(),
      cities: [...data.cities].sort(),
      regionCities: regionCitiesMap,
    };
  }

  return {
    countries: [...countrySet].sort(),
    regions: [...regionSet].sort(),
    cities: [...citySet].sort(),
    hierarchy: hierarchyResult,
  };
}

export function summarizeAudience(filters?: AudienceFilters, pageName?: string): string {
  if (!filters) return pageName ? `/${pageName}` : "All subscribers";

  const parts: string[] = [];

  if (pageName) {
    parts.push(`/${pageName}`);
  }

  const loc = filters.locations;
  if (loc) {
    const cities = loc.includeCities || [];
    const countries = loc.includeCountries || [];
    const regions = loc.includeRegions || [];

    if (cities.length > 0) {
      parts.push(cities.length <= 3 ? cities.join(", ") : `${cities.slice(0, 2).join(", ")} +${cities.length - 2} cities`);
    } else if (regions.length > 0) {
      parts.push(regions.length <= 2 ? regions.join(", ") : `${regions[0]} +${regions.length - 1} regions`);
    } else if (countries.length > 0) {
      parts.push(countries.join(", "));
    }

    if (loc.excludeCities && loc.excludeCities.length > 0) {
      parts.push(`Excl: ${loc.excludeCities.join(", ")}`);
    }
  }

  if (filters.devices && filters.devices.length > 0) {
    parts.push(filters.devices.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join("/"));
  }

  if (filters.subscribedWithinDays) {
    parts.push(`Last ${filters.subscribedWithinDays}d`);
  }

  return parts.length > 0 ? parts.join(" • ") : "All subscribers";
}

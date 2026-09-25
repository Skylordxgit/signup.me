import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listPushSubscribers } from "@/lib/store";
import { getWorkspaceDistinctLocations, matchSubscriber } from "@/lib/audienceTargeting";
import type { AudienceFilters } from "@/lib/types";

export async function GET(request: NextRequest) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.toLowerCase();
  const countries = searchParams.getAll("country");
  const regions = searchParams.getAll("region");
  const cities = searchParams.getAll("city");
  const devices = searchParams.getAll("device") as ("mobile" | "desktop" | "tablet")[];
  const status = (searchParams.get("status") as "active" | "inactive" | "all") || "all";
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const offset = Math.max(0, Number(searchParams.get("offset") || 0));
  const format = searchParams.get("format");

  const summary = await listPushSubscribers(session.workspaceId);
  let subscribers = (summary.recent || []).map((s) => ({
    id: s.id,
    pageId: s.pageId,
    slug: s.slug,
    endpointHash: "",
    userAgent: "",
    createdAt: s.createdAt,
    updatedAt: s.createdAt,
    details: s,
    isActive: s.isActive,
  }));

  const distinctLocations = getWorkspaceDistinctLocations(subscribers);

  // Build target filters if provided
  const filters: AudienceFilters = {
    status,
    devices: devices.length > 0 ? devices : undefined,
    locations: {
      includeCountries: countries,
      excludeCountries: [],
      includeRegions: regions,
      excludeRegions: [],
      includeCities: cities,
      excludeCities: [],
      includeUnknownLocation: true,
    },
  };

  subscribers = subscribers.filter((s) => matchSubscriber(s, filters));

  if (search) {
    subscribers = subscribers.filter(
      (s) =>
        (s.details?.city && s.details.city.toLowerCase().includes(search)) ||
        (s.details?.region && s.details.region.toLowerCase().includes(search)) ||
        (s.details?.country && s.details.country.toLowerCase().includes(search)) ||
        (s.details?.browser && s.details.browser.toLowerCase().includes(search)) ||
        (s.details?.device && s.details.device.toLowerCase().includes(search)) ||
        (s.slug && s.slug.toLowerCase().includes(search)) ||
        String(s.id).includes(search)
    );
  }

  const total = subscribers.length;
  const items = subscribers.slice(offset, offset + limit).map((s) => ({
    id: s.id,
    pageId: s.pageId,
    slug: s.slug,
    status: s.isActive ? "active" : "inactive",
    country: s.details?.country || "Unknown",
    countryCode: s.details?.countryCode,
    countryName: s.details?.countryName || s.details?.country || "Unknown",
    region: s.details?.regionName || s.details?.region || "Unknown",
    regionCode: s.details?.regionCode,
    regionName: s.details?.regionName || s.details?.region || "Unknown",
    city: s.details?.city || "Unknown",
    geoSource: s.details?.geoSource || "unknown",
    device: s.details?.device || "Desktop",
    browser: s.details?.browser || "Browser",
    subscribedAt: s.createdAt,
    lastActive: s.details?.lastActiveAt || s.createdAt,
  }));

  if (format === "csv") {
    const csvRows = [
      ["Subscriber ID", "Status", "Page", "Country", "Region", "City", "Device", "Browser", "Subscribed Date"].join(","),
      ...items.map((i) =>
        [
          i.id,
          i.status,
          i.slug,
          `"${i.country}"`,
          `"${i.region}"`,
          `"${i.city}"`,
          `"${i.device}"`,
          `"${i.browser}"`,
          i.subscribedAt,
        ].join(",")
      ),
    ];
    return new NextResponse(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({
    items,
    total,
    limit,
    offset,
    locations: distinctLocations,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

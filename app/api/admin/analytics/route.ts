import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { analyticsForPage, listPages } from "@/lib/store";
import { combineAnalytics } from "@/lib/admin";
import type { AnalyticsReport } from "@/lib/types";

// Server-side in-memory short TTL cache (5 seconds) to prevent redundant queries
const serverAnalyticsCache = new Map<string, { report: AnalyticsReport; timestamp: number }>();
const CACHE_TTL_MS = 5000;

export async function GET(request: NextRequest) {
  const session = await requireAdmin("analytics");
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pageIdParam = searchParams.get("pageId");
  const daysParam = searchParams.get("days");
  const fromParam = searchParams.get("from") || undefined;
  const toParam = searchParams.get("to") || undefined;

  let days: number | string = 30;
  if (
    daysParam === "all" ||
    daysParam === "today" ||
    daysParam === "yesterday" ||
    daysParam === "month"
  ) {
    days = daysParam;
  } else if (daysParam) {
    days = Math.min(365, Math.max(1, Number(daysParam) || 30));
  }

  const cacheKey = `${session.workspaceId}:${pageIdParam || "all"}:${days}:${fromParam || ""}:${toParam || ""}`;
  const now = Date.now();
  const cached = serverAnalyticsCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.report, {
      headers: { "Cache-Control": "private, no-cache, max-age=0" },
    });
  }

  try {
    // If a specific page is requested
    if (pageIdParam && pageIdParam !== "all") {
      const pageId = Number(pageIdParam);
      if (Number.isFinite(pageId)) {
        const report = await analyticsForPage(pageId, days, fromParam, toParam);
        if (report) {
          serverAnalyticsCache.set(cacheKey, { report, timestamp: now });
          return NextResponse.json(report, {
            headers: { "Cache-Control": "private, no-cache, max-age=0" },
          });
        }
      }
    }

    // Otherwise, fetch all pages in the workspace in parallel
    const pages = await listPages(session.workspaceId);
    if (!pages.length) {
      const emptyReport = combineAnalytics([]);
      return NextResponse.json(emptyReport, {
        headers: { "Cache-Control": "private, no-cache, max-age=0" },
      });
    }

    const reports = (
      await Promise.all(
        pages.map((p) => analyticsForPage(p.id, days, fromParam, toParam).catch(() => null))
      )
    ).filter((r): r is AnalyticsReport => r !== null);

    const combined = combineAnalytics(reports);
    serverAnalyticsCache.set(cacheKey, { report: combined, timestamp: now });

    return NextResponse.json(combined, {
      headers: { "Cache-Control": "private, no-cache, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load analytics" },
      { status: 500 }
    );
  }
}

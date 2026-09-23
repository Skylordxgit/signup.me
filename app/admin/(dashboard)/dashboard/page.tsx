"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import { DashboardHome } from "@/components/admin/DashboardViews";
import { adminApi } from "@/lib/admin";
import type { AnalyticsReport } from "@/lib/types";

// Instant in-memory SWR client cache
const analyticsCache = new Map<string, { data: AnalyticsReport; timestamp: number }>();

export default function DashboardPage() {
  const { pages, loading, openPage, navigate, allowedView } = useAdmin();
  const [reportPageId, setReportPageId] = useState("all");
  const [dateRange, setDateRange] = useState("30");
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const cacheKey = `${reportPageId}:${dateRange}:${customStartDate}:${customEndDate}`;

  const [report, setReport] = useState<AnalyticsReport | null>(() => {
    return analyticsCache.get(cacheKey)?.data ?? null;
  });

  useEffect(() => {
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      setReport(cached.data);
    }
  }, [cacheKey]);

  useEffect(() => {
    if (loading || !allowedView("analytics")) return;
    let cancelled = false;
    const controller = new AbortController();

    let queryParam = `?days=${dateRange}`;
    if (dateRange === "custom" && customStartDate && customEndDate) {
      queryParam = `?days=custom&from=${customStartDate}&to=${customEndDate}`;
    }
    if (reportPageId !== "all") {
      queryParam += `&pageId=${reportPageId}`;
    }

    adminApi<AnalyticsReport>(`/api/admin/analytics${queryParam}`, { signal: controller.signal })
      .then((data) => {
        if (!cancelled && data) {
          analyticsCache.set(cacheKey, { data, timestamp: Date.now() });
          setReport(data);
        }
      })
      .catch(() => {
        // Analytics error handled gracefully
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loading, reportPageId, dateRange, customStartDate, customEndDate, allowedView, cacheKey]);

  return (
    <DashboardHome
      pages={pages}
      analytics={report}
      dateRange={dateRange}
      startDate={customStartDate}
      endDate={customEndDate}
      reportPageId={reportPageId}
      onDateRangeChange={setDateRange}
      onCustomDateChange={(start, end) => {
        setCustomStartDate(start);
        setCustomEndDate(end);
        setDateRange("custom");
      }}
      onPageChange={setReportPageId}
      onOpen={openPage}
      onNavigate={navigate}
    />
  );
}

"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import { AnalyticsView } from "@/components/admin/DashboardViews";
import { adminApi, combineAnalytics } from "@/lib/admin";
import type { AnalyticsReport } from "@/lib/types";

export default function AnalyticsPageRoute() {
  const { pages, loading, allowedView } = useAdmin();
  const [dateRange, setDateRange] = useState("30");
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<AnalyticsReport | null>(null);

  const reportKey = pages.map((page) => page.id + ":" + page.views + ":" + page.clicks).join(",");

  useEffect(() => {
    if (loading || !allowedView("analytics")) return;
    let cancelled = false;

    let queryParam = `?days=${dateRange}`;
    if (dateRange === "custom" && customStartDate && customEndDate) {
      queryParam = `?days=custom&from=${customStartDate}&to=${customEndDate}`;
    }

    adminApi<AnalyticsReport>(`/api/admin/analytics${queryParam}`)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {
        // Handled gracefully
      });
    return () => {
      cancelled = true;
    };
  }, [loading, dateRange, customStartDate, customEndDate, allowedView]);

  return (
    <AnalyticsView
      report={report}
      dateRange={dateRange}
      startDate={customStartDate}
      endDate={customEndDate}
      onDateRangeChange={setDateRange}
      onCustomDateChange={(start, end) => {
        setCustomStartDate(start);
        setCustomEndDate(end);
        setDateRange("custom");
      }}
    />
  );
}

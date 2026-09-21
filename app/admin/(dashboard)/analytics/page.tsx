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
    const ids = reportKey ? reportKey.split(",").map((item) => Number(item.split(":")[0])) : [];

    let queryParam = `?days=${dateRange}`;
    if (dateRange === "custom" && customStartDate && customEndDate) {
      queryParam = `?days=custom&from=${customStartDate}&to=${customEndDate}`;
    }

    Promise.all(ids.map((id) => adminApi<AnalyticsReport>(`/api/pages/${id}/analytics${queryParam}`)))
      .then((reports) => {
        if (!cancelled) setReport(combineAnalytics(reports));
      })
      .catch(() => {
        // Handled gracefully
      });
    return () => {
      cancelled = true;
    };
  }, [reportKey, loading, dateRange, customStartDate, customEndDate, allowedView]);

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

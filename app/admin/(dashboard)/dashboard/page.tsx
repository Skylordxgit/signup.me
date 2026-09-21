"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import { DashboardHome } from "@/components/admin/DashboardViews";
import { adminApi, combineAnalytics } from "@/lib/admin";
import type { AnalyticsReport } from "@/lib/types";

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
  const [report, setReport] = useState<AnalyticsReport | null>(null);

  const reportKey = pages.map((page) => page.id + ":" + page.views + ":" + page.clicks).join(",");

  useEffect(() => {
    if (loading || !allowedView("analytics")) return;
    let cancelled = false;
    const ids = reportKey ? reportKey.split(",").map((item) => Number(item.split(":")[0])) : [];
    const selected = reportPageId !== "all" ? ids.filter((id) => id === Number(reportPageId)) : ids;

    let queryParam = `?days=${dateRange}`;
    if (dateRange === "custom" && customStartDate && customEndDate) {
      queryParam = `?days=custom&from=${customStartDate}&to=${customEndDate}`;
    }

    Promise.all(selected.map((id) => adminApi<AnalyticsReport>(`/api/pages/${id}/analytics${queryParam}`)))
      .then((reports) => {
        if (!cancelled) setReport(combineAnalytics(reports));
      })
      .catch(() => {
        // Analytics error handled gracefully
      });
    return () => {
      cancelled = true;
    };
  }, [reportKey, loading, reportPageId, dateRange, customStartDate, customEndDate, allowedView]);

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

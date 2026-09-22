"use client";

import { useEffect, useState } from "react";
import { Search, Download, RefreshCw, Filter, History, MapPin, Smartphone, Check, X } from "lucide-react";
import { Button, EmptyState, IconButton, LoadingState } from "../AdminUI";
import { adminApi } from "@/lib/admin";
import type { NotificationDeliveryLog } from "@/lib/types";

export function NotificationHistoryView({
  campaigns: initialCampaigns = [],
}: {
  campaigns?: { id: number; name?: string; title: string }[];
}) {
  const [campaignsList, setCampaignsList] = useState<{ id: number; name?: string; title: string }[]>(initialCampaigns);
  const [logs, setLogs] = useState<NotificationDeliveryLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [campaignId, setCampaignId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [deviceFilter, setDeviceFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    if (!initialCampaigns.length) {
      adminApi<{ campaigns: { id: number; name?: string; title: string }[] }>("/api/admin/notifications/campaigns")
        .then((res) => {
          if (res.campaigns) setCampaignsList(res.campaigns);
        })
        .catch(() => {});
    }
  }, [initialCampaigns]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (search) params.set("search", search);
      if (campaignId) params.set("campaignId", campaignId);
      if (statusFilter) params.set("status", statusFilter);
      if (deviceFilter) params.set("device", deviceFilter);

      const res = await adminApi<{ items: NotificationDeliveryLog[]; total: number }>(
        `/api/admin/notifications/history?${params.toString()}`
      );
      setLogs(res.items || []);
      setTotal(res.total || 0);
    } catch {
      // History fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, [search, campaignId, statusFilter, deviceFilter, offset]);

  const exportCsv = () => {
    const rows = [
      ["Campaign", "Subscriber ID", "Country", "City", "Device", "Browser", "Status", "Sent At", "Clicked At", "Error"].join(","),
      ...logs.map((l) =>
        [
          `"${l.campaignName}"`,
          l.subscriberId,
          `"${l.country}"`,
          `"${l.city}"`,
          `"${l.device}"`,
          `"${l.browser}"`,
          l.status,
          l.sentAt,
          l.clickedAt || "",
          `"${l.errorReason || ""}"`,
        ].join(",")
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `notification-history-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="admNotificationHistoryView" style={{ display: "grid", gap: "var(--sp-5)", width: "100%" }}>
      {/* Filter Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--sp-3)",
          padding: "var(--sp-3) var(--sp-4)",
          background: "var(--c-surface)",
          border: "1px solid var(--c-line)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--sp-2)", flex: 1, minWidth: 280 }}>
          <div className="admSearchField" style={{ minWidth: 200, maxWidth: 300 }}>
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search history by city, campaign..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </div>

          <select
            value={campaignId}
            onChange={(e) => {
              setCampaignId(e.target.value);
              setOffset(0);
            }}
            style={{ height: "36px", fontSize: "var(--text-xs)", minWidth: 140 }}
          >
            <option value="">All Campaigns</option>
            {campaignsList.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name || c.title}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setOffset(0);
            }}
            style={{ height: "36px", fontSize: "var(--text-xs)", minWidth: 120 }}
          >
            <option value="">All Statuses</option>
            <option value="delivered">Delivered</option>
            <option value="clicked">Clicked</option>
            <option value="failed">Failed</option>
            <option value="sent">Sent</option>
          </select>

          <select
            value={deviceFilter}
            onChange={(e) => {
              setDeviceFilter(e.target.value);
              setOffset(0);
            }}
            style={{ height: "36px", fontSize: "var(--text-xs)", minWidth: 120 }}
          >
            <option value="">All Devices</option>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablet</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <Button variant="secondary" icon={Download} size="sm" onClick={exportCsv} disabled={!logs.length}>
            Export CSV
          </Button>
          <IconButton icon={RefreshCw} label="Refresh History" onClick={() => void fetchLogs()} />
        </div>
      </div>

      {/* History Table */}
      {loading ? (
        <LoadingState label="Loading delivery logs..." />
      ) : !logs.length ? (
        <EmptyState
          icon={History}
          title="No notification delivery history"
          description="Delivery confirmations and click events will appear here once campaigns are broadcast."
        />
      ) : (
        <div className="admTableWrap">
          <table className="admTable">
            <thead>
              <tr>
                <th scope="col">Campaign</th>
                <th scope="col">Recipient</th>
                <th scope="col">Location (City, Country)</th>
                <th scope="col">Device / Browser</th>
                <th scope="col">Status</th>
                <th scope="col">Clicked</th>
                <th scope="col">Sent Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <strong>{log.campaignName}</strong>
                    {log.pageSlug && <small style={{ color: "var(--c-muted)" }}>/{log.pageSlug}</small>}
                  </td>
                  <td>
                    <code>sub#{log.subscriberId}</code>
                  </td>
                  <td>
                    <span>
                      {log.city && log.country ? `${log.city}, ${log.country}` : log.country || log.city || "Unknown"}
                    </span>
                  </td>
                  <td>
                    <small>{log.device} • {log.browser}</small>
                  </td>
                  <td>
                    <span
                      className={`admBadge ${
                        log.status === "delivered"
                          ? "admBadge-published"
                          : log.status === "clicked"
                          ? "admBadge-published"
                          : log.status === "failed"
                          ? "admBadge-disabled"
                          : ""
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td>
                    {log.clickedAt ? (
                      <span style={{ color: "var(--c-accent)", fontWeight: 600, fontSize: "var(--text-xs)" }}>
                        Yes ({new Date(log.clickedAt).toLocaleTimeString()})
                      </span>
                    ) : (
                      <span style={{ color: "var(--c-muted)", fontSize: "var(--text-xs)" }}>No</span>
                    )}
                  </td>
                  <td>
                    <small>{new Date(log.sentAt).toLocaleString()}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {total > limit && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-xs)", color: "var(--c-muted)" }}>
          <span>
            Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} records
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              size="sm"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationHistoryView;

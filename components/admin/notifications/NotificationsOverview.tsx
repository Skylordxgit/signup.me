"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Users,
  Send,
  MousePointer2,
  TrendingUp,
  Percent,
  PlusCircle,
  Layers,
  FileCode2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ArrowUpRight,
  Globe2,
  Calendar,
} from "lucide-react";
import type { NotificationCampaign, NotificationSubscriberSummary, SubscriberSegment } from "@/lib/types";
import { adminApi } from "@/lib/admin";
import { Button, EmptyState, LoadingState } from "../AdminUI";
import { NotificationNav } from "./NotificationNav";
import { getCountryFlag } from "../DashboardViews";

const number = (v: number) => v.toLocaleString();

export function NotificationsOverview() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    configured: boolean;
    subscribers: NotificationSubscriberSummary;
    campaigns: NotificationCampaign[];
    segments: SubscriberSegment[];
    locations: { country: string; cities: string[] }[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    adminApi<{
      configured: boolean;
      subscribers: NotificationSubscriberSummary;
      campaigns: NotificationCampaign[];
      segments: SubscriberSegment[];
      locations: { country: string; cities: string[] }[];
    }>("/api/admin/notifications", { signal: controller.signal })
      .then((res) => {
        if (!cancelled && res) setData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="admNotificationsWrapper">
        <LoadingState label="Loading notifications intelligence..." />
      </div>
    );
  }

  const campaigns = data?.campaigns || [];
  const subscribers = data?.subscribers || { total: 0, inactive: 0, byPage: [] };
  const totalSubscribers = subscribers.total;
  const activeSubscribers = Math.max(0, totalSubscribers - subscribers.inactive);

  const completedCampaigns = campaigns.filter((c) => c.status === "completed" || c.sent > 0);
  const totalSent = completedCampaigns.reduce((acc, c) => acc + (c.sent || 0), 0);
  const totalClicks = completedCampaigns.reduce((acc, c) => acc + (c.clicked || c.clicks || 0), 0);
  const avgCtr = totalSent > 0 ? Number(((totalClicks / totalSent) * 100).toFixed(1)) : 0;

  return (
    <div className="admNotificationsWrapper">
      {/* Top Banner / Status Alert if VAPID missing */}
      {!data?.configured && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            borderRadius: "8px",
            marginBottom: "16px",
            color: "#b45309",
            fontSize: "13px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertCircle size={16} />
            <span>
              <strong>Push Service Configuration:</strong> Web push keys are auto-configured in memory for development.
              Add persistent VAPID keys for production delivery.
            </span>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 2px 0" }}>Web Push Engagement Hub</h2>
          <p style={{ fontSize: "13px", color: "var(--c-muted, #64748b)", margin: 0 }}>
            Real-time subscriber audience, campaign orchestration, and broadcast performance.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button variant="secondary" icon={Layers} onClick={() => router.push("/admin/notifications/segments")}>
            Segments
          </Button>
          <Button variant="primary" icon={PlusCircle} onClick={() => router.push("/admin/notifications/create")}>
            Create Campaign
          </Button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div className="admReportKpiCard" style={{ padding: "14px 16px" }}>
          <div className="admReportKpiHead">
            <span style={{ fontSize: "12px" }}>Total Subscribers</span>
            <span className="admReportKpiIcon admTone-violet"><Users size={16} /></span>
          </div>
          <div className="admReportKpiValue" style={{ fontSize: "24px" }}>{number(totalSubscribers)}</div>
          <div className="admReportKpiFoot" style={{ fontSize: "11px" }}>
            <span className="admKpiDelta isPositive"><ArrowUpRight size={11} /> +12.4%</span>
            <span>All time audience</span>
          </div>
        </div>

        <div className="admReportKpiCard" style={{ padding: "14px 16px" }}>
          <div className="admReportKpiHead">
            <span style={{ fontSize: "12px" }}>Active Reachable</span>
            <span className="admReportKpiIcon admTone-blue"><CheckCircle2 size={16} /></span>
          </div>
          <div className="admReportKpiValue" style={{ fontSize: "24px" }}>{number(activeSubscribers)}</div>
          <div className="admReportKpiFoot" style={{ fontSize: "11px" }}>
            <span>{totalSubscribers > 0 ? `${((activeSubscribers / totalSubscribers) * 100).toFixed(0)}% valid endpoints` : "Ready to receive"}</span>
          </div>
        </div>

        <div className="admReportKpiCard" style={{ padding: "14px 16px" }}>
          <div className="admReportKpiHead">
            <span style={{ fontSize: "12px" }}>Campaigns Launched</span>
            <span className="admReportKpiIcon admTone-emerald"><Send size={16} /></span>
          </div>
          <div className="admReportKpiValue" style={{ fontSize: "24px" }}>{number(campaigns.length)}</div>
          <div className="admReportKpiFoot" style={{ fontSize: "11px" }}>
            <span>{completedCampaigns.length} completed</span>
          </div>
        </div>

        <div className="admReportKpiCard" style={{ padding: "14px 16px" }}>
          <div className="admReportKpiHead">
            <span style={{ fontSize: "12px" }}>Dispatched Messages</span>
            <span className="admReportKpiIcon admTone-amber"><Bell size={16} /></span>
          </div>
          <div className="admReportKpiValue" style={{ fontSize: "24px" }}>{number(totalSent)}</div>
          <div className="admReportKpiFoot" style={{ fontSize: "11px" }}>
            <span>Push deliveries</span>
          </div>
        </div>

        <div className="admReportKpiCard" style={{ padding: "14px 16px" }}>
          <div className="admReportKpiHead">
            <span style={{ fontSize: "12px" }}>Interactions (Clicks)</span>
            <span className="admReportKpiIcon admTone-rose"><MousePointer2 size={16} /></span>
          </div>
          <div className="admReportKpiValue" style={{ fontSize: "24px" }}>{number(totalClicks)}</div>
          <div className="admReportKpiFoot" style={{ fontSize: "11px" }}>
            <span className="admKpiDelta isPositive"><ArrowUpRight size={11} /> {avgCtr}% Avg CTR</span>
          </div>
        </div>
      </div>

      {/* Split Grid: Recent Campaigns & Subscriber Geographic Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "16px" }}>
        {/* Recent Campaigns Card */}
        <div
          style={{
            background: "var(--c-surface, #ffffff)",
            border: "1px solid var(--c-line, #e2e8f0)",
            borderRadius: "var(--radius-lg, 12px)",
            padding: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "700", margin: 0 }}>Recent Campaigns</h3>
            <Link
              href="/admin/notifications/campaigns"
              style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-accent, #3b82f6)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "2px" }}
            >
              View all <ChevronRight size={14} />
            </Link>
          </div>

          {campaigns.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--c-muted, #64748b)", margin: "20px 0", textAlign: "center" }}>
              No notification campaigns created yet. Launch your first broadcast!
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {campaigns.slice(0, 5).map((camp) => {
                const ctr = camp.sent > 0 ? Number(((camp.clicked / camp.sent) * 100).toFixed(1)) : 0;
                return (
                  <div
                    key={camp.id}
                    onClick={() => router.push(`/admin/notifications/campaigns/${camp.id}`)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "var(--c-surface-sunken, #f8fafc)",
                      border: "1px solid var(--c-line, #e2e8f0)",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1, paddingRight: "10px" }}>
                      <p style={{ fontSize: "13px", fontWeight: "650", margin: "0 0 2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {camp.name || camp.title}
                      </p>
                      <p style={{ fontSize: "11px", color: "var(--c-muted, #64748b)", margin: 0 }}>
                        {camp.audience} &middot; {new Date(camp.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "right" }}>
                      <div>
                        <span style={{ fontSize: "12px", fontWeight: "700" }}>{number(camp.sent || 0)}</span>
                        <span style={{ fontSize: "10px", color: "var(--c-muted, #64748b)", display: "block" }}>sent</span>
                      </div>
                      <div>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "#2563eb" }}>{ctr}%</span>
                        <span style={{ fontSize: "10px", color: "var(--c-muted, #64748b)", display: "block" }}>CTR</span>
                      </div>
                      <ChevronRight size={14} color="var(--c-muted, #94a3b8)" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Launch & Locations Card */}
        <div
          style={{
            background: "var(--c-surface, #ffffff)",
            border: "1px solid var(--c-line, #e2e8f0)",
            borderRadius: "var(--radius-lg, 12px)",
            padding: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3 style={{ fontSize: "14px", fontWeight: "700", margin: "0 0 12px 0" }}>Quick Actions & Shortcuts</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => router.push("/admin/notifications/create")}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "rgba(59, 130, 246, 0.05)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  color: "#2563eb",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <PlusCircle size={18} style={{ marginBottom: "6px" }} />
                <strong style={{ fontSize: "12px" }}>5-Step Builder</strong>
                <span style={{ fontSize: "11px", color: "var(--c-muted, #64748b)" }}>Launch notification</span>
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin/notifications/subscribers")}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "var(--c-surface-sunken, #f8fafc)",
                  border: "1px solid var(--c-line, #e2e8f0)",
                  color: "var(--c-ink, #0f172a)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <Users size={18} style={{ marginBottom: "6px" }} />
                <strong style={{ fontSize: "12px" }}>Subscriber Base</strong>
                <span style={{ fontSize: "11px", color: "var(--c-muted, #64748b)" }}>Inspect endpoints</span>
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin/notifications/segments")}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "var(--c-surface-sunken, #f8fafc)",
                  border: "1px solid var(--c-line, #e2e8f0)",
                  color: "var(--c-ink, #0f172a)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <Layers size={18} style={{ marginBottom: "6px" }} />
                <strong style={{ fontSize: "12px" }}>Saved Segments</strong>
                <span style={{ fontSize: "11px", color: "var(--c-muted, #64748b)" }}>Targeting presets</span>
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin/notifications/templates")}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "var(--c-surface-sunken, #f8fafc)",
                  border: "1px solid var(--c-line, #e2e8f0)",
                  color: "var(--c-ink, #0f172a)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <FileCode2 size={18} style={{ marginBottom: "6px" }} />
                <strong style={{ fontSize: "12px" }}>Push Templates</strong>
                <span style={{ fontSize: "11px", color: "var(--c-muted, #64748b)" }}>Message presets</span>
              </button>
            </div>

            <div style={{ borderTop: "1px solid var(--c-line, #e2e8f0)", paddingTop: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--c-muted, #64748b)" }}>SUBSCRIBER GEOGRAPHY</span>
                <span style={{ fontSize: "11px", color: "var(--c-muted, #64748b)" }}>
                  {data?.locations?.countries?.length || 0} countries ({data?.locations?.cities?.length || 0} cities)
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {(data?.locations?.countries || []).slice(0, 6).map((country) => {
                  const cityCount = data?.locations?.hierarchy?.[country]?.cities?.length || 0;
                  return (
                    <span
                      key={country}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "var(--c-surface-sunken, #f8fafc)",
                        border: "1px solid var(--c-line, #e2e8f0)",
                      }}
                    >
                      <span>{getCountryFlag(country)}</span>
                      <span>{country}</span>
                      {cityCount > 0 && <span style={{ color: "var(--c-muted, #64748b)" }}>({cityCount})</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotificationsOverview;

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Send,
  Eye,
  MousePointer2,
  AlertTriangle,
  Clock,
  MapPin,
  Smartphone,
  ExternalLink,
  Copy,
  BarChart3,
  Calendar,
  Layers,
} from "lucide-react";
import { Button, LoadingState, SectionCard } from "../AdminUI";
import { adminApi } from "@/lib/admin";
import type { NotificationCampaign, NotificationDeliveryLog } from "@/lib/types";

export function CampaignDetailView({
  campaignId,
  initialCampaign,
  initialLogs = [],
}: {
  campaignId: number;
  initialCampaign?: NotificationCampaign;
  initialLogs?: NotificationDeliveryLog[];
}) {
  const pathname = usePathname() || "/admin/notifications";
  const isWorkspace = pathname.startsWith("/workspace");
  const base = isWorkspace ? "/workspace/notifications" : "/admin/notifications";

  const [campaign, setCampaign] = useState<NotificationCampaign | null>(initialCampaign || null);
  const [logs, setLogs] = useState<NotificationDeliveryLog[]>(initialLogs);
  const [loading, setLoading] = useState(!initialCampaign);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!campaign) {
      setLoading(true);
      adminApi<{ campaign: NotificationCampaign; logs: NotificationDeliveryLog[] }>(
        `/api/admin/notifications/campaigns/${campaignId}`
      )
        .then((res) => {
          setCampaign(res.campaign);
          setLogs(res.logs || []);
        })
        .catch((cause) => {
          setError(cause instanceof Error ? cause.message : "Failed to load campaign.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [campaignId, campaign]);

  if (loading) {
    return <LoadingState label="Loading campaign report..." />;
  }

  if (!campaign) {
    return (
      <div className="admError" role="alert">
        <span>{error || "Campaign not found."}</span>
        <Link href={`${base}/campaigns`}>
          <Button variant="secondary" icon={ArrowLeft}>Back to Campaigns</Button>
        </Link>
      </div>
    );
  }

  const ctr = campaign.delivered > 0 ? Number(((campaign.clicked / campaign.delivered) * 100).toFixed(1)) : 0;
  const deliveryRate = campaign.attempted > 0 ? Number(((campaign.delivered / campaign.attempted) * 100).toFixed(1)) : 0;

  const locationEntries = Object.entries(campaign.locationStats || {});
  const deviceEntries = Object.entries(campaign.deviceStats || {});

  return (
    <div className="admCampaignDetailView" style={{ display: "grid", gap: "var(--sp-6)", width: "100%" }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
          <Link href={`${base}/campaigns`}>
            <Button variant="secondary" icon={ArrowLeft} size="sm">
              Campaigns
            </Button>
          </Link>
          <div>
            <h2 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--c-ink)" }}>
              {campaign.name || campaign.title}
            </h2>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)" }}>
              Target: {campaign.audience} • Created {new Date(campaign.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <span className="admBadge admBadge-published" style={{ textTransform: "capitalize" }}>
            {campaign.status}
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="admReportKpis">
        <div className="admReportKpiCard">
          <div className="admReportKpiHead">
            <span>Target Audience</span>
            <span className="admMetricIcon masterToneBlue">
              <Send size={16} />
            </span>
          </div>
          <div className="admReportKpiValue">{campaign.attempted.toLocaleString()}</div>
          <div className="admReportKpiFoot">
            <span style={{ color: "var(--c-muted)" }}>Subscribers queued</span>
          </div>
        </div>

        <div className="admReportKpiCard">
          <div className="admReportKpiHead">
            <span>Delivered</span>
            <span className="admMetricIcon masterToneGreen">
              <Eye size={16} />
            </span>
          </div>
          <div className="admReportKpiValue">{campaign.delivered.toLocaleString()}</div>
          <div className="admReportKpiFoot">
            <span className="admKpiDelta isPositive">{deliveryRate}% delivery rate</span>
          </div>
        </div>

        <div className="admReportKpiCard">
          <div className="admReportKpiHead">
            <span>Clicks</span>
            <span className="admMetricIcon masterToneViolet">
              <MousePointer2 size={16} />
            </span>
          </div>
          <div className="admReportKpiValue">{campaign.clicked.toLocaleString()}</div>
          <div className="admReportKpiFoot">
            <span className="admKpiDelta isPositive">{ctr}% CTR</span>
          </div>
        </div>

        <div className="admReportKpiCard">
          <div className="admReportKpiHead">
            <span>Failed / Expired</span>
            <span className="admMetricIcon masterToneAmber">
              <AlertTriangle size={16} />
            </span>
          </div>
          <div className="admReportKpiValue">{campaign.failed.toLocaleString()}</div>
          <div className="admReportKpiFoot">
            <span style={{ color: "var(--c-muted)" }}>{campaign.removed} unsubscribed</span>
          </div>
        </div>
      </div>

      {/* Campaign Details & Timeline Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "var(--sp-5)" }}>
        {/* Message Payload Card */}
        <SectionCard title="Notification Message & Target" description="Message details and destination URL dispatched to recipients.">
          <div style={{ display: "grid", gap: "var(--sp-3)", fontSize: "var(--text-xs)" }}>
            <div>
              <strong style={{ color: "var(--c-muted)", display: "block" }}>Title:</strong>
              <span style={{ fontSize: "var(--text-base)", fontWeight: 650, color: "var(--c-ink)" }}>{campaign.title}</span>
            </div>
            <div>
              <strong style={{ color: "var(--c-muted)", display: "block" }}>Message:</strong>
              <p style={{ margin: "2px 0 0", color: "var(--c-text)", fontSize: "var(--text-sm)", lineHeight: 1.45 }}>{campaign.body}</p>
            </div>
            <div>
              <strong style={{ color: "var(--c-muted)", display: "block" }}>Destination URL:</strong>
              <a href={campaign.url} target="_blank" rel="noreferrer" style={{ color: "var(--c-accent)", wordBreak: "break-all" }}>
                {campaign.url}
              </a>
            </div>
            {campaign.ctaText && (
              <div>
                <strong style={{ color: "var(--c-muted)", display: "block" }}>Action Button:</strong>
                <span>{campaign.ctaText}</span>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Timeline & Execution Card */}
        <SectionCard title="Campaign Timeline" description="Scheduled, dispatch start, and completion timestamps.">
          <div style={{ display: "grid", gap: "var(--sp-3)", fontSize: "var(--text-xs)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--c-line)", paddingBottom: "6px" }}>
              <span style={{ color: "var(--c-muted)" }}>Created:</span>
              <strong>{new Date(campaign.createdAt).toLocaleString()}</strong>
            </div>
            {campaign.scheduledAt && (
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--c-line)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--c-muted)" }}>Scheduled For:</span>
                <strong>{new Date(campaign.scheduledAt).toLocaleString()}</strong>
              </div>
            )}
            {campaign.startedAt && (
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--c-line)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--c-muted)" }}>Started Dispatch:</span>
                <strong>{new Date(campaign.startedAt).toLocaleString()}</strong>
              </div>
            )}
            {campaign.completedAt && (
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--c-line)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--c-muted)" }}>Completed:</span>
                <strong>{new Date(campaign.completedAt).toLocaleString()}</strong>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--c-muted)" }}>Priority:</span>
              <strong style={{ textTransform: "capitalize" }}>{campaign.priority || "Normal"}</strong>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Location Performance Breakdown */}
      {locationEntries.length > 0 && (
        <SectionCard title="Location Performance" description="Breakdown of delivery and clicks across subscriber cities.">
          <div className="admTableWrap">
            <table className="admTable">
              <thead>
                <tr>
                  <th scope="col">City / Location</th>
                  <th scope="col">Delivered</th>
                  <th scope="col">Clicks</th>
                  <th scope="col">CTR</th>
                </tr>
              </thead>
              <tbody>
                {locationEntries.map(([locName, stats]) => {
                  const locCtr = stats.delivered > 0 ? Number(((stats.clicked / stats.delivered) * 100).toFixed(1)) : 0;
                  return (
                    <tr key={locName}>
                      <td>
                        <strong>{locName}</strong>
                      </td>
                      <td>{stats.delivered.toLocaleString()}</td>
                      <td>{stats.clicked.toLocaleString()}</td>
                      <td>
                        <span className="admBadgeCtr">{locCtr}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Recipient Logs Preview */}
      {logs.length > 0 && (
        <SectionCard title="Delivery Log (Latest Recipients)" description="Sample subscriber delivery and click confirmation events.">
          <div className="admTableWrap">
            <table className="admTable">
              <thead>
                <tr>
                  <th scope="col">Recipient</th>
                  <th scope="col">Location</th>
                  <th scope="col">Device / Browser</th>
                  <th scope="col">Status</th>
                  <th scope="col">Sent Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 20).map((log) => (
                  <tr key={log.id}>
                    <td>
                      <code>sub#{log.subscriberId}</code>
                    </td>
                    <td>
                      <span>{log.city ? `${log.city}, ${log.country}` : log.country}</span>
                    </td>
                    <td>
                      <small>{log.device} • {log.browser}</small>
                    </td>
                    <td>
                      <span className={`admBadge ${log.status === "clicked" ? "admBadge-published" : ""}`}>
                        {log.status}
                      </span>
                    </td>
                    <td>
                      <small>{new Date(log.sentAt).toLocaleTimeString()}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

export default CampaignDetailView;

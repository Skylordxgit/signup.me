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
    if (!campaignId) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    adminApi<{ campaign: NotificationCampaign; logs: NotificationDeliveryLog[] }>(
      `/api/admin/notifications/campaigns/${campaignId}`,
      { signal: controller.signal }
    )
      .then((res) => {
        if (!cancelled && res) {
          setCampaign(res.campaign);
          setLogs(res.logs || []);
        }
      })
      .catch((cause) => {
        if (!cancelled && !controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Failed to load campaign.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [campaignId]);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <span className="admBadge admBadge-published">Completed</span>;
      case "completed_with_failures":
        return <span className="admBadge" style={{ background: "var(--c-warning-soft, #fef3c7)", color: "var(--c-warning, #d97706)" }}>Partial Delivery</span>;
      case "failed":
        return <span className="admBadge" style={{ background: "var(--c-danger-soft, #fee2e2)", color: "var(--c-danger, #dc2626)" }}>Failed</span>;
      case "sending":
        return <span className="admBadge" style={{ background: "var(--c-accent-soft)", color: "var(--c-accent)" }}>Sending...</span>;
      case "scheduled":
        return <span className="admBadge" style={{ background: "var(--c-warning-soft)", color: "var(--c-warning)" }}>Scheduled</span>;
      default:
        return <span className="admBadge" style={{ textTransform: "capitalize" }}>{status}</span>;
    }
  };

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
          {getStatusBadge(campaign.status)}
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

      {/* Delivery Failure Diagnosis Card */}
      {campaign.failed > 0 && (
        <SectionCard
          title="Delivery Failure Diagnosis"
          description="Detailed breakdown of rejected push notifications and resolution steps."
        >
          <div style={{ display: "grid", gap: "var(--sp-3)", fontSize: "var(--text-xs)" }}>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--c-danger-soft, #fee2e2)",
                border: "1px solid var(--c-danger, #ef4444)",
                color: "#991b1b",
              }}
            >
              <div style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 700, fontSize: "var(--text-sm)" }}>
                <AlertTriangle size={16} />
                <span>
                  {campaign.failed} of {campaign.attempted} recipient{campaign.attempted > 1 ? "s" : ""} failed delivery
                </span>
              </div>
              <p style={{ margin: "6px 0 0", lineHeight: 1.45, fontSize: "var(--text-xs)" }}>
                {campaign.failureReason ||
                  (logs.some((l) => l.statusCode === 401 || l.statusCode === 403)
                    ? "VAPID key mismatch: Recipients were registered under an older VAPID key before key rotation or synchronization in Master Admin."
                    : logs.some((l) => l.statusCode === 410 || l.statusCode === 404)
                    ? "Subscription expired: Browser push tokens were unregistered or expired by the push service."
                    : "Push service rejected one or more notification requests.")}
              </p>
            </div>

            {Boolean(
              campaign.failureReason?.includes("VAPID key mismatch") ||
              logs.some((l) => l.statusCode === 401 || l.statusCode === 403)
            ) && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--c-surface-sunken, #f8fafc)",
                  border: "1px solid var(--c-line)",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <strong style={{ color: "var(--c-ink)", fontSize: "var(--text-sm)" }}>Why did this happen?</strong>
                <p style={{ margin: 0, color: "var(--c-text)", lineHeight: 1.45 }}>
                  The Web Push specification cryptographically locks every subscription endpoint to the specific VAPID public key presented when the user opted in. When server VAPID keys change, push providers (Google FCM / Apple / Mozilla) reject dispatches signed with the new private key until the subscriber renews their subscription.
                </p>
                <div style={{ marginTop: "4px", display: "grid", gap: "6px" }}>
                  <span style={{ color: "var(--c-ink)", fontWeight: 600 }}>Resolution:</span>
                  <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                    <span style={{ color: "var(--c-success, #16a34a)", fontWeight: 700 }}>•</span>
                    <span><strong>Auto-Renewal:</strong> Returning visitors will automatically have their push subscriptions upgraded to the active VAPID key in the background upon visiting your site.</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                    <span style={{ color: "var(--c-success, #16a34a)", fontWeight: 700 }}>•</span>
                    <span><strong>New Subscribers:</strong> All new opt-ins immediately use the active key pair and deliver reliably.</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                    <span style={{ color: "var(--c-accent, #4f46e5)", fontWeight: 700 }}>•</span>
                    <span><strong>Verify Now:</strong> Navigate to <strong>Master Admin → Web Push</strong>, click &quot;Register This Browser as Test Device&quot;, and dispatch an instant live push to verify that the active key delivers 100% successfully.</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

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
                  <th scope="col">HTTP / Reason</th>
                  <th scope="col">Sent Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 50).map((log) => (
                  <tr key={log.id}>
                    <td>
                      <code>sub#{log.subscriberId}</code>
                    </td>
                    <td>
                      <span>{log.city && log.city !== "Unknown" ? `${log.city}, ${log.country}` : log.country || "Unknown"}</span>
                    </td>
                    <td>
                      <small>{log.device} • {log.browser}</small>
                    </td>
                    <td>
                      {log.status === "failed" || log.status === "expired" ? (
                        <span className="admBadge" style={{ background: "var(--c-danger-soft, #fee2e2)", color: "var(--c-danger, #dc2626)" }}>
                          {log.status}
                        </span>
                      ) : log.status === "clicked" ? (
                        <span className="admBadge admBadge-published">clicked</span>
                      ) : (
                        <span className="admBadge" style={{ background: "var(--c-accent-soft, #e0e7ff)", color: "var(--c-accent, #4f46e5)" }}>
                          {log.status}
                        </span>
                      )}
                    </td>
                    <td>
                      {log.statusCode ? (
                        <div style={{ fontSize: "var(--text-xs)" }}>
                          <code style={{ color: log.statusCode >= 400 ? "var(--c-danger)" : "inherit" }}>
                            HTTP {log.statusCode}
                          </code>
                          {log.errorReason && (
                            <small
                              style={{
                                display: "block",
                                color: "var(--c-danger)",
                                maxWidth: "260px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={log.errorReason}
                            >
                              {log.errorReason}
                            </small>
                          )}
                        </div>
                      ) : log.errorReason ? (
                        <small style={{ color: "var(--c-danger)", display: "block", maxWidth: "260px" }}>
                          {log.errorReason}
                        </small>
                      ) : (
                        <small style={{ color: "var(--c-muted)" }}>Accepted</small>
                      )}
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Send,
  Plus,
  Play,
  Pause,
  XCircle,
  Copy,
  Trash2,
  ExternalLink,
  Search,
  Filter,
  BarChart2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Globe2,
} from "lucide-react";
import { Button, Dialog, EmptyState, Field, IconButton } from "../AdminUI";
import { adminApi } from "@/lib/admin";
import type { CampaignStatus, NotificationCampaign } from "@/lib/types";

export function CampaignsView({
  initialCampaigns = [],
  onCompose,
}: {
  initialCampaigns?: NotificationCampaign[];
  onCompose?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/admin/notifications";
  const isWorkspace = pathname.startsWith("/workspace");
  const base = isWorkspace ? "/workspace/notifications" : "/admin/notifications";

  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>(initialCampaigns);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationCampaign | null>(null);
  const [error, setError] = useState("");

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await adminApi<{ campaigns: NotificationCampaign[] }>(
        `/api/admin/notifications/campaigns?status=${encodeURIComponent(statusFilter)}&query=${encodeURIComponent(search)}`
      );
      setCampaigns(res.campaigns || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCampaigns();
  }, [statusFilter, search]);

  const handleAction = async (id: number, action: "send_now" | "pause" | "resume" | "cancel") => {
    setActionBusy(id);
    setError("");
    try {
      await adminApi(`/api/admin/notifications/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await fetchCampaigns();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleDuplicate = async (campaign: NotificationCampaign) => {
    setActionBusy(campaign.id);
    setError("");
    try {
      await adminApi("/api/admin/notifications/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: `${campaign.name || campaign.title} (Copy)`,
          title: campaign.title,
          body: campaign.body,
          url: campaign.url,
          image: campaign.image,
          icon: campaign.icon,
          badge: campaign.badge,
          ctaText: campaign.ctaText,
          status: "draft",
          targetFilters: campaign.targetFilters,
          pageId: campaign.pageId,
        }),
      });
      await fetchCampaigns();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Duplicate failed.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionBusy(deleteTarget.id);
    setError("");
    try {
      await adminApi(`/api/admin/notifications/campaigns/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await fetchCampaigns();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed.");
    } finally {
      setActionBusy(null);
    }
  };

  const getStatusBadge = (status: CampaignStatus) => {
    switch (status) {
      case "completed":
        return <span className="admBadge admBadge-published">Completed</span>;
      case "sending":
        return <span className="admBadge" style={{ background: "var(--c-accent-soft)", color: "var(--c-accent)" }}>Sending...</span>;
      case "scheduled":
        return <span className="admBadge" style={{ background: "var(--c-warning-soft)", color: "var(--c-warning)" }}>Scheduled</span>;
      case "draft":
        return <span className="admBadge admBadge-draft">Draft</span>;
      case "paused":
        return <span className="admBadge" style={{ background: "#f1f5f9", color: "#64748b" }}>Paused</span>;
      case "cancelled":
        return <span className="admBadge admBadge-disabled">Cancelled</span>;
      case "failed":
        return <span className="admBadge" style={{ background: "var(--c-danger-soft)", color: "var(--c-danger)" }}>Failed</span>;
      default:
        return <span className="admBadge">{status}</span>;
    }
  };

  return (
    <div className="admCampaignsView" style={{ display: "grid", gap: "var(--sp-5)", width: "100%" }}>
      {error && (
        <div className="admError" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} style={{ border: 0, background: "transparent" }}>
            ✕
          </button>
        </div>
      )}

      {/* Header & Filter Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--sp-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flex: 1, minWidth: 260 }}>
          <div className="admSearchField" style={{ maxWidth: 360 }}>
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search campaigns by name, title, audience..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ height: "36px", fontSize: "var(--text-xs)", minWidth: 140 }}
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="scheduled">Scheduled</option>
            <option value="sending">Sending</option>
            <option value="draft">Drafts</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <Button
          variant="primary"
          icon={Plus}
          onClick={() => {
            if (onCompose) onCompose();
            else router.push(`${base}/compose`);
          }}
        >
          New Campaign
        </Button>
      </div>

      {/* Campaigns Table */}
      {!campaigns.length ? (
        <EmptyState
          icon={Send}
          title="No notification campaigns found"
          description="Create and broadcast targeted push notifications to your subscribers."
        >
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => {
              if (onCompose) onCompose();
              else router.push(`${base}/compose`);
            }}
          >
            Compose First Campaign
          </Button>
        </EmptyState>
      ) : (
        <div className="admTableWrap">
          <table className="admTable">
            <thead>
              <tr>
                <th scope="col">Campaign</th>
                <th scope="col">Status</th>
                <th scope="col">Audience / Target</th>
                <th scope="col">Delivered</th>
                <th scope="col">Clicks (CTR)</th>
                <th scope="col">Created / Scheduled</th>
                <th scope="col" style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const ctr = c.delivered > 0 ? Number(((c.clicked / c.delivered) * 100).toFixed(1)) : 0;
                return (
                  <tr key={c.id}>
                    <td>
                      <div>
                        <strong style={{ display: "block", color: "var(--c-ink)", fontSize: "var(--text-base)" }}>
                          {c.name || c.title}
                        </strong>
                        <small style={{ color: "var(--c-muted)", fontSize: "var(--text-xs)" }}>
                          {c.title}
                        </small>
                      </div>
                    </td>
                    <td>{getStatusBadge(c.status)}</td>
                    <td>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text)", fontWeight: 550 }}>
                        {c.audience}
                      </span>
                    </td>
                    <td>
                      <div className="admTableNumber">
                        <strong>{c.delivered.toLocaleString()}</strong>
                        <small style={{ color: "var(--c-muted)" }}>of {c.attempted.toLocaleString()}</small>
                      </div>
                    </td>
                    <td>
                      <div className="admTableNumber">
                        <strong style={{ color: c.clicked > 0 ? "var(--c-accent)" : "inherit" }}>
                          {c.clicked.toLocaleString()}
                        </strong>
                        <small style={{ color: "var(--c-muted)" }}>({ctr}%)</small>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)" }}>
                        {c.scheduledAt ? (
                          <span>Scheduled: {new Date(c.scheduledAt).toLocaleDateString()}</span>
                        ) : (
                          <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="admTableActions" style={{ gap: "4px" }}>
                        <Link href={`${base}/campaigns/${c.id}`}>
                          <IconButton icon={BarChart2} label="View Report & Details" />
                        </Link>
                        {c.status === "scheduled" && (
                          <IconButton
                            icon={Play}
                            label="Send Now"
                            disabled={actionBusy === c.id}
                            onClick={() => handleAction(c.id, "send_now")}
                          />
                        )}
                        {c.status === "scheduled" && (
                          <IconButton
                            icon={Pause}
                            label="Pause"
                            disabled={actionBusy === c.id}
                            onClick={() => handleAction(c.id, "pause")}
                          />
                        )}
                        {c.status === "paused" && (
                          <IconButton
                            icon={Play}
                            label="Resume"
                            disabled={actionBusy === c.id}
                            onClick={() => handleAction(c.id, "resume")}
                          />
                        )}
                        <IconButton
                          icon={Copy}
                          label="Duplicate Campaign"
                          disabled={actionBusy === c.id}
                          onClick={() => handleDuplicate(c)}
                        />
                        <IconButton
                          icon={Trash2}
                          label="Delete Campaign"
                          disabled={actionBusy === c.id}
                          onClick={() => setDeleteTarget(c)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <Dialog title="Delete Campaign" onClose={() => setDeleteTarget(null)}>
          <div className="admFormStack">
            <p>
              Are you sure you want to delete campaign <strong>{deleteTarget.name || deleteTarget.title}</strong>? All associated delivery statistics and history will be permanently deleted.
            </p>
            <div className="admDialogActions">
              <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" icon={Trash2} loading={actionBusy === deleteTarget.id} onClick={handleDelete}>
                Delete Campaign
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default CampaignsView;

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Plus, Trash2, Edit3, Send, Users, MapPin, Smartphone } from "lucide-react";
import { Button, Dialog, EmptyState, Field, IconButton, LoadingState } from "../AdminUI";
import { adminApi } from "@/lib/admin";
import type { SubscriberSegment } from "@/lib/types";
import { summarizeAudience } from "@/lib/audienceTargeting";

export function SegmentsView({
  initialSegments = [],
  onUseSegment,
}: {
  initialSegments?: SubscriberSegment[];
  onUseSegment?: (seg?: SubscriberSegment) => void;
}) {
  const pathname = usePathname() || "/admin/notifications";
  const isWorkspace = pathname.startsWith("/workspace");
  const base = isWorkspace ? "/workspace/notifications" : "/admin/notifications";

  const [segments, setSegments] = useState<SubscriberSegment[]>(initialSegments);
  const [loading, setLoading] = useState(!initialSegments.length);
  const [deleteTarget, setDeleteTarget] = useState<SubscriberSegment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    adminApi<{ segments: SubscriberSegment[] }>("/api/admin/notifications/segments", { signal: controller.signal })
      .then((res) => {
        if (!cancelled && res) setSegments(res.segments || []);
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setError("");
    try {
      await adminApi(`/api/admin/notifications/segments/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await fetchSegments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete segment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admSegmentsView" style={{ display: "grid", gap: "var(--sp-5)", width: "100%" }}>
      {error && (
        <div className="admError" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} style={{ border: 0, background: "transparent" }}>
            ✕
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--c-ink)" }}>
            Saved Audience Segments
          </h2>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)" }}>
            Reusable targeting groups to quickly dispatch campaigns without re-configuring filters.
          </span>
        </div>

        <Button
          variant="primary"
          icon={Plus}
          onClick={() => {
            if (onUseSegment) onUseSegment();
            else window.location.assign(`${base}/compose`);
          }}
        >
          Create Campaign with Segment
        </Button>
      </div>

      {loading ? (
        <LoadingState label="Loading saved segments..." />
      ) : !segments.length ? (
        <EmptyState
          icon={Layers}
          title="No audience segments created yet"
          description="Save frequently targeted locations and subscriber filters as reusable segments."
        >
          <Link href={`${base}/compose`}>
            <Button variant="primary" icon={Plus}>
              Build Segment in Composer
            </Button>
          </Link>
        </EmptyState>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: "var(--sp-4)" }}>
          {segments.map((seg) => {
            const audienceSummary = summarizeAudience(seg.filters);
            return (
              <article
                key={seg.id}
                style={{
                  padding: "var(--sp-4)",
                  background: "var(--c-surface)",
                  border: "1px solid var(--c-line)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-sm)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "var(--sp-3)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                    <strong style={{ fontSize: "var(--text-base)", color: "var(--c-ink)" }}>{seg.name}</strong>
                    <span className="admBadge" style={{ background: "var(--c-accent-soft)", color: "var(--c-accent)", fontWeight: 700 }}>
                      {seg.subscriberCount ?? 0} subscribers
                    </span>
                  </div>

                  {seg.description && (
                    <p style={{ margin: "2px 0 8px", fontSize: "var(--text-xs)", color: "var(--c-muted)", lineHeight: 1.4 }}>
                      {seg.description}
                    </p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-xs)", color: "var(--c-text)", background: "var(--c-surface-sunken)", padding: "6px 10px", borderRadius: "var(--radius-md)", marginTop: "8px" }}>
                    <MapPin size={13} style={{ color: "var(--c-accent)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {audienceSummary}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--c-line)", paddingTop: "8px" }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Send}
                    onClick={() => {
                      if (onUseSegment) onUseSegment(seg);
                      else window.location.assign(`${base}/compose`);
                    }}
                  >
                    Target Segment
                  </Button>

                  <IconButton
                    icon={Trash2}
                    label={`Delete ${seg.name}`}
                    disabled={busy}
                    onClick={() => setDeleteTarget(seg)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Delete Dialog */}
      {deleteTarget && (
        <Dialog title="Delete Segment" onClose={() => setDeleteTarget(null)}>
          <div className="admFormStack">
            <p>
              Are you sure you want to delete segment <strong>{deleteTarget.name}</strong>?
            </p>
            <div className="admDialogActions">
              <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" icon={Trash2} loading={busy} onClick={handleDelete}>
                Delete Segment
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default SegmentsView;

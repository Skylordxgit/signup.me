"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe2, MapPin, Smartphone, Calendar, Layers, BookmarkPlus, Users, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import { Button, Dialog, Field } from "../AdminUI";
import { adminApi } from "@/lib/admin";
import type { AudienceFilters, SubscriberSegment } from "@/lib/types";
import type { AudienceEstimateResult, WorkspaceDistinctLocations } from "@/lib/audienceTargeting";

export function AudienceTargeter({
  filters,
  onChange,
  pages = [],
  locations,
  segments = [],
  onSegmentSaved,
}: {
  filters: AudienceFilters;
  onChange: (filters: AudienceFilters) => void;
  pages?: { id: number; name: string; slug: string }[];
  locations?: WorkspaceDistinctLocations;
  segments?: SubscriberSegment[];
  onSegmentSaved?: (segment: SubscriberSegment) => void;
}) {
  const [estimate, setEstimate] = useState<AudienceEstimateResult | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [saveSegmentOpen, setSaveSegmentOpen] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [segmentDesc, setSegmentDesc] = useState("");
  const [savingSegment, setSavingSegment] = useState(false);
  const [error, setError] = useState("");

  const loc = filters.locations || {
    includeCountries: [],
    excludeCountries: [],
    includeRegions: [],
    excludeRegions: [],
    includeCities: [],
    excludeCities: [],
    includeUnknownLocation: true,
  };

  const fetchEstimate = useCallback(async (currentFilters: AudienceFilters) => {
    setLoadingEstimate(true);
    try {
      const res = await adminApi<AudienceEstimateResult>("/api/admin/notifications/estimate", {
        method: "POST",
        body: JSON.stringify({ filters: currentFilters }),
      });
      setEstimate(res);
    } catch {
      // Estimate fallback
    } finally {
      setLoadingEstimate(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchEstimate(filters);
    }, 200);
    return () => clearTimeout(timer);
  }, [filters, fetchEstimate]);

  const updateLocations = (patch: Partial<typeof loc>) => {
    const nextLocations = { ...loc, ...patch };
    onChange({
      ...filters,
      locations: nextLocations,
    });
  };

  const applySegment = (segmentId: string) => {
    if (!segmentId) {
      onChange({ ...filters, segmentId: undefined });
      return;
    }
    const seg = segments.find((s) => s.id === segmentId);
    if (seg) {
      onChange({
        ...seg.filters,
        segmentId,
      });
    }
  };

  const saveSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segmentName.trim() || savingSegment) return;
    setSavingSegment(true);
    setError("");
    try {
      const result = await adminApi<{ ok: boolean; segment: SubscriberSegment }>("/api/admin/notifications/segments", {
        method: "POST",
        body: JSON.stringify({
          name: segmentName.trim(),
          description: segmentDesc.trim(),
          filters,
        }),
      });
      if (result.ok && result.segment) {
        onSegmentSaved?.(result.segment);
        setSaveSegmentOpen(false);
        setSegmentName("");
        setSegmentDesc("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save segment");
    } finally {
      setSavingSegment(false);
    }
  };

  const countryOptions = locations?.countries || ["Bangladesh", "India", "United States", "United Kingdom", "Canada", "Australia"];
  const regionOptions = locations?.regions || ["Dhaka Division", "Chittagong Division", "Sylhet Division", "Maharashtra", "Delhi", "California"];
  const cityOptions = locations?.cities || ["Dhaka", "Chattogram", "Sylhet", "Rajshahi", "Khulna", "Mumbai", "Delhi", "Kolkata", "New York", "London"];

  return (
    <div className="admAudienceTargeter" style={{ display: "grid", gap: "var(--sp-5)", width: "100%" }}>
      {/* Top Segment Selector & Save Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--sp-3)",
          padding: "var(--sp-3) var(--sp-4)",
          background: "var(--c-surface-sunken)",
          border: "1px solid var(--c-line)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", minWidth: 240, flex: 1 }}>
          <Layers size={16} style={{ color: "var(--c-accent)" }} />
          <span style={{ fontSize: "var(--text-xs)", fontWeight: 650, color: "var(--c-ink)" }}>
            Saved Segment:
          </span>
          <select
            value={filters.segmentId || ""}
            onChange={(e) => applySegment(e.target.value)}
            style={{
              height: "32px",
              fontSize: "var(--text-xs)",
              paddingRight: "28px",
              background: "var(--c-surface)",
              flex: 1,
              maxWidth: "280px",
            }}
          >
            <option value="">Custom Audience Filters</option>
            {segments.map((seg) => (
              <option key={seg.id} value={seg.id}>
                {seg.name} {seg.subscriberCount !== undefined ? `(${seg.subscriberCount} subs)` : ""}
              </option>
            ))}
          </select>
        </div>

        <Button
          size="sm"
          variant="secondary"
          icon={BookmarkPlus}
          onClick={() => setSaveSegmentOpen(true)}
        >
          Save Filters as Segment
        </Button>
      </div>

      {/* Target Audience Sections Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "var(--sp-4)" }}>
        {/* Section 1: Location Multi-Select Targeting */}
        <div
          className="admTargetBox"
          style={{
            padding: "var(--sp-4)",
            background: "var(--c-surface)",
            border: "1px solid var(--c-line)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--c-line)", paddingBottom: "8px" }}>
            <MapPin size={16} style={{ color: "var(--c-accent)" }} />
            <strong style={{ fontSize: "var(--text-base)", color: "var(--c-ink)" }}>
              Location Targeting (Multi-Select)
            </strong>
          </div>

          <MultiSelectDropdown
            label="Target Countries"
            placeholder="All countries or select (e.g. Bangladesh, India)..."
            options={countryOptions}
            selected={loc.includeCountries || []}
            onChange={(selected) => updateLocations({ includeCountries: selected })}
          />

          <MultiSelectDropdown
            label="Target States / Regions"
            placeholder="All states or select (e.g. Dhaka Division)..."
            options={regionOptions}
            selected={loc.includeRegions || []}
            onChange={(selected) => updateLocations({ includeRegions: selected })}
          />

          <MultiSelectDropdown
            label="Target Cities (Included)"
            placeholder="All cities or select (e.g. Dhaka, Chattogram)..."
            options={cityOptions}
            selected={loc.includeCities || []}
            onChange={(selected) => updateLocations({ includeCities: selected })}
          />

          <MultiSelectDropdown
            label="Exclude Cities (Negative Targeting)"
            placeholder="Select cities to exclude (e.g. Sylhet)..."
            options={cityOptions}
            selected={loc.excludeCities || []}
            onChange={(selected) => updateLocations({ excludeCities: selected })}
          />

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "var(--text-xs)",
              color: "var(--c-text)",
              marginTop: "4px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={loc.includeUnknownLocation !== false}
              onChange={(e) => updateLocations({ includeUnknownLocation: e.target.checked })}
            />
            <span>Include subscribers with Unknown / Direct location</span>
          </label>
        </div>

        {/* Section 2: Page & Device Targeting */}
        <div
          className="admTargetBox"
          style={{
            padding: "var(--sp-4)",
            background: "var(--c-surface)",
            border: "1px solid var(--c-line)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--c-line)", paddingBottom: "8px" }}>
            <Smartphone size={16} style={{ color: "var(--c-accent)" }} />
            <strong style={{ fontSize: "var(--text-base)", color: "var(--c-ink)" }}>
              Page & Device Filters
            </strong>
          </div>

          <MultiSelectDropdown
            label="Workspace Pages"
            placeholder="All workspace pages..."
            options={pages.map((p) => ({ value: String(p.id), label: `${p.name} (/${p.slug})` }))}
            selected={(filters.pageIds || []).map(String)}
            onChange={(selected) =>
              onChange({
                ...filters,
                pageIds: selected.map(Number).filter(Number.isFinite),
              })
            }
          />

          <MultiSelectDropdown
            label="Device Types"
            placeholder="All devices (Mobile, Desktop, Tablet)..."
            options={[
              { value: "mobile", label: "Mobile (iOS / Android)" },
              { value: "desktop", label: "Desktop (Mac / Windows / Linux)" },
              { value: "tablet", label: "Tablet (iPad / Android Tablet)" },
            ]}
            selected={filters.devices || []}
            onChange={(selected) =>
              onChange({
                ...filters,
                devices: selected as ("mobile" | "desktop" | "tablet")[],
              })
            }
          />

          <MultiSelectDropdown
            label="Browser"
            placeholder="All browsers (Chrome, Safari, etc.)..."
            options={["Chrome", "Safari", "Firefox", "Edge", "Samsung Internet", "Opera"]}
            selected={filters.browsers || []}
            onChange={(selected) => onChange({ ...filters, browsers: selected })}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-2)" }}>
            <div>
              <label className="admFieldLabel" style={{ display: "block", marginBottom: "4px", fontSize: "var(--text-xs)", fontWeight: 650 }}>
                Subscriber Status
              </label>
              <select
                value={filters.status || "active"}
                onChange={(e) => onChange({ ...filters, status: e.target.value as "active" | "inactive" | "all" })}
                style={{ height: "34px", fontSize: "var(--text-xs)", width: "100%" }}
              >
                <option value="active">Active subscribers only</option>
                <option value="all">Active + Inactive</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>

            <div>
              <label className="admFieldLabel" style={{ display: "block", marginBottom: "4px", fontSize: "var(--text-xs)", fontWeight: 650 }}>
                Recency Filter
              </label>
              <select
                value={filters.subscribedWithinDays ? String(filters.subscribedWithinDays) : ""}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    subscribedWithinDays: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                style={{ height: "34px", fontSize: "var(--text-xs)", width: "100%" }}
              >
                <option value="">Any subscription date</option>
                <option value="7">Subscribed in last 7 days</option>
                <option value="30">Subscribed in last 30 days</option>
                <option value="90">Subscribed in last 90 days</option>
                <option value="180">Subscribed in last 180 days</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Live Audience Estimate Banner */}
      <div
        className="admAudienceEstimateCard"
        style={{
          padding: "var(--sp-4)",
          background: "var(--c-accent-soft)",
          border: "1px solid var(--c-line)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--sp-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Users size={18} style={{ color: "var(--c-accent)" }} />
            <div>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--c-muted)" }}>
                Audience Estimate
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <strong style={{ fontSize: "var(--text-2xl)", color: "var(--c-ink)" }}>
                  {loadingEstimate ? (
                    <Loader2 size={20} className="admSpinner" />
                  ) : (
                    estimate?.totalMatched.toLocaleString() ?? "0"
                  )}
                </strong>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)" }}>
                  subscribers targeted ({estimate?.matchPercentage ?? 0}% of {estimate?.totalSubscribers ?? 0} total)
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              className="admBadge"
              style={{
                background: "var(--c-surface)",
                borderColor: "var(--c-line)",
                fontSize: "var(--text-xs)",
              }}
            >
              📱 Mobile: {estimate?.deviceBreakdown.mobile ?? 0}
            </span>
            <span
              className="admBadge"
              style={{
                background: "var(--c-surface)",
                borderColor: "var(--c-line)",
                fontSize: "var(--text-xs)",
              }}
            >
              💻 Desktop: {estimate?.deviceBreakdown.desktop ?? 0}
            </span>
          </div>
        </div>

        {/* Location breakdown chips */}
        {estimate && estimate.locationBreakdown.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "8px" }}>
            <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, textTransform: "uppercase", color: "var(--c-muted)" }}>
              Top Cities:
            </span>
            {estimate.locationBreakdown.map((item) => (
              <span
                key={item.name}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  background: "var(--c-surface)",
                  border: "1px solid var(--c-line)",
                  borderRadius: "var(--radius-pill)",
                  fontSize: "var(--text-xs)",
                  color: "var(--c-ink)",
                }}
              >
                <strong>{item.name}:</strong>
                <span style={{ color: "var(--c-accent)", fontWeight: 650 }}>{item.count.toLocaleString()}</span>
                <span style={{ color: "var(--c-muted)", fontSize: "10px" }}>({item.percentage}%)</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Save Segment Dialog */}
      {saveSegmentOpen && (
        <Dialog title="Save Audience Segment" onClose={() => setSaveSegmentOpen(false)}>
          <form onSubmit={saveSegment} className="admFormStack">
            {error && <div className="admError" role="alert"><span>{error}</span></div>}
            <Field label="Segment Name" hint="e.g. Dhaka Active Users, Bangladesh Major Cities">
              <input
                required
                value={segmentName}
                onChange={(e) => setSegmentName(e.target.value)}
                placeholder="e.g. Dhaka & Chattogram Mobile"
                autoFocus
              />
            </Field>
            <Field label="Description (Optional)" hint="Notes about this audience rule.">
              <input
                value={segmentDesc}
                onChange={(e) => setSegmentDesc(e.target.value)}
                placeholder="Targeted users in Dhaka Division on mobile devices."
              />
            </Field>
            <div className="admDialogActions">
              <Button onClick={() => setSaveSegmentOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={savingSegment} disabled={!segmentName.trim() || savingSegment}>
                Save Segment
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

export default AudienceTargeter;

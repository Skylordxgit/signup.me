"use client";

import { useEffect, useState } from "react";
import { Users, Search, Download, RefreshCw, Filter, MapPin, Smartphone, BookmarkPlus, Check, X } from "lucide-react";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import { Button, EmptyState, Field, IconButton, LoadingState } from "../AdminUI";
import { adminApi } from "@/lib/admin";
import type { WorkspaceDistinctLocations } from "@/lib/audienceTargeting";

type SubscriberItem = {
  id: number;
  pageId: number;
  slug: string;
  status: "active" | "inactive";
  country: string;
  region: string;
  city: string;
  device: string;
  browser: string;
  subscribedAt: string;
  lastActive: string;
};

export function SubscribersView({
  locations: initialLocations,
}: {
  locations?: WorkspaceDistinctLocations;
}) {
  const [locations, setLocations] = useState<WorkspaceDistinctLocations | undefined>(initialLocations);
  const [subscribers, setSubscribers] = useState<SubscriberItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("all");
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const limit = 50;

  useEffect(() => {
    if (!initialLocations) {
      adminApi<{ locations?: WorkspaceDistinctLocations }>("/api/admin/notifications")
        .then((res) => {
          if (res.locations) setLocations(res.locations);
        })
        .catch(() => {});
    }
  }, [initialLocations]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        status: statusFilter,
      });
      if (search) params.set("search", search);
      selectedCountries.forEach((c) => params.append("country", c));
      selectedRegions.forEach((r) => params.append("region", r));
      selectedCities.forEach((c) => params.append("city", c));
      selectedDevices.forEach((d) => params.append("device", d));

      adminApi<{ items: SubscriberItem[]; total: number; locations?: WorkspaceDistinctLocations }>(
        `/api/admin/notifications/subscribers?${params.toString()}`,
        { signal: controller.signal }
      )
        .then((res) => {
          if (!cancelled && res) {
            setSubscribers(res.items || []);
            setTotal(res.total || 0);
            if (res.locations) setLocations(res.locations);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, selectedCountries, selectedRegions, selectedCities, selectedDevices, statusFilter, offset, refreshKey]);

  const fetchSubscribers = () => {
    setOffset(0);
    setRefreshKey((current) => current + 1);
  };

  const exportCsv = () => {
    const params = new URLSearchParams({ format: "csv" });
    if (search) params.set("search", search);
    selectedCountries.forEach((c) => params.append("country", c));
    selectedRegions.forEach((r) => params.append("region", r));
    selectedCities.forEach((c) => params.append("city", c));
    selectedDevices.forEach((d) => params.append("device", d));
    window.location.href = `/api/admin/notifications/subscribers?${params.toString()}`;
  };

  const countryOptions = (locations?.countries && locations.countries.length > 0)
    ? locations.countries
    : [...new Set(subscribers.map((s) => s.country).filter((c) => c && c !== "Unknown"))].sort();

  const regionOptions = (() => {
    if (!locations) return [];
    if (selectedCountries.length > 0) {
      const regions = selectedCountries.flatMap((c) => locations.hierarchy?.[c]?.regions || []);
      return [...new Set(regions)].sort();
    }
    return locations.regions || [];
  })();

  const cityOptions = (() => {
    if (!locations) return [];
    if (selectedRegions.length > 0) {
      const cities: string[] = [];
      for (const c of Object.keys(locations.hierarchy || {})) {
        if (selectedCountries.length > 0 && !selectedCountries.includes(c)) continue;
        const h = locations.hierarchy[c];
        if (h?.regionCities) {
          for (const r of selectedRegions) {
            if (h.regionCities[r]) cities.push(...h.regionCities[r]);
          }
        }
      }
      if (cities.length > 0) return [...new Set(cities)].sort();
    }
    if (selectedCountries.length > 0) {
      const cities = selectedCountries.flatMap((c) => locations.hierarchy?.[c]?.cities || []);
      return [...new Set(cities)].sort();
    }
    return locations.cities || [];
  })();

  return (
    <div className="admSubscribersView" style={{ display: "grid", gap: "var(--sp-5)", width: "100%" }}>
      {/* Top Filter Bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-3)",
          padding: "var(--sp-4)",
          background: "var(--c-surface)",
          border: "1px solid var(--c-line)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--sp-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flex: 1, minWidth: 260 }}>
            <div className="admSearchField" style={{ maxWidth: 360 }}>
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search by city, country, browser, ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "active" | "inactive" | "all");
                setOffset(0);
              }}
              style={{ height: "36px", fontSize: "var(--text-xs)", minWidth: 120 }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <Button variant="secondary" icon={Download} size="sm" onClick={exportCsv} disabled={!subscribers.length}>
              Export CSV
            </Button>
            <IconButton icon={RefreshCw} label="Refresh" onClick={() => void fetchSubscribers()} />
          </div>
        </div>

        {/* Multi-Select Location Filter Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--sp-3)", borderTop: "1px solid var(--c-line)", paddingTop: "var(--sp-3)" }}>
          <MultiSelectDropdown
            label="Filter Countries"
            placeholder="All countries..."
            options={countryOptions}
            selected={selectedCountries}
            onChange={(sel) => {
              setSelectedCountries(sel);
              setOffset(0);
              if (sel.length > 0 && locations?.hierarchy) {
                const validRegions = new Set(sel.flatMap((c) => locations.hierarchy[c]?.regions || []));
                const validCities = new Set(sel.flatMap((c) => locations.hierarchy[c]?.cities || []));
                setSelectedRegions((prev) => prev.filter((r) => validRegions.has(r)));
                setSelectedCities((prev) => prev.filter((c) => validCities.has(c)));
              }
            }}
          />

          <MultiSelectDropdown
            label="Filter Regions / States"
            placeholder="All states / regions..."
            options={regionOptions}
            selected={selectedRegions}
            onChange={(sel) => {
              setSelectedRegions(sel);
              setOffset(0);
              if (sel.length > 0 && locations?.hierarchy) {
                const validCities = new Set<string>();
                for (const c of Object.keys(locations.hierarchy)) {
                  if (selectedCountries.length > 0 && !selectedCountries.includes(c)) continue;
                  const h = locations.hierarchy[c];
                  if (h?.regionCities) {
                    for (const r of sel) {
                      if (h.regionCities[r]) h.regionCities[r].forEach((ct) => validCities.add(ct));
                    }
                  }
                }
                if (validCities.size > 0) {
                  setSelectedCities((prev) => prev.filter((ct) => validCities.has(ct)));
                }
              }
            }}
          />

          <MultiSelectDropdown
            label="Filter Cities"
            placeholder="All cities..."
            options={cityOptions}
            selected={selectedCities}
            onChange={(sel) => {
              setSelectedCities(sel);
              setOffset(0);
            }}
          />

          <MultiSelectDropdown
            label="Filter Devices"
            placeholder="All devices..."
            options={[
              { value: "mobile", label: "Mobile" },
              { value: "desktop", label: "Desktop" },
              { value: "tablet", label: "Tablet" },
            ]}
            selected={selectedDevices}
            onChange={(sel) => {
              setSelectedDevices(sel);
              setOffset(0);
            }}
          />
        </div>
      </div>

      {/* Subscribers Table */}
      {loading ? (
        <LoadingState label="Loading subscribers directory..." />
      ) : !subscribers.length ? (
        <EmptyState
          icon={Users}
          title="No subscribers match your filter"
          description="When visitors opt in to notifications on your pages, their location and device details will appear here."
        />
      ) : (
        <div className="admTableWrap">
          <table className="admTable">
            <thead>
              <tr>
                <th scope="col">Sr. No.</th>
                <th scope="col">Status</th>
                <th scope="col">Country</th>
                <th scope="col">State / Region</th>
                <th scope="col">City</th>
                <th scope="col">Device / Browser</th>
                <th scope="col">Page</th>
                <th scope="col">Subscribed</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((s, rowIndex) => (
                <tr key={s.id}>
                  <td>
                    <strong>{offset + rowIndex + 1}</strong>
                  </td>
                  <td>
                    <span className={`admBadge ${s.status === "active" ? "admBadge-published" : "admBadge-disabled"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s.country || "Unknown"}</td>
                  <td>{s.region && s.region !== "Unknown" ? s.region : "Unknown"}</td>
                  <td>
                    <strong style={{ color: "var(--c-ink)" }}>{s.city || "Unknown"}</strong>
                  </td>
                  <td>
                    <small>{s.device} • {s.browser}</small>
                  </td>
                  <td>
                    <small style={{ color: "var(--c-muted)" }}>/{s.slug}</small>
                  </td>
                  <td>
                    <small>{new Date(s.subscribedAt).toLocaleDateString()}</small>
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
            Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} subscribers
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

export default SubscribersView;

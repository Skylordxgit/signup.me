"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import {
  Send,
  Calendar,
  Clock,
  ExternalLink,
  Laptop,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Globe,
  Bell,
  Sparkles,
  Zap,
  Check,
  Eye,
  Layers,
  Target,
  ArrowRight,
  ArrowLeft,
  Sliders,
  Flame,
  Radio,
  BarChart3,
  ShieldCheck,
  Compass,
  Monitor,
  Tablet,
  CheckCheck,
  ChevronRight,
  HelpCircle,
  Link2,
  Lock,
} from "lucide-react";
import { AudienceTargeter } from "./AudienceTargeter";
import { Button, Dialog, Field, SectionHeading, SectionCard } from "../AdminUI";
import { ImageUploader } from "../../ImageUploader";
import { adminApi } from "@/lib/admin";
import type { AudienceFilters, CampaignStatus, NotificationCampaign, SubscriberSegment } from "@/lib/types";
import type { AudienceEstimateResult, WorkspaceDistinctLocations } from "@/lib/audienceTargeting";

export type CampaignObjective = "traffic" | "engagement" | "awareness" | "flash_sale";

export function NotificationComposer({
  pages = [],
  locations,
  segments = [],
  brandingName = "Signup888",
  brandingLogo = "/favicon.png",
}: {
  pages?: { id: number; name: string; slug: string }[];
  locations?: WorkspaceDistinctLocations;
  segments?: SubscriberSegment[];
  brandingName?: string;
  brandingLogo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/admin/notifications";
  const isWorkspace = pathname.startsWith("/workspace");
  const base = isWorkspace ? "/workspace/notifications" : "/admin/notifications";

  // Progressive Unlocking Stepper:
  // Step 2 is only visible/accessible once Step 1 is done
  // Step 3 is only visible/accessible once Step 2 is done
  // Step 4 is only visible/accessible once Step 3 is done
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState<number>(1);

  // Level 1: Campaign Setup
  const [objective, setObjective] = useState<CampaignObjective>("traffic");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [autoUtm, setAutoUtm] = useState(true);

  // Level 2: Ad Set (Audience, Placements & Schedule)
  const [placementMode, setPlacementMode] = useState<"advantage_plus" | "manual">("advantage_plus");
  const [selectedDevices, setSelectedDevices] = useState<string[]>(["mobile", "desktop", "tablet"]);
  const [selectedBrowsers, setSelectedBrowsers] = useState<string[]>(["chrome", "safari", "firefox", "edge"]);
  const [targetFilters, setTargetFilters] = useState<AudienceFilters>({
    status: "active",
    locations: {
      includeCountries: [],
      excludeCountries: [],
      includeRegions: [],
      excludeRegions: [],
      includeCities: [],
      excludeCities: [],
      includeUnknownLocation: true,
    },
  });

  // Scheduling
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dhaka";
    } catch {
      return "Asia/Dhaka";
    }
  });

  // Level 3: Ad Creative & Copy
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [ctaText, setCtaText] = useState("Shop Now");
  const [image, setImage] = useState("");
  const [icon, setIcon] = useState(brandingLogo || "/favicon.png");
  const [badge, setBadge] = useState("/favicon-32x32.png");

  // Preview & Live Estimate
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "android" | "mobile">("desktop");
  const [estimate, setEstimate] = useState<AudienceEstimateResult | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

  // State & Modals
  const [busy, setBusy] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [safetyModalOpen, setSafetyModalOpen] = useState(false);
  const [savedSegments, setSavedSegments] = useState<SubscriberSegment[]>(segments);

  // Fetch Live Estimate
  useEffect(() => {
    let cancelled = false;
    setLoadingEstimate(true);
    adminApi<AudienceEstimateResult>("/api/admin/notifications/estimate", {
      method: "POST",
      body: JSON.stringify({ filters: targetFilters }),
    })
      .then((res) => {
        if (!cancelled) setEstimate(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingEstimate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetFilters]);

  // Construct Final Destination URL with UTM tags if enabled
  const getComputedUrl = () => {
    const rawUrl = url.trim() || "/";
    if (!autoUtm) return rawUrl;
    try {
      const parsed = new URL(rawUrl, "https://example.com");
      const campaignParam = (name.trim() || title.trim() || "push_campaign")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");
      parsed.searchParams.set("utm_source", "push");
      parsed.searchParams.set("utm_medium", "push_notification");
      parsed.searchParams.set("utm_campaign", campaignParam);
      if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
        return parsed.toString();
      }
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return rawUrl;
    }
  };

  // Step 1 Validation & Progression
  const handleProceedFromStep1 = () => {
    setError("");
    if (!name.trim()) {
      const defaultName = `${objective.replace("_", " ").toUpperCase()} Campaign - ${new Date().toLocaleDateString()}`;
      setName(defaultName);
    }
    setMaxUnlockedStep((prev) => Math.max(prev, 2));
    setStep(2);
  };

  // Step 2 Validation & Progression
  const handleProceedFromStep2 = () => {
    setError("");
    if (sendMode === "schedule") {
      if (!scheduledDate || !scheduledTime) {
        setError("Please choose both a schedule date and time.");
        return;
      }
    }
    setMaxUnlockedStep((prev) => Math.max(prev, 3));
    setStep(3);
  };

  // Step 3 Validation & Progression
  const handleProceedFromStep3 = () => {
    setError("");
    if (!title.trim()) {
      setError("Notification headline / title is required.");
      return;
    }
    if (!body.trim()) {
      setError("Notification message body is required.");
      return;
    }
    setMaxUnlockedStep((prev) => Math.max(prev, 4));
    setStep(4);
  };

  const handleStepClick = (targetStep: 1 | 2 | 3 | 4) => {
    if (targetStep <= maxUnlockedStep) {
      setError("");
      setStep(targetStep);
    } else {
      setError(`Please complete Step ${maxUnlockedStep} before advancing.`);
    }
  };

  const handleTestSend = async () => {
    if (!title.trim() || !body.trim()) {
      setError("Please fill in notification title and message before test sending.");
      return;
    }
    setTestSending(true);
    setError("");
    setMessage("");
    try {
      const res = await adminApi<{ ok: boolean; message?: string }>("/api/admin/notifications/test", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: getComputedUrl(),
          image: image || null,
          icon: icon || null,
          ctaText: ctaText || null,
          priority,
        }),
      });
      setMessage(res.message || "Test push sent successfully to your device!");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to send test push notification.");
    } finally {
      setTestSending(false);
    }
  };

  const executeSendOrSchedule = async (asDraft = false) => {
    if (!title.trim()) {
      setError("Notification title is required.");
      setStep(3);
      return;
    }
    if (!body.trim()) {
      setError("Notification message is required.");
      setStep(3);
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      let scheduledAt: string | null = null;
      if (sendMode === "schedule" && scheduledDate && scheduledTime) {
        scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      }

      const payload = {
        name: name.trim() || title.trim() || "Campaign",
        title: title.trim(),
        body: body.trim(),
        url: getComputedUrl(),
        ctaText: ctaText.trim() || null,
        image: image || null,
        icon: icon || null,
        badge: badge || null,
        priority,
        status: asDraft ? "draft" : scheduledAt ? "scheduled" : "completed",
        scheduledAt,
        timezone,
        targetFilters: {
          ...targetFilters,
          deviceTypes: placementMode === "manual" ? selectedDevices : undefined,
          browsers: placementMode === "manual" ? selectedBrowsers : undefined,
        },
      };

      await adminApi<{ ok: boolean; campaign?: NotificationCampaign; sent?: number }>(
        "/api/admin/notifications/campaigns",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setSafetyModalOpen(false);
      router.push(`${base}/campaigns`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to process campaign.");
    } finally {
      setBusy(false);
    }
  };

  // Audience Gauge calculations (Specific -> Optimal -> Broad)
  const totalAudience = estimate?.totalSubscribers || 100;
  const matchAudience = estimate?.matchedCount ?? totalAudience;
  const matchRatio = totalAudience > 0 ? matchAudience / totalAudience : 1;
  const gaugeColor =
    matchRatio < 0.1 ? "#ef4444" : matchRatio < 0.85 ? "#10b981" : "#3b82f6";
  const gaugeStatus =
    matchRatio < 0.1
      ? "Specific Target"
      : matchRatio < 0.85
      ? "Optimal Audience"
      : "Broad Workspace Audience";

  const objectives = [
    {
      id: "traffic",
      label: "Traffic & Sales",
      icon: Target,
      desc: "Drive subscriber clicks directly to your website, store, or landing page.",
      badge: "Highest Clicks",
    },
    {
      id: "flash_sale",
      label: "Urgent Flash Deal",
      icon: Flame,
      desc: "Limited-time offers, countdown promos, and high-priority instant alerts.",
      badge: "Urgent Priority",
    },
    {
      id: "engagement",
      label: "Engagement & Retention",
      icon: Zap,
      desc: "Re-engage inactive subscribers and drive repeat visits.",
      badge: "High Conversion",
    },
    {
      id: "awareness",
      label: "Announcements & News",
      icon: Radio,
      desc: "Broadcast important workspace updates, blog posts, and company news.",
      badge: "Broad Reach",
    },
  ];

  return (
    <div className="admMetaNotificationStudio" style={{ display: "grid", gap: "var(--sp-5)", width: "100%" }}>
      {/* Top Meta Ads Studio Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--sp-3)",
          padding: "var(--sp-4) var(--sp-5)",
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          color: "#ffffff",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 6px rgba(59,130,246,0.4)",
            }}
          >
            <Sliders size={20} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#ffffff" }}>
                Meta Ads Campaign Manager
              </h2>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: "rgba(59, 130, 246, 0.2)",
                  color: "#93c5fd",
                  border: "1px solid rgba(147, 197, 253, 0.3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Step {step} of 4
              </span>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#94a3b8" }}>
              {name.trim() ? `Campaign: ${name}` : "Create and broadcast high-converting targeted notification campaigns"}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={handleTestSend}
            disabled={testSending || !title.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              background: "rgba(255,255,255,0.1)",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.15)",
              cursor: "pointer",
            }}
          >
            <Send size={14} />
            <span>{testSending ? "Sending Test..." : "Send Test Push"}</span>
          </button>

          <button
            type="button"
            onClick={() => void executeSendOrSchedule(true)}
            disabled={busy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              background: "rgba(255,255,255,0.15)",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.2)",
              cursor: "pointer",
            }}
          >
            <span>Save Draft</span>
          </button>

          {maxUnlockedStep >= 4 && (
            <button
              type="button"
              onClick={() => {
                if (step < 4) setStep(4);
                else setSafetyModalOpen(true);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 18px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 700,
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#ffffff",
                border: "0",
                boxShadow: "0 2px 8px rgba(16,185,129,0.35)",
                cursor: "pointer",
              }}
            >
              <Zap size={14} />
              <span>Publish Campaign</span>
            </button>
          )}
        </div>
      </div>

      {/* Meta Ads Progressive Hierarchy Stepper */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "8px",
          padding: "4px",
          background: "var(--c-surface)",
          border: "1px solid var(--c-line)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        {[
          { num: 1, title: "1. Campaign", sub: "Objective & Details", icon: Target },
          { num: 2, title: "2. Ad Set", sub: "Audience & Placements", icon: Globe },
          { num: 3, title: "3. Ad Creative", sub: "Copy, Media & CTA", icon: Sparkles },
          { num: 4, title: "4. Review & Launch", sub: "Summary & Checklist", icon: CheckCheck },
        ].map((s) => {
          const Icon = s.icon;
          const isActive = step === s.num;
          const isUnlocked = s.num <= maxUnlockedStep;
          const isDone = s.num < maxUnlockedStep || (s.num === 3 && title.trim() && body.trim());
          return (
            <button
              type="button"
              key={s.num}
              onClick={() => handleStepClick(s.num as 1 | 2 | 3 | 4)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                background: isActive
                  ? "var(--c-accent-soft, #eff6ff)"
                  : isDone
                  ? "var(--c-surface-sunken, #f8fafc)"
                  : "transparent",
                border: isActive
                  ? "1px solid var(--c-accent, #3b82f6)"
                  : "1px solid transparent",
                cursor: isUnlocked ? "pointer" : "not-allowed",
                opacity: isUnlocked ? 1 : 0.5,
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: isActive
                    ? "var(--c-accent, #3b82f6)"
                    : isDone
                    ? "#10b981"
                    : isUnlocked
                    ? "#94a3b8"
                    : "#cbd5e1",
                  color: "#ffffff",
                  flexShrink: 0,
                }}
              >
                {!isUnlocked ? <Lock size={12} /> : isDone ? <Check size={14} /> : s.num}
              </div>
              <div style={{ overflow: "hidden" }}>
                <strong
                  style={{
                    display: "block",
                    fontSize: "13px",
                    color: isActive
                      ? "var(--c-accent, #1e40af)"
                      : isUnlocked
                      ? "var(--c-ink, #0f172a)"
                      : "var(--c-muted, #94a3b8)",
                  }}
                >
                  {s.title}
                </strong>
                <span style={{ fontSize: "11px", color: "var(--c-muted, #64748b)" }}>
                  {!isUnlocked ? "Locked (Complete Step " + (s.num - 1) + ")" : isDone ? "✓ Configured" : s.sub}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="admError" role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} style={{ border: 0, background: "transparent", cursor: "pointer" }}>
            ✕
          </button>
        </div>
      )}
      {message && <p className="admSuccess" role="status">{message}</p>}

      {/* Main Grid: Left Progressive Step + Right Meta Ads Audience & Placements Inspector */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(340px, 0.9fr)",
          gap: "var(--sp-6)",
          alignItems: "start",
        }}
      >
        {/* Left Form: Progressive Step Content */}
        <div style={{ display: "grid", gap: "var(--sp-5)" }}>
          {/* STEP 1: CAMPAIGN OBJECTIVE & SETTINGS */}
          {step === 1 && (
            <SectionCard
              title="Step 1: Campaign Objective & Setup"
              description="Choose your broadcast objective and campaign identity to unlock Audience Targeting."
            >
              <div style={{ display: "grid", gap: "var(--sp-4)" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 650, color: "var(--c-ink)" }}>
                    Select Campaign Objective
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
                    {objectives.map((obj) => {
                      const Icon = obj.icon;
                      const isSelected = objective === obj.id;
                      return (
                        <div
                          key={obj.id}
                          onClick={() => {
                            setObjective(obj.id as CampaignObjective);
                            if (obj.id === "flash_sale") setPriority("urgent");
                          }}
                          style={{
                            padding: "var(--sp-3-5)",
                            borderRadius: "var(--radius-md)",
                            border: isSelected ? "2px solid var(--c-accent, #3b82f6)" : "1px solid var(--c-line)",
                            background: isSelected ? "var(--c-accent-soft, #eff6ff)" : "var(--c-surface)",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            position: "relative",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <Icon size={18} color={isSelected ? "var(--c-accent)" : "#64748b"} />
                              <strong style={{ fontSize: "14px", color: isSelected ? "var(--c-accent)" : "var(--c-ink)" }}>
                                {obj.label}
                              </strong>
                            </div>
                            <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "10px", background: "#e2e8f0", color: "#334155" }}>
                              {obj.badge}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: "12px", color: "var(--c-muted)", lineHeight: 1.35 }}>
                            {obj.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Field label="Campaign Name" hint="Internal name used across your reports, analytics, and UTM tags.">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Summer Flash Sale - Dhaka & Chittagong"
                  />
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
                  <Field label="Delivery Priority" hint="Urgent priorities bypass device focus modes.">
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as "normal" | "high" | "urgent")}
                      style={{ height: "40px", fontSize: "13px" }}
                    >
                      <option value="normal">Normal (Standard Delivery)</option>
                      <option value="high">High (Priority Notification)</option>
                      <option value="urgent">Urgent (Instant Flash Alert)</option>
                    </select>
                  </Field>

                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginTop: "18px" }}>
                      <input
                        type="checkbox"
                        checked={autoUtm}
                        onChange={(e) => setAutoUtm(e.target.checked)}
                      />
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-ink)" }}>
                        Auto-tag with Meta/Google UTM Parameters
                      </span>
                    </label>
                    <small style={{ color: "var(--c-muted)", fontSize: "11px", marginLeft: "24px" }}>
                      Appends utm_source=push&utm_campaign={name ? name.toLowerCase().replace(/\s+/g, "_") : "push"}
                    </small>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--sp-3)", borderTop: "1px solid var(--c-line)", paddingTop: "var(--sp-4)" }}>
                  <Button variant="primary" icon={ArrowRight} onClick={handleProceedFromStep1}>
                    Save & Continue to Step 2: Audience ➔
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          {/* STEP 2: AD SET (AUDIENCE, PLACEMENTS & SCHEDULE) */}
          {step === 2 && (
            <div style={{ display: "grid", gap: "var(--sp-5)" }}>
              <SectionCard
                title="Step 2: Audience Definition & Location Targeting"
                description="Target multiple countries, regions, and cities with inclusion and exclusion rules."
              >
                <AudienceTargeter
                  filters={targetFilters}
                  onChange={setTargetFilters}
                  pages={pages}
                  locations={locations}
                  segments={savedSegments}
                  onSegmentSaved={(newSeg) => setSavedSegments((prev) => [...prev, newSeg])}
                />
              </SectionCard>

              {/* Placements (Advantage+ vs Manual Placements) */}
              <SectionCard
                title="Placements (Advantage+ vs. Manual)"
                description="Choose where your notifications appear across subscriber devices and browsers."
              >
                <div style={{ display: "grid", gap: "var(--sp-3)" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "start",
                      gap: "12px",
                      padding: "var(--sp-3-5)",
                      borderRadius: "var(--radius-md)",
                      border: placementMode === "advantage_plus" ? "2px solid var(--c-accent)" : "1px solid var(--c-line)",
                      background: placementMode === "advantage_plus" ? "var(--c-accent-soft)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="placementMode"
                      checked={placementMode === "advantage_plus"}
                      onChange={() => setPlacementMode("advantage_plus")}
                      style={{ marginTop: "4px" }}
                    />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <strong style={{ fontSize: "14px", color: "var(--c-ink)" }}>
                          Advantage+ Placements (Recommended)
                        </strong>
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "10px", background: "#10b981", color: "#ffffff" }}>
                          MAX REACH
                        </span>
                      </div>
                      <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--c-muted)", lineHeight: 1.35 }}>
                        Automatically optimizes delivery across all subscriber devices (Mobile, Desktop, Tablets) and browsers (Chrome, Safari, Firefox, Edge).
                      </p>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "start",
                      gap: "12px",
                      padding: "var(--sp-3-5)",
                      borderRadius: "var(--radius-md)",
                      border: placementMode === "manual" ? "2px solid var(--c-accent)" : "1px solid var(--c-line)",
                      background: placementMode === "manual" ? "var(--c-accent-soft)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="placementMode"
                      checked={placementMode === "manual"}
                      onChange={() => setPlacementMode("manual")}
                      style={{ marginTop: "4px" }}
                    />
                    <div>
                      <strong style={{ fontSize: "14px", color: "var(--c-ink)" }}>
                        Manual Placements
                      </strong>
                      <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--c-muted)", lineHeight: 1.35 }}>
                        Manually choose specific device hardware types and browser engines to receive this broadcast.
                      </p>
                    </div>
                  </label>

                  {placementMode === "manual" && (
                    <div style={{ padding: "var(--sp-3)", background: "var(--c-surface-sunken)", borderRadius: "var(--radius-md)", border: "1px solid var(--c-line)", display: "grid", gap: "var(--sp-3)" }}>
                      <div>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--c-ink)", display: "block", marginBottom: "6px" }}>
                          Target Devices
                        </span>
                        <div style={{ display: "flex", gap: "16px" }}>
                          {["mobile", "desktop", "tablet"].map((d) => (
                            <label key={d} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={selectedDevices.includes(d)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedDevices([...selectedDevices, d]);
                                  else setSelectedDevices(selectedDevices.filter((x) => x !== d));
                                }}
                              />
                              <span style={{ textTransform: "capitalize" }}>{d}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--c-ink)", display: "block", marginBottom: "6px" }}>
                          Target Browsers
                        </span>
                        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                          {["chrome", "safari", "firefox", "edge"].map((b) => (
                            <label key={b} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={selectedBrowsers.includes(b)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedBrowsers([...selectedBrowsers, b]);
                                  else setSelectedBrowsers(selectedBrowsers.filter((x) => x !== b));
                                }}
                              />
                              <span style={{ textTransform: "capitalize" }}>{b}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Budget & Schedule */}
              <SectionCard
                title="Budget & Dispatch Schedule"
                description="Set the start time or broadcast immediately upon approval."
              >
                <div style={{ display: "flex", gap: "var(--sp-4)", marginBottom: "var(--sp-3)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>
                    <input
                      type="radio"
                      name="sendMode"
                      checked={sendMode === "now"}
                      onChange={() => setSendMode("now")}
                    />
                    <span>Run continuously starting now (Immediate)</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>
                    <input
                      type="radio"
                      name="sendMode"
                      checked={sendMode === "schedule"}
                      onChange={() => setSendMode("schedule")}
                    />
                    <span>Set a start date & time (Scheduled)</span>
                  </label>
                </div>

                {sendMode === "schedule" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: "var(--sp-3)", padding: "var(--sp-3)", background: "var(--c-surface-sunken)", borderRadius: "var(--radius-md)", border: "1px solid var(--c-line)" }}>
                    <Field label="Start Date">
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                      />
                    </Field>
                    <Field label="Start Time">
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                      />
                    </Field>
                    <Field label="Timezone">
                      <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                    </Field>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--sp-4)", borderTop: "1px solid var(--c-line)", paddingTop: "var(--sp-4)" }}>
                  <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(1)}>
                    Back to Campaign Setup
                  </Button>
                  <Button variant="primary" icon={ArrowRight} onClick={handleProceedFromStep2}>
                    Save & Continue to Step 3: Creative ➔
                  </Button>
                </div>
              </SectionCard>
            </div>
          )}

          {/* STEP 3: AD CREATIVE & COPY */}
          {step === 3 && (
            <SectionCard
              title="Step 3: Ad Creative, Copy & Destination"
              description="Design the message headline, body copy, CTA button, destination URL, and banner image."
            >
              <div style={{ display: "grid", gap: "var(--sp-4)" }}>
                {/* Brand Identity */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: "var(--c-surface-sunken)", borderRadius: "var(--radius-md)", border: "1px solid var(--c-line)" }}>
                  <Image
                    src={icon || "/favicon.png"}
                    alt=""
                    width={32}
                    height={32}
                    style={{ borderRadius: "6px", objectFit: "cover" }}
                    unoptimized
                  />
                  <div>
                    <strong style={{ display: "block", fontSize: "13px", color: "var(--c-ink)" }}>
                      Identity: {brandingName}
                    </strong>
                    <span style={{ fontSize: "11px", color: "var(--c-muted)" }}>
                      Subscribers will see this sender brand identity
                    </span>
                  </div>
                </div>

                <Field label={`Primary Headline / Title (${title.length}/80)`} hint="Bold headline displayed on subscriber devices.">
                  <input
                    required
                    maxLength={80}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="⚡ Flash Sale: 50% Off Everything Today!"
                  />
                </Field>

                <Field label={`Primary Text / Message Body (${body.length}/180)`} hint="Notification text description.">
                  <textarea
                    required
                    maxLength={180}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Don't miss our exclusive deals. Tap to claim your discount before midnight!"
                    style={{ minHeight: "80px" }}
                  />
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "var(--sp-3)" }}>
                  <Field label="Call to Action (CTA Button)" hint="Action button text.">
                    <select
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      style={{ height: "40px", fontSize: "13px" }}
                    >
                      <option value="Shop Now">Shop Now</option>
                      <option value="Claim Offer">Claim Offer</option>
                      <option value="Learn More">Learn More</option>
                      <option value="View Deal">View Deal</option>
                      <option value="Book Now">Book Now</option>
                      <option value="Open Link">Open Link</option>
                    </select>
                  </Field>

                  <Field label="Destination URL (HTTPS / Path)" hint="Where subscribers land when clicking.">
                    <input
                      required
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com/offer or /sale"
                    />
                  </Field>
                </div>

                {autoUtm && (
                  <div style={{ padding: "8px 12px", background: "var(--c-surface-sunken)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--c-line)", fontSize: "11px", color: "var(--c-muted)", wordBreak: "break-all" }}>
                    <strong>Calculated UTM Destination:</strong> {getComputedUrl()}
                  </div>
                )}

                <ImageUploader
                  category="campaign"
                  label="Ad Banner Image Media (Optional)"
                  hint="16:9 rich expanded image displayed on Android notification shades and Windows/Mac desktop push."
                  value={image}
                  onChange={setImage}
                />

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--sp-4)", borderTop: "1px solid var(--c-line)", paddingTop: "var(--sp-4)" }}>
                  <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(2)}>
                    Back to Audience
                  </Button>
                  <Button variant="primary" icon={ArrowRight} onClick={handleProceedFromStep3}>
                    Save & Continue to Step 4: Review ➔
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          {/* STEP 4: REVIEW & LAUNCH */}
          {step === 4 && (
            <SectionCard
              title="Step 4: Campaign Review & Launch Checklist"
              description="Verify your campaign settings before broadcasting to subscribers."
            >
              <div style={{ display: "grid", gap: "var(--sp-4)" }}>
                {/* Summary Matrix Card */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "var(--sp-3)",
                    padding: "var(--sp-4)",
                    background: "var(--c-surface-sunken)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--c-line)",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--c-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Campaign Name
                    </span>
                    <strong style={{ display: "block", fontSize: "14px", color: "var(--c-ink)", marginTop: "2px" }}>
                      {name || title || "Untitled Campaign"}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: "11px", color: "var(--c-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Objective
                    </span>
                    <strong style={{ display: "block", fontSize: "14px", color: "var(--c-accent)", marginTop: "2px", textTransform: "capitalize" }}>
                      {objective.replace("_", " ")}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: "11px", color: "var(--c-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Audience Reach
                    </span>
                    <strong style={{ display: "block", fontSize: "14px", color: "#10b981", marginTop: "2px" }}>
                      {estimate ? `${estimate.matchedCount.toLocaleString()} subscribers` : "Calculating..."}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: "11px", color: "var(--c-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Dispatch Timing
                    </span>
                    <strong style={{ display: "block", fontSize: "14px", color: "var(--c-ink)", marginTop: "2px" }}>
                      {sendMode === "now" ? "Instant Broadcast" : `${scheduledDate} at ${scheduledTime}`}
                    </strong>
                  </div>
                </div>

                {/* Pre-flight Checklist */}
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: title.trim() ? "#10b981" : "#ef4444" }}>
                    <CheckCircle2 size={16} />
                    <span>Notification Headline: {title ? `"${title}"` : "Missing title"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: body.trim() ? "#10b981" : "#ef4444" }}>
                    <CheckCircle2 size={16} />
                    <span>Message Body: {body ? `"${body.slice(0, 50)}..."` : "Missing body"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#10b981" }}>
                    <CheckCircle2 size={16} />
                    <span>Destination Link: {getComputedUrl()}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#10b981" }}>
                    <CheckCircle2 size={16} />
                    <span>Targeting: {targetFilters.locations?.includeCities?.length ? targetFilters.locations.includeCities.join(", ") : "All workspace locations"}</span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--sp-4)",
                    background: "linear-gradient(135deg, rgba(16,185,129,0.1), rgba(59,130,246,0.1))",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(16,185,129,0.3)",
                  }}
                >
                  <div>
                    <strong style={{ display: "block", fontSize: "15px", color: "var(--c-ink)" }}>
                      Ready to launch campaign?
                    </strong>
                    <span style={{ fontSize: "12px", color: "var(--c-muted)" }}>
                      Notifications will be dispatched directly to your subscribers.
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button variant="secondary" onClick={() => void executeSendOrSchedule(true)}>
                      Save Draft
                    </Button>
                    <Button
                      variant="primary"
                      icon={Send}
                      loading={busy}
                      disabled={busy || !title.trim() || !body.trim()}
                      onClick={() => void executeSendOrSchedule(false)}
                      style={{ background: "#10b981", borderColor: "#10b981" }}
                    >
                      {sendMode === "now" ? "Broadcast Campaign Now" : "Schedule Campaign"}
                    </Button>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "var(--sp-2)" }}>
                  <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(3)}>
                    Back to Creative
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right Column: Meta Ads Audience Meter & Live Placement Previews */}
        <aside
          style={{
            display: "grid",
            gap: "var(--sp-5)",
            position: "sticky",
            top: "var(--sp-4)",
          }}
        >
          {/* Meta Ads Audience Gauge Meter */}
          <div
            style={{
              padding: "var(--sp-4)",
              background: "var(--c-surface)",
              border: "1px solid var(--c-line)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-3)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Compass size={18} color="var(--c-accent)" />
                <strong style={{ fontSize: "14px", color: "var(--c-ink)" }}>
                  Audience Definition
                </strong>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: `${gaugeColor}20`,
                  color: gaugeColor,
                }}
              >
                {gaugeStatus}
              </span>
            </div>

            {/* Gauge Bar */}
            <div style={{ position: "relative", margin: "14px 0 10px" }}>
              <div
                style={{
                  height: "8px",
                  borderRadius: "4px",
                  background: "linear-gradient(90deg, #ef4444 0%, #10b981 50%, #3b82f6 100%)",
                  width: "100%",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "-4px",
                  left: `${Math.min(Math.max(matchRatio * 100, 5), 95)}%`,
                  transform: "translateX(-50%)",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "#ffffff",
                  border: `3px solid ${gaugeColor}`,
                  boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
                  transition: "left 0.3s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--c-muted)", marginBottom: "var(--sp-3)" }}>
              <span>Specific</span>
              <span>Optimal</span>
              <span>Broad</span>
            </div>

            {/* Audience Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-2)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--c-line)" }}>
              <div>
                <span style={{ fontSize: "11px", color: "var(--c-muted)", display: "block" }}>
                  Estimated Audience
                </span>
                <strong style={{ fontSize: "18px", color: "var(--c-ink)" }}>
                  {loadingEstimate ? "..." : (estimate?.matchedCount ?? 0).toLocaleString()}
                </strong>
                <small style={{ display: "block", fontSize: "10px", color: "var(--c-muted)" }}>
                  {estimate ? `${estimate.percentage}% of workspace` : ""}
                </small>
              </div>

              <div>
                <span style={{ fontSize: "11px", color: "var(--c-muted)", display: "block" }}>
                  Est. Daily Clicks
                </span>
                <strong style={{ fontSize: "18px", color: "var(--c-accent)" }}>
                  {loadingEstimate
                    ? "..."
                    : `${Math.round((estimate?.matchedCount || 0) * 0.08)} - ${Math.round((estimate?.matchedCount || 0) * 0.14)}`}
                </strong>
                <small style={{ display: "block", fontSize: "10px", color: "#10b981" }}>
                  8.0% - 14.0% CTR
                </small>
              </div>
            </div>
          </div>

          {/* Live Placement Preview Card */}
          <div
            style={{
              padding: "var(--sp-4)",
              background: "var(--c-surface)",
              border: "1px solid var(--c-line)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-3)" }}>
              <strong style={{ fontSize: "13px", color: "var(--c-ink)" }}>
                Live Placement Preview
              </strong>
              <div style={{ display: "flex", gap: "4px" }}>
                {[
                  { key: "desktop", icon: Laptop, label: "Desktop" },
                  { key: "android", icon: Smartphone, label: "Android" },
                  { key: "mobile", icon: Globe, label: "Mobile" },
                ].map((d) => {
                  const Icon = d.icon;
                  const active = previewDevice === d.key;
                  return (
                    <button
                      type="button"
                      key={d.key}
                      onClick={() => setPreviewDevice(d.key as "desktop" | "android" | "mobile")}
                      title={d.label}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: 0,
                        background: active ? "var(--c-accent)" : "var(--c-surface-sunken)",
                        color: active ? "#ffffff" : "var(--c-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Realistic Push Preview Container */}
            <div style={{ background: "#0f172a", padding: "16px", borderRadius: "10px" }}>
              {/* DESKTOP PREVIEW */}
              {previewDevice === "desktop" && (
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.95)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "10px",
                    padding: "12px",
                    color: "#ffffff",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Image src={icon || "/favicon.png"} alt="" width={16} height={16} style={{ borderRadius: "3px" }} unoptimized />
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8" }}>
                        {brandingName} · Google Chrome
                      </span>
                    </div>
                    <span style={{ fontSize: "10px", color: "#64748b" }}>just now</span>
                  </div>

                  <strong style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#ffffff", marginBottom: "4px" }}>
                    {title || "Special Flash Deal Available!"}
                  </strong>
                  <p style={{ margin: 0, fontSize: "12px", color: "#cbd5e1", lineHeight: 1.35 }}>
                    {body || "Tap to claim your exclusive discount before time runs out."}
                  </p>

                  {image && (
                    <div style={{ marginTop: "10px", borderRadius: "6px", overflow: "hidden" }}>
                      <img src={image} alt="" style={{ width: "100%", height: "130px", objectFit: "cover" }} />
                    </div>
                  )}

                  {ctaText && (
                    <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: "4px",
                          background: "#3b82f6",
                          color: "#ffffff",
                        }}
                      >
                        {ctaText}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ANDROID PREVIEW */}
              {previewDevice === "android" && (
                <div
                  style={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "14px",
                    padding: "12px 14px",
                    color: "#ffffff",
                    fontFamily: "Roboto, system-ui, sans-serif",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Bell size={13} color="#94a3b8" />
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>{brandingName}</span>
                    </div>
                    <span style={{ fontSize: "10px", color: "#64748b" }}>Now</span>
                  </div>

                  <strong style={{ display: "block", fontSize: "13px", color: "#f8fafc", marginBottom: "3px" }}>
                    {title || "Special Flash Deal Available!"}
                  </strong>
                  <p style={{ margin: 0, fontSize: "12px", color: "#cbd5e1", lineHeight: 1.35 }}>
                    {body || "Tap to claim your exclusive discount before time runs out."}
                  </p>

                  {image && (
                    <div style={{ marginTop: "8px", borderRadius: "8px", overflow: "hidden" }}>
                      <img src={image} alt="" style={{ width: "100%", height: "140px", objectFit: "cover" }} />
                    </div>
                  )}

                  <div style={{ marginTop: "10px", display: "flex", gap: "10px", borderTop: "1px solid #334155", paddingTop: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase" }}>
                      {ctaText || "OPEN LINK"}
                    </span>
                    <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase" }}>
                      DISMISS
                    </span>
                  </div>
                </div>
              )}

              {/* MOBILE WEB PREVIEW */}
              {previewDevice === "mobile" && (
                <div
                  style={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: "12px",
                    padding: "12px",
                    color: "#ffffff",
                  }}
                >
                  <div style={{ display: "flex", gap: "10px", alignItems: "start" }}>
                    <Image src={icon || "/favicon.png"} alt="" width={24} height={24} style={{ borderRadius: "5px", flexShrink: 0 }} unoptimized />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong style={{ fontSize: "12px", color: "#ffffff" }}>
                          {title || "Flash Sale Announcement"}
                        </strong>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>1m ago</span>
                      </div>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#94a3b8", lineHeight: 1.3 }}>
                        {body || "Tap to open and view your custom offer."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleTestSend}
              disabled={testSending || !title.trim()}
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid var(--c-line)",
                background: "var(--c-surface-sunken)",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--c-ink)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Send size={13} />
              <span>{testSending ? "Sending Test Push..." : "Send Live Test to This Browser"}</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Safety Confirmation Modal */}
      {safetyModalOpen && (
        <Dialog title="Launch Campaign Broadcast" onClose={() => setSafetyModalOpen(false)}>
          <div className="admFormStack">
            <p>
              Are you sure you want to broadcast <strong>{title}</strong> to{" "}
              <strong>{estimate ? estimate.matchedCount.toLocaleString() : "your"} subscribers</strong>?
            </p>
            <div style={{ padding: "10px", background: "var(--c-surface-sunken)", borderRadius: "6px", fontSize: "12px", color: "var(--c-muted)" }}>
              <div><strong>Targeting:</strong> {targetFilters.locations?.includeCities?.length ? targetFilters.locations.includeCities.join(", ") : "All Locations"}</div>
              <div><strong>Timing:</strong> {sendMode === "now" ? "Instant Broadcast" : `${scheduledDate} at ${scheduledTime}`}</div>
              <div><strong>Link:</strong> {getComputedUrl()}</div>
            </div>
            <div className="admDialogActions">
              <Button onClick={() => setSafetyModalOpen(false)}>Back</Button>
              <Button
                variant="primary"
                icon={Send}
                loading={busy}
                onClick={() => void executeSendOrSchedule(false)}
                style={{ background: "#10b981", borderColor: "#10b981" }}
              >
                Confirm & Launch Now
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

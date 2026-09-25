"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  Tag,
  FileCode2,
  SlidersHorizontal,
  ChevronDown,
  Loader2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { AudienceTargeter } from "./AudienceTargeter";
import { Button, Dialog, Field, SectionHeading, SectionCard } from "../AdminUI";
import { ImageUploader } from "../../ImageUploader";
import { adminApi } from "@/lib/admin";
import type {
  AudienceFilters,
  CampaignStatus,
  NotificationCampaign,
  NotificationTemplate,
  SubscriberSegment,
} from "@/lib/types";
import type { AudienceEstimateResult, WorkspaceDistinctLocations } from "@/lib/audienceTargeting";
import { NotificationNav } from "./NotificationNav";

export function NotificationComposer({
  pages = [],
  locations,
  segments = [],
  brandingName = "Signup888",
  brandingLogo = "/signup888-logo.png",
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

  // 5-Step Campaign Builder Stepper (Progressive Unlocking)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState<number>(1);

  // STEP 1: Campaign Setup
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [campaignType, setCampaignType] = useState<"broadcast" | "scheduled">("broadcast");
  const [priority, setPriority] = useState<"normal" | "high" | "urgent">("normal");

  // STEP 2: Audience Targeting
  const [targetMode, setTargetMode] = useState<"all" | "segment" | "custom">("all");
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

  // STEP 3: Creative Editor
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [pageId, setPageId] = useState<number | null>(null);
  const [icon, setIcon] = useState("");
  const [image, setImage] = useState("");
  const [badge, setBadge] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [previewPlatform, setPreviewPlatform] = useState<"android" | "desktop" | "macos">("android");
  const [imageBusy, setImageBusy] = useState(false);

  // STEP 4: Schedule & Delivery
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
  const [smartTimezoneDelivery, setSmartTimezoneDelivery] = useState(false);
  const [batchSize, setBatchSize] = useState(250);
  const [throttleRate, setThrottleRate] = useState(50);
  const [retryFailures, setRetryFailures] = useState(true);
  const [showAdvancedDelivery, setShowAdvancedDelivery] = useState(false);

  // STEP 5: Review & Send Modal / Test
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [testSendOpen, setTestSendOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<"my_device" | "sample_subscriber" | "test_group">("my_device");
  const [sendingTest, setSendingTest] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState("");
  const [testErrorMessage, setTestErrorMessage] = useState("");

  // Common UI states
  const [busy, setBusy] = useState(false);
  const [draftSavedToast, setDraftSavedToast] = useState(false);
  const [estimateData, setEstimateData] = useState<AudienceEstimateResult | null>(null);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [personalizationMenuOpen, setPersonalizationMenuOpen] = useState(false);

  // Load templates and initial draft from sessionStorage if available
  useEffect(() => {
    adminApi<{ templates: NotificationTemplate[] }>("/api/admin/notifications/templates")
      .then((res) => setTemplates(res.templates || []))
      .catch(() => {});

    if (typeof window !== "undefined") {
      const draft = sessionStorage.getItem("signup_notification_draft_template");
      if (draft) {
        try {
          const tpl = JSON.parse(draft) as NotificationTemplate;
          setTitle(tpl.title || "");
          setBody(tpl.body || "");
          setUrl(tpl.url || "/");
          setIcon(tpl.icon || "");
          setImage(tpl.image || "");
          setCtaText(tpl.ctaText || "");
          setName(tpl.name ? `Campaign: ${tpl.name}` : "");
          sessionStorage.removeItem("signup_notification_draft_template");
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, []);

  // Sync page selector with destination url
  useEffect(() => {
    if (pageId && pages.length > 0) {
      const p = pages.find((page) => page.id === pageId);
      if (p) setUrl(`/${p.slug}`);
    }
  }, [pageId, pages]);

  // Tag helper
  const addTag = () => {
    const val = tagInput.trim();
    if (val && !tags.includes(val)) {
      setTags([...tags, val]);
      setTagInput("");
    }
  };

  const removeTag = (t: string) => {
    setTags(tags.filter((item) => item !== t));
  };

  // Draft saver
  const handleSaveDraft = async () => {
    try {
      setBusy(true);
      await adminApi("/api/admin/notifications/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || "Untitled Campaign Draft",
          description: description.trim(),
          tags,
          type: campaignType,
          title: title.trim() || "Draft Title",
          body: body.trim() || "Draft message",
          url: url.trim() || "/",
          pageId,
          icon: icon.trim() || null,
          image: image.trim() || null,
          badge: badge.trim() || null,
          ctaText: ctaText.trim() || null,
          priority,
          status: "draft",
          targetFilters,
          scheduledAt: sendMode === "schedule" && scheduledDate && scheduledTime ? `${scheduledDate}T${scheduledTime}` : null,
          timezone,
          smartTimezoneDelivery,
          batchSize,
          throttleRate,
          retryTemporaryFailures: retryFailures,
        }),
      });
      setDraftSavedToast(true);
      setTimeout(() => setDraftSavedToast(false), 3500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setBusy(false);
    }
  };

  // Test Push Sender
  const handleSendTestPush = async () => {
    if (!title.trim() || !body.trim()) {
      setTestErrorMessage("Please enter a title and message first.");
      return;
    }
    try {
      setSendingTest(true);
      setTestSuccessMessage("");
      setTestErrorMessage("");
      const res = await adminApi<{ ok: boolean; message: string; error?: string }>("/api/admin/notifications/test", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || "/",
          icon: icon.trim() || null,
          image: image.trim() || null,
          badge: badge.trim() || null,
          ctaText: ctaText.trim() || null,
        }),
      });
      if (res.ok) {
        setTestSuccessMessage(res.message || "Test push notification dispatched successfully.");
      } else {
        setTestErrorMessage(res.error || res.message || "Test push failed.");
      }
    } catch (err) {
      setTestErrorMessage(err instanceof Error ? err.message : "Test push failed");
    } finally {
      setSendingTest(false);
    }
  };

  // Final Campaign Dispatch / Schedule
  const handleFinalSubmit = async () => {
    if (!title.trim() || !body.trim()) return;

    try {
      setBusy(true);
      const scheduledDateTime =
        sendMode === "schedule" && scheduledDate && scheduledTime
          ? `${scheduledDate}T${scheduledTime}`
          : null;

      await adminApi("/api/admin/notifications/send", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || title.trim(),
          description: description.trim(),
          tags,
          type: campaignType,
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || "/",
          pageId,
          icon: icon.trim() || null,
          image: image.trim() || null,
          badge: badge.trim() || null,
          ctaText: ctaText.trim() || null,
          priority,
          status: sendMode === "schedule" ? "scheduled" : "completed",
          scheduledAt: scheduledDateTime,
          timezone,
          smartTimezoneDelivery,
          batchSize,
          throttleRate,
          retryTemporaryFailures: retryFailures,
          targetFilters,
        }),
      });

      setConfirmSendOpen(false);
      router.push(`${base}/campaigns`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to launch campaign");
    } finally {
      setBusy(false);
    }
  };

  // Step advancement validators
  const handleNextFromStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setMaxUnlockedStep(Math.max(maxUnlockedStep, 2));
    setStep(2);
  };

  const handleNextFromStep2 = () => {
    setMaxUnlockedStep(Math.max(maxUnlockedStep, 3));
    setStep(3);
  };

  const handleNextFromStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setMaxUnlockedStep(Math.max(maxUnlockedStep, 4));
    setStep(4);
  };

  const handleNextFromStep4 = (e: React.FormEvent) => {
    e.preventDefault();
    if (sendMode === "schedule" && (!scheduledDate || !scheduledTime)) {
      alert("Please specify a date and time for the scheduled broadcast.");
      return;
    }
    setMaxUnlockedStep(Math.max(maxUnlockedStep, 5));
    setStep(5);
  };

  // Variable insertion
  const insertVariable = (variable: string) => {
    setBody((prev) => `${prev} {{${variable}}}`);
    setPersonalizationMenuOpen(false);
  };

  const stepsList = [
    { num: 1, label: "Campaign" },
    { num: 2, label: "Audience" },
    { num: 3, label: "Creative" },
    { num: 4, label: "Schedule" },
    { num: 5, label: "Review & Send" },
  ];

  return (
    <div className="admNotificationsWrapper">
      {/* Draft Toast Notification */}
      {draftSavedToast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            background: "#0f172a",
            color: "#ffffff",
            borderRadius: "8px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            zIndex: 9999,
            fontSize: "13px",
            fontWeight: "600",
          }}
        >
          <CheckCircle2 size={16} color="#10b981" />
          <span>Campaign draft saved successfully</span>
        </div>
      )}

      {/* 5-Step Campaign Navigation Stepper */}
      <div
        className="admCampaignStepper"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 18px",
          background: "var(--c-surface, #ffffff)",
          border: "1px solid var(--c-line, #e2e8f0)",
          borderRadius: "var(--radius-md, 8px)",
          marginBottom: "var(--sp-4, 16px)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {stepsList.map((s, idx) => {
            const isCurrent = step === s.num;
            const isUnlocked = s.num <= maxUnlockedStep;
            return (
              <div key={s.num} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  disabled={!isUnlocked}
                  onClick={() => isUnlocked && setStep(s.num as 1 | 2 | 3 | 4 | 5)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: isCurrent ? "700" : "550",
                    color: isCurrent
                      ? "var(--c-accent, #3b82f6)"
                      : isUnlocked
                      ? "var(--c-ink, #0f172a)"
                      : "var(--c-muted, #94a3b8)",
                    background: isCurrent
                      ? "var(--c-accent-soft, rgba(59, 130, 246, 0.1))"
                      : "transparent",
                    border: isCurrent ? "1px solid rgba(59, 130, 246, 0.2)" : "1px solid transparent",
                    cursor: isUnlocked ? "pointer" : "not-allowed",
                  }}
                >
                  <span
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: isCurrent
                        ? "var(--c-accent, #3b82f6)"
                        : isUnlocked
                        ? "var(--c-line, #e2e8f0)"
                        : "var(--c-surface-sunken, #f1f5f9)",
                      color: isCurrent ? "#ffffff" : isUnlocked ? "var(--c-ink, #0f172a)" : "var(--c-muted, #94a3b8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: "700",
                    }}
                  >
                    {s.num < step ? <Check size={12} /> : s.num}
                  </span>
                  <span>{s.label}</span>
                </button>
                {idx < stepsList.length - 1 && <ChevronRight size={14} color="var(--c-line, #cbd5e1)" />}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button variant="secondary" onClick={handleSaveDraft} disabled={busy}>
            Save Draft
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: CAMPAIGN SETUP */}
      {/* ========================================================================= */}
      {step === 1 && (
        <form onSubmit={handleNextFromStep1} style={{ maxWidth: "780px" }}>
          <SectionCard
            title="Step 1 — Campaign Details"
            description="Set internal identifiers and priority. This information is only visible to your workspace team."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <Field label="Campaign Name *" hint="Internal name (e.g., 'Dhaka Weekend Promotion', 'Black Friday Broadcast')">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dhaka Weekend Promotion"
                  style={{ height: "38px", fontSize: "14px" }}
                />
              </Field>

              <Field label="Internal Description" hint="Brief context on the campaign objective and target segment">
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Promoting 20% discount on summer apparel for active subscribers in Bangladesh..."
                  style={{ fontSize: "13px" }}
                />
              </Field>

              <Field label="Campaign Tags" hint="Add categorization tags (Press Enter to add)">
                <div>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder="e.g. Bangladesh, Weekend, September"
                      style={{ height: "36px", flex: 1 }}
                    />
                    <Button type="button" variant="secondary" onClick={addTag}>
                      Add Tag
                    </Button>
                  </div>
                  {tags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "600",
                            background: "var(--c-surface-sunken, #f8fafc)",
                            border: "1px solid var(--c-line, #e2e8f0)",
                            color: "var(--c-ink, #0f172a)",
                          }}
                        >
                          <Tag size={10} /> {t}
                          <button
                            type="button"
                            onClick={() => removeTag(t)}
                            style={{ background: "none", border: "none", color: "var(--c-muted, #64748b)", cursor: "pointer", padding: "0 2px" }}
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <Field label="Campaign Type">
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px",
                        borderRadius: "8px",
                        border: `1px solid ${campaignType === "broadcast" ? "var(--c-accent, #3b82f6)" : "var(--c-line, #e2e8f0)"}`,
                        background: campaignType === "broadcast" ? "var(--c-accent-soft, rgba(59, 130, 246, 0.05))" : "var(--c-surface, #fff)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="campaignType"
                        checked={campaignType === "broadcast"}
                        onChange={() => setCampaignType("broadcast")}
                      />
                      <div>
                        <strong style={{ fontSize: "13px", display: "block" }}>Standard Broadcast</strong>
                        <span style={{ fontSize: "11px", color: "var(--c-muted, #64748b)" }}>Immediate delivery to targeted audience</span>
                      </div>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px",
                        borderRadius: "8px",
                        border: `1px solid ${campaignType === "scheduled" ? "var(--c-accent, #3b82f6)" : "var(--c-line, #e2e8f0)"}`,
                        background: campaignType === "scheduled" ? "var(--c-accent-soft, rgba(59, 130, 246, 0.05))" : "var(--c-surface, #fff)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="campaignType"
                        checked={campaignType === "scheduled"}
                        onChange={() => setCampaignType("scheduled")}
                      />
                      <div>
                        <strong style={{ fontSize: "13px", display: "block" }}>Scheduled Campaign</strong>
                        <span style={{ fontSize: "11px", color: "var(--c-muted, #64748b)" }}>Deliver at a designated future time</span>
                      </div>
                    </label>
                  </div>
                </Field>

                <Field label="Delivery Priority">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as "normal" | "high" | "urgent")}
                    style={{ height: "38px" }}
                  >
                    <option value="normal">Normal Priority (Standard)</option>
                    <option value="high">High Priority (Fast-track queue)</option>
                    <option value="urgent">Urgent (Instant wake-up lock)</option>
                  </select>
                </Field>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <Button variant="secondary" onClick={handleSaveDraft} disabled={busy}>
                  Save Draft
                </Button>
                <Button variant="primary" type="submit" disabled={!name.trim()}>
                  Continue to Audience <ArrowRight size={15} />
                </Button>
              </div>
            </div>
          </SectionCard>
        </form>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: AUDIENCE TARGETING */}
      {/* ========================================================================= */}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <SectionCard
            title="Step 2 — Audience & Geographic Targeting"
            description="Define which subscribers receive this broadcast using location hierarchies, devices, and engagement history."
          >
            <AudienceTargeter
              filters={targetFilters}
              onChange={setTargetFilters}
              pages={pages}
              locations={locations}
              segments={segments}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px" }}>
              <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(1)}>
                Back
              </Button>
              <div style={{ display: "flex", gap: "10px" }}>
                <Button variant="secondary" onClick={handleSaveDraft} disabled={busy}>
                  Save Draft
                </Button>
                <Button variant="primary" onClick={handleNextFromStep2}>
                  Continue to Creative <ArrowRight size={15} />
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: CREATIVE COMPOSER */}
      {/* ========================================================================= */}
      {step === 3 && (
        <form onSubmit={handleNextFromStep3}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
            {/* Left Column: Creative Editor */}
            <SectionCard
              title="Step 3 — Notification Creative"
              description="Craft the headline, message copy, banner imagery, and click destination."
              actions={
                templates.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={FileCode2}
                    type="button"
                    onClick={() => setTemplatePickerOpen(true)}
                  >
                    Load Template
                  </Button>
                )
              }
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <Field
                  label="Notification Title *"
                  hint={`${title.length}/80 characters ${title.length > 55 ? "(May truncate on small mobile screens)" : ""}`}
                >
                  <input
                    required
                    maxLength={80}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Exclusive 20% Off Weekend Voucher"
                    style={{ height: "38px", fontSize: "14px", fontWeight: "600" }}
                  />
                </Field>

                <Field
                  label="Notification Message *"
                  hint={`${body.length}/180 characters ${body.length > 120 ? "(May truncate on lockscreen cards)" : ""}`}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
                      <div style={{ position: "relative" }}>
                        <button
                          type="button"
                          onClick={() => setPersonalizationMenuOpen(!personalizationMenuOpen)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "600",
                            background: "var(--c-surface-sunken, #f1f5f9)",
                            border: "1px solid var(--c-line, #e2e8f0)",
                            color: "var(--c-accent, #3b82f6)",
                            cursor: "pointer",
                          }}
                        >
                          <Sparkles size={11} /> + Personalization <ChevronDown size={10} />
                        </button>
                        {personalizationMenuOpen && (
                          <div
                            style={{
                              position: "absolute",
                              right: 0,
                              top: "100%",
                              marginTop: "4px",
                              background: "var(--c-surface, #ffffff)",
                              border: "1px solid var(--c-line, #e2e8f0)",
                              borderRadius: "6px",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                              zIndex: 100,
                              minWidth: "160px",
                              display: "flex",
                              flexDirection: "column",
                              padding: "4px",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => insertVariable("city")}
                              style={{ padding: "6px 8px", textAlign: "left", background: "none", border: "none", fontSize: "12px", cursor: "pointer", borderRadius: "4px" }}
                            >
                              Subscriber City (&#123;&#123;city&#125;&#125;)
                            </button>
                            <button
                              type="button"
                              onClick={() => insertVariable("country")}
                              style={{ padding: "6px 8px", textAlign: "left", background: "none", border: "none", fontSize: "12px", cursor: "pointer", borderRadius: "4px" }}
                            >
                              Subscriber Country (&#123;&#123;country&#125;&#125;)
                            </button>
                            <button
                              type="button"
                              onClick={() => insertVariable("page_name")}
                              style={{ padding: "6px 8px", textAlign: "left", background: "none", border: "none", fontSize: "12px", cursor: "pointer", borderRadius: "4px" }}
                            >
                              Page Name (&#123;&#123;page_name&#125;&#125;)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <textarea
                      required
                      rows={3}
                      maxLength={180}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="e.g. Tap to claim your instant weekend voucher before midnight. Valid on all collections!"
                      style={{ fontSize: "13px" }}
                    />
                  </div>
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <Field label="Attach Smart Page">
                    <select
                      value={pageId || ""}
                      onChange={(e) => setPageId(e.target.value ? Number(e.target.value) : null)}
                      style={{ height: "38px" }}
                    >
                      <option value="">Custom link destination</option>
                      {pages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (/{p.slug})
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Destination URL *" hint="Where tapping the notification redirects">
                    <input
                      required
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setPageId(null);
                      }}
                      placeholder="https://... or /page-slug"
                      style={{ height: "38px" }}
                    />
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <ImageUploader
                    category="icon"
                    label="Notification Icon"
                    value={icon}
                    onChange={setIcon}
                    onBusyChange={setImageBusy}
                  />
                  <ImageUploader
                    category="banner"
                    label="16:9 Banner Image (Optional)"
                    value={image}
                    onChange={setImage}
                    onBusyChange={setImageBusy}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <Field label="CTA / Action Button (Optional)" hint="e.g. 'Claim Offer', 'Open Page'">
                    <input
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      placeholder="e.g. Claim Now"
                      style={{ height: "38px" }}
                    />
                  </Field>

                  <Field label="Badge Icon (Optional)" hint="Small monochromatic notification badge">
                    <input
                      value={badge}
                      onChange={(e) => setBadge(e.target.value)}
                      placeholder="/favicon.ico or icon path"
                      style={{ height: "38px" }}
                    />
                  </Field>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
                  <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <Button variant="secondary" onClick={handleSaveDraft} disabled={busy}>
                      Save Draft
                    </Button>
                    <Button variant="primary" type="submit" disabled={!title.trim() || !body.trim() || imageBusy}>
                      Continue to Schedule <ArrowRight size={15} />
                    </Button>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Right Column: Live Device Preview */}
            <SectionCard
              title="Live Device Preview"
              description="Visual simulation across Android, Desktop, and macOS notification centers."
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", gap: "6px", borderBottom: "1px solid var(--c-line, #e2e8f0)", paddingBottom: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform("android")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "650",
                      background: previewPlatform === "android" ? "var(--c-ink, #0f172a)" : "var(--c-surface-sunken, #f1f5f9)",
                      color: previewPlatform === "android" ? "#ffffff" : "var(--c-muted, #64748b)",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Smartphone size={13} /> Android
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform("desktop")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "650",
                      background: previewPlatform === "desktop" ? "var(--c-ink, #0f172a)" : "var(--c-surface-sunken, #f1f5f9)",
                      color: previewPlatform === "desktop" ? "#ffffff" : "var(--c-muted, #64748b)",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Monitor size={13} /> Windows / Chrome
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform("macos")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "650",
                      background: previewPlatform === "macos" ? "var(--c-ink, #0f172a)" : "var(--c-surface-sunken, #f1f5f9)",
                      color: previewPlatform === "macos" ? "#ffffff" : "var(--c-muted, #64748b)",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Laptop size={13} /> macOS / Safari
                  </button>
                </div>

                {/* Simulated Notification Card */}
                <div
                  style={{
                    padding: "16px",
                    background: previewPlatform === "macos" ? "rgba(255, 255, 255, 0.85)" : "var(--c-surface, #ffffff)",
                    backdropFilter: previewPlatform === "macos" ? "blur(16px)" : "none",
                    border: "1px solid var(--c-line, #cbd5e1)",
                    borderRadius: previewPlatform === "macos" ? "14px" : "10px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "4px",
                          background: "#3b82f6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontSize: "10px",
                          overflow: "hidden",
                        }}
                      >
                        <Bell size={12} />
                      </div>
                      <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--c-ink, #0f172a)" }}>
                        {brandingName}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--c-muted, #94a3b8)" }}>&bull; now</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "8px",
                        background: "var(--c-surface-sunken, #f1f5f9)",
                        border: "1px solid var(--c-line, #e2e8f0)",
                        overflow: "hidden",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {icon ? (
                        <img src={icon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <Sparkles size={20} color="#3b82f6" />
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: "13px", fontWeight: "700", margin: "0 0 3px 0", color: "var(--c-ink, #0f172a)" }}>
                        {title || "Your Notification Title"}
                      </p>
                      <p style={{ fontSize: "12px", color: "var(--c-muted, #475569)", margin: 0, lineHeight: "1.4" }}>
                        {body || "This is where your broadcast message body will be displayed to subscribers."}
                      </p>
                    </div>
                  </div>

                  {image && (
                    <div style={{ marginTop: "12px", borderRadius: "8px", overflow: "hidden", maxHeight: "160px" }}>
                      <img src={image} alt="" style={{ width: "100%", height: "160px", objectFit: "cover" }} />
                    </div>
                  )}

                  {ctaText && (
                    <div style={{ marginTop: "12px", borderTop: "1px solid var(--c-line, #e2e8f0)", paddingTop: "8px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "5px 12px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: "700",
                          background: "var(--c-surface-sunken, #f8fafc)",
                          border: "1px solid var(--c-line, #e2e8f0)",
                          color: "#2563eb",
                        }}
                      >
                        {ctaText}
                      </span>
                    </div>
                  )}
                </div>

                <p style={{ fontSize: "11px", color: "var(--c-muted, #94a3b8)", margin: "6px 0 0 0", textAlign: "center" }}>
                  Preview — actual appearance may vary by browser/device.
                </p>
              </div>
            </SectionCard>
          </div>
        </form>
      )}

      {/* Template Picker Modal */}
      {templatePickerOpen && (
        <Dialog title="Load Notification Template" onClose={() => setTemplatePickerOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "400px", overflowY: "auto" }}>
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => {
                  setTitle(tpl.title);
                  setBody(tpl.body);
                  if (tpl.url) setUrl(tpl.url);
                  if (tpl.icon) setIcon(tpl.icon);
                  if (tpl.image) setImage(tpl.image);
                  if (tpl.ctaText) setCtaText(tpl.ctaText);
                  setTemplatePickerOpen(false);
                }}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--c-line, #e2e8f0)",
                  background: "var(--c-surface, #ffffff)",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <strong style={{ fontSize: "13px" }}>{tpl.name}</strong>
                  <span style={{ fontSize: "11px", color: "var(--c-muted, #64748b)" }}>{tpl.category}</span>
                </div>
                <p style={{ fontSize: "12px", margin: "0 0 2px 0", color: "var(--c-ink, #0f172a)" }}>{tpl.title}</p>
                <p style={{ fontSize: "11px", color: "var(--c-muted, #64748b)", margin: 0 }}>{tpl.body}</p>
              </div>
            ))}
          </div>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* STEP 4: SCHEDULE & DISPATCH */}
      {/* ========================================================================= */}
      {step === 4 && (
        <form onSubmit={handleNextFromStep4} style={{ maxWidth: "780px" }}>
          <SectionCard
            title="Step 4 — Schedule & Dispatch Configuration"
            description="Choose immediate dispatch or set a scheduled delivery date and timezone."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "14px",
                    borderRadius: "8px",
                    border: `1px solid ${sendMode === "now" ? "var(--c-accent, #3b82f6)" : "var(--c-line, #e2e8f0)"}`,
                    background: sendMode === "now" ? "var(--c-accent-soft, rgba(59, 130, 246, 0.05))" : "var(--c-surface, #ffffff)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="sendMode"
                    checked={sendMode === "now"}
                    onChange={() => setSendMode("now")}
                  />
                  <div>
                    <strong style={{ fontSize: "14px", display: "block" }}>Send Broadcast Now</strong>
                    <span style={{ fontSize: "12px", color: "var(--c-muted, #64748b)" }}>
                      Dispatches to queue immediately upon confirmation
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "14px",
                    borderRadius: "8px",
                    border: `1px solid ${sendMode === "schedule" ? "var(--c-accent, #3b82f6)" : "var(--c-line, #e2e8f0)"}`,
                    background: sendMode === "schedule" ? "var(--c-accent-soft, rgba(59, 130, 246, 0.05))" : "var(--c-surface, #ffffff)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="sendMode"
                    checked={sendMode === "schedule"}
                    onChange={() => setSendMode("schedule")}
                  />
                  <div>
                    <strong style={{ fontSize: "14px", display: "block" }}>Schedule for Later</strong>
                    <span style={{ fontSize: "12px", color: "var(--c-muted, #64748b)" }}>
                      Auto-deliver at a specified date and time
                    </span>
                  </div>
                </label>
              </div>

              {sendMode === "schedule" && (
                <div
                  style={{
                    padding: "16px",
                    background: "var(--c-surface-sunken, #f8fafc)",
                    borderRadius: "8px",
                    border: "1px solid var(--c-line, #e2e8f0)",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <Field label="Dispatch Date *">
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().slice(0, 10)}
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      style={{ height: "38px" }}
                    />
                  </Field>

                  <Field label="Dispatch Time *">
                    <input
                      type="time"
                      required
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      style={{ height: "38px" }}
                    />
                  </Field>

                  <Field label="Timezone">
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      style={{ height: "38px" }}
                    >
                      <option value="Asia/Dhaka">Asia/Dhaka (GMT+6)</option>
                      <option value="Asia/Kolkata">Asia/Kolkata (GMT+5:30)</option>
                      <option value="Asia/Kathmandu">Asia/Kathmandu (GMT+5:45)</option>
                      <option value="Asia/Karachi">Asia/Karachi (GMT+5)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                      <option value="UTC">UTC Universal</option>
                    </select>
                  </Field>
                </div>
              )}

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  cursor: "pointer",
                  color: "var(--c-ink, #0f172a)",
                }}
              >
                <input
                  type="checkbox"
                  checked={smartTimezoneDelivery}
                  onChange={(e) => setSmartTimezoneDelivery(e.target.checked)}
                />
                <span>
                  <strong>Deliver using subscriber local timezone</strong> (Optimizes open rates based on regional active hours)
                </span>
              </label>

              {/* Collapsible Advanced Delivery Settings */}
              <div style={{ borderTop: "1px solid var(--c-line, #e2e8f0)", paddingTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowAdvancedDelivery(!showAdvancedDelivery)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "none",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "var(--c-accent, #3b82f6)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <SlidersHorizontal size={14} /> Advanced Delivery Settings {showAdvancedDelivery ? "▲" : "▼"}
                </button>

                {showAdvancedDelivery && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "14px",
                      background: "var(--c-surface-sunken, #f8fafc)",
                      borderRadius: "8px",
                      border: "1px solid var(--c-line, #e2e8f0)",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "14px",
                    }}
                  >
                    <Field label="Batch Size" hint="Number of subscriptions pushed concurrently (Default: 250)">
                      <input
                        type="number"
                        min={50}
                        max={1000}
                        value={batchSize}
                        onChange={(e) => setBatchSize(Number(e.target.value) || 250)}
                        style={{ height: "36px" }}
                      />
                    </Field>

                    <Field label="Throttling Rate" hint="Pushes per second to prevent endpoint saturation (Default: 50/s)">
                      <input
                        type="number"
                        min={10}
                        max={200}
                        value={throttleRate}
                        onChange={(e) => setThrottleRate(Number(e.target.value) || 50)}
                        style={{ height: "36px" }}
                      />
                    </Field>

                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", gridColumn: "span 2" }}>
                      <input
                        type="checkbox"
                        checked={retryFailures}
                        onChange={(e) => setRetryFailures(e.target.checked)}
                      />
                      <span>Retry failed temporary deliveries up to 2 times</span>
                    </label>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
                <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(3)}>
                  Back
                </Button>
                <div style={{ display: "flex", gap: "10px" }}>
                  <Button variant="secondary" onClick={handleSaveDraft} disabled={busy}>
                    Save Draft
                  </Button>
                  <Button variant="primary" type="submit">
                    Continue to Review <ArrowRight size={15} />
                  </Button>
                </div>
              </div>
            </div>
          </SectionCard>
        </form>
      )}

      {/* ========================================================================= */}
      {/* STEP 5: REVIEW & SEND */}
      {/* ========================================================================= */}
      {step === 5 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "900px" }}>
          <SectionCard
            title="Step 5 — Pre-Flight Review & Launch"
            description="Verify all campaign parameters, test push rendering, and confirm broadcast dispatch."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Pre-flight Checklist */}
              <div
                style={{
                  padding: "14px 18px",
                  background: "var(--c-surface-sunken, #f8fafc)",
                  borderRadius: "8px",
                  border: "1px solid var(--c-line, #e2e8f0)",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "600", color: "#16a34a" }}>
                  <CheckCircle2 size={15} /> Campaign Configured
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "600", color: "#16a34a" }}>
                  <CheckCircle2 size={15} /> Audience Verified
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "600", color: "#16a34a" }}>
                  <CheckCircle2 size={15} /> Title & Copy Validated
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "600", color: "#16a34a" }}>
                  <CheckCircle2 size={15} /> Push Service Ready
                </div>
              </div>

              {/* Summary Matrix Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                {/* Campaign & Audience Card */}
                <div
                  style={{
                    padding: "14px",
                    background: "var(--c-surface, #ffffff)",
                    border: "1px solid var(--c-line, #e2e8f0)",
                    borderRadius: "8px",
                  }}
                >
                  <h4 style={{ fontSize: "13px", fontWeight: "700", margin: "0 0 8px 0", color: "var(--c-ink, #0f172a)" }}>
                    Campaign & Target Audience
                  </h4>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "12px", lineHeight: "1.8", color: "var(--c-muted, #64748b)" }}>
                    <li>
                      <strong style={{ color: "var(--c-ink, #0f172a)" }}>Campaign:</strong> {name || "Untitled Broadcast"}
                    </li>
                    <li>
                      <strong style={{ color: "var(--c-ink, #0f172a)" }}>Priority:</strong> {priority.toUpperCase()}
                    </li>
                    <li>
                      <strong style={{ color: "var(--c-ink, #0f172a)" }}>Type:</strong> {campaignType === "broadcast" ? "Standard Broadcast" : "Scheduled"}
                    </li>
                    <li>
                      <strong style={{ color: "var(--c-ink, #0f172a)" }}>Target Locations:</strong>{" "}
                      {targetFilters.locations?.includeCountries?.length
                        ? targetFilters.locations.includeCountries.join(", ")
                        : "All Countries"}
                    </li>
                  </ul>
                </div>

                {/* Schedule & Delivery Card */}
                <div
                  style={{
                    padding: "14px",
                    background: "var(--c-surface, #ffffff)",
                    border: "1px solid var(--c-line, #e2e8f0)",
                    borderRadius: "8px",
                  }}
                >
                  <h4 style={{ fontSize: "13px", fontWeight: "700", margin: "0 0 8px 0", color: "var(--c-ink, #0f172a)" }}>
                    Dispatch & Destination
                  </h4>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "12px", lineHeight: "1.8", color: "var(--c-muted, #64748b)" }}>
                    <li>
                      <strong style={{ color: "var(--c-ink, #0f172a)" }}>Delivery:</strong>{" "}
                      {sendMode === "now" ? "Instant (Send Now)" : `${scheduledDate} at ${scheduledTime} (${timezone})`}
                    </li>
                    <li>
                      <strong style={{ color: "var(--c-ink, #0f172a)" }}>Destination:</strong> {url}
                    </li>
                    <li>
                      <strong style={{ color: "var(--c-ink, #0f172a)" }}>Batch Size:</strong> {batchSize} / batch ({throttleRate}/sec)
                    </li>
                  </ul>
                </div>
              </div>

              {/* Creative Snapshot */}
              <div
                style={{
                  padding: "14px",
                  background: "var(--c-surface-sunken, #f8fafc)",
                  borderRadius: "8px",
                  border: "1px solid var(--c-line, #e2e8f0)",
                }}
              >
                <h4 style={{ fontSize: "13px", fontWeight: "700", margin: "0 0 8px 0" }}>Creative Snapshot</h4>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "6px",
                      background: "#3b82f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {icon ? <img src={icon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Bell size={18} />}
                  </div>
                  <div>
                    <strong style={{ fontSize: "13px", color: "var(--c-ink, #0f172a)", display: "block" }}>{title}</strong>
                    <p style={{ fontSize: "12px", color: "var(--c-muted, #64748b)", margin: "2px 0 0 0" }}>{body}</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--c-line, #e2e8f0)",
                  paddingTop: "16px",
                }}
              >
                <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(4)}>
                  Back
                </Button>
                <div style={{ display: "flex", gap: "10px" }}>
                  <Button variant="secondary" onClick={handleSaveDraft} disabled={busy}>
                    Save Draft
                  </Button>
                  <Button
                    variant="secondary"
                    icon={Send}
                    type="button"
                    onClick={() => setTestSendOpen(true)}
                  >
                    Send Test
                  </Button>
                  <Button
                    variant="primary"
                    icon={sendMode === "schedule" ? Calendar : Send}
                    onClick={() => setConfirmSendOpen(true)}
                    disabled={busy || !title.trim() || !body.trim()}
                  >
                    {sendMode === "schedule" ? "Schedule Campaign" : "Send Campaign Now"}
                  </Button>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TEST SEND MODAL */}
      {/* ========================================================================= */}
      {testSendOpen && (
        <Dialog title="Send Test Push Notification" onClose={() => setTestSendOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p style={{ fontSize: "13px", color: "var(--c-muted, #64748b)", margin: 0 }}>
              Dispatch a test push directly to your browser or test subscriber device without altering production analytics.
            </p>

            <Field label="Test Target">
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                  <input
                    type="radio"
                    name="testTarget"
                    checked={testTarget === "my_device"}
                    onChange={() => setTestTarget("my_device")}
                  />
                  <span>My Active Browser / Device</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                  <input
                    type="radio"
                    name="testTarget"
                    checked={testTarget === "sample_subscriber"}
                    onChange={() => setTestTarget("sample_subscriber")}
                  />
                  <span>Sample Recent Subscriber Endpoint</span>
                </label>
              </div>
            </Field>

            {testSuccessMessage && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  color: "#065f46",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
              >
                ✓ {testSuccessMessage}
              </div>
            )}

            {testErrorMessage && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "#991b1b",
                  fontSize: "12px",
                  fontWeight: "500",
                  lineHeight: 1.4,
                }}
              >
                ✕ {testErrorMessage}
              </div>
            )}

            <div className="admDialogActions" style={{ marginTop: "12px" }}>
              <Button variant="secondary" onClick={() => setTestSendOpen(false)} disabled={sendingTest}>
                Close
              </Button>
              <Button variant="primary" onClick={handleSendTestPush} disabled={sendingTest}>
                {sendingTest ? <Loader2 className="admSpinner" size={14} /> : <Send size={14} />}
                Send Test Now
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* FINAL BROADCAST CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {confirmSendOpen && (
        <Dialog
          title={sendMode === "schedule" ? "Confirm Campaign Schedule" : "Confirm Notification Broadcast"}
          onClose={() => !busy && setConfirmSendOpen(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div
              style={{
                padding: "14px",
                background: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "8px",
                color: "#1e40af",
                fontSize: "13px",
              }}
            >
              <p style={{ margin: "0 0 4px 0", fontWeight: "700" }}>
                {sendMode === "schedule"
                  ? `You are scheduling this campaign for ${scheduledDate} at ${scheduledTime} (${timezone}).`
                  : "You are about to broadcast this push notification immediately to all matching subscribers."}
              </p>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--c-muted, #475569)" }}>
                Title: <strong>{title}</strong>
              </p>
            </div>

            <p style={{ fontSize: "12px", color: "var(--c-muted, #64748b)", margin: 0 }}>
              Push requests will be processed in rate-limited batches with double-send protection.
            </p>

            <div className="admDialogActions" style={{ marginTop: "12px" }}>
              <Button variant="secondary" onClick={() => setConfirmSendOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleFinalSubmit} disabled={busy}>
                {busy ? <Loader2 className="admSpinner" size={14} /> : <Check size={14} />}
                {sendMode === "schedule" ? "Confirm & Schedule" : "Confirm & Send Broadcast"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default NotificationComposer;

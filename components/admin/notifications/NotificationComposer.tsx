"use client";

import { useState } from "react";
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
} from "lucide-react";
import { AudienceTargeter } from "./AudienceTargeter";
import { Button, Dialog, Field, SectionHeading, SectionCard } from "../AdminUI";
import { ImageUploader } from "../../ImageUploader";
import { adminApi } from "@/lib/admin";
import type { AudienceFilters, CampaignStatus, NotificationCampaign, SubscriberSegment } from "@/lib/types";
import type { WorkspaceDistinctLocations } from "@/lib/audienceTargeting";

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

  // Notification Fields
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [ctaText, setCtaText] = useState("Open Link");
  const [image, setImage] = useState("");
  const [icon, setIcon] = useState(brandingLogo || "/favicon.png");
  const [badge, setBadge] = useState("/favicon-32x32.png");
  const [priority, setPriority] = useState<"normal" | "high" | "urgent">("normal");

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

  // Audience Target Filters
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

  // Preview Mode
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "android" | "mobile">("desktop");

  // State & Modals
  const [busy, setBusy] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [safetyModalOpen, setSafetyModalOpen] = useState(false);
  const [savedSegments, setSavedSegments] = useState<SubscriberSegment[]>(segments);

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
          url: url.trim() || "/",
          image: image || null,
          icon: icon || null,
          ctaText: ctaText || null,
          priority,
        }),
      });
      setMessage(res.message || "Test push sent successfully!");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to send test push notification.");
    } finally {
      setTestSending(false);
    }
  };

  const executeSendOrSchedule = async (asDraft = false) => {
    if (!title.trim()) {
      setError("Notification title is required.");
      return;
    }
    if (!body.trim()) {
      setError("Notification message is required.");
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
        name: name.trim() || title.trim(),
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || "/",
        ctaText: ctaText.trim() || null,
        image: image || null,
        icon: icon || null,
        badge: badge || null,
        priority,
        status: asDraft ? "draft" : scheduledAt ? "scheduled" : "completed",
        scheduledAt,
        timezone,
        targetFilters,
      };

      const result = await adminApi<{ ok: boolean; campaign?: NotificationCampaign; sent?: number }>(
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

  const openConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title.trim() || !body.trim()) {
      setError("Notification title and message are required.");
      return;
    }
    setSafetyModalOpen(true);
  };

  return (
    <div className="admNotificationComposer" style={{ display: "grid", gap: "var(--sp-6)", maxWidth: "100%" }}>
      {error && (
        <div className="admError" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} style={{ border: 0, background: "transparent" }}>
            ✕
          </button>
        </div>
      )}
      {message && <p className="admSuccess" role="status">{message}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)", gap: "var(--sp-6)", alignItems: "start" }}>
        {/* Left Column: Form & Targeter */}
        <form onSubmit={openConfirmation} style={{ display: "grid", gap: "var(--sp-5)", minWidth: 0 }}>
          {/* Notification Content Card */}
          <SectionCard title="1. Notification Content" description="Craft the message and visual assets subscribers will receive.">
            <Field label="Campaign Internal Name" hint="For internal organization and tracking.">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Flash Sale Announcement - Dhaka"
              />
            </Field>

            <Field label={`Notification Title (${title.length}/80)`} hint="Headline shown in bold on subscriber devices.">
              <input
                required
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="🎉 Special Offer: 50% Off Today Only!"
              />
            </Field>

            <Field label={`Message Body (${body.length}/180)`} hint="Primary notification text description.">
              <textarea
                required
                maxLength={180}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Don't miss our exclusive deals across Dhaka and major cities. Tap now to claim your discount!"
                style={{ minHeight: "80px" }}
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
              <Field label="Action Button (CTA Text)" hint="Optional button text.">
                <input
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  placeholder="e.g. Shop Now, View Deal"
                />
              </Field>

              <Field label="Destination URL (HTTPS / Path)" hint="Where subscribers land on click.">
                <input
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com or /sale"
                />
              </Field>
            </div>

            <ImageUploader
              category="campaign"
              label="Notification Banner Image (Optional)"
              hint="Rich expanded image displayed on supported Android and Desktop browsers."
              value={image}
              onChange={setImage}
            />
          </SectionCard>

          {/* Target Audience Card */}
          <SectionCard title="2. Target Audience & Location Filters" description="Select exactly which subscribers receive this campaign.">
            <AudienceTargeter
              filters={targetFilters}
              onChange={setTargetFilters}
              pages={pages}
              locations={locations}
              segments={savedSegments}
              onSegmentSaved={(newSeg) => setSavedSegments((prev) => [...prev, newSeg])}
            />
          </SectionCard>

          {/* Schedule & Priority Card */}
          <SectionCard title="3. Schedule & Delivery Settings" description="Choose when and how aggressively the notification should be dispatched.">
            <div style={{ display: "flex", gap: "var(--sp-4)", marginBottom: "var(--sp-3)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "var(--text-base)" }}>
                <input
                  type="radio"
                  name="sendMode"
                  checked={sendMode === "now"}
                  onChange={() => setSendMode("now")}
                />
                <span>Send Immediately</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "var(--text-base)" }}>
                <input
                  type="radio"
                  name="sendMode"
                  checked={sendMode === "schedule"}
                  onChange={() => setSendMode("schedule")}
                />
                <span>Schedule for Later</span>
              </label>
            </div>

            {sendMode === "schedule" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: "var(--sp-3)", padding: "var(--sp-3)", background: "var(--c-surface-sunken)", borderRadius: "var(--radius-md)", border: "1px solid var(--c-line)" }}>
                <Field label="Date">
                  <input
                    type="date"
                    required={sendMode === "schedule"}
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                </Field>
                <Field label="Time">
                  <input
                    type="time"
                    required={sendMode === "schedule"}
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  />
                </Field>
                <Field label="Timezone">
                  <input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="e.g. Asia/Dhaka"
                  />
                </Field>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)", marginTop: "var(--sp-2)" }}>
              <Field label="Priority Level">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as "normal" | "high" | "urgent")}
                >
                  <option value="normal">Normal (Standard delivery)</option>
                  <option value="high">High (Immediate wake)</option>
                  <option value="urgent">Urgent (Break through silent)</option>
                </select>
              </Field>

              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <Button
                  type="button"
                  variant="secondary"
                  icon={Zap}
                  loading={testSending}
                  onClick={handleTestSend}
                  style={{ width: "100%" }}
                >
                  Send Test Notification
                </Button>
              </div>
            </div>
          </SectionCard>

          {/* Action Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", marginTop: "var(--sp-2)" }}>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void executeSendOrSchedule(true)}
            >
              Save as Draft
            </Button>

            <div style={{ display: "flex", gap: "var(--sp-3)" }}>
              <Button
                type="submit"
                variant="primary"
                icon={sendMode === "now" ? Send : Calendar}
                loading={busy}
                disabled={busy || !title.trim() || !body.trim()}
              >
                {sendMode === "now" ? "Review & Send Now" : "Schedule Campaign"}
              </Button>
            </div>
          </div>
        </form>

        {/* Right Column: Live Multi-Device Previews */}
        <div style={{ position: "sticky", top: "calc(var(--adm-header-h) + 20px)", display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
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
                <Eye size={16} style={{ color: "var(--c-accent)" }} />
                <strong style={{ fontSize: "var(--text-base)", color: "var(--c-ink)" }}>
                  Live Device Preview
                </strong>
              </div>

              {/* Preview Device Tabs */}
              <div className="admChartTabs">
                <button
                  type="button"
                  className={previewDevice === "desktop" ? "active" : ""}
                  onClick={() => setPreviewDevice("desktop")}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  className={previewDevice === "android" ? "active" : ""}
                  onClick={() => setPreviewDevice("android")}
                >
                  Android
                </button>
                <button
                  type="button"
                  className={previewDevice === "mobile" ? "active" : ""}
                  onClick={() => setPreviewDevice("mobile")}
                >
                  Browser
                </button>
              </div>
            </div>

            {/* Preview Stage */}
            <div
              style={{
                background: previewDevice === "desktop" ? "#1e293b" : "#0f172a",
                padding: "20px 16px",
                borderRadius: "var(--radius-lg)",
                minHeight: "260px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Desktop macOS/Windows Toast */}
              {previewDevice === "desktop" && (
                <div
                  style={{
                    width: "100%",
                    maxWidth: "340px",
                    background: "rgba(255, 255, 255, 0.95)",
                    backdropFilter: "blur(10px)",
                    borderRadius: "12px",
                    padding: "12px",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#64748b" }}>
                    <Image src={icon || brandingLogo} alt="" width={16} height={16} unoptimized style={{ borderRadius: "3px" }} />
                    <strong style={{ color: "#0f172a" }}>{brandingName}</strong>
                    <span>• Just now</span>
                  </div>

                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: "block", fontSize: "13px", color: "#0f172a", lineHeight: 1.3 }}>
                        {title || "Notification Title Appears Here"}
                      </strong>
                      <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#475569", lineHeight: 1.4, overflowWrap: "anywhere" }}>
                        {body || "Your notification body text message will display here cleanly on subscriber devices."}
                      </p>
                    </div>
                    {image && (
                      <div style={{ width: "48px", height: "48px", flexShrink: 0, borderRadius: "6px", overflow: "hidden" }}>
                        <Image src={image} alt="" width={48} height={48} unoptimized style={{ objectFit: "cover", width: "100%", height: "100%" }} />
                      </div>
                    )}
                  </div>

                  {ctaText && (
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "6px", display: "flex", justifyContent: "flex-end" }}>
                      <span style={{ fontSize: "11px", fontWeight: 650, color: "#2563eb" }}>
                        {ctaText} →
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Android Notification Shade Card */}
              {previewDevice === "android" && (
                <div
                  style={{
                    width: "100%",
                    maxWidth: "320px",
                    background: "#2d3748",
                    borderRadius: "16px",
                    padding: "14px",
                    color: "#ffffff",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    boxShadow: "0 10px 20px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", color: "#a0aec0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Image src={icon || brandingLogo} alt="" width={14} height={14} unoptimized style={{ borderRadius: "50%" }} />
                      <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{brandingName}</span>
                    </div>
                    <span>now</span>
                  </div>

                  <div>
                    <strong style={{ display: "block", fontSize: "13px", color: "#ffffff", fontWeight: 700 }}>
                      {title || "Android Notification Title"}
                    </strong>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#cbd5e1", lineHeight: 1.35 }}>
                      {body || "Message body will show on Android device notification bar."}
                    </p>
                  </div>

                  {image && (
                    <div style={{ width: "100%", height: "120px", borderRadius: "8px", overflow: "hidden" }}>
                      <Image src={image} alt="" width={320} height={120} unoptimized style={{ objectFit: "cover", width: "100%", height: "100%" }} />
                    </div>
                  )}

                  {ctaText && (
                    <div style={{ display: "flex", gap: "8px", borderTop: "1px solid #4a5568", paddingTop: "8px" }}>
                      <button
                        type="button"
                        style={{
                          background: "rgba(255, 255, 255, 0.1)",
                          border: 0,
                          color: "#90cdf4",
                          padding: "4px 10px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: "default",
                        }}
                      >
                        {ctaText.toUpperCase()}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Mobile Browser Toast */}
              {previewDevice === "mobile" && (
                <div
                  style={{
                    width: "100%",
                    maxWidth: "300px",
                    background: "#ffffff",
                    borderRadius: "14px",
                    padding: "14px",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Image src={icon || brandingLogo} alt="" width={22} height={22} unoptimized style={{ borderRadius: "50%" }} />
                    <div>
                      <strong style={{ display: "block", fontSize: "12px", color: "#0f172a" }}>
                        {title || "Browser Notification"}
                      </strong>
                      <span style={{ fontSize: "10px", color: "#64748b" }}>from {brandingName}</span>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: "11px", color: "#334155", lineHeight: 1.4 }}>
                    {body || "Mobile browser floating notification prompt."}
                  </p>

                  <button
                    type="button"
                    style={{
                      marginTop: "4px",
                      background: "#2563eb",
                      color: "#ffffff",
                      border: 0,
                      borderRadius: "6px",
                      padding: "6px",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "default",
                    }}
                  >
                    {ctaText}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Safety Confirmation Modal */}
      {safetyModalOpen && (
        <Dialog title="Confirm Notification Dispatch" onClose={() => setSafetyModalOpen(false)}>
          <div className="admFormStack">
            <div
              style={{
                padding: "var(--sp-4)",
                background: "var(--c-warning-soft)",
                border: "1px solid var(--c-warning-line)",
                borderRadius: "var(--radius-lg)",
                display: "flex",
                gap: "var(--sp-3)",
                alignItems: "flex-start",
              }}
            >
              <AlertTriangle size={20} style={{ color: "var(--c-warning)", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ display: "block", color: "var(--c-warning)", fontSize: "var(--text-base)" }}>
                  Safety Check: Confirm Campaign Send
                </strong>
                <p style={{ margin: "2px 0 0", color: "var(--c-text)", fontSize: "var(--text-xs)" }}>
                  You are about to dispatch this campaign to subscribers matching your active location and audience filters.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "8px", fontSize: "var(--text-xs)", background: "var(--c-surface-sunken)", padding: "12px", borderRadius: "var(--radius-md)" }}>
              <div>
                <strong>Campaign:</strong> {name.trim() || title.trim()}
              </div>
              <div>
                <strong>Notification Title:</strong> {title}
              </div>
              <div>
                <strong>Scheduled:</strong> {sendMode === "now" ? "Immediate Dispatch" : `${scheduledDate} ${scheduledTime} (${timezone})`}
              </div>
              <div>
                <strong>Target Locations:</strong>{" "}
                {targetFilters.locations?.includeCities?.length
                  ? targetFilters.locations.includeCities.join(", ")
                  : targetFilters.locations?.includeCountries?.length
                  ? targetFilters.locations.includeCountries.join(", ")
                  : "All Locations"}
              </div>
            </div>

            <div className="admDialogActions">
              <Button onClick={() => setSafetyModalOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                icon={Send}
                loading={busy}
                onClick={() => void executeSendOrSchedule(false)}
              >
                Confirm & Dispatch
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

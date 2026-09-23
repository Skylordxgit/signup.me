"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileCode2,
  Plus,
  Trash2,
  Edit2,
  Send,
  Sparkles,
  ExternalLink,
  Tag,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { NotificationTemplate } from "@/lib/types";
import { adminApi } from "@/lib/admin";
import { Button, Dialog, Field, EmptyState, LoadingState } from "../AdminUI";
import { NotificationNav } from "./NotificationNav";
import { ImageUploader } from "../../ImageUploader";

export function NotificationTemplatesView({
  onUseTemplate,
}: {
  onUseTemplate?: (template: NotificationTemplate) => void;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("promotion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [image, setImage] = useState("");
  const [icon, setIcon] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    adminApi<{ templates: NotificationTemplate[] }>("/api/admin/notifications/templates", { signal: controller.signal })
      .then((res) => {
        if (!cancelled && res) setTemplates(res.templates || []);
      })
      .catch((err) => {
        if (!cancelled && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load templates");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const openCreateModal = (tpl?: NotificationTemplate) => {
    if (tpl) {
      setEditingTemplate(tpl);
      setName(tpl.name);
      setCategory(tpl.category || "custom");
      setTitle(tpl.title);
      setBody(tpl.body);
      setUrl(tpl.url || "/");
      setImage(tpl.image || "");
      setIcon(tpl.icon || "");
      setCtaText(tpl.ctaText || "");
    } else {
      setEditingTemplate(null);
      setName("");
      setCategory("promotion");
      setTitle("");
      setBody("");
      setUrl("/");
      setImage("");
      setIcon("");
      setCtaText("");
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !title.trim() || !body.trim()) return;

    try {
      setBusy(true);
      await adminApi("/api/admin/notifications/templates", {
        method: "POST",
        body: JSON.stringify({
          id: editingTemplate?.id,
          name: name.trim(),
          category,
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || "/",
          image: image.trim() || null,
          icon: icon.trim() || null,
          ctaText: ctaText.trim() || null,
        }),
      });
      setModalOpen(false);
      await fetchTemplates();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      await adminApi(`/api/admin/notifications/templates/${id}`, { method: "DELETE" });
      await fetchTemplates();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete template");
    }
  };

  const handleApply = (tpl: NotificationTemplate) => {
    if (onUseTemplate) {
      onUseTemplate(tpl);
    } else {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("signup_notification_draft_template", JSON.stringify(tpl));
      }
      router.push("/admin/notifications/create");
    }
  };

  return (
    <div className="admNotificationsWrapper">
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "var(--sp-4, 16px)",
        }}
      >
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 2px 0" }}>Notification Templates</h2>
          <p style={{ fontSize: "13px", color: "var(--c-muted, #64748b)", margin: 0 }}>
            Reusable push message presets for quick broadcast launches.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => openCreateModal()}>
          New Template
        </Button>
      </div>

      {loading ? (
        <LoadingState label="Loading notification templates..." />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileCode2}
          title="No notification templates yet"
          description="Create reusable notification copy and assets to speed up your future campaigns."
          action={
            <Button variant="primary" icon={Plus} onClick={() => openCreateModal()}>
              Create First Template
            </Button>
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "16px",
                background: "var(--c-surface, #ffffff)",
                border: "1px solid var(--c-line, #e2e8f0)",
                borderRadius: "var(--radius-lg, 12px)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                position: "relative",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      background: "var(--c-surface-sunken, #f8fafc)",
                      color: "var(--c-accent, #3b82f6)",
                      border: "1px solid var(--c-line, #e2e8f0)",
                    }}
                  >
                    <Tag size={10} /> {tpl.category || "General"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => openCreateModal(tpl)}
                      title="Edit template"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--c-muted, #64748b)",
                        cursor: "pointer",
                        padding: "4px",
                        borderRadius: "4px",
                      }}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tpl.id)}
                      title="Delete template"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--c-danger, #ef4444)",
                        cursor: "pointer",
                        padding: "4px",
                        borderRadius: "4px",
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <h3 style={{ fontSize: "14px", fontWeight: "700", margin: "0 0 8px 0" }}>{tpl.name}</h3>

                {/* Notification mini preview */}
                <div
                  style={{
                    padding: "12px",
                    background: "var(--c-surface-sunken, #f8fafc)",
                    borderRadius: "8px",
                    border: "1px solid var(--c-line, #e2e8f0)",
                    marginBottom: "14px",
                  }}
                >
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: "var(--c-accent-soft, rgba(59, 130, 246, 0.1))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        overflow: "hidden",
                      }}
                    >
                      {tpl.icon ? (
                        <img src={tpl.icon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <Sparkles size={16} color="var(--c-accent, #3b82f6)" />
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: "12px", fontWeight: "700", margin: "0 0 3px 0", color: "var(--c-ink, #0f172a)" }}>
                        {tpl.title}
                      </p>
                      <p style={{ fontSize: "11px", color: "var(--c-muted, #64748b)", margin: "0 0 6px 0", lineHeight: "1.4" }}>
                        {tpl.body}
                      </p>
                      {tpl.ctaText && (
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "10px",
                            fontWeight: "700",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "var(--c-surface, #ffffff)",
                            border: "1px solid var(--c-line, #e2e8f0)",
                            color: "var(--c-ink, #0f172a)",
                          }}
                        >
                          {tpl.ctaText}
                        </span>
                      )}
                    </div>
                  </div>
                  {tpl.image && (
                    <div style={{ marginTop: "8px", borderRadius: "6px", overflow: "hidden", maxHeight: "90px" }}>
                      <img src={tpl.image} alt="" style={{ width: "100%", height: "90px", objectFit: "cover" }} />
                    </div>
                  )}
                </div>
              </div>

              <Button
                variant="secondary"
                icon={Send}
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => handleApply(tpl)}
              >
                Use in Campaign
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Template Dialog */}
      {modalOpen && (
        <Dialog
          title={editingTemplate ? "Edit Template" : "Create Notification Template"}
          onClose={() => !busy && setModalOpen(false)}
        >
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Field label="Template Name" hint="Internal name for your team">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Weekend Flash Sale Alert"
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <Field label="Category">
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="promotion">Promotion</option>
                  <option value="announcement">Announcement</option>
                  <option value="reminder">Reminder</option>
                  <option value="content">New Content</option>
                  <option value="urgent">Urgent Update</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
              <Field label="CTA Button Text" hint="Optional action label">
                <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="e.g. Claim Now" />
              </Field>
            </div>

            <Field label="Notification Title *" hint="Primary push notification headline">
              <input
                required
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Catchy headline"
              />
            </Field>

            <Field label="Notification Message *" hint="Body text shown to subscribers">
              <textarea
                required
                rows={3}
                maxLength={180}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Informative, high-converting copy..."
              />
            </Field>

            <Field label="Destination URL" hint="Where clicking the notification leads">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://... or /page-slug" />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <ImageUploader
                category="general"
                label="Notification Icon"
                value={icon}
                onChange={setIcon}
                onBusyChange={setImageBusy}
              />
              <ImageUploader
                category="general"
                label="16:9 Banner Image"
                value={image}
                onChange={setImage}
                onBusyChange={setImageBusy}
              />
            </div>

            <div className="admDialogActions" style={{ marginTop: "10px" }}>
              <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy || imageBusy || !name.trim() || !title.trim() || !body.trim()}>
                {busy ? <Loader2 className="admSpinner" size={14} /> : <CheckCircle2 size={14} />}
                {editingTemplate ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

export default NotificationTemplatesView;

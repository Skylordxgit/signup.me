"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Bell, Code2, Eye, Globe, Info, Link2, RefreshCw, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AnalyticsReport, SmartPage } from "@/lib/types";
import { adminApi } from "@/lib/admin";
import { Button, Field, PageHeader } from "./AdminUI";
import { resolveNotificationPrompt, resolveNotificationPromptTheme } from "@/lib/notificationPrompt";

const number = (value: number = 0) => value.toLocaleString();
const percent = (value: number = 0) => `${Math.round(value)}%`;

type Tab = "content" | "seo" | "notifications" | "analytics" | "settings";

export function CustomHtmlEditor({ initialPage }: { initialPage: SmartPage }) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [sourceHtml, setSourceHtml] = useState(initialPage.customHtml?.sourceHtml || "");
  const [tab, setTab] = useState<Tab>("content");
  const [preview, setPreview] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [status, setStatus] = useState("Saved");
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [simulatingPrompt, setSimulatingPrompt] = useState(false);

  const prompt = page.integrations.notificationPrompt;
  const promptCopy = resolveNotificationPrompt(prompt);
  const promptTheme = resolveNotificationPromptTheme(prompt);

  function updatePrompt(patch: Partial<NonNullable<typeof prompt>>) {
    setPage({
      ...page,
      integrations: {
        ...page.integrations,
        notificationPrompt: { ...prompt, ...patch },
      },
    });
  }

  useEffect(() => {
    if (tab === "analytics") {
      setLoadingReport(true);
      adminApi<AnalyticsReport>(`/api/pages/${page.id}/analytics?range=30d`)
        .then((res) => {
          setReport(res);
          setLoadingReport(false);
        })
        .catch(() => setLoadingReport(false));
    }
  }, [tab, page.id]);

  async function save(publish = false, restoreVersion?: number) {
    setStatus(publish ? "Publishing..." : "Saving...");
    try {
      const saved = await adminApi<SmartPage>(`/api/pages/${page.id}/custom-html`, {
        method: "PUT",
        body: JSON.stringify({
          sourceHtml: restoreVersion === undefined ? sourceHtml : undefined,
          restoreVersion,
          publish,
          seo: page.seo,
          integrations: page.integrations,
          name: page.name,
          slug: page.slug,
          status: publish ? "published" : page.status,
        }),
      });
      setPage(saved);
      setSourceHtml(saved.customHtml?.sourceHtml || sourceHtml);
      setStatus(publish ? "Published successfully" : restoreVersion ? `Version ${restoreVersion} restored as draft` : "Draft saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save draft.");
    }
  }

  async function importSource(file: File) {
    setStatus("Reading upload...");
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch(`/api/pages/${page.id}/custom-html/upload`, { method: "POST", body: form });
      const body = (await response.json()) as { html?: string; error?: string; warnings?: string[] };
      if (!response.ok || !body.html) throw new Error(body.error || "Could not read upload.");
      setSourceHtml(body.html);
      setStatus(`${file.name} loaded. Click "Save draft" to validate and sanitize.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read upload.");
    }
  }

  return (
    <>
      <PageHeader
        title={page.name}
        description={`Custom HTML Landing Page · ${page.status === "published" ? "Published" : page.status === "disabled" ? "Disabled" : "Draft"}`}
      >
        <Button icon={ArrowLeft} onClick={() => router.push("/admin/pages")}>
          Pages
        </Button>
        <Button icon={Eye} onClick={() => setTab("content")}>
          Preview
        </Button>
        <Button icon={Save} onClick={() => void save()}>
          Save draft
        </Button>
        <Button variant="primary" icon={Send} onClick={() => void save(true)}>
          Publish
        </Button>
      </PageHeader>

      <div className="customHtmlTabs">
        {(["content", "seo", "notifications", "analytics", "settings"] as Tab[]).map((item) => (
          <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item === "content" ? "Content & Preview" : item === "seo" ? "SEO & Social" : item === "notifications" ? "Push Notifications" : item === "analytics" ? "Link Analytics" : "Settings"}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <div className="customHtmlEditorLayout">
          <section>
            <Field
              label="HTML source / ZIP archive"
              hint="Upload an HTML or ZIP file (up to 5 MB) or paste source code. Secure HTML mode strips JavaScript, event handlers, and unsafe embeds."
            >
              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px" }}>
                <input
                  type="file"
                  accept=".html,.htm,.zip,text/html,application/zip"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importSource(file);
                  }}
                />
              </div>
              <textarea
                className="customHtmlCode"
                value={sourceHtml}
                onChange={(event) => setSourceHtml(event.target.value)}
                placeholder="<!doctype html><html><head>...</head><body><h1>Hello World</h1></body></html>"
                spellCheck={false}
              />
            </Field>

            <p className="admMuted" role="status">
              {status}
            </p>

            {page.customHtml?.warnings && page.customHtml.warnings.length > 0 && (
              <div className="admFormSection" style={{ borderColor: "#f59e0b", background: "rgba(245, 158, 11, 0.05)" }}>
                <h4 style={{ margin: "0 0 6px", color: "#d97706", display: "flex", alignItems: "center", gap: 6 }}>
                  <Info size={16} /> Security Sanitization Warnings
                </h4>
                {page.customHtml.warnings.map((warning, idx) => (
                  <p key={idx} style={{ margin: "4px 0", fontSize: "13px", color: "var(--c-ink)" }}>
                    • {warning}
                  </p>
                ))}
              </div>
            )}

            <h3>Version History</h3>
            {(page.customHtml?.versions || []).length === 0 ? (
              <p className="admMuted">No prior revisions yet. Saving or publishing will record versions.</p>
            ) : (
              (page.customHtml?.versions || [])
                .slice()
                .reverse()
                .map((version) => (
                  <div className="customHtmlVersion" key={version.version}>
                    <span>
                      <strong>v{version.version}</strong> · {new Date(version.createdAt).toLocaleString()} · {version.publishedAt ? "Published" : "Draft"}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button size="sm" onClick={() => void save(false, version.version)}>
                        Restore as draft
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => void save(true, version.version)}>
                        Publish
                      </Button>
                    </div>
                  </div>
                ))
            )}
          </section>

          <section>
            <div className="customHtmlPreviewControls">
              {(["desktop", "tablet", "mobile"] as const).map((mode) => (
                <button key={mode} type="button" className={preview === mode ? "active" : ""} onClick={() => setPreview(mode)}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            <iframe
              title="Secure HTML draft preview"
              sandbox=""
              srcDoc={page.customHtml?.draftHtml || sourceHtml}
              className={`customHtmlFrame customHtmlPreview-${preview}`}
            />
          </section>
        </div>
      )}

      {tab === "seo" && (
        <div className="admFormGrid">
          <Field label="SEO Title" hint="Overrides uploaded HTML title when present.">
            <input
              value={page.seo.seoTitle}
              onChange={(event) => setPage({ ...page, seo: { ...page.seo, seoTitle: event.target.value } })}
              placeholder={page.customHtml?.uploadedMetadata?.title || page.name}
            />
          </Field>
          <Field label="Meta Description" hint="Overrides uploaded HTML meta description.">
            <textarea
              value={page.seo.metaDescription}
              onChange={(event) => setPage({ ...page, seo: { ...page.seo, metaDescription: event.target.value } })}
              placeholder={page.customHtml?.uploadedMetadata?.description || "Description for search engines..."}
            />
          </Field>
          <Field label="Canonical URL">
            <input
              value={page.seo.canonicalUrl || ""}
              onChange={(event) => setPage({ ...page, seo: { ...page.seo, canonicalUrl: event.target.value } })}
              placeholder="https://example.com/canonical-url"
            />
          </Field>
          <Field label="OG / Social Title">
            <input
              value={page.seo.socialTitle}
              onChange={(event) => setPage({ ...page, seo: { ...page.seo, socialTitle: event.target.value } })}
              placeholder={page.seo.seoTitle || page.name}
            />
          </Field>
          <Field label="OG / Social Description">
            <textarea
              value={page.seo.socialDescription}
              onChange={(event) => setPage({ ...page, seo: { ...page.seo, socialDescription: event.target.value } })}
              placeholder={page.seo.metaDescription}
            />
          </Field>
          <Field label="OG Social Image URL">
            <input
              value={page.seo.ogImage}
              onChange={(event) => setPage({ ...page, seo: { ...page.seo, ogImage: event.target.value } })}
              placeholder="https://example.com/social-preview.jpg"
            />
          </Field>
          <Field label="Favicon URL">
            <input
              value={page.seo.favicon}
              onChange={(event) => setPage({ ...page, seo: { ...page.seo, favicon: event.target.value } })}
              placeholder="https://example.com/favicon.ico"
            />
          </Field>
          <div style={{ gridColumn: "1 / -1", marginTop: "8px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={page.seo.noindex === true}
                onChange={(event) => setPage({ ...page, seo: { ...page.seo, noindex: event.target.checked } })}
              />
              <strong>Noindex this page</strong> (discourage search engines from indexing)
            </label>
          </div>
        </div>
      )}

      {tab === "notifications" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 420px)", gap: "24px" }}>
          <div className="admFormGrid">
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="admSwitchRow">
                <span>
                  <strong>Push Notification Opt-in Prompt</strong>
                  <small>{prompt?.enabled ? "Active on public page." : "Prompt widget is disabled."}</small>
                </span>
                <input
                  type="checkbox"
                  checked={prompt?.enabled === true}
                  onChange={(event) => updatePrompt({ enabled: event.target.checked })}
                />
              </label>
            </div>

            <Field label="Widget Type">
              <select
                value={promptTheme.widgetType}
                onChange={(event) => updatePrompt({ widgetType: event.target.value as typeof promptTheme.widgetType })}
              >
                <option value="floating-bell">Floating Bell</option>
                <option value="pill">Pill</option>
                <option value="icon-text">Icon + Text</option>
                <option value="minimal">Minimal</option>
              </select>
            </Field>

            <Field label="Corner Position">
              <select
                value={promptTheme.position}
                onChange={(event) => updatePrompt({ position: event.target.value as typeof promptTheme.position })}
              >
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
            </Field>

            <Field label="X Offset (px)">
              <input
                type="number"
                min="0"
                max="120"
                value={promptTheme.offsetX}
                onChange={(event) => updatePrompt({ offsetX: Number(event.target.value) })}
              />
            </Field>

            <Field label="Y Offset (px)">
              <input
                type="number"
                min="0"
                max="120"
                value={promptTheme.offsetY}
                onChange={(event) => updatePrompt({ offsetY: Number(event.target.value) })}
              />
            </Field>

            <Field label="Icon Mode">
              <select
                value={promptTheme.iconMode}
                onChange={(event) => updatePrompt({ iconMode: event.target.value as typeof promptTheme.iconMode })}
              >
                <option value="default">Default Bell</option>
                <option value="workspace">Workspace Logo</option>
                <option value="custom">Custom Icon URL</option>
              </select>
            </Field>

            {promptTheme.iconMode === "custom" && (
              <Field label="Custom Icon URL">
                <input
                  value={promptTheme.iconUrl}
                  onChange={(event) => updatePrompt({ iconUrl: event.target.value })}
                  placeholder="https://example.com/icon.png"
                />
              </Field>
            )}

            <Field label="Button Color">
              <input
                type="color"
                value={promptTheme.buttonColor}
                onChange={(event) => updatePrompt({ buttonColor: event.target.value })}
              />
            </Field>

            <Field label="Button Text Color">
              <input
                type="color"
                value={promptTheme.buttonTextColor}
                onChange={(event) => updatePrompt({ buttonTextColor: event.target.value })}
              />
            </Field>

            <Field label="Card Background">
              <input
                type="color"
                value={promptTheme.cardBackground}
                onChange={(event) => updatePrompt({ cardBackground: event.target.value })}
              />
            </Field>

            <Field label="Text Color">
              <input
                type="color"
                value={promptTheme.textColor}
                onChange={(event) => updatePrompt({ textColor: event.target.value })}
              />
            </Field>

            <Field label="Prompt Heading">
              <input
                value={promptCopy.heading}
                onChange={(event) => updatePrompt({ heading: event.target.value })}
                placeholder="Get Notifications"
              />
            </Field>

            <Field label="Prompt Message">
              <textarea
                value={promptCopy.message}
                onChange={(event) => updatePrompt({ message: event.target.value })}
                placeholder="Subscribe to receive timely updates and deals."
              />
            </Field>

            <Field label="Allow Button Text">
              <input
                value={promptCopy.allowLabel}
                onChange={(event) => updatePrompt({ allowLabel: event.target.value })}
                placeholder="Allow"
              />
            </Field>

            <Field label="Not Now Button Text">
              <input
                value={promptTheme.notNowLabel}
                onChange={(event) => updatePrompt({ notNowLabel: event.target.value })}
                placeholder="Not Now"
              />
            </Field>

            <div style={{ gridColumn: "1 / -1", display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "6px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={promptTheme.showDesktop}
                  onChange={(event) => updatePrompt({ showDesktop: event.target.checked })}
                />
                Show on Desktop
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={promptTheme.showTablet}
                  onChange={(event) => updatePrompt({ showTablet: event.target.checked })}
                />
                Show on Tablet
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={promptTheme.showMobile}
                  onChange={(event) => updatePrompt({ showMobile: event.target.checked })}
                />
                Show on Mobile
              </label>
            </div>
          </div>

          <div>
            <div className="admFormSection" style={{ position: "sticky", top: "80px" }}>
              <h4>Live Widget Simulation</h4>
              <p className="admMuted" style={{ fontSize: "13px" }}>
                Interactive test without triggering browser push permission.
              </p>
              <div
                style={{
                  position: "relative",
                  height: "260px",
                  background: "var(--c-surface-sunken)",
                  border: "1px dashed var(--c-line)",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: promptTheme.position.startsWith("top") ? `${Math.min(30, promptTheme.offsetY)}px` : undefined,
                    bottom: promptTheme.position.startsWith("bottom") ? `${Math.min(30, promptTheme.offsetY)}px` : undefined,
                    left: promptTheme.position.endsWith("left") ? `${Math.min(30, promptTheme.offsetX)}px` : undefined,
                    right: promptTheme.position.endsWith("right") ? `${Math.min(30, promptTheme.offsetX)}px` : undefined,
                    cursor: "pointer",
                  }}
                  onClick={() => setSimulatingPrompt(!simulatingPrompt)}
                >
                  <button
                    type="button"
                    style={{
                      background: promptTheme.buttonColor,
                      color: promptTheme.buttonTextColor,
                      borderRadius: `${promptTheme.borderRadius}px`,
                      border: 0,
                      padding: promptTheme.widgetType === "floating-bell" ? "10px" : "8px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontWeight: 600,
                      fontSize: "13px",
                      boxShadow: "var(--shadow-md)",
                    }}
                  >
                    <Bell size={16} />
                    {promptTheme.widgetType !== "floating-bell" && (promptTheme.widgetType === "minimal" ? "Updates" : promptCopy.allowLabel)}
                  </button>
                </div>

                {simulatingPrompt && (
                  <div
                    style={{
                      position: "absolute",
                      inset: "12px",
                      background: promptTheme.cardBackground,
                      color: promptTheme.textColor,
                      borderRadius: "var(--radius-md)",
                      padding: "14px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      boxShadow: "var(--shadow-lg)",
                      border: "1px solid var(--c-line)",
                    }}
                  >
                    <div>
                      <strong style={{ display: "block", fontSize: "14px", marginBottom: "4px" }}>
                        {promptCopy.heading}
                      </strong>
                      <p style={{ margin: 0, fontSize: "12px", opacity: 0.85 }}>{promptCopy.message}</p>
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        style={{
                          padding: "4px 10px",
                          border: "1px solid rgba(255,255,255,0.2)",
                          background: "transparent",
                          color: promptTheme.textColor,
                          borderRadius: "4px",
                          fontSize: "12px",
                        }}
                        onClick={() => setSimulatingPrompt(false)}
                      >
                        {promptTheme.notNowLabel}
                      </button>
                      <button
                        type="button"
                        style={{
                          padding: "4px 12px",
                          border: 0,
                          background: promptTheme.buttonColor,
                          color: promptTheme.buttonTextColor,
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                        onClick={() => setSimulatingPrompt(false)}
                      >
                        {promptCopy.allowLabel}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "analytics" && (
        <div>
          {loadingReport ? (
            <p className="admMuted">Loading click analytics...</p>
          ) : (
            <>
              <div className="admMetrics">
                <div className="admMetric">
                  <span>Views</span>
                  <strong>{number(report?.views ?? page.views)}</strong>
                </div>
                <div className="admMetric">
                  <span>Unique Visitors</span>
                  <strong>{number(report?.uniqueVisitors ?? page.uniqueVisitors)}</strong>
                </div>
                <div className="admMetric">
                  <span>Link Clicks</span>
                  <strong>{number(report?.clicks ?? 0)}</strong>
                </div>
                <div className="admMetric">
                  <span>CTR</span>
                  <strong>{percent(report?.ctr ?? 0)}</strong>
                </div>
              </div>

              <div className="admFormSection" style={{ marginTop: "24px" }}>
                <h3>Custom HTML Links Performance</h3>
                {!report?.customHtmlLinks?.length ? (
                  <p className="admMuted">No link clicks recorded yet. Clicks on links within your Custom HTML page will appear here.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginTop: "10px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--c-line)", textAlign: "left" }}>
                          <th style={{ padding: "8px" }}>Target URL (href)</th>
                          <th style={{ padding: "8px", textAlign: "right" }}>Clicks</th>
                          <th style={{ padding: "8px", textAlign: "right" }}>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.customHtmlLinks.map((link, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid var(--c-line)" }}>
                            <td style={{ padding: "8px", wordBreak: "break-all" }}>
                              <a href={link.href} target="_blank" rel="noreferrer" style={{ color: "var(--c-accent-ink)" }}>
                                {link.href}
                              </a>
                            </td>
                            <td style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>{number(link.clicks)}</td>
                            <td style={{ padding: "8px", textAlign: "right", color: "var(--c-muted)" }}>
                              {report.clicks > 0 ? percent((link.clicks / report.clicks) * 100) : "0%"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="admFormGrid">
          <Field label="Page Name">
            <input value={page.name} onChange={(event) => setPage({ ...page, name: event.target.value })} />
          </Field>
          <Field label="URL Slug">
            <input value={page.slug} onChange={(event) => setPage({ ...page, slug: event.target.value })} />
          </Field>
          <Field label="Publishing Status">
            <select
              value={page.status}
              onChange={(event) => setPage({ ...page, status: event.target.value as SmartPage["status"] })}
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
        </div>
      )}
    </>
  );
}

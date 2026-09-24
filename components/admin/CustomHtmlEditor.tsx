"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  FileCode,
  FolderArchive,
  Info,
  Layout,
  Monitor,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Tablet,
  UploadCloud,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { AnalyticsReport, SmartPage } from "@/lib/types";
import { adminApi } from "@/lib/admin";
import { Button, Field } from "./AdminUI";
import { resolveNotificationPrompt, resolveNotificationPromptTheme } from "@/lib/notificationPrompt";

const number = (value: number = 0) => value.toLocaleString();
const percent = (value: number = 0) => `${Math.round(value)}%`;

function formatVersionDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d
      .toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .replace(",", " •");
  } catch {
    return dateStr;
  }
}

type Tab = "content" | "seo" | "notifications" | "analytics" | "settings";

export function CustomHtmlEditor({ initialPage }: { initialPage: SmartPage }) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [sourceHtml, setSourceHtml] = useState(initialPage.customHtml?.sourceHtml || "");
  const [debouncedHtml, setDebouncedHtml] = useState(
    initialPage.customHtml?.draftHtml || initialPage.customHtml?.sourceHtml || ""
  );
  const [tab, setTab] = useState<Tab>("content");
  const [preview, setPreview] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [mobileMode, setMobileMode] = useState<"edit" | "preview">("edit");
  const [previewKey, setPreviewKey] = useState(1);
  const [previewingVersion, setPreviewingVersion] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Upload Dropzone states
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<{ fileName: string; fileCount?: number } | null>(null);
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analytics states
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [simulatingPrompt, setSimulatingPrompt] = useState(false);

  const prompt = page.integrations.notificationPrompt;
  const promptCopy = resolveNotificationPrompt(prompt);
  const promptTheme = resolveNotificationPromptTheme(prompt);

  // Debounce live preview update (400ms)
  useEffect(() => {
    if (previewingVersion === null) {
      const timer = setTimeout(() => {
        setDebouncedHtml(sourceHtml);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [sourceHtml, previewingVersion]);

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
    if (publish) setIsPublishing(true);
    else setIsSaving(true);
    setSaveStatus(publish ? "Publishing..." : "Saving...");
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
      if (saved.customHtml?.sourceHtml) {
        setSourceHtml(saved.customHtml.sourceHtml);
        setDebouncedHtml(saved.customHtml.draftHtml || saved.customHtml.sourceHtml);
        setPreviewingVersion(null);
      }
      setSaveStatus(publish ? "Published" : restoreVersion ? `Version ${restoreVersion} restored` : "Saved");
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
      setIsPublishing(false);
    }
  }

  async function importSource(file: File) {
    setIsUploading(true);
    setUploadingFileName(file.name);
    setUploadError(null);
    setUploadSuccess(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch(`/api/pages/${page.id}/custom-html/upload`, { method: "POST", body: form });
      const body = (await response.json()) as { html?: string; fileCount?: number; error?: string; warnings?: string[] };
      if (!response.ok || !body.html) {
        throw new Error(body.error || "Could not read upload.");
      }
      setSourceHtml(body.html);
      setDebouncedHtml(body.html);
      setPreviewingVersion(null);
      setUploadSuccess({ fileName: file.name, fileCount: body.fileCount });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsUploading(false);
      setUploadingFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void importSource(file);
  };

  const lineCount = sourceHtml ? sourceHtml.split("\n").length : 0;
  const charCount = sourceHtml ? sourceHtml.length : 0;
  const versions = page.customHtml?.versions || [];

  return (
    <>
      <div className="customHtmlHeader">
        <div className="customHtmlHeaderLeft">
          <button
            type="button"
            className="customHtmlBackBtn"
            onClick={() => router.push("/admin/pages")}
            title="Back to Pages"
          >
            <ArrowLeft size={16} />
            <span>Pages</span>
          </button>
          <div className="customHtmlTitleGroup">
            <h2 className="customHtmlPageTitle">{page.name}</h2>
            <div className="customHtmlStatusBadge">
              <span
                className="customHtmlStatusDot"
                style={{ background: page.status === "published" ? "#10b981" : "#f59e0b" }}
              />
              <span>
                Custom HTML Landing Page • {page.status === "published" ? "Published" : page.status === "disabled" ? "Disabled" : "Draft"}
              </span>
            </div>
          </div>
        </div>

        <div className="customHtmlHeaderActions">
          {saveStatus && (
            <div className="customHtmlStatusToast">
              <span>{saveStatus}</span>
            </div>
          )}
          <Button
            icon={Eye}
            onClick={() => {
              setTab("content");
              setMobileMode("preview");
              if (previewingVersion) setPreviewingVersion(null);
            }}
          >
            Preview
          </Button>
          <Button icon={Save} disabled={isSaving || isPublishing} onClick={() => void save(false)}>
            {isSaving ? "Saving..." : "Save Draft"}
          </Button>
          <Button variant="primary" icon={Send} disabled={isSaving || isPublishing} onClick={() => void save(true)}>
            {isPublishing ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>

      <div className="customHtmlTabs">
        {(["content", "seo", "notifications", "analytics", "settings"] as Tab[]).map((item) => (
          <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item === "content"
              ? "Content & Preview"
              : item === "seo"
              ? "SEO & Social"
              : item === "notifications"
              ? "Push Notifications"
              : item === "analytics"
              ? "Link Analytics"
              : "Settings"}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <>
          {/* Mobile Edit / Preview Toggle */}
          <div className="customHtmlMobileToggle">
            <button
              type="button"
              className={mobileMode === "edit" ? "active" : ""}
              onClick={() => setMobileMode("edit")}
            >
              <FileCode size={14} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className={mobileMode === "preview" ? "active" : ""}
              onClick={() => setMobileMode("preview")}
            >
              <Eye size={14} />
              <span>Preview</span>
            </button>
          </div>

          <div className={`customHtmlEditorLayout ${mobileMode === "preview" ? "mobileShowPreview" : "mobileShowEdit"}`}>
            {/* LEFT COLUMN: Content Editor */}
            <div className="customHtmlLeftPanel">
              {/* Upload Dropzone Card */}
              <div className="customHtmlCard">
                <div
                  className={`customHtmlDropzone ${isDragging ? "isDragging" : ""} ${isUploading ? "isUploading" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".html,.htm,.zip,text/html,application/zip"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importSource(file);
                    }}
                  />
                  <div className="customHtmlDropzoneIcon">
                    {isUploading ? <RefreshCw className="admSpin" size={22} /> : <UploadCloud size={22} />}
                  </div>
                  <div className="customHtmlDropzoneContent">
                    <div className="customHtmlDropzoneTitle">
                      {isUploading
                        ? (uploadingFileName || "Uploading landing page...")
                        : "Upload your landing page"}
                    </div>
                    <div className="customHtmlDropzoneSubtitle">
                      {isUploading ? "Processing..." : "Drag & drop HTML or ZIP here"}
                    </div>
                    {!isUploading && <div className="customHtmlDropzoneOr">or</div>}
                    {!isUploading && (
                      <button
                        type="button"
                        className="customHtmlDropzoneBtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                      >
                        <FolderArchive size={15} /> Choose File
                      </button>
                    )}
                    <div className="customHtmlDropzoneFootnote">HTML / ZIP • Maximum 5 MB</div>
                  </div>
                </div>

                {uploadSuccess && (
                  <div className="customHtmlAlert customHtmlAlertSuccess">
                    <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <strong>✓ Import completed</strong>
                      <div>
                        {uploadSuccess.fileName}{" "}
                        {uploadSuccess.fileCount ? `• ${uploadSuccess.fileCount} files processed` : ""}
                      </div>
                    </div>
                    <button type="button" className="admIconButton" onClick={() => setUploadSuccess(null)}>
                      <X size={14} />
                    </button>
                  </div>
                )}

                {uploadError && (
                  <div className="customHtmlAlert customHtmlAlertError">
                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <strong>⚠ ZIP import failed</strong>
                      <p>{uploadError}</p>
                      {uploadError.includes("limit") && (
                        <p style={{ marginTop: "4px", fontSize: "12px", opacity: 0.9 }}>
                          Maximum allowed: 500 files.
                        </p>
                      )}
                      <button
                        type="button"
                        className="customHtmlAlertActionBtn"
                        onClick={() => {
                          setUploadError(null);
                          fileInputRef.current?.click();
                        }}
                      >
                        Choose Another File
                      </button>
                    </div>
                    <button type="button" className="admIconButton" onClick={() => setUploadError(null)}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* OR Divider */}
              <div className="customHtmlDivider">
                <span>OR</span>
              </div>

              {/* Code Editor Section */}
              <div className="customHtmlCard">
                <div className="customHtmlSectionHeader">
                  <div>
                    <h3 className="customHtmlSectionTitle">HTML Source</h3>
                    <p className="customHtmlSectionSubtitle">Paste / Edit Code</p>
                  </div>
                  <div className="customHtmlCodeMeta">
                    {lineCount} lines • {number(charCount)} chars
                  </div>
                </div>

                <div className="customHtmlCodeBox">
                  <textarea
                    className="customHtmlCode"
                    value={sourceHtml}
                    onChange={(e) => {
                      setSourceHtml(e.target.value);
                      if (previewingVersion !== null) setPreviewingVersion(null);
                    }}
                    placeholder="Paste your HTML code here..."
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Simplified Security Info Helper */}
              <div className="customHtmlSecurityCard">
                <div className="customHtmlSecurityHeader">
                  <div className="customHtmlSecurityBadge">
                    <ShieldCheck size={14} />
                    <span>Secure HTML mode</span>
                  </div>
                  <button
                    type="button"
                    className="customHtmlSecurityToggle"
                    onClick={() => setShowSecurityInfo(!showSecurityInfo)}
                  >
                    <span>Learn about Secure HTML</span>
                    {showSecurityInfo ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>
                <div className="customHtmlSecurityNotice">
                  <Info size={14} style={{ flexShrink: 0 }} />
                  <span>Unsafe scripts and embeds are automatically removed.</span>
                </div>
                {showSecurityInfo && (
                  <div className="customHtmlSecurityContent">
                    <p>
                      To protect your workspace domain and ensure safety for all visitors, custom HTML runs inside a sandboxed environment.
                    </p>
                    <ul>
                      <li>Scripts and active event handlers are safely removed.</li>
                      <li>CSS styling, custom fonts, images, and responsive layouts are fully preserved.</li>
                      <li>Relative links and image paths in uploaded ZIP templates are automatically bundled.</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Sanitization warnings (if any) */}
              {page.customHtml?.warnings && page.customHtml.warnings.length > 0 && (
                <div className="customHtmlAlert customHtmlAlertWarning">
                  <Info size={18} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Sanitization Notices</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
                      {page.customHtml.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Version History Section */}
              <div className="customHtmlCard">
                <div className="customHtmlSectionHeader">
                  <div>
                    <h3 className="customHtmlSectionTitle">Version History</h3>
                    <p className="customHtmlSectionSubtitle">Saved snapshots and rollback points</p>
                  </div>
                  {versions.length > 0 && (
                    <span className="customHtmlVersionCount">{versions.length} versions</span>
                  )}
                </div>

                {versions.length === 0 ? (
                  <div className="customHtmlEmptyVersions">
                    <Clock size={20} className="customHtmlEmptyVersionsIcon" />
                    <div>
                      <strong>No versions yet</strong>
                      <p>Your saved and published versions will appear here.</p>
                    </div>
                  </div>
                ) : (
                  <div className="customHtmlVersionsList">
                    {versions
                      .slice()
                      .reverse()
                      .map((version) => (
                        <div className="customHtmlVersionCard" key={version.version}>
                          <div className="customHtmlVersionInfo">
                            <div className="customHtmlVersionHeaderRow">
                              <span className="customHtmlVersionName">Version {version.version}</span>
                              {version.publishedAt ? (
                                <span className="customHtmlVersionTagPublished">Published</span>
                              ) : (
                                <span className="customHtmlVersionTagDraft">Draft</span>
                              )}
                            </div>
                            <span className="customHtmlVersionTime">{formatVersionDate(version.createdAt)}</span>
                          </div>
                          <div className="customHtmlVersionActions">
                            <button
                              type="button"
                              className="customHtmlVersionBtn"
                              onClick={() => {
                                setDebouncedHtml(version.sanitizedHtml || version.sourceHtml);
                                setPreviewingVersion(version.version);
                              }}
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              className="customHtmlVersionBtn customHtmlVersionBtnPrimary"
                              onClick={() => void save(false, version.version)}
                            >
                              Restore
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Live Preview Panel */}
            <div className="customHtmlPreviewPane">
              <div className="customHtmlPreviewToolbar">
                <div className="customHtmlPreviewToolbarLeft">
                  <Layout size={15} />
                  <span>Live Preview</span>
                  {previewingVersion !== null && (
                    <span className="customHtmlPreviewVersionTag">
                      Viewing Version {previewingVersion}
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewingVersion(null);
                          setDebouncedHtml(sourceHtml);
                        }}
                      >
                        Reset
                      </button>
                    </span>
                  )}
                </div>

                <div className="customHtmlPreviewToolbarRight">
                  <div className="customHtmlDeviceControls">
                    <button
                      type="button"
                      className={preview === "desktop" ? "active" : ""}
                      onClick={() => setPreview("desktop")}
                      title="Desktop view (full width)"
                    >
                      <Monitor size={13} />
                      <span>Desktop</span>
                    </button>
                    <button
                      type="button"
                      className={preview === "tablet" ? "active" : ""}
                      onClick={() => setPreview("tablet")}
                      title="Tablet view (768px)"
                    >
                      <Tablet size={13} />
                      <span>Tablet</span>
                    </button>
                    <button
                      type="button"
                      className={preview === "mobile" ? "active" : ""}
                      onClick={() => setPreview("mobile")}
                      title="Mobile view (390px)"
                    >
                      <Smartphone size={13} />
                      <span>Mobile</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    className="customHtmlRefreshBtn"
                    title="Refresh preview"
                    onClick={() => setPreviewKey((k) => k + 1)}
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>

              <div className="customHtmlViewportContainer">
                {!debouncedHtml?.trim() ? (
                  <div className="customHtmlEmptyPreview">
                    <div className="customHtmlEmptyPreviewIcon">
                      <Eye size={26} />
                    </div>
                    <strong>No preview yet</strong>
                    <p>Upload a landing page or paste HTML to see it here.</p>
                  </div>
                ) : (
                  <div className={`customHtmlFrameWrapper customHtmlFrameWrapper-${preview}`}>
                    <iframe
                      key={previewKey}
                      title="Live landing page preview"
                      sandbox=""
                      srcDoc={debouncedHtml}
                      className="customHtmlFrame"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
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

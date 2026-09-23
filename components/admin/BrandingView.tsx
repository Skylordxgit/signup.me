"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Check, Layout, LogIn, RotateCcw, Save } from "lucide-react";
import { Button, Dialog, Field, LoadingState, PageHeader, SectionHeading } from "./AdminUI";
import { ImageUploader } from "../ImageUploader";
import { adminApi } from "@/lib/admin";
import type { WorkspaceBranding, WorkspaceBrandingInput } from "@/lib/workspaceBrandingConstants";
import { defaultWorkspaceBranding } from "@/lib/workspaceBrandingConstants";

export function BrandingView({
  workspaceName = "My Workspace",
  onUpdated,
}: {
  workspaceName?: string;
  onUpdated?: (branding: WorkspaceBranding) => void;
}) {
  const [branding, setBranding] = useState<WorkspaceBranding>(() => defaultWorkspaceBranding("default", workspaceName));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [previewTab, setPreviewTab] = useState<"site" | "login">("site");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    adminApi<WorkspaceBranding>("/api/admin/branding", { signal: controller.signal })
      .then(data => {
        if (!cancelled && data) {
          setBranding(data);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load branding");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const update = (patch: WorkspaceBrandingInput) => {
    setBranding(current => ({ ...current, ...patch }));
  };

  async function handleSave(event?: React.FormEvent) {
    if (event) event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSavedNotice(false);
    try {
      const saved = await adminApi<WorkspaceBranding>("/api/admin/branding", {
        method: "PUT",
        body: JSON.stringify(branding),
      });
      setBranding(saved);
      setSavedNotice(true);
      onUpdated?.(saved);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setError("");
    setResetConfirm(false);
    try {
      const reset = await adminApi<WorkspaceBranding>("/api/admin/branding", {
        method: "DELETE",
      });
      setBranding(reset);
      setSavedNotice(true);
      onUpdated?.(reset);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset branding");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading workspace branding..." />;
  }

  return (
    <div className="admBrandingView">
      <PageHeader
        title="Branding"
        description="Customize your workspace identity, logos, brand colors, and login page."
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Button
            variant="secondary"
            icon={RotateCcw}
            disabled={saving}
            onClick={() => setResetConfirm(true)}
          >
            Reset
          </Button>
          <Button
            variant="primary"
            icon={Save}
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving..." : "Save Branding"}
          </Button>
        </div>
      </PageHeader>

      {savedNotice && (
        <div className="admNotice" role="status" style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "var(--c-accent-soft)", color: "var(--c-accent)", borderRadius: "var(--radius-md)" }}>
          <Check size={16} />
          <span>Workspace branding saved successfully! Changes apply to all workspace pages.</span>
        </div>
      )}

      {error && <p className="admError" role="alert">{error}</p>}

      <div className="admBrandingLayout">
        {/* Left column: Form Controls */}
        <div className="admBrandingForms">
          {/* Identity Section */}
          <section className="admFormSection">
            <h3>Workspace Identity</h3>
            <p style={{ fontSize: "13px", color: "var(--c-muted)", margin: "4px 0 16px" }}>
              These brand assets represent your workspace across headers, favicons, and browser tabs.
            </p>
            <div className="admFormGrid">
              <Field label="Workspace Name">
                <input
                  value={branding.workspaceName}
                  onChange={e => update({ workspaceName: e.target.value })}
                  placeholder="e.g. Acme Corp"
                  maxLength={120}
                />
              </Field>
              <Field label="Site Title">
                <input
                  value={branding.siteTitle}
                  onChange={e => update({ siteTitle: e.target.value })}
                  placeholder="e.g. Acme Corp - Official Bio Links"
                  maxLength={200}
                />
              </Field>
              <div className="admSpanFull">
                <Field label="Meta Description">
                  <textarea
                    rows={2}
                    value={branding.metaDescription}
                    onChange={e => update({ metaDescription: e.target.value })}
                    placeholder="Brief description for search engines and link shares"
                    maxLength={500}
                  />
                </Field>
              </div>
              <div className="admSpanFull">
                <ImageUploader
                  category="logo"
                  label="Workspace Logo"
                  value={branding.logoUrl}
                  onChange={logoUrl => update({ logoUrl })}
                />
              </div>
              <div className="admSpanFull">
                <ImageUploader
                  category="favicon"
                  label="Browser Favicon (.ico or .png)"
                  value={branding.faviconUrl}
                  onChange={faviconUrl => update({ faviconUrl })}
                />
              </div>
            </div>
          </section>

          {/* Color Palette Section */}
          <section className="admFormSection">
            <h3>Brand Colors</h3>
            <p style={{ fontSize: "13px", color: "var(--c-muted)", margin: "4px 0 16px" }}>
              Define primary and accent colors inherited by pages and buttons in this workspace.
            </p>
            <div className="admFormGrid">
              <Field label="Primary Brand Color">
                <span className="admColor">
                  <input
                    type="color"
                    value={branding.primaryColor}
                    onChange={e => update({ primaryColor: e.target.value })}
                  />
                  <code>{branding.primaryColor}</code>
                </span>
              </Field>
              <Field label="Secondary / Accent Color">
                <span className="admColor">
                  <input
                    type="color"
                    value={branding.secondaryColor}
                    onChange={e => update({ secondaryColor: e.target.value })}
                  />
                  <code>{branding.secondaryColor}</code>
                </span>
              </Field>
              <Field label="Default Button Color">
                <span className="admColor">
                  <input
                    type="color"
                    value={branding.buttonColor}
                    onChange={e => update({ buttonColor: e.target.value })}
                  />
                  <code>{branding.buttonColor}</code>
                </span>
              </Field>
              <Field label="Default Link Color">
                <span className="admColor">
                  <input
                    type="color"
                    value={branding.linkColor}
                    onChange={e => update({ linkColor: e.target.value })}
                  />
                  <code>{branding.linkColor}</code>
                </span>
              </Field>
            </div>
          </section>

          {/* Login Page Customization */}
          <section className="admFormSection">
            <h3>Workspace Login Page</h3>
            <p style={{ fontSize: "13px", color: "var(--c-muted)", margin: "4px 0 16px" }}>
              Customize the login screen displayed when accessing your custom domain or workspace.
            </p>
            <div className="admFormGrid">
              <Field label="Login Page Title">
                <input
                  value={branding.loginTitle}
                  onChange={e => update({ loginTitle: e.target.value })}
                  placeholder="Sign in to your account"
                  maxLength={160}
                />
              </Field>
              <Field label="Login Page Subtitle">
                <input
                  value={branding.loginSubtitle}
                  onChange={e => update({ loginSubtitle: e.target.value })}
                  placeholder="Enter your email and password"
                  maxLength={300}
                />
              </Field>
              <div className="admSpanFull">
                <ImageUploader
                  category="logo"
                  label="Login Page Logo (Optional)"
                  value={branding.loginLogoUrl}
                  onChange={loginLogoUrl => update({ loginLogoUrl })}
                />
              </div>
              <div className="admSpanFull">
                <ImageUploader
                  category="banner"
                  label="Login Page Background Image (Optional)"
                  value={branding.loginBackgroundUrl}
                  onChange={loginBackgroundUrl => update({ loginBackgroundUrl })}
                />
              </div>
            </div>
          </section>

          {/* Footer Text */}
          <section className="admFormSection">
            <h3>Default Footer</h3>
            <Field label="Custom Footer Text (Optional)">
              <input
                value={branding.footerText}
                onChange={e => update({ footerText: e.target.value })}
                placeholder="e.g. © 2026 Acme Corp. All rights reserved."
                maxLength={400}
              />
            </Field>
          </section>
        </div>

        {/* Right column: Interactive Live Preview */}
        <aside className="admBrandingPreviewPanel">
          <SectionHeading title="Live Preview">
            <div className="admBrandingPreviewSwitch">
              <button
                type="button"
                className={previewTab === "site" ? "active" : ""}
                onClick={() => setPreviewTab("site")}
              >
                <Layout size={14} />
                <span>Page</span>
              </button>
              <button
                type="button"
                className={previewTab === "login" ? "active" : ""}
                onClick={() => setPreviewTab("login")}
              >
                <LogIn size={14} />
                <span>Login</span>
              </button>
            </div>
          </SectionHeading>

          {previewTab === "site" ? (
            <div className="admBrandingSiteCard">
              <div className="admBrandingBrowserBar">
                <span className="dot dot-red" />
                <span className="dot dot-yellow" />
                <span className="dot dot-green" />
                <span className="admBrandingBrowserTab">
                  {branding.faviconUrl && (
                    <img src={branding.faviconUrl} alt="" width={14} height={14} />
                  )}
                  <span>{branding.siteTitle || branding.workspaceName}</span>
                </span>
              </div>

              <div className="admBrandingPageBody">
                <div className="admBrandingPageHeader">
                  {branding.logoUrl && (
                    <img
                      src={branding.logoUrl}
                      alt="Logo"
                      className="admBrandingPageLogo"
                      width={52}
                      height={52}
                    />
                  )}
                  <h4>{branding.workspaceName}</h4>
                  <p>{branding.metaDescription || "Official portal & bio links"}</p>
                </div>

                <div className="admBrandingButtonSample" style={{ background: branding.buttonColor, color: "#fff" }}>
                  <span>Sample Button</span>
                </div>
                <div
                  className="admBrandingButtonSample"
                  style={{
                    background: "transparent",
                    border: `2px solid ${branding.primaryColor}`,
                    color: branding.primaryColor,
                  }}
                >
                  <span>Outline Button</span>
                </div>

                {branding.footerText && (
                  <div className="admBrandingFooterSample">
                    {branding.footerText}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className="admBrandingLoginCard"
              style={{
                backgroundImage: branding.loginBackgroundUrl ? `url(${branding.loginBackgroundUrl})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="admBrandingLoginBox">
                <div className="admBrandingLoginLogoWrap">
                  <img
                    src={branding.loginLogoUrl || branding.logoUrl || "/signup888-logo.png"}
                    alt=""
                    width={36}
                    height={36}
                  />
                  <strong>{branding.workspaceName}</strong>
                </div>
                <h3>{branding.loginTitle || "Sign in"}</h3>
                <p>{branding.loginSubtitle || "Enter your credentials"}</p>

                <div className="admBrandingLoginFormSim">
                  <div className="admBrandingInputSim">user@example.com</div>
                  <div className="admBrandingInputSim">••••••••••••</div>
                  <button
                    type="button"
                    className="admBrandingBtnSim"
                    style={{ background: branding.buttonColor || branding.primaryColor, color: "#fff" }}
                  >
                    Sign In
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {resetConfirm && (
        <Dialog title="Reset Workspace Branding?" onClose={() => setResetConfirm(false)}>
          <p style={{ margin: "10px 0 20px" }}>
            This will reset all logo, favicon, colors, and login page branding for <strong>{workspaceName}</strong> back to system defaults.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <Button onClick={() => setResetConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void handleReset()}>
              Confirm Reset
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

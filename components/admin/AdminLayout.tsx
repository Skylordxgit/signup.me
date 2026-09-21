"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  ImageIcon,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { AdminProvider, useAdmin } from "./AdminContext";
import { Button, Dialog, Field, IconButton } from "./AdminUI";
import { ImageUploader } from "../ImageUploader";
import { adminApi } from "@/lib/admin";
import { slugify, slugifyDraft } from "@/lib/utils";
import type { WorkspacePermission } from "@/lib/permissions";
import "./admin.css";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: "Overview" | "Content" | "Engagement" | "Workspace" | "Platform";
  permission?: WorkspacePermission;
  badge?: boolean;
};

const navigationItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, group: "Overview", permission: "pages" },
  { id: "pages", label: "Pages", href: "/admin/pages", icon: FileText, group: "Content", permission: "pages", badge: true },
  { id: "create", label: "Create Page", href: "/admin/pages/new", icon: Plus, group: "Content", permission: "pages" },
  { id: "media", label: "Media", href: "/admin/media", icon: ImageIcon, group: "Content", permission: "media" },
  { id: "themes", label: "Themes", href: "/admin/themes", icon: Palette, group: "Content", permission: "pages" },
  { id: "notifications", label: "Notifications", href: "/admin/notifications", icon: Bell, group: "Engagement", permission: "notifications" },
  { id: "branding", label: "Branding", href: "/admin/branding", icon: Sparkles, group: "Workspace", permission: "pages" },
  { id: "users", label: "Team", href: "/admin/users", icon: Users, group: "Workspace", permission: "team" },
  { id: "settings", label: "Settings", href: "/admin/settings", icon: Settings, group: "Workspace" },
];

const navigationGroups = ["Overview", "Content", "Engagement", "Workspace"] as const;

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.id === "dashboard") {
    return (
      pathname === "/admin/dashboard" ||
      pathname === "/admin/analytics" ||
      pathname === "/workspace/dashboard" ||
      pathname === "/workspace/analytics" ||
      pathname === "/admin" ||
      pathname === "/workspace"
    );
  }
  if (item.id === "create") {
    return pathname === "/admin/pages/new" || pathname === "/admin/create" || pathname === "/workspace/pages/new";
  }
  if (item.id === "pages") {
    return (
      (pathname.startsWith("/admin/pages") && pathname !== "/admin/pages/new") ||
      (pathname.startsWith("/workspace/pages") && pathname !== "/workspace/pages/new")
    );
  }
  if (item.id === "media") {
    return pathname.startsWith("/admin/media") || pathname.startsWith("/workspace/media");
  }
  if (item.id === "themes") {
    return pathname.startsWith("/admin/themes") || pathname.startsWith("/workspace/themes");
  }
  if (item.id === "notifications") {
    return pathname.startsWith("/admin/notifications") || pathname.startsWith("/workspace/notifications");
  }
  if (item.id === "branding") {
    return pathname.startsWith("/admin/branding") || pathname.startsWith("/workspace/branding");
  }
  if (item.id === "users") {
    return pathname.startsWith("/admin/users") || pathname.startsWith("/admin/team") || pathname.startsWith("/workspace/users");
  }
  if (item.id === "settings") {
    return pathname.startsWith("/admin/settings") || pathname.startsWith("/workspace/settings");
  }
  return pathname.startsWith(item.href);
}

export function getRouteInfo(pathname: string): { heading: string; isBuilder: boolean } {
  if (pathname.includes("/pages/") && pathname.endsWith("/edit")) {
    return { heading: "Page builder", isBuilder: true };
  }
  if (pathname === "/admin/pages/new" || pathname === "/admin/create" || pathname === "/workspace/pages/new") {
    return { heading: "Create Page", isBuilder: false };
  }
  if (pathname.startsWith("/admin/pages") || pathname.startsWith("/workspace/pages")) {
    return { heading: "Pages", isBuilder: false };
  }
  if (pathname.startsWith("/admin/dashboard") || pathname.startsWith("/workspace/dashboard") || pathname === "/admin" || pathname === "/workspace") {
    return { heading: "Dashboard", isBuilder: false };
  }
  if (pathname.startsWith("/admin/analytics") || pathname.startsWith("/workspace/analytics")) {
    return { heading: "Analytics", isBuilder: false };
  }
  if (pathname.startsWith("/admin/media") || pathname.startsWith("/workspace/media")) {
    return { heading: "Media", isBuilder: false };
  }
  if (pathname.startsWith("/admin/themes") || pathname.startsWith("/workspace/themes")) {
    return { heading: "Themes", isBuilder: false };
  }
  if (pathname.startsWith("/admin/notifications") || pathname.startsWith("/workspace/notifications")) {
    return { heading: "Notifications", isBuilder: false };
  }
  if (pathname.startsWith("/admin/branding") || pathname.startsWith("/workspace/branding")) {
    return { heading: "Branding", isBuilder: false };
  }
  if (pathname.startsWith("/admin/users") || pathname.startsWith("/admin/team") || pathname.startsWith("/workspace/users")) {
    return { heading: "Team", isBuilder: false };
  }
  if (pathname.startsWith("/admin/settings") || pathname.startsWith("/workspace/settings")) {
    return { heading: "Settings", isBuilder: false };
  }
  if (pathname.startsWith("/admin/workspaces")) {
    return { heading: "Workspaces", isBuilder: false };
  }
  if (pathname.startsWith("/admin/domains")) {
    return { heading: "Custom Domains", isBuilder: false };
  }
  if (pathname.startsWith("/admin/master")) {
    return { heading: "Master Admin", isBuilder: false };
  }
  return { heading: "Dashboard", isBuilder: false };
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const rawPathname = usePathname();
  const pathname = rawPathname || "/admin/dashboard";
  const {
    account,
    branding,
    pages,
    loading,
    busy,
    error,
    setError,
    query,
    setQuery,
    collapsed,
    collapse,
    drawerOpen,
    setDrawerOpen,
    deleteTarget,
    setDeleteTarget,
    deletePage,
    importOpen,
    setImportOpen,
    setImportNotice,
    refreshPages,
    navigate,
    logout,
    activeEditor,
    allowedView,
  } = useAdmin();

  const accountMenu = useRef<HTMLDetailsElement>(null);
  const routeInfo = getRouteInfo(pathname);
  const heading = routeInfo.heading;
  const isBuilder = routeInfo.isBuilder;

  const visibleNav = navigationItems.filter((item) => allowedView(item.permission));

  function renderSidebar(drawer = false) {
    return (
      <>
        <div className="admBrand">
          <Image className="admBrandLogo" src={branding.logo} alt="" width={30} height={30} priority unoptimized />
          <strong>{branding.name}</strong>
          {drawer && <IconButton icon={X} label="Close navigation" onClick={() => setDrawerOpen(false)} />}
        </div>
        <nav aria-label={drawer ? "Mobile admin navigation" : "Admin navigation"}>
          {navigationGroups.map((group) => {
            const items = visibleNav.filter((item) => item.group === group);
            if (!items.length) return null;
            return (
              <div className="admNavGroup" key={group}>
                <p className="admNavLabel">{group}</p>
                {items.map((item) => {
                  const active = isNavActive(item, pathname);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={active ? "admNavActive" : ""}
                      aria-current={active ? "page" : undefined}
                      title={item.label}
                      aria-label={item.label}
                      disabled={busy}
                      onClick={() => void navigate(item.href)}
                    >
                      <item.icon size={18} aria-hidden="true" />
                      <span>{item.label}</span>
                      {item.badge && <small>{pages.length}</small>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="admSidebarBottom">
          <button type="button" title="Log out" aria-label="Log out" disabled={busy} onClick={() => void logout()}>
            <LogOut size={18} aria-hidden="true" />
            <span>Logout</span>
          </button>
          {!drawer && (
            <button
              type="button"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => collapse(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
              <span>Collapse sidebar</span>
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="admShell" data-collapsed={collapsed}>
      <aside className="admSidebar">{renderSidebar()}</aside>
      <div className="admWorkspace">
        <header className="admTopbar">
          <div className="admTopbarTitle">
            <IconButton icon={Menu} label="Open navigation" className="admMenuButton" onClick={() => setDrawerOpen(true)} />
            <div>
              <p className="admBreadcrumb">
                {account?.workspaceName || "Workspace"}
                <ChevronRight size={12} aria-hidden="true" />
                {heading}
              </p>
              <h1>{heading}</h1>
            </div>
          </div>
          <form
            className="admHeaderSearch admSearchField"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              void navigate("/admin/pages");
            }}
          >
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search pages"
              placeholder="Search pages..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>
          <div className="admHeaderActions">
            {account?.isMaster && (
              <Link className="admButton" href="/admin/master">
                <ArrowLeft size={16} aria-hidden="true" />
                <span>All workspaces</span>
              </Link>
            )}
            {isBuilder && activeEditor?.page && (
              <>
                <span
                  className={"admSaveStatus " + (activeEditor.status === "Save failed" ? "admDanger" : "")}
                  role="status"
                >
                  {activeEditor.status === "Saving" ? (
                    <Loader2 className="admSpinner" size={15} aria-hidden="true" />
                  ) : activeEditor.status === "Saved" ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <span className="admUnsavedDot" aria-hidden="true" />
                  )}
                  {activeEditor.status}
                </span>
                <a
                  className="admButton"
                  aria-label="Preview public page"
                  title="Preview public page"
                  href={"/" + activeEditor.page.slug}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ArrowUpRight size={16} aria-hidden="true" />
                  <span>Preview</span>
                </a>
                <button
                  type="button"
                  className="admButton admPrimary"
                  aria-label="Save page"
                  title="Save page"
                  disabled={busy || activeEditor.status === "Saving"}
                  onClick={() => void activeEditor.save()}
                >
                  <Save size={16} aria-hidden="true" />
                  <span>Save</span>
                </button>
              </>
            )}
            <span className="admHeaderDivider" aria-hidden="true" />
            <details className="admAccount" ref={accountMenu}>
              <summary aria-label="Admin account menu" title="Admin account menu">
                <span className="admAvatar">
                  <User size={16} aria-hidden="true" />
                </span>
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div>
                <strong>
                  {account?.isMaster ? "Master admin" : account?.role === "member" ? "Workspace member" : "Workspace admin"}
                </strong>
                <small>{account?.email}</small>
                <small>{account?.workspaceName}</small>
                <button
                  type="button"
                  onClick={() => {
                    if (accountMenu.current) accountMenu.current.open = false;
                    void navigate("/admin/settings");
                  }}
                >
                  <Settings size={16} aria-hidden="true" />
                  Settings
                </button>
                <button type="button" disabled={busy} onClick={() => void logout()}>
                  <LogOut size={16} aria-hidden="true" />
                  Log out
                </button>
              </div>
            </details>
          </div>
        </header>

        <main
          className={"admMain " + (isBuilder ? "admMainBuilder" : "")}
          aria-busy={busy || loading}
          inert={busy || undefined}
        >
          {(error || activeEditor?.error) && (
            <div className="admError" role="alert">
              <span>{error || activeEditor?.error}</span>
              <IconButton
                icon={X}
                label="Dismiss error"
                onClick={() => {
                  setError("");
                  activeEditor?.clearError();
                }}
              />
            </div>
          )}
          {children}
        </main>
      </div>

      {drawerOpen && (
        <Dialog title="Navigation" onClose={() => setDrawerOpen(false)}>
          <div className="admDrawer">{renderSidebar(true)}</div>
        </Dialog>
      )}

      {importOpen && (
        <ImportPagesDialog
          onClose={() => setImportOpen(false)}
          onImported={async (summary) => {
            setImportOpen(false);
            setImportNotice(summary);
            await refreshPages();
            void navigate("/admin/pages");
          }}
        />
      )}

      {deleteTarget && (
        <Dialog title="Delete page" onClose={() => setDeleteTarget(null)}>
          <p>
            Delete <strong>{deleteTarget.name}</strong> and all of its content? This cannot be undone.
          </p>
          <div className="admDialogActions">
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              icon={Trash2}
              disabled={busy}
              onClick={() => void deletePage(deleteTarget.id)}
            >
              Delete page
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}

type ImportedPageSummary = {
  id: number;
  name: string;
  slug: string;
  originalSlug: string;
  status: string;
  renamed: boolean;
};
type ImportResult = { pages: ImportedPageSummary[]; media: number; warnings: string[] };

export function ImportPagesDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (summary: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [keepStatus, setKeepStatus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        throw new Error("That file is not valid JSON. Choose an export produced by Export selected.");
      }
      setResult(
        await adminApi<ImportResult>("/api/pages/import", {
          method: "POST",
          body: JSON.stringify({ file: parsed, keepStatus }),
        })
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import that file.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const summary = `Imported ${result.pages.length} page${result.pages.length === 1 ? "" : "s"}${
      result.media ? ` and ${result.media} image${result.media === 1 ? "" : "s"}` : ""
    }.`;
    return (
      <Dialog title="Import complete" onClose={onClose}>
        <div className="admFormStack">
          <p className="admSuccess" role="status">
            {summary}
          </p>
          <ul className="admImportList">
            {result.pages.map((page) => (
              <li key={page.id}>
                <strong>{page.name}</strong>
                <small>
                  /{page.slug}
                  {page.renamed && ` (renamed from /${page.originalSlug})`} &middot; {page.status}
                </small>
              </li>
            ))}
          </ul>
          {result.warnings.length > 0 && (
            <details className="admFormSection">
              <summary>
                {result.warnings.length} item{result.warnings.length === 1 ? "" : "s"} skipped
              </summary>
              <ul className="admImportList">
                {result.warnings.map((warning, index) => (
                  <li key={index}>
                    <small>{warning}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="admDialogActions">
          <Button variant="primary" icon={Check} onClick={() => void onImported(summary)}>
            Done
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Import pages"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="admTeamFields">
          <div className="admFormStack">
            <p className="admMuted">
              Choose a file created by Export selected. The pages, their blocks, and their images are recreated in this workspace with new addresses. Nothing existing is changed.
            </p>
            <Field label="Export file">
              <input
                type="file"
                accept="application/json,.json"
                required
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError("");
                }}
              />
            </Field>
            <label className="admCheck">
              <input type="checkbox" checked={keepStatus} onChange={(event) => setKeepStatus(event.target.checked)} />
              Keep the original published status
            </label>
            {!keepStatus && (
              <p className="admHelper">Imported pages arrive as drafts so you can review them before they go live.</p>
            )}
            {error && (
              <p className="admError" role="alert">
                {error}
              </p>
            )}
          </div>
        </fieldset>
        <div className="admDialogActions">
          <button type="button" className="admButton" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="admButton admPrimary" disabled={!file || busy}>
            {busy ? (
              <>
                <Loader2 className="admSpinner" size={16} aria-hidden="true" />
                Importing...
              </>
            ) : (
              <>
                <Upload size={16} aria-hidden="true" />
                Import pages
              </>
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function CreatePageForm({
  busy,
  initialSlug = "",
  onCreate,
}: {
  busy: boolean;
  initialSlug?: string;
  onCreate: (input: { name: string; slug: string; title: string; bio: string; profileImage: string }) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState(initialSlug);
  const [customSlug, setCustomSlug] = useState(Boolean(initialSlug));
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [uploading, setUploading] = useState(false);

  return (
    <>
      <div className="admPageHeading">
        <div>
          <h2>Create a page</h2>
          <p>{initialSlug ? <>Start building at <strong>/{initialSlug}</strong>.</> : "A new home for your profile and links."}</p>
        </div>
      </div>
      <form
        className="admCreateForm admCard"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({ name, slug: slugify(slug), title: title || name, bio, profileImage });
        }}
      >
        <div className="admFormGrid">
          <Field label="Page name">
            <input
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!customSlug) setSlug(slugifyDraft(event.target.value));
              }}
            />
          </Field>
          <Field label="URL slug" hint="Lowercase letters, numbers and single hyphens.">
            <input
              required
              pattern="[a-z][a-z0-9]*(?:-[a-z0-9]+)*"
              title="Start with a letter; use lowercase letters, numbers, and single hyphens."
              value={slug}
              onChange={(event) => {
                setCustomSlug(true);
                setSlug(slugifyDraft(event.target.value));
              }}
              onBlur={() => setSlug(slugify(slug))}
            />
          </Field>
          <div className="admSpanFull">
            <Field label="Profile title">
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={name} />
            </Field>
          </div>
          <div className="admSpanFull">
            <Field label="Bio">
              <textarea rows={4} value={bio} onChange={(event) => setBio(event.target.value)} />
            </Field>
          </div>
          <div className="admSpanFull">
            <ImageUploader
              category="profile"
              label="Profile photo"
              round
              value={profileImage}
              onChange={setProfileImage}
              onBusyChange={setUploading}
            />
          </div>
        </div>
        <div className="admFormFooter">
          <button
            type="submit"
            className="admButton admPrimary"
            disabled={busy || uploading || !name.trim() || !slug}
          >
            {busy ? <Loader2 className="admSpinner" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            Create page
          </button>
          <span className="admMuted">/{slug || "your-page"}</span>
        </div>
      </form>
    </>
  );
}

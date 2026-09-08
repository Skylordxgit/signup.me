"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bell,
  Blocks,
  Check,
  ChevronRight,
  Circle,
  CircleHelp,
  CircleOff,
  ClipboardCopy,
  CopyPlus,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  FormInput,
  GalleryVerticalEnd,
  Globe2,
  Heart,
  ImageIcon,
  LayoutPanelTop,
  Link2,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Music2,
  MoveDown,
  MoveUp,
  Package,
  Paintbrush,
  Palette,
  Pencil,
  Phone,
  Play,
  Plus,
  QrCode,
  Send,
  Settings,
  Share2,
  ShoppingBag,
  Smile,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Type,
  User,
  UsersRound,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { PublicPage } from "@/components/PublicPage";
import type {
  AnalyticsReport,
  BlockType,
  PageBlock,
  PageSummary,
  ProfileAlignment,
  ProfileLayout,
  SmartPage,
} from "@/lib/types";
import { blockTypes, parseBlockIcon, publicPageUrl, readableTextColor, slugify, themePresets } from "@/lib/utils";
import { applyThemeDefinition, resolveAlignment, resolveLayout, themeDefinition, themeLibrary } from "@/lib/themes";
import { PhoneFrame } from "./PhoneFrame";
import { PageRenderer } from "./PageRenderer";
import { ImageUploader } from "./ImageUploader";

type EditorTab = "content" | "blocks" | "design" | "seo" | "integrations" | "analytics";
type AdminMode = "list" | "detail" | "editor";

export function AdminDashboard() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [activePage, setActivePage] = useState<SmartPage | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsReport | null>(null);
  const [tab, setTab] = useState<EditorTab>("content");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Saved");
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [adminMode, setAdminMode] = useState<AdminMode>("list");
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [websiteSettingsOpen, setWebsiteSettingsOpen] = useState(false);
  const [decorationOpen, setDecorationOpen] = useState(false);
  const [addLinkFlowOpen, setAddLinkFlowOpen] = useState(false);
  const [profileEditorRequested, setProfileEditorRequested] = useState(false);
  const [hasSelectedBlock, setHasSelectedBlock] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [pendingPagePatch, setPendingPagePatch] = useState<Partial<SmartPage> | null>(null);
  const [pendingBlockPatches, setPendingBlockPatches] = useState<Record<number, Partial<PageBlock>>>({});

  const filteredPages = useMemo(
    () => pages.filter((page) => `${page.name} ${page.slug}`.toLowerCase().includes(query.toLowerCase())),
    [pages, query],
  );

  async function api<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data as T;
  }

  async function refreshPages() {
    const items = await api<PageSummary[]>("/api/pages");
    setPages(items);
  }

  async function loadPage(id: number, mode: AdminMode = "detail") {
    const page = await api<SmartPage>(`/api/pages/${id}`);
    setActivePage(page);
    setPendingPagePatch(null);
    setPendingBlockPatches({});
    setHasSelectedBlock(false);
    setTab("content");
    setAdminMode(mode);
    void loadAnalytics(id);
  }

  async function loadAnalytics(id = activePage?.id) {
    if (!id) return;
    setAnalytics(await api<AnalyticsReport>(`/api/pages/${id}/analytics`));
  }

  function publicUrl(slug: string) {
    return publicPageUrl(slug);
  }

  function publicHost(slug: string) {
    try {
      const url = new URL(publicUrl(slug));
      return `${url.host}${url.pathname}`;
    } catch {
      return `/${slug}`;
    }
  }

  function editPage(patch: Partial<SmartPage>) {
    if (!activePage) return;
    const nextPage = { ...activePage, ...patch };
    setActivePage(nextPage);
    setPendingPagePatch((current) => ({ ...(current ?? {}), ...patch }));
    setStatus("Unsaved changes");
  }

  async function savePageNow(patch: Partial<SmartPage>) {
    if (!activePage) return;
    setStatus("Saving");
    const page = await api<SmartPage>(`/api/pages/${activePage.id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    setActivePage(page);
    setPendingPagePatch(null);
    setStatus("Saved");
    await refreshPages();
  }

  async function createPage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const page = await api<SmartPage>("/api/pages", {
      method: "POST",
      body: JSON.stringify({
        name: String(form.get("name") || ""),
        slug: String(form.get("slug") || ""),
        title: String(form.get("title") || ""),
        bio: String(form.get("bio") || ""),
        profileImage: String(form.get("profileImage") || ""),
      }),
    });
    setNewPageOpen(false);
    setActivePage(page);
    setAdminMode("editor");
    setOnboardingOpen(true);
    await refreshPages();
  }

  async function createInstantPage() {
    const page = await api<SmartPage>("/api/pages", {
      method: "POST",
      body: JSON.stringify({
        name: "Untitled Website",
        slug: `untitled-${Date.now()}`,
        title: "Untitled Website",
        bio: "",
        profileImage: "",
      }),
    });
    setActivePage(page);
    setAdminMode("editor");
    setOnboardingOpen(true);
    await refreshPages();
  }

  async function addBlock(type: BlockType, patch: Partial<PageBlock> = {}) {
    if (!activePage) return;
    const block = await api<PageBlock>(`/api/pages/${activePage.id}/blocks`, {
      method: "POST",
      body: JSON.stringify({ type }),
    });
    if (Object.keys(patch).length) {
      await api<PageBlock>(`/api/blocks/${block.id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
    }
    setBlockPickerOpen(false);
    await loadPage(activePage.id, adminMode);
    setTab("blocks");
  }

  function editBlock(blockId: number, patch: Partial<PageBlock>) {
    if (!activePage) return;
    setActivePage({
      ...activePage,
      blocks: activePage.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
    });
    setPendingBlockPatches((current) => ({
      ...current,
      [blockId]: { ...(current[blockId] ?? {}), ...patch },
    }));
    setStatus("Unsaved changes");
  }

  async function updateBlockNow(blockId: number, patch: Partial<PageBlock>) {
    if (!activePage) return;
    setStatus("Saving");
    await api<PageBlock>(`/api/blocks/${blockId}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    setPendingBlockPatches((current) => {
      const next = { ...current };
      delete next[blockId];
      return next;
    });
    setStatus("Saved");
    await loadPage(activePage.id, adminMode);
  }

  async function removeBlock(blockId: number) {
    if (!activePage) return;
    await api<{ ok: true }>(`/api/blocks/${blockId}`, { method: "DELETE" });
    await loadPage(activePage.id, adminMode);
  }

  async function duplicateBlock(blockId: number) {
    if (!activePage) return;
    await api<PageBlock>(`/api/blocks/${blockId}`, {
      method: "POST",
      body: JSON.stringify({ action: "duplicate" }),
    });
    await loadPage(activePage.id, adminMode);
  }

  async function moveBlock(blockId: number, direction: -1 | 1) {
    if (!activePage) return;
    const ids = activePage.blocks.map((block) => block.id);
    const index = ids.indexOf(blockId);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    const page = await api<SmartPage>("/api/blocks/reorder", {
      method: "POST",
      body: JSON.stringify({ pageId: activePage.id, blockIds: ids }),
    });
    setActivePage(page);
    await refreshPages();
  }

  async function duplicatePage(id: number) {
    const page = await api<SmartPage>(`/api/pages/${id}/duplicate`, { method: "POST" });
    setActivePage(page);
    setAdminMode("detail");
    await refreshPages();
  }

  async function deletePage(id: number) {
    await api<{ ok: true }>(`/api/pages/${id}`, { method: "DELETE" });
    setActivePage(null);
    setAdminMode("list");
    await refreshPages();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  useEffect(() => {
    window.setTimeout(() => {
      void refreshPages();
    }, 0);
    // Initial admin data load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activePage || !pendingPagePatch) return;
    const timer = window.setTimeout(async () => {
      setStatus("Saving");
      try {
        const page = await api<SmartPage>(`/api/pages/${activePage.id}`, {
          method: "PUT",
          body: JSON.stringify(pendingPagePatch),
        });
        setActivePage((current) => (current?.id === page.id ? { ...current, updatedAt: page.updatedAt } : current));
        setPendingPagePatch(null);
        await refreshPages();
        setStatus("Saved");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Save failed");
      }
    }, 650);
    return () => window.clearTimeout(timer);
    // Debounced autosave for page fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage?.id, pendingPagePatch]);

  useEffect(() => {
    if (!activePage || Object.keys(pendingBlockPatches).length === 0) return;
    const timer = window.setTimeout(async () => {
      setStatus("Saving");
      try {
        await Promise.all(
          Object.entries(pendingBlockPatches).map(([blockId, patch]) =>
            api<PageBlock>(`/api/blocks/${blockId}`, {
              method: "PUT",
              body: JSON.stringify(patch),
            }),
          ),
        );
        setPendingBlockPatches({});
        await refreshPages();
        setStatus("Saved");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Save failed");
      }
    }, 650);
    return () => window.clearTimeout(timer);
    // Debounced autosave for block fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage?.id, pendingBlockPatches]);

  useEffect(() => {
    if (status !== "Saved") return;
    const timer = window.setTimeout(() => {
      setStatus("Saved");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (!activePage || adminMode === "list") {
    return (
      <PhoneFrame
        label="My websites"
        overlays={settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} onLogout={logout} />}
      >
        <div className="upgradeBar">
            <button type="button" aria-label="Dismiss upgrade message">
              <X />
            </button>
            <strong>Manage all your public smart-link pages</strong>
            <span>Admin</span>
          </div>

          <header className="websiteTop">
            <div className="websiteLogo">
              <div className="handMark">SL</div>
              <strong>SmartLink</strong>
            </div>
            <button type="button" className="menuButton" aria-label="Open menu" onClick={() => setSettingsOpen(true)}>
              <Menu />
            </button>
          </header>

          <div className="websiteContent">
            <h1>My Websites</h1>

            <div className="websiteList">
              {filteredPages.map((page) => (
                <button type="button" className="websiteCard" key={page.id} onClick={() => loadPage(page.id)}>
                  <div>
                    <strong>{page.name}</strong>
                    <span>{publicHost(page.slug)}</span>
                  </div>
                  <ChevronRight aria-hidden="true" />
                </button>
              ))}
            </div>

            <button type="button" className="createWebsiteButton" onClick={() => void createInstantPage()}>
              <Plus /> Create new website
            </button>
          </div>
      </PhoneFrame>
    );
  }

  if (adminMode === "detail") {
    const detailActions: { label: string; icon: LucideIcon; tab: EditorTab }[] = [
      { label: "Edit", icon: Pencil, tab: "content" },
      { label: "Audience", icon: UsersRound, tab: "analytics" },
      { label: "Analytics", icon: BarChart3, tab: "analytics" },
      { label: "Requests", icon: MessageCircle, tab: "integrations" },
      { label: "Products", icon: Package, tab: "blocks" },
      { label: "Settings", icon: Settings, tab: "design" },
    ];

    return (
      <PhoneFrame label={activePage.name}>
        <div className="detailScreen">
          <header className="detailHeader">
            <button type="button" aria-label="Back to websites" onClick={() => setAdminMode("list")}>
              <ArrowLeft />
            </button>
            <h1>{activePage.name}</h1>
            <button type="button" className="outlinePill" onClick={() => savePageNow({ status: activePage.status === "published" ? "draft" : "published" })}>
              {activePage.status === "published" ? "Unpublish" : "Publish"}
            </button>
          </header>

          <div className="detailUrl">{publicHost(activePage.slug)}</div>

          <div className="quickActions">
            <button type="button" onClick={() => navigator.clipboard?.writeText(publicUrl(activePage.slug))}>
              <span><ClipboardCopy /></span>
              Copy Link
            </button>
            <a href={`https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(publicUrl(activePage.slug))}`}>
              <span><QrCode /></span>
              QR Code
            </a>
            <button
              type="button"
              onClick={() => {
                if (navigator.share) {
                  void navigator.share({ title: activePage.name, url: publicUrl(activePage.slug) });
                } else {
                  void navigator.clipboard?.writeText(publicUrl(activePage.slug));
                }
              }}
            >
              <span><Share2 /></span>
              Share
            </button>
          </div>

          <nav className="detailMenu" aria-label="Website sections">
            {detailActions.map((action) => (
              <button
                type="button"
                key={action.label}
                onClick={() => {
                  setTab(action.tab);
                  setAdminMode("editor");
                  if (action.tab === "analytics") void loadAnalytics();
                }}
              >
                <span><action.icon /></span>
                <strong>{action.label}</strong>
                <ChevronRight aria-hidden="true" />
              </button>
            ))}
          </nav>
        </div>
      </PhoneFrame>
    );
  }

  if (adminMode === "editor") {
    return (
      <PhoneFrame
        label={`${activePage.name} editor`}
        overlays={
          <>
            {blockPickerOpen && (
              <BlockPickerSheet
                onClose={() => setBlockPickerOpen(false)}
                onProfile={() => {
                  setBlockPickerOpen(false);
                  setProfileEditorRequested(true);
                }}
                onAddLink={() => {
                  setBlockPickerOpen(false);
                  setAddLinkFlowOpen(true);
                }}
                onSelect={addBlock}
              />
            )}

            {addLinkFlowOpen && (
              <AddLinkSheet
                onClose={() => setAddLinkFlowOpen(false)}
                onCreate={(patch) => {
                  setAddLinkFlowOpen(false);
                  void addBlock("link", patch);
                }}
              />
            )}

            {themeEditorOpen && (
              <ThemeEditorSheet
                page={activePage}
                onClose={() => setThemeEditorOpen(false)}
                onChange={(theme) => editPage({ theme })}
              />
            )}

            {websiteSettingsOpen && (
              <WebsiteSettingsSheet
                page={activePage}
                onClose={() => setWebsiteSettingsOpen(false)}
                onSave={(patch) => {
                  savePageNow(patch);
                  setWebsiteSettingsOpen(false);
                }}
              />
            )}

            {decorationOpen && (
              <PageDecorationSheet
                page={activePage}
                onClose={() => setDecorationOpen(false)}
                onChange={(theme) => editPage({ theme })}
              />
            )}

            {onboardingOpen && <EditorOnboarding onClose={() => setOnboardingOpen(false)} />}
          </>
        }
      >
        <div className="homepageEditor">
          <header className="homepageEditorTop">
            <button type="button" aria-label="Back to website menu" onClick={() => setAdminMode("detail")}>
              <ArrowLeft />
            </button>
            <h1>Homepage</h1>
            <button type="button" aria-label="Share public page" onClick={() => navigator.clipboard?.writeText(publicUrl(activePage.slug))}>
              <Share2 />
            </button>
          </header>

          <div className="homepageCanvas">
            <EditablePublicCanvas
              page={activePage}
              onDeleteBlock={removeBlock}
              onDuplicateBlock={duplicateBlock}
              onCommitBlock={updateBlockNow}
              onMoveBlock={moveBlock}
              onUpdateBlock={editBlock}
              onSaveProfile={savePageNow}
              profileEditorRequested={profileEditorRequested}
              onProfileEditorDismiss={() => setProfileEditorRequested(false)}
              onBlockSelectionChange={setHasSelectedBlock}
            />
          </div>

          {!hasSelectedBlock && (
            <nav className="editorDock" aria-label="Homepage tools">
              <button type="button" onClick={() => document.querySelector(".homepageCanvas")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <span><LayoutPanelTop /></span>
                Pages
              </button>
              <button type="button" onClick={() => setDecorationOpen(true)}>
                <span><Palette /></span>
                Style
              </button>
              <button type="button" className="addBlockDockButton" aria-label="Add a block" onClick={() => setBlockPickerOpen(true)}>
                <Plus />
              </button>
              <button type="button" onClick={() => window.open(publicUrl(activePage.slug), "_blank", "noopener,noreferrer")}>
                <span><Eye /></span>
                Preview
              </button>
              <button type="button" onClick={() => setWebsiteSettingsOpen(true)}>
                <span><Settings /></span>
                Settings
              </button>
            </nav>
          )}
        </div>
      </PhoneFrame>
    );
  }

  return (
    <main className="adminShell">
      <aside className="adminNav">
        <div className="adminBrand">
          <div className="brandMark">SL</div>
          <div>
            <strong>SmartLink</strong>
            <span>Admin Dashboard</span>
          </div>
        </div>
        {["Dashboard", "Pages", "Analytics", "Media", "Settings"].map((item) => (
          <button type="button" key={item} className={item === "Pages" ? "active" : ""}>
            {item}
          </button>
        ))}
        <button type="button" onClick={logout}>
          Logout
        </button>
      </aside>

      <section className="pageManager">
        <header className="dashboardHeader">
          <div>
            <p>Private workspace</p>
            <h1>Manage public smart-link pages</h1>
          </div>
          <button type="button" onClick={() => setAdminMode("detail")}>
            Website Menu
          </button>
        </header>

        <div className="dashboardGrid">
          <section className="pagesColumn">
            <input
              aria-label="Search pages"
              placeholder="Search pages"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            {newPageOpen && (
              <form className="createPanel" onSubmit={createPage}>
                <input name="name" placeholder="Page name, e.g. MIK Solutions" required />
                <input name="slug" placeholder="URL slug, e.g. mik" required />
                <input name="title" placeholder="Profile heading" required />
                <textarea name="bio" placeholder="Short bio or description" required />
                <button type="submit">Create and Publish</button>
              </form>
            )}

            <div className="pageCards">
              {filteredPages.map((page) => (
                <article className={`pageCard ${activePage?.id === page.id ? "selected" : ""}`} key={page.id}>
                  <button type="button" onClick={() => loadPage(page.id)}>
                    <strong>{page.name}</strong>
                    <span>/{page.slug}</span>
                    <em>{page.status}</em>
                  </button>
                  <div className="cardMetrics">
                    <span>{page.views.toLocaleString()} views</span>
                    <span>{page.clicks.toLocaleString()} clicks</span>
                  </div>
                  <div className="cardActions">
                    <button type="button" onClick={() => loadPage(page.id)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => duplicatePage(page.id)}>
                      Duplicate
                    </button>
                    <button type="button" onClick={() => deletePage(page.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {activePage && (
            <>
              <section className="editorWorkspace">
                <div className="editorTop">
                  <div>
                    <p>{status}</p>
                    <h2>{activePage.name}</h2>
                    <a href={`/${activePage.slug}`} target="_blank">
                      {publicUrl(activePage.slug)}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      savePageNow({ status: activePage.status === "published" ? "draft" : "published" })
                    }
                  >
                    {activePage.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                </div>

                <nav className="editorTabs">
                  {(["content", "blocks", "design", "seo", "integrations", "analytics"] as EditorTab[]).map((item) => (
                    <button
                      type="button"
                      className={tab === item ? "active" : ""}
                      key={item}
                      onClick={() => {
                        setTab(item);
                        if (item === "analytics") void loadAnalytics();
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </nav>

                {tab === "content" && (
                  <div className="formStack">
                    <Field label="Page name">
                      <input value={activePage.name} onChange={(event) => editPage({ name: event.target.value })} />
                    </Field>
                    <Field label="Slug">
                      <input value={activePage.slug} onChange={(event) => editPage({ slug: slugify(event.target.value) })} />
                    </Field>
                    <Field label="Profile heading">
                      <input value={activePage.title} onChange={(event) => editPage({ title: event.target.value })} />
                    </Field>
                    <Field label="Bio">
                      <textarea value={activePage.bio} onChange={(event) => editPage({ bio: event.target.value })} />
                    </Field>
                    <ImageUploader
                      category="profile"
                      label="Profile image"
                      round
                      value={activePage.profileImage}
                      onChange={(profileImage) => editPage({ profileImage })}
                    />
                  </div>
                )}

                {tab === "blocks" && (
                  <div className="formStack">
                    <div className="blockPicker">
                      {blockTypes.map((block) => (
                        <button type="button" key={block.value} onClick={() => addBlock(block.value)}>
                          {block.label}
                        </button>
                      ))}
                    </div>
                    {activePage.blocks.map((block, index) => (
                      <BlockEditor
                        block={block}
                        first={index === 0}
                        key={block.id}
                        last={index === activePage.blocks.length - 1}
                        onDelete={() => removeBlock(block.id)}
                        onDuplicate={() => duplicateBlock(block.id)}
                        onMoveDown={() => moveBlock(block.id, 1)}
                        onMoveUp={() => moveBlock(block.id, -1)}
                        onUpdate={(patch) => editBlock(block.id, patch)}
                        onCommit={(patch) => updateBlockNow(block.id, patch)}
                      />
                    ))}
                  </div>
                )}

                {tab === "design" && (
                  <div className="formStack">
                    <Field label="Ready-made theme">
                      <select
                        value={activePage.theme.preset}
                        onChange={(event) =>
                          editPage({ theme: { ...activePage.theme, preset: event.target.value as SmartPage["theme"]["preset"] } })
                        }
                      >
                        {themePresets.map((theme) => (
                          <option value={theme.value} key={theme.value}>
                            {theme.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="colorGrid">
                      <Field label="Gradient from">
                        <input
                          type="color"
                          value={activePage.theme.gradientFrom}
                          onChange={(event) => editPage({ theme: { ...activePage.theme, gradientFrom: event.target.value } })}
                        />
                      </Field>
                      <Field label="Gradient to">
                        <input
                          type="color"
                          value={activePage.theme.gradientTo}
                          onChange={(event) => editPage({ theme: { ...activePage.theme, gradientTo: event.target.value } })}
                        />
                      </Field>
                      <Field label="Button color">
                        <input
                          type="color"
                          value={activePage.theme.buttonBackground}
                          onChange={(event) => editPage({ theme: { ...activePage.theme, buttonBackground: event.target.value } })}
                        />
                      </Field>
                    </div>
                    <ImageUploader
                      category="background"
                      label="Background image"
                      value={activePage.theme.backgroundImage}
                      onChange={(backgroundImage) => editPage({ theme: { ...activePage.theme, backgroundImage } })}
                    />
                    <Range label="Button radius" value={activePage.theme.buttonRadius} min={4} max={36} onChange={(value) => editPage({ theme: { ...activePage.theme, buttonRadius: value } })} />
                    <Range label="Glass blur" value={activePage.theme.glassBlur} min={0} max={30} onChange={(value) => editPage({ theme: { ...activePage.theme, glassBlur: value } })} />
                    <Range label="Spacing" value={activePage.theme.spacing} min={6} max={26} onChange={(value) => editPage({ theme: { ...activePage.theme, spacing: value } })} />
                  </div>
                )}

                {tab === "seo" && (
                  <div className="formStack">
                    <Field label="SEO title">
                      <input value={activePage.seo.seoTitle} onChange={(event) => editPage({ seo: { ...activePage.seo, seoTitle: event.target.value } })} />
                    </Field>
                    <Field label="Meta description">
                      <textarea value={activePage.seo.metaDescription} onChange={(event) => editPage({ seo: { ...activePage.seo, metaDescription: event.target.value } })} />
                    </Field>
                    <Field label="Social share title">
                      <input value={activePage.seo.socialTitle} onChange={(event) => editPage({ seo: { ...activePage.seo, socialTitle: event.target.value } })} />
                    </Field>
                    <ImageUploader
                      category="og"
                      label="Social sharing image"
                      hint="Used when the page is shared. 1200x630 works well."
                      value={activePage.seo.ogImage}
                      onChange={(ogImage) => editPage({ seo: { ...activePage.seo, ogImage } })}
                    />
                    <ImageUploader
                      category="favicon"
                      label="Favicon"
                      hint="A small square icon. PNG, SVG or ICO."
                      value={activePage.seo.favicon}
                      onChange={(favicon) => editPage({ seo: { ...activePage.seo, favicon } })}
                    />
                    <a className="qrButton" href={`https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(publicUrl(activePage.slug))}`}>
                      View or download QR code
                    </a>
                  </div>
                )}

                {tab === "integrations" && (
                  <div className="formStack">
                    <Field label="Meta Pixel ID">
                      <input value={activePage.integrations.metaPixelId} onChange={(event) => editPage({ integrations: { ...activePage.integrations, metaPixelId: event.target.value.replace(/[^0-9]/g, "") } })} />
                    </Field>
                    <Field label="Google Tag Manager ID">
                      <input value={activePage.integrations.gtmId} onChange={(event) => editPage({ integrations: { ...activePage.integrations, gtmId: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") } })} />
                    </Field>
                  </div>
                )}

                {tab === "analytics" && analytics && (
                  <div className="analyticsPanel">
                    <Metric label="Views" value={analytics.views.toLocaleString()} />
                    <Metric label="Unique visitors" value={analytics.uniqueVisitors.toLocaleString()} />
                    <Metric label="Clicks" value={analytics.clicks.toLocaleString()} />
                    <Metric label="CTR" value={`${analytics.ctr}%`} />
                    <div className="chart">
                      {analytics.daily.slice(-7).map((day) => (
                        <span key={day.date} style={{ height: `${Math.max(8, day.views + day.clicks)}%` }} />
                      ))}
                    </div>
                    <div className="topLinks">
                      {analytics.topBlocks.map((block) => (
                        <div key={block.id}>
                          <span>{block.title}</span>
                          <strong>{block.clicks}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <aside className="livePreview">
                <div className="phoneFrame">
                  <PublicPage page={activePage} preview />
                </div>
              </aside>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

const pickerOptions: Array<{ label: string; icon: LucideIcon; type?: BlockType; patch?: Partial<PageBlock>; profile?: boolean; linkFlow?: boolean }> = [
  { label: "Profile", icon: LayoutPanelTop, profile: true },
  { label: "Text", icon: Type, type: "text", patch: { title: "Add your text here" } },
  { label: "Links", icon: Link2, type: "link", linkFlow: true },
  { label: "Form", icon: FormInput, type: "email", patch: { title: "Contact us", subtitle: "Send an enquiry" } },
  { label: "Messengers", icon: MessageCircle, type: "whatsapp" },
  { label: "Socials", icon: Share2, type: "socials" },
  { label: "Divider", icon: Minus, type: "divider" },
  { label: "Products Catalog", icon: Package, type: "link", patch: { title: "Products catalog" } },
  { label: "Image", icon: ImageIcon, type: "image" },
  { label: "Image Gallery", icon: GalleryVerticalEnd, type: "image", patch: { title: "Image gallery" } },
  { label: "Features", icon: Blocks, type: "heading", patch: { title: "Features" } },
  { label: "FAQ", icon: CircleHelp, type: "text", patch: { title: "Frequently asked questions" } },
  { label: "Timer", icon: Timer, type: "text", patch: { title: "Coming soon" } },
  { label: "Giphy", icon: ImageIcon, type: "image", patch: { title: "Animated image" } },
  { label: "Video", icon: Video, type: "video" },
  { label: "Video Gallery", icon: Video, type: "video", patch: { title: "Video gallery" } },
  { label: "Map", icon: MapPin, type: "website", patch: { title: "Find us", subtitle: "Open map" } },
  { label: "Music", icon: Music2, type: "website", patch: { title: "Listen now" } },
];

function BlockPickerSheet({
  onAddLink,
  onClose,
  onProfile,
  onSelect,
}: {
  onAddLink: () => void;
  onClose: () => void;
  onProfile: () => void;
  onSelect: (type: BlockType, patch?: Partial<PageBlock>) => void;
}) {
  return (
    <div className="blockPickerBackdrop" role="dialog" aria-modal="true" aria-label="Choose block">
      <section className="blockPickerSheet">
        <header className="blockPickerHeader">
          <button type="button" aria-label="Close block picker" onClick={onClose}><X /></button>
          <h2>Choose block</h2>
          <span aria-hidden="true" />
        </header>
        <div className="blockPickerList">
          {pickerOptions.map((option) => (
            <button
              type="button"
              className="blockPickerOption"
              key={option.label}
              onClick={() => {
                if (option.profile) return onProfile();
                if (option.linkFlow) return onAddLink();
                if (option.type) onSelect(option.type, option.patch);
              }}
            >
              <span className="blockPickerIcon"><option.icon /></span>
              <strong>{option.label}</strong>
              <Plus aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

type SettingsView = "menu" | "account" | "notifications" | "billing" | "privacy" | "terms";

const settingsMenuItems: { view: SettingsView; label: string; icon: LucideIcon }[] = [
  { view: "account", label: "My Account", icon: User },
  { view: "notifications", label: "Notifications", icon: Bell },
  { view: "billing", label: "Billing", icon: CreditCard },
  { view: "privacy", label: "Privacy policy", icon: FileText },
  { view: "terms", label: "Terms of use", icon: FileText },
];

const settingsPlaceholderCopy: Partial<Record<SettingsView, string>> = {
  notifications: "Notification preferences aren't available yet.",
  billing: "Billing details aren't available yet.",
  privacy: "Read the privacy policy at your hosting provider's documentation.",
  terms: "Read the terms of use at your hosting provider's documentation.",
};

function SettingsSheet({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const [view, setView] = useState<SettingsView>("menu");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("English");
  const [avatar, setAvatar] = useState("");
  const [status, setStatus] = useState("Save changes");
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [passwordNoticeOpen, setPasswordNoticeOpen] = useState(false);

  useEffect(() => {
    if (view !== "account") return;
    let cancelled = false;

    (async () => {
      let currentEmail = "";
      try {
        const response = await fetch("/api/auth/me");
        if (response.ok) {
          const data = (await response.json()) as { email?: string };
          currentEmail = data.email ?? "";
        }
      } catch {
        // Ignore network errors; fields stay editable with local defaults.
      }
      if (cancelled) return;

      let saved: { name?: string; language?: string; avatar?: string } | null = null;
      try {
        const raw = window.localStorage.getItem("smartlink_profile");
        saved = raw ? JSON.parse(raw) : null;
      } catch {
        saved = null;
      }

      setEmail(currentEmail);
      setName(saved?.name ?? currentEmail.split("@")[0] ?? "");
      setLanguage(saved?.language ?? "English");
      setAvatar(saved?.avatar ?? "");
    })();

    return () => {
      cancelled = true;
    };
  }, [view]);

  function pickAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function saveProfile() {
    try {
      window.localStorage.setItem("smartlink_profile", JSON.stringify({ name, language, avatar }));
    } catch {
      // Ignore storage errors (e.g. private browsing).
    }
    setStatus("Saved");
    window.setTimeout(() => setStatus("Save changes"), 1500);
  }

  function deleteAccount() {
    if (window.confirm("Delete your account? This ends your session immediately.")) {
      onLogout();
    }
  }

  if (view === "menu") {
    return (
      <div className="settingsBackdrop" role="dialog" aria-modal="true" aria-label="Settings">
        <section className="settingsSheet">
          <header className="settingsHeader">
            <button type="button" aria-label="Close settings" onClick={onClose}><X /></button>
            <h2>Settings</h2>
            <span aria-hidden="true" />
          </header>
          <div className="settingsList">
            {settingsMenuItems.map((item) => (
              <button type="button" className="settingsRow" key={item.view} onClick={() => setView(item.view)}>
                <span className="settingsIcon"><item.icon /></span>
                <strong>{item.label}</strong>
              </button>
            ))}
            <button type="button" className="settingsRow" onClick={onLogout}>
              <span className="settingsIcon"><LogOut /></span>
              <strong>Logout</strong>
            </button>
            <button type="button" className="settingsRow settingsRowDanger" onClick={deleteAccount}>
              <span className="settingsIcon"><Trash2 /></span>
              <strong>Delete Account</strong>
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (view === "account") {
    return (
      <div className="settingsBackdrop" role="dialog" aria-modal="true" aria-label="My Account">
        <section className="settingsSheet">
          <header className="settingsHeader">
            <button type="button" aria-label="Close" onClick={onClose}><X /></button>
            <h2>My Account</h2>
            <span aria-hidden="true" />
          </header>
          <div className="accountForm">
            <div className="accountAvatarRow">
              <div className="accountAvatarPreview">
                {avatar ? <img src={avatar} alt="" /> : <span className="accountAvatarPlaceholder" aria-hidden="true" />}
              </div>
              <strong>Avatar</strong>
              <label className="accountUploadButton">
                Upload
                <input type="file" accept="image/*" onChange={pickAvatar} hidden />
              </label>
            </div>

            <label className="accountField">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>

            <label className="accountField">
              <span>Email</span>
              <input value={email} readOnly />
            </label>

            <div className="accountField">
              <span>Language</span>
              <div className="accountFieldRow">
                <span>{language}</span>
                <button type="button" onClick={() => setLanguagePickerOpen((value) => !value)}>
                  Change
                </button>
              </div>
              {languagePickerOpen && (
                <div className="accountOptionList">
                  {["English", "Spanish", "French", "Hindi", "Arabic"].map((option) => (
                    <button
                      type="button"
                      key={option}
                      onClick={() => {
                        setLanguage(option);
                        setLanguagePickerOpen(false);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="accountField">
              <span>Password</span>
              <div className="accountFieldRow">
                <span>••••••••••</span>
                <button type="button" onClick={() => setPasswordNoticeOpen((value) => !value)}>
                  Change
                </button>
              </div>
              {passwordNoticeOpen && (
                <p className="accountHint">
                  Password is set via the ADMIN_PASSWORD_HASH environment variable on the server. Update it there to
                  change your password.
                </p>
              )}
            </div>

            <button type="button" className="accountSaveButton" onClick={saveProfile}>
              {status}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="settingsBackdrop" role="dialog" aria-modal="true" aria-label={settingsMenuItems.find((item) => item.view === view)?.label}>
      <section className="settingsSheet">
        <header className="settingsHeader">
          <button type="button" aria-label="Close" onClick={onClose}><X /></button>
          <h2>{settingsMenuItems.find((item) => item.view === view)?.label}</h2>
          <span aria-hidden="true" />
        </header>
        <div className="settingsPlaceholder">
          <p>{settingsPlaceholderCopy[view]}</p>
        </div>
      </section>
    </div>
  );
}

function WebsiteSettingsSheet({
  onClose,
  onSave,
  page,
}: {
  onClose: () => void;
  onSave: (patch: Partial<SmartPage>) => void;
  page: SmartPage;
}) {
  const [name, setName] = useState(page.name);
  const [slug, setSlug] = useState(page.slug);
  const pageUrl = publicPageUrl(slugify(slug) || "your-page");

  return (
    <div className="settingsBackdrop" role="dialog" aria-modal="true" aria-label="Website settings">
      <section className="settingsSheet websiteSettingsSheet">
        <header className="settingsHeader">
          <button type="button" aria-label="Close website settings" onClick={onClose}><X /></button>
          <h2>Website Settings</h2>
          <button type="button" className="websiteSettingsSave" onClick={() => onSave({ name, slug: slugify(slug) })}>Save</button>
        </header>
        <div className="websiteSettingsFields">
          <Field label="Website name *">
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Page URL *">
            <input value={slug} placeholder="your-page" onChange={(event) => setSlug(slugify(event.target.value))} />
            <small className="subdomainPreview">{pageUrl}</small>
          </Field>
          <div className="websiteStatusRow">
            <div>
              <strong>Publishing</strong>
              <span>{page.status === "published" ? "Visible to visitors" : "Not visible to visitors"}</span>
            </div>
            <span className={`statusPill ${page.status}`}>{page.status === "published" ? "Published" : "Draft"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function ThemeEditorSheet({
  onChange,
  onClose,
  page,
}: {
  onChange: (theme: SmartPage["theme"]) => void;
  onClose: () => void;
  page: SmartPage;
}) {
  const theme = page.theme;
  const update = (patch: Partial<SmartPage["theme"]>) => onChange({ ...theme, ...patch });

  return (
    <div className="appearanceSheetBackdrop" role="dialog" aria-modal="true" aria-label="Edit appearance">
      <section className="appearanceSheet">
        <header className="appearanceSheetHeader">
          <button type="button" aria-label="Close appearance editor" onClick={onClose}><X /></button>
          <h2>Appearance</h2>
          <span aria-hidden="true" />
        </header>
        <div className="appearanceFields">
          <Field label="Theme">
            <select value={theme.preset} onChange={(event) => update({ preset: event.target.value as SmartPage["theme"]["preset"] })}>
              {themePresets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
            </select>
          </Field>
          <div className="appearanceColorGrid">
            <Field label="Background">
              <input type="color" value={theme.backgroundColor} onChange={(event) => update({ backgroundColor: event.target.value })} />
            </Field>
            <Field label="Accent">
              <input type="color" value={theme.gradientTo} onChange={(event) => update({ gradientTo: event.target.value })} />
            </Field>
            <Field label="Button">
              <input type="color" value={theme.buttonBackground} onChange={(event) => update({ buttonBackground: event.target.value })} />
            </Field>
          </div>
          <ImageUploader
            category="background"
            label="Background image"
            value={theme.backgroundImage}
            onChange={(backgroundImage) => update({ backgroundImage })}
          />
          <Range label="Button corner radius" value={theme.buttonRadius} min={4} max={36} onChange={(buttonRadius) => update({ buttonRadius })} />
          <Range label="Content spacing" value={theme.spacing} min={6} max={26} onChange={(spacing) => update({ spacing })} />
        </div>
      </section>
    </div>
  );
}

type DecorationView = "menu" | "theme" | "backgroundColor" | "backgroundImage" | "fonts";

const decorationMenuItems: { view: DecorationView; label: string; icon: LucideIcon }[] = [
  { view: "theme", label: "Theme", icon: Paintbrush },
  { view: "backgroundColor", label: "Background color", icon: Palette },
  { view: "backgroundImage", label: "Background image", icon: ImageIcon },
  { view: "fonts", label: "Fonts", icon: Type },
];

const fontOptions: { value: SmartPage["theme"]["font"]; label: string }[] = [
  { value: "inter", label: "Inter" },
  { value: "system", label: "System" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Monospace" },
];

function PageDecorationSheet({
  onChange,
  onClose,
  page,
}: {
  onChange: (theme: SmartPage["theme"]) => void;
  onClose: () => void;
  page: SmartPage;
}) {
  const [view, setView] = useState<DecorationView>("menu");
  const theme = page.theme;
  const update = (patch: Partial<SmartPage["theme"]>) => onChange({ ...theme, ...patch });
  const viewTitle = decorationMenuItems.find((item) => item.view === view)?.label ?? "Page decoration";

  if (view === "menu") {
    return (
      <div className="settingsBackdrop" role="dialog" aria-modal="true" aria-label="Page decoration">
        <section className="settingsSheet">
          <header className="settingsHeader">
            <button type="button" aria-label="Close page decoration" onClick={onClose}><X /></button>
            <h2>Page decoration</h2>
            <span aria-hidden="true" />
          </header>
          <div className="settingsList">
            {decorationMenuItems.map((item) => (
              <button type="button" className="settingsRow" key={item.view} onClick={() => setView(item.view)}>
                <span className="settingsIcon"><item.icon /></span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="settingsBackdrop" role="dialog" aria-modal="true" aria-label={viewTitle}>
      <section className="settingsSheet">
        <header className="settingsHeader">
          <button type="button" aria-label="Close page decoration" onClick={onClose}><X /></button>
          <h2>{viewTitle}</h2>
          <span aria-hidden="true" />
        </header>
        <div className="decorationFields">
          {view === "theme" && <ThemeGallery onSelect={onChange} theme={theme} />}
          {view === "backgroundColor" && (
            <div className="appearanceColorGrid">
              <Field label="Background">
                <input type="color" value={theme.backgroundColor} onChange={(event) => update({ backgroundColor: event.target.value })} />
              </Field>
              <Field label="Accent">
                <input type="color" value={theme.gradientTo} onChange={(event) => update({ gradientTo: event.target.value })} />
              </Field>
              <Field label="Button">
                <input type="color" value={theme.buttonBackground} onChange={(event) => update({ buttonBackground: event.target.value })} />
              </Field>
            </div>
          )}
          {view === "backgroundImage" && (
            <ImageUploader
              category="background"
              label="Background image"
              hint="Sits behind the whole page. Drag an image here, or click to choose."
              value={theme.backgroundImage}
              onChange={(backgroundImage) => update({ backgroundImage })}
            />
          )}
          {view === "fonts" && (
            <Field label="Font">
              <select value={theme.font} onChange={(event) => update({ font: event.target.value as SmartPage["theme"]["font"] })}>
                {fontOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Theme cards render a miniature of the real page — background, card surface and
 * button treatment — so the theme is recognisable before it is applied.
 */
function ThemeGallery({
  onSelect,
  theme,
}: {
  onSelect: (theme: SmartPage["theme"]) => void;
  theme: SmartPage["theme"];
}) {
  const activeId = themeDefinition(theme.preset)?.id;

  return (
    <div className="themeGallery">
      {themeLibrary.map((item) => {
        const preview = item.settings;
        const isActive = activeId === item.id;
        return (
          <button
            type="button"
            key={item.id}
            className={`themeCard ${isActive ? "themeCardActive" : ""}`}
            aria-pressed={isActive}
            onClick={() => onSelect(applyThemeDefinition(item, theme))}
          >
            <span
              className={`themeSwatch surface-${preview.surface}`}
              style={{
                backgroundImage: `linear-gradient(135deg, ${preview.gradientFrom}, ${preview.gradientTo})`,
              }}
            >
              <span className="themeSwatchAvatar" style={{ background: preview.headingColor, opacity: 0.9 }} />
              <span className="themeSwatchLine" style={{ background: preview.headingColor }} />
              <span className="themeSwatchLine themeSwatchLineShort" style={{ background: preview.textColor }} />
              {[0, 1].map((row) => (
                <span
                  key={row}
                  className={`themeSwatchButton buttonStyle-${preview.buttonStyle}`}
                  style={{
                    background: preview.buttonBackground,
                    borderColor: preview.buttonBorderColor,
                    borderRadius: Math.min(preview.buttonRadius, 12),
                  }}
                />
              ))}
            </span>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
            {isActive && (
              <span className="themeCardCheck" aria-hidden="true">
                <Check />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const onboardingSlides: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Add block",
    description: "Build your website with simple blocks. Click on + to add new block.",
    icon: Plus,
  },
  {
    title: "Edit block",
    description: "You can edit, duplicate, hide or delete block. Just click on it to see options.",
    icon: Pencil,
  },
  {
    title: "Publish & Share",
    description: "Publish your website in any time to share link with the world.",
    icon: Share2,
  },
];

function EditorOnboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const slide = onboardingSlides[step];
  const isFirst = step === 0;
  const isLast = step === onboardingSlides.length - 1;

  return (
    <div className="onboardingBackdrop" role="dialog" aria-modal="true" aria-label={slide.title}>
      <div className="onboardingCard">
        <button
          type="button"
          className="onboardingNavButton"
          aria-label={isFirst ? "Skip tutorial" : "Back"}
          onClick={() => (isFirst ? onClose() : setStep((value) => value - 1))}
        >
          {isFirst ? <X /> : <ArrowLeft />}
        </button>

        <div className="onboardingBody">
          <div className="onboardingIcon">
            <slide.icon size={30} />
          </div>
          <h2>{slide.title}</h2>
          <p>{slide.description}</p>
          <div className="onboardingDots">
            {onboardingSlides.map((item, index) => (
              <span key={item.title} className={index === step ? "onboardingDotActive" : "onboardingDot"} />
            ))}
          </div>
        </div>

        <button
          type="button"
          className="onboardingPrimaryButton"
          onClick={() => (isLast ? onClose() : setStep((value) => value + 1))}
        >
          {isLast ? "Get started" : "Got it"}
        </button>
      </div>
    </div>
  );
}

function EditablePublicCanvas({
  onDeleteBlock,
  onDuplicateBlock,
  onCommitBlock,
  onMoveBlock,
  onUpdateBlock,
  onSaveProfile,
  onProfileEditorDismiss,
  profileEditorRequested,
  onBlockSelectionChange,
  page,
}: {
  onDeleteBlock: (blockId: number) => void;
  onDuplicateBlock: (blockId: number) => void;
  onCommitBlock: (blockId: number, patch: Partial<PageBlock>) => void;
  onMoveBlock: (blockId: number, direction: -1 | 1) => void;
  onUpdateBlock: (blockId: number, patch: Partial<PageBlock>) => void;
  onSaveProfile: (patch: Partial<SmartPage>) => void;
  onProfileEditorDismiss: () => void;
  profileEditorRequested: boolean;
  onBlockSelectionChange: (selected: boolean) => void;
  page: SmartPage;
}) {
  const blocks = [...page.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? null;
  const editingBlock = blocks.find((block) => block.id === editingBlockId) ?? null;
  const selectedIndex = selectedBlock ? blocks.findIndex((block) => block.id === selectedBlock.id) : -1;

  const isProfileEditorOpen = profileEditorOpen || profileEditorRequested;

  function openProfileEditor() {
    setSelectedBlockId(null);
    onBlockSelectionChange(false);
    setProfileEditorOpen(true);
  }

  return (
    <div className="homepagePreviewWrap">
      <PageRenderer
        page={page}
        edit={{
          selectedBlockId,
          onSelectBlock: (blockId) => {
            setSelectedBlockId(blockId);
            onBlockSelectionChange(true);
          },
          onEditProfile: openProfileEditor,
        }}
      />

      {selectedBlock && !editingBlock && (
        <div className="selectedBlockToolbar" aria-label="Selected block actions">
          <button type="button" className="closeToolbarButton" onClick={() => {
            setSelectedBlockId(null);
            onBlockSelectionChange(false);
          }}>
            <X />
          </button>
          <button type="button" onClick={() => setEditingBlockId(selectedBlock.id)}>
            <span><Pencil /></span>
            Edit
          </button>
          <button
            type="button"
            disabled={selectedIndex <= 0}
            onClick={() => onMoveBlock(selectedBlock.id, -1)}
          >
            <span><MoveUp /></span>
            Up
          </button>
          <button
            type="button"
            disabled={selectedIndex === -1 || selectedIndex >= blocks.length - 1}
            onClick={() => onMoveBlock(selectedBlock.id, 1)}
          >
            <span><MoveDown /></span>
            Down
          </button>
          <button type="button" onClick={() => onDeleteBlock(selectedBlock.id)}>
            <span><Trash2 /></span>
            Delete
          </button>
          <button type="button" onClick={() => onDuplicateBlock(selectedBlock.id)}>
            <span><CopyPlus /></span>
            Clone
          </button>
          <button
            type="button"
            onClick={() => onCommitBlock(selectedBlock.id, { isActive: !selectedBlock.isActive })}
          >
            <span>{selectedBlock.isActive ? <EyeOff /> : <Eye />}</span>
            {selectedBlock.isActive ? "Hide" : "Show"}
          </button>
        </div>
      )}

      {editingBlock && (
        <LinkEditSheet
          key={editingBlock.id}
          block={editingBlock}
          onClose={() => setEditingBlockId(null)}
          onSave={(patch) => {
            onUpdateBlock(editingBlock.id, patch);
            onCommitBlock(editingBlock.id, patch);
            setEditingBlockId(null);
          }}
        />
      )}

      {isProfileEditorOpen && (
        <ProfileEditorSheet
          page={page}
          onClose={() => {
            setProfileEditorOpen(false);
            onProfileEditorDismiss();
          }}
          onSave={(patch) => {
            onSaveProfile(patch);
            setProfileEditorOpen(false);
            onProfileEditorDismiss();
          }}
        />
      )}
    </div>
  );
}

const alignmentOptions: { value: ProfileAlignment; label: string; icon: LucideIcon }[] = [
  { value: "left", label: "Left", icon: AlignLeft },
  { value: "center", label: "Center", icon: AlignCenter },
  { value: "right", label: "Right", icon: AlignRight },
];

/** Segmented control for how the whole profile block sits on the page. */
function AlignmentControl({
  onChange,
  value,
}: {
  onChange: (value: ProfileAlignment) => void;
  value: ProfileAlignment;
}) {
  return (
    <div className="segmented" role="group" aria-label="Profile alignment">
      {alignmentOptions.map((option) => {
        const active = value === option.value;
        return (
          <button
            type="button"
            key={option.value}
            className={`segmentedOption ${active ? "segmentedOptionActive" : ""}`}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            <option.icon aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ProfileEditorSheet({
  onClose,
  onSave,
  page,
}: {
  onClose: () => void;
  onSave: (patch: Partial<SmartPage>) => void;
  page: SmartPage;
}) {
  const [cover, setCover] = useState(page.theme.backgroundImage);
  const [photo, setPhoto] = useState(page.profileImage);
  const [name, setName] = useState(page.name);
  const [slug, setSlug] = useState(page.slug);
  const [title, setTitle] = useState(page.title);
  const [bio, setBio] = useState(page.bio);
  const [align, setAlign] = useState<ProfileAlignment>(resolveAlignment(page.theme));
  const [layout, setLayout] = useState<ProfileLayout>(resolveLayout(page.theme));
  const pageUrl = publicPageUrl(slugify(slug) || "your-page");

  function save() {
    onSave({
      bio,
      name,
      profileImage: photo,
      slug: slugify(slug),
      theme: { ...page.theme, backgroundImage: cover, profileAlignment: align, profileLayout: layout },
      title,
    });
  }

  return (
    <div className="profileSheetBackdrop" role="dialog" aria-modal="true" aria-label="Edit profile">
      <section className="profileEditSheet">
        <header className="profileSheetHeader">
          <button type="button" aria-label="Close profile editor" onClick={onClose}><X /></button>
          <h2>Profile</h2>
          <button type="button" className="profileHeaderSave" onClick={save}>Save</button>
        </header>

        <div className={`profileSheetPreview profilePreview-${layout}`}>
          {layout !== "avatar" && layout !== "none" && (
            <div className="profileSheetBanner" style={{ backgroundImage: `url(${cover})` }} />
          )}
          <div className="profileSheetIdentity">
            {layout !== "none" && <img key={photo} src={photo} alt="" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />}
            <div>
              <strong>{title || "Your name"}</strong>
              <p>{bio || "Add a short description"}</p>
            </div>
          </div>
        </div>

        <div className="profileSheetFields">
          <section className="editorSection">
            <h3>Profile</h3>
            <Field label="Website name *">
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Public URL *">
              <input value={slug} placeholder="your-page" onChange={(event) => setSlug(slugify(event.target.value))} />
              <small className="subdomainPreview">{pageUrl}</small>
            </Field>
            <Field label="Title *">
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Subtitle">
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} />
            </Field>
          </section>

          <section className="editorSection">
            <h3>Images</h3>
            {layout !== "avatar" && layout !== "none" && (
              <ImageUploader
                category="banner"
                label="Cover"
                hint="The hero image across the top. Drag one here, or click to choose."
                value={cover}
                onChange={setCover}
              />
            )}
            {layout !== "none" && (
              <ImageUploader
                category="profile"
                label="Profile photo"
                hint="Square images look best. Drag one here, or click to choose."
                round
                value={photo}
                onChange={setPhoto}
              />
            )}
          </section>

          <section className="editorSection">
            <h3>Layout</h3>
            <div className="profileLayoutPicker" aria-label="Header layout">
              {[
                { value: "hero", label: "Hero", icon: LayoutPanelTop },
                { value: "centered", label: "Centered", icon: Circle },
                { value: "avatar", label: "Avatar", icon: User },
                { value: "none", label: "None", icon: Minus },
              ].map((option) => (
                <button
                  type="button"
                  className={layout === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => setLayout(option.value as ProfileLayout)}
                >
                  <option.icon aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="editorSection">
            <h3>Alignment</h3>
            <AlignmentControl onChange={setAlign} value={align} />
          </section>

          <button type="button" className="profileSaveButton" onClick={save}>Save changes</button>
        </div>
      </section>
    </div>
  );
}

function LinkEditSheet({
  block,
  onClose,
  onSave,
}: {
  block: PageBlock;
  onClose: () => void;
  onSave: (patch: Partial<PageBlock>) => void;
}) {
  const [draft, setDraft] = useState(block);
  const [buttonColor, setButtonColor] = useState(typeof block.settings.buttonColor === "string" ? block.settings.buttonColor : "");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const isPhoneAction = draft.type === "whatsapp" || draft.type === "phone";
  const isVideo = draft.type === "video";
  const isImage = draft.type === "image";
  const buttonStyle = buttonColor ? { background: buttonColor, color: readableTextColor(buttonColor) } : undefined;

  function save() {
    onSave({
      icon: draft.icon,
      isActive: draft.isActive,
      message: draft.message,
      phone: draft.phone,
      settings: { ...draft.settings, buttonColor },
      subtitle: draft.subtitle,
      title: draft.title,
      imageUrl: draft.imageUrl,
      url: isVideo ? draft.videoUrl || draft.url : draft.url,
      videoUrl: isVideo ? draft.videoUrl || draft.url : draft.videoUrl,
    });
  }

  return (
    <div className="linkSheetBackdrop">
      <section className="linkEditSheet" aria-label="Edit selected link">
        <header className="linkSheetHeader">
          <button type="button" aria-label="Close link editor" onClick={onClose}>
            <X />
          </button>
          <h2>{isVideo ? "Video" : isImage ? "Image" : "Link"}</h2>
          <button type="button" onClick={save}>
            Save
          </button>
        </header>

        <div className="sheetPreview">
          {isVideo ? (
            <PlayableVideo src={draft.videoUrl || draft.url} title={draft.title || "Video"} />
          ) : isImage ? (
            <img
              className="sheetPreviewImage"
              key={draft.imageUrl || draft.url}
              src={draft.imageUrl || draft.url}
              alt={draft.title}
              onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
            />
          ) : (
            <div className="sheetPreviewButton" style={buttonStyle}>
              <span className="sheetPreviewIcon">{resolveIconElement(draft.icon, draft.type)}</span>
              <strong>{draft.title || "Untitled link"}</strong>
            </div>
          )}
        </div>

        <div className="sheetFields">
          {isImage && (
            <ImageUploader
              category="block"
              label="Image"
              hint="Shown full width on your page. Drag one here, or click to choose."
              value={draft.imageUrl || draft.url}
              onChange={(imageUrl) => setDraft({ ...draft, imageUrl })}
            />
          )}
          {!isVideo && !isImage && (
            <Field label="Icon">
              <div className="iconChooser">
                <span>{resolveIconElement(draft.icon, draft.type)}</span>
                <button type="button" onClick={() => setIconPickerOpen(true)}>Choose icon</button>
              </div>
            </Field>
          )}
          <Field label={isVideo ? "Video title" : isImage ? "Caption" : "Link title"}>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </Field>
          {!isImage && (
            <Field label="Action *">
              <select
                value={isVideo ? "Play video" : isPhoneAction ? "Call or message" : "Open link"}
                onChange={() => undefined}
              >
                <option>{isVideo ? "Play video" : isPhoneAction ? "Call or message" : "Open link"}</option>
              </select>
            </Field>
          )}
          {isImage ? null : isPhoneAction ? (
            <Field label="Phone number *">
              <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
            </Field>
          ) : (
            <Field label={isVideo ? "Video URL *" : "Link URL *"}>
              <input
                value={isVideo ? draft.videoUrl || draft.url : draft.url}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    url: event.target.value,
                    videoUrl: isVideo ? event.target.value : draft.videoUrl,
                  })
                }
              />
            </Field>
          )}
          <Field label="Subtitle">
            <input value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} />
          </Field>
          {draft.type === "whatsapp" && (
            <Field label="Prefilled message">
              <input value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} />
            </Field>
          )}
          {!isVideo && (
            <Field label="Button color">
              <ColorSwatchPicker value={buttonColor} onChange={setButtonColor} />
            </Field>
          )}
          <label className="sheetToggle">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
            />
            Visible on public page
          </label>
        </div>
      </section>

      {iconPickerOpen && (
        <IconPickerSheet
          onClose={() => setIconPickerOpen(false)}
          onSelect={(value) => {
            setDraft({ ...draft, icon: value });
            setIconPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

const colorSwatchPresets = ["#111827", "#2563eb", "#059669", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#ffffff"];

function ColorSwatchPicker({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <div className="colorSwatchRow">
      {colorSwatchPresets.map((color) => (
        <button
          type="button"
          key={color}
          className={`colorSwatch ${value === color ? "colorSwatchActive" : ""}`}
          style={{ background: color }}
          aria-label={`Use ${color}`}
          onClick={() => onChange(color)}
        />
      ))}
      <input
        type="color"
        className="colorSwatchCustom"
        value={value || "#111827"}
        aria-label="Custom button color"
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button type="button" className="colorSwatchClear" onClick={() => onChange("")}>
          Reset
        </button>
      )}
    </div>
  );
}

type IconPickerView = "menu" | "icons" | "emoji" | "image";

function IconPickerSheet({ onClose, onSelect }: { onClose: () => void; onSelect: (icon: string) => void }) {
  const [view, setView] = useState<IconPickerView>("menu");
  const [imageUrl, setImageUrl] = useState("");

  if (view === "menu") {
    return (
      <div className="settingsBackdrop" role="dialog" aria-modal="true" aria-label="Choose icon">
        <section className="settingsSheet">
          <header className="settingsHeader">
            <button type="button" aria-label="Close icon picker" onClick={onClose}><X /></button>
            <h2>Icon</h2>
            <span aria-hidden="true" />
          </header>
          <div className="settingsList">
            <button type="button" className="settingsRow" onClick={() => setView("icons")}>
              <span className="settingsIcon"><Sparkles /></span>
              <strong>Icons</strong>
            </button>
            <button type="button" className="settingsRow" onClick={() => setView("emoji")}>
              <span className="settingsIcon"><Smile /></span>
              <strong>Emoji</strong>
            </button>
            <button type="button" className="settingsRow" onClick={() => setView("image")}>
              <span className="settingsIcon"><ImageIcon /></span>
              <strong>Custom image</strong>
            </button>
            <button type="button" className="settingsRow" onClick={() => onSelect("none")}>
              <span className="settingsIcon"><CircleOff /></span>
              <strong>No icon</strong>
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (view === "icons") {
    return (
      <div className="settingsBackdrop" role="dialog" aria-modal="true" aria-label="Choose an icon">
        <section className="settingsSheet">
          <header className="settingsHeader">
            <button type="button" aria-label="Back" onClick={() => setView("menu")}><ArrowLeft /></button>
            <h2>Icons</h2>
            <span aria-hidden="true" />
          </header>
          <div className="iconGrid">
            {curatedIconOptions.map((option) => (
              <button type="button" key={option.key} className="iconGridButton" aria-label={option.label} onClick={() => onSelect(option.key)}>
                <option.icon aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (view === "emoji") {
    return (
      <div className="settingsBackdrop" role="dialog" aria-modal="true" aria-label="Choose an emoji">
        <section className="settingsSheet">
          <header className="settingsHeader">
            <button type="button" aria-label="Back" onClick={() => setView("menu")}><ArrowLeft /></button>
            <h2>Emoji</h2>
            <span aria-hidden="true" />
          </header>
          <div className="iconGrid">
            {commonEmoji.map((emoji) => (
              <button type="button" key={emoji} className="iconGridButton emojiGridButton" onClick={() => onSelect(`emoji:${emoji}`)}>
                {emoji}
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="settingsBackdrop" role="dialog" aria-modal="true" aria-label="Custom image icon">
      <section className="settingsSheet">
        <header className="settingsHeader">
          <button type="button" aria-label="Back" onClick={() => setView("menu")}><ArrowLeft /></button>
          <h2>Custom image</h2>
          <span aria-hidden="true" />
        </header>
        <div className="decorationFields">
          <ImageUploader
            category="icon"
            label="Icon image"
            hint="A small square image works best. Drag one here, or click to choose."
            round
            value={imageUrl}
            onChange={setImageUrl}
          />
          <button type="button" className="onboardingPrimaryButton" disabled={!imageUrl} onClick={() => onSelect(imageUrl)}>
            Use image
          </button>
        </div>
      </section>
    </div>
  );
}

type AddLinkStep = "intro" | "form";

function AddLinkSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (patch: Partial<PageBlock>) => void }) {
  const [step, setStep] = useState<AddLinkStep>("intro");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("");
  const [buttonColor, setButtonColor] = useState("");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const previewIcon = resolveIconElement(icon, "link");
  const buttonStyle = buttonColor ? { background: buttonColor, color: readableTextColor(buttonColor) } : undefined;

  function handleAdd() {
    const patch: Partial<PageBlock> = { title: title || "Untitled link", url };
    if (icon) patch.icon = icon;
    if (buttonColor) patch.settings = { buttonColor };
    onCreate(patch);
  }

  if (step === "intro") {
    return (
      <div className="linkSheetBackdrop">
        <section className="linkEditSheet" aria-label="Add link">
          <header className="linkSheetHeader">
            <button type="button" aria-label="Close" onClick={onClose}><X /></button>
            <h2>Links</h2>
            <span aria-hidden="true" />
          </header>

          <div className="sheetPreview">
            <div className="sheetPreviewButton" style={buttonStyle}>
              <span className="sheetPreviewIcon">{previewIcon}</span>
              <strong>{title || "Link title"}</strong>
            </div>
          </div>

          <div className="sheetFields">
            <button type="button" className="addLinkPrimaryButton" onClick={() => setStep("form")}>
              <Plus aria-hidden="true" /> Add Link
            </button>
            <Field label="Button color">
              <ColorSwatchPicker value={buttonColor} onChange={setButtonColor} />
            </Field>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="linkSheetBackdrop">
      <section className="linkEditSheet" aria-label="Add link">
        <header className="linkSheetHeader">
          <button type="button" aria-label="Back to link options" onClick={() => setStep("intro")}><ArrowLeft /></button>
          <h2>Link</h2>
          <button type="button" onClick={handleAdd}>Add</button>
        </header>

        <div className="sheetPreview">
          <div className="sheetPreviewButton" style={buttonStyle}>
            <span className="sheetPreviewIcon">{previewIcon}</span>
            <strong>{title || "Untitled link"}</strong>
          </div>
        </div>

        <div className="sheetFields">
          <Field label="Icon">
            <div className="iconChooser">
              <span>{previewIcon}</span>
              <button type="button" onClick={() => setIconPickerOpen(true)}>Choose icon</button>
            </div>
          </Field>
          <Field label="Link title">
            <input value={title} placeholder="Enter title" onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Action *">
            <select value="Open link" onChange={() => undefined}>
              <option>Open link</option>
            </select>
          </Field>
          <Field label="Link URL *">
            <input value={url} placeholder="Enter URL" onChange={(event) => setUrl(event.target.value)} />
          </Field>
        </div>
      </section>

      {iconPickerOpen && (
        <IconPickerSheet
          onClose={() => setIconPickerOpen(false)}
          onSelect={(value) => {
            setIcon(value);
            setIconPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function PlayableVideo({ src, title }: { src: string; title: string }) {
  const embed = videoEmbedUrl(src);

  if (embed.type === "iframe") {
    return <iframe src={embed.src} title={title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />;
  }

  if (embed.type === "video") {
    return <video src={embed.src} controls playsInline />;
  }

  return (
    <div className="videoPlaceholder">
            <Play fill="currentColor" />
      <strong>Add video URL</strong>
    </div>
  );
}

function videoEmbedUrl(src: string) {
  if (!src) return { type: "empty" as const, src: "" };
  try {
    const url = new URL(src);
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) return { type: "iframe" as const, src: `https://www.youtube.com/embed/${id}` };
    }
    if (url.hostname.includes("youtu.be")) {
      return { type: "iframe" as const, src: `https://www.youtube.com/embed/${url.pathname.slice(1)}` };
    }
    if (url.hostname.includes("vimeo.com")) {
      return { type: "iframe" as const, src: `https://player.vimeo.com/video/${url.pathname.split("/").filter(Boolean).pop()}` };
    }
    if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) {
      return { type: "video" as const, src };
    }
  } catch {
    return { type: "empty" as const, src: "" };
  }
  return { type: "iframe" as const, src };
}

function canvasIcon(type: PageBlock["type"]) {
  const Icon = blockTypeIcons[type] ?? Link2;
  return <Icon aria-hidden="true" />;
}

const blockTypeIcons: Partial<Record<PageBlock["type"], LucideIcon>> = {
  link: Link2,
  website: Globe2,
  telegram: Send,
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
  facebook: Globe2,
  instagram: ImageIcon,
  youtube: Play,
  messenger: MessageCircle,
};

const curatedIconOptions: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "link", label: "Link", icon: Link2 },
  { key: "globe", label: "Globe", icon: Globe2 },
  { key: "message", label: "Message", icon: MessageCircle },
  { key: "mail", label: "Mail", icon: Mail },
  { key: "phone", label: "Phone", icon: Phone },
  { key: "send", label: "Send", icon: Send },
  { key: "share", label: "Share", icon: Share2 },
  { key: "map-pin", label: "Location", icon: MapPin },
  { key: "shopping-bag", label: "Shopping", icon: ShoppingBag },
  { key: "star", label: "Star", icon: Star },
  { key: "heart", label: "Heart", icon: Heart },
  { key: "music", label: "Music", icon: Music2 },
  { key: "video", label: "Video", icon: Video },
  { key: "image", label: "Image", icon: ImageIcon },
  { key: "help", label: "Help", icon: CircleHelp },
  { key: "sparkles", label: "Sparkles", icon: Sparkles },
];

const commonEmoji = [
  "😀", "😍", "🔥", "👍", "🎉", "❤️", "⭐", "✅",
  "📱", "💬", "📸", "🎵", "▶️", "🛍️", "📍", "✨",
];

function resolveIconElement(icon: string, fallbackType: PageBlock["type"]) {
  const parsed = parseBlockIcon(icon);
  if (parsed.kind === "none") return null;
  if (parsed.kind === "emoji") return <span className="emojiIcon">{parsed.value}</span>;
  if (parsed.kind === "image") {
    return (
      <img
        key={parsed.src}
        className="customIconImage"
        src={parsed.src}
        alt=""
        onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
      />
    );
  }
  if (parsed.kind === "empty") return <ImageIcon aria-hidden="true" />;
  const curated = curatedIconOptions.find((option) => option.key === parsed.key);
  if (curated) return <curated.icon aria-hidden="true" />;
  return canvasIcon(fallbackType);
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Range({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="field">
      <span>
        {label}: {value}
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function BlockEditor({
  block,
  first,
  last,
  onDelete,
  onDuplicate,
  onCommit,
  onMoveDown,
  onMoveUp,
  onUpdate,
}: {
  block: PageBlock;
  first: boolean;
  last: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onCommit: (patch: Partial<PageBlock>) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onUpdate: (patch: Partial<PageBlock>) => void;
}) {
  return (
    <article className="blockEditor" draggable>
      <div className="blockHeader">
        <strong>{block.type}</strong>
        <label className="switch">
          <input
            type="checkbox"
            checked={block.isActive}
            onChange={(event) => {
              onUpdate({ isActive: event.target.checked });
              onCommit({ isActive: event.target.checked });
            }}
          />
          <span />
        </label>
      </div>
      <input
        aria-label="Block title"
        value={block.title}
        onBlur={(event) => onCommit({ title: event.target.value })}
        onChange={(event) => onUpdate({ title: event.target.value })}
      />
      <input
        aria-label="Block subtitle"
        value={block.subtitle}
        onBlur={(event) => onCommit({ subtitle: event.target.value })}
        onChange={(event) => onUpdate({ subtitle: event.target.value })}
      />
      {block.type === "whatsapp" || block.type === "phone" ? (
        <input
          aria-label="Phone number"
          placeholder="+918850053273"
          value={block.phone}
          onBlur={(event) => onCommit({ phone: event.target.value })}
          onChange={(event) => onUpdate({ phone: event.target.value })}
        />
      ) : null}
      {block.type === "whatsapp" || block.type === "email" ? (
        <input
          aria-label="Prefilled message"
          placeholder="Prefilled message"
          value={block.message}
          onBlur={(event) => onCommit({ message: event.target.value })}
          onChange={(event) => onUpdate({ message: event.target.value })}
        />
      ) : null}
      {!["heading", "text", "divider"].includes(block.type) ? (
        <input
          aria-label="URL or username"
          placeholder="URL, username, or email"
          value={block.url}
          onBlur={(event) => onCommit({ url: event.target.value })}
          onChange={(event) => onUpdate({ url: event.target.value })}
        />
      ) : null}
      {block.type === "image" ? (
        <ImageUploader
          category="block"
          label="Image"
          value={block.imageUrl}
          onChange={(imageUrl) => {
            onUpdate({ imageUrl });
            onCommit({ imageUrl });
          }}
        />
      ) : null}
      {block.type === "video" ? (
        <input
          aria-label="Video URL"
          placeholder="Video URL"
          value={block.videoUrl}
          onBlur={(event) => onCommit({ videoUrl: event.target.value })}
          onChange={(event) => onUpdate({ videoUrl: event.target.value })}
        />
      ) : null}
      <div className="blockActions">
        <button type="button" onClick={onMoveUp} disabled={first}>
          Up
        </button>
        <button type="button" onClick={onMoveDown} disabled={last}>
          Down
        </button>
        <button type="button" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { PublicPage } from "@/components/PublicPage";
import type { AnalyticsReport, BlockType, PageBlock, PageSummary, SmartPage } from "@/lib/types";
import { blockTypes, slugify, themePresets } from "@/lib/utils";

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
  const [pendingPagePatch, setPendingPagePatch] = useState<Partial<SmartPage> | null>(null);
  const [pendingBlockPatches, setPendingBlockPatches] = useState<Record<number, Partial<PageBlock>>>({});
  const [appOrigin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));

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
    setTab("content");
    setAdminMode(mode);
    void loadAnalytics(id);
  }

  async function loadAnalytics(id = activePage?.id) {
    if (!id) return;
    setAnalytics(await api<AnalyticsReport>(`/api/pages/${id}/analytics`));
  }

  function publicUrl(slug: string) {
    return `${appOrigin || ""}/${slug}` || `/${slug}`;
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
    setAdminMode("detail");
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
      <main className="websiteShell">
        <section className="websitePhone">
          <div className="upgradeBar">
            <button type="button" aria-label="Dismiss upgrade message">
              ×
            </button>
            <strong>Manage all your public smart-link pages</strong>
            <span>Admin</span>
          </div>

          <header className="websiteTop">
            <div className="websiteLogo">
              <div className="handMark">SL</div>
              <strong>SmartLink</strong>
            </div>
            <button type="button" className="menuButton" aria-label="Open menu" onClick={logout}>
              ☰
            </button>
          </header>

          <div className="websiteContent">
            <h1>My Websites</h1>

            {newPageOpen && (
              <form className="mobileCreatePanel" onSubmit={createPage}>
                <input name="name" placeholder="Page name, e.g. MIK Solutions" required />
                <input name="slug" placeholder="URL slug, e.g. mik" required />
                <input name="title" placeholder="Profile heading" required />
                <textarea name="bio" placeholder="Short bio or description" required />
                <input name="profileImage" placeholder="Profile image URL" />
                <button type="submit">Create and publish</button>
              </form>
            )}

            <div className="websiteList">
              {filteredPages.map((page) => (
                <button type="button" className="websiteCard" key={page.id} onClick={() => loadPage(page.id)}>
                  <div>
                    <strong>{page.name}</strong>
                    <span>{page.slug}.smartlink.local</span>
                  </div>
                  <em>›</em>
                </button>
              ))}

              <button type="button" className="websiteCard featureCard" onClick={() => setNewPageOpen(true)}>
                <div>
                  <strong>Pages & analytics</strong>
                  <span>Create, publish, and track every link page.</span>
                </div>
                <em>›</em>
              </button>
            </div>

            <button type="button" className="createWebsiteButton" onClick={() => setNewPageOpen((value) => !value)}>
              + Create new website
            </button>
          </div>

          <button type="button" className="helpBubble" aria-label="Open support chat">
            □
          </button>
        </section>
      </main>
    );
  }

  if (adminMode === "detail") {
    const detailActions: { label: string; icon: string; tab: EditorTab }[] = [
      { label: "Edit", icon: "✎", tab: "content" },
      { label: "Audience", icon: "♚", tab: "analytics" },
      { label: "Analytics", icon: "◔", tab: "analytics" },
      { label: "Requests", icon: "●", tab: "integrations" },
      { label: "Products", icon: "▣", tab: "blocks" },
      { label: "Settings", icon: "⚙", tab: "design" },
    ];

    return (
      <main className="websiteShell detailShell">
        <section className="websitePhone detailPhone">
          <header className="detailHeader">
            <button type="button" aria-label="Back to websites" onClick={() => setAdminMode("list")}>
              ←
            </button>
            <h1>{activePage.name}</h1>
            <button type="button" className="outlinePill" onClick={() => savePageNow({ status: activePage.status === "published" ? "draft" : "published" })}>
              {activePage.status === "published" ? "Unpublish" : "Publish"}
            </button>
          </header>

          <div className="detailUrl">{activePage.slug}.smartlink.local</div>

          <div className="quickActions">
            <button type="button" onClick={() => navigator.clipboard?.writeText(publicUrl(activePage.slug))}>
              <span>□</span>
              Copy Link
            </button>
            <a href={`https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(publicUrl(activePage.slug))}`}>
              <span>▦</span>
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
              <span>⌯</span>
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
                <span>{action.icon}</span>
                <strong>{action.label}</strong>
                <em>›</em>
              </button>
            ))}
          </nav>
        </section>
      </main>
    );
  }

  if (adminMode === "editor") {
    return (
      <main className="homepageEditorShell">
        <section className="homepageEditor">
          <header className="homepageEditorTop">
            <button type="button" aria-label="Back to website menu" onClick={() => setAdminMode("detail")}>
              ←
            </button>
            <h1>Homepage</h1>
            <button type="button" aria-label="Share public page" onClick={() => navigator.clipboard?.writeText(publicUrl(activePage.slug))}>
              ⇧
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
            />
          </div>

          <nav className="editorDock" aria-label="Homepage tools">
            <button type="button" onClick={() => document.querySelector(".homepageCanvas")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <span>▱</span>
              Pages
            </button>
            <button type="button" onClick={() => document.getElementById("page-media")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <span>◒</span>
              Style
            </button>
            <button type="button" className="addBlockDockButton" aria-label="Add a block" onClick={() => setBlockPickerOpen(true)}>
              +
            </button>
            <button type="button" onClick={() => window.open(publicUrl(activePage.slug), "_blank", "noopener,noreferrer")}>
              <span>◉</span>
              Preview
            </button>
            <button type="button" onClick={() => document.getElementById("page-media")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <span>⚙</span>
              Settings
            </button>
          </nav>

          {blockPickerOpen && (
            <BlockPickerSheet
              onClose={() => setBlockPickerOpen(false)}
              onProfile={() => {
                setBlockPickerOpen(false);
                window.setTimeout(() => document.getElementById("page-media")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
              }}
              onSelect={addBlock}
            />
          )}
        </section>
      </main>
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
                <input name="profileImage" placeholder="Profile image URL" />
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
                    <Field label="Profile image URL">
                      <input value={activePage.profileImage} onChange={(event) => editPage({ profileImage: event.target.value })} />
                    </Field>
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
                    <Field label="Background image URL">
                      <input
                        value={activePage.theme.backgroundImage}
                        onChange={(event) => editPage({ theme: { ...activePage.theme, backgroundImage: event.target.value } })}
                      />
                    </Field>
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
                    <Field label="OG image URL">
                      <input value={activePage.seo.ogImage} onChange={(event) => editPage({ seo: { ...activePage.seo, ogImage: event.target.value } })} />
                    </Field>
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

const pickerOptions: Array<{ label: string; icon: string; type?: BlockType; patch?: Partial<PageBlock>; profile?: boolean }> = [
  { label: "Profile", icon: "▱", profile: true },
  { label: "Text", icon: "T", type: "text", patch: { title: "Add your text here" } },
  { label: "Links", icon: "↗", type: "link" },
  { label: "Form", icon: "▣", type: "email", patch: { title: "Contact us", subtitle: "Send an enquiry" } },
  { label: "Messengers", icon: "◌", type: "whatsapp" },
  { label: "Socials", icon: "⌘", type: "socials" },
  { label: "Divider", icon: "---", type: "divider" },
  { label: "Products Catalog", icon: "▣", type: "link", patch: { title: "Products catalog" } },
  { label: "Image", icon: "▧", type: "image" },
  { label: "Image Gallery", icon: "▧", type: "image", patch: { title: "Image gallery" } },
  { label: "Features", icon: "☷", type: "heading", patch: { title: "Features" } },
  { label: "FAQ", icon: "☷", type: "text", patch: { title: "Frequently asked questions" } },
  { label: "Timer", icon: "◷", type: "text", patch: { title: "Coming soon" } },
  { label: "Giphy", icon: "GIF", type: "image", patch: { title: "Animated image" } },
  { label: "Video", icon: "▻", type: "video" },
  { label: "Video Gallery", icon: "▻", type: "video", patch: { title: "Video gallery" } },
  { label: "Map", icon: "⌖", type: "website", patch: { title: "Find us", subtitle: "Open map" } },
  { label: "Music", icon: "♫", type: "website", patch: { title: "Listen now" } },
];

function BlockPickerSheet({
  onClose,
  onProfile,
  onSelect,
}: {
  onClose: () => void;
  onProfile: () => void;
  onSelect: (type: BlockType, patch?: Partial<PageBlock>) => void;
}) {
  return (
    <div className="blockPickerBackdrop" role="dialog" aria-modal="true" aria-label="Choose block">
      <section className="blockPickerSheet">
        <header className="blockPickerHeader">
          <button type="button" aria-label="Close block picker" onClick={onClose}>×</button>
          <h2>Choose block</h2>
          <span aria-hidden="true" />
        </header>
        <div className="blockPickerList">
          {pickerOptions.map((option) => (
            <button
              type="button"
              className="blockPickerOption"
              key={option.label}
              onClick={() => (option.profile ? onProfile() : option.type && onSelect(option.type, option.patch))}
            >
              <span className="blockPickerIcon">{option.icon}</span>
              <strong>{option.label}</strong>
              <em>+</em>
            </button>
          ))}
        </div>
      </section>
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
  page,
}: {
  onDeleteBlock: (blockId: number) => void;
  onDuplicateBlock: (blockId: number) => void;
  onCommitBlock: (blockId: number, patch: Partial<PageBlock>) => void;
  onMoveBlock: (blockId: number, direction: -1 | 1) => void;
  onUpdateBlock: (blockId: number, patch: Partial<PageBlock>) => void;
  onSaveProfile: (patch: Partial<SmartPage>) => void;
  page: SmartPage;
}) {
  const blocks = [...page.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? null;
  const editingBlock = blocks.find((block) => block.id === editingBlockId) ?? null;
  const selectedIndex = selectedBlock ? blocks.findIndex((block) => block.id === selectedBlock.id) : -1;

  return (
    <div className="homepagePreviewWrap">
      <div className="homepagePreview">
        <button type="button" className="editRow editableProfile" aria-label="Edit profile and banner" onClick={() => setProfileEditorOpen(true)}>
          <span className="leftHandle">○</span>
          <div className="bannerPreview" style={{ backgroundImage: `url(${page.theme.backgroundImage})` }} />
          <span className="rightHandle">=</span>
        </button>

        <button type="button" className="profileEditBlock editableProfile" aria-label="Edit profile and banner" onClick={() => setProfileEditorOpen(true)}>
          <img src={page.profileImage} alt="" />
          <div>
            <strong>{page.title}</strong>
            <p>{page.bio}</p>
          </div>
        </button>

        {blocks.map((block) => {
          const selected = selectedBlockId === block.id;
          return (
            <div className={`editRow ${selected ? "selectedEditRow" : ""}`} key={block.id}>
              <button
                type="button"
                aria-label={`Select ${block.title || block.type}`}
                className="leftHandle selectBlockHandle"
                onClick={() => setSelectedBlockId(block.id)}
              >
                {selected ? "●" : "○"}
              </button>
              <EditableCanvasBlock
                block={block}
                selected={selected}
                onSelect={() => setSelectedBlockId(block.id)}
              />
              <span className="rightHandle">=</span>
            </div>
          );
        })}
      </div>

      {selectedBlock && (
        <div className="selectedBlockToolbar" aria-label="Selected block actions">
          <button type="button" className="closeToolbarButton" onClick={() => setSelectedBlockId(null)}>
            ×
          </button>
          <button type="button" onClick={() => setEditingBlockId(selectedBlock.id)}>
            <span>✎</span>
            Edit
          </button>
          <button
            type="button"
            disabled={selectedIndex <= 0}
            onClick={() => onMoveBlock(selectedBlock.id, -1)}
          >
            <span>↑</span>
            Up
          </button>
          <button
            type="button"
            disabled={selectedIndex === -1 || selectedIndex >= blocks.length - 1}
            onClick={() => onMoveBlock(selectedBlock.id, 1)}
          >
            <span>↓</span>
            Down
          </button>
          <button type="button" onClick={() => onDeleteBlock(selectedBlock.id)}>
            <span>▢</span>
            Delete
          </button>
          <button type="button" onClick={() => onDuplicateBlock(selectedBlock.id)}>
            <span>□</span>
            Clone
          </button>
          <button
            type="button"
            onClick={() => onCommitBlock(selectedBlock.id, { isActive: !selectedBlock.isActive })}
          >
            <span>{selectedBlock.isActive ? "◌" : "●"}</span>
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

      {profileEditorOpen && (
        <ProfileEditorSheet
          page={page}
          onClose={() => setProfileEditorOpen(false)}
          onSave={(patch) => {
            onSaveProfile(patch);
            setProfileEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}

function EditableCanvasBlock({
  block,
  onSelect,
  selected,
}: {
  block: PageBlock;
  onSelect: () => void;
  selected: boolean;
}) {
  if (block.type === "video") {
    return (
      <div
        role="button"
        tabIndex={0}
        className={`canvasVideo canvasSelectable ${selected ? "canvasSelected" : ""} ${block.isActive ? "" : "disabledBlock"}`}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelect();
        }}
      >
        <PlayableVideo src={block.videoUrl || block.url} title={block.title || "Video"} />
        {block.title && <strong>{block.title}</strong>}
      </div>
    );
  }

  if (["heading", "text", "divider", "image"].includes(block.type)) {
    return (
      <button
        type="button"
        className={`canvasTextBlock canvasSelectable ${selected ? "canvasSelected" : ""} ${block.isActive ? "" : "disabledBlock"}`}
        onClick={onSelect}
      >
        <strong>{block.title || block.type}</strong>
        {block.subtitle && <span>{block.subtitle}</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`canvasLinkButton canvasSelectable ${selected ? "canvasSelected" : ""} ${block.isActive ? "" : "disabledBlock"}`}
      onClick={onSelect}
    >
      <span className="canvasBlockIcon">{canvasIcon(block.type)}</span>
      <div>
        <strong>{block.title || "Untitled link"}</strong>
        {block.subtitle && <small>{block.subtitle}</small>}
      </div>
    </button>
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
  const [title, setTitle] = useState(page.title);
  const [bio, setBio] = useState(page.bio);
  const [changing, setChanging] = useState<"cover" | "photo" | null>(null);

  function save() {
    onSave({
      bio,
      profileImage: photo,
      theme: { ...page.theme, backgroundImage: cover },
      title,
    });
  }

  return (
    <div className="profileSheetBackdrop" role="dialog" aria-modal="true" aria-label="Edit profile">
      <section className="profileEditSheet">
        <header className="profileSheetHeader">
          <button type="button" aria-label="Close profile editor" onClick={onClose}>×</button>
          <h2>Profile</h2>
          <button type="button" aria-label="More profile options">•••</button>
        </header>

        <div className="profileSheetPreview">
          <div className="profileSheetBanner" style={{ backgroundImage: `url(${cover})` }} />
          <div className="profileSheetIdentity">
            <img src={photo} alt="" />
            <div>
              <strong>{title || "Your name"}</strong>
              <p>{bio || "Add a short description"}</p>
            </div>
          </div>
        </div>

        <div className="profileSheetFields">
          <MediaChangeRow label="Cover" preview={cover} active={changing === "cover"} onChange={() => setChanging(changing === "cover" ? null : "cover")}>
            <input value={cover} aria-label="Cover image URL" placeholder="Cover image URL" onChange={(event) => setCover(event.target.value)} />
          </MediaChangeRow>
          <MediaChangeRow label="Profile photo" preview={photo} active={changing === "photo"} onChange={() => setChanging(changing === "photo" ? null : "photo")}>
            <input value={photo} aria-label="Profile photo URL" placeholder="Profile photo URL" onChange={(event) => setPhoto(event.target.value)} />
          </MediaChangeRow>
          <Field label="Title *">
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Subtitle">
            <textarea value={bio} onChange={(event) => setBio(event.target.value)} />
          </Field>
          <button type="button" className="profileSaveButton" onClick={save}>Save changes</button>
        </div>
      </section>
    </div>
  );
}

function MediaChangeRow({
  active,
  children,
  label,
  onChange,
  preview,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onChange: () => void;
  preview: string;
}) {
  return (
    <div className="mediaChangeGroup">
      <div className="mediaChangeRow">
        <img src={preview} alt="" />
        <strong>{label}</strong>
        <button type="button" onClick={onChange}>Change</button>
      </div>
      {active && <div className="mediaUrlField">{children}</div>}
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
  const isPhoneAction = draft.type === "whatsapp" || draft.type === "phone";
  const isVideo = draft.type === "video";

  function save() {
    onSave({
      icon: draft.icon,
      isActive: draft.isActive,
      message: draft.message,
      phone: draft.phone,
      subtitle: draft.subtitle,
      title: draft.title,
      url: isVideo ? draft.videoUrl || draft.url : draft.url,
      videoUrl: isVideo ? draft.videoUrl || draft.url : draft.videoUrl,
    });
  }

  return (
    <div className="linkSheetBackdrop">
      <section className="linkEditSheet" aria-label="Edit selected link">
        <header className="linkSheetHeader">
          <button type="button" aria-label="Close link editor" onClick={onClose}>
            ×
          </button>
          <h2>{isVideo ? "Video" : "Link"}</h2>
          <button type="button" onClick={save}>
            Save
          </button>
        </header>

        <div className="sheetPreview">
          {isVideo ? (
            <PlayableVideo src={draft.videoUrl || draft.url} title={draft.title || "Video"} />
          ) : (
            <div className="canvasLinkButton">
              <span className="canvasBlockIcon">{canvasIcon(draft.type)}</span>
              <strong>{draft.title || "Untitled link"}</strong>
            </div>
          )}
        </div>

        <div className="sheetFields">
          <Field label="Icon">
            <div className="iconChooser">
              <span>{canvasIcon(draft.type)}</span>
              <button type="button">Choose icon</button>
            </div>
          </Field>
          <Field label={isVideo ? "Video title" : "Link title"}>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </Field>
          <Field label="Action *">
            <select
              value={isVideo ? "Play video" : isPhoneAction ? "Call or message" : "Open link"}
              onChange={() => undefined}
            >
              <option>{isVideo ? "Play video" : isPhoneAction ? "Call or message" : "Open link"}</option>
            </select>
          </Field>
          {isPhoneAction ? (
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
      <span>▶</span>
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
  const labels: Partial<Record<PageBlock["type"], string>> = {
    link: "◎",
    website: "◎",
    telegram: "◢",
    whatsapp: "WA",
    email: "@",
    phone: "☎",
    facebook: "f",
    instagram: "IG",
    youtube: "▶",
    messenger: "M",
  };
  return labels[type] ?? "◎";
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
        <input
          aria-label="Image URL"
          placeholder="Image URL"
          value={block.imageUrl}
          onBlur={(event) => onCommit({ imageUrl: event.target.value })}
          onChange={(event) => onUpdate({ imageUrl: event.target.value })}
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

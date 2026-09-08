"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, BarChart3, Check, ChevronDown, FileText, ImageIcon, LayoutDashboard, Link2, Loader2, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Palette, Plus, RefreshCw, Save, Search, Settings, User, X } from "lucide-react";
import type { AnalyticsReport, BlockType, PageBlock, PageSummary, SmartPage, ThemeSettings } from "@/lib/types";
import { adminApi, combineAnalytics } from "@/lib/admin";
import { slugify, summarizePage } from "@/lib/utils";
import { defaultTheme } from "@/lib/defaults";
import { ImageUploader } from "./ImageUploader";
import { BuilderEditor, ThemeGallery, type BuilderTab } from "./admin/BuilderEditor";
import { AnalyticsView, DashboardHome, MediaView, PagesTable, SettingsView } from "./admin/DashboardViews";
import { Dialog, EmptyState, Field, IconButton, SectionHeading, StatusBadge } from "./admin/AdminUI";
import { usePageEditor } from "./admin/usePageEditor";
import "./admin/admin.css";

type View = 'dashboard' | 'pages' | 'create' | 'analytics' | 'media' | 'themes' | 'settings' | 'builder';
const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pages', label: 'Pages', icon: FileText },
  { id: 'create', label: 'Create Page', icon: Plus },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'themes', label: 'Themes', icon: Palette },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

export function AdminDashboard() {
  const [view, setView] = useState<View>('dashboard');
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('updated');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [builderTab, setBuilderTab] = useState<BuilderTab>('profile');
  const [reportPageId, setReportPageId] = useState('all');
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [themePageId, setThemePageId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PageSummary | null>(null);
  const [deleteBlockTarget, setDeleteBlockTarget] = useState<PageBlock | null>(null);
  const [themeSelection, setThemeSelection] = useState<ThemeSettings>(defaultTheme);
  const [createSlug, setCreateSlug] = useState('');
  const actionBusy = useRef(false);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const editor = usePageEditor(useCallback((page: SmartPage) => {
    setPages(current => current.map(item => item.id === page.id ? summarizePage(page) : item));
  }, []));
  const adoptInitialPage = editor.adopt;

  async function run(action: () => Promise<void>) {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'); }
    finally { actionBusy.current = false; setBusy(false); }
  }

  async function refresh() { setPages(await adminApi<PageSummary[]>('/api/pages')); }

  useEffect(() => {
    let cancelled = false;
    Promise.all([adminApi<PageSummary[]>('/api/pages'), adminApi<{ email: string }>('/api/auth/me')]).then(async ([items, account]) => {
      if (cancelled) return;
      setPages(items);
      setEmail(account.email);
      try { setCollapsed(localStorage.getItem('smartlink_sidebar_collapsed') === 'true'); } catch { /* Use the expanded sidebar. */ }
      const cookieSlug = document.cookie.split('; ').find(value => value.startsWith('smartlink_claim='))?.split('=')[1];
      const requested = new URLSearchParams(window.location.search).get('slug') || cookieSlug || '';
      document.cookie = 'smartlink_claim=; Path=/; Max-Age=0; SameSite=Lax';
      if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(requested)) {
        const existing = items.find(item => item.slug === requested);
        if (existing) {
          adoptInitialPage(await adminApi<SmartPage>('/api/pages/' + existing.id));
          setBuilderTab('profile');
          setView('builder');
        } else {
          setCreateSlug(requested);
          setView('create');
        }
      }
    }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the workspace.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [adoptInitialPage]);

  const reportKey = pages.map(page => page.id + ':' + page.views + ':' + page.clicks).join(',');
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const ids = reportKey ? reportKey.split(',').map(item => Number(item.split(':')[0])) : [];
    const selected = view === 'analytics' && reportPageId !== 'all' ? ids.filter(id => id === Number(reportPageId)) : ids;
    Promise.all(selected.map(id => adminApi<AnalyticsReport>('/api/pages/' + id + '/analytics'))).then(reports => {
      if (!cancelled) setReport(combineAnalytics(reports));
    }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load analytics.'); });
    return () => { cancelled = true; };
  }, [reportKey, loading, view, reportPageId]);

  function collapse(value: boolean) {
    setCollapsed(value);
    try { localStorage.setItem('smartlink_sidebar_collapsed', String(value)); } catch { /* Sidebar remains usable without storage. */ }
  }

  function navigate(next: string) {
    void run(async () => {
      await editor.save();
      setView(next as View);
      setDrawerOpen(false);
      if (accountMenu.current) accountMenu.current.open = false;
    });
  }

  function openPage(id: number, tab: BuilderTab = 'profile') {
    void run(async () => {
      await editor.save();
      editor.adopt(await adminApi<SmartPage>('/api/pages/' + id));
      setBuilderTab(tab);
      setView('builder');
      setDrawerOpen(false);
    });
  }

  async function mutateBlocks(action: () => Promise<unknown>) {
    if (!editor.page) return;
    await editor.save();
    await action();
    editor.adopt(await adminApi<SmartPage>('/api/pages/' + editor.page.id));
    await refresh();
  }

  function addBlock(type: BlockType) {
    void run(async () => mutateBlocks(async () => {
      const block = await adminApi<PageBlock>('/api/pages/' + editor.page!.id + '/blocks', { method: 'POST', body: JSON.stringify({ type }) });
      if (type === 'video') await adminApi('/api/blocks/' + block.id, { method: 'PUT', body: JSON.stringify({ url: '', videoUrl: '', title: '', subtitle: '' }) });
    }));
  }

  function moveBlock(id: number, direction: number) {
    void run(async () => mutateBlocks(async () => {
      const ids = [...editor.page!.blocks].sort((a, b) => a.sortOrder - b.sortOrder).map(block => block.id);
      const index = ids.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      await adminApi('/api/blocks/reorder', { method: 'POST', body: JSON.stringify({ pageId: editor.page!.id, blockIds: ids }) });
    }));
  }

  function duplicatePage(id: number) {
    void run(async () => {
      await editor.save();
      editor.adopt(await adminApi<SmartPage>('/api/pages/' + id + '/duplicate', { method: 'POST' }));
      await refresh();
      setBuilderTab('profile');
      setView('builder');
    });
  }

  function logout() {
    void run(async () => { await editor.save(); await adminApi('/api/auth/logout', { method: 'POST' }); window.location.assign('/admin/login'); });
  }

  const filtered = pages.filter(page => (statusFilter === 'all' || page.status === statusFilter) && (page.name + ' ' + page.slug).toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'views' ? b.views - a.views : b.updatedAt.localeCompare(a.updatedAt));
  const heading = view === 'builder' ? 'Page builder' : navigation.find(item => item.id === view)?.label || 'Dashboard';

  function sidebar(drawer = false) {
    return <>
      <div className="admBrand"><Link2 size={21} /><strong>signup.me</strong>{drawer && <IconButton icon={X} label="Close navigation" onClick={() => setDrawerOpen(false)} />}</div>
      <nav aria-label={drawer ? 'Mobile admin navigation' : 'Admin navigation'}>{navigation.map(item => <button type="button" key={item.id} className={view === item.id || view === 'builder' && item.id === 'pages' ? 'admNavActive' : ''} aria-current={view === item.id || view === 'builder' && item.id === 'pages' ? 'page' : undefined} title={item.label} aria-label={item.label} disabled={busy} onClick={() => navigate(item.id)}><item.icon size={19} /><span>{item.label}</span>{item.id === 'pages' && <small>{pages.length}</small>}</button>)}</nav>
      <div className="admSidebarBottom"><button type="button" title="Log out" disabled={busy} onClick={logout}><LogOut size={19} /><span>Logout</span></button>{!drawer && <button type="button" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => collapse(!collapsed)}>{collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}<span>Collapse sidebar</span></button>}</div>
    </>;
  }

  return <div className="admShell" data-collapsed={collapsed}>
    <aside className="admSidebar">{sidebar()}</aside>
    <div className="admWorkspace">
      <header className="admTopbar">
        <div className="admTopbarTitle"><IconButton icon={Menu} label="Open navigation" className="admMenuButton" onClick={() => setDrawerOpen(true)} /><div><span>Workspace</span><h1>{heading}</h1></div></div>
        <form className="admHeaderSearch" role="search" onSubmit={event => { event.preventDefault(); navigate('pages'); }}><Search size={17} /><input aria-label="Search pages" placeholder="Search pages..." value={query} onChange={event => setQuery(event.target.value)} /></form>
        <div className="admHeaderActions">
          {view === 'builder' && editor.page && <><span className={'admSaveStatus ' + (editor.status === 'Save failed' ? 'admDanger' : '')} role="status">{editor.status === 'Saving' ? <Loader2 className="admSpinner" size={15} /> : editor.status === 'Saved' ? <Check size={15} /> : <span className="admUnsavedDot" />}{editor.status}</span><a className="admButton" aria-label="Preview public page" title="Preview public page" href={'/' + editor.page.slug} target="_blank" rel="noreferrer"><ArrowUpRight size={16} /><span>Preview</span></a><button type="button" className="admButton admPrimary" aria-label="Save page" title="Save page" disabled={busy || editor.status === 'Saving'} onClick={() => void run(editor.save)}><Save size={16} /><span>Save</span></button></>}
          <details className="admAccount" ref={accountMenu}><summary aria-label="Admin account menu" title="Admin account menu"><span className="admAvatar"><User size={18} /></span><ChevronDown size={14} /></summary><div><strong>Administrator</strong><small>{email}</small><button type="button" onClick={() => navigate('settings')}><Settings size={16} />Settings</button><button type="button" disabled={busy} onClick={logout}><LogOut size={16} />Log out</button></div></details>
        </div>
      </header>
      <main className={'admMain ' + (view === 'builder' ? 'admMainBuilder' : '')} aria-busy={busy || loading} inert={busy || undefined}>
        {(error || editor.error) && <div className="admError" role="alert"><span>{error || editor.error}</span><IconButton icon={X} label="Dismiss error" onClick={() => { setError(''); editor.clearError(); }} /></div>}
        {loading ? <EmptyState title="Loading workspace..." /> : <>
          {view === 'dashboard' && <DashboardHome pages={pages} analytics={report} onOpen={openPage} onNavigate={navigate} />}
          {view === 'pages' && <><div className="admPageHeading"><div><h2>Pages</h2><p>{pages.length} pages in your workspace</p></div><button type="button" className="admButton admPrimary" onClick={() => navigate('create')}><Plus size={17} />Create page</button></div><div className="admToolbar"><div className="admFilterTabs" role="group" aria-label="Page status">{['all', 'published', 'draft', 'disabled'].map(status => <button type="button" key={status} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>{status === 'all' ? 'All pages' : status}</button>)}</div><div className="admFilters"><select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort pages"><option value="updated">Recently updated</option><option value="name">Name</option><option value="views">Most views</option></select><IconButton icon={RefreshCw} label="Refresh pages" disabled={busy} onClick={() => void run(refresh)} /></div></div><div className="admMobileSearch"><Search size={17} /><input aria-label="Filter pages" placeholder="Search pages..." value={query} onChange={event => setQuery(event.target.value)} /></div><PagesTable pages={filtered} onOpen={openPage} onDuplicate={duplicatePage} onDelete={setDeleteTarget} busy={busy} /></>}
          {view === 'create' && <CreatePage key={createSlug || 'blank'} initialSlug={createSlug} busy={busy} onCreate={input => { void run(async () => { const page = await adminApi<SmartPage>('/api/pages', { method: 'POST', body: JSON.stringify(input) }); editor.adopt(page); setCreateSlug(''); window.history.replaceState({}, '', '/admin'); await refresh(); setBuilderTab('profile'); setView('builder'); }); }} />}
          {view === 'builder' && editor.page && <><div className="admBuilderHeading"><div><IconButton icon={ArrowLeft} label="Back to pages" onClick={() => navigate('pages')} /><span><h2>{editor.page.name}</h2><small>/{editor.page.slug}</small></span></div><div className="admActionRow"><StatusBadge status={editor.page.status} /><select aria-label="Publishing status" value={editor.page.status} onChange={event => editor.edit({ status: event.target.value as SmartPage['status'] })}><option value="published">Published</option><option value="draft">Draft</option><option value="disabled">Disabled</option></select></div></div><BuilderEditor key={editor.page.id} page={editor.page} tab={builderTab} onTab={setBuilderTab} onEdit={editor.edit} onBlock={editor.editBlock} onAdd={addBlock} onMove={moveBlock} onDelete={setDeleteBlockTarget} onDuplicate={block => void run(async () => mutateBlocks(() => adminApi('/api/blocks/' + block.id, { method: 'POST', body: JSON.stringify({ action: 'duplicate' }) })))} busy={busy} /></>}
          {view === 'analytics' && <><SectionHeading title="Page analytics"><select aria-label="Analytics page" value={reportPageId} onChange={event => { setReportPageId(event.target.value); setReport(null); }}><option value="all">All pages</option>{pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}</select></SectionHeading><AnalyticsView report={report} /></>}
          {view === 'media' && <MediaView />}
          {view === 'themes' && <><SectionHeading title="Theme library" /><div className="admThemeApply"><Field label="Apply to page"><select value={themePageId} onChange={event => setThemePageId(event.target.value)}><option value="">Select a page</option>{pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}</select></Field><button type="button" className="admButton admPrimary" disabled={!themePageId || busy} onClick={() => void run(async () => { await editor.save(); const page = await adminApi<SmartPage>('/api/pages/' + themePageId); const nextTheme = { ...themeSelection, backgroundImage: page.theme.backgroundImage, profileLayout: page.theme.profileLayout, profileAlignment: page.theme.profileAlignment, showShareButton: page.theme.showShareButton }; editor.adopt(await adminApi<SmartPage>('/api/pages/' + page.id, { method: 'PUT', body: JSON.stringify({ theme: nextTheme }) })); await refresh(); setBuilderTab('design'); setView('builder'); })}><Check size={16} />Apply theme</button></div><ThemeGallery current={themeSelection} onSelect={setThemeSelection} /></>}
          {view === 'settings' && <SettingsView email={email} collapsed={collapsed} onCollapse={collapse} onLogout={logout} />}
        </>}
      </main>
    </div>
    {drawerOpen && <Dialog title="Navigation" onClose={() => setDrawerOpen(false)}><div className="admDrawer">{sidebar(true)}</div></Dialog>}
    {deleteTarget && <Dialog title="Delete page" onClose={() => setDeleteTarget(null)}><p>Delete &quot;{deleteTarget.name}&quot; and its content?</p><div className="admDialogActions"><button type="button" className="admButton" onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" className="admButton admDestructive" disabled={busy} onClick={() => void run(async () => { await editor.save(); await adminApi('/api/pages/' + deleteTarget.id, { method: 'DELETE' }); setDeleteTarget(null); await refresh(); })}>Delete page</button></div></Dialog>}
    {deleteBlockTarget && <Dialog title="Delete block" onClose={() => setDeleteBlockTarget(null)}><p>Delete &quot;{deleteBlockTarget.title || deleteBlockTarget.type}&quot;?</p><div className="admDialogActions"><button type="button" className="admButton" onClick={() => setDeleteBlockTarget(null)}>Cancel</button><button type="button" className="admButton admDestructive" disabled={busy} onClick={() => void run(async () => { await mutateBlocks(() => adminApi('/api/blocks/' + deleteBlockTarget.id, { method: 'DELETE' })); setDeleteBlockTarget(null); })}>Delete block</button></div></Dialog>}
  </div>;
}

function CreatePage({ busy, initialSlug = '', onCreate }: { busy: boolean; initialSlug?: string; onCreate: (input: { name: string; slug: string; title: string; bio: string; profileImage: string }) => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState(initialSlug);
  const [customSlug, setCustomSlug] = useState(Boolean(initialSlug));
  const [title, setTitle] = useState('');
  const [bio, setBio] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [uploading, setUploading] = useState(false);
  return <><div className="admPageHeading"><div><h2>Create a page</h2><p>{initialSlug ? <>Start building at <strong>/{initialSlug}</strong>.</> : 'A new home for your profile and links.'}</p></div></div><form className="admCreateForm" onSubmit={event => { event.preventDefault(); onCreate({ name, slug, title: title || name, bio, profileImage }); }}><div className="admFormGrid"><Field label="Page name"><input required value={name} onChange={event => { setName(event.target.value); if (!customSlug) setSlug(slugify(event.target.value)); }} /></Field><Field label="URL slug"><input required pattern="[a-z][a-z0-9]*(?:-[a-z0-9]+)*" title="Start with a letter; use lowercase letters, numbers, and single hyphens." value={slug} onChange={event => { setCustomSlug(true); setSlug(slugify(event.target.value)); }} /></Field><div className="admSpanFull"><Field label="Profile title"><input value={title} onChange={event => setTitle(event.target.value)} placeholder={name} /></Field></div><div className="admSpanFull"><Field label="Bio"><textarea rows={4} value={bio} onChange={event => setBio(event.target.value)} /></Field></div><div className="admSpanFull"><ImageUploader category="profile" label="Profile photo" round value={profileImage} onChange={setProfileImage} onBusyChange={setUploading} /></div></div><div className="admFormFooter"><button type="submit" className="admButton admPrimary" disabled={busy || uploading || !name.trim() || !slug}>{busy ? <Loader2 className="admSpinner" size={17} /> : <Plus size={17} />}Create page</button><span className="admMuted">/{slug || 'your-page'}</span></div></form></>;
}

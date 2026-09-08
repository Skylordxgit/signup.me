"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { ArrowUpRight, BarChart3, Bell, Check, Clock3, Copy, Eye, FileText, Globe2, ImageIcon, Link2, LogOut, MousePointer2, Pencil, Plus, RefreshCw, Send, Trash2, User } from "lucide-react";
import type { AnalyticsReport, NotificationSendResult, NotificationSubscriberSummary, PageSummary } from "@/lib/types";
import { adminApi } from "@/lib/admin";
import { isNotificationUrl } from '@/lib/notificationUrl';
import { ImageUploader } from "../ImageUploader";
import { EmptyState, Field, IconButton, SectionHeading, StatusBadge } from "./AdminUI";
import type { MediaFile, UploadCategory } from "@/lib/uploads";

const number = (value: number) => value.toLocaleString();
export function Metrics({ pages }: { pages: PageSummary[] }) {
  const values = [
    { label: 'Total pages', value: pages.length, icon: FileText, tone: 'blue' },
    { label: 'Published pages', value: pages.filter(page => page.status === 'published').length, icon: Globe2, tone: 'green' },
    { label: 'Total views', value: pages.reduce((sum, page) => sum + page.views, 0), icon: Eye, tone: 'violet' },
    { label: 'Total clicks', value: pages.reduce((sum, page) => sum + page.clicks, 0), icon: MousePointer2, tone: 'rose' },
  ];
  return <div className="admMetrics">{values.map(metric => <article className="admMetric" key={metric.label}><div><span>{metric.label}</span><strong>{number(metric.value)}</strong></div><span className={`admMetricIcon admTone-${metric.tone}`}><metric.icon size={21} /></span></article>)}</div>;
}

export function PagesTable({ pages, onOpen, onDuplicate, onDelete, onBulkStatus, busy = false }: { pages: PageSummary[]; onOpen: (id: number) => void; onDuplicate?: (id: number) => void; onDelete?: (page: PageSummary) => void; onBulkStatus?: (ids: number[], status: 'draft' | 'disabled') => Promise<number[]>; busy?: boolean }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const selectedIds = pages.filter(page => selected.includes(page.id)).map(page => page.id);
  const allSelected = pages.length > 0 && selectedIds.length === pages.length;
  async function copyLink(page: PageSummary) {
    try {
      await navigator.clipboard.writeText(new URL('/' + page.slug, window.location.origin).href);
      setMessage(`Link copied for ${page.name}`);
    } catch { setMessage('Could not copy the link. Open Preview and copy the address.'); }
  }
  async function bulkStatus(status: 'draft' | 'disabled') {
    if (!onBulkStatus || busy || !selectedIds.length) return;
    const updated = await onBulkStatus(selectedIds, status);
    setSelected(current => current.filter(id => !updated.includes(id)));
    setMessage(`${updated.length} page${updated.length === 1 ? '' : 's'} ${status === 'draft' ? 'moved to draft' : 'unpublished'}.`);
  }
  return !pages.length ? <EmptyState title="No pages found" /> : <>
    {onBulkStatus && <div className="admBulkActions"><span>{selectedIds.length} selected</span><button type="button" className="admButton" disabled={busy || !selectedIds.length} onClick={() => void bulkStatus('draft')}><FileText size={16} />Move to draft</button><button type="button" className="admButton" disabled={busy || !selectedIds.length} onClick={() => void bulkStatus('disabled')}><Eye size={16} />Unpublish</button>{selectedIds.length > 0 && <button type="button" className="admTextButton" disabled={busy} onClick={() => setSelected([])}>Clear selection</button>}</div>}
    {message && <p className="admMuted" role="status">{message}</p>}
    <div className={`admPageTable ${onBulkStatus ? 'admPageTableManage' : ''}`} role="table" aria-label="Pages">
    <div className="admPageTableHead" role="row"><span role="columnheader" className="admPageSelect">{onBulkStatus && <input type="checkbox" aria-label="Select all visible pages" disabled={busy} checked={allSelected} ref={node => { if (node) node.indeterminate = selectedIds.length > 0 && !allSelected; }} onChange={() => setSelected(allSelected ? [] : pages.map(page => page.id))} />}Page</span><span role="columnheader">Status</span><span role="columnheader">Views</span><span role="columnheader">Clicks</span><span role="columnheader">Updated</span><span role="columnheader"><span className="admSrOnly">Actions</span></span></div>
    {pages.map(page => <div className="admPageRow" role="row" key={page.id}>
      <div role="cell" className="admPageSelect">{onBulkStatus && <input type="checkbox" aria-label={`Select ${page.name}`} disabled={busy} checked={selectedIds.includes(page.id)} onChange={event => setSelected(current => event.target.checked ? [...current, page.id] : current.filter(id => id !== page.id))} />}<button type="button" className="admPageIdentity" onClick={() => onOpen(page.id)} disabled={busy}><span className="admPageGlyph"><Link2 size={18} /></span><span><strong>{page.name}</strong><small>/{page.slug}</small></span></button></div>
      <div role="cell"><StatusBadge status={page.status} /></div><span role="cell" className="admTableNumber">{number(page.views)}</span><span role="cell" className="admTableNumber">{number(page.clicks)}</span>
      <time role="cell" dateTime={page.updatedAt}>{new Date(page.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
      <div role="cell" className="admActionRow">{onBulkStatus && <><a className="admIconButton" href={'/' + page.slug} target="_blank" rel="noreferrer" title={`Preview ${page.name}`} aria-label={`Preview ${page.name}`}><Eye size={18} /></a><IconButton icon={Link2} label={`Copy link for ${page.name}`} onClick={() => void copyLink(page)} /></>}{onDuplicate && <IconButton icon={Copy} label={`Duplicate ${page.name}`} disabled={busy} onClick={() => onDuplicate(page.id)} />}{onDelete && <IconButton icon={Trash2} label={`Delete ${page.name}`} disabled={busy} onClick={() => onDelete(page)} />}<IconButton icon={onBulkStatus ? Pencil : ArrowUpRight} label={`Edit ${page.name}`} disabled={busy} onClick={() => onOpen(page.id)} /></div>
    </div>)}
  </div></>;
}

export function DashboardHome({ pages, analytics, onOpen, onNavigate }: { pages: PageSummary[]; analytics: AnalyticsReport | null; onOpen: (id: number) => void; onNavigate: (view: string) => void }) {
  const recent = [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  return <>
    <div className="admPageHeading"><div><h2>Workspace overview</h2><p>Your pages, traffic, and latest updates.</p></div><button type="button" className="admButton admPrimary" onClick={() => onNavigate('create')}><Plus size={17} />Create page</button></div>
    <Metrics pages={pages} />
    <div className="admHomeGrid"><section><SectionHeading title="Traffic overview"><span className="admMuted">Last 30 days</span></SectionHeading><TrafficChart report={analytics} /></section><section className="admQuickActions"><SectionHeading title="Quick actions" />{[{ label: 'Create a page', icon: Plus, view: 'create' }, { label: 'Manage pages', icon: FileText, view: 'pages' }, { label: 'Upload media', icon: ImageIcon, view: 'media' }, { label: 'Send notification', icon: Bell, view: 'notifications' }, { label: 'View analytics', icon: BarChart3, view: 'analytics' }].map(action => <button type="button" key={action.view} onClick={() => onNavigate(action.view)}><action.icon size={18} /><span>{action.label}</span><ArrowUpRight size={15} /></button>)}</section></div>
    <div className="admHomeGrid"><section><SectionHeading title="Recent pages"><button type="button" className="admTextButton" onClick={() => onNavigate('pages')}>View all<ArrowUpRight size={15} /></button></SectionHeading><PagesTable pages={recent} onOpen={onOpen} /></section><section><SectionHeading title="Recent activity" />{!recent.length ? <EmptyState title="No activity yet" /> : <ul className="admActivity">{recent.map(page => <li key={page.id}><span><Clock3 size={17} /></span><div><button type="button" onClick={() => onOpen(page.id)}>{page.name}</button><small>Page updated</small><time dateTime={page.updatedAt}>{new Date(page.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div></li>)}</ul>}</section></div>
  </>;
}

export function TrafficChart({ report }: { report: AnalyticsReport | null }) {
  if (!report) return <div className="admChartLoading" role="status">Loading traffic...</div>;
  const peak = Math.max(2, ...report.daily.map(day => Math.max(day.views, day.clicks)));
  const views = report.daily.reduce((sum, day) => sum + day.views, 0);
  const clicks = report.daily.reduce((sum, day) => sum + day.clicks, 0);
  return <div className="admTraffic"><div className="admChartLegend"><span><i />Views <strong>{number(views)}</strong></span><span><i />Clicks <strong>{number(clicks)}</strong></span></div>
    <div className="admChart" role="img" aria-label={`Last 30 days: ${views} views and ${clicks} clicks`}>
      <div className="admChartAxis"><span>{number(peak)}</span><span>{number(Math.round(peak / 2))}</span><span>0</span></div>
      <div className="admChartBars">{report.daily.map(day => <div key={day.date} title={`${day.date}: ${day.views} views, ${day.clicks} clicks`}><i style={{ height: `${day.views / peak * 100}%` }} /><b style={{ height: `${day.clicks / peak * 100}%` }} /></div>)}{!views && !clicks && <span className="admChartEmpty">No traffic in this period</span>}</div>
    </div><div className="admChartDates"><span>{report.daily[0]?.date}</span><span>{report.daily.at(-1)?.date}</span></div>
  </div>;
}

export function AnalyticsView({ report }: { report: AnalyticsReport | null }) {
  if (!report) return <EmptyState title="Loading analytics..." />;
  return <><div className="admMetrics">{[['Views', report.views], ['Unique visitors', report.uniqueVisitors], ['Clicks', report.clicks], ['Click-through rate', `${report.ctr}%`]].map(([label, value]) => <article className="admMetric" key={label}><div><span>{label}</span><strong>{typeof value === 'number' ? number(value) : value}</strong></div></article>)}</div>
    <section><SectionHeading title="Traffic"><span className="admMuted">Last 30 days</span></SectionHeading><TrafficChart report={report} /></section>
    <div className="admThreeColumns"><Distribution title="Devices" items={report.devices.map(item => ({ label: item.device, count: item.count }))} /><Distribution title="Top referrers" items={report.referrers.slice(0, 6).map(item => ({ label: item.referrer, count: item.count }))} /><Distribution title="Top links" items={report.topBlocks.map(item => ({ label: item.title, count: item.clicks }))} /></div>
  </>;
}

function Distribution({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  const peak = Math.max(1, ...items.map(item => item.count));
  return <section><SectionHeading title={title} />{!items.length ? <EmptyState title="No data yet" /> : <div className="admDistribution">{items.map((item, index) => <div key={`${item.label}-${index}`}><div><span>{item.label}</span><strong>{number(item.count)}</strong></div><progress max={peak} value={item.count} aria-label={item.label} /></div>)}</div>}</section>;
}

export function MediaView() {
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [category, setCategory] = useState<UploadCategory>('block');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState('');
  const [copied, setCopied] = useState('');
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    try { setMedia(await adminApi<MediaFile[]>('/api/uploads')); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load media.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let cancelled = false;
    adminApi<MediaFile[]>('/api/uploads').then(files => { if (!cancelled) setMedia(files); })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load media.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  async function copy(path: string) {
    try { await navigator.clipboard.writeText(new URL(path, window.location.origin).toString()); setCopied(path); }
    catch { setError('Could not copy the link. Open the image to copy its address.'); }
  }
  const filtered = media.filter(file => filter === 'all' || file.category === filter);
  return <><SectionHeading title="Media library"><IconButton icon={RefreshCw} label="Refresh media" disabled={loading} onClick={() => void refresh()} /></SectionHeading>
    <div className="admMediaUpload"><Field label="Upload category"><select value={category} onChange={event => setCategory(event.target.value as UploadCategory)}>{['profile', 'banner', 'block', 'logo', 'background', 'icon', 'og', 'favicon'].map(value => <option key={value}>{value}</option>)}</select></Field><ImageUploader category={category} label="Upload image" value={uploaded} onChange={path => { setUploaded(path); void refresh(); }} /></div>
    <div className="admToolbar"><span className="admMuted">{media.length} images</span><select aria-label="Filter media" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All media</option>{['profile', 'banner', 'block', 'logo', 'background', 'icon', 'og', 'favicon'].map(value => <option key={value}>{value}</option>)}</select></div>
    {error && <p className="admError" role="alert">{error}</p>}{loading ? <EmptyState title="Loading media..." /> : !filtered.length ? <EmptyState title="No images in this category" /> : <div className="admMediaGrid">{filtered.map(file => <article className="admMediaItem" key={file.path}><a href={file.path} target="_blank" rel="noreferrer" aria-label={`Open ${file.name}`}><img src={file.path} alt={file.name} loading="lazy" /></a><div><span><strong title={file.name}>{file.name}</strong><small>{file.category} · {Math.max(1, Math.round(file.bytes / 1024))} KB</small></span><IconButton icon={copied === file.path ? Check : Copy} label={copied === file.path ? 'Copied' : 'Copy image link'} onClick={() => void copy(file.path)} /></div></article>)}</div>}
  </>;
}

export function NotificationsView({ pages }: { pages: PageSummary[] }) {
  const [summary, setSummary] = useState<NotificationSubscriberSummary>({ total: 0, inactive: 0, byPage: [] });
  const [configured, setConfigured] = useState(false);
  const [pageId, setPageId] = useState('all');
  const [title, setTitle] = useState('New update from signup888');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<NotificationSendResult | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await adminApi<{ configured: boolean; subscribers: NotificationSubscriberSummary }>('/api/admin/notifications');
      setConfigured(data.configured);
      setSummary(data.subscribers);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    adminApi<{ configured: boolean; subscribers: NotificationSubscriberSummary }>('/api/admin/notifications')
      .then(data => {
        if (cancelled) return;
        setConfigured(data.configured);
        setSummary(data.subscribers);
        setError('');
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load notifications.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (sending || loading || !configured || !recipients || !title.trim() || !body.trim()) return;
    if (!isNotificationUrl(url)) { setError('Enter a full HTTPS link or a page path starting with /'); return; }
    setSending(true);
    setResult(null);
    setError('');
    try {
      const response = await adminApi<NotificationSendResult>('/api/admin/notifications/send', {
        method: 'POST',
        body: JSON.stringify({ title, body, url, pageId: pageId === 'all' ? null : Number(pageId) }),
      });
      setResult(response);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send notification.');
    } finally {
      setSending(false);
    }
  }

  const pageCounts = new Map(summary.byPage.map(item => [item.pageId, item.subscribers]));
  const recipients = pageId === 'all' ? summary.total : pageCounts.get(Number(pageId)) ?? 0;
  const selectedPage = pages.find(page => String(page.id) === pageId);

  return <div className="admNotifications">
    <SectionHeading title="Notifications"><IconButton icon={RefreshCw} label="Refresh subscribers" disabled={loading || sending} onClick={() => void refresh()} /></SectionHeading>
    <div className="admNotificationMetrics" aria-busy={loading}>
      <article><span className="admMetricIcon admTone-blue"><User size={19} /></span><div><span>Subscribers</span><strong>{loading ? '...' : number(summary.total)}</strong></div></article>
      <article><span className="admMetricIcon admTone-green"><FileText size={19} /></span><div><span>Pages with subscribers</span><strong>{loading ? '...' : number(summary.byPage.filter(item => item.subscribers > 0).length)}</strong></div></article>
      <article><span className="admMetricIcon admTone-violet"><Bell size={19} /></span><div><span>Delivery status</span><strong className="admDeliveryStatus">{loading ? 'Checking...' : configured ? 'Ready to send' : 'Setup needed'}</strong></div></article>
    </div>
    {!loading && !configured && <details className="admNotificationSetup"><summary>Notifications need setup before you can send</summary><p>Add these keys in your hosting settings, then redeploy:</p><ul><li><code>WEB_PUSH_PUBLIC_KEY</code></li><li><code>NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY</code></li><li><code>WEB_PUSH_PRIVATE_KEY</code></li></ul><p>Both public keys must use the same value.</p></details>}
    {error && <p className="admError" role="alert">{error}</p>}
    {result && <p className={result.failed && !result.sent ? 'admError' : 'admSuccess'} role="status">{number(result.sent)} accepted for delivery · {number(result.failed)} failed · {number(result.removed)} expired marked inactive</p>}
    <div className="admNotificationGrid">
    <form onSubmit={send} className="admNotificationComposer">
      <SectionHeading title="New notification" />
      <fieldset disabled={sending}>
      <div className="admFormStack">
        <Field label="Send to"><select value={pageId} onChange={event => setPageId(event.target.value)}><option value="all">All subscribers ({number(summary.total)})</option>{pages.map(page => <option key={page.id} value={page.id}>/{page.slug} ({number(pageCounts.get(page.id) ?? 0)})</option>)}</select></Field>
        <Field label="Title"><input required maxLength={80} value={title} onChange={event => setTitle(event.target.value)} /></Field>
        <Field label="Message"><textarea rows={4} maxLength={180} required value={body} onChange={event => setBody(event.target.value)} placeholder="Write a short update or offer." /></Field>
        <span className="admMessageCount">{body.length}/180</span>
        <Field label="Destination link"><input required inputMode="url" autoCapitalize="none" spellCheck={false} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/offer or /your-page" /></Field>
        {selectedPage && <button type="button" className="admTextButton" onClick={() => setUrl('/' + selectedPage.slug)}><Link2 size={15} />Use selected page</button>}
      </div>
      </fieldset>
      <div className="admNotificationSend"><span>{loading ? 'Loading audience...' : !recipients ? 'No subscribers in this audience yet' : `${number(recipients)} subscriber${recipients === 1 ? '' : 's'} selected`}</span><button type="submit" className="admButton admPrimary" disabled={sending || loading || !configured || !recipients || !title.trim() || !body.trim() || !url.trim()}><Send size={16} />{sending ? 'Sending...' : 'Send notification'}</button></div>
    </form>
    <aside className="admNotificationAside">
      <section><SectionHeading title="Message preview" /><div className="admPushPreview"><div className="admPushSource"><img src="/favicon.ico" alt="" width={20} height={20} /><span>signup888</span><small>now</small></div><strong>{title.trim() || 'Notification title'}</strong><p>{body.trim() || 'Your message will appear here.'}</p></div></section>
      <section className="admNotificationAudience"><SectionHeading title="Subscribers by page" />{loading ? <p className="admMuted" role="status">Loading subscribers...</p> : !summary.byPage.length ? <div className="admNotificationEmpty"><User size={24} /><strong>No subscribers yet</strong><p>Visitors appear here after allowing notifications on your public pages.</p></div> : <div className="admDistribution">{summary.byPage.map(item => <div key={item.pageId}><div><span>/{item.slug}</span><strong>{number(item.subscribers)}</strong></div><progress max={Math.max(1, summary.total)} value={item.subscribers} aria-label={`/${item.slug} subscribers`} /></div>)}</div>}</section>
    </aside>
    </div>
    <section className="admSubscriberSection">
      <SectionHeading title="Subscriber details"><span className="admMuted">Latest 100 subscriptions</span></SectionHeading>
      <p className="admMuted">Device and browser are reported by the visitor. IP location is approximate; a time zone is not a physical location. Inactive subscribers stay saved, but cannot receive pushes unless they subscribe again.</p>
      {loading ? <p role="status">Loading subscribers...</p> : !summary.recent?.length ? <p className="admMuted">No subscriber details yet.</p> : <div className="admSubscriberScroll" tabIndex={0} role="region" aria-label="Subscriber details">
        <table className="admSubscriberTable">
          <thead><tr><th scope="col">Subscriber</th><th scope="col">Page</th><th scope="col">Status</th><th scope="col">Device / browser</th><th scope="col">IP address</th><th scope="col">Approx. location</th><th scope="col">Time zone</th><th scope="col">Subscribed</th></tr></thead>
          <tbody>{summary.recent.map(item => <tr key={item.id}>
            <td>#{item.id}</td><td>/{item.slug}</td><td>{item.isActive === false ? 'Inactive' : 'Active'}{item.lastFailedAt && <small>Last failed {new Date(item.lastFailedAt).toLocaleString()}</small>}</td><td>{item.device}<small>{item.browser}</small></td>
            <td>{item.ipAddress || 'Not recorded'}</td><td>{[item.city, item.country].filter(Boolean).join(', ') || 'Not recorded'}</td>
            <td>{item.timezone || 'Not recorded'}</td><td><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}

export function SettingsView({ email, collapsed, onCollapse, onLogout }: { email: string; collapsed: boolean; onCollapse: (collapsed: boolean) => void; onLogout: () => void }) {
  const [name, setName] = useState(() => readPreferences().name || '');
  const [avatar, setAvatar] = useState(() => readPreferences().avatar || '');
  const [message, setMessage] = useState('');
  function save(event: React.FormEvent) {
    event.preventDefault();
    try { const previous = JSON.parse(localStorage.getItem('smartlink_profile') || '{}'); localStorage.setItem('smartlink_profile', JSON.stringify({ ...previous, name, avatar })); setMessage('Preferences saved'); } catch { setMessage('Unable to save browser preferences.'); }
  }
  return <div className="admSettingsGrid"><form onSubmit={save}><SectionHeading title="Account preferences" /><div className="admFormStack"><Field label="Display name"><input value={name} onChange={event => setName(event.target.value)} autoComplete="nickname" /></Field><Field label="Signed-in email"><input type="email" readOnly value={email} /></Field><ImageUploader category="profile" label="Account photo" round value={avatar} onChange={setAvatar} /><button type="submit" className="admButton admPrimary"><Check size={16} />Save preferences</button><span role="status" className="admMuted">{message}</span></div></form><section><SectionHeading title="Workspace" /><label className="admCheck"><input type="checkbox" checked={collapsed} onChange={event => onCollapse(event.target.checked)} />Compact sidebar</label><p className="admMuted">Browser preferences</p><div className="admSettingsSession"><User size={20} /><span>{email || 'Administrator'}</span><button type="button" className="admButton" onClick={onLogout}><LogOut size={16} />Log out</button></div></section></div>;
}

function readPreferences(): { name?: string; avatar?: string } {
  try { return JSON.parse(localStorage.getItem('smartlink_profile') || '{}'); } catch { return {}; }
}

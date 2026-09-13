"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { ArrowUpRight, BarChart3, Bell, Check, CheckCircle2, Clock3, Copy, Download, ExternalLink, Eye, FileText, Globe2, History, ImageIcon, LayoutGrid, Link2, List, LogOut, MousePointer2, Power, UserPlus, Pencil, Plus, RefreshCw, Search, Send, Sparkles, Trash2, User } from "lucide-react";
import type { AnalyticsReport, NotificationCampaign, NotificationSendResult, NotificationSubscriberSummary, PageSummary } from "@/lib/types";
import { adminApi } from "@/lib/admin";
import { isNotificationUrl } from '@/lib/notificationUrl';
import { ImageUploader } from "../ImageUploader";
import { Dialog, EmptyState, Field, IconButton, SectionHeading, StatusBadge } from "./AdminUI";
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

export function PagesTable({ pages, onOpen, onDuplicate, onDelete, onBulkStatus, onExport, busy = false }: { pages: PageSummary[]; onOpen: (id: number) => void; onDuplicate?: (id: number) => void; onDelete?: (page: PageSummary) => void; onBulkStatus?: (ids: number[], status: 'draft' | 'disabled') => Promise<number[]>; onExport?: (ids: number[]) => Promise<string>; busy?: boolean }) {
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
  async function exportSelected() {
    if (!onExport || busy || !selectedIds.length) return;
    setMessage('Preparing export...');
    try { setMessage(await onExport(selectedIds)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not export the selected pages.'); }
  }
  async function bulkStatus(status: 'draft' | 'disabled') {
    if (!onBulkStatus || busy || !selectedIds.length) return;
    const updated = await onBulkStatus(selectedIds, status);
    setSelected(current => current.filter(id => !updated.includes(id)));
    setMessage(`${updated.length} page${updated.length === 1 ? '' : 's'} ${status === 'draft' ? 'moved to draft' : 'unpublished'}.`);
  }
  return !pages.length ? <EmptyState title="No pages found" /> : <>
    {onBulkStatus && <div className="admBulkActions"><span>{selectedIds.length} selected</span><button type="button" className="admButton" disabled={busy || !selectedIds.length} onClick={() => void bulkStatus('draft')}><FileText size={16} />Move to draft</button><button type="button" className="admButton" disabled={busy || !selectedIds.length} onClick={() => void bulkStatus('disabled')}><Eye size={16} />Unpublish</button>{onExport && <button type="button" className="admButton" disabled={busy || !selectedIds.length} onClick={() => void exportSelected()}><Download size={16} />Export selected</button>}{selectedIds.length > 0 && <button type="button" className="admTextButton" disabled={busy} onClick={() => setSelected([])}>Clear selection</button>}</div>}
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

export function CampaignHistoryView({
  campaigns,
  pages,
  loading = false,
  onComposeWith,
  onRefresh,
  onGoToCompose,
}: {
  campaigns: NotificationCampaign[];
  pages: PageSummary[];
  loading?: boolean;
  onComposeWith?: (campaign: NotificationCampaign) => void;
  onRefresh?: () => void;
  onGoToCompose?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('all');
  const [engagementFilter, setEngagementFilter] = useState('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'clicks' | 'ctr' | 'delivered'>('newest');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedCampaign, setSelectedCampaign] = useState<NotificationCampaign | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  async function copyLink(url: string) {
    try {
      const full = url.startsWith('/') ? new URL(url, window.location.origin).toString() : url;
      await navigator.clipboard.writeText(full);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(current => current === url ? null : current), 2000);
    } catch {
      // Ignore copy error
    }
  }

  // Aggregate Performance Totals
  const totalCampaigns = campaigns.length;
  const totalAttempted = campaigns.reduce((sum, c) => sum + c.attempted, 0);
  const totalSent = campaigns.reduce((sum, c) => sum + c.sent, 0);
  const totalDelivered = campaigns.reduce((sum, c) => sum + c.delivered, 0);
  const totalSeen = campaigns.reduce((sum, c) => sum + c.seen, 0);
  const totalClicked = campaigns.reduce((sum, c) => sum + c.clicked, 0);
  const overallDeliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : '0.0';
  const overallSeenRate = totalDelivered > 0 ? ((totalSeen / totalDelivered) * 100).toFixed(1) : '0.0';
  const overallCtr = totalSeen > 0 ? ((totalClicked / totalSeen) * 100).toFixed(1) : totalDelivered > 0 ? ((totalClicked / totalDelivered) * 100).toFixed(1) : '0.0';

  // Filtered & Sorted campaigns
  const filteredCampaigns = campaigns.filter(c => {
    if (query.trim()) {
      const q = query.toLowerCase();
      const matchesText = c.title.toLowerCase().includes(q) ||
        c.body.toLowerCase().includes(q) ||
        c.url.toLowerCase().includes(q) ||
        c.audience.toLowerCase().includes(q) ||
        (c.pageSlug && c.pageSlug.toLowerCase().includes(q));
      if (!matchesText) return false;
    }

    if (audienceFilter !== 'all') {
      if (audienceFilter === 'all_subscribers') {
        if (c.pageId !== null) return false;
      } else {
        if (String(c.pageId) !== audienceFilter) return false;
      }
    }

    if (engagementFilter === 'clicked' && c.clicked <= 0) return false;
    if (engagementFilter === 'high_ctr') {
      const ctrVal = c.seen > 0 ? (c.clicked / c.seen) * 100 : c.delivered > 0 ? (c.clicked / c.delivered) * 100 : 0;
      if (ctrVal < 10) return false;
    }
    if (engagementFilter === 'failed' && c.failed === 0 && c.removed === 0) return false;

    return true;
  }).sort((a, b) => {
    if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sort === 'clicks') return b.clicked - a.clicked;
    if (sort === 'delivered') return b.delivered - a.delivered;
    if (sort === 'ctr') {
      const ctrA = a.seen > 0 ? (a.clicked / a.seen) : a.delivered > 0 ? (a.clicked / a.delivered) : 0;
      const ctrB = b.seen > 0 ? (b.clicked / b.seen) : b.delivered > 0 ? (b.clicked / b.delivered) : 0;
      return ctrB - ctrA;
    }
    return 0;
  });

  function getCampaignCtr(c: NotificationCampaign) {
    if (c.seen > 0) return ((c.clicked / c.seen) * 100).toFixed(1);
    if (c.delivered > 0) return ((c.clicked / c.delivered) * 100).toFixed(1);
    return '0.0';
  }

  function getCampaignDeliveredRate(c: NotificationCampaign) {
    if (c.sent > 0) return Math.min(100, Math.round((c.delivered / c.sent) * 100));
    return 0;
  }

  function getCampaignSeenRate(c: NotificationCampaign) {
    if (c.delivered > 0) return Math.min(100, Math.round((c.seen / c.delivered) * 100));
    return 0;
  }

  return <div className="admCampaignHub">
    <div className="admCampaignHubHeader">
      <div>
        <h2>Push Campaign History</h2>
        <p className="admMuted">Track delivery rates, impression reach, and subscriber click conversions across all broadcasts.</p>
      </div>
      <div className="admCampaignHubActions">
        {onRefresh && <IconButton icon={RefreshCw} label="Refresh campaign metrics" disabled={loading} onClick={onRefresh} />}
        {onGoToCompose && <button type="button" className="admButton admPrimary" onClick={onGoToCompose}><Send size={15} />New campaign</button>}
      </div>
    </div>

    {/* Top Aggregate KPI Cards */}
    <div className="admCampaignKpis">
      <article className="admCampaignKpiCard">
        <div className="admCampaignKpiHeader">
          <span>Total Campaigns</span>
          <span className="admCampaignKpiIcon admTone-blue"><History size={16} /></span>
        </div>
        <strong className="admCampaignKpiValue">{number(totalCampaigns)}</strong>
        <small className="admCampaignKpiSub">{number(totalSent)} sent of {number(totalAttempted)} targeted</small>
      </article>

      <article className="admCampaignKpiCard">
        <div className="admCampaignKpiHeader">
          <span>Delivery Rate</span>
          <span className="admCampaignKpiIcon admTone-green"><CheckCircle2 size={16} /></span>
        </div>
        <strong className="admCampaignKpiValue">{overallDeliveryRate}%</strong>
        <small className="admCampaignKpiSub">{number(totalDelivered)} delivered of {number(totalSent)}</small>
      </article>

      <article className="admCampaignKpiCard">
        <div className="admCampaignKpiHeader">
          <span>Seen / Impressions</span>
          <span className="admCampaignKpiIcon admTone-violet"><Eye size={16} /></span>
        </div>
        <strong className="admCampaignKpiValue">{overallSeenRate}%</strong>
        <small className="admCampaignKpiSub">{number(totalSeen)} displayed to users</small>
      </article>

      <article className="admCampaignKpiCard">
        <div className="admCampaignKpiHeader">
          <span>Total Clicks & CTR</span>
          <span className="admCampaignKpiIcon admTone-rose"><MousePointer2 size={16} /></span>
        </div>
        <strong className="admCampaignKpiValue">{overallCtr}%</strong>
        <small className="admCampaignKpiSub">{number(totalClicked)} total clicks generated</small>
      </article>
    </div>

    {/* Filter, Search & Layout Toolbar */}
    <div className="admCampaignToolbar">
      <div className="admCampaignSearchGroup">
        <div className="admCampaignSearch">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search campaigns by title, message, URL..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter by audience"
          value={audienceFilter}
          onChange={e => setAudienceFilter(e.target.value)}
          className="admSelect"
        >
          <option value="all">All audiences</option>
          <option value="all_subscribers">All subscribers broadcast</option>
          {pages.map(page => <option key={page.id} value={String(page.id)}>/{page.slug}</option>)}
        </select>
        <select
          aria-label="Filter by performance"
          value={engagementFilter}
          onChange={e => setEngagementFilter(e.target.value)}
          className="admSelect"
        >
          <option value="all">All performance</option>
          <option value="clicked">With clicks</option>
          <option value="high_ctr">High CTR (≥10%)</option>
          <option value="failed">With errors / expired</option>
        </select>
      </div>

      <div className="admCampaignToolbarRight">
        <select
          aria-label="Sort campaigns"
          value={sort}
          onChange={e => setSort(e.target.value as typeof sort)}
          className="admSelect"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="clicks">Most clicked</option>
          <option value="ctr">Highest CTR</option>
          <option value="delivered">Most delivered</option>
        </select>

        <div className="admCampaignViewToggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={viewMode === 'cards' ? 'active' : ''}
            onClick={() => setViewMode('cards')}
            title="Card grid view"
            aria-label="Card grid view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            className={viewMode === 'table' ? 'active' : ''}
            onClick={() => setViewMode('table')}
            title="Table view"
            aria-label="Table view"
          >
            <List size={16} />
          </button>
        </div>
      </div>
    </div>

    {/* Content Area: Cards or Table */}
    {loading && !campaigns.length ? (
      <div className="admEmpty"><p>Loading campaign history...</p></div>
    ) : !campaigns.length ? (
      <div className="admEmpty admCampaignEmptyState">
        <span className="admCampaignEmptyIcon"><History size={36} /></span>
        <h3>No notification campaigns sent yet</h3>
        <p>Send your first push update or special offer to all your subscribers.</p>
        {onGoToCompose && (
          <button type="button" className="admButton admPrimary" onClick={onGoToCompose}>
            <Send size={15} />Compose your first campaign
          </button>
        )}
      </div>
    ) : !filteredCampaigns.length ? (
      <div className="admEmpty">
        <h3>No campaigns match your filters</h3>
        <p>Try clearing your search query or adjusting the audience/performance filters.</p>
        <button type="button" className="admButton" onClick={() => { setQuery(''); setAudienceFilter('all'); setEngagementFilter('all'); }}>
          Reset filters
        </button>
      </div>
    ) : viewMode === 'cards' ? (
      <div className="admCampaignCards">
        {filteredCampaigns.map(campaign => {
          const ctr = getCampaignCtr(campaign);
          const delRate = getCampaignDeliveredRate(campaign);
          const seenRate = getCampaignSeenRate(campaign);
          const hasIssues = campaign.failed > 0 || campaign.removed > 0;
          const isHighCtr = parseFloat(ctr) >= 10 && campaign.clicked > 0;

          return <article key={campaign.id} className="admCampaignCard">
            <div className="admCampaignCardTop">
              <div className="admCampaignCardTitleArea">
                <div className="admCampaignCardBadgeRow">
                  <span className="admCampaignAudienceBadge">
                    {campaign.pageId ? <FileText size={12} /> : <Globe2 size={12} />}
                    {campaign.audience}
                  </span>
                  {isHighCtr ? (
                    <span className="admCampaignStatusPill highCtr"><Sparkles size={12} />High CTR ({ctr}%)</span>
                  ) : delRate === 100 && !hasIssues ? (
                    <span className="admCampaignStatusPill completed"><Check size={12} />100% Delivered</span>
                  ) : hasIssues ? (
                    <span className="admCampaignStatusPill partial">Partial ({campaign.failed + campaign.removed} issue{campaign.failed + campaign.removed === 1 ? '' : 's'})</span>
                  ) : (
                    <span className="admCampaignStatusPill neutral">Sent</span>
                  )}
                </div>
                <h3 className="admCampaignCardTitle">{campaign.title}</h3>
                <div className="admCampaignCardMeta">
                  <time dateTime={campaign.createdAt} title={campaign.createdAt}>
                    <Clock3 size={13} />
                    {new Date(campaign.createdAt).toLocaleString()}
                  </time>
                  <span>·</span>
                  <span>ID #{campaign.id}</span>
                </div>
              </div>
            </div>

            <p className="admCampaignCardBody">{campaign.body}</p>

            <div className="admCampaignLinkRow">
              <span className="admMuted">Destination:</span>
              <a
                href={campaign.url}
                target="_blank"
                rel="noreferrer"
                className="admCampaignLinkPill"
                title={`Open ${campaign.url}`}
              >
                <span>{campaign.url}</span>
                <ExternalLink size={12} />
              </a>
              <button
                type="button"
                className="admTextButton"
                onClick={() => void copyLink(campaign.url)}
                title="Copy destination link"
              >
                {copiedUrl === campaign.url ? <Check size={13} /> : <Copy size={13} />}
                {copiedUrl === campaign.url ? 'Copied' : 'Copy link'}
              </button>
            </div>

            {/* Visual Conversion Funnel */}
            <div className="admCampaignFunnelGrid">
              <div className="admCampaignFunnelStep">
                <div className="admCampaignFunnelStepLabel">
                  <span>Sent</span>
                  <small>{campaign.attempted > campaign.sent ? `${number(campaign.sent)}/${number(campaign.attempted)}` : '100%'}</small>
                </div>
                <strong className="admCampaignFunnelStepValue">{number(campaign.sent)}</strong>
                <div className="admCampaignFunnelBar">
                  <div className="admCampaignFunnelBarFill sent" style={{ width: '100%' }} />
                </div>
              </div>

              <div className="admCampaignFunnelStep">
                <div className="admCampaignFunnelStepLabel">
                  <span>Delivered</span>
                  <span className="admCampaignFunnelStepRate">{delRate}%</span>
                </div>
                <strong className="admCampaignFunnelStepValue">{number(campaign.delivered)}</strong>
                <div className="admCampaignFunnelBar">
                  <div className="admCampaignFunnelBarFill delivered" style={{ width: `${delRate}%` }} />
                </div>
              </div>

              <div className="admCampaignFunnelStep">
                <div className="admCampaignFunnelStepLabel">
                  <span>Seen / Screen</span>
                  <span className="admCampaignFunnelStepRate">{seenRate}%</span>
                </div>
                <strong className="admCampaignFunnelStepValue">{number(campaign.seen)}</strong>
                <div className="admCampaignFunnelBar">
                  <div className="admCampaignFunnelBarFill seen" style={{ width: `${seenRate}%` }} />
                </div>
              </div>

              <div className="admCampaignFunnelStep">
                <div className="admCampaignFunnelStepLabel">
                  <span>Clicked</span>
                  <span className="admCampaignFunnelStepRate highlight">{ctr}% CTR</span>
                </div>
                <strong className="admCampaignFunnelStepValue">{number(campaign.clicked)}</strong>
                <div className="admCampaignFunnelBar">
                  <div className="admCampaignFunnelBarFill clicked" style={{ width: `${Math.min(100, (parseFloat(ctr) || 0) * 2)}%` }} />
                </div>
              </div>
            </div>

            {hasIssues && (
              <div className="admCampaignIssuesNote">
                <span className="admCampaignIssueBadge">{number(campaign.failed)} failed</span>
                <span className="admCampaignIssueBadge">{number(campaign.removed)} expired / inactive</span>
              </div>
            )}

            <div className="admCampaignCardActions">
              <button
                type="button"
                className="admButton"
                onClick={() => setSelectedCampaign(campaign)}
              >
                <Eye size={14} />Inspect & preview
              </button>
              {onComposeWith && (
                <button
                  type="button"
                  className="admButton"
                  onClick={() => onComposeWith(campaign)}
                >
                  <Copy size={14} />Reuse in composer
                </button>
              )}
            </div>
          </article>;
        })}
      </div>
    ) : (
      <div className="admSubscriberScroll" tabIndex={0} role="region" aria-label="Campaign history table">
        <table className="admSubscriberTable admCampaignDetailedTable">
          <thead>
            <tr>
              <th scope="col" style={{ width: '150px' }}>Date sent</th>
              <th scope="col">Campaign & message</th>
              <th scope="col" style={{ width: '130px' }}>Audience</th>
              <th scope="col" style={{ width: '90px' }}>Sent</th>
              <th scope="col" style={{ width: '90px' }}>Delivered</th>
              <th scope="col" style={{ width: '80px' }}>Seen</th>
              <th scope="col" style={{ width: '100px' }}>Clicks (CTR)</th>
              <th scope="col" style={{ width: '100px' }}>Status</th>
              <th scope="col" style={{ width: '110px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCampaigns.map(campaign => {
              const ctr = getCampaignCtr(campaign);
              const delRate = getCampaignDeliveredRate(campaign);
              return <tr key={campaign.id}>
                <td>
                  <time dateTime={campaign.createdAt} style={{ fontSize: '12px' }}>
                    {new Date(campaign.createdAt).toLocaleDateString()}<br />
                    <span className="admMuted">{new Date(campaign.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </time>
                </td>
                <td>
                  <strong>{campaign.title}</strong>
                  <p className="admCampaignTableBody">{campaign.body}</p>
                  <a href={campaign.url} target="_blank" rel="noreferrer" className="admTableLink">
                    {campaign.url} <ExternalLink size={10} />
                  </a>
                </td>
                <td><span className="admCampaignAudienceBadge">{campaign.audience}</span></td>
                <td>
                  <strong>{number(campaign.sent)}</strong>
                  {campaign.attempted > campaign.sent && <small>of {number(campaign.attempted)}</small>}
                </td>
                <td>
                  <strong>{number(campaign.delivered)}</strong>
                  <small>{delRate}%</small>
                </td>
                <td>
                  <strong>{number(campaign.seen)}</strong>
                </td>
                <td>
                  <strong className="admHighlightClicks">{number(campaign.clicked)}</strong>
                  <small className="admHighlightCtr">{ctr}% CTR</small>
                </td>
                <td>
                  {campaign.failed > 0 || campaign.removed > 0 ? (
                    <span className="admCampaignStatusPill partial">{number(campaign.failed + campaign.removed)} err</span>
                  ) : (
                    <span className="admCampaignStatusPill completed">OK</span>
                  )}
                </td>
                <td>
                  <div className="admTableActions">
                    <button type="button" className="admTextButton" onClick={() => setSelectedCampaign(campaign)} title="View preview & details">
                      <Eye size={14} />
                    </button>
                    {onComposeWith && (
                      <button type="button" className="admTextButton" onClick={() => onComposeWith(campaign)} title="Reuse in composer">
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    )}

    {/* Campaign Detail Modal */}
    {selectedCampaign && (
      <Dialog title={`Campaign #${selectedCampaign.id} Breakdown`} onClose={() => setSelectedCampaign(null)}>
        <div className="admCampaignDetailModal">
          <SectionHeading title="Push notification preview" />
          <div className="admPushModalPreview">
            <div className="admPushModalHeader">
              <img src="/favicon.ico" alt="" width={22} height={22} />
              <div>
                <strong>signup888</strong>
                <small> · push notification</small>
              </div>
              <time>now</time>
            </div>
            <h4 className="admPushModalTitle">{selectedCampaign.title}</h4>
            <p className="admPushModalBody">{selectedCampaign.body}</p>
            <div className="admPushModalUrl">
              <ExternalLink size={13} />
              <span>{selectedCampaign.url}</span>
            </div>
          </div>

          <SectionHeading title="Delivery & conversion analytics" />
          <div className="admCampaignFunnelGrid">
            <div className="admCampaignFunnelStep">
              <div className="admCampaignFunnelStepLabel"><span>Sent</span></div>
              <strong className="admCampaignFunnelStepValue">{number(selectedCampaign.sent)}</strong>
              <small className="admMuted">of {number(selectedCampaign.attempted)} attempted</small>
            </div>
            <div className="admCampaignFunnelStep">
              <div className="admCampaignFunnelStepLabel"><span>Delivered</span></div>
              <strong className="admCampaignFunnelStepValue">{number(selectedCampaign.delivered)}</strong>
              <small className="admCampaignFunnelStepRate">{getCampaignDeliveredRate(selectedCampaign)}% rate</small>
            </div>
            <div className="admCampaignFunnelStep">
              <div className="admCampaignFunnelStepLabel"><span>Seen</span></div>
              <strong className="admCampaignFunnelStepValue">{number(selectedCampaign.seen)}</strong>
              <small className="admCampaignFunnelStepRate">{getCampaignSeenRate(selectedCampaign)}% seen</small>
            </div>
            <div className="admCampaignFunnelStep">
              <div className="admCampaignFunnelStepLabel"><span>Clicked</span></div>
              <strong className="admCampaignFunnelStepValue">{number(selectedCampaign.clicked)}</strong>
              <small className="admCampaignFunnelStepRate highlight">{getCampaignCtr(selectedCampaign)}% CTR</small>
            </div>
          </div>

          <div className="admCampaignDetailMetadata">
            <div className="admCampaignDetailMetaItem">
              <span>Audience Target</span>
              <strong>{selectedCampaign.audience}</strong>
            </div>
            <div className="admCampaignDetailMetaItem">
              <span>Broadcast Timestamp</span>
              <strong>{new Date(selectedCampaign.createdAt).toLocaleString()}</strong>
            </div>
            <div className="admCampaignDetailMetaItem">
              <span>Failed Deliveries</span>
              <strong>{number(selectedCampaign.failed)}</strong>
            </div>
            <div className="admCampaignDetailMetaItem">
              <span>Expired / Removed</span>
              <strong>{number(selectedCampaign.removed)}</strong>
            </div>
          </div>

          <div className="admDialogActions">
            <a
              href={selectedCampaign.url}
              target="_blank"
              rel="noreferrer"
              className="admButton"
            >
              <ExternalLink size={15} />Test destination link
            </a>
            {onComposeWith && (
              <button
                type="button"
                className="admButton admPrimary"
                onClick={() => {
                  const target = selectedCampaign;
                  setSelectedCampaign(null);
                  onComposeWith(target);
                }}
              >
                <Send size={15} />Reuse in composer
              </button>
            )}
          </div>
        </div>
      </Dialog>
    )}
  </div>;
}

export function NotificationsView({ pages, initialTab = 'composer' }: { pages: PageSummary[]; initialTab?: 'composer' | 'campaigns' | 'subscribers' }) {
  const [tab, setTab] = useState<'composer' | 'campaigns' | 'subscribers'>(initialTab);
  const [summary, setSummary] = useState<NotificationSubscriberSummary>({ total: 0, inactive: 0, byPage: [] });
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([]);
  const [configured, setConfigured] = useState(false);
  const [pageId, setPageId] = useState('all');
  const [title, setTitle] = useState('New update from signup888');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [subscriberQuery, setSubscriberQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<NotificationSendResult | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await adminApi<{ configured: boolean; subscribers: NotificationSubscriberSummary; campaigns: NotificationCampaign[] }>('/api/admin/notifications');
      setConfigured(data.configured);
      setSummary(data.subscribers);
      setCampaigns(data.campaigns);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    adminApi<{ configured: boolean; subscribers: NotificationSubscriberSummary; campaigns: NotificationCampaign[] }>('/api/admin/notifications')
      .then(data => {
        if (cancelled) return;
        setConfigured(data.configured);
        setSummary(data.subscribers);
        setCampaigns(data.campaigns);
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
      if (response.campaign) setCampaigns(current => [response.campaign!, ...current.filter(item => item.id !== response.campaign!.id)].slice(0, 100));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send notification.');
    } finally {
      setSending(false);
    }
  }

  function handleComposeWith(campaign: NotificationCampaign) {
    setTitle(campaign.title);
    setBody(campaign.body);
    setUrl(campaign.url);
    setPageId(campaign.pageId !== null ? String(campaign.pageId) : 'all');
    setTab('composer');
  }

  const pageCounts = new Map(summary.byPage.map(item => [item.pageId, item.subscribers]));
  const recipients = pageId === 'all' ? summary.total : pageCounts.get(Number(pageId)) ?? 0;
  const selectedPage = pages.find(page => String(page.id) === pageId);

  const filteredSubscribers = (summary.recent || []).filter(sub => {
    if (!subscriberQuery.trim()) return true;
    const q = subscriberQuery.toLowerCase();
    return sub.slug.toLowerCase().includes(q) ||
      (sub.device && sub.device.toLowerCase().includes(q)) ||
      (sub.browser && sub.browser.toLowerCase().includes(q)) ||
      (sub.ipAddress && sub.ipAddress.toLowerCase().includes(q)) ||
      (sub.city && sub.city.toLowerCase().includes(q)) ||
      (sub.country && sub.country.toLowerCase().includes(q));
  });

  return <div className="admNotifications">
    <SectionHeading title="Notifications">
      <IconButton icon={RefreshCw} label="Refresh subscribers and campaigns" disabled={loading || sending} onClick={() => void refresh()} />
    </SectionHeading>

    {/* Sub-Navigation Tabs */}
    <div className="admSubNav" role="tablist" aria-label="Notification sections">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'composer'}
        aria-current={tab === 'composer' ? 'page' : undefined}
        onClick={() => setTab('composer')}
      >
        <Send size={15} />
        <span>Compose notification</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'campaigns'}
        aria-current={tab === 'campaigns' ? 'page' : undefined}
        onClick={() => setTab('campaigns')}
      >
        <History size={15} />
        <span>Campaign history</span>
        <span className="admSubNavBadge">{campaigns.length}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'subscribers'}
        aria-current={tab === 'subscribers' ? 'page' : undefined}
        onClick={() => setTab('subscribers')}
      >
        <User size={15} />
        <span>Subscribers</span>
        <span className="admSubNavBadge">{summary.total}</span>
      </button>
    </div>

    {error && <p className="admError" role="alert">{error}</p>}

    {/* Composer View */}
    {tab === 'composer' && (
      <>
        <div className="admNotificationMetrics" aria-busy={loading}>
          <article>
            <span className="admMetricIcon admTone-blue"><User size={19} /></span>
            <div><span>Subscribers</span><strong>{loading ? '...' : number(summary.total)}</strong></div>
          </article>
          <article>
            <span className="admMetricIcon admTone-green"><FileText size={19} /></span>
            <div><span>Pages with subscribers</span><strong>{loading ? '...' : number(summary.byPage.filter(item => item.subscribers > 0).length)}</strong></div>
          </article>
          <article>
            <span className="admMetricIcon admTone-violet"><Bell size={19} /></span>
            <div><span>Delivery status</span><strong className="admDeliveryStatus">{loading ? 'Checking...' : configured ? 'Ready to send' : 'Setup needed'}</strong></div>
          </article>
        </div>

        {!loading && !configured && (
          <details className="admNotificationSetup">
            <summary>Notifications need setup before you can send</summary>
            <p>Add these keys in your hosting settings, then redeploy:</p>
            <ul>
              <li><code>WEB_PUSH_PUBLIC_KEY</code></li>
              <li><code>NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY</code></li>
              <li><code>WEB_PUSH_PRIVATE_KEY</code></li>
            </ul>
            <p>Both public keys must use the same value.</p>
          </details>
        )}

        {result && (
          <div className={result.failed && !result.sent ? 'admError' : 'admSuccess'} role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <span>{number(result.sent)} accepted for delivery · {number(result.failed)} failed · {number(result.removed)} expired marked inactive</span>
            <button type="button" className="admButton" style={{ background: 'white', fontSize: '12.5px', padding: '4px 10px' }} onClick={() => setTab('campaigns')}>
              <History size={13} /> View in campaign history
            </button>
          </div>
        )}

        <div className="admNotificationGrid">
          <form onSubmit={send} className="admNotificationComposer">
            <SectionHeading title="New notification" />
            <fieldset disabled={sending}>
              <div className="admFormStack">
                <Field label="Send to">
                  <select value={pageId} onChange={event => setPageId(event.target.value)}>
                    <option value="all">All subscribers ({number(summary.total)})</option>
                    {pages.map(page => <option key={page.id} value={page.id}>/{page.slug} ({number(pageCounts.get(page.id) ?? 0)})</option>)}
                  </select>
                </Field>
                <Field label="Title">
                  <input required maxLength={80} value={title} onChange={event => setTitle(event.target.value)} />
                </Field>
                <Field label="Message">
                  <textarea rows={4} maxLength={180} required value={body} onChange={event => setBody(event.target.value)} placeholder="Write a short update or offer." />
                </Field>
                <span className="admMessageCount">{body.length}/180</span>
                <Field label="Destination link">
                  <input required inputMode="url" autoCapitalize="none" spellCheck={false} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/offer or /your-page" />
                </Field>
                {selectedPage && (
                  <button type="button" className="admTextButton" onClick={() => setUrl('/' + selectedPage.slug)}>
                    <Link2 size={15} />Use selected page
                  </button>
                )}
              </div>
            </fieldset>
            <div className="admNotificationSend">
              <span>{loading ? 'Loading audience...' : !recipients ? 'No subscribers in this audience yet' : `${number(recipients)} subscriber${recipients === 1 ? '' : 's'} selected`}</span>
              <button type="submit" className="admButton admPrimary" disabled={sending || loading || !configured || !recipients || !title.trim() || !body.trim() || !url.trim()}>
                <Send size={16} />{sending ? 'Sending...' : 'Send notification'}
              </button>
            </div>
          </form>

          <aside className="admNotificationAside">
            <section>
              <SectionHeading title="Message preview" />
              <div className="admPushPreview">
                <div className="admPushSource">
                  <img src="/favicon.ico" alt="" width={20} height={20} />
                  <span>signup888</span>
                  <small>now</small>
                </div>
                <strong>{title.trim() || 'Notification title'}</strong>
                <p>{body.trim() || 'Your message will appear here.'}</p>
              </div>
            </section>
            <section className="admNotificationAudience">
              <SectionHeading title="Subscribers by page" />
              {loading ? (
                <p className="admMuted" role="status">Loading subscribers...</p>
              ) : !summary.byPage.length ? (
                <div className="admNotificationEmpty">
                  <User size={24} />
                  <strong>No subscribers yet</strong>
                  <p>Visitors appear here after allowing notifications on your public pages.</p>
                </div>
              ) : (
                <div className="admDistribution">
                  {summary.byPage.map(item => <div key={item.pageId}>
                    <div><span>/{item.slug}</span><strong>{number(item.subscribers)}</strong></div>
                    <progress max={Math.max(1, summary.total)} value={item.subscribers} aria-label={`/${item.slug} subscribers`} />
                  </div>)}
                </div>
              )}
            </section>
          </aside>
        </div>
      </>
    )}

    {/* Campaign History Hub */}
    {tab === 'campaigns' && (
      <CampaignHistoryView
        campaigns={campaigns}
        pages={pages}
        loading={loading}
        onComposeWith={handleComposeWith}
        onRefresh={() => void refresh()}
        onGoToCompose={() => setTab('composer')}
      />
    )}

    {/* Subscribers Hub */}
    {tab === 'subscribers' && (
      <div className="admSubscriberHub">
        <div className="admNotificationMetrics" aria-busy={loading}>
          <article>
            <span className="admMetricIcon admTone-blue"><User size={19} /></span>
            <div><span>Total active subscribers</span><strong>{loading ? '...' : number(summary.total)}</strong></div>
          </article>
          <article>
            <span className="admMetricIcon admTone-violet"><FileText size={19} /></span>
            <div><span>Inactive / unsubscribed</span><strong>{loading ? '...' : number(summary.inactive)}</strong></div>
          </article>
          <article>
            <span className="admMetricIcon admTone-green"><Globe2 size={19} /></span>
            <div><span>Subscribed pages</span><strong>{loading ? '...' : number(summary.byPage.filter(i => i.subscribers > 0).length)}</strong></div>
          </article>
        </div>

        <section className="admSubscriberSection">
          <SectionHeading title="Audience distribution by page" />
          {!summary.byPage.length ? (
            <p className="admMuted">No subscribers on any page yet.</p>
          ) : (
            <div className="admDistributionGrid">
              {summary.byPage.map(item => (
                <div key={item.pageId} className="admDistributionCard">
                  <div className="admDistributionCardHead">
                    <span className="admAudienceSlug">/{item.slug}</span>
                    <strong>{number(item.subscribers)} subscriber{item.subscribers === 1 ? '' : 's'}</strong>
                  </div>
                  <progress max={Math.max(1, summary.total)} value={item.subscribers} aria-label={`/${item.slug} subscribers`} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admSubscriberSection">
          <div className="admSubscriberToolbar">
            <SectionHeading title="Subscriber details">
              <span className="admMuted">Latest 100 subscriptions</span>
            </SectionHeading>
            <div className="admCampaignSearch" style={{ maxWidth: '280px' }}>
              <Search size={15} />
              <input
                type="search"
                placeholder="Filter by page, city, device, IP..."
                value={subscriberQuery}
                onChange={e => setSubscriberQuery(e.target.value)}
              />
            </div>
          </div>
          <p className="admMuted">Device and browser are reported by the visitor. IP location is approximate; a time zone is not a physical location. Inactive subscribers stay saved, but cannot receive pushes unless they subscribe again.</p>

          {loading ? (
            <p role="status">Loading subscribers...</p>
          ) : !filteredSubscribers.length ? (
            <p className="admMuted">No subscribers found matching your criteria.</p>
          ) : (
            <div className="admSubscriberScroll" tabIndex={0} role="region" aria-label="Subscriber details">
              <table className="admSubscriberTable">
                <thead>
                  <tr>
                    <th scope="col">Subscriber</th>
                    <th scope="col">Page</th>
                    <th scope="col">Status</th>
                    <th scope="col">Device / browser</th>
                    <th scope="col">IP address</th>
                    <th scope="col">Approx. location</th>
                    <th scope="col">Time zone</th>
                    <th scope="col">Subscribed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscribers.map(item => <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td><span className="admCampaignAudienceBadge">/{item.slug}</span></td>
                    <td>
                      {item.isActive === false ? (
                        <span className="admCampaignStatusPill partial">Inactive</span>
                      ) : (
                        <span className="admCampaignStatusPill completed">Active</span>
                      )}
                      {item.lastFailedAt && <small>Last failed {new Date(item.lastFailedAt).toLocaleString()}</small>}
                    </td>
                    <td>{item.device}<small>{item.browser}</small></td>
                    <td><code>{item.ipAddress || 'Not recorded'}</code></td>
                    <td>{[item.city, item.country].filter(Boolean).join(', ') || 'Not recorded'}</td>
                    <td>{item.timezone || 'Not recorded'}</td>
                    <td><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    )}
  </div>;
}

export function SettingsView({
  collapsed,
  email,
  isMaster,
  onBrandingChanged,
  onCollapse,
  onLogout,
}: {
  collapsed: boolean;
  email: string;
  isMaster?: boolean;
  onBrandingChanged?: (branding: { name: string; logo: string }) => void;
  onCollapse: (collapsed: boolean) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    adminApi<{ name: string; avatar: string }>('/api/admin/preferences').then(value => { if (!cancelled) { setName(value.name); setAvatar(value.avatar); } }).catch(cause => { if (!cancelled) setMessage(cause.message); });
    return () => { cancelled = true; };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try { await adminApi('/api/admin/preferences', { method: 'PATCH', body: JSON.stringify({ name, avatar }) }); setMessage('Preferences saved'); } catch { setMessage('Unable to save preferences.'); }
  }
  return <div className="admSettingsStack">
    <div className="admSettingsGrid"><form onSubmit={save}><SectionHeading title="Account preferences" /><div className="admFormStack"><Field label="Display name"><input value={name} onChange={event => setName(event.target.value)} autoComplete="nickname" /></Field><Field label="Signed-in email"><input type="email" readOnly value={email} /></Field><ImageUploader category="profile" label="Account photo" round value={avatar} onChange={setAvatar} /><button type="submit" className="admButton admPrimary"><Check size={16} />Save preferences</button><span role="status" className="admMuted">{message}</span></div></form><section><SectionHeading title="Workspace" /><label className="admCheck"><input type="checkbox" checked={collapsed} onChange={event => onCollapse(event.target.checked)} />Compact sidebar</label><p className="admMuted">Browser preferences</p><div className="admSettingsSession"><User size={20} /><span>{email || 'Administrator'}</span><button type="button" className="admButton" onClick={onLogout}><LogOut size={16} />Log out</button></div></section></div>
    {isMaster && <MasterSettings onBrandingChanged={onBrandingChanged} />}
  </div>;
}
type BrandingSettings = { name: string; siteTitle: string; logo: string; favicon: string };
type SignupSettings = { enabled: boolean };

const fallbackBranding: BrandingSettings = {
  name: "signup888",
  siteTitle: "signup888 - Your Link. Your World.",
  logo: "/signup888-logo.png",
  favicon: "/favicon.ico",
};

function MasterSettings({ onBrandingChanged }: { onBrandingChanged?: (branding: { name: string; logo: string }) => void }) {
  const [branding, setBranding] = useState<BrandingSettings>(fallbackBranding);
  const [signup, setSignup] = useState<SignupSettings>({ enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adminApi<BrandingSettings>('/api/master/branding'),
      adminApi<SignupSettings>('/api/master/signup'),
    ]).then(([brand, signupSettings]) => {
      if (cancelled) return;
      setBranding(brand);
      setSignup(signupSettings);
      onBrandingChanged?.({ name: brand.name, logo: brand.logo });
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load master settings.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [onBrandingChanged]);

  async function saveBranding(next = branding) {
    if (saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await adminApi<BrandingSettings>('/api/master/branding', { method: 'PATCH', body: JSON.stringify(next) });
      setBranding(saved);
      onBrandingChanged?.({ name: saved.name, logo: saved.logo });
      setMessage('Branding saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save branding.');
    } finally {
      setSaving(false);
    }
  }

  async function updateBrandingImage(key: 'logo' | 'favicon', value: string) {
    const next = { ...branding, [key]: value || fallbackBranding[key] };
    setBranding(next);
    await saveBranding(next);
  }

  async function updateSignup(enabled: boolean) {
    if (saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      setSignup(await adminApi<SignupSettings>('/api/master/signup', { method: 'PATCH', body: JSON.stringify({ enabled }) }));
      setMessage(`Signup turned ${enabled ? 'on' : 'off'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update signup.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="admMasterSettings" aria-busy={loading || saving}>
    <SectionHeading title="Master controls" />
    {error && <p className="admError" role="alert">{error}</p>}
    {message && <p className="admSuccess" role="status">{message}</p>}
    <div className="admSettingsGrid">
      <section className="admBrandingPanel">
        <div className="admSettingRow">
          <div>
            <span className={`admBadge admBadge-${signup.enabled ? 'published' : 'disabled'}`}><UserPlus size={13} />Signup {signup.enabled ? 'on' : 'off'}</span>
            <h2>Public account creation</h2>
            <p className="admMuted">Turn signup off to block the create-account page and prevent new accounts from being created.</p>
          </div>
          <button type="button" className="admButton admPrimary" disabled={loading || saving} onClick={() => void updateSignup(!signup.enabled)}>
            <Power size={16} />Turn {signup.enabled ? 'off' : 'on'}
          </button>
        </div>
      </section>
      <section className="admBrandingPanel">
        <SectionHeading title="Branding" />
        <div className="admFormGrid">
          <Field label="Brand name"><input maxLength={80} value={branding.name} onChange={event => setBranding({ ...branding, name: event.target.value })} /></Field>
          <Field label="Site title"><input maxLength={140} value={branding.siteTitle} onChange={event => setBranding({ ...branding, siteTitle: event.target.value })} /></Field>
          <div className="admSpanFull"><ImageUploader endpoint="/api/master/branding/upload" category="logo" label="Master logo" round value={branding.logo} onChange={logo => void updateBrandingImage('logo', logo)} /></div>
          <div className="admSpanFull"><ImageUploader endpoint="/api/master/branding/upload" category="favicon" label="Master favicon" value={branding.favicon} onChange={favicon => void updateBrandingImage('favicon', favicon)} /></div>
        </div>
        <div className="admFormFooter">
          <button type="button" className="admButton admPrimary" disabled={loading || saving} onClick={() => void saveBranding()}>{saving ? 'Saving...' : 'Save branding'}</button>
        </div>
      </section>
    </div>
  </section>;
}

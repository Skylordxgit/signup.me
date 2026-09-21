"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { ArrowUpRight, BarChart3, Bell, Calendar, Check, ChevronDown, Clock3, Copy, Download, ExternalLink, Eye, FileText, FolderOpen, Globe2, History, ImageIcon, Inbox, LayoutGrid, Link2, List, Loader2, LogOut, MousePointer2, Power, UserPlus, Pencil, Plus, RefreshCw, Search, Send, Sparkles, Trash2, User } from "lucide-react";
import type { AnalyticsReport, NotificationCampaign, NotificationSendResult, NotificationSubscriberSummary, PageSummary } from "@/lib/types";
import { adminApi } from "@/lib/admin";
import { isNotificationUrl } from '@/lib/notificationUrl';
import { ImageUploader } from "../ImageUploader";
import { Button, Dialog, EmptyState, Field, IconButton, LoadingState, PageHeader, SectionCard, SectionHeading, StatusBadge } from "./AdminUI";
import type { MediaFile, UploadCategory } from "@/lib/uploads";

const number = (value: number) => value.toLocaleString();

export function getCountryFlag(countryNameOrCode: string): string {
  if (!countryNameOrCode) return '🌐';
  const name = countryNameOrCode.toLowerCase().trim();
  if (name.includes('bangladesh') || name === 'bd') return '🇧🇩';
  if (name.includes('united states') || name === 'us' || name === 'usa') return '🇺🇸';
  if (name.includes('united kingdom') || name === 'uk' || name === 'gb') return '🇬🇧';
  if (name.includes('india') || name === 'in') return '🇮🇳';
  if (name.includes('pakistan') || name === 'pk') return '🇵🇰';
  if (name.includes('canada') || name === 'ca') return '🇨🇦';
  if (name.includes('australia') || name === 'au') return '🇦🇺';
  if (name.includes('germany') || name === 'de') return '🇩🇪';
  if (name.includes('france') || name === 'fr') return '🇫🇷';
  if (name.includes('spain') || name === 'es') return '🇪🇸';
  if (name.includes('italy') || name === 'it') return '🇮🇹';
  if (name.includes('netherlands') || name === 'nl') return '🇳🇱';
  if (name.includes('brazil') || name === 'br') return '🇧🇷';
  if (name.includes('united arab emirates') || name.includes('uae') || name === 'ae') return '🇦🇪';
  if (name.includes('saudi arabia') || name === 'sa') return '🇸🇦';
  if (name.includes('japan') || name === 'jp') return '🇯🇵';
  if (name.includes('china') || name === 'cn') return '🇨🇳';
  if (name.includes('south korea') || name === 'kr') return '🇰🇷';
  if (name.includes('singapore') || name === 'sg') return '🇸🇬';
  if (name.includes('malaysia') || name === 'my') return '🇲🇾';
  if (name.includes('indonesia') || name === 'id') return '🇮🇩';
  if (name.includes('thailand') || name === 'th') return '🇹🇭';
  if (name.includes('philippines') || name === 'ph') return '🇵🇭';
  if (name.includes('vietnam') || name === 'vn') return '🇻🇳';
  if (name.includes('turkey') || name === 'tr') return '🇹🇷';
  if (name.includes('egypt') || name === 'eg') return '🇪🇬';
  if (name.includes('nigeria') || name === 'ng') return '🇳🇬';
  if (name.includes('south africa') || name === 'za') return '🇿🇦';
  if (name.includes('sweden') || name === 'se') return '🇸🇪';
  if (name.includes('norway') || name === 'no') return '🇳🇴';
  if (name.includes('denmark') || name === 'dk') return '🇩🇰';
  if (name.includes('finland') || name === 'fi') return '🇫🇮';
  if (name.includes('ireland') || name === 'ie') return '🇮🇪';
  if (name.includes('new zealand') || name === 'nz') return '🇳🇿';
  if (name.includes('mexico') || name === 'mx') return '🇲🇽';
  return '🌐';
}

export function DateRangeFilterControl({
  dateRange,
  startDate = '',
  endDate = '',
  onDateRangeChange,
  onCustomDateChange,
}: {
  dateRange: string;
  startDate?: string;
  endDate?: string;
  onDateRangeChange: (range: string) => void;
  onCustomDateChange?: (start: string, end: string) => void;
}) {
  return (
    <div className="admDateRangeGroup">
      <div className="admDateRangeSelectWrapper">
        <Calendar size={14} className="admDateRangeIcon" aria-hidden="true" />
        <select
          aria-label="Filter date range"
          className="admDateRangeSelect"
          value={dateRange}
          onChange={event => {
            const val = event.target.value;
            onDateRangeChange(val);
          }}
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="month">This month</option>
          <option value="all">All time</option>
          <option value="custom">Custom date range...</option>
        </select>
      </div>
      {dateRange === 'custom' && (
        <div className="admCustomDateInputs">
          <div className="admDateInputItem">
            <label htmlFor="adm-date-from">From</label>
            <input
              id="adm-date-from"
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={e => onCustomDateChange?.(e.target.value, endDate || '')}
            />
          </div>
          <div className="admDateInputItem">
            <label htmlFor="adm-date-to">To</label>
            <input
              id="adm-date-to"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={e => onCustomDateChange?.(startDate || '', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function Metrics({
  pages,
  analytics,
}: {
  pages: PageSummary[];
  analytics?: AnalyticsReport | null;
}) {
  const totalViews = analytics?.views ?? pages.reduce((sum, page) => sum + page.views, 0);
  const totalClicks = analytics?.clicks ?? pages.reduce((sum, page) => sum + page.clicks, 0);
  const uniqueVisitors = analytics?.uniqueVisitors ?? pages.reduce((sum, page) => sum + page.uniqueVisitors, 0);
  const ctr = analytics?.ctr ?? (totalViews ? Number(((totalClicks / totalViews) * 100).toFixed(1)) : 0);
  const activeCountries = analytics?.countries?.length ?? (analytics?.locations?.length || 0);

  const values = [
    { label: 'Total views', value: totalViews, icon: Eye, tone: 'violet' },
    { label: 'Unique visitors', value: uniqueVisitors, icon: Globe2, tone: 'blue' },
    { label: 'Total clicks', value: totalClicks, icon: MousePointer2, tone: 'rose' },
    { label: 'Click rate (CTR)', value: `${ctr}%`, icon: BarChart3, tone: 'green', isRaw: true },
    { label: 'Active regions', value: activeCountries, icon: Globe2, tone: 'blue' },
  ];
  return (
    <div className="admMetrics">
      {values.map(metric => (
        <article className="admMetric" key={metric.label}>
          <div>
            <span>{metric.label}</span>
            <strong>{metric.isRaw ? metric.value : number(Number(metric.value))}</strong>
          </div>
          <span className={`admMetricIcon admTone-${metric.tone}`}><metric.icon size={21} /></span>
        </article>
      ))}
    </div>
  );
}

export function PagesTable({ pages, onOpen, onDuplicate, onDelete, onBulkStatus, onExport, onCreate, busy = false }: { pages: PageSummary[]; onOpen: (id: number) => void; onDuplicate?: (id: number) => void; onDelete?: (page: PageSummary) => void; onBulkStatus?: (ids: number[], status: 'draft' | 'disabled') => Promise<number[]>; onExport?: (ids: number[]) => Promise<string>; onCreate?: () => void; busy?: boolean }) {
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
  return !pages.length ? <EmptyState icon={FileText} title="No pages yet" description={onCreate ? 'Create your first page to start collecting views and clicks.' : 'Pages you create will appear here.'}>{onCreate && <Button variant="primary" icon={Plus} onClick={onCreate}>Create page</Button>}</EmptyState> : <>
    {onBulkStatus && <div className="admBulkActions"><span>{selectedIds.length} selected</span><Button size="sm" icon={FileText} disabled={busy || !selectedIds.length} onClick={() => void bulkStatus('draft')}>Move to draft</Button><Button size="sm" icon={Eye} disabled={busy || !selectedIds.length} onClick={() => void bulkStatus('disabled')}>Unpublish</Button>{onExport && <Button size="sm" icon={Download} disabled={busy || !selectedIds.length} onClick={() => void exportSelected()}>Export selected</Button>}{selectedIds.length > 0 && <button type="button" className="admTextButton" disabled={busy} onClick={() => setSelected([])}>Clear selection</button>}</div>}
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

export function DashboardHome({
  pages,
  analytics,
  dateRange = '30',
  startDate,
  endDate,
  reportPageId = 'all',
  onDateRangeChange,
  onCustomDateChange,
  onPageChange,
  onOpen,
  onNavigate,
}: {
  pages: PageSummary[];
  analytics: AnalyticsReport | null;
  dateRange?: string;
  startDate?: string;
  endDate?: string;
  reportPageId?: string;
  onDateRangeChange?: (range: string) => void;
  onCustomDateChange?: (start: string, end: string) => void;
  onPageChange?: (pageId: string) => void;
  onOpen: (id: number) => void;
  onNavigate: (view: string) => void;
}) {
  const recent = [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const rangeLabel = dateRange === 'all'
    ? 'All time'
    : dateRange === 'today'
    ? 'Today'
    : dateRange === 'yesterday'
    ? 'Yesterday'
    : dateRange === 'month'
    ? 'This month'
    : dateRange === 'custom' && startDate && endDate
    ? `${startDate} to ${endDate}`
    : `Last ${dateRange} days`;

  return <>
    <PageHeader title="Dashboard" description="Real-time performance, geographic location intelligence, and page activity.">
      <div className="admActionRow admDashboardHeaderActions">
        {onPageChange && (
          <select
            aria-label="Filter by page"
            className="admPageSelectDropdown"
            value={reportPageId}
            onChange={e => onPageChange(e.target.value)}
          >
            <option value="all">All pages</option>
            {pages.map(page => (
              <option key={page.id} value={page.id}>{page.name}</option>
            ))}
          </select>
        )}
        {onDateRangeChange && (
          <DateRangeFilterControl
            dateRange={dateRange}
            startDate={startDate}
            endDate={endDate}
            onDateRangeChange={onDateRangeChange}
            onCustomDateChange={onCustomDateChange}
          />
        )}
        <Button variant="primary" icon={Plus} onClick={() => onNavigate('create')}>Create page</Button>
      </div>
    </PageHeader>

    <Metrics pages={pages} analytics={analytics} />

    <div className="admHomeGrid">
      <SectionCard title="Traffic trend overview" actions={<span className="admMuted">{rangeLabel}</span>}>
        <TrafficChart report={analytics} rangeLabel={rangeLabel} />
      </SectionCard>
      <SectionCard title="Quick actions">
        <div className="admQuickActions">
          {[
            { label: 'Create a page', icon: Plus, view: 'create' },
            { label: 'Manage pages', icon: FileText, view: 'pages' },
            { label: 'Upload media', icon: ImageIcon, view: 'media' },
            { label: 'Send notification', icon: Bell, view: 'notifications' },
            { label: 'Explore themes', icon: Sparkles, view: 'themes' },
          ].map(action => (
            <button type="button" key={action.view} onClick={() => onNavigate(action.view)}>
              <action.icon size={17} aria-hidden="true" />
              <span>{action.label}</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
      </SectionCard>
    </div>

    {/* In-depth Country and City Geographic Intelligence */}
    <SectionCard
      title="Geographic Intelligence & City Drill-Down"
      actions={<span className="admMuted">{(analytics?.countries || []).length} countries recorded</span>}
    >
      <CountryDrilldownView report={analytics} />
    </SectionCard>

    <div className="admHomeGrid">
      <SectionCard title="Geographic location graph (Views vs Clicks)" actions={<span className="admMuted">{(analytics?.locations || []).length} active regions</span>}>
        <LocationChart report={analytics} />
      </SectionCard>
      <SectionCard title="Detailed link clicks by location" actions={<span className="admMuted">{analytics?.linkLocations?.length || 0} link placements</span>}>
        <LocationDetailsCard report={analytics} />
      </SectionCard>
    </div>

    <div className="admThreeColumns">
      <Distribution title="Top links" items={(analytics?.topBlocks || []).map(item => ({ label: item.title, count: item.clicks }))} />
      <Distribution title="Devices" items={(analytics?.devices || []).map(item => ({ label: item.device, count: item.count }))} />
      <Distribution title="Top referrers" items={(analytics?.referrers || []).slice(0, 6).map(item => ({ label: item.referrer, count: item.count }))} />
    </div>

    <div className="admHomeGrid">
      <SectionCard title="Live Visitor & Click Activity" actions={<span className="admMuted">{analytics?.recentActivity?.length || 0} latest events</span>}>
        <RecentActivityFeed report={analytics} onOpen={onOpen} />
      </SectionCard>
      <SectionCard title="Recent pages" actions={<button type="button" className="admTextButton" onClick={() => onNavigate('pages')}>View all<ArrowUpRight size={15} aria-hidden="true" /></button>}>
        <PagesTable pages={recent} onOpen={onOpen} onCreate={() => onNavigate('create')} />
      </SectionCard>
    </div>
  </>;
}

export function TrafficChart({ report, rangeLabel }: { report: AnalyticsReport | null; rangeLabel?: string }) {
  if (!report) return <div className="admChartLoading" role="status">Loading traffic...</div>;
  const peak = Math.max(2, ...report.daily.map(day => Math.max(day.views, day.clicks)));
  const views = report.daily.reduce((sum, day) => sum + day.views, 0);
  const clicks = report.daily.reduce((sum, day) => sum + day.clicks, 0);
  const label = rangeLabel || (report.days === 'all' ? 'All time' : `Last ${report.days || 30} days`);
  return <div className="admTraffic"><div className="admChartLegend"><span><i />Views <strong>{number(views)}</strong></span><span><i />Clicks <strong>{number(clicks)}</strong></span></div>
    <div className="admChart" role="img" aria-label={`${label}: ${views} views and ${clicks} clicks`}>
      <div className="admChartAxis"><span>{number(peak)}</span><span>{number(Math.round(peak / 2))}</span><span>0</span></div>
      <div className="admChartBars">{report.daily.map(day => <div key={day.date} title={`${day.date}: ${day.views} views, ${day.clicks} clicks`}><i style={{ height: `${day.views / peak * 100}%` }} /><b style={{ height: `${day.clicks / peak * 100}%` }} /></div>)}{!views && !clicks && <span className="admChartEmpty">No traffic in this period</span>}</div>
    </div><div className="admChartDates"><span>{report.daily[0]?.date}</span><span>{report.daily.at(-1)?.date}</span></div>
  </div>;
}

export function CountryDrilldownView({ report }: { report: AnalyticsReport | null }) {
  const [search, setSearch] = useState('');
  const [expandedCountries, setExpandedCountries] = useState<Record<string, boolean>>({});

  if (!report) return <div className="admChartLoading" role="status">Loading geographic data...</div>;

  const countries = report.countries || [];
  if (!countries.length) {
    return (
      <EmptyState
        icon={Globe2}
        title="No country data yet"
        description="Detailed country and city traffic reports will appear here as visitors interact with your pages."
      />
    );
  }

  const query = search.toLowerCase().trim();
  const filtered = countries.filter(c => {
    if (!query) return true;
    const nameMatch = (c.countryName || '').toLowerCase().includes(query);
    const codeMatch = (c.countryCode || '').toLowerCase().includes(query);
    if (nameMatch || codeMatch) return true;
    return c.cities.some(ct => (ct.city || '').toLowerCase().includes(query) || (ct.location || '').toLowerCase().includes(query));
  });

  const totalCountries = countries.length;
  const totalCities = countries.reduce((sum, c) => sum + c.cities.length, 0);
  const peakCountryViews = Math.max(1, ...countries.map(c => c.views));
  const peakCountryClicks = Math.max(1, ...countries.map(c => c.clicks));

  function toggleCountry(countryName: string) {
    setExpandedCountries(prev => ({
      ...prev,
      [countryName]: !prev[countryName],
    }));
  }

  return (
    <div className="admCountryDrilldown">
      <div className="admCountryDrilldownToolbar">
        <div className="admCountrySearch">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search country or city (e.g. Bangladesh, Dhaka, New York)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Filter countries or cities"
          />
        </div>
        <div className="admCountrySummaryStats">
          <span><strong>{totalCountries}</strong> {totalCountries === 1 ? 'country' : 'countries'}</span>
          <span><strong>{totalCities}</strong> {totalCities === 1 ? 'city' : 'cities'}</span>
        </div>
      </div>

      {!filtered.length ? (
        <div className="admNoResults">No regions match &quot;{search}&quot;</div>
      ) : (
        <div className="admCountryList">
          {filtered.map(country => {
            const countryDisplayName = country.countryName || 'Unknown';
            const isExpanded = expandedCountries[countryDisplayName] ?? (filtered.length === 1 || country.cities.length <= 2);
            const flag = getCountryFlag(countryDisplayName || country.countryCode || '');
            const countryShare = Math.max(4, Math.round(((country.clicks + country.views) / (peakCountryViews + peakCountryClicks)) * 100));

            return (
              <div className={`admCountryCard ${isExpanded ? 'isExpanded' : ''}`} key={countryDisplayName}>
                <div
                  className="admCountryCardHeader"
                  onClick={() => toggleCountry(countryDisplayName)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleCountry(countryDisplayName); }}
                >
                  <div className="admCountryIdentity">
                    <span className="admCountryFlag" aria-hidden="true">{flag}</span>
                    <div className="admCountryTitles">
                      <strong>{countryDisplayName}</strong>
                      <small>{country.cities.length} {country.cities.length === 1 ? 'city' : 'cities'}</small>
                    </div>
                  </div>

                  <div className="admCountryStatsRow">
                    <span className="admCountryStatItem admViewsStat">
                      <Eye size={13} aria-hidden="true" />
                      <strong>{number(country.views)}</strong> views
                    </span>
                    <span className="admCountryStatItem admClicksStat">
                      <MousePointer2 size={13} aria-hidden="true" />
                      <strong>{number(country.clicks)}</strong> clicks
                    </span>
                    <span className="admLocationCtrBadge">
                      {country.ctr}% CTR
                    </span>
                    <span className="admCountryToggleIcon">
                      <ChevronDown size={17} className={isExpanded ? 'admRotate180' : ''} aria-hidden="true" />
                    </span>
                  </div>
                </div>

                <div className="admCountryShareBar">
                  <div className="admCountryShareFill" style={{ width: `${countryShare}%` }} />
                </div>

                {isExpanded && (
                  <div className="admCityList">
                    <div className="admCityListHead">
                      <span>City / Location</span>
                      <span style={{ textAlign: 'center' }}>Views</span>
                      <span style={{ textAlign: 'center' }}>Clicks</span>
                      <span style={{ textAlign: 'center' }}>CTR</span>
                      <span style={{ textAlign: 'right' }}>Top Clicked Links</span>
                    </div>

                    {country.cities.map((city, cIdx) => (
                      <div className="admCityRow" key={`${city.city}-${cIdx}`}>
                        <div className="admCityName">
                          <Globe2 size={14} aria-hidden="true" />
                          <div>
                            <strong>{city.city}</strong>
                            {city.location && city.location !== city.city && (
                              <small>{city.location}</small>
                            )}
                          </div>
                        </div>

                        <div className="admCityMetric admViewsMetric">
                          <strong>{number(city.views)}</strong>
                        </div>

                        <div className="admCityMetric admClicksMetric">
                          <strong>{number(city.clicks)}</strong>
                        </div>

                        <div className="admCityMetric">
                          <span className="admCityCtrBadge">{city.ctr}%</span>
                        </div>

                        <div className="admCityTopLinks">
                          {!city.topLinks.length ? (
                            <span className="admMutedSmall">No link clicks</span>
                          ) : (
                            <div className="admCityLinkPills">
                              {city.topLinks.map((link, lIdx) => {
                                const linkLabel = link.blockTitle || link.url || `Link #${link.blockId || lIdx + 1}`;
                                return (
                                  <span className="admCityLinkPill" key={link.blockId || lIdx} title={`${linkLabel}: ${link.clicks} clicks`}>
                                    <MousePointer2 size={11} aria-hidden="true" />
                                    <span className="admPillTitle">{linkLabel}</span>
                                    <span className="admPillCount">{link.clicks}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RecentActivityFeed({
  report,
  onOpen,
}: {
  report: AnalyticsReport | null;
  onOpen?: (id: number) => void;
}) {
  if (!report) return <div className="admChartLoading" role="status">Loading recent activity...</div>;
  const activity = report.recentActivity || [];

  if (!activity.length) {
    return <EmptyState icon={Clock3} title="No activity recorded" description="Live views and link clicks will appear in this feed as visitors engage." />;
  }

  return (
    <div className="admRecentActivityFeed">
      <ul className="admActivityList">
        {activity.map((event) => {
          const isClick = event.type === 'click';
          const flag = getCountryFlag(event.country);
          const locationLabel = event.city && event.country ? `${event.city}, ${event.country}` : (event.country || event.city || event.location || 'Direct');

          return (
            <li className={`admActivityFeedItem ${isClick ? 'isClick' : 'isView'}`} key={event.id}>
              <div className="admActivityIcon">
                {isClick ? <MousePointer2 size={15} /> : <Eye size={15} />}
              </div>
              <div className="admActivityDetails">
                <div className="admActivityHeadline">
                  {isClick ? (
                    <span>
                      Clicked <strong>{event.blockTitle || 'Link'}</strong> on {onOpen && event.pageId ? <button type="button" className="admInlinePageLink" onClick={() => onOpen(event.pageId)}>/{event.pageName || 'page'}</button> : <code>/{event.pageName || 'page'}</code>}
                    </span>
                  ) : (
                    <span>
                      Viewed {onOpen && event.pageId ? <button type="button" className="admInlinePageLink" onClick={() => onOpen(event.pageId)}>/{event.pageName || 'page'}</button> : <code>/{event.pageName || 'page'}</code>}
                    </span>
                  )}
                </div>
                <div className="admActivityMeta">
                  <span className="admActivityGeo" title={locationLabel}>
                    <span className="admActivityFlag">{flag}</span>
                    {locationLabel}
                  </span>
                  {event.device && (
                    <span className="admActivityDevice">
                      {event.device}
                    </span>
                  )}
                  {event.referrer && event.referrer !== 'Direct' && (
                    <span className="admActivityReferrer" title={`From ${event.referrer}`}>
                      via {event.referrer.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}
                    </span>
                  )}
                  <time dateTime={event.date} className="admActivityTime">
                    {new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LocationChart({ report }: { report: AnalyticsReport | null }) {
  if (!report) return <div className="admChartLoading" role="status">Loading locations...</div>;
  const locations = report.locations || [];
  if (!locations.length) {
    return (
      <EmptyState
        icon={Globe2}
        title="No location data yet"
        description="Geographic graph will appear here as visitors view pages and click links."
      />
    );
  }

  const peakViews = Math.max(1, ...locations.map(l => l.views));
  const peakClicks = Math.max(1, ...locations.map(l => l.clicks));
  const totalViews = locations.reduce((sum, l) => sum + l.views, 0);
  const totalClicks = locations.reduce((sum, l) => sum + l.clicks, 0);

  return (
    <div className="admLocationChart">
      <div className="admLocationChartLegend">
        <span><i className="admDotClicks" /> Link clicks (<strong>{number(totalClicks)}</strong>)</span>
        <span><i className="admDotViews" /> Page views (<strong>{number(totalViews)}</strong>)</span>
      </div>
      <div className="admLocationChartList">
        {locations.slice(0, 8).map((item, index) => {
          const ctr = item.views > 0 ? ((item.clicks / item.views) * 100).toFixed(1) : (item.clicks > 0 ? '100' : '0');
          const clicksWidth = Math.max(4, Math.round((item.clicks / peakClicks) * 100));
          const viewsWidth = Math.max(4, Math.round((item.views / peakViews) * 100));
          const flag = getCountryFlag(item.country || item.location);

          return (
            <div className="admLocationChartItem" key={`${item.location}-${index}`}>
              <div className="admLocationChartItemHead">
                <div className="admLocationChartName">
                  <span className="admFlagSmall">{flag}</span>
                  <span title={item.location || item.country || 'Direct / Local'}>
                    {item.location || item.country || 'Direct / Local'}
                  </span>
                </div>
                <div className="admLocationChartStats">
                  <span><strong>{number(item.clicks)}</strong> clicks</span>
                  <span><strong>{number(item.views)}</strong> views</span>
                  <span className="admLocationCtrBadge">{ctr}% CTR</span>
                </div>
              </div>
              <div className="admLocationChartBars">
                <div className="admLocationBarRow">
                  <div className="admLocationBarTrack">
                    <div className="admLocationBarFill admBarClicks" style={{ width: `${item.clicks > 0 ? clicksWidth : 0}%` }} />
                  </div>
                  <span className="admLocationBarLabel">{number(item.clicks)} clk</span>
                </div>
                <div className="admLocationBarRow">
                  <div className="admLocationBarTrack">
                    <div className="admLocationBarFill admBarViews" style={{ width: `${item.views > 0 ? viewsWidth : 0}%` }} />
                  </div>
                  <span className="admLocationBarLabel">{number(item.views)} view</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LocationDetailsCard({ report }: { report: AnalyticsReport | null }) {
  if (!report) return <div className="admChartLoading" role="status">Loading location data...</div>;
  const linkLocations = report.linkLocations || [];
  if (!linkLocations.length) {
    const locations = report.locations || [];
    if (!locations.length) {
      return <EmptyState icon={Globe2} title="No location data yet" description="Visitor geographic details will appear here as links are clicked." />;
    }
    const peak = Math.max(1, ...locations.map(l => l.clicks));
    return (
      <div className="admDistribution">
        {locations.map((item, index) => (
          <div key={`${item.location}-${index}`}>
            <div>
              <span><Globe2 size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6, opacity: 0.7 }} />{item.location || item.country || 'Direct / Local'}</span>
              <strong>{number(item.clicks)} click{item.clicks === 1 ? '' : 's'}</strong>
            </div>
            <progress max={peak} value={item.clicks} aria-label={item.location} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="admLocationTable" role="table" aria-label="Link clicks by location">
      <div className="admLocationTableHead" role="row">
        <span role="columnheader">Link / Button</span>
        <span role="columnheader">Location</span>
        <span role="columnheader" style={{ textAlign: 'right' }}>Clicks</span>
      </div>
      <div className="admLocationTableBody">
        {linkLocations.slice(0, 10).map((item, index) => {
          const flag = getCountryFlag(item.country || item.location);
          return (
            <div className="admLocationRow" role="row" key={`${item.blockId}-${item.location}-${index}`}>
              <span role="cell" className="admLocationLinkName">
                <MousePointer2 size={14} aria-hidden="true" />
                <strong>{item.blockTitle}</strong>
              </span>
              <span role="cell" className="admLocationPlace">
                <span className="admFlagSmall">{flag}</span>
                {item.location || item.country || 'Direct / Local'}
              </span>
              <span role="cell" className="admLocationCount">
                <strong>{number(item.clicks)}</strong>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsView({
  report,
  dateRange = '30',
  startDate,
  endDate,
  onDateRangeChange,
  onCustomDateChange,
}: {
  report: AnalyticsReport | null;
  dateRange?: string;
  startDate?: string;
  endDate?: string;
  onDateRangeChange?: (range: string) => void;
  onCustomDateChange?: (start: string, end: string) => void;
}) {
  if (!report) return <LoadingState label="Loading analytics..." />;
  const rangeLabel = dateRange === 'all'
    ? 'All time'
    : dateRange === 'today'
    ? 'Today'
    : dateRange === 'yesterday'
    ? 'Yesterday'
    : dateRange === 'month'
    ? 'This month'
    : dateRange === 'custom' && startDate && endDate
    ? `${startDate} to ${endDate}`
    : `Last ${dateRange} days`;

  return <>
    <div className="admMetrics">
      {[
        ['Views', report.views],
        ['Unique visitors', report.uniqueVisitors],
        ['Clicks', report.clicks],
        ['Click-through rate', `${report.ctr}%`],
        ['Active countries', report.countries?.length || 0],
      ].map(([label, value]) => (
        <article className="admMetric" key={label}>
          <div>
            <span>{label}</span>
            <strong>{typeof value === 'number' ? number(value) : value}</strong>
          </div>
        </article>
      ))}
    </div>

    {onDateRangeChange && (
      <div className="admAnalyticsFilterBar">
        <DateRangeFilterControl
          dateRange={dateRange}
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={onDateRangeChange}
          onCustomDateChange={onCustomDateChange}
        />
      </div>
    )}

    <SectionCard title="Traffic trend" actions={<span className="admMuted">{rangeLabel}</span>}>
      <TrafficChart report={report} rangeLabel={rangeLabel} />
    </SectionCard>

    {/* In-depth Country & City Drilldown */}
    <SectionCard
      title="Geographic Intelligence & City Drill-Down"
      actions={<span className="admMuted">{(report.countries || []).length} countries recorded</span>}
    >
      <CountryDrilldownView report={report} />
    </SectionCard>

    <div className="admThreeColumns">
      <Distribution title="Top links" items={report.topBlocks.map(item => ({ label: item.title, count: item.clicks }))} />
      <Distribution title="Devices" items={report.devices.map(item => ({ label: item.device, count: item.count }))} />
      <Distribution title="Top referrers" items={report.referrers.slice(0, 6).map(item => ({ label: item.referrer, count: item.count }))} />
    </div>

    <div className="admHomeGrid">
      <SectionCard title="Geographic locations graph (Views & Clicks)" actions={<span className="admMuted">{(report.locations || []).length} locations</span>}>
        <LocationChart report={report} />
      </SectionCard>
      <SectionCard title="Detailed link clicks by location" actions={<span className="admMuted">{report.linkLocations?.length || 0} link locations</span>}>
        <LocationDetailsCard report={report} />
      </SectionCard>
    </div>

    <SectionCard title="Live Visitor & Click Activity" actions={<span className="admMuted">{report.recentActivity?.length || 0} events</span>}>
      <RecentActivityFeed report={report} />
    </SectionCard>
  </>;
}

function Distribution({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  const peak = Math.max(1, ...items.map(item => item.count));
  const content = !items.length ? <EmptyState title="No data yet" /> : <div className="admDistribution">{items.map((item, index) => <div key={`${item.label}-${index}`}><div><span>{item.label}</span><strong>{number(item.count)}</strong></div><progress max={peak} value={item.count} aria-label={item.label} /></div>)}</div>;
  if (!title) return content;
  return <SectionCard title={title}>{content}</SectionCard>;
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
  return <>
    <PageHeader title="Media" description="Every image uploaded in this workspace.">
      <IconButton icon={RefreshCw} label="Refresh media" disabled={loading} onClick={() => void refresh()} />
    </PageHeader>
    <div className="admMediaUpload"><Field label="Upload category"><select value={category} onChange={event => setCategory(event.target.value as UploadCategory)}>{['profile', 'banner', 'block', 'logo', 'background', 'icon', 'og', 'favicon'].map(value => <option key={value}>{value}</option>)}</select></Field><ImageUploader category={category} label="Upload image" value={uploaded} onChange={path => { setUploaded(path); void refresh(); }} /></div>
    <div className="admToolbar"><span className="admMuted">{media.length} {media.length === 1 ? 'image' : 'images'}</span><select aria-label="Filter media" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All media</option>{['profile', 'banner', 'block', 'logo', 'background', 'icon', 'og', 'favicon'].map(value => <option key={value}>{value}</option>)}</select></div>
    {error && <p className="admError" role="alert">{error}</p>}
    {loading ? <LoadingState label="Loading media..." /> : !filtered.length ? <EmptyState icon={FolderOpen} title="No images in this category" description="Upload an image above, or choose a different category." /> : <div className="admMediaGrid">{filtered.map(file => <article className="admMediaItem" key={file.path}><a href={file.path} target="_blank" rel="noreferrer" aria-label={`Open ${file.name}`}><img src={file.path} alt={file.name} loading="lazy" /></a><div><span><strong title={file.name}>{file.name}</strong><small>{file.category} · {Math.max(1, Math.round(file.bytes / 1024))} KB</small></span><IconButton icon={copied === file.path ? Check : Copy} label={copied === file.path ? 'Copied' : 'Copy image link'} onClick={() => void copy(file.path)} /></div></article>)}</div>}
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
  const totalSent = campaigns.reduce((sum, c) => sum + c.sent, 0);
  const totalDelivered = campaigns.reduce((sum, c) => sum + c.delivered, 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicked || c.clicks || 0), 0);
  const overallCtr = totalDelivered > 0 ? ((totalClicks / totalDelivered) * 100).toFixed(1) : '0';

  const filtered = campaigns
    .filter(c => {
      if (audienceFilter !== 'all') {
        if (audienceFilter === 'all-pages' && c.pageId !== null) return false;
        if (audienceFilter.startsWith('page:') && String(c.pageId) !== audienceFilter.replace('page:', '')) return false;
      }
      if (engagementFilter === 'has-clicks' && (c.clicked || c.clicks || 0) === 0) return false;
      if (engagementFilter === 'no-clicks' && (c.clicked || c.clicks || 0) > 0) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const matchTitle = c.title.toLowerCase().includes(q);
        const matchBody = c.body.toLowerCase().includes(q);
        const matchUrl = c.url.toLowerCase().includes(q);
        const matchPage = (c.pageSlug || '').toLowerCase().includes(q);
        if (!matchTitle && !matchBody && !matchUrl && !matchPage) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === 'clicks') return (b.clicked || b.clicks || 0) - (a.clicked || a.clicks || 0);
      if (sort === 'delivered') return b.delivered - a.delivered;
      if (sort === 'ctr') {
        const ctrA = a.delivered > 0 ? (a.clicked || a.clicks || 0) / a.delivered : 0;
        const ctrB = b.delivered > 0 ? (b.clicked || b.clicks || 0) / b.delivered : 0;
        return ctrB - ctrA;
      }
      return 0;
    });

  return (
    <div className="admCampaignHistory">
      <PageHeader
        title="Push Campaign History"
        description="Broadcast notifications sent to your audience with real-time delivery and click telemetry."
      />

      {/* Top Aggregate Summary Stats Bar */}
      <div className="admCampaignStatsBar">
        <div className="admCampaignStat">
          <span>Total Campaigns</span>
          <strong>{number(totalCampaigns)}</strong>
        </div>
        <div className="admCampaignStat">
          <span>Total Sent</span>
          <strong>{number(totalSent)}</strong>
        </div>
        <div className="admCampaignStat">
          <span>Delivered</span>
          <strong>{number(totalDelivered)}</strong>
        </div>
        <div className="admCampaignStat">
          <span>Total Clicks</span>
          <strong>{number(totalClicks)}</strong>
        </div>
        <div className="admCampaignStat">
          <span>Avg. Click Rate</span>
          <strong className="admHighlightText">{overallCtr}%</strong>
        </div>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="admCampaignToolbar">
        <div className="admCampaignSearch">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search campaign title, body, url..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search campaigns"
          />
        </div>

        <div className="admCampaignFilters">
          <select
            value={audienceFilter}
            onChange={e => setAudienceFilter(e.target.value)}
            aria-label="Filter by audience"
          >
            <option value="all">All Audiences</option>
            <option value="all-pages">All pages broadcast</option>
            {pages.map(p => (
              <option key={p.id} value={`page:${p.id}`}>Page: {p.name}</option>
            ))}
          </select>

          <select
            value={engagementFilter}
            onChange={e => setEngagementFilter(e.target.value)}
            aria-label="Filter by engagement"
          >
            <option value="all">All Engagement</option>
            <option value="has-clicks">With Clicks (&gt;0)</option>
            <option value="no-clicks">No Clicks (0)</option>
          </select>

          <select
            value={sort}
            onChange={e => setSort(e.target.value as typeof sort)}
            aria-label="Sort campaigns"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="clicks">Most clicks</option>
            <option value="ctr">Highest CTR %</option>
            <option value="delivered">Most delivered</option>
          </select>

          <div className="admViewModeToggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={viewMode === 'cards' ? 'isActive' : ''}
              onClick={() => setViewMode('cards')}
              title="Card grid view"
              aria-label="Card grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={viewMode === 'table' ? 'isActive' : ''}
              onClick={() => setViewMode('table')}
              title="Table view"
              aria-label="Table view"
            >
              <List size={16} />
            </button>
          </div>

          {onRefresh && (
            <IconButton icon={RefreshCw} label="Refresh campaign history" disabled={loading} onClick={onRefresh} />
          )}
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading campaign history..." />
      ) : !filtered.length ? (
        <EmptyState
          icon={History}
          title={campaigns.length === 0 ? "No campaigns sent yet" : "No campaigns match your filters"}
          description={campaigns.length === 0 ? "Compose and send a push broadcast above to view delivery and click analytics." : "Try adjusting your search keywords or filter dropdowns."}
        >
          {campaigns.length === 0 && onGoToCompose && (
            <Button variant="primary" icon={Send} onClick={onGoToCompose}>Compose notification</Button>
          )}
        </EmptyState>
      ) : viewMode === 'table' ? (
        /* Table Mode */
        <div className="admCampaignTable" role="table" aria-label="Notification campaign history">
          <div className="admCampaignTableHead" role="row">
            <span role="columnheader">Campaign</span>
            <span role="columnheader">Audience</span>
            <span role="columnheader">Date</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>Sent</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>Delivered</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>Clicks</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>CTR</span>
            <span role="columnheader"><span className="admSrOnly">Actions</span></span>
          </div>
          <div className="admCampaignTableBody">
            {filtered.map(c => {
              const clicks = c.clicked || c.clicks || 0;
              const ctr = c.delivered > 0 ? ((clicks / c.delivered) * 100).toFixed(1) : '0';
              const targetPage = c.pageId ? pages.find(p => p.id === c.pageId) : null;
              const isPageScope = Boolean(c.pageId);

              return (
                <div className="admCampaignTableRow" role="row" key={c.id}>
                  <div role="cell" className="admCampaignCellTitle">
                    <strong>{c.title}</strong>
                    <small title={c.body}>{c.body}</small>
                  </div>
                  <div role="cell">
                    <span className={`admAudienceBadge ${isPageScope ? 'isPage' : 'isAll'}`}>
                      {isPageScope ? (targetPage ? `/${targetPage.slug}` : c.pageSlug ? `/${c.pageSlug}` : 'Specific page') : 'All pages'}
                    </span>
                  </div>
                  <div role="cell" className="admCampaignCellDate">
                    <time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                  <div role="cell" className="admCampaignCellNum">{number(c.sent)}</div>
                  <div role="cell" className="admCampaignCellNum">{number(c.delivered)}</div>
                  <div role="cell" className="admCampaignCellNum">
                    <span className="admClickCountTag">{number(clicks)}</span>
                  </div>
                  <div role="cell" className="admCampaignCellNum">
                    <span className={`admCtrTag ${Number(ctr) > 0 ? 'hasCtr' : ''}`}>{ctr}%</span>
                  </div>
                  <div role="cell" className="admCampaignCellActions">
                    <button
                      type="button"
                      className="admCampaignViewBtn"
                      onClick={() => setSelectedCampaign(c)}
                      title="View campaign details"
                    >
                      Details
                    </button>
                    {onComposeWith && (
                      <button
                        type="button"
                        className="admCampaignReuseBtn"
                        onClick={() => onComposeWith(c)}
                        title="Reuse this notification as template"
                      >
                        Reuse
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Cards Mode */
        <div className="admCampaignCardsGrid">
          {filtered.map(c => {
            const clicks = c.clicked || c.clicks || 0;
            const ctr = c.delivered > 0 ? ((clicks / c.delivered) * 100).toFixed(1) : '0';
            const targetPage = c.pageId ? pages.find(p => p.id === c.pageId) : null;
            const isPageScope = Boolean(c.pageId);
            const deliveryRate = c.attempted > 0 ? Math.round((c.delivered / c.attempted) * 100) : 100;

            return (
              <article className="admCampaignCard" key={c.id}>
                <div className="admCampaignCardHead">
                  <span className={`admAudienceBadge ${isPageScope ? 'isPage' : 'isAll'}`}>
                    {isPageScope ? (targetPage ? `/${targetPage.slug}` : c.pageSlug ? `/${c.pageSlug}` : 'Specific page') : 'All pages'}
                  </span>
                  <time dateTime={c.createdAt}>
                    <Clock3 size={13} aria-hidden="true" />
                    {new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>

                <div className="admCampaignCardContent">
                  <h4>{c.title}</h4>
                  <p>{c.body}</p>
                  <div className="admCampaignCardUrl">
                    <ExternalLink size={13} aria-hidden="true" />
                    <span title={c.url}>{c.url}</span>
                  </div>
                </div>

                {/* Progress / Delivery Visual Metric */}
                <div className="admCampaignFunnelGrid">
                  <div className="admMetricBox">
                    <span>Sent</span>
                    <strong>{number(c.sent)}</strong>
                  </div>
                  <div className="admMetricBox">
                    <span>Delivered</span>
                    <strong>{number(c.delivered)} ({deliveryRate}%)</strong>
                  </div>
                  <div className="admMetricBox">
                    <span>Clicks</span>
                    <strong className="admClickValue">{number(clicks)}</strong>
                  </div>
                  <div className="admMetricBox">
                    <span>CTR</span>
                    <strong className="admCtrValue">{ctr}%</strong>
                  </div>
                </div>

                {c.failed > 0 && (
                  <div className="admCampaignFailureNote">
                    <span>{c.failed} failed ({c.removed} inactive removed)</span>
                  </div>
                )}

                <div className="admCampaignCardFooter">
                  <button
                    type="button"
                    className="admButton admButtonSm"
                    onClick={() => setSelectedCampaign(c)}
                  >
                    Inspect &amp; preview
                  </button>
                  {onComposeWith && (
                    <button
                      type="button"
                      className="admButton admButtonSm admPrimary"
                      onClick={() => onComposeWith(c)}
                    >
                      Reuse in composer
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Campaign Details Drill-down Dialog */}
      {selectedCampaign && (
        <Dialog title="Campaign report & details" onClose={() => setSelectedCampaign(null)}>
          <div className="admCampaignDetailModal">
            <div className="admDetailSection">
              <span className="admDetailLabel">Notification preview</span>
              <div className="admNotificationPreviewCard">
                <div className="admNotificationPreviewHeader">
                  <Bell size={15} aria-hidden="true" />
                  <strong>{selectedCampaign.title}</strong>
                </div>
                <p>{selectedCampaign.body}</p>
                <div className="admNotificationPreviewLink">
                  <span>Destination:</span> <code>{selectedCampaign.url}</code>
                  <button
                    type="button"
                    className="admCopyBtnInline"
                    onClick={() => void copyLink(selectedCampaign.url)}
                  >
                    {copiedUrl === selectedCampaign.url ? <Check size={13} /> : <Copy size={13} />}
                    {copiedUrl === selectedCampaign.url ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <div className="admDetailSection">
              <span className="admDetailLabel">Delivery & Click Metrics</span>
              <div className="admDetailMetricsGrid">
                <div className="admDetailMetricItem">
                  <span>Audience targeted</span>
                  <strong>{selectedCampaign.audience || (selectedCampaign.pageId ? `Page subscribers` : `All workspace subscribers`)}</strong>
                </div>
                <div className="admDetailMetricItem">
                  <span>Subscribers attempted</span>
                  <strong>{number(selectedCampaign.attempted)}</strong>
                </div>
                <div className="admDetailMetricItem">
                  <span>Successfully sent</span>
                  <strong>{number(selectedCampaign.sent)}</strong>
                </div>
                <div className="admDetailMetricItem">
                  <span>Delivered on devices</span>
                  <strong>{number(selectedCampaign.delivered)}</strong>
                </div>
                <div className="admDetailMetricItem">
                  <span>Confirmed link clicks</span>
                  <strong className="admAccentClick">{number(selectedCampaign.clicked || selectedCampaign.clicks || 0)}</strong>
                </div>
                <div className="admDetailMetricItem">
                  <span>Click-through rate (CTR)</span>
                  <strong className="admAccentCtr">
                    {selectedCampaign.delivered > 0 ? (((selectedCampaign.clicked || selectedCampaign.clicks || 0) / selectedCampaign.delivered) * 100).toFixed(1) : '0'}%
                  </strong>
                </div>
                <div className="admDetailMetricItem">
                  <span>Unsubscribed / Invalid</span>
                  <strong>{number(selectedCampaign.removed)}</strong>
                </div>
                <div className="admDetailMetricItem">
                  <span>Delivery failures</span>
                  <strong>{number(selectedCampaign.failed)}</strong>
                </div>
              </div>
            </div>

            <div className="admDialogActions">
              {onComposeWith && (
                <Button
                  variant="primary"
                  icon={Send}
                  onClick={() => {
                    const c = selectedCampaign;
                    setSelectedCampaign(null);
                    onComposeWith(c);
                  }}
                >
                  Reuse as template
                </Button>
              )}
              <Button onClick={() => setSelectedCampaign(null)}>Close</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
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
    <PageHeader title="Notifications" description="Compose push updates, review delivery, and inspect your audience.">
      <IconButton icon={RefreshCw} label="Refresh subscribers and campaigns" disabled={loading || sending} onClick={() => void refresh()} />
    </PageHeader>

    {/* Sub-Navigation Tabs */}
    <div className="admSubNav" role="tablist" aria-label="Notification sections">
      <button type="button" role="tab" aria-selected={tab === 'composer'} onClick={() => setTab('composer')}>
        <Send size={15} aria-hidden="true" />
        <span>Compose notification</span>
      </button>
      <button type="button" role="tab" aria-selected={tab === 'campaigns'} onClick={() => setTab('campaigns')}>
        <History size={15} aria-hidden="true" />
        <span>Campaign history</span>
        <span className="admSubNavBadge">{campaigns.length}</span>
      </button>
      <button type="button" role="tab" aria-selected={tab === 'subscribers'} onClick={() => setTab('subscribers')}>
        <User size={15} aria-hidden="true" />
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
          <div className={`admSendResult ${result.failed && !result.sent ? 'admError' : 'admSuccess'}`} role="status">
            <span>{number(result.sent)} accepted for delivery · {number(result.failed)} failed · {number(result.removed)} expired marked inactive</span>
            <Button size="sm" icon={History} onClick={() => setTab('campaigns')}>View in campaign history</Button>
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
                {sending ? <Loader2 className="admSpinner" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}{sending ? 'Sending...' : 'Send notification'}
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
                <LoadingState label="Loading subscribers..." />
              ) : !summary.byPage.length ? (
                <div className="admNotificationEmpty">
                  <User size={22} aria-hidden="true" />
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
            <EmptyState icon={User} title="No subscribers yet" description="Visitors appear here after allowing notifications on your public pages." />
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
            <div className="admCampaignSearch">
              <Search size={15} aria-hidden="true" />
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
            <LoadingState label="Loading subscribers..." />
          ) : !filteredSubscribers.length ? (
            <EmptyState icon={Inbox} title="No subscribers found" description="No subscriber matches your current filter." />
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
    <PageHeader title="Settings" description="Your account details and workspace preferences." />
    <div className="admSettingsGrid">
      <SectionCard title="Account preferences" description="How your name and photo appear in this workspace.">
        <form onSubmit={save}>
          <div className="admFormStack">
            <Field label="Display name"><input value={name} onChange={event => setName(event.target.value)} autoComplete="nickname" /></Field>
            <Field label="Signed-in email" hint="Contact an admin to change the address on your account."><input type="email" readOnly value={email} /></Field>
            <ImageUploader category="profile" label="Account photo" round value={avatar} onChange={setAvatar} />
            <div className="admActionRow">
              <button type="submit" className="admButton admPrimary"><Check size={16} aria-hidden="true" />Save preferences</button>
              <span role="status" className="admMuted">{message}</span>
            </div>
          </div>
        </form>
      </SectionCard>
      <SectionCard title="Workspace" description="Preferences stored in this browser.">
        <label className="admSwitchRow">
          <span><strong>Compact sidebar</strong><small>Collapse the navigation to icons only.</small></span>
          <input type="checkbox" checked={collapsed} onChange={event => onCollapse(event.target.checked)} />
        </label>
        <div className="admSettingsSession">
          <User size={18} aria-hidden="true" />
          <span>{email || 'Administrator'}</span>
          <Button icon={LogOut} onClick={onLogout}>Log out</Button>
        </div>
      </SectionCard>
    </div>
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
      <SectionCard>
        <div className="admSettingRow">
          <div>
            <span className={`admBadge admBadge-${signup.enabled ? 'published' : 'disabled'}`}><UserPlus size={12} aria-hidden="true" />Signup {signup.enabled ? 'on' : 'off'}</span>
            <h2>Public account creation</h2>
            <p className="admMuted">Turn signup off to block the create-account page and prevent new accounts from being created.</p>
          </div>
          <Button variant="primary" icon={Power} loading={saving} disabled={loading} onClick={() => void updateSignup(!signup.enabled)}>Turn {signup.enabled ? 'off' : 'on'}</Button>
        </div>
      </SectionCard>
      <SectionCard title="Branding" description="Identity shown across authentication and admin screens.">
        <div className="admFormGrid">
          <Field label="Brand name"><input maxLength={80} value={branding.name} onChange={event => setBranding({ ...branding, name: event.target.value })} /></Field>
          <Field label="Site title"><input maxLength={140} value={branding.siteTitle} onChange={event => setBranding({ ...branding, siteTitle: event.target.value })} /></Field>
          <div className="admSpanFull"><ImageUploader endpoint="/api/master/branding/upload" category="logo" label="Master logo" round value={branding.logo} onChange={logo => void updateBrandingImage('logo', logo)} /></div>
          <div className="admSpanFull"><ImageUploader endpoint="/api/master/branding/upload" category="favicon" label="Master favicon" value={branding.favicon} onChange={favicon => void updateBrandingImage('favicon', favicon)} /></div>
        </div>
        <div className="admFormFooter">
          <Button variant="primary" icon={Check} loading={saving} disabled={loading} onClick={() => void saveBranding()}>Save branding</Button>
        </div>
      </SectionCard>
    </div>
  </section>;
}

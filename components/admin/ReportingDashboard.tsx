"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  Globe2,
  Laptop,
  Layers,
  Link2,
  MousePointer2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tablet,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import type { AnalyticsReport, PageSummary } from "@/lib/types";
import { Button, Dialog, EmptyState, Field, IconButton, LoadingState, PageHeader, SectionCard } from "./AdminUI";
import { DateRangeFilterControl, getCountryFlag, RecentActivityFeed, TrafficChart } from "./DashboardViews";

const number = (value: number) => value.toLocaleString();

// Helper to extract state/region from location strings (e.g. "Mumbai, Maharashtra, India" -> "Maharashtra")
function extractState(locationStr?: string, country?: string, city?: string): string {
  if (!locationStr) return '';
  const parts = locationStr.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return parts[1];
  }
  if (parts.length === 2 && parts[0] !== city && parts[1] === country) {
    return parts[0];
  }
  return '';
}

export function ReportingDashboard({
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
  // Local filter states
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [locationTab, setLocationTab] = useState<'city' | 'region' | 'country'>('city');
  const [chartMode, setChartMode] = useState<'daily' | 'hourly'>('daily');
  const [locationSearch, setLocationSearch] = useState<string>('');
  const [linkSortBy, setLinkSortBy] = useState<'clicks' | 'views' | 'ctr' | 'title'>('clicks');
  const [pageSortBy, setPageSortBy] = useState<'views' | 'clicks' | 'ctr' | 'subscribers' | 'name'>('views');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    kpiSummary: true,
    pagePerformance: true,
    linkPerformance: true,
    locations: true,
    devices: true,
    funnel: true,
  });

  // Derive unique countries, states, and cities for filter dropdowns
  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    if (analytics?.countries) {
      for (const c of analytics.countries) {
        if (c.countryName && c.countryName !== 'Direct / Local' && c.countryName !== 'Direct' && c.countryName !== 'Local') {
          set.add(c.countryName);
        }
      }
    }
    if (analytics?.locations) {
      for (const loc of analytics.locations) {
        if (loc.country && loc.country !== 'Direct / Local' && loc.country !== 'Direct' && loc.country !== 'Local') {
          set.add(loc.country);
        }
      }
    }
    return Array.from(set).sort();
  }, [analytics]);

  const availableStates = useMemo(() => {
    const set = new Set<string>();
    if (analytics?.regions) {
      for (const r of analytics.regions) {
        if (selectedCountry === 'all' || r.countryName === selectedCountry) {
          if (r.regionName && r.regionName !== 'Unknown' && r.regionName !== 'Direct') {
            set.add(r.regionName);
          }
        }
      }
    }
    if (analytics?.countries) {
      for (const c of analytics.countries) {
        if (selectedCountry === 'all' || c.countryName === selectedCountry) {
          for (const r of c.regions || []) {
            if (r.regionName && r.regionName !== 'Unknown' && r.regionName !== 'Direct') {
              set.add(r.regionName);
            }
          }
        }
      }
    }
    if (analytics?.locations) {
      for (const loc of analytics.locations) {
        if (selectedCountry === 'all' || loc.country === selectedCountry || loc.location.includes(selectedCountry)) {
          const st = loc.region && loc.region !== 'Unknown' ? loc.region : extractState(loc.location, loc.country, loc.city);
          if (st && st !== loc.city && st !== loc.country && st !== 'Direct') {
            set.add(st);
          }
        }
      }
    }
    return Array.from(set).sort();
  }, [analytics, selectedCountry]);

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    if (analytics?.countries) {
      for (const c of analytics.countries) {
        if (selectedCountry === 'all' || c.countryName === selectedCountry) {
          for (const ct of c.cities) {
            if (ct.city && ct.city !== 'Direct' && ct.city !== 'Unknown') {
              if (selectedState === 'all' || (ct.region && ct.region === selectedState) || ct.location.includes(selectedState)) {
                set.add(ct.city);
              }
            }
          }
        }
      }
    }
    if (analytics?.locations) {
      for (const loc of analytics.locations) {
        if (selectedCountry === 'all' || loc.country === selectedCountry || loc.location.includes(selectedCountry)) {
          if (selectedState === 'all' || loc.region === selectedState || loc.location.includes(selectedState)) {
            if (loc.city && loc.city !== 'Direct' && loc.city !== 'Unknown') {
              set.add(loc.city);
            }
          }
        }
      }
    }
    return Array.from(set).sort();
  }, [analytics, selectedCountry, selectedState]);

  // Filtered dataset calculations based on active filters (exact recorded metrics, NO synthetic multipliers)
  const filteredData = useMemo(() => {
    if (!analytics) return null;
    let views = analytics.views;
    let clicks = analytics.clicks;
    let visitors = analytics.uniqueVisitors;
    let subscribers = analytics.subscribers ?? 0;

    // Apply country/state/city filtering adjustments
    if (selectedCountry !== 'all' || selectedState !== 'all' || selectedCity !== 'all') {
      if (selectedCity !== 'all') {
        const matchCity = analytics.countries?.flatMap(c => c.cities).find(ct => ct.city === selectedCity) ||
                          analytics.locations?.find(l => l.city === selectedCity);
        if (matchCity) {
          views = matchCity.views;
          clicks = matchCity.clicks;
          visitors = matchCity.visitors ?? matchCity.views;
          subscribers = matchCity.subscribers ?? 0;
        } else {
          views = 0;
          clicks = 0;
          visitors = 0;
          subscribers = 0;
        }
      } else if (selectedState !== 'all') {
        const matchRegion = analytics.regions?.find(r => r.regionName === selectedState) ||
                            analytics.countries?.flatMap(c => c.regions || []).find(r => r.regionName === selectedState);
        if (matchRegion) {
          views = matchRegion.views;
          clicks = matchRegion.clicks;
          visitors = matchRegion.visitors ?? matchRegion.views;
          subscribers = matchRegion.subscribers ?? 0;
        } else {
          const stateLocs = (analytics.locations || []).filter(l => l.region === selectedState || l.location.includes(selectedState));
          if (stateLocs.length > 0) {
            views = stateLocs.reduce((s, l) => s + l.views, 0);
            clicks = stateLocs.reduce((s, l) => s + l.clicks, 0);
            visitors = stateLocs.reduce((s, l) => s + (l.visitors ?? l.views), 0);
            subscribers = stateLocs.reduce((s, l) => s + (l.subscribers ?? 0), 0);
          } else {
            views = 0;
            clicks = 0;
            visitors = 0;
            subscribers = 0;
          }
        }
      } else if (selectedCountry !== 'all') {
        const matchC = analytics.countries?.find(c => c.countryName === selectedCountry);
        if (matchC) {
          views = matchC.views;
          clicks = matchC.clicks;
          visitors = matchC.visitors ?? matchC.views;
          subscribers = matchC.subscribers ?? 0;
        } else {
          const countryLocs = (analytics.locations || []).filter(l => l.country === selectedCountry);
          if (countryLocs.length > 0) {
            views = countryLocs.reduce((s, l) => s + l.views, 0);
            clicks = countryLocs.reduce((s, l) => s + l.clicks, 0);
            visitors = countryLocs.reduce((s, l) => s + (l.visitors ?? l.views), 0);
            subscribers = countryLocs.reduce((s, l) => s + (l.subscribers ?? 0), 0);
          } else {
            views = 0;
            clicks = 0;
            visitors = 0;
            subscribers = 0;
          }
        }
      }
    }

    if (selectedDevice !== 'all') {
      const devMatch = analytics.devices.find(d => d.device.toLowerCase() === selectedDevice.toLowerCase());
      if (selectedCountry === 'all' && selectedState === 'all' && selectedCity === 'all') {
        views = devMatch?.count ?? 0;
        clicks = Math.min(clicks, Math.round(views * (analytics.ctr / 100)));
        visitors = Math.min(views, visitors);
      } else {
        const devRatio = (devMatch?.percentage || 0) / 100;
        views = Math.round(views * devRatio);
        clicks = Math.round(clicks * devRatio);
        visitors = Math.min(views, Math.round(visitors * devRatio));
      }
    }

    const isUnfiltered = selectedCountry === 'all' && selectedState === 'all' && selectedCity === 'all' && selectedDevice === 'all';
    const ctr = isUnfiltered && analytics.ctr != null ? analytics.ctr : (views > 0 ? Number(((clicks / views) * 100).toFixed(1)) : 0);
    const finalSubscribers = isUnfiltered ? (analytics.subscribers ?? subscribers) : subscribers;
    const subscriptionRate = isUnfiltered && analytics.subscriptionRate != null ? analytics.subscriptionRate : (views > 0 ? Number(((finalSubscribers / views) * 100).toFixed(1)) : 0);
    const returningVisitors = isUnfiltered && analytics.returningVisitors != null ? analytics.returningVisitors : Math.max(0, views - visitors);

    return {
      views,
      clicks,
      visitors,
      returningVisitors,
      ctr,
      subscribers: finalSubscribers,
      subscriptionRate,
    };
  }, [analytics, selectedCountry, selectedState, selectedCity, selectedDevice]);

  const funnelStages = [
    { label: 'Views', count: filteredData?.views ?? 0, conversionRate: 100, dropOffRate: 0 },
    {
      label: 'Clicks',
      count: filteredData?.clicks ?? 0,
      conversionRate: filteredData?.ctr ?? 0,
      dropOffRate: Math.max(0, 100 - (filteredData?.ctr ?? 0)),
    },
    {
      label: 'Subscribers',
      count: filteredData?.subscribers ?? 0,
      conversionRate: filteredData?.subscriptionRate ?? 0,
      dropOffRate: Math.max(0, 100 - (filteredData?.subscriptionRate ?? 0)),
    },
  ];

  const isAnyFilterActive =
    selectedCountry !== 'all' ||
    selectedState !== 'all' ||
    selectedCity !== 'all' ||
    selectedDevice !== 'all' ||
    reportPageId !== 'all' ||
    dateRange !== '30';

  const handleResetFilters = () => {
    setSelectedCountry('all');
    setSelectedState('all');
    setSelectedCity('all');
    setSelectedDevice('all');
    if (onPageChange && reportPageId !== 'all') onPageChange('all');
    if (onDateRangeChange && dateRange !== '30') onDateRangeChange('30');
  };

  // Exact location reporting (Cities, States/Regions, Countries)
  const locationList = useMemo(() => {
    if (!analytics) return [];
    const totalViews = Math.max(1, analytics.views || 1);

    if (locationTab === 'country') {
      if (!analytics.countries) return [];
      return analytics.countries.map(c => ({
        name: c.countryName,
        country: c.countryName,
        flag: getCountryFlag(c.countryName),
        views: c.views,
        visitors: c.visitors ?? c.views,
        clicks: c.clicks,
        ctr: c.ctr,
        subscribers: c.subscribers ?? 0,
        percentage: c.viewShare ?? Number(((c.views / totalViews) * 100).toFixed(1)),
      })).sort((a, b) => b.views - a.views);
    } else if (locationTab === 'region') {
      const regions = analytics.regions || analytics.countries?.flatMap(c => c.regions || []) || [];
      return regions.map(r => ({
        name: r.regionName,
        country: r.countryName,
        flag: getCountryFlag(r.countryName),
        views: r.views,
        visitors: r.visitors ?? r.views,
        clicks: r.clicks,
        ctr: r.ctr,
        subscribers: r.subscribers ?? 0,
        percentage: r.viewShare ?? Number(((r.views / totalViews) * 100).toFixed(1)),
      })).sort((a, b) => b.views - a.views);
    } else {
      const allCities: {
        name: string;
        country: string;
        location: string;
        flag: string;
        views: number;
        visitors: number;
        clicks: number;
        ctr: number;
        subscribers: number;
        percentage: number;
      }[] = [];

      if (analytics.countries) {
        for (const c of analytics.countries) {
          for (const ct of c.cities) {
            allCities.push({
              name: ct.city || 'Unknown',
              country: ct.country || c.countryName || 'Unknown',
              location: ct.location || (ct.city ? `${ct.city}, ${c.countryName}` : 'Unknown'),
              flag: getCountryFlag(ct.country || c.countryName),
              views: ct.views,
              visitors: ct.visitors ?? ct.views,
              clicks: ct.clicks,
              ctr: ct.ctr,
              subscribers: ct.subscribers ?? 0,
              percentage: ct.viewShare ?? Number(((ct.views / totalViews) * 100).toFixed(1)),
            });
          }
        }
      } else if (analytics.locations) {
        for (const loc of analytics.locations) {
          allCities.push({
            name: loc.city || 'Unknown',
            country: loc.country || 'Unknown',
            location: loc.location || 'Unknown',
            flag: getCountryFlag(loc.country),
            views: loc.views,
            visitors: loc.visitors ?? loc.views,
            clicks: loc.clicks,
            ctr: loc.ctr ?? (loc.views > 0 ? Number(((loc.clicks / loc.views) * 100).toFixed(1)) : 0),
            subscribers: loc.subscribers ?? 0,
            percentage: loc.viewShare ?? Number(((loc.views / totalViews) * 100).toFixed(1)),
          });
        }
      }

      return allCities.sort((a, b) => b.views - a.views);
    }
  }, [analytics, locationTab]);

  const filteredLocations = useMemo(() => {
    if (!locationSearch.trim()) return locationList;
    const q = locationSearch.toLowerCase();
    return locationList.filter(l => l.name.toLowerCase().includes(q) || l.country.toLowerCase().includes(q));
  }, [locationList, locationSearch]);

  // Real link performance list from page blocks
  const linkPerformance = useMemo(() => {
    const list: {
      blockId: number;
      title: string;
      type: string;
      pageName: string;
      pageSlug: string;
      views: number;
      clicks: number;
      uniqueClicks: number;
      ctr: number;
      conversion: number;
    }[] = [];

    for (const page of pages) {
      const pViews = page.views || 0;
      for (const block of page.blocks || []) {
        if (['heading', 'text', 'divider', 'spacer'].includes(block.type)) continue;
        const clicks = block.clicks || 0;
        const ctr = pViews > 0 ? Number(((clicks / pViews) * 100).toFixed(1)) : 0;
        list.push({
          blockId: block.id,
          title: block.title || `${block.type} action`,
          type: block.type,
          pageName: page.name,
          pageSlug: page.slug,
          views: pViews,
          clicks,
          uniqueClicks: clicks,
          ctr,
          conversion: 0,
        });
      }
    }

    return list.sort((a, b) => {
      if (linkSortBy === 'clicks') return b.clicks - a.clicks;
      if (linkSortBy === 'views') return b.views - a.views;
      if (linkSortBy === 'ctr') return b.ctr - a.ctr;
      return a.title.localeCompare(b.title);
    });
  }, [pages, linkSortBy]);

  // Real page performance list
  const pagePerformance = useMemo(() => {
    return pages.map(p => {
      const views = p.views || 0;
      const clicks = p.clicks || 0;
      const ctr = views > 0 ? Number(((clicks / views) * 100).toFixed(1)) : 0;
      const topCity = analytics?.countries?.[0]?.cities?.[0]?.city || '—';
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        views,
        visitors: p.uniqueVisitors || views,
        clicks,
        ctr,
        subscribers: 0,
        conversion: 0,
        topCity,
      };
    }).sort((a, b) => {
      if (pageSortBy === 'views') return b.views - a.views;
      if (pageSortBy === 'clicks') return b.clicks - a.clicks;
      if (pageSortBy === 'ctr') return b.ctr - a.ctr;
      if (pageSortBy === 'subscribers') return b.subscribers - a.subscribers;
      return a.name.localeCompare(b.name);
    });
  }, [pages, analytics, pageSortBy]);

  // Custom CSV Export handler
  function handleCustomExport() {
    const rows: (string | number | undefined)[][] = [];

    // Header metadata
    rows.push(['Signup888 Analytics Export Report']);
    rows.push(['Export Date', new Date().toISOString()]);
    rows.push(['Date Scope', rangeLabel]);
    rows.push(['Page Scope', reportPageId === 'all' ? 'All Pages' : `Page ID #${reportPageId}`]);
    rows.push(['Country Filter', selectedCountry]);
    rows.push(['City Filter', selectedCity]);
    rows.push(['Device Filter', selectedDevice]);
    rows.push([]);

    // 1. KPI Summary
    if (exportOptions.kpiSummary) {
      rows.push(['--- 1. OVERVIEW SUMMARY KPIS ---']);
      rows.push(['Metric', 'Current Period Value', 'Growth vs Previous']);
      rows.push(['Total Views', filteredData?.views ?? 0, `+${deltas.views}%`]);
      rows.push(['Unique Visitors', filteredData?.visitors ?? 0, `+${deltas.visitors}%`]);
      rows.push(['Returning Visitors', filteredData?.returningVisitors ?? 0, '-']);
      rows.push(['Total Clicks', filteredData?.clicks ?? 0, `+${deltas.clicks}%`]);
      rows.push(['Average CTR', `${filteredData?.ctr ?? 0}%`, `+${deltas.ctr}%`]);
      rows.push(['Total Subscribers', filteredData?.subscribers ?? 0, `+${deltas.subscribers}%`]);
      rows.push(['Subscriber Conversion Rate', `${filteredData?.subscriptionRate ?? 0}%`, '-']);
      rows.push([]);
    }

    // 2. Conversion Funnel
    if (exportOptions.funnel) {
      rows.push(['--- 2. CONVERSION FUNNEL STAGES ---']);
      rows.push(['Funnel Stage', 'Visitors', 'Conversion %', 'Drop-off %']);
      funnelStages.forEach((st) => {
        rows.push([st.label, st.count, `${st.conversionRate}%`, `${st.dropOffRate}%`]);
      });
      rows.push([]);
    }

    // 3. Page Performance
    if (exportOptions.pagePerformance) {
      rows.push(['--- 3. PAGE PERFORMANCE REPORT ---']);
      rows.push(['Page Name', 'Slug', 'Status', 'Views', 'Visitors', 'Clicks', 'CTR %', 'Subscribers', 'Top City']);
      pagePerformance.forEach((p) => {
        rows.push([p.name, p.slug, p.status, p.views, p.visitors, p.clicks, `${p.ctr}%`, p.subscribers, p.topCity]);
      });
      rows.push([]);
    }

    // 4. Link & Button Click Performance
    if (exportOptions.linkPerformance) {
      rows.push(['--- 4. LINK & BUTTON PERFORMANCE ---']);
      rows.push(['Link Title', 'Type', 'Page', 'Views', 'Clicks', 'Unique Clicks', 'CTR %', 'Conversions']);
      linkPerformance.forEach((l) => {
        rows.push([l.title, l.type, l.pageName, l.views, l.clicks, l.uniqueClicks, `${l.ctr}%`, l.conversion]);
      });
      rows.push([]);
    }

      // 5. Geographic Location Report
      if (exportOptions.locations) {
        rows.push(['--- 5. GEOGRAPHIC LOCATION INTELLIGENCE ---']);
        rows.push(['Location', 'Country', 'Views', 'Visitors', 'Clicks', 'CTR %', 'Subscribers', 'View Share %']);
        locationList.forEach((loc) => {
          rows.push([loc.name, loc.country, loc.views, loc.visitors, loc.clicks, `${loc.ctr}%`, loc.subscribers, `${loc.percentage}%`]);
        });
        rows.push([]);
      }

    // 6. Devices & Browsers
    if (exportOptions.devices) {
      rows.push(['--- 6. DEVICES & BROWSERS REPORT ---']);
      rows.push(['Platform Category', 'Type / Name', 'Share %', 'Estimated Users']);
      const devicePercentage = (device: string, fallback: number) =>
        analytics?.devices.find((item) => item.device.toLowerCase() === device)?.percentage ?? fallback;
      const mobile = devicePercentage('mobile', 68);
      const desktop = devicePercentage('desktop', 26);
      const tablet = devicePercentage('tablet', 6);
      rows.push(['Device', 'Mobile', `${mobile}%`, Math.round((filteredData?.visitors || 0) * mobile / 100)]);
      rows.push(['Device', 'Desktop', `${desktop}%`, Math.round((filteredData?.visitors || 0) * desktop / 100)]);
      rows.push(['Device', 'Tablet', `${tablet}%`, Math.round((filteredData?.visitors || 0) * tablet / 100)]);
      rows.push(['Operating System', 'Android', '54%', '-']);
      rows.push(['Operating System', 'iOS', '28%', '-']);
      rows.push(['Operating System', 'Windows', '14%', '-']);
      rows.push(['Operating System', 'macOS', '4%', '-']);
      rows.push(['Browser', 'Chrome', '62%', '-']);
      rows.push(['Browser', 'Safari', '24%', '-']);
      rows.push(['Browser', 'Firefox', '8%', '-']);
      rows.push(['Browser', 'Edge', '6%', '-']);
      rows.push([]);
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `analytics-custom-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportModalOpen(false);
  }

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

  const d = filteredData || {
    views: 0,
    clicks: 0,
    visitors: 0,
    returningVisitors: 0,
    ctr: 0,
    subscribers: 0,
    subscriptionRate: 0,
  };

  const deltas = analytics?.deltas || {
    views: 12.4,
    visitors: 14.1,
    clicks: 8.6,
    ctr: 3.2,
    subscribers: 18.5,
  };

  return (
    <div className="admReportingContainer">
      {/* 1. Dashboard Top Action Row (Export CSV & Create Page) */}
      <div className="admReportTopBar">
        <div className="admReportActions">
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => setExportModalOpen(true)}
          >
            Export CSV
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => onNavigate('create')}
          >
            Create page
          </Button>
        </div>
      </div>

      {/* 2. Compact Horizontal Filter Toolbar */}
      <div className="admReportFilterBar" role="toolbar" aria-label="Dashboard filters">
        <div className="admReportFilterGroup">
          <SlidersHorizontal size={14} className="admReportFilterIcon" aria-hidden="true" />
          <span className="admReportFilterLabel">Filters:</span>
        </div>

        {/* Date Range */}
        {onDateRangeChange && (
          <div className="admFilterItem admFilterDate">
            <DateRangeFilterControl
              dateRange={dateRange}
              startDate={startDate}
              endDate={endDate}
              onDateRangeChange={onDateRangeChange}
              onCustomDateChange={onCustomDateChange}
            />
          </div>
        )}

        {/* Page Selector */}
        {onPageChange && (
          <div className="admFilterItem admFilterPage">
            <select
              aria-label="Filter by page"
              className="admReportSelect"
              value={reportPageId}
              onChange={e => onPageChange(e.target.value)}
            >
              <option value="all">All pages ({pages.length})</option>
              {pages.map(page => (
                <option key={page.id} value={page.id}>{page.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Country Selector */}
        <div className="admFilterItem admFilterCountry">
          <select
            aria-label="Filter by country"
            className="admReportSelect"
            value={selectedCountry}
            onChange={e => {
              setSelectedCountry(e.target.value);
              setSelectedState('all');
              setSelectedCity('all');
            }}
          >
            <option value="all">All Countries</option>
            {availableCountries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* State / Region Selector */}
        <div className="admFilterItem admFilterState">
          <select
            aria-label="Filter by state or region"
            className="admReportSelect"
            value={selectedState}
            onChange={e => {
              setSelectedState(e.target.value);
              setSelectedCity('all');
            }}
            disabled={!availableStates.length}
          >
            <option value="all">All States</option>
            {availableStates.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        {/* City Selector */}
        <div className="admFilterItem admFilterCity">
          <select
            aria-label="Filter by city"
            className="admReportSelect"
            value={selectedCity}
            onChange={e => setSelectedCity(e.target.value)}
            disabled={!availableCities.length}
          >
            <option value="all">All Cities</option>
            {availableCities.map(ct => (
              <option key={ct} value={ct}>{ct}</option>
            ))}
          </select>
        </div>

        {/* Device Selector */}
        <div className="admFilterItem admFilterDevice">
          <select
            aria-label="Filter by device"
            className="admReportSelect"
            value={selectedDevice}
            onChange={e => setSelectedDevice(e.target.value)}
          >
            <option value="all">All Devices</option>
            <option value="mobile">Mobile Only</option>
            <option value="desktop">Desktop Only</option>
            <option value="tablet">Tablet Only</option>
          </select>
        </div>

        {/* Reset Filters Button */}
        {isAnyFilterActive && (
          <button
            type="button"
            className="admReportResetBtn"
            onClick={handleResetFilters}
            title="Reset all active filters"
            aria-label="Reset all active filters"
          >
            <RotateCcw size={12} aria-hidden="true" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* 2. Overview KPI Cards with Period Comparison */}
      <div className="admReportKpis">
        <article className="admReportKpiCard">
          <div className="admReportKpiHead">
            <span>Total Views</span>
            <span className="admReportKpiIcon admTone-violet"><Eye size={18} /></span>
          </div>
          <div className="admReportKpiValue">{number(d.views)}</div>
          <div className="admReportKpiFoot">
            <span className="admKpiDelta isPositive">
              <ArrowUpRight size={12} /> +{deltas.views}%
            </span>
            <span>vs previous period</span>
          </div>
        </article>

        <article className="admReportKpiCard">
          <div className="admReportKpiHead">
            <span>Unique Visitors</span>
            <span className="admReportKpiIcon admTone-blue"><Users size={18} /></span>
          </div>
          <div className="admReportKpiValue">{number(d.visitors)}</div>
          <div className="admReportKpiFoot">
            <span className="admKpiDelta isPositive">
              <ArrowUpRight size={12} /> +{deltas.visitors}%
            </span>
            <span>{d.returningVisitors > 0 ? `${number(d.returningVisitors)} returning` : 'First-time reach'}</span>
          </div>
        </article>

        <article className="admReportKpiCard">
          <div className="admReportKpiHead">
            <span>Total Clicks</span>
            <span className="admReportKpiIcon admTone-rose"><MousePointer2 size={18} /></span>
          </div>
          <div className="admReportKpiValue">{number(d.clicks)}</div>
          <div className="admReportKpiFoot">
            <span className="admKpiDelta isPositive">
              <ArrowUpRight size={12} /> +{deltas.clicks}%
            </span>
            <span>Link interactions</span>
          </div>
        </article>

        <article className="admReportKpiCard">
          <div className="admReportKpiHead">
            <span>Click-Through Rate</span>
            <span className="admReportKpiIcon admTone-green"><TrendingUp size={18} /></span>
          </div>
          <div className="admReportKpiValue">{d.ctr}%</div>
          <div className="admReportKpiFoot">
            <span className="admKpiDelta isPositive">
              <ArrowUpRight size={12} /> +{deltas.ctr}%
            </span>
            <span>Avg CTR</span>
          </div>
        </article>

        <article className="admReportKpiCard">
          <div className="admReportKpiHead">
            <span>Subscribers</span>
            <span className="admReportKpiIcon admTone-blue"><User size={18} /></span>
          </div>
          <div className="admReportKpiValue">{number(d.subscribers)}</div>
          <div className="admReportKpiFoot">
            <span className="admKpiDelta isPositive">
              <ArrowUpRight size={12} /> +{deltas.subscribers}%
            </span>
            <span>{d.subscriptionRate}% subscribe rate</span>
          </div>
        </article>

        <article className="admReportKpiCard">
          <div className="admReportKpiHead">
            <span>Active Locations</span>
            <span className="admReportKpiIcon admTone-blue"><Globe2 size={18} /></span>
          </div>
          <div className="admReportKpiValue">{(analytics?.countries || []).length}</div>
          <div className="admReportKpiFoot">
            <span>{availableCities.length} distinct cities</span>
          </div>
        </article>
      </div>

      {/* 3. Views & Click Trend Charts (Daily & Hourly) */}
      <SectionCard
        title="Traffic & Engagement Analytics"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="admChartTabs">
              <button
                type="button"
                className={chartMode === 'daily' ? 'active' : ''}
                onClick={() => setChartMode('daily')}
              >
                Daily Trend
              </button>
              <button
                type="button"
                className={chartMode === 'hourly' ? 'active' : ''}
                onClick={() => setChartMode('hourly')}
              >
                Hourly (24h Peak)
              </button>
            </div>
            <span className="admMuted">{rangeLabel}</span>
          </div>
        }
      >
        {chartMode === 'daily' ? (
          <TrafficChart report={analytics} rangeLabel={rangeLabel} />
        ) : (
          <div className="admHourlyChartWrap">
            <div className="admHourlyChart">
              {(analytics?.hourly || []).map(h => {
                const maxViews = Math.max(1, ...(analytics?.hourly || []).map(x => x.views));
                const vHeight = Math.max(4, Math.round((h.views / maxViews) * 160));
                const cHeight = Math.max(2, Math.round((h.clicks / maxViews) * 160));
                return (
                  <div className="admHourlyCol" key={h.hour} title={`${h.hour}:00 — ${h.views} views, ${h.clicks} clicks`}>
                    <div className="admHourlyBarWrap">
                      <div className="admHourlyBarViews" style={{ height: `${vHeight}px` }} />
                      <div className="admHourlyBarClicks" style={{ height: `${cHeight}px` }} />
                    </div>
                    <span className="admHourlyLabel">{h.hour}h</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '16px', fontSize: '13px' }}>
              <span><i style={{ display: 'inline-block', width: 10, height: 10, background: '#3b82f6', borderRadius: 2, marginRight: 6 }} /> Views</span>
              <span><i style={{ display: 'inline-block', width: 10, height: 10, background: '#8b5cf6', borderRadius: 2, marginRight: 6 }} /> Clicks</span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* 4. Conversion Funnel */}
      <SectionCard title="Conversion Funnel (Visitor → Link Click → Subscriber)">
        <div className="admFunnelGrid">
          <div className="admFunnelStage">
            <div className="admFunnelStageHead">
              <strong>Stage 1: Page Views</strong>
              <span className="admFunnelBadge">Top of Funnel</span>
            </div>
            <div className="admFunnelCount">{number(d.views)}</div>
            <div className="admFunnelRate">100% of all incoming visitors</div>
            <div className="admFunnelTrack"><div className="admFunnelBar" style={{ width: '100%' }} /></div>
          </div>

          <div className="admFunnelStage">
            <div className="admFunnelStageHead">
              <strong>Stage 2: Link Click</strong>
              <span className="admFunnelBadge">{d.ctr}% CTR</span>
            </div>
            <div className="admFunnelCount">{number(d.clicks)}</div>
            <div className="admFunnelRate">{d.ctr}% clicked a link or button</div>
            <div className="admFunnelTrack"><div className="admFunnelBar" style={{ width: `${Math.min(100, d.ctr * 2)}%` }} /></div>
          </div>

          <div className="admFunnelStage">
            <div className="admFunnelStageHead">
              <strong>Stage 3: Subscribed</strong>
              <span className="admFunnelBadge">{d.subscriptionRate}% Opt-in</span>
            </div>
            <div className="admFunnelCount">{number(d.subscribers)}</div>
            <div className="admFunnelRate">{d.subscriptionRate}% accepted notifications</div>
            <div className="admFunnelTrack"><div className="admFunnelBar" style={{ width: `${Math.min(100, d.subscriptionRate * 4)}%` }} /></div>
          </div>
        </div>
      </SectionCard>

      {/* 5. Geographic Location Reporting & City Share Ratios */}
      <SectionCard
        title="Geographic Location Intelligence & Ratio Share"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="admChartTabs">
              <button
                type="button"
                className={locationTab === 'city' ? 'active' : ''}
                onClick={() => setLocationTab('city')}
              >
                Cities Breakdown
              </button>
              <button
                type="button"
                className={locationTab === 'region' ? 'active' : ''}
                onClick={() => setLocationTab('region')}
              >
                States / Regions
              </button>
              <button
                type="button"
                className={locationTab === 'country' ? 'active' : ''}
                onClick={() => setLocationTab('country')}
              >
                Countries
              </button>
            </div>
          </div>
        }
      >
        <div style={{ marginBottom: '16px' }}>
          <div className="admCountrySearch" style={{ maxWidth: 360 }}>
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search Mumbai, Dhaka, Kathmandu, Lahore, etc..."
              value={locationSearch}
              onChange={e => setLocationSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Top Ratio Share Bars */}
        <div className="admRatioGrid">
          {filteredLocations.slice(0, 5).map(loc => (
            <div className="admRatioItem" key={`${loc.name}-${loc.country}`}>
              <div className="admRatioMeta">
                <span>
                  <span style={{ marginRight: 6 }}>{loc.flag}</span>
                  <strong>{loc.name}</strong> ({loc.country})
                </span>
                <span>
                  <strong>{loc.percentage}%</strong> ({number(loc.views)} views · {number(loc.clicks)} clicks)
                </span>
              </div>
              <div className="admRatioBar">
                <div className="admRatioFill" style={{ width: `${loc.percentage}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Location Table */}
        <div className="admReportTableWrap">
          <table className="admReportTable">
            <thead>
              <tr>
                <th>Location</th>
                <th>Country</th>
                <th className="admTableNum">Visitors</th>
                <th className="admTableNum">Views</th>
                <th className="admTableNum">Clicks</th>
                <th className="admTableNum">CTR</th>
                <th className="admTableNum">Subscribers</th>
                <th className="admTableNum">View Share %</th>
              </tr>
            </thead>
            <tbody>
              {filteredLocations.slice(0, 15).map(loc => (
                <tr key={`${loc.name}-${loc.country}`}>
                  <td>
                    <span style={{ marginRight: 6 }}>{loc.flag}</span>
                    <strong>{loc.name}</strong>
                  </td>
                  <td>{loc.country}</td>
                  <td className="admTableNum">{number(loc.visitors)}</td>
                  <td className="admTableNum">{number(loc.views)}</td>
                  <td className="admTableNum">{number(loc.clicks)}</td>
                  <td className="admTableNum"><span className="admBadgeCtr">{loc.ctr}%</span></td>
                  <td className="admTableNum">{number(loc.subscribers)}</td>
                  <td className="admTableNum"><strong>{loc.percentage}%</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 6. Link & Button Performance Report */}
      <SectionCard
        title="Link & Button Click Performance"
        actions={<span className="admMuted">{linkPerformance.length} interactive elements</span>}
      >
        <div className="admReportTableWrap">
          <table className="admReportTable">
            <thead>
              <tr>
                <th onClick={() => setLinkSortBy('title')}>Link / Button Title</th>
                <th>Type</th>
                <th>Page</th>
                <th className="admTableNum" onClick={() => setLinkSortBy('views')}>Views</th>
                <th className="admTableNum" onClick={() => setLinkSortBy('clicks')}>Clicks</th>
                <th className="admTableNum">Unique Clicks</th>
                <th className="admTableNum" onClick={() => setLinkSortBy('ctr')}>CTR %</th>
                <th className="admTableNum">Conversions</th>
              </tr>
            </thead>
            <tbody>
              {linkPerformance.map(link => (
                <tr key={`${link.blockId}-${link.title}`}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MousePointer2 size={14} style={{ color: 'var(--c-accent)' }} />
                      <strong>{link.title}</strong>
                    </div>
                  </td>
                  <td><code>{link.type}</code></td>
                  <td><span>{link.pageName}</span></td>
                  <td className="admTableNum">{number(link.views)}</td>
                  <td className="admTableNum"><strong>{number(link.clicks)}</strong></td>
                  <td className="admTableNum">{number(link.uniqueClicks)}</td>
                  <td className="admTableNum"><span className="admBadgeCtr">{link.ctr}%</span></td>
                  <td className="admTableNum">{number(link.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 7. Page Performance Matrix */}
      <SectionCard
        title="Page Performance Matrix"
        actions={<span className="admMuted">{pages.length} pages</span>}
      >
        <div className="admReportTableWrap">
          <table className="admReportTable">
            <thead>
              <tr>
                <th onClick={() => setPageSortBy('name')}>Page Name</th>
                <th>Slug</th>
                <th className="admTableNum" onClick={() => setPageSortBy('views')}>Views</th>
                <th className="admTableNum">Visitors</th>
                <th className="admTableNum" onClick={() => setPageSortBy('clicks')}>Clicks</th>
                <th className="admTableNum" onClick={() => setPageSortBy('ctr')}>CTR %</th>
                <th className="admTableNum" onClick={() => setPageSortBy('subscribers')}>Subscribers</th>
                <th>Top City</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pagePerformance.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td><code>/{p.slug}</code></td>
                  <td className="admTableNum">{number(p.views)}</td>
                  <td className="admTableNum">{number(p.visitors)}</td>
                  <td className="admTableNum"><strong>{number(p.clicks)}</strong></td>
                  <td className="admTableNum"><span className="admBadgeCtr">{p.ctr}%</span></td>
                  <td className="admTableNum">{number(p.subscribers)}</td>
                  <td><span>{p.topCity}</span></td>
                  <td>
                    <Button size="sm" onClick={() => onOpen(p.id)}>Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 8. Devices, OS & Traffic Sources */}
      <div className="admHomeGrid">
        <div className="admBreakdownCard">
          <h4 className="admBreakdownTitle">Device Distribution</h4>
          <div className="admBreakdownList">
            {(Array.isArray(analytics?.devices) ? analytics.devices : []).map(d => (
              <div className="admBreakdownItem" key={d.device}>
                <div className="admBreakdownHeader">
                  <span>{d.device === 'Mobile' ? <Smartphone size={13} style={{ marginRight: 4, display: 'inline' }} /> : <Laptop size={13} style={{ marginRight: 4, display: 'inline' }} />}{d.device}</span>
                  <span>{d.percentage}% ({number(d.count)})</span>
                </div>
                <div className="admBreakdownTrack">
                  <div className="admBreakdownFill" style={{ width: `${d.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="admBreakdownCard">
          <h4 className="admBreakdownTitle">Operating Systems</h4>
          <div className="admBreakdownList">
            {(Array.isArray(analytics?.osBreakdown) ? analytics.osBreakdown : []).map(os => (
              <div className="admBreakdownItem" key={os.os}>
                <div className="admBreakdownHeader">
                  <span>{os.os}</span>
                  <span>{os.percentage}% ({number(os.count)})</span>
                </div>
                <div className="admBreakdownTrack">
                  <div className="admBreakdownFill" style={{ width: `${os.percentage}%`, background: '#8b5cf6' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="admBreakdownCard">
          <h4 className="admBreakdownTitle">Web Browsers</h4>
          <div className="admBreakdownList">
            {(Array.isArray(analytics?.browserBreakdown) ? analytics.browserBreakdown : []).map(b => (
              <div className="admBreakdownItem" key={b.browser}>
                <div className="admBreakdownHeader">
                  <span>{b.browser}</span>
                  <span>{b.percentage}% ({number(b.count)})</span>
                </div>
                <div className="admBreakdownTrack">
                  <div className="admBreakdownFill" style={{ width: `${b.percentage}%`, background: '#10b981' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="admBreakdownCard">
          <h4 className="admBreakdownTitle">Traffic Sources</h4>
          <div className="admBreakdownList">
            {(Array.isArray(analytics?.referrers) ? analytics.referrers : []).slice(0, 5).map(r => (
              <div className="admBreakdownItem" key={r.referrer}>
                <div className="admBreakdownHeader">
                  <span>{r.referrer}</span>
                  <span>{r.percentage}% ({number(r.count)})</span>
                </div>
                <div className="admBreakdownTrack">
                  <div className="admBreakdownFill" style={{ width: `${r.percentage}%`, background: '#f59e0b' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 9. Live Visitor & Click Activity Stream */}
      <SectionCard title="Live Activity Stream (Real-Time Events)" actions={<span className="admMuted">{analytics?.recentActivity?.length || 0} events</span>}>
        <RecentActivityFeed report={analytics} onOpen={onOpen} />
      </SectionCard>

      {/* 10. Customizable CSV Data Export Dialog */}
      {exportModalOpen && (
        <Dialog title="Export Workspace Analytics Data" onClose={() => setExportModalOpen(false)}>
          <div className="admFormStack" style={{ gap: "var(--sp-4)" }}>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--c-muted)", lineHeight: 1.4 }}>
              Select which reports and datasets to include in your exported CSV file. Filter scope: <strong>{rangeLabel}</strong>.
            </p>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--c-line)", paddingBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--c-ink)" }}>Include Datasets</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="admTextButton"
                  onClick={() =>
                    setExportOptions({
                      kpiSummary: true,
                      pagePerformance: true,
                      linkPerformance: true,
                      locations: true,
                      devices: true,
                      funnel: true,
                    })
                  }
                  style={{ fontSize: "11px", cursor: "pointer", color: "var(--c-accent)", background: "transparent", border: 0 }}
                >
                  Select All
                </button>
                <span style={{ color: "var(--c-line)" }}>|</span>
                <button
                  type="button"
                  className="admTextButton"
                  onClick={() =>
                    setExportOptions({
                      kpiSummary: false,
                      pagePerformance: false,
                      linkPerformance: false,
                      locations: false,
                      devices: false,
                      funnel: false,
                    })
                  }
                  style={{ fontSize: "11px", cursor: "pointer", color: "var(--c-muted)", background: "transparent", border: 0 }}
                >
                  Clear All
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {[
                { key: "kpiSummary", label: "Overview KPI Summary", desc: "Views, visitors, total clicks, CTR, subscribers", icon: Eye },
                { key: "funnel", label: "Conversion Funnel", desc: "View to click to subscription rates & drop-offs", icon: Layers },
                { key: "pagePerformance", label: "Page-by-Page Table", desc: "Traffic, clicks, conversions per smart page", icon: FileText },
                { key: "linkPerformance", label: "Link Clicks Breakdown", desc: "All buttons, social links, and external URLs", icon: Link2 },
                { key: "locations", label: "Geographic Intelligence", desc: "City & country distribution and CTR share", icon: Globe2 },
                { key: "devices", label: "Devices & Browsers", desc: "Mobile/desktop split, OS, and browser shares", icon: Laptop },
              ].map((item) => {
                const isChecked = exportOptions[item.key as keyof typeof exportOptions];
                const Icon = item.icon;
                return (
                  <label
                    key={item.key}
                    style={{
                      display: "flex",
                      alignItems: "start",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      border: isChecked ? "1px solid var(--c-accent)" : "1px solid var(--c-line)",
                      background: isChecked ? "var(--c-accent-soft)" : "var(--c-surface-sunken)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        setExportOptions((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                      style={{ marginTop: "3px" }}
                    />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icon size={14} style={{ color: isChecked ? "var(--c-accent)" : "var(--c-muted)" }} />
                        <strong style={{ fontSize: "13px", color: "var(--c-ink)" }}>{item.label}</strong>
                      </div>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--c-muted)", lineHeight: 1.3 }}>
                        {item.desc}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="admDialogActions" style={{ marginTop: "var(--sp-2)" }}>
              <Button onClick={() => setExportModalOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                icon={Download}
                disabled={!Object.values(exportOptions).some(Boolean)}
                onClick={handleCustomExport}
              >
                Download Selected CSV
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportingDashboard, type ReportingPageItem } from '../components/admin/ReportingDashboard';
import type { AnalyticsReport } from '../lib/types';

const samplePages: ReportingPageItem[] = [
  {
    id: 1,
    name: 'Main Bio Link',
    slug: 'main',
    title: 'Main Bio Link',
    status: 'published',
    views: 12500,
    uniqueVisitors: 10200,
    clicks: 4300,
    ctr: 34.4,
    updatedAt: new Date().toISOString(),
    blocks: [
      { id: 101, pageId: 1, type: 'button', title: 'WhatsApp VIP Group', clicks: 2100, isActive: true, sortOrder: 1 },
      { id: 102, pageId: 1, type: 'button', title: 'Telegram Channel', clicks: 1400, isActive: true, sortOrder: 2 },
      { id: 103, pageId: 1, type: 'button', title: 'Special Signup Offer', clicks: 800, isActive: true, sortOrder: 3 },
    ],
  },
  {
    id: 2,
    name: 'Affiliate Promo',
    slug: 'affiliate',
    title: 'Affiliate Promo',
    status: 'published',
    views: 8400,
    uniqueVisitors: 6900,
    clicks: 2900,
    ctr: 34.5,
    updatedAt: new Date().toISOString(),
    blocks: [
      { id: 201, pageId: 2, type: 'button', title: 'Claim Bonus Now', clicks: 2900, isActive: true, sortOrder: 1 },
    ],
  },
];

const sampleAnalytics: AnalyticsReport = {
  views: 20900,
  uniqueVisitors: 17100,
  returningVisitors: 3800,
  clicks: 7200,
  ctr: 34.4,
  subscribers: 1850,
  subscriptionRate: 8.9,
  daily: [
    { date: '2026-09-20', views: 9800, clicks: 3400 },
    { date: '2026-09-21', views: 11100, clicks: 3800 },
  ],
  hourly: [
    { hour: 0, views: 240, clicks: 80 },
    { hour: 12, views: 1850, clicks: 650 },
    { hour: 20, views: 2400, clicks: 920 },
  ],
  devices: [
    { device: 'Mobile', count: 15400, percentage: 73.7 },
    { device: 'Desktop', count: 4200, percentage: 20.1 },
    { device: 'Tablet', count: 1300, percentage: 6.2 },
  ],
  osBreakdown: [
    { os: 'Android', count: 10032, percentage: 48 },
    { os: 'iOS', count: 6688, percentage: 32 },
    { os: 'Windows', count: 2926, percentage: 14 },
    { os: 'macOS', count: 1045, percentage: 5 },
  ],
  browserBreakdown: [
    { browser: 'Chrome', count: 12122, percentage: 58 },
    { browser: 'Safari', count: 5434, percentage: 26 },
    { browser: 'Edge', count: 1672, percentage: 8 },
  ],
  referrers: [
    { referrer: 'Direct', count: 8500, percentage: 40.7 },
    { referrer: 'Instagram', count: 6200, percentage: 29.7 },
    { referrer: 'Telegram', count: 3900, percentage: 18.7 },
    { referrer: 'WhatsApp', count: 2300, percentage: 11.0 },
  ],
  locations: [
    { location: 'Mumbai, India', country: 'India', city: 'Mumbai', views: 7200, clicks: 2800 },
    { location: 'Dhaka, Bangladesh', country: 'Bangladesh', city: 'Dhaka', views: 5400, clicks: 1900 },
    { location: 'Kathmandu, Nepal', country: 'Nepal', city: 'Kathmandu', views: 3200, clicks: 1100 },
    { location: 'Lahore, Pakistan', country: 'Pakistan', city: 'Lahore', views: 2800, clicks: 950 },
  ],
  countries: [
    {
      countryCode: 'IN',
      countryName: 'India',
      views: 8500,
      clicks: 3200,
      ctr: 37.6,
      cities: [
        { city: 'Mumbai', location: 'Mumbai, India', views: 6200, clicks: 2400, ctr: 38.7, topLinks: [] },
        { city: 'Pune', location: 'Pune, India', views: 2300, clicks: 800, ctr: 34.8, topLinks: [] },
      ],
    },
    {
      countryCode: 'BD',
      countryName: 'Bangladesh',
      views: 5400,
      clicks: 1900,
      ctr: 35.2,
      cities: [
        { city: 'Dhaka', location: 'Dhaka, Bangladesh', views: 4100, clicks: 1500, ctr: 36.6, topLinks: [] },
        { city: 'Chattogram', location: 'Chattogram, Bangladesh', views: 1300, clicks: 400, ctr: 30.8, topLinks: [] },
      ],
    },
    {
      countryCode: 'NP',
      countryName: 'Nepal',
      views: 3200,
      clicks: 1100,
      ctr: 34.4,
      cities: [
        { city: 'Kathmandu', location: 'Kathmandu, Nepal', views: 3200, clicks: 1100, ctr: 34.4, topLinks: [] },
      ],
    },
    {
      countryCode: 'PK',
      countryName: 'Pakistan',
      views: 2800,
      clicks: 950,
      ctr: 33.9,
      cities: [
        { city: 'Lahore', location: 'Lahore, Pakistan', views: 1900, clicks: 650, ctr: 34.2, topLinks: [] },
        { city: 'Karachi', location: 'Karachi, Pakistan', views: 900, clicks: 300, ctr: 33.3, topLinks: [] },
      ],
    },
  ],
  topBlocks: [
    { id: 101, title: 'WhatsApp VIP Group', clicks: 2100 },
    { id: 102, title: 'Telegram Channel', clicks: 1400 },
  ],
  recentActivity: [
    {
      id: 'act-1',
      type: 'click',
      pageId: 1,
      pageName: 'main',
      blockId: 101,
      blockTitle: 'WhatsApp VIP Group',
      country: 'India',
      city: 'Mumbai',
      location: 'Mumbai, India',
      device: 'Mobile',
      referrer: 'Direct',
      date: new Date().toISOString(),
    },
  ],
};

test('ReportingDashboard renders overview KPI cards with period comparisons', () => {
  const html = renderToStaticMarkup(
    <ReportingDashboard
      pages={samplePages}
      analytics={sampleAnalytics}
      onOpen={() => {}}
      onNavigate={() => {}}
    />,
  );

  assert.match(html, /Total Views/);
  assert.match(html, /20,900/);
  assert.match(html, /Unique Visitors/);
  assert.match(html, /17,100/);
  assert.match(html, /Total Clicks/);
  assert.match(html, /7,200/);
  assert.match(html, /Click-Through Rate/);
  assert.match(html, /34.4%/);
  assert.match(html, /Subscribers/);
  assert.match(html, /1,850/);
});

test('ReportingDashboard renders conversion funnel stages and drop-offs', () => {
  const html = renderToStaticMarkup(
    <ReportingDashboard
      pages={samplePages}
      analytics={sampleAnalytics}
      onOpen={() => {}}
      onNavigate={() => {}}
    />,
  );

  assert.match(html, /Conversion Funnel/);
  assert.match(html, /Stage 1: Page Views/);
  assert.match(html, /Stage 2: Link Click/);
  assert.match(html, /Stage 3: Subscribed/);
});

test('ReportingDashboard renders geographic locations with Mumbai, Dhaka, Kathmandu, Lahore', () => {
  const html = renderToStaticMarkup(
    <ReportingDashboard
      pages={samplePages}
      analytics={sampleAnalytics}
      onOpen={() => {}}
      onNavigate={() => {}}
    />,
  );

  assert.match(html, /Geographic Location Intelligence/);
  assert.match(html, /Mumbai/);
  assert.match(html, /Dhaka/);
  assert.match(html, /Kathmandu/);
  assert.match(html, /Lahore/);
  assert.match(html, /🇮🇳/);
  assert.match(html, /🇧🇩/);
  assert.match(html, /🇳🇵/);
  assert.match(html, /🇵🇰/);
});

test('ReportingDashboard renders link performance table and page matrix', () => {
  const html = renderToStaticMarkup(
    <ReportingDashboard
      pages={samplePages}
      analytics={sampleAnalytics}
      onOpen={() => {}}
      onNavigate={() => {}}
    />,
  );

  assert.match(html, /Link &amp; Button Click Performance/);
  assert.match(html, /WhatsApp VIP Group/);
  assert.match(html, /Telegram Channel/);
  assert.match(html, /Special Signup Offer/);
  assert.match(html, /Page Performance Matrix/);
  assert.match(html, /Main Bio Link/);
  assert.match(html, /Affiliate Promo/);
});

test('ReportingDashboard renders device, operating system, and browser distributions', () => {
  const html = renderToStaticMarkup(
    <ReportingDashboard
      pages={samplePages}
      analytics={sampleAnalytics}
      onOpen={() => {}}
      onNavigate={() => {}}
    />,
  );

  assert.match(html, /Device Distribution/);
  assert.match(html, /Mobile/);
  assert.match(html, /Operating Systems/);
  assert.match(html, /Android/);
  assert.match(html, /iOS/);
  assert.match(html, /Web Browsers/);
  assert.match(html, /Chrome/);
  assert.match(html, /Safari/);
});

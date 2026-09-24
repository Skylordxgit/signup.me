import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminDashboard } from "../components/AdminDashboard";
import { CampaignHistoryView, CountryDrilldownView, DateRangeFilterControl, NotificationsView, PagesTable, RecentActivityFeed } from "../components/admin/DashboardViews";
import { BuilderEditor } from "../components/admin/BuilderEditor";
import { ProfileFields } from "../components/admin/BuilderEditor";
import { NotificationPromptFields, NotificationPromptPreview } from '../components/admin/BuilderEditor';
import { editablePage } from '../lib/admin';
import { isNotificationPromptEnabled, isNotificationPromptRequired, resolveNotificationPrompt, resolveNotificationPromptTheme } from '../lib/notificationPrompt';
import { NotificationOptIn } from '../components/NotificationOptIn';
import { PublicPage } from '../components/PublicPage';
import { combineAnalytics } from "../lib/admin";
import { seedPages } from "../lib/defaults";
import { isValidImageUrl, isValidSlug, parseBlockIcon, slugify, slugifyDraft } from "../lib/utils";
import { resolveUploadPath, uploadRoots } from "../lib/uploads";
import type { AnalyticsReport } from "../lib/types";

test("the admin shell waits for permissions before showing workspace tools", () => {
  const html = renderToStaticMarkup(<AdminDashboard />);
  assert.match(html, /admSidebar/);
  assert.match(html, /admTopbar/);
  assert.ok(html.includes('Settings'));
  assert.ok(html.includes('Logout'));
  assert.doesNotMatch(html, /aria-label="Team"|aria-label="Create Page"/);
  assert.doesNotMatch(html, /phoneDevice|phoneStage/);
});

test("an empty page still has profile fields and exactly one builder preview", () => {
  const page = { ...seedPages()[0], blocks: [], profileImage: '' };
  const noop = () => {};
  const html = renderToStaticMarkup(<BuilderEditor page={page} tab="profile" onTab={noop} onEdit={noop} onBlock={noop} onAdd={noop} onDelete={noop} onDuplicate={noop} onMove={noop} busy={false} />);
  assert.match(html, /Profile photo/);
  assert.match(html, /Profile title/);
  assert.equal((html.match(/class="phoneDevice"/g) || []).length, 1);
  assert.match(renderToStaticMarkup(<ProfileFields page={page} onEdit={noop} />), /type="file"/);
});

test("uploaded profile and custom icon paths are accepted without allowing traversal", () => {
  assert.equal(isValidImageUrl('/uploads/profile/test-photo.webp'), true);
  assert.equal(isValidImageUrl('/uploads/profile/../../secret.png'), false);
  assert.equal(isValidImageUrl('//another-host/photo.png'), false);
  assert.equal(isValidImageUrl('javascript:alert(1)'), false);
  assert.deepEqual(parseBlockIcon('/uploads/icon/icon.webp'), { kind: 'image', src: '/uploads/icon/icon.webp' });
});

test("upload roots are absolute, anchored to the app, and still contain traversal", () => {
  // Serving resolved only against process.cwd(), so restarting the app from a
  // different directory made every saved image 404 while the database and the
  // files were both still intact. (The cwd behaviour itself needs a running
  // server to observe; this covers the shape of the roots and their guards.)
  assert.ok(uploadRoots.length >= 1);
  assert.ok(uploadRoots.every(root => path.isAbsolute(root)), "roots must be absolute");

  // The root the app writes to is anchored to the installed app (the directory
  // holding package.json), so it is the same directory however the process was
  // launched — a plain cwd join would point wherever the host started us.
  const installed = path.dirname(path.dirname(uploadRoots[0]));
  assert.ok(existsSync(path.join(installed, "package.json")), `${uploadRoots[0]} is not anchored to the app`);
  assert.ok(uploadRoots[0].endsWith(path.join("data", "uploads")));

  // Containment is still enforced for every root that gets searched.
  assert.equal(resolveUploadPath(["..", "..", "etc", "passwd"]), null);
  assert.equal(resolveUploadPath(["profile", "..", "..", "..", "secret.png"]), null);
  assert.equal(resolveUploadPath([]), null);
  assert.ok(resolveUploadPath(["profile", "photo.webp"])?.endsWith(path.join("profile", "photo.webp")));
});

test('page-specific prompt text survives the save payload and reaches the visitor prompt', () => {
  const page = seedPages()[0];
  page.integrations.notificationPrompt = {
    enabled: true,
    required: true,
    buttonAnimation: 'glow',
    buttonColor: '#7c3aed',
    buttonTextColor: '#ffffff',
    cardBackground: '#0f0c20',
    heading: 'Noticias',
    allowLabel: 'Permitir',
    requiredBadge: '🔒 Acceso Requerido',
    successHeading: 'Suscrito',
    message: '<script>plain text</script>',
  };
  const saved = JSON.parse(JSON.stringify(editablePage(page)));
  assert.equal(saved.integrations.notificationPrompt.enabled, true);
  assert.equal(saved.integrations.notificationPrompt.required, true);
  assert.equal(saved.integrations.notificationPrompt.heading, 'Noticias');
  assert.equal(isNotificationPromptEnabled(saved.integrations.notificationPrompt), true);
  assert.equal(isNotificationPromptRequired(saved.integrations.notificationPrompt), true);

  const theme = resolveNotificationPromptTheme(saved.integrations.notificationPrompt);
  assert.equal(theme.buttonAnimation, 'glow');
  assert.equal(theme.buttonColor, '#7c3aed');
  assert.equal(theme.cardBackground, '#0f0c20');
  assert.equal(theme.required, true);

  const html = renderToStaticMarkup(<NotificationOptIn slug={page.slug} title={page.title} settings={saved.integrations.notificationPrompt} />);
  assert.match(html, /Noticias/);
  assert.match(html, /Permitir/);
  assert.match(html, /Acceso Requerido/);
  assert.match(html, /data-gated="true"/);
  assert.match(html, /pushPromptAnim_glow/);
  assert.match(html, /--prompt-btn-bg:#7c3aed/);
  assert.match(html, /&lt;script&gt;plain text&lt;\/script&gt;/);
  assert.equal(resolveNotificationPrompt({ heading: ' ' }).heading, 'Stay up to date');
  assert.match(renderToStaticMarkup(<NotificationPromptFields page={page} onEdit={() => {}} />), /value="Noticias"/);
  assert.match(renderToStaticMarkup(<NotificationPromptPreview page={page} />), /Prompt preview/);
  assert.match(renderToStaticMarkup(<NotificationPromptPreview page={page} />), /Forced Gate/);

  // When forced gate mode is turned off, it returns to non-gated standard prompt
  page.integrations.notificationPrompt.required = false;
  assert.equal(isNotificationPromptRequired(page.integrations.notificationPrompt), false);
  const unforcedHtml = renderToStaticMarkup(<NotificationOptIn slug={page.slug} title={page.title} settings={page.integrations.notificationPrompt} />);
  assert.match(unforcedHtml, /data-gated="false"/);
  assert.doesNotMatch(unforcedHtml, /Acceso Requerido/);
});

test('public pages only render the notification prompt when the visitor prompt is enabled', () => {
  const page = seedPages()[0];
  page.integrations.notificationPrompt = { heading: 'Hidden prompt' };
  assert.doesNotMatch(renderToStaticMarkup(<PublicPage page={page} />), /Hidden prompt/);
  page.integrations.notificationPrompt = { enabled: true, heading: 'Visible prompt' };
  assert.match(renderToStaticMarkup(<PublicPage page={page} />), /Visible prompt/);
});

test("workspace analytics merge daily and device totals and weight the click rate", () => {
  const base: AnalyticsReport = {
    views: 100,
    clicks: 10,
    uniqueVisitors: 30,
    ctr: 10,
    daily: [{ date: '2026-09-08', views: 20, clicks: 5 }],
    devices: [{ device: 'mobile', count: 20 }],
    referrers: [{ referrer: 'Direct', count: 20 }],
    locations: [{ location: 'United States', country: 'United States', city: '', views: 20, clicks: 5 }],
    linkLocations: [{ blockId: 1, blockTitle: 'Instagram', location: 'United States', country: 'United States', city: '', clicks: 5 }],
    topBlocks: [],
  };
  const result = combineAnalytics([base, { ...base, views: 300, clicks: 90, ctr: 30 }]);
  assert.equal(result.views, 400);
  assert.equal(result.ctr, 25);
  assert.deepEqual(result.daily, [{ date: '2026-09-08', views: 40, clicks: 10 }]);
  assert.deepEqual(result.devices, [{ device: 'mobile', count: 40 }]);
  assert.equal(result.locations[0].clicks, 10);
  assert.equal(result.linkLocations?.[0].clicks, 10);
});

test("slugs can be typed one hyphen at a time and still normalise before saving", () => {
  // slugify strips the trailing hyphen, so using it on every keystroke made
  // "my-page" impossible to type: the hyphen vanished as soon as it was typed.
  assert.equal(slugifyDraft("my-"), "my-");
  assert.equal(slugifyDraft("My Page"), "my-page");
  assert.equal(slugifyDraft("  Leading"), "leading");
  assert.equal(slugifyDraft("Caf\u00e9 #1"), "caf-1");

  // Blur and save still hand the server a slug it accepts unchanged, so the
  // builder never shows a slug the public page does not answer on.
  assert.equal(slugify(slugifyDraft("my-")), "my");
  for (const typed of ["My Page", "my-", "  Leading", "a--b"]) {
    const normalised = slugify(slugifyDraft(typed));
    assert.equal(isValidSlug(normalised), true, `${typed} produced ${normalised}`);
    assert.equal(slugify(normalised), normalised, `${normalised} is not stable`);
  }
});

test("the pages screen offers export for a selection and import beside Create page", () => {
  const shell = renderToStaticMarkup(<AdminDashboard />);
  // The admin stays a full-screen desktop app, never a phone-framed one.
  assert.doesNotMatch(shell, /phoneDevice|phoneStage/);

  const summaries = [{ id: 7, name: 'Launch Hub', slug: 'launch-hub', status: 'published' as const, views: 3, uniqueVisitors: 2, clicks: 1, updatedAt: new Date().toISOString() }];
  const managed = renderToStaticMarkup(
    <PagesTable pages={summaries} onOpen={() => {}} onBulkStatus={async () => []} onExport={async () => 'done'} />,
  );
  assert.match(managed, /Export selected/);
  // Export acts on a selection, so the row checkboxes are what drive it.
  assert.match(managed, /Select Launch Hub/);
  assert.match(managed, /Select all visible pages/);

  // A read-only table (the dashboard's recent list) offers neither action.
  const plain = renderToStaticMarkup(<PagesTable pages={summaries} onOpen={() => {}} />);
  assert.doesNotMatch(plain, /Export selected/);
});

test("campaign history renders KPI metrics, visual funnel cards, and tabs correctly", () => {
  const sampleCampaign = {
    id: 101,
    workspaceId: 'ws-test',
    pageId: null,
    pageSlug: null,
    title: 'Flash Sale 50% Off',
    body: 'Grab your limited discount code now before it ends!',
    url: 'https://example.com/deal',
    audience: 'All subscribers',
    status: 'completed' as const,
    attempted: 100,
    sent: 100,
    delivered: 95,
    seen: 80,
    clicked: 25,
    clicks: 25,
    failed: 3,
    removed: 2,
    createdAt: '2026-09-13T10:00:00.000Z',
    updatedAt: '2026-09-13T10:30:00.000Z',
  };

  const html = renderToStaticMarkup(
    <CampaignHistoryView
      campaigns={[sampleCampaign]}
      pages={[]}
      onComposeWith={() => {}}
      onRefresh={() => {}}
      onGoToCompose={() => {}}
    />
  );

  assert.match(html, /Push Campaign History/);
  assert.match(html, /Flash Sale 50% Off/);
  assert.match(html, /95%|\b95\.0%\b/); // Delivery rate
  assert.match(html, /https:\/\/example\.com\/deal/);
  assert.match(html, /admCampaignFunnelGrid/);
  assert.match(html, /Inspect &amp; preview|Inspect & preview/);
  assert.match(html, /Reuse in composer/);

  const notifHtml = renderToStaticMarkup(<NotificationsView pages={[]} initialTab="campaigns" />);
  assert.match(notifHtml, /Campaign/);
  assert.match(notifHtml, /Campaigns/);
  assert.match(notifHtml, /Subscribers/);
});

test("dashboard provides custom date picker, detailed country/city breakdown, and live activity stream", () => {
  const customPickerHtml = renderToStaticMarkup(
    <DateRangeFilterControl
      dateRange="custom"
      startDate="2026-09-01"
      endDate="2026-09-21"
      onDateRangeChange={() => {}}
      onCustomDateChange={() => {}}
    />
  );
  assert.match(customPickerHtml, /admCustomDateInputs/);
  assert.match(customPickerHtml, /2026-09-01/);
  assert.match(customPickerHtml, /2026-09-21/);

  const sampleReport: AnalyticsReport = {
    views: 120,
    uniqueVisitors: 90,
    clicks: 45,
    ctr: 37.5,
    topBlocks: [{ id: 1, title: 'Promo Link', clicks: 18 }],
    daily: [{ date: '2026-09-20', views: 50, clicks: 20 }],
    devices: [{ device: 'mobile', count: 80 }],
    referrers: [{ referrer: 'direct', count: 60 }],
    locations: [
      { location: 'Dhaka, Bangladesh', country: 'Bangladesh', city: 'Dhaka', views: 70, clicks: 30 },
      { location: 'New York, United States', country: 'United States', city: 'New York', views: 50, clicks: 15 },
    ],
    countries: [
      {
        countryName: 'Bangladesh',
        countryCode: 'BD',
        views: 70,
        clicks: 30,
        ctr: 42.9,
        cities: [
          {
            city: 'Dhaka',
            location: 'Dhaka, Bangladesh',
            views: 55,
            clicks: 25,
            ctr: 45.5,
            topLinks: [{ blockId: 1, blockTitle: 'Promo Link', clicks: 18 }],
          },
          {
            city: 'Chittagong',
            location: 'Chittagong, Bangladesh',
            views: 15,
            clicks: 5,
            ctr: 33.3,
            topLinks: [{ blockId: 2, blockTitle: 'Shop Link', clicks: 5 }],
          },
        ],
      },
    ],
    recentActivity: [
      {
        id: 'evt-1',
        type: 'click',
        pageId: 1,
        pageName: 'Launch Page',
        blockTitle: 'Promo Link',
        location: 'Dhaka, Bangladesh',
        country: 'Bangladesh',
        city: 'Dhaka',
        device: 'mobile',
        referrer: 'direct',
        date: '2026-09-21T10:00:00.000Z',
      },
      {
        id: 'evt-2',
        type: 'view',
        pageId: 1,
        pageName: 'Launch Page',
        location: 'New York, United States',
        country: 'United States',
        city: 'New York',
        device: 'desktop',
        referrer: 'direct',
        date: '2026-09-21T09:45:00.000Z',
      },
    ],
  };

  const drilldownHtml = renderToStaticMarkup(<CountryDrilldownView report={sampleReport} />);
  assert.match(drilldownHtml, /Bangladesh/);
  assert.match(drilldownHtml, /🇧🇩/);
  assert.match(drilldownHtml, /Dhaka/);
  assert.match(drilldownHtml, /Chittagong/);
  assert.match(drilldownHtml, /42\.9% CTR/);

  const feedHtml = renderToStaticMarkup(<RecentActivityFeed report={sampleReport} />);
  assert.match(feedHtml, /Clicked/);
  assert.match(feedHtml, /Viewed/);
  assert.match(feedHtml, /Dhaka, Bangladesh/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminDashboard } from "../components/AdminDashboard";
import { BuilderEditor } from "../components/admin/BuilderEditor";
import { ProfileFields } from "../components/admin/BuilderEditor";
import { combineAnalytics } from "../lib/admin";
import { seedPages } from "../lib/defaults";
import { isValidImageUrl, parseBlockIcon } from "../lib/utils";
import type { AnalyticsReport } from "../lib/types";

test("the admin shell uses full workspace navigation without a phone frame", () => {
  const html = renderToStaticMarkup(<AdminDashboard />);
  assert.match(html, /admSidebar/);
  assert.match(html, /admTopbar/);
  for (const name of ['Dashboard', 'Pages', 'Create Page', 'Analytics', 'Media', 'Themes', 'Notifications', 'Settings', 'Logout']) assert.ok(html.includes(name));
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

test("workspace analytics merge daily and device totals and weight the click rate", () => {
  const base: AnalyticsReport = { views: 100, clicks: 10, uniqueVisitors: 30, ctr: 10, daily: [{ date: '2026-09-08', views: 20, clicks: 5 }], devices: [{ device: 'mobile', count: 20 }], referrers: [{ referrer: 'Direct', count: 20 }], topBlocks: [] };
  const result = combineAnalytics([base, { ...base, views: 300, clicks: 90, ctr: 30 }]);
  assert.equal(result.views, 400);
  assert.equal(result.ctr, 25);
  assert.deepEqual(result.daily, [{ date: '2026-09-08', views: 40, clicks: 10 }]);
  assert.deepEqual(result.devices, [{ device: 'mobile', count: 40 }]);
});

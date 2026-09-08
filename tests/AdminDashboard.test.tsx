import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminDashboard } from "../components/AdminDashboard";
import { BuilderEditor } from "../components/admin/BuilderEditor";
import { ProfileFields } from "../components/admin/BuilderEditor";
import { combineAnalytics } from "../lib/admin";
import { seedPages } from "../lib/defaults";
import { isValidImageUrl, parseBlockIcon } from "../lib/utils";
import { resolveUploadPath, uploadRoots } from "../lib/uploads";
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

test("workspace analytics merge daily and device totals and weight the click rate", () => {
  const base: AnalyticsReport = { views: 100, clicks: 10, uniqueVisitors: 30, ctr: 10, daily: [{ date: '2026-09-08', views: 20, clicks: 5 }], devices: [{ device: 'mobile', count: 20 }], referrers: [{ referrer: 'Direct', count: 20 }], topBlocks: [] };
  const result = combineAnalytics([base, { ...base, views: 300, clicks: 90, ctr: 30 }]);
  assert.equal(result.views, 400);
  assert.equal(result.ctr, 25);
  assert.deepEqual(result.daily, [{ date: '2026-09-08', views: 40, clicks: 10 }]);
  assert.deepEqual(result.devices, [{ device: 'mobile', count: 40 }]);
});

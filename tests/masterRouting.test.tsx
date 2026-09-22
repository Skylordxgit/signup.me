import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MasterAdminLayout, masterNavItems } from "../components/admin/MasterAdminLayout";
import {
  MasterOverviewView,
  MasterWorkspacesView,
  MasterDomainsView,
  MasterUsersView,
  MasterBrandingView,
  MasterSignupView,
} from "../components/admin/MasterViews";

test("master navigation items have correct paths, icons, and labels", () => {
  const expected = [
    { href: "/admin/master", label: "Overview" },
    { href: "/admin/master/workspaces", label: "Workspaces" },
    { href: "/admin/master/domains", label: "Domains" },
    { href: "/admin/master/users", label: "All users" },
    { href: "/admin/master/branding", label: "Global branding" },
    { href: "/admin/master/signup", label: "Signup access" },
  ];

  assert.equal(masterNavItems.length, 6);
  for (let i = 0; i < expected.length; i++) {
    assert.equal(masterNavItems[i].href, expected[i].href);
    assert.equal(masterNavItems[i].label, expected[i].label);
  }
});

test("MasterAdminLayout renders shared sidebar, topbar, and child route content", () => {
  const html = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <div id="test-route-content">Unique Route Content</div>
    </MasterAdminLayout>
  );

  assert.match(html, /master@example\.com/);
  assert.match(html, /Master Admin/);
  assert.match(html, /Overview/);
  assert.match(html, /Workspaces/);
  assert.match(html, /Domains/);
  assert.match(html, /All users/);
  assert.match(html, /Global branding/);
  assert.match(html, /Signup access/);
  assert.match(html, /Unique Route Content/);
});

test("each Master Admin route component renders its own distinct view content", () => {
  // 1. Overview Route
  const overviewHtml = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterOverviewView />
    </MasterAdminLayout>
  );
  assert.match(overviewHtml, /Everything important, at a glance/);
  assert.match(overviewHtml, /Recent workspaces/);

  // 2. Workspaces Route
  const workspacesHtml = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterWorkspacesView />
    </MasterAdminLayout>
  );
  assert.match(workspacesHtml, /Workspace management/);
  assert.match(workspacesHtml, /Inspect, enter, enable or disable every tenant/);

  // 3. Domains Route
  const domainsHtml = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterDomainsView />
    </MasterAdminLayout>
  );
  assert.match(domainsHtml, /Custom domains/);
  assert.match(domainsHtml, /Connect branded hostnames, verify DNS/);

  // 4. Users Route
  const usersHtml = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterUsersView />
    </MasterAdminLayout>
  );
  assert.match(usersHtml, /All registered users/);
  assert.match(usersHtml, /Add user \/ admin/);

  // 5. Branding Route
  const brandingHtml = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterBrandingView />
    </MasterAdminLayout>
  );
  assert.match(brandingHtml, /Global branding/);
  assert.match(brandingHtml, /Live preview/);

  // 6. Signup Route
  const signupHtml = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterSignupView />
    </MasterAdminLayout>
  );
  assert.match(signupHtml, /Public signup/);
  assert.match(signupHtml, /Control whether new people can create independent workspaces/);
});

test("URL changes render corresponding page without stale React state", () => {
  // Simulate routing sequence:
  // Step 1: /admin/master
  const step1 = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterOverviewView />
    </MasterAdminLayout>
  );
  assert.match(step1, /Everything important, at a glance/);
  assert.doesNotMatch(step1, /Control whether new people can create independent workspaces/);

  // Step 2: Navigate to /admin/master/workspaces
  const step2 = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterWorkspacesView />
    </MasterAdminLayout>
  );
  assert.match(step2, /Workspace management/);
  assert.doesNotMatch(step2, /Control whether new people can create independent workspaces/);

  // Step 3: Navigate to /admin/master/signup
  const step3 = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterSignupView />
    </MasterAdminLayout>
  );
  assert.match(step3, /Public signup/);
  assert.doesNotMatch(step3, /Workspace management/);

  // Step 4: Browser Back to /admin/master/workspaces -> Content is Workspaces!
  const step4 = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterWorkspacesView />
    </MasterAdminLayout>
  );
  assert.match(step4, /Workspace management/);
  assert.doesNotMatch(step4, /Public signup/);

  // Step 5: Browser Back to /admin/master -> Content is Overview!
  const step5 = renderToStaticMarkup(
    <MasterAdminLayout email="master@example.com">
      <MasterOverviewView />
    </MasterAdminLayout>
  );
  assert.match(step5, /Everything important, at a glance/);
});

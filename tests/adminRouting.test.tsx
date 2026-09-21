import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getRouteInfo, isNavActive, type NavItem } from "../components/admin/AdminLayout";
import { AdminLayout } from "../components/admin/AdminLayout";
import { LayoutDashboard, FileText, Plus, ImageIcon, Palette, Bell, Sparkles, Users, Settings, Building2, Globe2, ShieldCheck } from "lucide-react";

test("admin routing detects active sidebar items accurately based on pathname", () => {
  const items: Record<string, NavItem> = {
    dashboard: { id: "dashboard", label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, group: "Overview" },
    pages: { id: "pages", label: "Pages", href: "/admin/pages", icon: FileText, group: "Content" },
    create: { id: "create", label: "Create Page", href: "/admin/pages/new", icon: Plus, group: "Content" },
    media: { id: "media", label: "Media", href: "/admin/media", icon: ImageIcon, group: "Content" },
    themes: { id: "themes", label: "Themes", href: "/admin/themes", icon: Palette, group: "Content" },
    notifications: { id: "notifications", label: "Notifications", href: "/admin/notifications", icon: Bell, group: "Engagement" },
    branding: { id: "branding", label: "Branding", href: "/admin/branding", icon: Sparkles, group: "Workspace" },
    users: { id: "users", label: "Team", href: "/admin/users", icon: Users, group: "Workspace" },
    settings: { id: "settings", label: "Settings", href: "/admin/settings", icon: Settings, group: "Workspace" },
    workspaces: { id: "workspaces", label: "Workspaces", href: "/admin/workspaces", icon: Building2, group: "Platform" },
    domains: { id: "domains", label: "Domains", href: "/admin/domains", icon: Globe2, group: "Platform" },
    master: { id: "master", label: "Master", href: "/admin/master", icon: ShieldCheck, group: "Platform" },
  };

  // Dashboard route
  assert.equal(isNavActive(items.dashboard, "/admin/dashboard"), true);
  assert.equal(isNavActive(items.dashboard, "/admin/analytics"), true);
  assert.equal(isNavActive(items.dashboard, "/workspace/dashboard"), true);
  assert.equal(isNavActive(items.dashboard, "/admin/pages"), false);

  // Pages list route
  assert.equal(isNavActive(items.pages, "/admin/pages"), true);
  assert.equal(isNavActive(items.pages, "/workspace/pages"), true);
  assert.equal(isNavActive(items.pages, "/admin/pages/10/edit"), true);
  assert.equal(isNavActive(items.pages, "/admin/pages/new"), false); // Create page is active instead
  assert.equal(isNavActive(items.pages, "/admin/branding"), false);

  // Create page route
  assert.equal(isNavActive(items.create, "/admin/pages/new"), true);
  assert.equal(isNavActive(items.create, "/admin/create"), true);
  assert.equal(isNavActive(items.create, "/workspace/pages/new"), true);
  assert.equal(isNavActive(items.create, "/admin/pages"), false);

  // Media route
  assert.equal(isNavActive(items.media, "/admin/media"), true);
  assert.equal(isNavActive(items.media, "/workspace/media"), true);
  assert.equal(isNavActive(items.media, "/admin/pages"), false);

  // Themes route
  assert.equal(isNavActive(items.themes, "/admin/themes"), true);
  assert.equal(isNavActive(items.themes, "/workspace/themes"), true);

  // Notifications route
  assert.equal(isNavActive(items.notifications, "/admin/notifications"), true);
  assert.equal(isNavActive(items.notifications, "/workspace/notifications"), true);

  // Branding route
  assert.equal(isNavActive(items.branding, "/admin/branding"), true);
  assert.equal(isNavActive(items.branding, "/workspace/branding"), true);

  // Team / Users route
  assert.equal(isNavActive(items.users, "/admin/users"), true);
  assert.equal(isNavActive(items.users, "/admin/team"), true);
  assert.equal(isNavActive(items.users, "/workspace/users"), true);

  // Settings route
  assert.equal(isNavActive(items.settings, "/admin/settings"), true);
  assert.equal(isNavActive(items.settings, "/workspace/settings"), true);

  // Workspaces & Domains route
  assert.equal(isNavActive(items.workspaces, "/admin/workspaces"), true);
  assert.equal(isNavActive(items.domains, "/admin/domains"), true);
});

test("route heading and builder mode are derived from URL pathname", () => {
  assert.deepEqual(getRouteInfo("/admin/dashboard"), { heading: "Dashboard", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/pages"), { heading: "Pages", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/pages/new"), { heading: "Create Page", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/create"), { heading: "Create Page", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/pages/42/edit"), { heading: "Page builder", isBuilder: true });
  assert.deepEqual(getRouteInfo("/admin/media"), { heading: "Media", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/themes"), { heading: "Themes", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/notifications"), { heading: "Notifications", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/branding"), { heading: "Branding", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/analytics"), { heading: "Analytics", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/users"), { heading: "Team", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/settings"), { heading: "Settings", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/workspaces"), { heading: "Workspaces", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/domains"), { heading: "Custom Domains", isBuilder: false });
  assert.deepEqual(getRouteInfo("/admin/master"), { heading: "Master Admin", isBuilder: false });
});

test("shared AdminLayout renders unified sidebar, topbar, and page container", () => {
  const html = renderToStaticMarkup(
    <AdminLayout>
      <div className="testPageContent">Content loaded for route</div>
    </AdminLayout>
  );

  assert.match(html, /admSidebar/);
  assert.match(html, /admTopbar/);
  assert.match(html, /admMain/);
  assert.match(html, /testPageContent/);
  assert.ok(html.includes("Dashboard"));
  assert.ok(html.includes("Pages"));
  assert.ok(html.includes("Media"));
  assert.ok(html.includes("Branding"));
  assert.ok(html.includes("Settings"));
  assert.ok(html.includes("Logout"));
});

test("direct route access and URL resolution across all admin sections", () => {
  const routes = [
    { path: "/admin/dashboard", expectedHeading: "Dashboard", builder: false },
    { path: "/admin/pages", expectedHeading: "Pages", builder: false },
    { path: "/admin/pages/new", expectedHeading: "Create Page", builder: false },
    { path: "/admin/pages/99/edit", expectedHeading: "Page builder", builder: true },
    { path: "/admin/media", expectedHeading: "Media", builder: false },
    { path: "/admin/themes", expectedHeading: "Themes", builder: false },
    { path: "/admin/notifications", expectedHeading: "Notifications", builder: false },
    { path: "/admin/branding", expectedHeading: "Branding", builder: false },
    { path: "/admin/analytics", expectedHeading: "Analytics", builder: false },
    { path: "/admin/users", expectedHeading: "Team", builder: false },
    { path: "/admin/settings", expectedHeading: "Settings", builder: false },
    { path: "/admin/workspaces", expectedHeading: "Workspaces", builder: false },
    { path: "/admin/domains", expectedHeading: "Custom Domains", builder: false },
    { path: "/workspace/dashboard", expectedHeading: "Dashboard", builder: false },
    { path: "/workspace/pages", expectedHeading: "Pages", builder: false },
    { path: "/workspace/pages/new", expectedHeading: "Create Page", builder: false },
    { path: "/workspace/branding", expectedHeading: "Branding", builder: false },
    { path: "/workspace/analytics", expectedHeading: "Analytics", builder: false },
    { path: "/workspace/settings", expectedHeading: "Settings", builder: false },
  ];

  for (const { path, expectedHeading, builder } of routes) {
    const info = getRouteInfo(path);
    assert.equal(info.heading, expectedHeading, `Failed heading check for ${path}`);
    assert.equal(info.isBuilder, builder, `Failed builder flag for ${path}`);
  }
});

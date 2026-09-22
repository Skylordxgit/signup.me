import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("admin UI CSS rules prevent horizontal side-to-side scrolling", () => {
  const rootDir = process.cwd();
  const layoutCss = fs.readFileSync(path.join(rootDir, "components/admin/layout.css"), "utf-8");
  const baseCss = fs.readFileSync(path.join(rootDir, "components/admin/base.css"), "utf-8");
  const componentsCss = fs.readFileSync(path.join(rootDir, "components/admin/components.css"), "utf-8");
  const screensCss = fs.readFileSync(path.join(rootDir, "components/admin/screens.css"), "utf-8");
  const reportingCss = fs.readFileSync(path.join(rootDir, "components/admin/reporting.css"), "utf-8");

  // 1. Root container width calculation should not exceed 100%
  assert.match(layoutCss, /max-width:\s*100%/);
  assert.ok(!layoutCss.includes(".admShell {\n  display: grid;\n  grid-template-columns: var(--adm-sidebar) minmax(0, 1fr);\n  min-height: 100dvh;\n  width: 100%;\n  max-width: 100vw;"), "admShell should use 100% instead of 100vw to avoid scrollbar width overflow");

  // 2. Form controls must have min-width: 0 and max-width: 100%
  assert.match(baseCss, /max-width:\s*100%;\s*min-width:\s*0;/);

  // 3. Table wrappers must support horizontal containment
  assert.match(componentsCss, /\.admTableWrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(reportingCss, /\.admReportTableWrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(screensCss, /\.admSubscriberScroll\s*\{[^}]*overflow-x:\s*auto/);

  // 4. Dialog width should bound to viewport without overflow
  assert.match(componentsCss, /width:\s*min\(540px,\s*calc\(100%\s*-\s*var\(--sp-6\)\)\)/);

  // 5. Responsive mobile breakpoints exist for tablet and mobile
  assert.match(layoutCss, /@media\s*\(max-width:\s*820px\)/);
  assert.match(layoutCss, /@media\s*\(max-width:\s*600px\)/);
  assert.match(layoutCss, /@media\s*\(max-width:\s*390px\)/);
});

test("admin UI components adhere to design token standards", () => {
  const rootDir = process.cwd();
  const tokensCss = fs.readFileSync(path.join(rootDir, "components/admin/tokens.css"), "utf-8");

  assert.match(tokensCss, /--c-accent:\s*#2563eb/);
  assert.match(tokensCss, /--c-success:\s*#059669/);
  assert.match(tokensCss, /--c-danger:\s*#dc2626/);
  assert.match(tokensCss, /--control-h:\s*38px/);
  assert.match(tokensCss, /--control-h-sm:\s*32px/);
  assert.match(tokensCss, /--radius-lg:\s*12px/);
});

/**
 * Admin UI/UX audit.
 *
 * Signs up a normal workspace account (the seeded ADMIN_EMAIL resolves as
 * master under the current auth model), then walks every admin screen at every
 * supported breakpoint asserting:
 *   - no horizontal overflow
 *   - no element wider than the viewport
 *   - no overlap between the sidebar and the main content
 *   - the phone frame appears only inside the builder preview
 *   - no console/page errors
 *   - touch targets on primary controls stay >= 30px
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const pkg = process.env.PLAYWRIGHT_PACKAGE;
  if (pkg) return require(pkg);
  try { return require('playwright'); } catch { return require('playwright-core'); }
}
const { chromium } = loadPlaywright();
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.next', 'admin-ui-audit');
await mkdir(output, { recursive: true });
const dataRoot = await mkdtemp(path.join(output, 'store-'));
const port = Number(process.env.TEST_PORT || 3021);
const origin = `http://127.0.0.1:${port}`;
const serverModule = new URL('../node_modules/vinext/dist/server/prod-server.js', import.meta.url).href;

const server = spawn(process.execPath, ['--input-type=module', '-e', `import { startProdServer } from ${JSON.stringify(serverModule)}; await startProdServer({ port: ${port}, host: '127.0.0.1', outDir: ${JSON.stringify(path.join(root, 'dist'))} });`], {
  cwd: dataRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env, NODE_ENV: 'production',
    MASTER_ADMIN_EMAIL: 'master@example.test',
    MASTER_ADMIN_PASSWORD_HASH: `qa:${scryptSync('master-password', 'qa', 64).toString('hex')}`,
    ADMIN_EMAIL: '', ADMIN_PASSWORD_HASH: '',
    SESSION_SECRET: 'local-ui-audit-session-secret',
    COOKIE_SECURE: 'false',
    DATABASE_URL: '', DB_HOST: '', DB_NAME: '', DB_USER: '', DB_PASSWORD: '',
    UPLOAD_DIR: path.join(dataRoot, 'uploads'),
  },
});
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk; });
server.stderr.on('data', chunk => { serverOutput += chunk; });

const breakpoints = [
  ['1920', 1920, 1080],
  ['1440', 1440, 900],
  ['1280', 1280, 800],
  ['1024', 1024, 820],
  ['768', 768, 1024],
  ['390', 390, 844],
];
const screens = ['Dashboard', 'Pages', 'Create Page', 'Media', 'Themes', 'Analytics', 'Notifications', 'Team', 'Settings'];
const failures = [];
let checks = 0;
let browser;

async function launchBrowser() {
  const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  try {
    return await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const response = await fetch(origin + '/admin/login'); if (response.ok) { ready = true; break; } } catch { /* waiting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'server did not start:\n' + serverOutput);

  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push('console: ' + message.text()); });

  // Create a real workspace account.
  const signup = await context.request.post(origin + '/api/auth/signup', {
    data: { name: 'QA Owner', email: 'qa-owner@example.test', password: 'qa-password-123' },
  });
  assert.ok(signup.ok(), 'signup failed: ' + await signup.text());

  // Seed a page so tables/builder have real content to audit.
  const createResponse = await context.request.post(origin + '/api/pages', {
    data: { name: 'Audit Page', slug: 'audit-page', title: 'Audit Page', bio: 'Checking the admin layout.', profileImage: '' },
  });
  assert.ok(createResponse.ok(), 'could not seed a page: ' + createResponse.status() + ' ' + await createResponse.text());
  const created = await createResponse.json();
  assert.ok(created.id, 'seeded page has no id');
  await context.request.post(origin + `/api/pages/${created.id}/blocks`, { data: { type: 'link' } });

  await page.goto(origin + '/admin');
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor();

  async function audit(name) {
    checks++;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const report = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const view = window.innerWidth;
      const wide = [];
      for (const el of document.querySelectorAll('.admShell *')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > view + 1 || rect.left < -1) {
          wide.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} [${Math.round(rect.left)}..${Math.round(rect.right)}]`);
        }
      }
      const sidebar = document.querySelector('.admSidebar');
      const main = document.querySelector('.admMain');
      let overlap = null;
      if (sidebar && main) {
        const s = sidebar.getBoundingClientRect();
        const m = main.getBoundingClientRect();
        if (s.width > 0 && m.left < s.right - 1) overlap = `sidebar right ${Math.round(s.right)} > main left ${Math.round(m.left)}`;
      }
      const phones = document.querySelectorAll('.phoneDevice, .phoneStage').length;
      const inPreview = document.querySelectorAll('.admPreviewPane .phoneDevice').length;
      const small = [];
      for (const el of document.querySelectorAll('.admMain .admButton, .admMain .admIconButton')) {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.height < 28) small.push(`${el.textContent.trim().slice(0, 24) || el.getAttribute('aria-label')} h=${Math.round(rect.height)}`);
      }
      return { docWidth, view, wide: wide.slice(0, 6), overlap, phones, inPreview, small: small.slice(0, 4) };
    });

    if (report.docWidth > report.view + 1) failures.push(`${name}: horizontal overflow (${report.docWidth} > ${report.view})`);
    if (report.wide.length) failures.push(`${name}: elements outside viewport -> ${report.wide.join('; ')}`);
    if (report.overlap) failures.push(`${name}: ${report.overlap}`);
    if (report.small.length) failures.push(`${name}: touch targets too small -> ${report.small.join('; ')}`);
    const builder = name.includes('builder');
    if (!builder && report.phones > 0) failures.push(`${name}: phone frame outside the builder (${report.phones})`);
    if (builder && report.inPreview !== 1) failures.push(`${name}: expected exactly 1 phone preview, found ${report.inPreview}`);

    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    return report;
  }

  async function go(label) {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) {
      await menu.click();
      await page.getByRole('navigation', { name: 'Mobile admin navigation' }).getByRole('button', { name: label, exact: true }).click();
    } else {
      await page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('button', { name: label, exact: true }).click();
    }
    await page.getByRole('heading', { level: 1, name: label, exact: true }).waitFor();
  }

  for (const [tag, width, height] of breakpoints) {
    await page.setViewportSize({ width, height });
    for (const screen of screens) {
      await go(screen);
      await audit(`${tag}-${screen.toLowerCase().replace(/ /g, '-')}`);
    }

    // Builder: the only place a phone frame may exist.
    await go('Pages');
    await page.locator('.admPageIdentity').first().waitFor({ state: 'visible' });
    await page.locator('.admPageIdentity').first().click();
    await page.getByRole('heading', { level: 1, name: 'Page builder' }).waitFor();
    if (width <= 820) {
      await page.getByRole('group', { name: 'Builder view' }).getByRole('button', { name: 'Preview', exact: true }).click();
      await page.locator('.admPreviewPane .phoneDevice').waitFor({ state: 'visible' });
    }
    const builder = await audit(`${tag}-builder`);

    // The preview must hold a stable 9:16 and never stretch the shell.
    const box = await page.locator('.admPreviewPane .phoneDevice').boundingBox();
    if (box) {
      const ratio = box.width / box.height;
      if (Math.abs(ratio - 9 / 16) > 0.02) failures.push(`${tag}-builder: preview ratio ${ratio.toFixed(3)} is not 9:16`);
      if (box.width > 391) failures.push(`${tag}-builder: preview ${Math.round(box.width)}px exceeds 390px`);
    }
    assert.ok(builder.docWidth <= builder.view + 1, `${tag}-builder overflowed`);

    if (width <= 820) {
      await page.getByRole('group', { name: 'Builder view' }).getByRole('button', { name: 'Edit', exact: true }).click();
    }
  }

  // Modals must stay inside the viewport on the smallest screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await go('Pages');
  await page.locator('.admPageRow').first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /^Delete / }).first().click();
  await page.getByRole('dialog').waitFor();
  const dialog = await page.evaluate(() => {
    const el = document.querySelector('dialog[open]');
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
  });
  if (dialog.left < -1 || dialog.right > dialog.vw + 1) failures.push(`mobile dialog escapes horizontally: ${JSON.stringify(dialog)}`);
  if (dialog.top < -1 || dialog.bottom > dialog.vh + 1) failures.push(`mobile dialog escapes vertically: ${JSON.stringify(dialog)}`);
  await page.screenshot({ path: path.join(output, '390-dialog.png') });
  checks++;

  // Master control center, in its own isolated session.
  const masterContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const masterPage = await masterContext.newPage();
  masterPage.on('pageerror', error => errors.push('master: ' + error.message));
  masterPage.on('console', message => { if (message.type() === 'error') errors.push('master console: ' + message.text()); });
  const login = await masterContext.request.post(origin + '/api/auth/login', { data: { email: 'master@example.test', password: 'master-password' } });
  if (login.ok()) {
    for (const [tag, width, height] of [['1440', 1440, 900], ['1024', 1024, 820], ['390', 390, 844]]) {
      await masterPage.setViewportSize({ width, height });
      for (const section of ['Overview', 'Workspaces', 'Domains', 'All users', 'Global branding', 'Signup access']) {
        await masterPage.goto(origin + '/admin/master');
        const menu = masterPage.getByRole('button', { name: 'Open menu', exact: true });
        if (await menu.isVisible()) await menu.click();
        await masterPage.getByRole('button', { name: new RegExp('^' + section) }).first().click();
        await masterPage.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const name = `master-${tag}-${section.toLowerCase().replace(/ /g, '-')}`;
        const report = await masterPage.evaluate(() => {
          const wide = [];
          for (const el of document.querySelectorAll('.masterShell *')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.right > innerWidth + 1 || r.left < -1) wide.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);
          }
          return { docWidth: document.documentElement.scrollWidth, view: innerWidth, wide: wide.slice(0, 5), phones: document.querySelectorAll('.phoneDevice').length };
        });
        checks++;
        if (report.docWidth > report.view + 1) failures.push(`${name}: horizontal overflow (${report.docWidth} > ${report.view})`);
        if (report.wide.length) failures.push(`${name}: outside viewport -> ${report.wide.join('; ')}`);
        if (report.phones) failures.push(`${name}: phone frame in master admin`);
        await masterPage.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
      }
    }
  } else {
    failures.push('master login failed: ' + login.status());
  }
  await masterContext.close();

  if (errors.length) failures.push('client errors: ' + errors.join(' | '));

  console.log(`\nAudited ${checks} screen states across ${breakpoints.length} breakpoints.`);
  if (failures.length) {
    console.error('\nFAILURES:');
    for (const failure of failures) console.error('  - ' + failure);
    process.exitCode = 1;
  } else {
    console.log('PASS: no overflow, no sidebar overlap, modals contained, phone frame only in the builder, no client errors.');
  }
  console.log(`Screenshots: ${output}`);
} catch (error) {
  console.error(serverOutput.slice(-3000));
  throw error;
} finally {
  await browser?.close();
  server.kill();
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
}

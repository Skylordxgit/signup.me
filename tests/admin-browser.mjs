import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.next', 'admin-qa');
await mkdir(output, { recursive: true });
const dataRoot = await mkdtemp(path.join(output, 'store-'));
const port = Number(process.env.TEST_PORT || 3002);
const origin = `http://127.0.0.1:${port}`;
const serverModule = new URL('../node_modules/vinext/dist/server/prod-server.js', import.meta.url).href;
const server = spawn(process.execPath, ['--input-type=module', '-e', `import { startProdServer } from ${JSON.stringify(serverModule)}; await startProdServer({ port: ${port}, host: '127.0.0.1', outDir: ${JSON.stringify(path.join(root, 'dist'))} });`], {
  cwd: dataRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production', ADMIN_EMAIL: 'qa@example.com', ADMIN_PASSWORD_HASH: `qa:${scryptSync('test-password', 'qa', 64).toString('hex')}`, SESSION_SECRET: 'local-ui-test-session', COOKIE_SECURE: 'false', DATABASE_URL: '', DB_HOST: '', DB_NAME: '', DB_USER: '', DB_PASSWORD: '', UPLOAD_DIR: path.join(dataRoot, 'uploads') },
});
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk; });
server.stderr.on('data', chunk => { serverOutput += chunk; });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { const response = await fetch(origin + '/admin/login'); if (response.ok) { ready = true; break; } } catch { /* Wait for the isolated server. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, serverOutput);
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await context.request.get(origin + '/api/uploads')).status(), 401);
  const missingResponse = await page.goto(origin + '/fresh-profile');
  assert.equal(missingResponse.status(), 404);
  await page.getByRole('heading', { name: 'Make /fresh-profile yours.' }).waitFor();
  await screenshot('missing-desktop');
  assert.equal(await page.getByRole('link', { name: 'Build your page' }).getAttribute('href'), '/admin?slug=fresh-profile');
  await page.getByRole('link', { name: 'Build your page' }).click();
  await page.waitForURL(/\/admin\/login/);
  await page.getByRole('button', { name: 'Login with Email' }).click();
  await page.locator('input[name=email]').fill('qa@example.com');
  await page.locator('input[name=password]').fill('test-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(origin + '/admin?slug=fresh-profile');
  await page.getByRole('heading', { level: 1, name: 'Create Page' }).waitFor();
  assert.equal(await page.getByLabel('URL slug', { exact: true }).inputValue(), 'fresh-profile');
  await page.goto(origin + '/admin');
  await page.getByRole('heading', { name: 'Workspace overview' }).waitFor();
  await page.getByRole('img', { name: /Last 30 days/ }).waitFor();

  async function screenshot(name) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    assert.ok(dimensions.content <= dimensions.width, `${name} overflows: ${JSON.stringify(dimensions)}`);
    console.log(`PASS ${name}: no horizontal overflow`);
  }
  async function navigate(label) {
    if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.getByRole('navigation', { name: 'Mobile admin navigation' }).getByRole('button', { name: label, exact: true }).click();
    } else {
      await page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('button', { name: label, exact: true }).click();
    }
    await page.getByRole('heading', { level: 1, name: label === 'Create Page' ? 'Create Page' : label, exact: true }).waitFor();
  }

  await screenshot('desktop-dashboard');
  assert.equal(await page.locator('.phoneDevice').count(), 0);
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  assert.ok((await page.locator('.admSidebar').boundingBox()).width < 90);
  await screenshot('desktop-collapsed');
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await navigate('Create Page');
  await page.getByLabel('Page name', { exact: true }).fill('Profile QA');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO2kAAAAASUVORK5CYII=', 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'profile.png', mimeType: 'image/png', buffer: png });
  await page.getByText('Replace image', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByRole('button', { name: 'Create page', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Page builder' }).waitFor();
  await page.getByLabel('Profile title', { exact: true }).fill('My profile without blocks');
  await page.getByRole('button', { name: 'Save page', exact: true }).click();
  await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor();
  const summaries = await (await context.request.get(origin + '/api/pages')).json();
  const created = summaries.find(item => item.slug === 'profile-qa');
  assert.ok(created);
  let saved = await (await context.request.get(origin + '/api/pages/' + created.id)).json();
  assert.equal(saved.title, 'My profile without blocks');
  assert.equal(saved.blocks.length, 0);
  assert.match(saved.profileImage, /^\/uploads\/profile\//);
  assert.equal((await context.request.get(origin + saved.profileImage)).status(), 200);
  await page.route('**/api/pages/' + created.id, route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary save failure' }) }) : route.continue());
  await page.getByLabel('Bio', { exact: true }).fill('Draft retained after a failed save');
  await page.getByRole('button', { name: 'Save page', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Temporary save failure' }).waitFor();
  assert.equal(await page.getByLabel('Bio', { exact: true }).inputValue(), 'Draft retained after a failed save');
  await page.unroute('**/api/pages/' + created.id);
  await page.getByRole('button', { name: 'Save page', exact: true }).click();
  await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor();
  await screenshot('desktop-builder-profile');
  const phone = await page.locator('.phoneDevice').boundingBox();
  assert.ok(phone.width <= 390.5 && Math.abs(phone.width / phone.height - 9 / 16) < .01, JSON.stringify(phone));

  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await page.getByRole('button', { name: 'Add block', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Link Button' }).click();
  await page.locator('.admBlockSummary').waitFor();
  await page.locator('.admBlockSummary').first().click();
  await page.getByLabel('Title', { exact: true }).fill('Official signup');
  await page.getByLabel('URL or username', { exact: true }).fill('https://example.com/signup');
  await page.getByRole('button', { name: 'Save page', exact: true }).click();
  await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor();
  saved = await (await context.request.get(origin + '/api/pages/' + created.id)).json();
  assert.equal(saved.blocks[0].title, 'Official signup');
  assert.equal(saved.blocks[0].url, 'https://example.com/signup');
  await screenshot('desktop-builder-content');
  for (const section of ['Design', 'SEO', 'Integrations', 'Profile']) {
    await page.getByRole('navigation', { name: 'Page editor sections' }).getByRole('button', { name: section, exact: true }).click();
    await screenshot('desktop-builder-' + section.toLowerCase());
  }

  for (const label of ['Pages', 'Analytics', 'Media', 'Themes', 'Settings']) {
    await navigate(label);
    if (label === 'Media') await page.getByRole('link', { name: /^Open / }).first().waitFor();
    await screenshot('desktop-' + label.toLowerCase());
    assert.equal(await page.locator('.phoneDevice').count(), 0);
  }
  await navigate('Themes');
  await page.getByLabel('Apply to page').selectOption(String(created.id));
  await page.getByRole('button', { name: 'Minimal Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Apply theme', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Page builder' }).waitFor();
  assert.equal(await page.locator('.phoneDevice .pageTitle').evaluate(element => getComputedStyle(element).color), 'rgb(250, 250, 250)');
  saved = await (await context.request.get(origin + '/api/pages/' + created.id)).json();
  assert.equal(saved.theme.preset, 'minimal-dark');
  assert.match(saved.profileImage, /^\/uploads\/profile\//);
  await screenshot('desktop-dark-preview');
  await navigate('Pages');
  await page.getByRole('button', { name: 'Duplicate Profile QA' }).click();
  await page.getByRole('heading', { name: 'Page builder', level: 1 }).waitFor();
  assert.match(await page.getByLabel('Page name', { exact: true }).inputValue(), /Copy/);
  await navigate('Pages');
  await page.getByRole('button', { name: 'Delete Profile QA Copy' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete page', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });

  for (const [device, width, height] of [['tablet', 1024, 900], ['mobile', 390, 844], ['small-mobile', 320, 740]]) {
    await page.setViewportSize({ width, height });
    for (const label of ['Dashboard', 'Pages', 'Create Page', 'Analytics', 'Media', 'Themes', 'Settings']) {
      await navigate(label);
      await screenshot(device + '-' + label.toLowerCase().replace(' ', '-'));
    }
    await navigate('Pages');
    await page.getByRole('button', { name: 'Edit Profile QA', exact: true }).click();
    await page.getByLabel('Profile title', { exact: true }).waitFor();
    await screenshot(device + '-builder-edit');
    if (width <= 820) {
      await page.getByRole('group', { name: 'Builder view' }).getByRole('button', { name: 'Preview', exact: true }).click();
      await page.locator('.phoneDevice').waitFor({ state: 'visible' });
      await screenshot(device + '-builder-preview');
      await page.getByRole('group', { name: 'Builder view' }).getByRole('button', { name: 'Edit', exact: true }).click();
    }
  }
  await page.goto(origin + '/another-fresh-profile');
  await page.getByRole('heading', { name: 'Make /another-fresh-profile yours.' }).waitFor();
  await screenshot('missing-mobile');
  await page.goto(origin + '/' + created.slug);
  await page.getByRole('heading', { name: 'My profile without blocks' }).waitFor();
  assert.equal(await page.locator('.admSidebar, .phoneDevice').count(), 0);
  await screenshot('public-mobile');
  assert.deepEqual(errors, [], `Client errors: ${errors.join('; ')}`);
  console.log('PASS missing-page claim flow, profile upload, creation, empty-page profile save, content save, duplication, deletion, navigation, responsive layouts, and public page.');
} catch (error) {
  console.error(serverOutput.slice(-4000));
  throw error;
} finally {
  await browser?.close();
  server.kill();
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
}

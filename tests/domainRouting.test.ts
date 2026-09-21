import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { addDomain } from '../lib/domains';
import { canonicalPublicUrl, requestHostname, resolvePublicHost } from '../lib/domainRouting';
import { createBlock, createPage, getPrimaryPublicPage, getPublicPageBySlug } from '../lib/store';
import { createWorkspace, updateWorkspace } from '../lib/workspaces';
import * as manifest from '../app/api/manifest/[slug]/route';
import * as views from '../app/api/track/view/route';
import * as clicks from '../app/api/track/click/route';
import * as subscriptions from '../app/api/notifications/subscribe/route';

async function isolated(run: () => Promise<void>) {
  const previous = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'signup-domain-routing-'));
  process.chdir(directory);
  try { await run(); } finally { process.chdir(previous); await rm(directory, { recursive: true, force: true }); }
}

async function activate(hostname: string, workspaceId: string) {
  await addDomain(hostname, 'master@example.test', workspaceId);
  const filename = path.join(process.cwd(), 'data', 'domains.json');
  const data = JSON.parse(await readFile(filename, 'utf8')) as { domains: { hostname: string; status: string }[] };
  data.domains.find(domain => domain.hostname === hostname)!.status = 'active';
  await writeFile(filename, JSON.stringify(data));
}

function request(host: string, pathname: string, body?: unknown) {
  return new NextRequest(`http://${host}${pathname}`, { method: body ? 'POST' : 'GET', headers: { host, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}

test('raw Host parsing and platform classification ignore forwarded host', async () => isolated(async () => {
  const previousMaster = process.env.MASTER_ADMIN_DOMAIN;
  const previousDefault = process.env.DEFAULT_APP_DOMAIN;
  process.env.MASTER_ADMIN_DOMAIN = 'admin.platform.test';
  process.env.DEFAULT_APP_DOMAIN = 'app.platform.test';
  try {
    assert.equal(requestHostname('Brand.Example:8443'), 'brand.example');
    assert.equal(requestHostname('brand.example/path'), null);
    assert.equal(requestHostname('ignored@brand.example'), null);
    assert.equal((await resolvePublicHost('localhost:3000')).kind, 'platform');
    assert.equal((await resolvePublicHost('admin.platform.test')).kind, 'master');
    assert.equal((await resolvePublicHost('app.platform.test')).kind, 'platform');
    assert.equal((await resolvePublicHost('unknown.example')).kind, 'unknown');
  } finally {
    if (previousMaster === undefined) delete process.env.MASTER_ADMIN_DOMAIN; else process.env.MASTER_ADMIN_DOMAIN = previousMaster;
    if (previousDefault === undefined) delete process.env.DEFAULT_APP_DOMAIN; else process.env.DEFAULT_APP_DOMAIN = previousDefault;
  }
}));

test('only active assigned domains with active workspaces resolve', async () => isolated(async () => {
  const workspace = await createWorkspace({ name: 'Tenant', ownerEmail: 'owner@example.test' });
  await addDomain('pending.example.com', 'master@example.test');
  assert.equal((await resolvePublicHost('pending.example.com')).kind, 'unknown');
  await activate('active.example.com', workspace.id);
  assert.deepEqual(await resolvePublicHost('active.example.com'), { kind: 'custom', hostname: 'active.example.com', workspaceId: workspace.id });
  await updateWorkspace(workspace.id, { status: 'disabled' });
  assert.equal((await resolvePublicHost('active.example.com')).kind, 'unknown');
}));

test('custom-domain pages are workspace-scoped and primary selection is deterministic', async () => isolated(async () => {
  const one = await createWorkspace({ name: 'One', ownerEmail: 'one@example.test' });
  const two = await createWorkspace({ name: 'Two', ownerEmail: 'two@example.test' });
  const first = await createPage({ name: 'First', slug: 'first', title: '', bio: '', profileImage: '', workspaceId: one.id });
  await createPage({ name: 'Second', slug: 'second', title: '', bio: '', profileImage: '', workspaceId: one.id });
  const other = await createPage({ name: 'Other', slug: 'other', title: '', bio: '', profileImage: '', workspaceId: two.id });
  assert.equal((await getPrimaryPublicPage(one.id))?.id, first.id);
  assert.equal((await getPublicPageBySlug(other.slug, one.id)), null);
  assert.equal(canonicalPublicUrl(first, { kind: 'custom', hostname: 'one.example.com', workspaceId: one.id }, true), 'https://one.example.com');
  assert.equal(canonicalPublicUrl(first, { kind: 'custom', hostname: 'one.example.com', workspaceId: one.id }), 'https://one.example.com/first');
}));

test('manifest, tracking, and subscriptions enforce the host workspace', async () => isolated(async () => {
  const one = await createWorkspace({ name: 'One', ownerEmail: 'one@example.test' });
  const two = await createWorkspace({ name: 'Two', ownerEmail: 'two@example.test' });
  const page = await createPage({ name: 'Two page', slug: 'two-page', title: '', bio: '', profileImage: '', workspaceId: two.id });
  const pageBlock = (await createBlock(page.id, 'link'))!;
  await activate('one.example.com', one.id);
  await activate('two.example.com', two.id);

  assert.equal((await manifest.GET(request('one.example.com', '/api/manifest/two-page'), { params: Promise.resolve({ slug: page.slug }) })).status, 404);
  assert.equal((await views.POST(request('one.example.com', '/api/track/view', { slug: page.slug, visitorKey: 'visitor' }))).status, 404);
  assert.equal((await clicks.POST(request('one.example.com', '/api/track/click', { pageId: page.id, blockId: pageBlock.id }))).status, 404);
  const push = { endpoint: 'https://push.example/tenant', keys: { auth: 'secret', p256dh: 'secret' } };
  assert.equal((await subscriptions.POST(request('one.example.com', '/api/notifications/subscribe', { slug: page.slug, subscription: push }))).status, 404);

  assert.equal((await manifest.GET(request('two.example.com', '/api/manifest/two-page'), { params: Promise.resolve({ slug: page.slug }) })).status, 200);
  assert.equal((await views.POST(request('two.example.com', '/api/track/view', { slug: page.slug, visitorKey: 'visitor' }))).status, 200);
  assert.equal((await clicks.POST(request('two.example.com', '/api/track/click', { pageId: page.id, blockId: pageBlock.id }))).status, 200);
  assert.equal((await subscriptions.POST(request('two.example.com', '/api/notifications/subscribe', { slug: page.slug, subscription: push }))).status, 200);
  assert.equal((await views.POST(new NextRequest('http://unknown.example/api/track/view', { method: 'POST', headers: { host: 'unknown.example', 'x-forwarded-host': 'two.example.com', 'content-type': 'application/json' }, body: JSON.stringify({ slug: page.slug, visitorKey: 'forged' }) }))).status, 404);
}));

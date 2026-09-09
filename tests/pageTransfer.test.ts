import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AdminSession } from '../lib/auth';
import { exportFileName, exportPages, importPages, parseExport } from '../lib/pageTransfer';
import * as signup from '../lib/signup';
import * as store from '../lib/store';
import * as uploads from '../lib/uploads';

/* Exercises the JSON fallback store, which is what the test run uses. The
   MySQL store goes through the same store/upload helpers. */
async function withDataDirectory<T>(run: () => Promise<T>) {
  const previous = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'signup-transfer-'));
  process.chdir(directory);
  try { return await run(); }
  finally { process.chdir(previous); await rm(directory, { recursive: true, force: true }); }
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngKind = { mime: 'image/png', ext: 'png' } as const;

function sessionFor(workspaceId: string): AdminSession {
  return { email: 'owner@example.test', workspaceId, role: 'owner', expiresAt: Date.now() + 60_000 };
}

/** A page using every carrier of an uploaded image and a full set of fields. */
async function buildRichPage(workspaceId: string) {
  const profile = await uploads.storeUpload('profile', png, pngKind, workspaceId);
  const logo = await uploads.storeUpload('logo', png, pngKind, workspaceId);
  const cover = await uploads.storeUpload('banner', png, pngKind, workspaceId);
  const og = await uploads.storeUpload('og', png, pngKind, workspaceId);
  const icon = await uploads.storeUpload('icon', png, pngKind, workspaceId);
  const blockImage = await uploads.storeUpload('block', png, pngKind, workspaceId);

  const page = await store.createPage({ name: 'Launch Hub', slug: 'launch-hub', title: 'Launch', bio: 'Everything in one place.', profileImage: profile.path, workspaceId });
  await store.updatePage(page.id, {
    logoImage: logo.path,
    status: 'published',
    theme: { ...page.theme, backgroundImage: cover.path, buttonRadius: 22, font: 'serif' },
    seo: { seoTitle: 'Launch', metaDescription: 'Meta', socialTitle: 'Social', socialDescription: 'Social bio', ogImage: og.path, favicon: '' },
    integrations: { metaPixelId: 'PIXEL1', gtmId: 'GTM-1', notificationPrompt: { enabled: true, heading: 'Follow us', allowLabel: 'Allow' } },
  });

  const link = await store.createBlock(page.id, 'link');
  await store.updateBlock(link!.id, {
    title: 'Book a call', subtitle: 'Free 15 minutes', url: 'https://example.com/book',
    icon: icon.path, settings: { buttonColor: '#112233' }, sortOrder: 1, isActive: true, clicks: 41,
  });
  const image = await store.createBlock(page.id, 'image');
  await store.updateBlock(image!.id, { title: 'Gallery', imageUrl: blockImage.path, sortOrder: 2, isActive: false });
  const whatsapp = await store.createBlock(page.id, 'whatsapp');
  await store.updateBlock(whatsapp!.id, { title: 'WhatsApp', phone: '+15551234567', message: 'Hello there', sortOrder: 3 });

  return { page, paths: { profile: profile.path, logo: logo.path, cover: cover.path, og: og.path, icon: icon.path, blockImage: blockImage.path } };
}

test('an export carries every page detail and embeds the images it references', async () => {
  await withDataDirectory(async () => {
    const owner = await signup.signUp({ email: 'exporter@example.test', password: 'a-long-password' });
    const { page, paths } = await buildRichPage(owner.workspaceId);

    const data = await exportPages(sessionFor(owner.workspaceId), [page.id]);
    assert.equal(data.kind, 'signup888.pages.export');
    assert.equal(data.version, 1);
    assert.match(exportFileName(new Date('2026-09-09T10:00:00Z')), /^signup888-pages-export-2026-09-09\.json$/);

    const [exported] = data.pages;
    assert.equal(exported.slug, 'launch-hub');
    assert.equal(exported.title, 'Launch');
    assert.equal(exported.bio, 'Everything in one place.');
    assert.equal(exported.theme.buttonRadius, 22);
    assert.equal(exported.theme.font, 'serif');
    assert.equal(exported.seo.metaDescription, 'Meta');
    assert.equal(exported.integrations.metaPixelId, 'PIXEL1');
    assert.equal(exported.integrations.notificationPrompt?.heading, 'Follow us');
    assert.equal(exported.blocks.length, 3);
    assert.deepEqual(exported.blocks.map(block => block.title), ['Book a call', 'Gallery', 'WhatsApp']);
    assert.equal(exported.blocks[0].subtitle, 'Free 15 minutes');
    assert.equal(exported.blocks[0].settings.buttonColor, '#112233');
    assert.equal(exported.blocks[1].isActive, false);
    assert.equal(exported.blocks[2].phone, '+15551234567');
    assert.equal(exported.blocks[2].message, 'Hello there');

    // Traffic never travels: an imported page starts clean.
    assert.equal('views' in exported, false);
    assert.equal('clicks' in exported.blocks[0], false);
    assert.equal('workspaceId' in exported, false);

    // Every referenced upload is embedded as base64, not just a path.
    const embedded = new Set(data.media.map(item => item.path));
    for (const [label, value] of Object.entries(paths)) {
      assert.ok(embedded.has(value), `${label} should be embedded in the export`);
    }
    assert.ok(data.media.every(item => item.data.length > 0 && item.mime === 'image/png'));
  });
});

test('importing rebuilds the page in the importing workspace with fresh media and ids', async () => {
  await withDataDirectory(async () => {
    const source = await signup.signUp({ email: 'source@example.test', password: 'a-long-password' });
    const target = await signup.signUp({ email: 'target@example.test', password: 'a-long-password' });
    const { page } = await buildRichPage(source.workspaceId);
    const data = await exportPages(sessionFor(source.workspaceId), [page.id]);

    const result = await importPages(sessionFor(target.workspaceId), parseExport(JSON.parse(JSON.stringify(data))));
    assert.equal(result.pages.length, 1);
    assert.deepEqual(result.warnings, []);

    const [summary] = result.pages;
    assert.notEqual(summary.id, page.id, 'the import must create a new page id');
    // The slug is free in a different workspace, but globally unique storage
    // means the original is taken, so it lands on the -copy form.
    assert.equal(summary.originalSlug, 'launch-hub');
    assert.equal(summary.slug, 'launch-hub-copy');
    assert.equal(summary.renamed, true);
    assert.equal(summary.status, 'draft', 'imports default to draft');

    const imported = await store.getPageById(summary.id);
    assert.equal(imported?.workspaceId, target.workspaceId, 'imported pages join the importing workspace');
    assert.equal(imported?.title, 'Launch');
    assert.equal(imported?.bio, 'Everything in one place.');
    assert.equal(imported?.theme.buttonRadius, 22);
    assert.equal(imported?.seo.socialTitle, 'Social');
    assert.equal(imported?.integrations.gtmId, 'GTM-1');
    assert.equal(imported?.integrations.notificationPrompt?.enabled, true);
    assert.equal(imported?.views, 0);
    assert.equal(imported?.uniqueVisitors, 0);

    // Blocks keep content and order, and start with no clicks.
    const blocks = [...imported!.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
    assert.deepEqual(blocks.map(block => block.title), ['Book a call', 'Gallery', 'WhatsApp']);
    assert.equal(blocks[0].url, 'https://example.com/book');
    assert.equal(blocks[0].settings.buttonColor, '#112233');
    assert.equal(blocks[1].isActive, false);
    assert.equal(blocks[2].phone, '+15551234567');
    assert.ok(blocks.every(block => block.clicks === 0), 'block clicks reset on import');

    // Every image points at a NEW file owned by the importing workspace.
    const references = [imported!.profileImage, imported!.logoImage, imported!.theme.backgroundImage, imported!.seo.ogImage, blocks[0].icon, blocks[1].imageUrl];
    assert.ok(references.every(value => value.startsWith('/uploads/')), 'images must be restored, not blanked');
    const library = (await uploads.listMediaUploads(target.workspaceId)).map(file => file.path);
    for (const reference of references) {
      assert.ok(library.includes(reference), `${reference} should live in the importing workspace media`);
    }
    // The source workspace's own files are untouched and not reused.
    const sourceLibrary = (await uploads.listMediaUploads(source.workspaceId)).map(file => file.path);
    assert.ok(references.every(reference => !sourceLibrary.includes(reference)), 'imports must not reference another workspace media');
  });
});

test('repeat imports never overwrite and keep taking the next free address', async () => {
  await withDataDirectory(async () => {
    const owner = await signup.signUp({ email: 'repeat@example.test', password: 'a-long-password' });
    const session = sessionFor(owner.workspaceId);
    const { page } = await buildRichPage(owner.workspaceId);
    const data = parseExport(JSON.parse(JSON.stringify(await exportPages(session, [page.id]))));

    const first = await importPages(session, data);
    const second = await importPages(session, parseExport(JSON.parse(JSON.stringify(data))));

    assert.equal(first.pages[0].slug, 'launch-hub-copy');
    assert.equal(second.pages[0].slug, 'launch-hub-copy-2');
    assert.notEqual(first.pages[0].id, second.pages[0].id);

    // The original page is still exactly as it was.
    const original = await store.getPageById(page.id);
    assert.equal(original?.slug, 'launch-hub');
    assert.equal(original?.status, 'published');
    assert.equal((await store.listPages(owner.workspaceId)).length, 3);
  });
});

test('imports keep the original status only when asked', async () => {
  await withDataDirectory(async () => {
    const owner = await signup.signUp({ email: 'status@example.test', password: 'a-long-password' });
    const session = sessionFor(owner.workspaceId);
    const { page } = await buildRichPage(owner.workspaceId);
    const data = await exportPages(session, [page.id]);

    const kept = await importPages(session, parseExport(JSON.parse(JSON.stringify(data))), { keepStatus: true });
    assert.equal(kept.pages[0].status, 'published');
    assert.equal((await store.getPageById(kept.pages[0].id))?.status, 'published');
  });
});

test('a malformed or hostile export is refused before anything is written', async () => {
  await withDataDirectory(async () => {
    const owner = await signup.signUp({ email: 'guard@example.test', password: 'a-long-password' });
    const session = sessionFor(owner.workspaceId);

    assert.throws(() => parseExport({ kind: 'something.else', version: 1, pages: [] }), /not a signup888 pages export/);
    assert.throws(() => parseExport({ kind: 'signup888.pages.export', version: 99, pages: [{ name: 'x' }] }), /different version/);
    assert.throws(() => parseExport({ kind: 'signup888.pages.export', version: 1, pages: [] }), /no pages/);
    assert.throws(() => parseExport('not an object'), /not a signup888 pages export/);

    // A page id from another workspace is not exportable.
    const other = await signup.signUp({ email: 'other@example.test', password: 'a-long-password' });
    const theirs = await store.createPage({ name: 'Theirs', slug: 'theirs', title: '', bio: '', profileImage: '', workspaceId: other.workspaceId });
    await assert.rejects(exportPages(session, [theirs.id]), /Page not found/);
    await assert.rejects(exportPages(session, []), /at least one page/);

    // Traversal, a bad category, and a non-image payload are all rejected, and
    // the page still imports without them rather than failing outright.
    const hostile = parseExport({
      kind: 'signup888.pages.export',
      version: 1,
      pages: [{ name: 'Hostile', slug: 'hostile', profileImage: '/uploads/profile/a.png', logoImage: '/uploads/logo/b.png', blocks: [] }],
      media: [
        { path: '/uploads/../../etc/passwd', category: 'profile', fileName: 'x', mime: 'image/png', data: Buffer.from(png).toString('base64') },
        { path: '/uploads/profile/a.png', category: 'nope', fileName: 'a.png', mime: 'image/png', data: Buffer.from(png).toString('base64') },
        { path: '/uploads/logo/b.png', category: 'logo', fileName: 'b.png', mime: 'image/png', data: Buffer.from('<html>not an image</html>').toString('base64') },
      ],
    });
    const result = await importPages(session, hostile);
    assert.equal(result.media, 0, 'no hostile file should be stored');
    assert.equal(result.warnings.length, 3);
    assert.match(result.warnings.join(' '), /not a stored upload reference/);
    assert.match(result.warnings.join(' '), /unknown media category/);
    assert.match(result.warnings.join(' '), /unsupported image type/);

    // References with no restored file are cleared, never left broken.
    const imported = await store.getPageById(result.pages[0].id);
    assert.equal(imported?.profileImage, '');
    assert.equal(imported?.logoImage, '');
    assert.ok(!(await uploads.listMediaUploads(owner.workspaceId)).some(file => file.path.includes('passwd')));
  });
});

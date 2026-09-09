import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as signup from '../lib/signup';
import * as users from '../lib/workspaceUsers';
import * as workspaces from '../lib/workspaces';
import * as store from '../lib/store';
import * as uploads from '../lib/uploads';

/* These cover the JSON fallback store, which is what local development and the
   test run use. The MySQL store mirrors the same rules in SQL. Each test runs
   in its own working directory so the JSON files never collide: the stores
   resolve their paths per call, so switching directory is enough. */
async function withDataDirectory<T>(run: () => Promise<T>) {
  const previous = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'signup-workspaces-'));
  process.chdir(directory);
  try { return await run(); }
  finally { process.chdir(previous); await rm(directory, { recursive: true, force: true }); }
}

test('a new signup gets its own workspace and never joins the default one', async () => {
  await withDataDirectory(async () => {

    const result = await signup.signUp({ email: 'Newcomer@Example.test', password: 'a-long-password' });
    assert.equal(result.joinedInvite, false);
    assert.equal(result.role, 'owner');
    assert.notEqual(result.workspaceId, workspaces.DEFAULT_WORKSPACE_ID);

    // Email is normalised to lowercase and the account owns the new workspace.
    const account = await users.findWorkspaceUser('newcomer@example.test');
    assert.equal(account?.email, 'newcomer@example.test');
    assert.equal(account?.workspaceId, result.workspaceId);
    assert.equal(account?.role, 'owner');

    const created = await workspaces.getWorkspace(result.workspaceId);
    assert.equal(created?.ownerEmail, 'newcomer@example.test');
    assert.equal(created?.status, 'active');

    // The default workspace exists for the ADMIN_EMAIL owner and stays separate.
    assert.equal((await users.listWorkspaceUsers(workspaces.DEFAULT_WORKSPACE_ID)).length, 0);
  });
});

test('an invited email joins the inviting workspace instead of creating one', async () => {
  await withDataDirectory(async () => {

    const host = await signup.signUp({ email: 'host@example.test', password: 'a-long-password' });
    // The host invites a teammate who has no account yet: a pending record.
    const invite = await users.addWorkspaceUser({ email: 'guest@example.test', name: 'Guest', passwordHash: '', workspaceId: host.workspaceId });
    assert.equal(invite.pending, true);
    assert.equal(invite.workspaceId, host.workspaceId);

    const before = (await workspaces.listWorkspaces()).length;
    const joined = await signup.signUp({ email: 'guest@example.test', password: 'another-long-password' });

    assert.equal(joined.joinedInvite, true);
    assert.equal(joined.workspaceId, host.workspaceId);
    assert.equal(joined.role, 'admin');
    assert.equal((await workspaces.listWorkspaces()).length, before, 'signing up on an invite must not create a workspace');

    const account = await users.findWorkspaceUser('guest@example.test');
    assert.equal(users.isPendingInvite(account!), false, 'the invite is activated by signup');
    // The version bumps on activation, so the issued session must match it.
    assert.equal(joined.version, account!.version);
  });
});

test('signup refuses duplicates, weak passwords and the configured owner', async () => {
  await withDataDirectory(async () => {

    await signup.signUp({ email: 'taken@example.test', password: 'a-long-password' });
    await assert.rejects(signup.signUp({ email: 'taken@example.test', password: 'a-long-password' }), /already has an account/);
    await assert.rejects(signup.signUp({ email: 'TAKEN@example.test', password: 'a-long-password' }), /already has an account/);
    await assert.rejects(signup.signUp({ email: 'short@example.test', password: '1234567' }), /between 8 and 128/);
    await assert.rejects(signup.signUp({ email: 'not-an-email', password: 'a-long-password' }), /valid email/);
    // ADMIN_EMAIL owns the default workspace and cannot be re-registered.
    await assert.rejects(signup.signUp({ email: 'admin@example.com', password: 'a-long-password' }), /already has an account/);
  });
});

test('a disabled workspace blocks its members and the main workspace cannot be disabled', async () => {
  await withDataDirectory(async () => {

    const owner = await signup.signUp({ email: 'closing@example.test', password: 'a-long-password' });
    assert.equal(await workspaces.isWorkspaceActive(owner.workspaceId), true);

    await workspaces.updateWorkspace(owner.workspaceId, { status: 'disabled' });
    assert.equal(await workspaces.isWorkspaceActive(owner.workspaceId), false);

    await workspaces.ensureDefaultWorkspace('admin@example.com');
    await assert.rejects(workspaces.updateWorkspace(workspaces.DEFAULT_WORKSPACE_ID, { status: 'disabled' }), /cannot be disabled/);
    assert.equal(await workspaces.isWorkspaceActive(workspaces.DEFAULT_WORKSPACE_ID), true);
  });
});

test('pages belong to the workspace that created them and stay invisible to others', async () => {
  await withDataDirectory(async () => {

    const one = await signup.signUp({ email: 'one@example.test', password: 'a-long-password' });
    const two = await signup.signUp({ email: 'two@example.test', password: 'a-long-password' });

    const mine = await store.createPage({ name: 'Mine', slug: 'mine', title: '', bio: '', profileImage: '', workspaceId: one.workspaceId });
    await store.createPage({ name: 'Theirs', slug: 'theirs', title: '', bio: '', profileImage: '', workspaceId: two.workspaceId });

    assert.deepEqual((await store.listPages(one.workspaceId)).map(page => page.slug), ['mine']);
    assert.deepEqual((await store.listPages(two.workspaceId)).map(page => page.slug), ['theirs']);
    assert.equal(mine.workspaceId, one.workspaceId);

    // The seeded pages predate workspaces and belong to the default workspace.
    const seeded = await store.listPages(workspaces.DEFAULT_WORKSPACE_ID);
    assert.ok(seeded.length >= 1, 'existing pages stay in the default workspace');
    assert.ok(seeded.every(page => page.slug !== 'mine' && page.slug !== 'theirs'));

    // Public pages are not workspace-scoped, so existing slugs keep resolving.
    assert.equal((await store.getPublicPageBySlug('mine'))?.slug, 'mine');

    // A duplicate keeps the workspace of the page it came from.
    const copy = await store.duplicatePage(mine.id);
    assert.equal(copy?.workspaceId, one.workspaceId);

    // A page id from another workspace never resolves inside this one.
    const foreign = (await store.listPages(two.workspaceId))[0];
    const loaded = await store.getPageById(foreign.id);
    assert.equal(loaded?.workspaceId, two.workspaceId);
    assert.notEqual(loaded?.workspaceId, one.workspaceId);
  });
});

test('the media library only lists the workspace that uploaded each file', async () => {
  await withDataDirectory(async () => {
    const one = await signup.signUp({ email: 'media-one@example.test', password: 'a-long-password' });
    const two = await signup.signUp({ email: 'media-two@example.test', password: 'a-long-password' });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const kind = { mime: 'image/png', ext: 'png' } as const;

    const mine = await uploads.storeUpload('block', png, kind, one.workspaceId);
    const theirs = await uploads.storeUpload('block', png, kind, two.workspaceId);

    const listOne = await uploads.listMediaUploads(one.workspaceId);
    const listTwo = await uploads.listMediaUploads(two.workspaceId);
    assert.ok(listOne.some(file => file.path === mine.path));
    assert.ok(!listOne.some(file => file.path === theirs.path), 'another workspace must not see this file');
    assert.ok(listTwo.some(file => file.path === theirs.path));

    // The public /uploads path stays unscoped so pages keep serving images.
    const segments = mine.path.replace('/uploads/', '').split('/');
    assert.ok((await uploads.readUpload(segments))?.bytes.length);
  });
});

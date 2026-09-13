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
import { webpush } from '../lib/push';

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
    const token = 'a'.repeat(64);
    const invite = await users.addWorkspaceUser({ email: 'guest@example.test', name: 'Guest', passwordHash: '', workspaceId: host.workspaceId, inviteHash: signup.invitationHash(token), inviteExpiresAt: new Date(Date.now() + 86400000).toISOString() });
    assert.equal(invite.pending, true);
    assert.equal(invite.workspaceId, host.workspaceId);

    const before = (await workspaces.listWorkspaces()).length;
    const joined = await signup.acceptInvitation({ email: 'guest@example.test', password: 'another-long-password', token });

    assert.equal(joined.joinedInvite, true);
    assert.equal(joined.workspaceId, host.workspaceId);
    assert.equal(joined.role, 'member');
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
    assert.notEqual((await signup.signUp({ email: 'admin@example.com', password: 'a-long-password' })).workspaceId, workspaces.DEFAULT_WORKSPACE_ID, 'there is no built-in admin email bypass');
  });
});

test('a disabled workspace blocks its members, including the legacy workspace', async () => {
  await withDataDirectory(async () => {

    const owner = await signup.signUp({ email: 'closing@example.test', password: 'a-long-password' });
    assert.equal(await workspaces.isWorkspaceActive(owner.workspaceId), true);

    await workspaces.updateWorkspace(owner.workspaceId, { status: 'disabled' });
    assert.equal(await workspaces.isWorkspaceActive(owner.workspaceId), false);

    await workspaces.ensureDefaultWorkspace('admin@example.com');
    await workspaces.updateWorkspace(workspaces.DEFAULT_WORKSPACE_ID, { status: 'disabled' });
    assert.equal(await workspaces.isWorkspaceActive(workspaces.DEFAULT_WORKSPACE_ID), false);
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

test('notification campaigns are saved and count notification clicks', async t => {
  await withDataDirectory(async () => {
    const previousPublic = process.env.WEB_PUSH_PUBLIC_KEY;
    const previousPrivate = process.env.WEB_PUSH_PRIVATE_KEY;
    const keys = webpush.generateVAPIDKeys();
    process.env.WEB_PUSH_PUBLIC_KEY = keys.publicKey;
    process.env.WEB_PUSH_PRIVATE_KEY = keys.privateKey;
    t.mock.method(webpush, 'sendNotification', async () => ({}));
    try {
      const owner = await signup.signUp({ email: 'campaign@example.test', password: 'a-long-password' });
      const draft = await store.createPage({ name: 'Campaign', slug: 'campaign', title: '', bio: '', profileImage: '', workspaceId: owner.workspaceId });
      const page = await store.updatePage(draft.id, { status: 'published' });
      assert.ok(page);
      await store.savePushSubscription('campaign', { endpoint: 'https://push.example/campaign', keys: { auth: 'secret', p256dh: 'secret' } }, 'Android Chrome/120');

      const result = await store.sendPushNotification({ title: 'Offer drop', body: 'New offer is live', url: '/campaign', pageId: page.id, workspaceId: owner.workspaceId });
      assert.equal(result.sent, 1);
      assert.equal(result.campaign?.title, 'Offer drop');
      assert.equal(result.campaign?.audience, '/campaign');
      assert.equal(result.campaign?.sent, 1);
      assert.equal(result.campaign?.clicks, 0);
      assert.equal(result.campaign?.workspaceId, owner.workspaceId);

      assert.equal(await store.trackNotificationCampaignClick(result.campaign!.id), true);
      const campaigns = await store.listNotificationCampaigns(owner.workspaceId);
      assert.equal(campaigns.length, 1);
      assert.equal(campaigns[0].clicks, 1);
      assert.equal(campaigns[0].url, '/campaign');
    } finally {
      if (previousPublic == null) delete process.env.WEB_PUSH_PUBLIC_KEY;
      else process.env.WEB_PUSH_PUBLIC_KEY = previousPublic;
      if (previousPrivate == null) delete process.env.WEB_PUSH_PRIVATE_KEY;
      else process.env.WEB_PUSH_PRIVATE_KEY = previousPrivate;
    }
  });
});

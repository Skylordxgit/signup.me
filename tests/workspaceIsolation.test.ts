import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { withSession } from './requestContext';
import { createSessionToken, hashPassword, resolveAdminSession, readSessionToken, verifyPassword } from '../lib/auth';
import { signUp, acceptInvitation } from '../lib/signup';
import { addWorkspaceUser, findWorkspaceUser, updateWorkspaceUser } from '../lib/workspaceUsers';
import { listWorkspaces, updateWorkspace } from '../lib/workspaces';
import { workspacePermissions } from '../lib/permissions';
import { masterAdmin, masterCredentialVersion, provisionMaster } from '../lib/master';
import { createPage, createBlock, getPageById, listPages, savePushSubscription, listPushSubscribers } from '../lib/store';
import { getPreferences, savePreferences } from '../lib/workspaceSettings';
import * as pages from '../app/api/pages/route';
import * as page from '../app/api/pages/[id]/route';
import * as blocks from '../app/api/blocks/[id]/route';
import * as analytics from '../app/api/pages/[id]/analytics/route';
import * as exports from '../app/api/pages/export/route';
import * as team from '../app/api/admin/users/route';
import * as notifications from '../app/api/admin/notifications/route';
import * as masterUsers from '../app/api/master/users/route';
import * as masterContext from '../app/api/master/context/route';
import * as uploads from '../app/api/uploads/route';
import * as me from '../app/api/auth/me/route';
import * as auth from '../app/api/auth/login/route';

function request(body: unknown = {}, method = 'POST') { return new NextRequest('http://localhost/api/test', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
function params(id: number) { return { params: Promise.resolve({ id: String(id) }) }; }
async function isolated(run: () => Promise<void>) {
  const previous = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'signup-isolation-'));
  process.chdir(directory);
  try { await run(); } finally { process.chdir(previous); await rm(directory, { recursive: true, force: true }); }
}

test('workspace APIs reject foreign IDs, forged ownership and global controls', async () => isolated(async () => {
  const one = await signUp({ email: 'one@example.test', password: 'a-long-password' });
  const two = await signUp({ email: 'two@example.test', password: 'a-long-password' });
  const secret = await createPage({ name: 'Private workspace page', slug: 'private-page', title: '', bio: '', profileImage: '', workspaceId: one.workspaceId });
  const block = (await createBlock(secret.id, 'link'))!;
  const token = createSessionToken({ ...two, scope: 'workspace' });
  await withSession(token, async () => {
    assert.deepEqual(await (await pages.GET()).json(), []);
    assert.equal((await page.GET(request(), params(secret.id))).status, 400);
    assert.equal((await page.PUT(request({ title: 'stolen' }), params(secret.id))).status, 400);
    assert.equal((await page.DELETE(request(), params(secret.id))).status, 400);
    assert.equal((await blocks.PUT(request({ title: 'stolen' }), params(block.id))).status, 400);
    assert.equal((await blocks.DELETE(request(), params(block.id))).status, 400);
    assert.equal((await analytics.GET(request(), params(secret.id))).status, 400);
    assert.equal((await exports.POST(request({ ids: [secret.id] }))).status, 400);
    assert.equal((await masterUsers.GET()).status, 401);
    assert.equal((await masterContext.POST(request({ workspaceId: one.workspaceId }))).status, 401);
    assert.equal((await team.PATCH(request({ id: one.accountId, action: 'access', active: false }))).status, 400);
    assert.equal((await team.GET()).status, 200);
    const created = await (await pages.POST(request({ name: 'Own page', workspaceId: one.workspaceId }))).json() as { id: number; workspaceId: string };
    assert.equal(created.workspaceId, two.workspaceId);
    await page.PUT(request({ id: secret.id, workspaceId: one.workspaceId, blocks: [block] }), params(created.id));
    const own = (await getPageById(created.id))!;
    assert.equal(own.workspaceId, two.workspaceId);
    assert.equal(own.id, created.id);
    assert.deepEqual(own.blocks, []);
    const summary = await (await notifications.GET()).json() as { subscribers: { total: number }; campaigns: unknown[] };
    assert.equal(summary.subscribers.total, 0);
    assert.deepEqual(summary.campaigns, []);
  });
  assert.equal((await getPageById(secret.id))?.title, 'Private workspace page');
  assert.equal((await findWorkspaceUser(one.email))?.active, true);
}));

test('invitation links are explicit, expiring, single-use and retain assigned permissions', async () => isolated(async () => {
  const host = await signUp({ email: 'host@example.test', password: 'a-long-password' });
  const token = createSessionToken({ ...host, scope: 'workspace' });
  const invite = await withSession(token, async () => (await team.POST(request({ email: 'guest@example.test', role: 'member', permissions: ['analytics'] }))).json()) as { invitePath: string; id: string };
  const url = new URL(invite.invitePath, 'http://localhost');
  const input = { email: 'guest@example.test', password: 'a-long-password', token: url.searchParams.get('token')! };
  await assert.rejects(acceptInvitation({ ...input, token: 'b'.repeat(64) }), /Invalid/);
  await assert.rejects(acceptInvitation({ ...input, email: 'wrong@example.test' }), /Invalid/);
  const accepted = await acceptInvitation(input);
  assert.equal(accepted.workspaceId, host.workspaceId);
  assert.equal(accepted.role, 'member');
  await assert.rejects(acceptInvitation(input), /Invalid/);
  await withSession(createSessionToken({ ...accepted, scope: 'workspace' }), async () => {
    assert.equal((await pages.POST(request({ name: 'Denied' }))).status, 403);
    assert.equal((await team.GET()).status, 403);
    assert.equal((await uploads.GET()).status, 403);
    assert.equal((await masterUsers.GET()).status, 401);
  });
  const invited = await withSession(token, async () => (await team.POST(request({ email: 'direct@example.test' }))).json()) as { invitePath: string };
  const direct = await signUp({ email: 'direct@example.test', password: 'a-long-password' });
  assert.notEqual(direct.workspaceId, host.workspaceId);
  assert.deepEqual(await listPages(direct.workspaceId), []);
  await assert.rejects(acceptInvitation({ email: direct.email, password: 'a-long-password', token: new URL(invited.invitePath, 'http://localhost').searchParams.get('token') }), /Invalid/);
  const expired = await addWorkspaceUser({ email: 'expired@example.test', name: 'Expired', passwordHash: '', workspaceId: host.workspaceId, inviteHash: 'a'.repeat(64), inviteExpiresAt: new Date(0).toISOString() });
  await assert.rejects(acceptInvitation({ email: expired.email, password: 'a-long-password', token: 'a'.repeat(64) }), /Invalid/);
  const revoked = createSessionToken({ ...accepted, scope: 'workspace' });
  await updateWorkspaceUser(invite.id, { permissions: [] }, host.workspaceId);
  assert.equal(await resolveAdminSession(readSessionToken(revoked)), null);
}));

test('concurrent signup and writes create independent accounts without lost records', async () => isolated(async () => {
  const outcomes = await Promise.allSettled([signUp({ email: 'same@example.test', password: 'a-long-password' }), signUp({ email: 'same@example.test', password: 'a-long-password' })]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await listWorkspaces()).length, 1);
  const one = await signUp({ email: 'one@example.test', password: 'a-long-password' });
  const two = await signUp({ email: 'two@example.test', password: 'a-long-password' });
  const [a, b] = await Promise.all([one, two].map((owner, i) => createPage({ workspaceId: owner.workspaceId, name: 'Page ' + i, slug: 'page-' + i, title: '', bio: '', profileImage: '' })));
  assert.notEqual(a.id, b.id);
  assert.equal((await listPages(one.workspaceId)).length, 1);
  assert.equal((await listPages(two.workspaceId)).length, 1);
  const subscription = { endpoint: 'https://push.example/shared', keys: { auth: 'secret', p256dh: 'secret' } };
  await savePushSubscription(a.slug, subscription, '');
  await savePushSubscription(b.slug, subscription, '');
  assert.equal((await listPushSubscribers(one.workspaceId)).total, 1);
  assert.equal((await listPushSubscribers(two.workspaceId)).total, 1);
  await savePreferences(one.workspaceId, one.email, { name: 'Private preference', avatar: '' });
  assert.deepEqual(await getPreferences(two.workspaceId, two.email), { name: '', avatar: '' });
  const database = JSON.parse(await readFile(path.join(process.cwd(), 'data', 'db.json'), 'utf8'));
  assert.ok(database.pushSubscriptions.every((row: { workspaceId?: string }) => row.workspaceId));
}));

test('only the stored master account can enumerate users and select any workspace', async () => isolated(async () => {
  const oldEmail = process.env.MASTER_ADMIN_EMAIL;
  const oldHash = process.env.MASTER_ADMIN_PASSWORD_HASH;
  process.env.MASTER_ADMIN_EMAIL = 'master@example.test';
  process.env.MASTER_ADMIN_PASSWORD_HASH = hashPassword('master-password');
  try {
    const one = await signUp({ email: 'one@example.test', password: 'a-long-password' });
    const two = await signUp({ email: 'two@example.test', password: 'a-long-password' });
    const account = (await provisionMaster())!;
    const token = createSessionToken({ email: account.email, version: account.version, credentialVersion: masterCredentialVersion(), scope: 'master' });
    await withSession(token, async () => {
      assert.equal((await pages.GET()).status, 200);
      const accounts = await (await masterUsers.GET()).json() as { email: string }[];
      assert.deepEqual(accounts.map(user => user.email).sort(), [one.email, two.email]);
      for (const owner of [one, two]) {
        assert.equal((await masterContext.POST(request({ workspaceId: owner.workspaceId }))).status, 200);
        const created = await (await pages.POST(request({ name: 'Master page ' + owner.email.split('@')[0] }))).json() as { workspaceId: string };
        assert.equal(created.workspaceId, owner.workspaceId);
      }
    });
  } finally {
    if (oldEmail === undefined) delete process.env.MASTER_ADMIN_EMAIL; else process.env.MASTER_ADMIN_EMAIL = oldEmail;
    if (oldHash === undefined) delete process.env.MASTER_ADMIN_PASSWORD_HASH; else process.env.MASTER_ADMIN_PASSWORD_HASH = oldHash;
  }
}));

test('a master needs no membership or permission grant inside any workspace', async () => isolated(async () => {
  const oldEmail = process.env.MASTER_ADMIN_EMAIL;
  const oldHash = process.env.MASTER_ADMIN_PASSWORD_HASH;
  process.env.MASTER_ADMIN_EMAIL = 'master@example.test';
  // Hosting panels only accept plain text, so the plain password is supported.
  process.env.MASTER_ADMIN_PASSWORD_HASH = 'PlainHostingerPassword123';
  try {
    const owner = await signUp({ email: 'tenant@example.test', password: 'a-long-password' });
    const tenantPage = await createPage({ name: 'Tenant page', slug: 'tenant-page', title: '', bio: '', profileImage: '', workspaceId: owner.workspaceId });
    const account = (await provisionMaster())!;
    const token = createSessionToken({ email: account.email, version: account.version, credentialVersion: masterCredentialVersion(), scope: 'master' });

    await withSession(token, async () => {
      // Entering the tenant workspace needs no invitation or team record.
      assert.equal((await masterContext.POST(request({ workspaceId: owner.workspaceId }))).status, 200);

      const identity = await (await me.GET()).json() as { isMaster: boolean; role: string; permissions: string[]; workspaceId: string };
      assert.equal(identity.isMaster, true);
      assert.equal(identity.role, 'owner');
      assert.equal(identity.workspaceId, owner.workspaceId);
      assert.deepEqual([...identity.permissions].sort(), [...workspacePermissions].sort());

      // Every permission-gated area answers for the master.
      assert.equal((await pages.GET()).status, 200);
      assert.equal((await team.GET()).status, 200);
      assert.equal((await uploads.GET()).status, 200);
      assert.equal((await notifications.GET()).status, 200);
      assert.equal((await page.GET(request(), params(tenantPage.id))).status, 200);
      assert.equal((await analytics.GET(request(), params(tenantPage.id))).status, 200);
      assert.equal((await exports.POST(request({ ids: [tenantPage.id] }))).status, 200);
      assert.equal((await page.PUT(request({ title: 'Edited by master' }), params(tenantPage.id))).status, 200);
    });

    assert.equal((await getPageById(tenantPage.id))?.title, 'Edited by master');

    // A master account is never blocked by a disabled workspace either.
    await updateWorkspace(owner.workspaceId, { status: 'disabled' });
    await withSession(token, async () => {
      assert.equal((await masterContext.POST(request({ workspaceId: owner.workspaceId }))).status, 200);
      assert.equal((await pages.GET()).status, 200);
    });
  } finally {
    if (oldEmail === undefined) delete process.env.MASTER_ADMIN_EMAIL; else process.env.MASTER_ADMIN_EMAIL = oldEmail;
    if (oldHash === undefined) delete process.env.MASTER_ADMIN_PASSWORD_HASH; else process.env.MASTER_ADMIN_PASSWORD_HASH = oldHash;
  }
}));

test('a plain master password is stored and matched as a salted scrypt hash', async () => isolated(async () => {
  const oldEmail = process.env.MASTER_ADMIN_EMAIL;
  const oldHash = process.env.MASTER_ADMIN_PASSWORD_HASH;
  process.env.MASTER_ADMIN_EMAIL = 'master@example.test';
  process.env.MASTER_ADMIN_PASSWORD_HASH = 'PlainHostingerPassword123';
  try {
    const configured = masterAdmin()!;
    // Nothing plain reaches storage, and the hash is stable across restarts.
    assert.notEqual(configured.passwordHash, 'PlainHostingerPassword123');
    assert.match(configured.passwordHash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.equal(configured.passwordHash, masterAdmin()!.passwordHash);
    assert.equal(verifyPassword('PlainHostingerPassword123', configured.passwordHash), true);
    assert.equal(verifyPassword('wrong-password', configured.passwordHash), false);

    const stored = (await provisionMaster())!;
    assert.equal(stored.passwordHash, configured.passwordHash);

    await withSession(undefined, async () => {
      const login = await auth.POST(request({ email: 'master@example.test', password: 'PlainHostingerPassword123' }));
      assert.equal(login.status, 200);
      assert.equal((await login.json() as { redirect: string }).redirect, '/admin/master');
      assert.equal((await auth.POST(request({ email: 'master@example.test', password: 'wrong-password' }))).status, 401);
    });

    // An already hashed value keeps working unchanged.
    const explicit = hashPassword('Another-Password');
    process.env.MASTER_ADMIN_PASSWORD_HASH = explicit;
    assert.equal(masterAdmin()!.passwordHash, explicit);
  } finally {
    if (oldEmail === undefined) delete process.env.MASTER_ADMIN_EMAIL; else process.env.MASTER_ADMIN_EMAIL = oldEmail;
    if (oldHash === undefined) delete process.env.MASTER_ADMIN_PASSWORD_HASH; else process.env.MASTER_ADMIN_PASSWORD_HASH = oldHash;
  }
}));

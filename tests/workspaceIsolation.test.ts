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
import * as masterWorkspaces from '../app/api/master/workspaces/route';
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

test('owners and admins can add team members with password or invite with roles and permissions', async () => isolated(async () => {
  const host = await signUp({ email: 'orgowner@example.test', password: 'a-long-password' });
  const token = createSessionToken({ ...host, scope: 'workspace' });

  await withSession(token, async () => {
    // 1. Add workspace admin with password directly (accepts role: 'admin' or 'owner')
    const addAdminRes = await team.POST(request({
      name: 'Admin Colleague',
      email: 'colleague@example.test',
      role: 'admin',
      password: 'ColleaguePassword123',
    }));
    assert.equal(addAdminRes.status, 201);
    const addedAdmin = await addAdminRes.json() as { email: string; role: string; pending: boolean };
    assert.equal(addedAdmin.email, 'colleague@example.test');
    assert.equal(addedAdmin.role, 'owner');
    assert.equal(addedAdmin.pending, false);

    // 2. Add team member with custom permissions and password
    const addMemberRes = await team.POST(request({
      name: 'Analytics Member',
      email: 'analytics-user@example.test',
      role: 'member',
      permissions: ['analytics', 'pages'],
      password: 'MemberPassword123',
    }));
    assert.equal(addMemberRes.status, 201);
    const addedMember = await addMemberRes.json() as { email: string; role: string; permissions: string[] };
    assert.equal(addedMember.email, 'analytics-user@example.test');
    assert.equal(addedMember.role, 'member');
    assert.deepEqual(addedMember.permissions.sort(), ['analytics', 'pages']);

    // 3. List team returns all accounts
    const listRes = await team.GET();
    assert.equal(listRes.status, 200);
    const list = await listRes.json() as { email: string }[];
    assert.ok(list.some(u => u.email === 'colleague@example.test'));
    assert.ok(list.some(u => u.email === 'analytics-user@example.test'));

    // 4. Update permissions for a member
    const memberObj = (await findWorkspaceUser('analytics-user@example.test'))!;
    const patchRes = await team.PATCH(request({
      id: memberObj.id,
      action: 'permissions',
      role: 'member',
      permissions: ['analytics', 'pages', 'media'],
    }));
    assert.equal(patchRes.status, 200);
  });

  // Verify created admin can sign in immediately
  await withSession(undefined, async () => {
    const login = await auth.POST(request({ email: 'colleague@example.test', password: 'ColleaguePassword123' }));
    assert.equal(login.status, 200);
    const data = await login.json() as { redirect: string; scope: string };
    assert.equal(data.redirect, '/admin');
    assert.equal(data.scope, 'workspace');
  });
}));

test('master admin can create, modify, and delete users and admins across any workspace', async () => isolated(async () => {
  const oldEmail = process.env.MASTER_ADMIN_EMAIL;
  const oldHash = process.env.MASTER_ADMIN_PASSWORD_HASH;
  process.env.MASTER_ADMIN_EMAIL = 'master@example.test';
  process.env.MASTER_ADMIN_PASSWORD_HASH = hashPassword('master-password');
  try {
    const host = await signUp({ email: 'existingorg@example.test', password: 'a-long-password' });
    const account = (await provisionMaster())!;
    const token = createSessionToken({ email: account.email, version: account.version, credentialVersion: masterCredentialVersion(), scope: 'master' });

    await withSession(token, async () => {
      // 1. Create a new user in an existing workspace
      const createRes = await masterUsers.POST(request({
        name: 'Workspace Staff',
        email: 'staff@example.test',
        password: 'StaffPassword123',
        workspaceId: host.workspaceId,
        role: 'member',
        permissions: ['pages', 'analytics'],
      }));
      assert.equal(createRes.status, 201);
      const createdUser = await createRes.json() as { email: string; workspaceId: string; role: string };
      assert.equal(createdUser.email, 'staff@example.test');
      assert.equal(createdUser.workspaceId, host.workspaceId);

      // 2. Create a new admin with their own new workspace
      const createAdminRes = await masterUsers.POST(request({
        name: 'New Tenant Admin',
        email: 'newtenant@example.test',
        password: 'NewTenantPassword123',
        workspaceId: 'new',
        role: 'owner',
      }));
      assert.equal(createAdminRes.status, 201);
      const newAdmin = await createAdminRes.json() as { email: string; workspaceId: string; role: string };
      assert.equal(newAdmin.email, 'newtenant@example.test');
      assert.notEqual(newAdmin.workspaceId, host.workspaceId);
      assert.equal(newAdmin.role, 'owner');

      // 3. Update permissions and reset password
      const userRecord = (await findWorkspaceUser('staff@example.test'))!;
      const updateRes = await masterUsers.PATCH(request({
        id: userRecord.id,
        action: 'permissions',
        role: 'member',
        permissions: ['pages', 'analytics', 'media', 'notifications'],
      }));
      assert.equal(updateRes.status, 200);

      const passRes = await masterUsers.PATCH(request({
        id: userRecord.id,
        action: 'password',
        password: 'UpdatedStaffPassword456',
      }));
      assert.equal(passRes.status, 200);

      // 4. Delete user
      const delRes = await masterUsers.DELETE(request({ id: userRecord.id }));
      assert.equal(delRes.status, 200);
      assert.equal(await findWorkspaceUser('staff@example.test'), null);
    });
  } finally {
    if (oldEmail === undefined) delete process.env.MASTER_ADMIN_EMAIL; else process.env.MASTER_ADMIN_EMAIL = oldEmail;
    if (oldHash === undefined) delete process.env.MASTER_ADMIN_PASSWORD_HASH; else process.env.MASTER_ADMIN_PASSWORD_HASH = oldHash;
  }
}));

test('master admin can create multiple workspaces and their data never mixes', async () => isolated(async () => {
  const oldEmail = process.env.MASTER_ADMIN_EMAIL;
  const oldHash = process.env.MASTER_ADMIN_PASSWORD_HASH;
  process.env.MASTER_ADMIN_EMAIL = 'master@example.test';
  process.env.MASTER_ADMIN_PASSWORD_HASH = hashPassword('master-password');
  try {
    const account = (await provisionMaster())!;
    const masterToken = createSessionToken({ email: account.email, version: account.version, credentialVersion: masterCredentialVersion(), scope: 'master' });

    let wsAlphaId = '';
    let wsBetaId = '';
    let wsGammaId = '';
    let betaInviteToken = '';

    await withSession(masterToken, async () => {
      // 1. Validation: reject empty workspace name
      const emptyRes = await masterWorkspaces.POST(request({ name: '' }));
      assert.equal(emptyRes.status, 400);

      // 2. Master creates Workspace 1 with an owner account & password
      const ws1Res = await masterWorkspaces.POST(request({
        name: 'Alpha Workspace',
        ownerEmail: 'alpha-owner@example.test',
        ownerName: 'Alpha Owner',
        withPassword: true,
        password: 'AlphaPassword123',
      }));
      assert.equal(ws1Res.status, 200);
      const ws1 = await ws1Res.json() as { workspace: { id: string; name: string; ownerEmail: string } };
      wsAlphaId = ws1.workspace.id;
      assert.equal(ws1.workspace.name, 'Alpha Workspace');
      assert.equal(ws1.workspace.ownerEmail, 'alpha-owner@example.test');

      // 3. Master creates Workspace 2 with an invite link
      const ws2Res = await masterWorkspaces.POST(request({
        name: 'Beta Workspace',
        ownerEmail: 'beta-owner@example.test',
        ownerName: 'Beta Owner',
        withPassword: false,
      }));
      assert.equal(ws2Res.status, 200);
      const ws2 = await ws2Res.json() as { workspace: { id: string }; invitePath: string };
      wsBetaId = ws2.workspace.id;
      assert.ok(ws2.invitePath);
      betaInviteToken = new URL(ws2.invitePath, 'http://localhost').searchParams.get('token')!;

      // 4. Master creates Workspace 3 owned directly by master (blank owner email)
      const ws3Res = await masterWorkspaces.POST(request({
        name: 'Gamma Workspace',
      }));
      assert.equal(ws3Res.status, 200);
      const ws3 = await ws3Res.json() as { workspace: { id: string; ownerEmail: string } };
      wsGammaId = ws3.workspace.id;
      assert.equal(ws3.workspace.ownerEmail, 'master@example.test');

      // 5. Ensure all 3 workspaces are distinct
      assert.notEqual(wsAlphaId, wsBetaId);
      assert.notEqual(wsAlphaId, wsGammaId);
      assert.notEqual(wsBetaId, wsGammaId);

      // 6. List all workspaces
      const listRes = await masterWorkspaces.GET();
      assert.equal(listRes.status, 200);
      const allWs = await listRes.json() as { workspaces: { id: string; name: string }[] };
      assert.ok(allWs.workspaces.some(w => w.id === wsAlphaId));
      assert.ok(allWs.workspaces.some(w => w.id === wsBetaId));
      assert.ok(allWs.workspaces.some(w => w.id === wsGammaId));

      // 7. Duplicate owner registration in another workspace is rejected
      const dupRes = await masterWorkspaces.POST(request({
        name: 'Duplicate Alpha Workspace',
        ownerEmail: 'alpha-owner@example.test',
      }));
      assert.equal(dupRes.status, 400);

      // 8. Populate Workspace Alpha as Master Admin
      await masterContext.POST(request({ workspaceId: wsAlphaId }));
      const alphaPageRes = await pages.POST(request({ name: 'Alpha Page', slug: 'alpha-page' }));
      assert.equal(alphaPageRes.status, 200);
      const alphaPage = await alphaPageRes.json() as { id: number; workspaceId: string };
      assert.equal(alphaPage.workspaceId, wsAlphaId);

      // 9. Switch to Workspace Beta as Master Admin -> verify isolation
      await masterContext.POST(request({ workspaceId: wsBetaId }));
      const betaPages = await (await pages.GET()).json() as { id: number; name: string }[];
      assert.deepEqual(betaPages, [], 'Workspace Beta should have 0 pages');

      const betaPageRes = await pages.POST(request({ name: 'Beta Page', slug: 'beta-page' }));
      assert.equal(betaPageRes.status, 200);
      const betaPage = await betaPageRes.json() as { id: number; workspaceId: string };
      assert.equal(betaPage.workspaceId, wsBetaId);

      // 10. Switch to Workspace Gamma as Master Admin -> verify isolation
      await masterContext.POST(request({ workspaceId: wsGammaId }));
      const gammaPages = await (await pages.GET()).json() as { id: number; name: string }[];
      assert.deepEqual(gammaPages, [], 'Workspace Gamma should have 0 pages');
    });

    // 11. Sign in as Alpha Owner -> verify they only see Alpha data and cannot access Beta data
    const alphaUser = (await findWorkspaceUser('alpha-owner@example.test'))!;
    const alphaToken = createSessionToken({ ...alphaUser, scope: 'workspace', accountId: alphaUser.id });

    await withSession(alphaToken, async () => {
      const alphaList = await (await pages.GET()).json() as { name: string; slug: string }[];
      assert.equal(alphaList.length, 1);
      assert.equal(alphaList[0].slug, 'alpha-page');

      // Attempt to access Beta's page directly -> must be rejected
      const betaPages = await listPages(wsBetaId);
      const betaPageId = betaPages[0].id;
      assert.equal((await page.GET(request(), params(betaPageId))).status, 400);
      assert.equal((await page.PUT(request({ title: 'Hacked' }), params(betaPageId))).status, 400);
      assert.equal((await page.DELETE(request(), params(betaPageId))).status, 400);
    });

    // 12. Accept invitation for Beta Owner -> verify they only see Beta data and cannot access Alpha data
    const betaAccepted = await acceptInvitation({
      email: 'beta-owner@example.test',
      password: 'BetaPassword123',
      token: betaInviteToken,
    });
    assert.equal(betaAccepted.workspaceId, wsBetaId);

    const betaToken = createSessionToken({ ...betaAccepted, scope: 'workspace' });
    await withSession(betaToken, async () => {
      const betaList = await (await pages.GET()).json() as { name: string; slug: string }[];
      assert.equal(betaList.length, 1);
      assert.equal(betaList[0].slug, 'beta-page');

      // Attempt to access Alpha's page directly -> must be rejected
      const alphaPages = await listPages(wsAlphaId);
      const alphaPageId = alphaPages[0].id;
      assert.equal((await page.GET(request(), params(alphaPageId))).status, 400);
      assert.equal((await page.PUT(request({ title: 'Hacked' }), params(alphaPageId))).status, 400);
      assert.equal((await page.DELETE(request(), params(alphaPageId))).status, 400);
    });
  } finally {
    if (oldEmail === undefined) delete process.env.MASTER_ADMIN_EMAIL; else process.env.MASTER_ADMIN_EMAIL = oldEmail;
    if (oldHash === undefined) delete process.env.MASTER_ADMIN_PASSWORD_HASH; else process.env.MASTER_ADMIN_PASSWORD_HASH = oldHash;
  }
}));


test('login rejects malformed request bodies with JSON validation errors', async () => {
  for (const body of ['{', 'null', '[]', '{}', '{"email":12,"password":"test"}']) {
    const response = await auth.POST(new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.199' },
      body,
    }));
    assert.equal(response.status, 400);
    assert.equal(typeof ((await response.json()) as { error: unknown }).error, 'string');
  }
});

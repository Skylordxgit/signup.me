import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSessionToken, readSessionToken, resolveAdminSession, hashPassword, verifyPassword } from '../lib/auth';
import { publicWorkspaceUser, findWorkspaceUser, updateWorkspaceUser } from '../lib/workspaceUsers';
import { signUp } from '../lib/signup';
import { isWorkspaceActive, updateWorkspace } from '../lib/workspaces';
import { masterCredentialVersion, provisionMaster, validMasterSession } from '../lib/master';
import { canAccess } from '../lib/permissions';

test('stored membership, account identity and session version control workspace access', async () => {
  const previous = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'signup-auth-'));
  process.chdir(directory);
  try {
    const result = await signUp({ email: 'owner@example.test', password: 'a-long-password' });
    const user = (await findWorkspaceUser(result.email))!;
    const token = createSessionToken({ ...result, scope: 'workspace' });
    const session = readSessionToken(token);
    assert.equal((await resolveAdminSession(session))?.workspaceId, result.workspaceId);
    assert.equal(await resolveAdminSession(readSessionToken(createSessionToken(user.email))), null);
    assert.equal(await resolveAdminSession({ ...session!, workspaceId: 'default' }), null);
    assert.equal(await resolveAdminSession({ ...session!, accountId: 'deleted-account-id' }), null);
    assert.equal(readSessionToken(token + '.extra'), null);
    assert.equal(readSessionToken(token + 'tampered'), null);
    assert.equal(verifyPassword('a-long-password', user.passwordHash), true);
    assert.equal(verifyPassword('wrong', user.passwordHash), false);
    assert.equal('passwordHash' in publicWorkspaceUser(user), false);
    assert.equal('inviteHash' in publicWorkspaceUser(user), false);
    await updateWorkspaceUser(user.id, { active: false }, user.workspaceId);
    assert.equal(await resolveAdminSession(session), null);
    await updateWorkspaceUser(user.id, { active: true, role: 'member', permissions: ['analytics'] }, user.workspaceId);
    assert.equal(await resolveAdminSession(session), null);
    const fresh = readSessionToken(createSessionToken({ ...result, version: 3, role: 'owner', scope: 'workspace' }));
    const member = (await resolveAdminSession(fresh))!;
    assert.equal(member.role, 'member', 'a token cannot elevate the stored role');
    assert.equal(canAccess(member, 'analytics'), true);
    assert.equal(canAccess(member, 'team'), false);
    await updateWorkspace(result.workspaceId, { status: 'disabled' });
    assert.equal(await resolveAdminSession(fresh), null);
    assert.equal(await isWorkspaceActive('nonexistent'), false);
  } finally { process.chdir(previous); await rm(directory, { recursive: true, force: true }); }
});

test('master credentials need a matching database record and explicit workspace context', async () => {
  const previous = process.cwd();
  const oldEmail = process.env.MASTER_ADMIN_EMAIL;
  const oldHash = process.env.MASTER_ADMIN_PASSWORD_HASH;
  const directory = await mkdtemp(path.join(tmpdir(), 'signup-master-'));
  process.chdir(directory);
  process.env.MASTER_ADMIN_EMAIL = 'master@example.test';
  process.env.MASTER_ADMIN_PASSWORD_HASH = hashPassword('master-password');
  try {
    const workspace = await signUp({ email: 'workspace@example.test', password: 'a-long-password' });
    const descriptor = { email: 'master@example.test', scope: 'master' as const, version: 1, credentialVersion: masterCredentialVersion() };
    assert.equal(await validMasterSession(descriptor), false);
    await provisionMaster();
    assert.equal(await validMasterSession(descriptor), true);
    assert.equal((await resolveAdminSession(readSessionToken(createSessionToken(descriptor))))?.isMaster, true);
    await updateWorkspace(workspace.workspaceId, { status: 'disabled' });
    const scoped = await resolveAdminSession(readSessionToken(createSessionToken(descriptor)));
    assert.equal(scoped?.isMaster, true);
    assert.equal(scoped?.workspaceId, '');
    assert.equal(await validMasterSession({ ...workspace, scope: 'workspace' }), false);
    process.env.MASTER_ADMIN_PASSWORD_HASH = hashPassword('rotated-password');
    assert.equal(await validMasterSession(descriptor), false, 'credential rotation revokes existing sessions');
  } finally {
    process.chdir(previous);
    if (oldEmail === undefined) delete process.env.MASTER_ADMIN_EMAIL; else process.env.MASTER_ADMIN_EMAIL = oldEmail;
    if (oldHash === undefined) delete process.env.MASTER_ADMIN_PASSWORD_HASH; else process.env.MASTER_ADMIN_PASSWORD_HASH = oldHash;
    await rm(directory, { recursive: true, force: true });
  }
});

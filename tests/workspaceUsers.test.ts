import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, readSessionToken, resolveAdminSession, ownerEmail, hashPassword, verifyPassword } from '../lib/auth';
import { mysqlPool } from '../lib/mysql';
import { publicWorkspaceUser } from '../lib/workspaceUsers';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspaces';

test('workspace roles reject unknown, disabled and revoked admin sessions', async t => {
  const original = process.env.DATABASE_URL;
  const originalMasterEmail = process.env.MASTER_ADMIN_EMAIL;
  const originalMasterHash = process.env.MASTER_ADMIN_PASSWORD_HASH;
  process.env.DATABASE_URL = 'mysql://test:test@localhost/test';
  process.env.MASTER_ADMIN_EMAIL = 'master@example.test';
  process.env.MASTER_ADMIN_PASSWORD_HASH = hashPassword('master-password');
  t.after(() => {
    if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original;
    if (originalMasterEmail === undefined) delete process.env.MASTER_ADMIN_EMAIL; else process.env.MASTER_ADMIN_EMAIL = originalMasterEmail;
    if (originalMasterHash === undefined) delete process.env.MASTER_ADMIN_PASSWORD_HASH; else process.env.MASTER_ADMIN_PASSWORD_HASH = originalMasterHash;
  });
  const user = { id: 'test-admin', email: 'teammate@example.test', name: 'Teammate', passwordHash: hashPassword('a-long-test-password'), workspaceId: DEFAULT_WORKSPACE_ID, role: 'admin' as const, active: true, version: 1, createdAt: new Date().toISOString() };
  t.mock.method(mysqlPool(), 'query', async () => [[], []]);
  t.mock.method(mysqlPool(), 'execute', async () => [[user], []]);
  const session = readSessionToken(createSessionToken(user.email, 1));
  assert.equal((await resolveAdminSession(session))?.role, 'admin');
  assert.equal((await resolveAdminSession(readSessionToken(createSessionToken(ownerEmail()))))?.role, 'owner');
  assert.equal(await resolveAdminSession(readSessionToken(createSessionToken('missing@example.test', 1))), null);
  assert.equal(await resolveAdminSession(readSessionToken(createSessionToken(user.email))), null);
  user.active = false;
  assert.equal(await resolveAdminSession(session), null);
  user.active = true;
  user.version = 2;
  assert.equal(await resolveAdminSession(session), null);
  assert.equal((await resolveAdminSession(readSessionToken(createSessionToken(user.email, 2))))?.role, 'admin');
  assert.equal(verifyPassword('a-long-test-password', user.passwordHash), true);
  assert.equal(verifyPassword('wrong', user.passwordHash), false);
  assert.equal('passwordHash' in publicWorkspaceUser(user), false);
  assert.equal('version' in publicWorkspaceUser(user), false);
  assert.equal(readSessionToken(createSessionToken(user.email, 2) + 'tampered'), null);

  // Every resolved session names the workspace it may touch.
  assert.equal((await resolveAdminSession(readSessionToken(createSessionToken(user.email, 2))))?.workspaceId, DEFAULT_WORKSPACE_ID);
  assert.equal((await resolveAdminSession(readSessionToken(createSessionToken(ownerEmail()))))?.workspaceId, DEFAULT_WORKSPACE_ID);

  // A master session now enters the unified admin shell with master controls.
  const masterSession = await resolveAdminSession(readSessionToken(createSessionToken({ email: 'master@example.test', scope: 'master' })));
  assert.equal(masterSession?.workspaceId, DEFAULT_WORKSPACE_ID);
  assert.equal(masterSession?.role, 'owner');
  assert.equal(masterSession?.isMaster, true);

  // A pending invite has no password yet, so it cannot hold a session.
  const pendingHash = user.passwordHash;
  user.passwordHash = '';
  assert.equal(await resolveAdminSession(readSessionToken(createSessionToken(user.email, 2))), null);
  user.passwordHash = pendingHash;
});

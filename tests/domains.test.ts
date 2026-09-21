import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { createSessionToken, hashPassword } from '../lib/auth';
import { masterCredentialVersion, provisionMaster } from '../lib/master';
import { createWorkspace } from '../lib/workspaces';
import { addDomain, assignDomain, deleteDomain, getDomain, listDomainAuditEvents, normalizeDomain, setWorkspacePrimaryDomain, updateDomainHostname, updateDomainSslStatus, verifyDomainDns } from '../lib/domains';
import { withSession } from './requestContext';
import * as domainsApi from '../app/api/master/domains/route';
import * as workspacesApi from '../app/api/master/workspaces/route';

function request(body: unknown = {}, method = 'POST') {
  return new NextRequest('http://localhost/api/master/domains', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

async function isolated(run: () => Promise<void>) {
  const previousDirectory = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'signup-domains-'));
  process.chdir(directory);
  try { await run(); }
  finally { process.chdir(previousDirectory); await rm(directory, { recursive: true, force: true }); }
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
}

test('custom domains normalize public hostnames and reject unsafe or reserved values', () => {
  const oldMaster = process.env.MASTER_ADMIN_DOMAIN;
  const oldDefault = process.env.DEFAULT_APP_DOMAIN;
  process.env.MASTER_ADMIN_DOMAIN = 'https://admin.example.com/';
  process.env.DEFAULT_APP_DOMAIN = 'app.example.com';
  try {
    assert.equal(normalizeDomain(' https://WWW.Brand-A.com/ '), 'brand-a.com');
    for (const value of ['localhost', '127.0.0.1', '[::1]', 'internal', 'site.local', 'brand-a.com:8443', 'https://brand-a.com/path', 'admin.example.com', 'app.example.com']) {
      assert.throws(() => normalizeDomain(value));
    }
  } finally {
    restore('MASTER_ADMIN_DOMAIN', oldMaster);
    restore('DEFAULT_APP_DOMAIN', oldDefault);
  }
});

test('JSON domain persistence enforces hostname and one-primary-per-workspace rules with audits', async () => isolated(async () => {
  const one = await createWorkspace({ name: 'One', ownerEmail: 'one@example.test' });
  const two = await createWorkspace({ name: 'Two', ownerEmail: 'two@example.test' });
  const domain = await addDomain('https://www.one-brand.com/', 'master@example.test', one.id);
  assert.equal(domain.hostname, 'one-brand.com');
  await assert.rejects(addDomain('ONE-BRAND.COM', 'master@example.test'), /already exists/);

  const spare = await addDomain('two-brand.com', 'master@example.test');
  await assert.rejects(assignDomain(spare.id, one.id, 'master@example.test'), /already has a primary/);
  await assignDomain(spare.id, two.id, 'master@example.test');
  await assert.rejects(assignDomain(spare.id, one.id, 'master@example.test'), /Unassign/);
  await assignDomain(spare.id, null, 'master@example.test');
  await deleteDomain(domain.id, 'master@example.test');

  assert.deepEqual((await listDomainAuditEvents()).map(item => item.action), [
    'Domain Deleted', 'Domain Unassigned', 'Domain Unassigned', 'Domain Assigned', 'Domain Added', 'Domain Assigned', 'Domain Added',
  ]);
}));

test('DNS verification uses injected CNAME/A answers and SSL only activates after verification', async () => isolated(async () => {
  const oldCname = process.env.CUSTOM_DOMAIN_CNAME_TARGET;
  const oldIp = process.env.CUSTOM_DOMAIN_SERVER_IP;
  process.env.CUSTOM_DOMAIN_CNAME_TARGET = 'edge.example.net.';
  delete process.env.CUSTOM_DOMAIN_SERVER_IP;
  try {
    const domain = await addDomain('verified-brand.com');
    await assert.rejects(updateDomainSslStatus(domain.id, 'active'), /Verify DNS/);
    const failed = await verifyDomainDns(domain.id, { resolveCname: async () => ['wrong.example.net'], resolve4: async () => [] });
    assert.equal(failed.status, 'error');
    assert.match(failed.verificationError || '', /Expected CNAME/);
    const verified = await verifyDomainDns(domain.id, { resolveCname: async () => ['EDGE.EXAMPLE.NET.'], resolve4: async () => [] });
    assert.equal(verified.status, 'verified');
    assert.ok(verified.lastVerifiedAt);
    const active = await updateDomainSslStatus(domain.id, 'active');
    assert.equal(active.status, 'active');
    assert.equal(active.sslStatus, 'active');
  } finally {
    restore('CUSTOM_DOMAIN_CNAME_TARGET', oldCname);
    restore('CUSTOM_DOMAIN_SERVER_IP', oldIp);
  }
}));

test('hostname edits normalize and reset DNS and SSL state without dropping assignment', async () => isolated(async () => {
  const workspace = await createWorkspace({ name: 'Tenant', ownerEmail: 'tenant@example.test' });
  const domain = await addDomain('old-brand.com', 'master@example.test', workspace.id);
  const filename = path.join(process.cwd(), 'data', 'domains.json');
  const data = JSON.parse(await readFile(filename, 'utf8')) as { domains: { id: string; status: string; sslStatus: string; lastVerifiedAt: string | null }[] };
  const saved = data.domains.find(item => item.id === domain.id)!;
  saved.status = 'active';
  saved.sslStatus = 'active';
  saved.lastVerifiedAt = new Date().toISOString();
  await writeFile(filename, JSON.stringify(data));

  const updated = await updateDomainHostname(domain.id, 'https://www.NEW-brand.com/');
  assert.equal(updated.hostname, 'new-brand.com');
  assert.equal(updated.workspaceId, workspace.id);
  assert.equal(updated.status, 'pending_dns');
  assert.equal(updated.sslStatus, 'pending');
  assert.equal(updated.lastVerifiedAt, null);
}));

test('workspace domain changes replace the current assignment atomically', async () => isolated(async () => {
  const workspace = await createWorkspace({ name: 'Tenant', ownerEmail: 'tenant@example.test' });
  const first = await addDomain('first-brand.com', 'master@example.test', workspace.id);
  const second = await addDomain('second-brand.com');
  await setWorkspacePrimaryDomain(workspace.id, second.id, 'master@example.test');
  assert.equal((await getDomain(first.id))?.workspaceId, null);
  assert.equal((await getDomain(second.id))?.workspaceId, workspace.id);
}));

test('domain and workspace-domain APIs are master-only and support name changes', async () => isolated(async () => {
  await withSession(undefined, async () => assert.equal((await domainsApi.GET()).status, 401));
  const oldEmail = process.env.MASTER_ADMIN_EMAIL;
  const oldHash = process.env.MASTER_ADMIN_PASSWORD_HASH;
  process.env.MASTER_ADMIN_EMAIL = 'master@example.test';
  process.env.MASTER_ADMIN_PASSWORD_HASH = hashPassword('master-password');
  try {
    const account = (await provisionMaster())!;
    const token = createSessionToken({ email: account.email, version: account.version, credentialVersion: masterCredentialVersion(), scope: 'master' });
    await withSession(token, async () => {
      const workspace = await createWorkspace({ name: 'Before', ownerEmail: 'owner@example.test' });
      const createdResponse = await domainsApi.POST(request({ hostname: 'https://www.api-brand.com/' }));
      assert.equal(createdResponse.status, 200);
      const created = await createdResponse.json() as { domain: { id: string; hostname: string } };
      assert.equal(created.domain.hostname, 'api-brand.com');
      assert.equal((await domainsApi.PATCH(request({ id: created.domain.id, action: 'assign', workspaceId: workspace.id }, 'PATCH'))).status, 200);
      assert.equal((await workspacesApi.PATCH(request({ id: workspace.id, name: 'After' }, 'PATCH'))).status, 200);
      assert.equal((await workspacesApi.PATCH(request({ id: 'missing', domainId: null }, 'PATCH'))).status, 400);
      const listed = await (await workspacesApi.GET()).json() as { workspaces: { id: string; name: string; domain: string | null }[] };
      const updated = listed.workspaces.find(item => item.id === workspace.id);
      assert.equal(updated?.name, 'After');
      assert.equal(updated?.domain, 'api-brand.com');
    });
  } finally {
    restore('MASTER_ADMIN_EMAIL', oldEmail);
    restore('MASTER_ADMIN_PASSWORD_HASH', oldHash);
  }
}));

import { NextRequest } from 'next/server';
import { masterJson } from '@/lib/auth';
import { addDomain, deleteDomain, domainVerificationConfig, listDomainAuditEvents, listDomains, moveDomain, setDomainDisabled, updateDomainHostname, verifyDomainDns } from '@/lib/domains';

export async function GET() {
  return masterJson(async () => ({
    domains: await listDomains(),
    auditEvents: await listDomainAuditEvents(),
    verification: domainVerificationConfig(),
  }));
}

export async function POST(request: NextRequest) {
  return masterJson(async session => {
    const body = await request.json() as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' && body.workspaceId ? body.workspaceId : null;
    const domain = await addDomain(body.hostname ?? body.domain, session.email, workspaceId);
    return { ok: true, domain, verification: domainVerificationConfig() };
  });
}

export async function PATCH(request: NextRequest) {
  return masterJson(async session => {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== 'string' || !body.id) throw new Error('Select a domain.');
    if (body.action === 'verify') return { ok: true, domain: await verifyDomainDns(body.id, undefined, session.email) };
    if (body.action === 'edit') return { ok: true, domain: await updateDomainHostname(body.id, body.hostname, session.email), verification: domainVerificationConfig() };
    if (body.action === 'disable') return { ok: true, domain: await setDomainDisabled(body.id, body.disabled !== false) };
    if (body.action === 'assign' || Object.prototype.hasOwnProperty.call(body, 'workspaceId')) {
      if (body.workspaceId !== null && (typeof body.workspaceId !== 'string' || !body.workspaceId)) throw new Error('Select a workspace or use null to unassign.');
      return { ok: true, domain: await moveDomain(body.id, body.workspaceId as string | null, session.email) };
    }
    throw new Error('Choose verify, edit, disable, or assign.');
  });
}

export async function DELETE(request: NextRequest) {
  return masterJson(async session => {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== 'string' || !body.id) throw new Error('Select a domain.');
    await deleteDomain(body.id, session.email);
    return { ok: true };
  });
}

import { NextRequest } from 'next/server';
import { createWorkspaceLaunchToken, masterJson, ownerEmail, setSessionCookie } from '@/lib/auth';
import { masterCredentialVersion, provisionMaster, storedMaster } from '@/lib/master';
import { DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace, getWorkspace } from '@/lib/workspaces';
import { listDomains } from '@/lib/domains';

export async function POST(request: NextRequest) {
  return masterJson(async session => {
    const { workspaceId } = await request.json() as { workspaceId?: unknown };
    if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('Workspace not found.');
    // The default workspace holds every pre-existing page, so it is created on
    // demand rather than being reported as missing.
    if (workspaceId === DEFAULT_WORKSPACE_ID) await ensureDefaultWorkspace(ownerEmail() || session.email);
    if (!(await getWorkspace(workspaceId))) throw new Error('Workspace not found.');
    const account = (await storedMaster()) ?? (await provisionMaster());
    if (!account) throw new Error('Master admin is not configured.');
    const descriptor = { email: session.email, scope: 'master' as const, workspaceId, version: account.version, credentialVersion: masterCredentialVersion() };
    // Keep the master-origin cookie intact so the control center is never moved
    // onto a tenant domain. A short-lived token starts the selected workspace on
    // its own custom origin instead.
    await setSessionCookie(descriptor);
    const domain = (await listDomains()).find(item => item.workspaceId === workspaceId && item.isPrimary && item.status === 'active');
    const launchUrl = domain
      ? `https://${domain.hostname}/admin/transfer?token=${encodeURIComponent(createWorkspaceLaunchToken(descriptor))}`
      : '/admin';
    return { ok: true, launchUrl };
  });
}

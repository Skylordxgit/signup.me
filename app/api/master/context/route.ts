import { NextRequest } from 'next/server';
import { masterJson, ownerEmail, setSessionCookie } from '@/lib/auth';
import { masterCredentialVersion, provisionMaster, storedMaster } from '@/lib/master';
import { DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace, getWorkspace } from '@/lib/workspaces';

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
    await setSessionCookie({ email: session.email, scope: 'master', workspaceId, version: account.version, credentialVersion: masterCredentialVersion() });
    return { ok: true };
  });
}

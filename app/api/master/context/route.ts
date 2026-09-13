import { NextRequest } from 'next/server';
import { masterJson, setSessionCookie } from '@/lib/auth';
import { masterCredentialVersion, storedMaster } from '@/lib/master';
import { getWorkspace } from '@/lib/workspaces';

export async function POST(request: NextRequest) {
  return masterJson(async session => {
    const { workspaceId } = await request.json() as { workspaceId?: unknown };
    if (typeof workspaceId !== 'string' || !(await getWorkspace(workspaceId))) throw new Error('Workspace not found.');
    const account = await storedMaster();
    await setSessionCookie({ email: session.email, scope: 'master', workspaceId, version: account!.version, credentialVersion: masterCredentialVersion() });
    return { ok: true };
  });
}

import { NextRequest } from 'next/server';
import { masterJson } from '@/lib/auth';
import { getBranding, saveBranding } from '@/lib/branding';
import {
  getWorkspaceBranding,
  saveWorkspaceBranding,
  type WorkspaceBrandingInput,
} from '@/lib/workspaceBranding';

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (workspaceId) {
    return masterJson(async () => getWorkspaceBranding(workspaceId));
  }
  return masterJson(() => getBranding());
}

export async function PATCH(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  const body = (await request.json()) as Record<string, unknown>;
  const targetWsId = workspaceId || (typeof body.workspaceId === 'string' ? body.workspaceId : null);

  if (targetWsId) {
    return masterJson(async () => saveWorkspaceBranding(targetWsId, body as WorkspaceBrandingInput));
  }

  return masterJson(async () => saveBranding(body));
}

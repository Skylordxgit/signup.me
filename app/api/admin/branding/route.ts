import { NextRequest } from 'next/server';
import { protectedJson } from '@/lib/auth';
import {
  getWorkspaceBranding,
  resetWorkspaceBranding,
  saveWorkspaceBranding,
  type WorkspaceBrandingInput,
} from '@/lib/workspaceBranding';

export async function GET() {
  return protectedJson(async session => {
    return getWorkspaceBranding(session.workspaceId);
  }, 'pages');
}

export async function PUT(request: NextRequest) {
  return protectedJson(async session => {
    const body = (await request.json()) as WorkspaceBrandingInput;
    return saveWorkspaceBranding(session.workspaceId, body);
  }, 'pages');
}

export async function DELETE() {
  return protectedJson(async session => {
    return resetWorkspaceBranding(session.workspaceId);
  }, 'pages');
}

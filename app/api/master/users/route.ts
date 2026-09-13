import { masterJson } from '@/lib/auth';
import { listWorkspaceUsers, publicWorkspaceUser } from '@/lib/workspaceUsers';

export async function GET() {
  return masterJson(async () => (await listWorkspaceUsers()).map(publicWorkspaceUser));
}

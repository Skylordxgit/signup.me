import { NextRequest } from 'next/server';
import { masterJson, ownerEmail } from '@/lib/auth';
import { listPushSubscribers, pagesByWorkspace } from '@/lib/store';
import { adminCounts, listWorkspaceUsers } from '@/lib/workspaceUsers';
import { DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace, listWorkspaces, updateWorkspace, type WorkspaceStatus } from '@/lib/workspaces';

export type MasterWorkspace = {
  id: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  status: WorkspaceStatus;
  createdAt: string;
  pages: number;
  admins: number;
  subscribers: number;
};

export async function GET() {
  return masterJson(async () => {
    await ensureDefaultWorkspace(ownerEmail());
    const [workspaces, pages, admins, users, subscribers] = await Promise.all([
      listWorkspaces(),
      pagesByWorkspace(),
      adminCounts(),
      listWorkspaceUsers(),
      listPushSubscribers(),
    ]);

    // Subscribers hang off pages, so map each page id back to its workspace.
    const pageWorkspace = new Map(pages.map(page => [page.id, page.workspaceId]));
    const subscriberCounts = new Map<string, number>();
    for (const entry of subscribers.byPage) {
      const id = pageWorkspace.get(entry.pageId);
      if (id) subscriberCounts.set(id, (subscriberCounts.get(id) ?? 0) + entry.subscribers);
    }

    const rows: MasterWorkspace[] = workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      ownerEmail: workspace.ownerEmail,
      ownerName: users.find(user => user.workspaceId === workspace.id && user.role === 'owner')?.name
        || (workspace.id === DEFAULT_WORKSPACE_ID ? 'Configured administrator' : workspace.ownerEmail),
      status: workspace.status,
      createdAt: workspace.createdAt,
      pages: pages.filter(page => page.workspaceId === workspace.id).length,
      admins: admins.get(workspace.id) ?? 0,
      subscribers: subscriberCounts.get(workspace.id) ?? 0,
    }));

    return { workspaces: rows, defaultWorkspaceId: DEFAULT_WORKSPACE_ID };
  });
}

export async function PATCH(request: NextRequest) {
  return masterJson(async () => {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== 'string' || !body.id) throw new Error('Select a workspace.');
    if (body.status !== 'active' && body.status !== 'disabled') throw new Error('Choose an active or disabled status.');
    await updateWorkspace(body.id, { status: body.status });
    return { ok: true };
  });
}

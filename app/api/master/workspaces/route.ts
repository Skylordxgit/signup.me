import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { hashPassword, masterJson, ownerEmail } from '@/lib/auth';
import { isMasterEmail } from '@/lib/master';
import { assertEmail, assertPassword, displayName, invitationHash, normalizeEmail } from '@/lib/signup';
import { listPushSubscribers, pagesByWorkspace } from '@/lib/store';
import { adminCounts, addWorkspaceUser, findWorkspaceUser, listWorkspaceUsers } from '@/lib/workspaceUsers';
import { createWorkspace, DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace, listWorkspaces, updateWorkspace, type WorkspaceStatus } from '@/lib/workspaces';
import { workspacePermissions } from '@/lib/permissions';

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

export async function POST(request: NextRequest) {
  return masterJson(async (session) => {
    const body = await request.json() as Record<string, unknown>;
    const rawName = typeof body.name === 'string' ? body.name.trim() : '';
    if (!rawName) throw new Error('Workspace name is required.');
    const name = rawName.slice(0, 190);

    let ownerEmailAddr = typeof body.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : '';
    if (!ownerEmailAddr) {
      ownerEmailAddr = session.email;
    } else {
      ownerEmailAddr = assertEmail(normalizeEmail(ownerEmailAddr));
    }

    const createOwner = body.createOwner !== false;
    const existingUser = await findWorkspaceUser(ownerEmailAddr);

    if (createOwner && existingUser && !isMasterEmail(ownerEmailAddr)) {
      throw new Error(`An account for ${ownerEmailAddr} already exists in another workspace.`);
    }

    const workspace = await createWorkspace({ name, ownerEmail: ownerEmailAddr });

    let invitePath: string | undefined;

    if (createOwner && !isMasterEmail(ownerEmailAddr) && !existingUser) {
      const ownerName = typeof body.ownerName === 'string' && body.ownerName.trim()
        ? body.ownerName.trim().slice(0, 120)
        : displayName('', ownerEmailAddr);
      const rawPassword = typeof body.password === 'string' ? body.password : '';
      const withPassword = Boolean(body.withPassword && rawPassword);
      const passwordHash = withPassword ? hashPassword(assertPassword(rawPassword)) : '';
      const token = withPassword ? undefined : randomBytes(32).toString('hex');

      await addWorkspaceUser({
        email: ownerEmailAddr,
        name: ownerName,
        passwordHash,
        workspaceId: workspace.id,
        role: 'owner',
        permissions: [...workspacePermissions],
        ...(token ? { inviteHash: invitationHash(token), inviteExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString() } : {}),
      });

      if (token) {
        invitePath = `/admin/invite?token=${token}&email=${encodeURIComponent(ownerEmailAddr)}`;
      }
    }

    return {
      ok: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        ownerEmail: workspace.ownerEmail,
        status: workspace.status,
        createdAt: workspace.createdAt,
      },
      invitePath,
    };
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

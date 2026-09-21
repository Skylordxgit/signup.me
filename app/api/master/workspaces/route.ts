import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { hashPassword, masterJson, ownerEmail } from '@/lib/auth';
import { isMasterEmail } from '@/lib/master';
import { assertEmail, assertPassword, displayName, invitationHash, normalizeEmail } from '@/lib/signup';
import { listPushSubscribers, pagesByWorkspace } from '@/lib/store';
import { adminCounts, addWorkspaceUser, findWorkspaceUser, listWorkspaceUsers } from '@/lib/workspaceUsers';
import { createWorkspace, DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace, listWorkspaces, updateWorkspace, type WorkspaceStatus } from '@/lib/workspaces';
import { workspacePermissions } from '@/lib/permissions';
import { listDomains, setWorkspacePrimaryDomain } from '@/lib/domains';

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
  domainId: string | null;
  domain: string | null;
  domainStatus: string | null;
};

export async function GET() {
  return masterJson(async () => {
    await ensureDefaultWorkspace(ownerEmail());
    const [workspaces, pages, admins, users, subscribers, domains] = await Promise.all([
      listWorkspaces(),
      pagesByWorkspace(),
      adminCounts(),
      listWorkspaceUsers(),
      listPushSubscribers(),
      listDomains(),
    ]);

    // Subscribers hang off pages, so map each page id back to its workspace.
    const pageWorkspace = new Map(pages.map(page => [page.id, page.workspaceId]));
    const subscriberCounts = new Map<string, number>();
    for (const entry of subscribers.byPage) {
      const id = pageWorkspace.get(entry.pageId);
      if (id) subscriberCounts.set(id, (subscriberCounts.get(id) ?? 0) + entry.subscribers);
    }

    const rows: MasterWorkspace[] = workspaces.map(workspace => {
      const domain = domains.find(item => item.workspaceId === workspace.id && item.isPrimary);
      return {
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
        domainId: domain?.id ?? null,
        domain: domain?.hostname ?? null,
        domainStatus: domain?.status ?? null,
      };
    });

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

    if (body.domainId !== undefined && (typeof body.domainId !== 'string' || !body.domainId)) {
      throw new Error('Select a domain.');
    }

    if (createOwner && existingUser && !isMasterEmail(ownerEmailAddr)) {
      throw new Error(`An account for ${ownerEmailAddr} already exists in another workspace.`);
    }

    const workspace = await createWorkspace({ name, ownerEmail: ownerEmailAddr });

    if (typeof body.domainId === 'string') {
      await setWorkspacePrimaryDomain(workspace.id, body.domainId, session.email);
    }

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
        domainId: typeof body.domainId === 'string' ? body.domainId : null,
      },
      invitePath,
    };
  });
}

export async function PATCH(request: NextRequest) {
  return masterJson(async session => {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== 'string' || !body.id) throw new Error('Select a workspace.');
    const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasDomain = Object.prototype.hasOwnProperty.call(body, 'domainId');
    if (!hasStatus && !hasName && !hasDomain) throw new Error('Choose a workspace change.');
    if (hasStatus && body.status !== 'active' && body.status !== 'disabled') throw new Error('Choose an active or disabled status.');
    if (hasName && (typeof body.name !== 'string' || !body.name.trim())) throw new Error('Workspace name is required.');
    if (hasDomain && body.domainId !== null && (typeof body.domainId !== 'string' || !body.domainId)) throw new Error('Select a domain or use null to unassign.');
    if (hasDomain) {
      await setWorkspacePrimaryDomain(body.id, body.domainId as string | null, session.email);
    }
    if (hasStatus || hasName) await updateWorkspace(body.id, { status: hasStatus ? body.status as WorkspaceStatus : undefined, name: hasName ? body.name as string : undefined });
    return { ok: true };
  });
}

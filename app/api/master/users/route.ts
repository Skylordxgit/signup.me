import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { hashPassword, masterJson, requireAdmin } from '@/lib/auth';
import { parsePermissions, workspacePermissions, type WorkspaceRole } from '@/lib/permissions';
import { isMasterEmail } from '@/lib/master';
import { assertEmail, assertPassword, displayName, invitationHash, normalizeEmail } from '@/lib/signup';
import { addWorkspaceUser, deleteWorkspaceUser, findWorkspaceUser, listWorkspaceUsers, publicWorkspaceUser, updateWorkspaceUser } from '@/lib/workspaceUsers';
import { createWorkspace, DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace, listWorkspaces, workspaceName } from '@/lib/workspaces';

function errorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Action failed.' }, { status: 400 });
}

export async function GET() {
  return masterJson(async () => (await listWorkspaceUsers()).map(publicWorkspaceUser));
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session || !session.isMaster) return NextResponse.json({ error: 'Master access required' }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const email = assertEmail(normalizeEmail(body.email));
    const name = displayName(body.name, email);
    if (isMasterEmail(email)) throw new Error('Master admin email cannot be added as a workspace user.');

    const existing = await findWorkspaceUser(email);
    if (existing) throw new Error('This email already has an account.');

    let targetWorkspaceId = typeof body.workspaceId === 'string' && body.workspaceId.trim() ? body.workspaceId.trim() : '';

    if (!targetWorkspaceId || targetWorkspaceId === 'new') {
      const newWs = await createWorkspace({ name: workspaceName(email), ownerEmail: email });
      targetWorkspaceId = newWs.id;
    } else if (targetWorkspaceId === DEFAULT_WORKSPACE_ID) {
      await ensureDefaultWorkspace(email);
    } else {
      const allWs = await listWorkspaces();
      if (!allWs.some(w => w.id === targetWorkspaceId)) throw new Error('Selected workspace not found.');
    }

    const rawRole = String(body.role || 'owner').toLowerCase();
    const role: WorkspaceRole = (rawRole === 'owner' || rawRole === 'admin') ? 'owner' : 'member';
    const permissions = role === 'owner' ? [...workspacePermissions] : parsePermissions(body.permissions);

    const passwordHash = body.password === undefined || body.password === '' ? '' : hashPassword(assertPassword(body.password));
    const token = passwordHash ? undefined : randomBytes(32).toString('hex');

    const user = await addWorkspaceUser({
      email,
      name,
      passwordHash,
      workspaceId: targetWorkspaceId,
      role,
      permissions,
      ...(token ? { inviteHash: invitationHash(token), inviteExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString() } : {}),
    });

    return NextResponse.json(
      { ...user, ...(token ? { invitePath: `/admin/invite?token=${token}&email=${encodeURIComponent(email)}` } : {}) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin();
  if (!session || !session.isMaster) return NextResponse.json({ error: 'Master access required' }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new Error('Account ID is required.');

    const allUsers = await listWorkspaceUsers();
    const user = allUsers.find(u => u.id === id);
    if (!user) throw new Error('Account not found.');

    if (body.action === 'password') {
      await updateWorkspaceUser(user.id, { passwordHash: hashPassword(assertPassword(body.password)) }, user.workspaceId);
    } else if (body.action === 'access' && typeof body.active === 'boolean') {
      await updateWorkspaceUser(user.id, { active: body.active }, user.workspaceId);
    } else if (body.action === 'permissions' || body.action === 'role') {
      const rawRole = String(body.role || user.role).toLowerCase();
      const role: WorkspaceRole = (rawRole === 'owner' || rawRole === 'admin') ? 'owner' : 'member';
      const permissions = role === 'owner' ? [...workspacePermissions] : parsePermissions(body.permissions);
      await updateWorkspaceUser(user.id, { role, permissions }, user.workspaceId);
    } else {
      throw new Error('Invalid action.');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin();
  if (!session || !session.isMaster) return NextResponse.json({ error: 'Master access required' }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new Error('Account ID is required.');

    const allUsers = await listWorkspaceUsers();
    const user = allUsers.find(u => u.id === id);
    if (!user) throw new Error('Account not found.');

    await deleteWorkspaceUser(user.id, user.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { hashPassword, configuredAdmin, requireAdmin, type AdminSession } from '@/lib/auth';
import { canAccess, parsePermissions } from '@/lib/permissions';
import { isMasterEmail } from '@/lib/master';
import { assertEmail, assertPassword, displayName, invitationHash, normalizeEmail } from '@/lib/signup';
import { addWorkspaceUser, deleteWorkspaceUser, findWorkspaceUser, listWorkspaceUsers, publicWorkspaceUser, updateWorkspaceUser } from '@/lib/workspaceUsers';

function errorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Account update failed.' }, { status: 400 });
}

async function authorize(): Promise<{ denied: NextResponse } | { session: AdminSession }> {
  const session = await requireAdmin();
  if (!session) return { denied: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  if (!canAccess(session, 'team')) return { denied: NextResponse.json({ error: 'Team permission required' }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const auth = await authorize();
  if ('denied' in auth) return auth.denied;
  try {
    const members = (await listWorkspaceUsers(auth.session.workspaceId)).map(publicWorkspaceUser);
    return NextResponse.json(members);
  } catch (error) { return errorResponse(error); }
}

/** An account this caller is allowed to act on: same workspace, never the
 *  owner, and never a synthetic row. */
async function manageableMember(session: AdminSession, id: unknown) {
  if (typeof id !== 'string' || id === 'owner') throw new Error('Select an admin account.');
  const member = (await listWorkspaceUsers(session.workspaceId)).find(user => user.id === id);
  if (!member) throw new Error('Account not found.');
  if (member.role === 'owner' && !session.isMaster) throw new Error('The workspace owner cannot be changed here.');
  if (session.role === 'member' && (member.role !== 'member' || member.permissions?.some(permission => !session.permissions?.includes(permission)))) throw new Error('Cannot manage an account with greater permissions.');
  return member;
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if ('denied' in auth) return auth.denied;
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = assertEmail(normalizeEmail(body.email));
    const name = displayName(body.name, email);
    if (email === configuredAdmin()?.email || isMasterEmail(email)) throw new Error('This email cannot be added to a workspace.');
    const role = (body.role === undefined ? 'member' : body.role) as 'owner' | 'member';
    if (role !== 'owner' && role !== 'member') throw new Error('Choose Admin/Owner or Member.');
    const permissions = parsePermissions(body.permissions);
    if (auth.session.role === 'member' && (role !== 'member' || permissions.some(permission => !auth.session.permissions?.includes(permission)))) throw new Error('Cannot assign permissions you do not have.');

    const existing = await findWorkspaceUser(email);
    if (existing) {
      throw new Error(existing.workspaceId === auth.session.workspaceId
        ? 'This email is already on your team.'
        : 'This email already has an account.');
    }

    // Without a password the account is a pending invite: it belongs to this
    // workspace straight away, and signing up with that email activates it
    // here instead of creating a new workspace.
    const passwordHash = body.password === undefined || body.password === '' ? '' : hashPassword(assertPassword(body.password));
    const token = passwordHash ? undefined : randomBytes(32).toString('hex');
    const user = await addWorkspaceUser({ email, name, passwordHash, workspaceId: auth.session.workspaceId, role, permissions, ...(token ? { inviteHash: invitationHash(token), inviteExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString() } : {}) });
    return NextResponse.json(
      { ...user, ...(token ? { invitePath: `/admin/invite?token=${token}&email=${encodeURIComponent(email)}` } : {}) },
      { status: 201 },
    );
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize();
  if ('denied' in auth) return auth.denied;
  try {
    const body = await request.json() as Record<string, unknown>;
    const member = await manageableMember(auth.session, body.id);
    if (body.action === 'password') {
      if (!member.passwordHash) throw new Error('Pending invitations must be accepted through their invitation link.');
      await updateWorkspaceUser(member.id, { passwordHash: hashPassword(assertPassword(body.password)) }, auth.session.workspaceId);
    }
    else if (body.action === 'access' && typeof body.active === 'boolean') await updateWorkspaceUser(member.id, { active: body.active }, auth.session.workspaceId);
    else if (body.action === 'permissions' && (body.role === 'owner' || body.role === 'member')) {
      if (member.role === 'owner') throw new Error('Owner permissions cannot be changed.');
      const permissions = parsePermissions(body.permissions);
      if (auth.session.role === 'member' && (body.role !== 'member' || permissions.some(permission => !auth.session.permissions?.includes(permission)))) throw new Error('Cannot assign permissions you do not have.');
      await updateWorkspaceUser(member.id, { role: body.role, permissions }, auth.session.workspaceId);
    }
    else throw new Error('Invalid account action.');
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize();
  if ('denied' in auth) return auth.denied;
  try {
    const body = await request.json() as Record<string, unknown>;
    const member = await manageableMember(auth.session, body.id);
    if (member.role === 'owner') throw new Error('Transfer workspace ownership before deleting its owner.');
    await deleteWorkspaceUser(member.id, auth.session.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

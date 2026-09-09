import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, ownerEmail, requireAdmin, type AdminSession } from '@/lib/auth';
import { isMasterEmail } from '@/lib/master';
import { assertEmail, assertPassword, displayName, normalizeEmail } from '@/lib/signup';
import { addWorkspaceUser, deleteWorkspaceUser, findWorkspaceUser, listWorkspaceUsers, publicWorkspaceUser, updateWorkspaceUser } from '@/lib/workspaceUsers';
import { DEFAULT_WORKSPACE_ID, getWorkspace } from '@/lib/workspaces';

function errorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Account update failed.' }, { status: 400 });
}

async function authorize() {
  const session = await requireAdmin();
  if (!session) return { denied: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  return { session };
}

/** The owner row shown at the top of the Team list.
 *
 *  The default workspace's owner is ADMIN_EMAIL and has no stored account; a
 *  workspace created through signup has a real owner row instead, which the
 *  member list already contains. */
async function ownerRow(session: AdminSession) {
  if (session.workspaceId !== DEFAULT_WORKSPACE_ID) return null;
  const workspace = await getWorkspace(DEFAULT_WORKSPACE_ID);
  return {
    id: 'owner',
    email: workspace?.ownerEmail || ownerEmail(),
    name: 'Workspace owner',
    workspaceId: DEFAULT_WORKSPACE_ID,
    role: 'owner' as const,
    active: true,
    pending: false,
    createdAt: workspace?.createdAt || '',
  };
}

export async function GET() {
  const auth = await authorize();
  if ('denied' in auth) return auth.denied;
  try {
    const members = (await listWorkspaceUsers(auth.session.workspaceId)).map(publicWorkspaceUser);
    // Admins never see the workspace owner; owners see their whole team.
    if (auth.session.role !== 'owner') return NextResponse.json(members.filter(member => member.role !== 'owner'));
    const owner = await ownerRow(auth.session);
    return NextResponse.json(owner ? [owner, ...members] : members);
  } catch (error) { return errorResponse(error); }
}

/** An account this caller is allowed to act on: same workspace, never the
 *  owner, and never a synthetic row. */
async function manageableMember(session: AdminSession, id: unknown) {
  if (typeof id !== 'string' || id === 'owner') throw new Error('Select an admin account.');
  const member = (await listWorkspaceUsers(session.workspaceId)).find(user => user.id === id);
  if (!member) throw new Error('Account not found.');
  if (member.role === 'owner') throw new Error('The workspace owner cannot be changed here.');
  return member;
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if ('denied' in auth) return auth.denied;
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = assertEmail(normalizeEmail(body.email));
    const name = displayName(body.name, email);
    if (email === ownerEmail() || isMasterEmail(email)) throw new Error('This email cannot be added to a workspace.');

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
    return NextResponse.json(
      await addWorkspaceUser({ email, name, passwordHash, workspaceId: auth.session.workspaceId, role: 'admin' }),
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
    if (body.action === 'password') await updateWorkspaceUser(member.id, { passwordHash: hashPassword(assertPassword(body.password)) });
    else if (body.action === 'access' && typeof body.active === 'boolean') await updateWorkspaceUser(member.id, { active: body.active });
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
    await deleteWorkspaceUser(member.id);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

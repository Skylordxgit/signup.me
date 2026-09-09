import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, ownerEmail, requireAdmin } from '@/lib/auth';
import { addWorkspaceUser, listWorkspaceUsers, publicWorkspaceUser, updateWorkspaceUser } from '@/lib/workspaceUsers';

function errorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Account update failed.' }, { status: 400 });
}

async function authorize() {
  const session = await requireAdmin();
  if (!session) return { denied: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  return { session };
}

export async function GET() {
  const auth = await authorize();
  if ('denied' in auth) return auth.denied;
  try {
    const admins = (await listWorkspaceUsers()).map(publicWorkspaceUser);
    if (auth.session.role !== 'owner') return NextResponse.json(admins);
    return NextResponse.json([
      { id: 'owner', email: ownerEmail(), name: 'Workspace owner', role: 'owner', active: true, createdAt: '' },
      ...admins,
    ]);
  } catch (error) { return errorResponse(error); }
}

function passwordHash(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw new Error('Use a password between 8 and 128 characters.');
  return hashPassword(value);
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if ('denied' in auth) return auth.denied;
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) throw new Error('Enter a valid email address.');
    if (!name || name.length > 120) throw new Error('Enter a name of up to 120 characters.');
    if (email === ownerEmail()) throw new Error('This email belongs to the workspace owner.');
    return NextResponse.json(await addWorkspaceUser({ email, name, passwordHash: passwordHash(body.password) }), { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize();
  if ('denied' in auth) return auth.denied;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== 'string' || body.id === 'owner') throw new Error('Select an admin account.');
    if (body.action === 'password') await updateWorkspaceUser(body.id, { passwordHash: passwordHash(body.password) });
    else if (body.action === 'access' && typeof body.active === 'boolean') await updateWorkspaceUser(body.id, { active: body.active });
    else throw new Error('Invalid account action.');
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

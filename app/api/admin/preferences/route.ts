import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getPreferences, savePreferences } from '@/lib/workspaceSettings';

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  return NextResponse.json(await getPreferences(session.workspaceId, session.email));
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try { return NextResponse.json(await savePreferences(session.workspaceId, session.email, await request.json() as Record<string, unknown>)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save preferences.' }, { status: 400 }); }
}

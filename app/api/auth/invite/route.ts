import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie } from '@/lib/auth';
import { acceptInvitation } from '@/lib/signup';

export async function POST(request: NextRequest) {
  try {
    const result = await acceptInvitation(await request.json());
    await setSessionCookie({ email: result.email, accountId: result.accountId, version: result.version, workspaceId: result.workspaceId, role: result.role, scope: 'workspace' });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invitation failed.' }, { status: 400 });
  }
}

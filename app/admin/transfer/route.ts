import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, setSessionCookie } from '@/lib/auth';
import { validMasterSession } from '@/lib/master';
import { resolvePublicHost } from '@/lib/domainRouting';

/** Exchanges a one-minute launch token for a host-only workspace cookie. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const session = readSessionToken(token || undefined);
  const host = await resolvePublicHost(request.headers.get('host'));
  if (!session || session.scope !== 'master' || !session.workspaceId || !await validMasterSession(session) || host.kind !== 'custom' || host.workspaceId !== session.workspaceId) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  await setSessionCookie({
    email: session.email,
    scope: 'master',
    workspaceId: session.workspaceId,
    version: session.version,
    credentialVersion: session.credentialVersion,
  });
  return NextResponse.redirect(new URL('/admin', request.url));
}

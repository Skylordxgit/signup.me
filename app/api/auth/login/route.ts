import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { masterAdmin, masterCredentialVersion, provisionMaster } from '@/lib/master';
import { findWorkspaceUser, isPendingInvite } from '@/lib/workspaceUsers';
import { isWorkspaceActive } from '@/lib/workspaces';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const limit = await checkRateLimit(`login:${ip}`, 10, 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429, headers: { 'Retry-After': String(limit.resetInSeconds) } });
  }

  const { email, password } = (await request.json()) as { email?: string; password?: string };
  const master = masterAdmin();
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const usable = typeof password === 'string' && password.length <= 256;

  function reject(status = 401, error = "Invalid email or password") {
    return NextResponse.json({ error }, { status });
  }

  // The master admin is configured via ADMIN_EMAIL / ADMIN_PASSWORD_HASH and
  // gains universal Master Admin access.
  if (master && normalizedEmail === master.email) {
    if (!usable || !verifyPassword(password!, master.passwordHash)) return reject();
    const account = await provisionMaster();
    if (!account?.active || !verifyPassword(password!, account.passwordHash)) return reject();
    await setSessionCookie({ email: normalizedEmail, scope: 'master', version: account.version, credentialVersion: masterCredentialVersion() });
    return NextResponse.json({ ok: true, scope: 'master', redirect: '/admin/master' });
  }

  const member = await findWorkspaceUser(normalizedEmail);
  // A pending invite has no password yet; that person must sign up first.
  if (!member || !member.active || isPendingInvite(member) || !usable || !verifyPassword(password!, member.passwordHash)) return reject();
  if (!(await isWorkspaceActive(member.workspaceId))) return reject(403, 'This workspace is disabled. Contact your administrator.');

  await setSessionCookie({ email: normalizedEmail, accountId: member.id, version: member.version, workspaceId: member.workspaceId, role: member.role, scope: 'workspace' });
  return NextResponse.json({ ok: true, scope: 'workspace', redirect: '/admin' });
}

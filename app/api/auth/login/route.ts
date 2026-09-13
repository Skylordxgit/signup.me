import { NextRequest, NextResponse } from "next/server";
import { configuredAdmin, setSessionCookie, verifyPassword } from "@/lib/auth";
import { masterAdmin, masterCredentialVersion, provisionMaster } from '@/lib/master';
import { addWorkspaceUser, findWorkspaceUser, isPendingInvite } from '@/lib/workspaceUsers';
import { DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace, isWorkspaceActive } from '@/lib/workspaces';

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const current = attempts.get(ip);
  if (current && current.count >= 5 && current.resetAt > Date.now()) {
    return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const { email, password } = (await request.json()) as { email?: string; password?: string };
  const admin = configuredAdmin();
  const master = masterAdmin();
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const usable = typeof password === 'string' && password.length <= 256;

  function reject(status = 401, error = "Invalid email or password") {
    attempts.set(ip, {
      count: (current && current.resetAt > Date.now() ? current.count : 0) + 1,
      resetAt: Date.now() + 15 * 60 * 1000,
    });
    return NextResponse.json({ error }, { status });
  }

  // The master admin is checked first and enters the unified admin shell with
  // master-only global controls enabled.
  if (master && normalizedEmail === master.email) {
    if (!usable || !verifyPassword(password!, master.passwordHash)) return reject();
    const account = await provisionMaster();
    if (!account?.active || !verifyPassword(password!, account.passwordHash)) return reject();
    attempts.delete(ip);
    await setSessionCookie({ email: normalizedEmail, scope: 'master', version: account.version, credentialVersion: masterCredentialVersion() });
    return NextResponse.json({ ok: true, scope: 'master', redirect: '/admin/master' });
  }

  // Migrate the old configured workspace owner once, then use normal database
  // membership validation. There is no environment-only workspace session.
  if (admin && normalizedEmail === admin.email && !(await findWorkspaceUser(normalizedEmail))) {
    if (!usable || !verifyPassword(password!, admin.passwordHash)) return reject();
    await ensureDefaultWorkspace(admin.email);
    await addWorkspaceUser({ email: admin.email, passwordHash: admin.passwordHash, name: 'Workspace owner', workspaceId: DEFAULT_WORKSPACE_ID, role: 'owner' });
  }

  const member = await findWorkspaceUser(normalizedEmail);
  // A pending invite has no password yet; that person must sign up first.
  if (!member || !member.active || isPendingInvite(member) || !usable || !verifyPassword(password!, member.passwordHash)) return reject();
  if (!(await isWorkspaceActive(member.workspaceId))) return reject(403, 'This workspace is disabled. Contact your administrator.');

  attempts.delete(ip);
  await setSessionCookie({ email: normalizedEmail, accountId: member.id, version: member.version, workspaceId: member.workspaceId, role: member.role, scope: 'workspace' });
  return NextResponse.json({ ok: true, scope: 'workspace', redirect: '/admin' });
}

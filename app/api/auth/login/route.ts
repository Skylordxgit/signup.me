import { NextRequest, NextResponse } from "next/server";
import { configuredAdmin, setSessionCookie, verifyPassword } from "@/lib/auth";
import { findWorkspaceUser } from '@/lib/workspaceUsers';

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const current = attempts.get(ip);
  if (current && current.count >= 5 && current.resetAt > Date.now()) {
    return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const { email, password } = (await request.json()) as { email?: string; password?: string };
  const admin = configuredAdmin();
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const owner = normalizedEmail === admin.email;
  const member = owner ? null : await findWorkspaceUser(normalizedEmail);
  const valid = typeof password === 'string' && password.length <= 256 && (owner || member?.active) && verifyPassword(password, owner ? admin.passwordHash : member!.passwordHash);

  if (!valid) {
    attempts.set(ip, {
      count: (current && current.resetAt > Date.now() ? current.count : 0) + 1,
      resetAt: Date.now() + 15 * 60 * 1000,
    });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  attempts.delete(ip);
  await setSessionCookie(normalizedEmail, owner ? undefined : member!.version);
  return NextResponse.json({ ok: true });
}

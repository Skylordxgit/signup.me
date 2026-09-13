import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { signUp } from "@/lib/signup";
import { getSignupSettings } from "@/lib/signupSettings";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function GET() {
  return NextResponse.json(await getSignupSettings());
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const current = attempts.get(ip);
  if (current && current.count >= 10 && current.resetAt > Date.now()) {
    return NextResponse.json({ error: "Too many signup attempts. Try again later." }, { status: 429 });
  }
  attempts.set(ip, {
    count: (current && current.resetAt > Date.now() ? current.count : 0) + 1,
    resetAt: Date.now() + 15 * 60 * 1000,
  });

  try {
    const [branding, signup] = await Promise.all([getBranding(), getSignupSettings()]);
    if (!branding.signupEnabled || !signup.enabled) {
      return NextResponse.json({ error: "Signup is currently closed." }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown> | null;
    const result = await signUp({ email: body?.email, password: body?.password, name: body?.name });
    await setSessionCookie({ email: result.email, accountId: result.accountId, version: result.version, workspaceId: result.workspaceId, role: result.role, scope: 'workspace' });
    return NextResponse.json({ ok: true, workspaceId: result.workspaceId, joinedInvite: result.joinedInvite }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the account." }, { status: 400 });
  }
}

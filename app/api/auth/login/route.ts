import { NextRequest, NextResponse } from "next/server";
import { configuredAdmin, setSessionCookie, verifyPassword } from "@/lib/auth";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const current = attempts.get(ip);
  if (current && current.count >= 5 && current.resetAt > Date.now()) {
    return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const { email, password } = (await request.json()) as { email?: string; password?: string };
  const admin = configuredAdmin();
  const valid = email === admin.email && typeof password === "string" && verifyPassword(password, admin.passwordHash);

  if (!valid) {
    attempts.set(ip, {
      count: (current?.count ?? 0) + 1,
      resetAt: Date.now() + 15 * 60 * 1000,
    });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  attempts.delete(ip);
  await setSessionCookie(admin.email);
  return NextResponse.json({ ok: true });
}

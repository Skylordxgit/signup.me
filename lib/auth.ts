import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const cookieName = "smartlink_session";
const sessionTtlSeconds = 60 * 60 * 8;

function secret() {
  return process.env.SESSION_SECRET || "dev-secret-change-me-before-production";
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(key, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function sign(value: string) {
  return createHash("sha256").update(`${value}.${secret()}`).digest("hex");
}

export function createSessionToken(email: string) {
  const expiresAt = Date.now() + sessionTtlSeconds * 1000;
  const payload = Buffer.from(JSON.stringify({ email, expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email: string;
      expiresAt: number;
    };
    if (session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function configuredAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const passwordHash = process.env.ADMIN_PASSWORD_HASH || hashPassword("admin123");
  return { email, passwordHash };
}

export async function requireAdmin() {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(cookieName)?.value);
  return session;
}

export async function setSessionCookie(email: string) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, createSessionToken(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: sessionTtlSeconds,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function protectedJson<T>(handler: () => Promise<T>) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    return NextResponse.json(await handler());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400 },
    );
  }
}

export { cookieName };

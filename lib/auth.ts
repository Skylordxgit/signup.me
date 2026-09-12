import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findWorkspaceUser, isPendingInvite } from './workspaceUsers';
import { DEFAULT_WORKSPACE_ID, isWorkspaceActive } from './workspaces';
import { isMasterEmail } from './master';

const cookieName = "smartlink_session";
const sessionTtlSeconds = 60 * 60 * 8;

export type SessionRole = 'owner' | 'admin';
/** Workspace sessions reach one workspace. Master sessions reach the unified
 *  admin shell plus master-only global routes. */
export type SessionScope = 'workspace' | 'master';
export type SessionDescriptor = { email: string; version?: number; workspaceId?: string; role?: SessionRole; scope?: SessionScope };
export type AdminSession = { email: string; workspaceId: string; role: SessionRole; version?: number; expiresAt: number; isMaster?: boolean };
export type MasterSession = { email: string; expiresAt: number };

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

/** Accepts a bare email so sessions minted before workspaces keep working. */
export function createSessionToken(input: string | SessionDescriptor, version?: number) {
  const descriptor: SessionDescriptor = typeof input === 'string' ? { email: input, version } : input;
  const expiresAt = Date.now() + sessionTtlSeconds * 1000;
  const payload = Buffer.from(JSON.stringify({ ...descriptor, expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionDescriptor & { expiresAt: number };
    if (typeof session.email !== 'string' || !Number.isFinite(session.expiresAt) || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function ownerEmail() {
  return (process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
}

export function configuredAdmin() {
  const email = ownerEmail();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH || hashPassword("admin123");
  return { email, passwordHash };
}

async function readSession() {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(cookieName)?.value);
}

export async function requireAdmin() {
  return resolveAdminSession(await readSession());
}

/** Resolves an admin session for the unified admin shell. Master sessions also
 *  enter the shell, anchored to the default workspace, and are marked so only
 *  they can see global controls. */
export async function resolveAdminSession(session: ReturnType<typeof readSessionToken>): Promise<AdminSession | null> {
  if (!session) return null;

  if (session.scope === 'master') {
    if (!isMasterEmail(session.email)) return null;
    return { ...session, workspaceId: DEFAULT_WORKSPACE_ID, role: 'owner', isMaster: true };
  }

  // ADMIN_EMAIL owns the default workspace and has no workspace_users row.
  if (session.email.toLowerCase() === ownerEmail()) {
    return { ...session, workspaceId: DEFAULT_WORKSPACE_ID, role: 'owner' };
  }

  const user = await findWorkspaceUser(session.email);
  if (!user?.active || isPendingInvite(user) || session.version !== user.version) return null;
  if (!(await isWorkspaceActive(user.workspaceId))) return null;
  return { ...session, workspaceId: user.workspaceId, role: user.role };
}

export async function requireMaster(): Promise<MasterSession | null> {
  const session = await readSession();
  if (!session || session.scope !== 'master' || !isMasterEmail(session.email)) return null;
  return { email: session.email, expiresAt: session.expiresAt };
}

export async function setSessionCookie(input: string | SessionDescriptor, version?: number) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, createSessionToken(input, version), {
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

/** Runs `handler` with the caller's workspace session. Every workspace API goes
 *  through here, so the workspace id is always the session's, never the
 *  client's. */
export async function protectedJson<T>(handler: (session: AdminSession) => Promise<T>) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    return NextResponse.json(await handler(session));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400 },
    );
  }
}

/** Same contract for the master admin routes, which no workspace session
 *  can reach. */
export async function masterJson<T>(handler: (session: MasterSession) => Promise<T>) {
  const session = await requireMaster();
  if (!session) {
    return NextResponse.json({ error: "Master admin access required" }, { status: 401 });
  }

  try {
    return NextResponse.json(await handler(session));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400 },
    );
  }
}

export { cookieName };

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findWorkspaceUser, isPendingInvite } from './workspaceUsers';
import { isWorkspaceActive } from './workspaces';
import { validMasterSession } from './master';
import { canAccess, type WorkspacePermission, type WorkspaceRole } from './permissions';

const cookieName = "smartlink_session";
const sessionTtlSeconds = 60 * 60 * 8;

export type SessionRole = WorkspaceRole;
/** Workspace sessions reach one workspace. Master sessions reach the unified
 *  admin shell plus master-only global routes. */
export type SessionScope = 'workspace' | 'master';
export type SessionDescriptor = { email: string; accountId?: string; version?: number; credentialVersion?: string; workspaceId?: string; role?: SessionRole; scope?: SessionScope };
export type AdminSession = { email: string; workspaceId: string; role: SessionRole; permissions?: WorkspacePermission[]; version?: number; expiresAt: number; isMaster?: boolean };
export type MasterSession = { email: string; expiresAt: number };

function secret() {
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET must be configured in production.');
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
  return createHmac('sha256', secret()).update(value).digest('hex');
}

/** Legacy bare tokens can be decoded but cannot authorize workspace access. */
export function createSessionToken(input: string | SessionDescriptor, version?: number) {
  const descriptor: SessionDescriptor = typeof input === 'string' ? { email: input, version } : input;
  const expiresAt = Date.now() + sessionTtlSeconds * 1000;
  const payload = Buffer.from(JSON.stringify({ ...descriptor, expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token?: string) {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined || !/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(sign(payload), 'hex'), Buffer.from(signature, 'hex'))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionDescriptor & { expiresAt: number };
    if (typeof session.email !== 'string' || !Number.isFinite(session.expiresAt) || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function ownerEmail() {
  return (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
}

export function configuredAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!email || !passwordHash) return null;
  return { email, passwordHash };
}

async function readSession() {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(cookieName)?.value);
}

export async function requireAdmin(permission?: WorkspacePermission) {
  const session = await resolveAdminSession(await readSession());
  return session && (!permission || canAccess(session, permission)) ? session : null;
}

/** Master credentials remain global; workspace context is explicitly selected. */
export async function resolveAdminSession(session: ReturnType<typeof readSessionToken>): Promise<AdminSession | null> {
  if (!session) return null;

  if (session.scope === 'master') {
    if (!(await validMasterSession(session))) return null;
    return { ...session, workspaceId: session.workspaceId || '', role: 'owner', isMaster: true };
  }

  if (session.scope !== 'workspace' || !session.workspaceId) return null;
  const user = await findWorkspaceUser(session.email);
  if (!user?.active || isPendingInvite(user) || session.version !== user.version || session.accountId !== user.id) return null;
  if (session.workspaceId !== user.workspaceId) return null;
  if (!(await isWorkspaceActive(user.workspaceId))) return null;
  return { ...session, workspaceId: user.workspaceId, role: user.role, permissions: user.permissions };
}

export async function requireMaster(): Promise<MasterSession | null> {
  const session = await readSession();
  if (!session || !(await validMasterSession(session))) return null;
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
export async function protectedJson<T>(handler: (session: AdminSession) => Promise<T>, permission: WorkspacePermission = 'pages') {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!canAccess(session, permission)) return NextResponse.json({ error: 'Permission required' }, { status: 403 });

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

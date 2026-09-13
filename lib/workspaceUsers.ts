import { randomUUID } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { hasMysqlConfig, mysqlQuery, type TransactionQuery } from './mysql';
import { parsePermissions, type WorkspacePermission, type WorkspaceRole } from './permissions';
import { DEFAULT_WORKSPACE_ID } from './workspaces';

export type { WorkspaceRole } from './permissions';
/** Pending invitations require their expiring token; email alone never joins
 *  the inviting workspace. Direct signup creates an independent account. */
export type WorkspaceUser = { id: string; email: string; name: string; passwordHash: string; workspaceId: string; role: WorkspaceRole; permissions?: WorkspacePermission[]; inviteHash?: string | null; inviteExpiresAt?: string | null; active: boolean; version: number; createdAt: string };
export type PublicWorkspaceUser = Omit<WorkspaceUser, 'passwordHash' | 'version' | 'inviteHash' | 'inviteExpiresAt'> & { pending: boolean };
/* Resolved per call rather than at import, so the working directory in effect
   when the store is used decides the file. */
function file() {
  return path.join(process.cwd(), 'data', 'workspace-users.json');
}
let queue: Promise<unknown> = Promise.resolve();

export function isPendingInvite(user: Pick<WorkspaceUser, 'passwordHash'>) {
  return !user.passwordHash;
}

/** Rows written before workspaces existed carry neither field. */
function withDefaults(user: Partial<WorkspaceUser> & { id: string; email: string }): WorkspaceUser {
  return {
    name: '',
    passwordHash: '',
    active: true,
    version: 1,
    createdAt: new Date(0).toISOString(),
    ...user,
    workspaceId: user.workspaceId || DEFAULT_WORKSPACE_ID,
    role: user.role === 'owner' ? 'owner' : 'member',
    permissions: parsePermissions(user.permissions),
  };
}

async function readUsers(): Promise<WorkspaceUser[]> {
  try { return (JSON.parse(await readFile(file(), 'utf8')) as WorkspaceUser[]).map(withDefaults); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}

async function mutateUsers<T>(change: (users: WorkspaceUser[]) => T): Promise<T> {
  const operation = queue.catch(() => {}).then(async () => {
    const users = await readUsers();
    const result = change(users);
    const target = file();
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(users), { mode: 0o600 });
    await rename(temporary, target);
    return result;
  });
  queue = operation;
  return operation;
}

/** Every account across every workspace. Pass a workspaceId to scope it. */
const userColumns = 'id, email, name, password_hash AS passwordHash, workspace_id AS workspaceId, role, permissions, invite_hash AS inviteHash, invite_expires_at AS inviteExpiresAt, active, session_version AS version, created_at AS createdAt';

export async function listWorkspaceUsers(workspaceId?: string): Promise<WorkspaceUser[]> {
  const users = hasMysqlConfig()
    ? (await mysqlQuery<(Omit<WorkspaceUser, 'active' | 'createdAt'> & { active: number; createdAt: Date })[]>(
      `SELECT ${userColumns} FROM workspace_users ${workspaceId ? 'WHERE workspace_id = ?' : ''} ORDER BY created_at`, workspaceId ? [workspaceId] : [],
    )).map(row => withDefaults({ ...row, active: Boolean(row.active), createdAt: new Date(row.createdAt).toISOString() }))
    : await readUsers();
  return workspaceId ? users.filter(user => user.workspaceId === workspaceId) : users;
}

/** Email is unique across the whole install, so this is deliberately global:
 *  login and signup both need to find an account before a workspace is known. */
export async function findWorkspaceUser(email: string, query?: TransactionQuery) {
  const normalized = email.trim().toLowerCase();
  if (hasMysqlConfig()) {
    const rows = await (query || mysqlQuery)<WorkspaceUser[]>(`SELECT ${userColumns} FROM workspace_users WHERE email = ?${query ? ' FOR UPDATE' : ''}`, [normalized]);
    return rows[0] ? withDefaults({ ...rows[0], active: Boolean(rows[0].active), createdAt: new Date(rows[0].createdAt).toISOString() }) : null;
  }
  return (await readUsers()).find(user => user.email === normalized) ?? null;
}

export function publicWorkspaceUser(user: WorkspaceUser): PublicWorkspaceUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    workspaceId: user.workspaceId || DEFAULT_WORKSPACE_ID,
    role: user.role,
    permissions: user.permissions ?? [],
    active: user.active,
    pending: isPendingInvite(user),
    createdAt: user.createdAt,
  };
}

export async function addWorkspaceUser(input: { email: string; name: string; passwordHash: string; workspaceId: string; role?: WorkspaceRole; permissions?: WorkspacePermission[]; inviteHash?: string; inviteExpiresAt?: string }, query: TransactionQuery = mysqlQuery) {
  const user: WorkspaceUser = {
    ...input,
    role: input.role ?? 'member',
    id: randomUUID(),
    active: true,
    version: 1,
    createdAt: new Date().toISOString(),
  };
  if (hasMysqlConfig()) {
    try {
      await query(
        'INSERT INTO workspace_users (id, email, name, password_hash, workspace_id, role, permissions, invite_hash, invite_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, user.email, user.name, user.passwordHash, user.workspaceId, user.role, JSON.stringify(user.permissions ?? []), user.inviteHash ?? null, user.inviteExpiresAt ? new Date(user.inviteExpiresAt) : null],
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new Error('This email already has an account.');
      throw error;
    }
  } else {
    await mutateUsers(users => {
      if (users.some(item => item.email === user.email)) throw new Error('This email already has an account.');
      users.push(user);
    });
  }
  return publicWorkspaceUser(user);
}

export async function updateWorkspaceUser(id: string, patch: { active?: boolean; passwordHash?: string; name?: string; role?: WorkspaceRole; permissions?: WorkspacePermission[] }, workspaceId?: string, query: TransactionQuery = mysqlQuery) {
  if (hasMysqlConfig()) {
    const result = await query<{ affectedRows: number }>(
      `UPDATE workspace_users SET active = COALESCE(?, active), password_hash = COALESCE(?, password_hash), name = COALESCE(?, name), role = COALESCE(?, role), permissions = COALESCE(?, permissions), session_version = session_version + 1 WHERE id = ?${workspaceId ? ' AND workspace_id = ?' : ''}`,
      [patch.active ?? null, patch.passwordHash ?? null, patch.name ?? null, patch.role ?? null, patch.permissions ? JSON.stringify(patch.permissions) : null, id, ...(workspaceId ? [workspaceId] : [])],
    );
    if (!result.affectedRows) throw new Error('Account not found.');
  } else {
    await mutateUsers(users => {
      const user = users.find(item => item.id === id && (!workspaceId || item.workspaceId === workspaceId));
      if (!user) throw new Error('Account not found.');
      Object.assign(user, patch, { version: user.version + 1 });
    });
  }
}

export async function deleteWorkspaceUser(id: string, workspaceId?: string, query: TransactionQuery = mysqlQuery) {
  if (hasMysqlConfig()) {
    const result = await query<{ affectedRows: number }>(`DELETE FROM workspace_users WHERE id = ?${workspaceId ? ' AND workspace_id = ?' : ''}`, [id, ...(workspaceId ? [workspaceId] : [])]);
    if (!result.affectedRows) throw new Error('Account not found.');
  } else {
    await mutateUsers(users => {
      const index = users.findIndex(item => item.id === id && (!workspaceId || item.workspaceId === workspaceId));
      if (index === -1) throw new Error('Account not found.');
      users.splice(index, 1);
    });
  }
}

/** Counts admins per workspace for the master admin list. */
export async function adminCounts() {
  const counts = new Map<string, number>();
  for (const user of await listWorkspaceUsers()) {
    counts.set(user.workspaceId, (counts.get(user.workspaceId) ?? 0) + 1);
  }
  return counts;
}

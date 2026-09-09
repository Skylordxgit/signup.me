import { randomUUID } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { hasMysqlConfig, mysqlQuery } from './mysql';
import { DEFAULT_WORKSPACE_ID } from './workspaces';

export type WorkspaceRole = 'owner' | 'admin';
/** An account with an empty passwordHash was invited by email but has not
 *  signed up yet. It still belongs to the workspace that invited it, so
 *  signing up with that address joins that workspace instead of making one. */
export type WorkspaceUser = { id: string; email: string; name: string; passwordHash: string; workspaceId: string; role: WorkspaceRole; active: boolean; version: number; createdAt: string };
export type PublicWorkspaceUser = Omit<WorkspaceUser, 'passwordHash' | 'version'> & { role: WorkspaceRole; pending: boolean };
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
    role: user.role === 'owner' ? 'owner' : 'admin',
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
export async function listWorkspaceUsers(workspaceId?: string): Promise<WorkspaceUser[]> {
  const users = hasMysqlConfig()
    ? (await mysqlQuery<(Omit<WorkspaceUser, 'active' | 'createdAt'> & { active: number; createdAt: Date })[]>(
      'SELECT id, email, name, password_hash AS passwordHash, workspace_id AS workspaceId, role, active, session_version AS version, created_at AS createdAt FROM workspace_users ORDER BY created_at',
    )).map(row => withDefaults({ ...row, active: Boolean(row.active), createdAt: new Date(row.createdAt).toISOString() }))
    : await readUsers();
  return workspaceId ? users.filter(user => user.workspaceId === workspaceId) : users;
}

/** Email is unique across the whole install, so this is deliberately global:
 *  login and signup both need to find an account before a workspace is known. */
export async function findWorkspaceUser(email: string) {
  return (await listWorkspaceUsers()).find(user => user.email === email.trim().toLowerCase()) ?? null;
}

export function publicWorkspaceUser(user: WorkspaceUser): PublicWorkspaceUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    workspaceId: user.workspaceId || DEFAULT_WORKSPACE_ID,
    role: user.role === 'owner' ? 'owner' : 'admin',
    active: user.active,
    pending: isPendingInvite(user),
    createdAt: user.createdAt,
  };
}

export async function addWorkspaceUser(input: { email: string; name: string; passwordHash: string; workspaceId: string; role?: WorkspaceRole }) {
  const user: WorkspaceUser = {
    ...input,
    role: input.role ?? 'admin',
    id: randomUUID(),
    active: true,
    version: 1,
    createdAt: new Date().toISOString(),
  };
  if (hasMysqlConfig()) {
    try {
      await mysqlQuery(
        'INSERT INTO workspace_users (id, email, name, password_hash, workspace_id, role) VALUES (?, ?, ?, ?, ?, ?)',
        [user.id, user.email, user.name, user.passwordHash, user.workspaceId, user.role],
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

export async function updateWorkspaceUser(id: string, patch: { active?: boolean; passwordHash?: string; name?: string }) {
  if (hasMysqlConfig()) {
    const result = await mysqlQuery<{ affectedRows: number }>(
      'UPDATE workspace_users SET active = COALESCE(?, active), password_hash = COALESCE(?, password_hash), name = COALESCE(?, name), session_version = session_version + 1 WHERE id = ?',
      [patch.active ?? null, patch.passwordHash ?? null, patch.name ?? null, id],
    );
    if (!result.affectedRows) throw new Error('Account not found.');
  } else {
    await mutateUsers(users => {
      const user = users.find(item => item.id === id);
      if (!user) throw new Error('Account not found.');
      Object.assign(user, patch, { version: user.version + 1 });
    });
  }
}

export async function deleteWorkspaceUser(id: string) {
  if (hasMysqlConfig()) {
    const result = await mysqlQuery<{ affectedRows: number }>('DELETE FROM workspace_users WHERE id = ?', [id]);
    if (!result.affectedRows) throw new Error('Account not found.');
  } else {
    await mutateUsers(users => {
      const index = users.findIndex(item => item.id === id);
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

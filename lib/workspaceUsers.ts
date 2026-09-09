import { randomUUID } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { hasMysqlConfig, mysqlQuery } from './mysql';

export type WorkspaceUser = { id: string; email: string; name: string; passwordHash: string; active: boolean; version: number; createdAt: string };
export type PublicWorkspaceUser = Omit<WorkspaceUser, 'passwordHash' | 'version'> & { role: 'owner' | 'admin' };
const file = path.join(process.cwd(), 'data', 'workspace-users.json');
let queue: Promise<unknown> = Promise.resolve();

async function readUsers(): Promise<WorkspaceUser[]> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}

async function mutateUsers<T>(change: (users: WorkspaceUser[]) => T): Promise<T> {
  const operation = queue.catch(() => {}).then(async () => {
    const users = await readUsers();
    const result = change(users);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = file + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(users), { mode: 0o600 });
    await rename(temporary, file);
    return result;
  });
  queue = operation;
  return operation;
}

export async function listWorkspaceUsers(): Promise<WorkspaceUser[]> {
  if (!hasMysqlConfig()) return readUsers();
  const rows = await mysqlQuery<(Omit<WorkspaceUser, 'active' | 'createdAt'> & { active: number; createdAt: Date })[]>(
    'SELECT id, email, name, password_hash AS passwordHash, active, session_version AS version, created_at AS createdAt FROM workspace_users ORDER BY created_at',
  );
  return rows.map(row => ({ ...row, active: Boolean(row.active), createdAt: new Date(row.createdAt).toISOString() }));
}

export async function findWorkspaceUser(email: string) {
  return (await listWorkspaceUsers()).find(user => user.email === email.trim().toLowerCase()) ?? null;
}

export function publicWorkspaceUser(user: WorkspaceUser): PublicWorkspaceUser {
  return { id: user.id, email: user.email, name: user.name, active: user.active, createdAt: user.createdAt, role: 'admin' };
}

export async function addWorkspaceUser(input: { email: string; name: string; passwordHash: string }) {
  const user: WorkspaceUser = { ...input, id: randomUUID(), active: true, version: 1, createdAt: new Date().toISOString() };
  if (hasMysqlConfig()) {
    try {
      await mysqlQuery('INSERT INTO workspace_users (id, email, name, password_hash) VALUES (?, ?, ?, ?)', [user.id, user.email, user.name, user.passwordHash]);
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

export async function updateWorkspaceUser(id: string, patch: { active?: boolean; passwordHash?: string }) {
  if (hasMysqlConfig()) {
    const result = await mysqlQuery<{ affectedRows: number }>(
      'UPDATE workspace_users SET active = COALESCE(?, active), password_hash = COALESCE(?, password_hash), session_version = session_version + 1 WHERE id = ?',
      [patch.active ?? null, patch.passwordHash ?? null, id],
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

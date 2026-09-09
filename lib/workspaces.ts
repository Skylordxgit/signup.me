import { randomUUID } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { hasMysqlConfig, mysqlQuery } from './mysql';

/* The workspace every pre-multi-workspace page and admin belongs to. It is a
   fixed id rather than a generated one so the backfill is deterministic: the
   MySQL migration defaults existing rows to it, and the JSON store treats a
   missing workspaceId as this value. */
export const DEFAULT_WORKSPACE_ID = 'default';

export type WorkspaceStatus = 'active' | 'disabled';
export type Workspace = { id: string; name: string; ownerEmail: string; status: WorkspaceStatus; createdAt: string };

/* Resolved per call rather than at import, so the working directory in effect
   when the store is used decides the file. */
function file() {
  return path.join(process.cwd(), 'data', 'workspaces.json');
}
let queue: Promise<unknown> = Promise.resolve();

function normalizeStatus(value: unknown): WorkspaceStatus {
  // An unknown or missing status means the record predates the column.
  return value === 'disabled' ? 'disabled' : 'active';
}

export function workspaceName(email: string) {
  const handle = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return `${handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : 'New'} workspace`.slice(0, 190);
}

async function readWorkspaces(): Promise<Workspace[]> {
  try {
    const rows = JSON.parse(await readFile(file(), 'utf8')) as Workspace[];
    return rows.map(row => ({ ...row, status: normalizeStatus(row.status) }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function mutateWorkspaces<T>(change: (workspaces: Workspace[]) => T): Promise<T> {
  const operation = queue.catch(() => {}).then(async () => {
    const workspaces = await readWorkspaces();
    const result = change(workspaces);
    const target = file();
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(workspaces), { mode: 0o600 });
    await rename(temporary, target);
    return result;
  });
  queue = operation;
  return operation;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  if (!hasMysqlConfig()) return readWorkspaces();
  const rows = await mysqlQuery<{ id: string; name: string; ownerEmail: string; status: string; createdAt: Date }[]>(
    'SELECT id, name, owner_email AS ownerEmail, status, created_at AS createdAt FROM workspaces ORDER BY created_at',
  );
  return rows.map(row => ({ ...row, status: normalizeStatus(row.status), createdAt: new Date(row.createdAt).toISOString() }));
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  return (await listWorkspaces()).find(workspace => workspace.id === id) ?? null;
}

/** A workspace with no stored record is treated as active so existing
 *  single-workspace installs keep working before the default row is written. */
export async function isWorkspaceActive(id: string) {
  try { return (await getWorkspace(id))?.status !== 'disabled'; }
  catch { return true; }
}

export async function createWorkspace(input: { name: string; ownerEmail: string; id?: string }): Promise<Workspace> {
  const workspace: Workspace = {
    id: input.id || randomUUID(),
    name: input.name.trim().slice(0, 190) || 'New workspace',
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  if (hasMysqlConfig()) {
    await mysqlQuery(
      'INSERT INTO workspaces (id, name, owner_email, status) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
      [workspace.id, workspace.name, workspace.ownerEmail, workspace.status],
    );
  } else {
    await mutateWorkspaces(workspaces => {
      if (!workspaces.some(item => item.id === workspace.id)) workspaces.push(workspace);
    });
  }
  return workspace;
}

/** Writes the record for the workspace that existing data already belongs to,
 *  owned by ADMIN_EMAIL. Safe to call repeatedly; it never overwrites. */
export async function ensureDefaultWorkspace(ownerEmail: string) {
  const existing = await getWorkspace(DEFAULT_WORKSPACE_ID);
  if (existing) return existing;
  return createWorkspace({ id: DEFAULT_WORKSPACE_ID, name: 'Main workspace', ownerEmail });
}

export async function updateWorkspace(id: string, patch: { status?: WorkspaceStatus; name?: string }) {
  if (id === DEFAULT_WORKSPACE_ID && patch.status === 'disabled') throw new Error('The main workspace cannot be disabled.');
  if (hasMysqlConfig()) {
    const result = await mysqlQuery<{ affectedRows: number }>(
      'UPDATE workspaces SET status = COALESCE(?, status), name = COALESCE(?, name) WHERE id = ?',
      [patch.status ?? null, patch.name?.trim().slice(0, 190) || null, id],
    );
    if (!result.affectedRows) throw new Error('Workspace not found.');
  } else {
    await mutateWorkspaces(workspaces => {
      const workspace = workspaces.find(item => item.id === id);
      if (!workspace) throw new Error('Workspace not found.');
      if (patch.status) workspace.status = patch.status;
      if (patch.name?.trim()) workspace.name = patch.name.trim().slice(0, 190);
    });
  }
}

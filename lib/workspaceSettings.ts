import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import { hasMysqlConfig, mysqlQuery } from './mysql';
import { isValidImageUrl } from './utils';

type Preferences = { name: string; avatar: string };
type Row = { workspaceId: string; email: string; value: Preferences };
function file() { return path.join(process.cwd(), 'data', 'workspace-settings.json'); }
async function readRows(): Promise<Row[]> {
  try { return JSON.parse(await readFile(file(), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}

export async function getPreferences(workspaceId: string, email: string): Promise<Preferences> {
  if (hasMysqlConfig()) {
    const rows = await mysqlQuery<{ value: Preferences | string }[]>('SELECT setting_value AS value FROM workspace_settings WHERE workspace_id = ? AND setting_key = ?', [workspaceId, email]);
    const value = rows[0]?.value;
    return typeof value === 'string' ? JSON.parse(value) : value ?? { name: '', avatar: '' };
  }
  return (await readRows()).find(row => row.workspaceId === workspaceId && row.email === email)?.value ?? { name: '', avatar: '' };
}

let queue: Promise<unknown> = Promise.resolve();
export async function savePreferences(workspaceId: string, email: string, input: Record<string, unknown>) {
  if (typeof input.name !== 'string' || input.name.length > 120 || typeof input.avatar !== 'string' || input.avatar && !isValidImageUrl(input.avatar)) throw new Error('Invalid preferences.');
  const value = { name: input.name.trim(), avatar: input.avatar };
  if (hasMysqlConfig()) {
    await mysqlQuery('INSERT INTO workspace_settings (workspace_id, setting_key, setting_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [workspaceId, email, JSON.stringify(value)]);
  } else {
    const operation = queue.catch(() => {}).then(async () => {
      const rows = (await readRows()).filter(row => row.workspaceId !== workspaceId || row.email !== email);
      rows.push({ workspaceId, email, value });
      const target = file();
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = target + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify(rows), { mode: 0o600 });
      await rename(temporary, target);
    });
    queue = operation;
    await operation;
  }
  return value;
}

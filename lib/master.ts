import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { hasMysqlConfig, mysqlQuery } from './mysql';

/** Environment credentials configure the sole global account. Storage must
 * also validate it on login and on every authenticated request. */
export function masterAdmin() {
  const email = process.env.MASTER_ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.MASTER_ADMIN_PASSWORD_HASH?.trim();
  if (!email || !passwordHash) return null;
  return { email, passwordHash };
}

export function isMasterEmail(email: string) {
  const master = masterAdmin();
  return Boolean(master && master.email === email.trim().toLowerCase());
}

type MasterAccount = { email: string; passwordHash: string; active: boolean; version: number };
function file() { return path.join(process.cwd(), 'data', 'master-admin.json'); }

export async function storedMaster(): Promise<MasterAccount | null> {
  const configured = masterAdmin();
  if (!configured) return null;
  if (hasMysqlConfig()) {
    const rows = await mysqlQuery<MasterAccount[]>('SELECT email, password_hash AS passwordHash, active, session_version AS version FROM admins WHERE email = ?', [configured.email]);
    return rows[0] ? { ...rows[0], active: Boolean(rows[0].active) } : null;
  }
  try { return JSON.parse(await readFile(file(), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

export function masterCredentialVersion() {
  const configured = masterAdmin();
  return configured ? createHash('sha256').update(configured.email + ':' + configured.passwordHash).digest('hex') : '';
}

export async function provisionMaster() {
  const configured = masterAdmin();
  if (!configured) return null;
  if (hasMysqlConfig()) {
    await mysqlQuery('INSERT INTO admins (email, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE session_version = session_version + IF(password_hash <> VALUES(password_hash), 1, 0), password_hash = VALUES(password_hash)', [configured.email, configured.passwordHash]);
  } else {
    const previous = await storedMaster();
    const account: MasterAccount = { ...configured, active: previous?.active ?? true, version: (previous?.version ?? 0) + (previous?.email === configured.email && previous.passwordHash === configured.passwordHash ? 0 : 1) };
    const target = file();
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(account), { mode: 0o600 });
    await rename(temporary, target);
  }
  return storedMaster();
}

export async function validMasterSession(session: { email: string; version?: number; credentialVersion?: string; scope?: string }) {
  if (session.scope !== 'master' || !isMasterEmail(session.email) || session.credentialVersion !== masterCredentialVersion()) return false;
  const account = await storedMaster();
  return Boolean(account?.active && account.email === session.email && account.passwordHash === masterAdmin()?.passwordHash && account.version === session.version);
}

import { createHash, randomUUID, scryptSync } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { hasMysqlConfig, mysqlQuery } from './mysql';

/** A stored credential is the salted scrypt format `<salt>:<64-byte hex>`. */
function isHashedPassword(value: string) {
  const [salt, key] = value.split(':');
  return Boolean(salt) && /^[a-f0-9]{128}$/i.test(key || '');
}

/** Hosting panels only offer plain text fields, so a plain master password is
 *  accepted and converted to the same salted scrypt hash that is stored in the
 *  database. The salt is derived from the email so the hash is stable across
 *  restarts and instances, which keeps existing sessions valid. */
function normalizeMasterPassword(email: string, value: string) {
  if (isHashedPassword(value)) return value;
  const salt = createHash('sha256').update('signup888:master:' + email).digest('hex').slice(0, 32);
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}

/** Environment credentials configure the sole global Master Admin account.
 * Uses ADMIN_EMAIL and ADMIN_PASSWORD_HASH (with MASTER_ADMIN_* as fallback).
 * Either password variable may hold a plain password or a scrypt hash. */
export function masterAdmin() {
  const email = (process.env.ADMIN_EMAIL || process.env.MASTER_ADMIN_EMAIL)?.trim().toLowerCase();
  const configuredPassword = (process.env.ADMIN_PASSWORD_HASH || process.env.MASTER_ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD || process.env.MASTER_ADMIN_PASSWORD)?.trim();
  if (!email || !configuredPassword) return null;
  return { email, passwordHash: normalizeMasterPassword(email, configuredPassword) };
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

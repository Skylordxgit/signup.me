import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { resolve4, resolveCname } from 'node:dns/promises';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getWorkspace } from './workspaces';
import { hasMysqlConfig, mysqlQuery, withTransaction, type TransactionQuery } from './mysql';

export const domainStatuses = ['pending_dns', 'verifying', 'verified', 'ssl_pending', 'active', 'error', 'disabled'] as const;
export type DomainStatus = typeof domainStatuses[number];
export type DomainSslStatus = 'pending' | 'active' | 'error' | 'disabled';
export type DomainAuditAction = 'Domain Added' | 'Domain Updated' | 'Domain Verified' | 'Domain Assigned' | 'Domain Unassigned' | 'Domain Deleted';

export type CustomDomain = {
  id: string;
  hostname: string;
  workspaceId: string | null;
  isPrimary: boolean;
  status: DomainStatus;
  sslStatus: DomainSslStatus;
  lastCheckedAt: string | null;
  lastVerifiedAt: string | null;
  verificationError: string | null;
  sslUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DomainAuditEvent = {
  id: string;
  domainId: string | null;
  hostname: string;
  workspaceId: string | null;
  action: DomainAuditAction;
  actorEmail: string;
  createdAt: string;
};

export type DomainResolver = {
  resolveCname(hostname: string): Promise<string[]>;
  resolve4(hostname: string): Promise<string[]>;
};

export type DomainVerificationConfig = {
  configured: boolean;
  record: { type: 'CNAME' | 'A'; host: '@'; value: string } | null;
  www: { type: 'CNAME' | 'A'; host: 'www'; value: string; optional: true } | null;
};

type DomainFile = { domains: CustomDomain[]; auditEvents: DomainAuditEvent[] };
type DomainRow = {
  id: string;
  hostname: string;
  workspaceId: string | null;
  isPrimary: number | boolean;
  status: DomainStatus;
  sslStatus: DomainSslStatus;
  lastCheckedAt: Date | string | null;
  lastVerifiedAt: Date | string | null;
  verificationError: string | null;
  sslUpdatedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const resolver: DomainResolver = { resolveCname, resolve4 };
const internalSuffixes = ['.localhost', '.local', '.internal', '.lan', '.home', '.test', '.invalid', '.example'];
let queue: Promise<unknown> = Promise.resolve();

function file() { return path.join(process.cwd(), 'data', 'domains.json'); }
function iso(value: Date | string | null) { return value == null ? null : new Date(value).toISOString(); }
function mapDomain(row: DomainRow): CustomDomain {
  return {
    ...row,
    workspaceId: row.workspaceId || null,
    isPrimary: Boolean(row.isPrimary),
    lastCheckedAt: iso(row.lastCheckedAt),
    lastVerifiedAt: iso(row.lastVerifiedAt),
    sslUpdatedAt: iso(row.sslUpdatedAt),
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
  };
}

function hostnameFrom(value: string) {
  const input = value.trim();
  if (!input) throw new Error('Domain is required.');
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input) && !/^https?:\/\//i.test(input)) throw new Error('Domain must use HTTP or HTTPS.');
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); }
  catch { throw new Error('Enter a valid domain.'); }
  if (url.username || url.password || url.port) throw new Error('Domain must not include credentials or a port.');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('Domain must not include a path, query, or fragment.');
  return url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

function configuredHostname(value: string | undefined) {
  if (!value?.trim()) return null;
  try { return hostnameFrom(value); } catch { return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/.]+$/, ''); }
}

export function normalizeDomain(value: unknown) {
  if (typeof value !== 'string') throw new Error('Domain is required.');
  const hostname = hostnameFrom(value);
  if (hostname === 'localhost' || isIP(hostname) || !hostname.includes('.')) throw new Error('Use a public domain name.');
  if (internalSuffixes.some(suffix => hostname.endsWith(suffix))) throw new Error('Internal and reserved domains are not allowed.');
  if (hostname.length > 253) throw new Error('Domain is too long.');
  const labels = hostname.split('.');
  if (labels.some(label => !label || label.length > 63 || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))) throw new Error('Enter a valid domain.');
  if (!/^(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/i.test(labels.at(-1)!)) throw new Error('Enter a valid public domain.');
  const reserved = [process.env.MASTER_ADMIN_DOMAIN, process.env.DEFAULT_APP_DOMAIN].map(configuredHostname).filter(Boolean);
  if (reserved.includes(hostname)) throw new Error('This domain is reserved by the platform.');
  return hostname;
}

function dnsTarget(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

export function domainVerificationConfig(): DomainVerificationConfig {
  const cname = process.env.CUSTOM_DOMAIN_CNAME_TARGET?.trim();
  if (cname) {
    const value = dnsTarget(cname);
    return { configured: true, record: { type: 'CNAME', host: '@', value }, www: { type: 'CNAME', host: 'www', value, optional: true } };
  }
  const address = process.env.CUSTOM_DOMAIN_SERVER_IP?.trim();
  if (address && isIP(address) === 4) return { configured: true, record: { type: 'A', host: '@', value: address }, www: { type: 'A', host: 'www', value: address, optional: true } };
  return { configured: false, record: null, www: null };
}

async function readData(): Promise<DomainFile> {
  try {
    const parsed = JSON.parse(await readFile(file(), 'utf8')) as Partial<DomainFile>;
    return { domains: parsed.domains ?? [], auditEvents: parsed.auditEvents ?? [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { domains: [], auditEvents: [] };
    throw error;
  }
}

async function mutateData<T>(change: (data: DomainFile) => T | Promise<T>) {
  const operation = queue.catch(() => {}).then(async () => {
    const data = await readData();
    const result = await change(data);
    const target = file();
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(temporary, target);
    return result;
  });
  queue = operation;
  return operation;
}

function event(action: DomainAuditAction, domain: Pick<CustomDomain, 'id' | 'hostname' | 'workspaceId'>, actorEmail: string, workspaceId = domain.workspaceId): DomainAuditEvent {
  return { id: randomUUID(), domainId: domain.id, hostname: domain.hostname, workspaceId, action, actorEmail: actorEmail.trim().toLowerCase() || 'system', createdAt: new Date().toISOString() };
}

async function insertEvent(query: TransactionQuery, item: DomainAuditEvent) {
  await query('INSERT INTO domain_audit_events (id, domain_id, hostname, workspace_id, action, actor_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [item.id, item.domainId, item.hostname, item.workspaceId, item.action, item.actorEmail, new Date(item.createdAt)]);
}

const columns = `id, hostname, workspace_id AS workspaceId, is_primary AS isPrimary, status,
  ssl_status AS sslStatus, last_checked_at AS lastCheckedAt, last_verified_at AS lastVerifiedAt,
  verification_error AS verificationError, ssl_updated_at AS sslUpdatedAt, created_at AS createdAt, updated_at AS updatedAt`;

export async function listDomains(): Promise<CustomDomain[]> {
  if (!hasMysqlConfig()) return (await readData()).domains.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (await mysqlQuery<DomainRow[]>(`SELECT ${columns} FROM custom_domains ORDER BY created_at DESC`)).map(mapDomain);
}

export async function getDomain(id: string): Promise<CustomDomain | null> {
  if (!hasMysqlConfig()) return (await readData()).domains.find(domain => domain.id === id) ?? null;
  const rows = await mysqlQuery<DomainRow[]>(`SELECT ${columns} FROM custom_domains WHERE id = ?`, [id]);
  return rows[0] ? mapDomain(rows[0]) : null;
}

export async function listDomainAuditEvents(limit = 100): Promise<DomainAuditEvent[]> {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  if (!hasMysqlConfig()) return [...(await readData()).auditEvents].reverse().slice(0, safeLimit);
  const rows = await mysqlQuery<(Omit<DomainAuditEvent, 'createdAt'> & { createdAt: Date | string })[]>(
    'SELECT id, domain_id AS domainId, hostname, workspace_id AS workspaceId, action, actor_email AS actorEmail, created_at AS createdAt FROM domain_audit_events ORDER BY sequence DESC LIMIT ?',
    [safeLimit],
  );
  return rows.map(row => ({ ...row, createdAt: iso(row.createdAt)! }));
}

export async function addDomain(value: unknown, actorEmail = 'system', workspaceId?: string | null) {
  const hostname = normalizeDomain(value);
  if (workspaceId && !(await getWorkspace(workspaceId))) throw new Error('Workspace not found.');
  const createdAt = new Date().toISOString();
  const domain: CustomDomain = { id: randomUUID(), hostname, workspaceId: workspaceId || null, isPrimary: Boolean(workspaceId), status: 'pending_dns', sslStatus: 'pending', lastCheckedAt: null, lastVerifiedAt: null, verificationError: null, sslUpdatedAt: null, createdAt, updatedAt: createdAt };
  if (!hasMysqlConfig()) {
    return mutateData(data => {
      if (data.domains.some(item => item.hostname === hostname)) throw new Error('Domain already exists.');
      if (workspaceId && data.domains.some(item => item.workspaceId === workspaceId && item.isPrimary)) throw new Error('Workspace already has a primary domain.');
      data.domains.push(domain);
      data.auditEvents.push(event('Domain Added', domain, actorEmail));
      if (workspaceId) data.auditEvents.push(event('Domain Assigned', domain, actorEmail));
      return domain;
    });
  }
  try {
    await withTransaction(async query => {
      await query('INSERT INTO custom_domains (id, hostname, workspace_id, is_primary, status, ssl_status) VALUES (?, ?, ?, ?, ?, ?)', [domain.id, domain.hostname, domain.workspaceId, domain.isPrimary, domain.status, domain.sslStatus]);
      await insertEvent(query, event('Domain Added', domain, actorEmail));
      if (workspaceId) await insertEvent(query, event('Domain Assigned', domain, actorEmail));
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new Error(workspaceId ? 'Domain already exists or workspace already has a primary domain.' : 'Domain already exists.');
    throw error;
  }
  return (await getDomain(domain.id))!;
}

export async function updateDomainHostname(id: string, value: unknown, actorEmail = 'system') {
  const hostname = normalizeDomain(value);
  const timestamp = new Date().toISOString();
  if (!hasMysqlConfig()) {
    return mutateData(data => {
      const domain = data.domains.find(item => item.id === id);
      if (!domain) throw new Error('Domain not found.');
      if (domain.hostname === hostname) return domain;
      if (data.domains.some(item => item.id !== id && item.hostname === hostname)) throw new Error('Domain already exists.');
      Object.assign(domain, {
        hostname,
        status: 'pending_dns' as DomainStatus,
        sslStatus: 'pending' as DomainSslStatus,
        lastCheckedAt: null,
        lastVerifiedAt: null,
        verificationError: null,
        sslUpdatedAt: null,
        updatedAt: timestamp,
      });
      data.auditEvents.push(event('Domain Updated', domain, actorEmail));
      return domain;
    });
  }
  try {
    return await withTransaction(async query => {
      const rows = await query<DomainRow[]>(`SELECT ${columns} FROM custom_domains WHERE id = ? FOR UPDATE`, [id]);
      if (!rows[0]) throw new Error('Domain not found.');
      const domain = mapDomain(rows[0]);
      if (domain.hostname === hostname) return domain;
      await query(`UPDATE custom_domains SET hostname = ?, status = 'pending_dns', ssl_status = 'pending', last_checked_at = NULL,
        last_verified_at = NULL, verification_error = NULL, ssl_updated_at = NULL WHERE id = ?`, [hostname, id]);
      const updated = { ...domain, hostname, status: 'pending_dns' as DomainStatus, sslStatus: 'pending' as DomainSslStatus, lastCheckedAt: null, lastVerifiedAt: null, verificationError: null, sslUpdatedAt: null, updatedAt: timestamp };
      await insertEvent(query, event('Domain Updated', updated, actorEmail));
      return updated;
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new Error('Domain already exists.');
    throw error;
  }
}

export async function assignDomain(id: string, workspaceId: string | null, actorEmail = 'system') {
  if (workspaceId && !(await getWorkspace(workspaceId))) throw new Error('Workspace not found.');
  if (!hasMysqlConfig()) {
    return mutateData(data => {
      const domain = data.domains.find(item => item.id === id);
      if (!domain) throw new Error('Domain not found.');
      if (domain.workspaceId === workspaceId) return domain;
      if (domain.workspaceId && workspaceId) throw new Error('Unassign this domain before assigning it to another workspace.');
      if (workspaceId && data.domains.some(item => item.id !== id && item.workspaceId === workspaceId && item.isPrimary)) throw new Error('Workspace already has a primary domain.');
      const previousWorkspaceId = domain.workspaceId;
      domain.workspaceId = workspaceId;
      domain.isPrimary = Boolean(workspaceId);
      domain.updatedAt = new Date().toISOString();
      data.auditEvents.push(event(workspaceId ? 'Domain Assigned' : 'Domain Unassigned', domain, actorEmail, workspaceId || previousWorkspaceId));
      return domain;
    });
  }
  return withTransaction(async query => {
    const rows = await query<DomainRow[]>(`SELECT ${columns} FROM custom_domains WHERE id = ? FOR UPDATE`, [id]);
    const domain = rows[0] ? mapDomain(rows[0]) : null;
    if (!domain) throw new Error('Domain not found.');
    if (domain.workspaceId === workspaceId) return domain;
    if (domain.workspaceId && workspaceId) throw new Error('Unassign this domain before assigning it to another workspace.');
    if (workspaceId) {
      const conflict = await query<{ id: string }[]>('SELECT id FROM custom_domains WHERE workspace_id = ? AND is_primary = 1 AND id <> ? FOR UPDATE', [workspaceId, id]);
      if (conflict.length) throw new Error('Workspace already has a primary domain.');
    }
    const previousWorkspaceId = domain.workspaceId;
    await query('UPDATE custom_domains SET workspace_id = ?, is_primary = ? WHERE id = ?', [workspaceId, Boolean(workspaceId), id]);
    const updated = { ...domain, workspaceId, isPrimary: Boolean(workspaceId), updatedAt: new Date().toISOString() };
    await insertEvent(query, event(workspaceId ? 'Domain Assigned' : 'Domain Unassigned', updated, actorEmail, workspaceId || previousWorkspaceId));
    return updated;
  });
}

export async function moveDomain(id: string, workspaceId: string | null, actorEmail = 'system') {
  if (workspaceId && !(await getWorkspace(workspaceId))) throw new Error('Workspace not found.');
  if (!hasMysqlConfig()) {
    return mutateData(data => {
      const domain = data.domains.find(item => item.id === id);
      if (!domain) throw new Error('Domain not found.');
      if (domain.workspaceId === workspaceId) return domain;
      if (workspaceId && data.domains.some(item => item.id !== id && item.workspaceId === workspaceId && item.isPrimary)) throw new Error('Workspace already has a primary domain.');
      const previousWorkspaceId = domain.workspaceId;
      domain.workspaceId = workspaceId;
      domain.isPrimary = Boolean(workspaceId);
      domain.updatedAt = new Date().toISOString();
      if (previousWorkspaceId) data.auditEvents.push(event('Domain Unassigned', domain, actorEmail, previousWorkspaceId));
      if (workspaceId) data.auditEvents.push(event('Domain Assigned', domain, actorEmail));
      return domain;
    });
  }
  return withTransaction(async query => {
    const rows = await query<DomainRow[]>(`SELECT ${columns} FROM custom_domains WHERE id = ? FOR UPDATE`, [id]);
    const domain = rows[0] ? mapDomain(rows[0]) : null;
    if (!domain) throw new Error('Domain not found.');
    if (domain.workspaceId === workspaceId) return domain;
    if (workspaceId) {
      const conflict = await query<{ id: string }[]>('SELECT id FROM custom_domains WHERE workspace_id = ? AND is_primary = 1 AND id <> ? FOR UPDATE', [workspaceId, id]);
      if (conflict.length) throw new Error('Workspace already has a primary domain.');
    }
    const previousWorkspaceId = domain.workspaceId;
    await query('UPDATE custom_domains SET workspace_id = ?, is_primary = ? WHERE id = ?', [workspaceId, Boolean(workspaceId), id]);
    const updated = { ...domain, workspaceId, isPrimary: Boolean(workspaceId), updatedAt: new Date().toISOString() };
    if (previousWorkspaceId) await insertEvent(query, event('Domain Unassigned', updated, actorEmail, previousWorkspaceId));
    if (workspaceId) await insertEvent(query, event('Domain Assigned', updated, actorEmail));
    return updated;
  });
}

export async function setWorkspacePrimaryDomain(workspaceId: string, domainId: string | null, actorEmail = 'system') {
  if (!(await getWorkspace(workspaceId))) throw new Error('Workspace not found.');
  if (!domainId) {
    const current = (await listDomains()).find(domain => domain.workspaceId === workspaceId && domain.isPrimary);
    return current ? assignDomain(current.id, null, actorEmail) : null;
  }
  const selected = await getDomain(domainId);
  if (!selected) throw new Error('Domain not found.');
  if (selected.workspaceId && selected.workspaceId !== workspaceId) throw new Error('Domain is already assigned to another workspace.');
  const current = (await listDomains()).find(domain => domain.workspaceId === workspaceId && domain.isPrimary);
  if (current?.id === domainId) return current;
  if (!current) return assignDomain(domainId, workspaceId, actorEmail);

  if (!hasMysqlConfig()) {
    return mutateData(data => {
      const previous = data.domains.find(item => item.id === current.id);
      const next = data.domains.find(item => item.id === domainId);
      if (!previous || !next) throw new Error('Domain not found.');
      if (next.workspaceId && next.workspaceId !== workspaceId) throw new Error('Domain is already assigned to another workspace.');
      const timestamp = new Date().toISOString();
      Object.assign(previous, { workspaceId: null, isPrimary: false, updatedAt: timestamp });
      Object.assign(next, { workspaceId, isPrimary: true, updatedAt: timestamp });
      data.auditEvents.push(event('Domain Unassigned', previous, actorEmail, workspaceId));
      data.auditEvents.push(event('Domain Assigned', next, actorEmail));
      return next;
    });
  }
  return withTransaction(async query => {
    const rows = await query<DomainRow[]>(`SELECT ${columns} FROM custom_domains WHERE id IN (?, ?) FOR UPDATE`, [current.id, domainId]);
    const previous = rows.find(row => row.id === current.id);
    const nextRow = rows.find(row => row.id === domainId);
    if (!previous || !nextRow) throw new Error('Domain not found.');
    const next = mapDomain(nextRow);
    if (next.workspaceId && next.workspaceId !== workspaceId) throw new Error('Domain is already assigned to another workspace.');
    await query('UPDATE custom_domains SET workspace_id = NULL, is_primary = 0 WHERE id = ?', [current.id]);
    await query('UPDATE custom_domains SET workspace_id = ?, is_primary = 1 WHERE id = ?', [workspaceId, domainId]);
    const timestamp = new Date().toISOString();
    const removed = { ...mapDomain(previous), workspaceId: null, isPrimary: false, updatedAt: timestamp };
    const updated = { ...next, workspaceId, isPrimary: true, updatedAt: timestamp };
    await insertEvent(query, event('Domain Unassigned', removed, actorEmail, workspaceId));
    await insertEvent(query, event('Domain Assigned', updated, actorEmail));
    return updated;
  });
}

async function saveVerification(id: string, success: boolean, message: string | null, actorEmail: string) {
  const timestamp = new Date().toISOString();
  if (!hasMysqlConfig()) {
    return mutateData(data => {
      const domain = data.domains.find(item => item.id === id);
      if (!domain) throw new Error('Domain not found.');
      domain.status = success ? (domain.sslStatus === 'active' ? 'active' : 'verified') : 'error';
      domain.lastCheckedAt = timestamp;
      domain.lastVerifiedAt = success ? timestamp : domain.lastVerifiedAt;
      domain.verificationError = message;
      domain.updatedAt = timestamp;
      if (success) data.auditEvents.push(event('Domain Verified', domain, actorEmail));
      return domain;
    });
  }
  return withTransaction(async query => {
    const rows = await query<DomainRow[]>(`SELECT ${columns} FROM custom_domains WHERE id = ? FOR UPDATE`, [id]);
    if (!rows[0]) throw new Error('Domain not found.');
    const domain = mapDomain(rows[0]);
    const status: DomainStatus = success ? (domain.sslStatus === 'active' ? 'active' : 'verified') : 'error';
    await query('UPDATE custom_domains SET status = ?, last_checked_at = ?, last_verified_at = IF(?, ?, last_verified_at), verification_error = ? WHERE id = ?', [status, new Date(timestamp), success, new Date(timestamp), message, id]);
    const updated = { ...domain, status, lastCheckedAt: timestamp, lastVerifiedAt: success ? timestamp : domain.lastVerifiedAt, verificationError: message, updatedAt: timestamp };
    if (success) await insertEvent(query, event('Domain Verified', updated, actorEmail));
    return updated;
  });
}

export async function verifyDomainDns(id: string, dns: DomainResolver = resolver, actorEmail = 'system') {
  const domain = await getDomain(id);
  if (!domain) throw new Error('Domain not found.');
  const config = domainVerificationConfig();
  if (!config.record) throw new Error('Configure CUSTOM_DOMAIN_CNAME_TARGET or CUSTOM_DOMAIN_SERVER_IP before verification.');
  if (!hasMysqlConfig()) await mutateData(data => { const item = data.domains.find(row => row.id === id); if (item) { item.status = 'verifying'; item.updatedAt = new Date().toISOString(); } });
  else await mysqlQuery("UPDATE custom_domains SET status = 'verifying', verification_error = NULL WHERE id = ?", [id]);

  const expectedCname = process.env.CUSTOM_DOMAIN_CNAME_TARGET ? dnsTarget(process.env.CUSTOM_DOMAIN_CNAME_TARGET) : null;
  const configuredIp = process.env.CUSTOM_DOMAIN_SERVER_IP?.trim() || null;

  let cnameAnswers: string[] = [];
  let aAnswers: string[] = [];

  try {
    cnameAnswers = (await dns.resolveCname(domain.hostname)).map(dnsTarget);
  } catch {
    cnameAnswers = [];
  }

  try {
    aAnswers = (await dns.resolve4(domain.hostname)).map(dnsTarget);
  } catch {
    aAnswers = [];
  }

  if (expectedCname && cnameAnswers.some(ans => ans === expectedCname)) {
    return saveVerification(id, true, null, actorEmail);
  }

  if (configuredIp && aAnswers.some(ans => ans === configuredIp)) {
    return saveVerification(id, true, null, actorEmail);
  }

  if (expectedCname && aAnswers.length > 0) {
    try {
      const targetIps = (await dns.resolve4(expectedCname)).map(dnsTarget);
      if (targetIps.some(ip => aAnswers.includes(ip))) {
        return saveVerification(id, true, null, actorEmail);
      }
    } catch {
      // Ignore target IP resolution errors and fall through
    }
  }

  const expectedList = [
    expectedCname ? `CNAME "${expectedCname}"` : null,
    configuredIp ? `A record "${configuredIp}"` : null,
  ].filter(Boolean).join(' or ');

  const foundList = [
    cnameAnswers.length > 0 ? `CNAME: ${cnameAnswers.join(', ')}` : null,
    aAnswers.length > 0 ? `A: ${aAnswers.join(', ')}` : null,
  ].filter(Boolean).join('; ') || 'no DNS records found';

  return saveVerification(id, false, `Expected ${expectedList || 'configured target'}, but DNS returned ${foundList}.`, actorEmail);
}

export async function updateDomainSslStatus(id: string, sslStatus: DomainSslStatus) {
  if (!['pending', 'active', 'error', 'disabled'].includes(sslStatus)) throw new Error('Invalid SSL status.');
  const domain = await getDomain(id);
  if (!domain) throw new Error('Domain not found.');
  if (sslStatus === 'active' && !domain.lastVerifiedAt) throw new Error('Verify DNS before marking SSL active.');
  const status: DomainStatus = sslStatus === 'active' ? 'active' : sslStatus === 'pending' && domain.lastVerifiedAt ? 'ssl_pending' : sslStatus === 'disabled' ? 'disabled' : sslStatus === 'error' ? 'error' : domain.status;
  const timestamp = new Date().toISOString();
  if (!hasMysqlConfig()) return mutateData(data => { const item = data.domains.find(row => row.id === id); if (!item) throw new Error('Domain not found.'); Object.assign(item, { sslStatus, status, sslUpdatedAt: timestamp, updatedAt: timestamp }); return item; });
  await mysqlQuery('UPDATE custom_domains SET ssl_status = ?, status = ?, ssl_updated_at = ? WHERE id = ?', [sslStatus, status, new Date(timestamp), id]);
  return (await getDomain(id))!;
}

export async function setDomainDisabled(id: string, disabled: boolean) {
  const domain = await getDomain(id);
  if (!domain) throw new Error('Domain not found.');
  const status: DomainStatus = disabled ? 'disabled' : domain.sslStatus === 'active' && domain.lastVerifiedAt ? 'active' : domain.lastVerifiedAt ? 'verified' : 'pending_dns';
  if (!hasMysqlConfig()) return mutateData(data => { const item = data.domains.find(row => row.id === id); if (!item) throw new Error('Domain not found.'); item.status = status; item.updatedAt = new Date().toISOString(); return item; });
  await mysqlQuery('UPDATE custom_domains SET status = ? WHERE id = ?', [status, id]);
  return (await getDomain(id))!;
}

export async function deleteDomain(id: string, actorEmail = 'system') {
  if (!hasMysqlConfig()) return mutateData(data => {
    const index = data.domains.findIndex(item => item.id === id);
    if (index === -1) throw new Error('Domain not found.');
    const [domain] = data.domains.splice(index, 1);
    if (domain.workspaceId) data.auditEvents.push(event('Domain Unassigned', domain, actorEmail));
    data.auditEvents.push(event('Domain Deleted', domain, actorEmail));
    return true;
  });
  return withTransaction(async query => {
    const rows = await query<DomainRow[]>(`SELECT ${columns} FROM custom_domains WHERE id = ? FOR UPDATE`, [id]);
    if (!rows[0]) throw new Error('Domain not found.');
    const domain = mapDomain(rows[0]);
    if (domain.workspaceId) await insertEvent(query, event('Domain Unassigned', domain, actorEmail));
    await insertEvent(query, event('Domain Deleted', domain, actorEmail));
    await query('DELETE FROM custom_domains WHERE id = ?', [id]);
    return true;
  });
}
